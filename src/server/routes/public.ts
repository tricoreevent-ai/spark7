import { Router, Request, Response } from 'express';
import { loadResolvedMailSettings, parseRecipients, sendConfiguredMail } from '../services/mail.js';
import { Customer } from '../models/Customer.js';
import { CustomerEnquiry } from '../models/CustomerEnquiry.js';
import { User } from '../models/User.js';
import { generateNumber } from '../services/numbering.js';
import { resolvePrimaryTenant } from '../services/tenant.js';
import { runWithTenantContext } from '../services/tenantContext.js';

const router = Router();

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPhone = (value: string): boolean => /^[0-9+\-()\s]{7,20}$/.test(value);
const normalize = (value: unknown): string => String(value || '').trim();
const normalizePhone = (value: unknown): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const WEBSITE_LEAD_ROLES = ['super_admin', 'admin', 'manager', 'sales', 'receptionist'];

const resolveWebsiteLeadOwner = async (): Promise<{ assignedToUserId?: string; assignedToName?: string }> => {
  const staff = await User.find({
    isActive: true,
    isDeleted: { $ne: true },
    role: { $in: WEBSITE_LEAD_ROLES },
  })
    .select('_id firstName lastName email role')
    .sort({ role: 1, firstName: 1, lastName: 1, email: 1 })
    .lean();

  if (!staff.length) return {};

  const staffIds = staff.map((row: any) => row._id.toString());
  const openCounts = await CustomerEnquiry.aggregate([
    {
      $match: {
        status: { $in: ['new', 'contacted'] },
        assignedToUserId: { $in: staffIds },
      },
    },
    {
      $group: {
        _id: '$assignedToUserId',
        openCount: { $sum: 1 },
        latestAssignedAt: { $max: '$updatedAt' },
      },
    },
  ]);

  const countsById = new Map(
    openCounts.map((row: any) => [
      String(row?._id || ''),
      {
        openCount: Number(row?.openCount || 0),
        latestAssignedAt: row?.latestAssignedAt ? new Date(row.latestAssignedAt) : new Date(0),
      },
    ])
  );

  const selected = [...staff].sort((left: any, right: any) => {
    const leftMetrics = countsById.get(String(left._id)) || { openCount: 0, latestAssignedAt: new Date(0) };
    const rightMetrics = countsById.get(String(right._id)) || { openCount: 0, latestAssignedAt: new Date(0) };
    if (leftMetrics.openCount !== rightMetrics.openCount) return leftMetrics.openCount - rightMetrics.openCount;
    return leftMetrics.latestAssignedAt.getTime() - rightMetrics.latestAssignedAt.getTime();
  })[0];

  if (!selected) return {};

  const assignedToName =
    `${String(selected.firstName || '').trim()} ${String(selected.lastName || '').trim()}`.trim()
    || String(selected.email || '').trim()
    || undefined;

  return {
    assignedToUserId: selected._id.toString(),
    assignedToName,
  };
};

const upsertWebsiteCustomer = async (args: { name: string; email: string; phone?: string }) => {
  const normalizedPhone = normalizePhone(args.phone);
  const normalizedEmail = normalizeEmail(args.email);
  const customerName = String(args.name || '').trim();
  const clauses = [
    ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
    ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
  ];

  const existing = clauses.length
    ? await Customer.findOne({ $or: clauses }).sort({ updatedAt: -1, createdAt: -1 })
    : null;

  if (existing) {
    let changed = false;
    if (normalizedPhone && existing.phone !== normalizedPhone) {
      existing.phone = normalizedPhone;
      changed = true;
    }
    if (normalizedEmail && existing.email !== normalizedEmail) {
      existing.email = normalizedEmail;
      changed = true;
    }
    if (customerName && existing.name !== customerName && ['individual', 'walk_in', 'regular_member'].includes(String(existing.customerCategory || ''))) {
      existing.name = customerName;
      changed = true;
    }
    if (String(existing.customerCategory || '') === 'walk_in') {
      existing.customerCategory = 'individual';
      changed = true;
    }
    if (changed) await existing.save();
    return existing;
  }

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  return Customer.create({
    customerCode,
    name: customerName,
    phone: normalizedPhone || undefined,
    email: normalizedEmail || undefined,
    customerCategory: 'individual',
    accountType: 'cash',
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    outstandingBalance: 0,
    notes: 'Created automatically from public website enquiry.',
  });
};

const buildWebsiteLeadNote = (args: { message: string; email: string; mobile?: string }) => {
  const stamp = new Date().toLocaleString('en-IN');
  return [
    `Website enquiry received on ${stamp}`,
    `Email: ${args.email}`,
    `Mobile: ${args.mobile || 'Not provided'}`,
    '',
    args.message,
  ].join('\n');
};

router.post('/contact', async (req: Request, res: Response) => {
  try {
    const tenant = await resolvePrimaryTenant();
    return await runWithTenantContext(tenant._id.toString(), async () => {
      const name = normalize(req.body?.name);
      const email = normalize(req.body?.email).toLowerCase();
      const mobile = normalize(req.body?.mobile);
      const message = normalize(req.body?.message);

      if (!name) {
        return res.status(400).json({ success: false, error: 'Name is required.' });
      }

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      }

      if (mobile && !isValidPhone(mobile)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid mobile number or leave it blank.' });
      }

      if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required.' });
      }

      const customer = await upsertWebsiteCustomer({ name, email, phone: mobile });
      const assigned = await resolveWebsiteLeadOwner();
      const lookbackDate = new Date(Date.now() - (45 * 24 * 60 * 60 * 1000));
      const contactClauses = [
        ...(normalizePhone(mobile) ? [{ contactPhone: normalizePhone(mobile) }] : []),
        ...(normalizeEmail(email) ? [{ contactEmail: normalizeEmail(email) }] : []),
      ];
      const websiteLeadNote = buildWebsiteLeadNote({ message, email, mobile });

      let enquiry = contactClauses.length
        ? await CustomerEnquiry.findOne({
          source: 'website',
          status: { $in: ['new', 'contacted'] },
          createdAt: { $gte: lookbackDate },
          $or: contactClauses,
        }).sort({ updatedAt: -1, createdAt: -1 })
        : null;

      if (enquiry) {
        enquiry.customerId = customer?._id?.toString() || enquiry.customerId;
        enquiry.customerCode = customer?.customerCode || enquiry.customerCode;
        enquiry.customerName = name;
        enquiry.contactPhone = normalizePhone(mobile) || undefined;
        enquiry.contactEmail = normalizeEmail(email);
        enquiry.status = enquiry.status === 'lost' ? 'new' : enquiry.status;
        enquiry.assignedToUserId = enquiry.assignedToUserId || assigned.assignedToUserId;
        enquiry.assignedToName = enquiry.assignedToName || assigned.assignedToName;
        enquiry.followUpDate = enquiry.followUpDate || new Date(Date.now() + (24 * 60 * 60 * 1000));
        enquiry.notes = [websiteLeadNote, String(enquiry.notes || '').trim()].filter(Boolean).join('\n\n');
        await enquiry.save();
      } else {
        const enquiryNumber = await generateNumber('customer_enquiry_number', { prefix: 'ENQ-', datePart: true, padTo: 5 });
        enquiry = await CustomerEnquiry.create({
          enquiryNumber,
          customerId: customer?._id?.toString() || undefined,
          customerCode: customer?.customerCode || undefined,
          customerName: name,
          contactPhone: normalizePhone(mobile) || undefined,
          contactEmail: normalizeEmail(email),
          customerCategory: customer?.customerCategory || 'individual',
          requestKind: 'general',
          source: 'website',
          status: 'new',
          assignedToUserId: assigned.assignedToUserId,
          assignedToName: assigned.assignedToName,
          followUpDate: new Date(Date.now() + (24 * 60 * 60 * 1000)),
          notes: websiteLeadNote,
        });
      }

      const mail = await loadResolvedMailSettings();
      const recipients = parseRecipients(mail.smtpToRecipients || mail.smtpFromEmail);

      const subject = `Sarva Horizon website enquiry from ${name}`;
      const text = [
        'New public website enquiry',
        '',
        `Name: ${name}`,
        `Email: ${email}`,
        `Mobile: ${mobile || 'Not provided'}`,
        `CRM Enquiry No: ${String(enquiry.enquiryNumber || '-')}`,
        `Assigned To: ${assigned.assignedToName || 'Unassigned'}`,
        '',
        'Message:',
        message,
      ].join('\n');

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin:0 0 12px">Sarva Horizon Website Enquiry</h2>
          <table style="border-collapse:collapse;margin:0 0 16px">
            <tr><td style="padding:4px 12px 4px 0"><strong>Name</strong></td><td style="padding:4px 0">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td style="padding:4px 0">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Mobile</strong></td><td style="padding:4px 0">${escapeHtml(mobile || 'Not provided')}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>CRM Enquiry No</strong></td><td style="padding:4px 0">${escapeHtml(String(enquiry.enquiryNumber || '-'))}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Assigned To</strong></td><td style="padding:4px 0">${escapeHtml(assigned.assignedToName || 'Unassigned')}</td></tr>
          </table>
          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc">
            <strong>Message</strong>
            <p style="margin:8px 0 0;white-space:pre-wrap">${escapeHtml(message)}</p>
          </div>
        </div>
      `;

      if (recipients.length) {
        try {
          await sendConfiguredMail({
            recipients,
            subject,
            text,
            html,
          });
        } catch {
          return res.json({
            success: true,
            message: 'Your enquiry has been added to the CRM. Mail notification could not be sent, but staff can still follow up from the application.',
          });
        }
      }

      return res.json({
        success: true,
        message: recipients.length
          ? 'Your enquiry has been sent successfully and added to the CRM for staff follow-up.'
          : 'Your enquiry has been added to the CRM for staff follow-up.',
      });
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send contact enquiry.',
    });
  }
});

export default router;
