import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Customer } from '../models/Customer.js';
import { CustomerCampaign } from '../models/CustomerCampaign.js';
import { CustomerEnquiry } from '../models/CustomerEnquiry.js';
import { EventBooking } from '../models/EventBooking.js';
import { EventQuotation } from '../models/EventQuotation.js';
import { Facility } from '../models/Facility.js';
import { FacilityBooking } from '../models/FacilityBooking.js';
import { MemberSubscription } from '../models/MemberSubscription.js';
import { Quote } from '../models/Quote.js';
import { Sale } from '../models/Sale.js';
import { User } from '../models/User.js';
import { loadTenantGeneralSettings } from '../services/generalSettings.js';
import { sendConfiguredMail, uniqueRecipients } from '../services/mail.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';

const router = Router();

const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const startOfDay = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeCustomerCategory = (value: any): 'individual' | 'group_team' | 'corporate' | 'regular_member' | 'walk_in' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'group_team') return 'group_team';
  if (normalized === 'corporate') return 'corporate';
  if (normalized === 'regular_member') return 'regular_member';
  if (normalized === 'walk_in') return 'walk_in';
  return 'individual';
};

const normalizeEnquirySource = (value: any): 'website' | 'phone' | 'walk_in' | 'social_media' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'website') return 'website';
  if (normalized === 'phone') return 'phone';
  if (normalized === 'social_media') return 'social_media';
  return 'walk_in';
};

const normalizeEnquiryStatus = (value: any): 'new' | 'contacted' | 'converted' | 'lost' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'contacted') return 'contacted';
  if (normalized === 'converted') return 'converted';
  if (normalized === 'lost') return 'lost';
  return 'new';
};

const normalizeRequestKind = (value: any): 'facility_booking' | 'event_booking' | 'membership' | 'shop_purchase' | 'general' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'facility_booking') return 'facility_booking';
  if (normalized === 'event_booking') return 'event_booking';
  if (normalized === 'membership') return 'membership';
  if (normalized === 'shop_purchase') return 'shop_purchase';
  return 'general';
};

const normalizeCampaignAudienceMode = (value: any): 'selected' | 'filtered' | 'all_active' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'filtered') return 'filtered';
  if (normalized === 'all_active') return 'all_active';
  return 'selected';
};

const normalizeCampaignAction = (value: any): 'draft' | 'send' => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'send' ? 'send' : 'draft';
};

const normalizeCampaignFilters = (value: any) => ({
  search: String(value?.search || '').trim(),
  customerCategories: Array.isArray(value?.customerCategories)
    ? value.customerCategories.map((item: any) => normalizeCustomerCategory(item)).filter(Boolean)
    : [],
  accountTypes: Array.isArray(value?.accountTypes)
    ? value.accountTypes.map((item: any) => String(item || '').trim().toLowerCase()).filter((item: string) => ['cash', 'credit'].includes(item))
    : [],
  statuses: Array.isArray(value?.statuses)
    ? value.statuses.map((item: any) => String(item || '').trim().toLowerCase()).filter((item: string) => ['active', 'blocked'].includes(item))
    : [],
  pricingTiers: Array.isArray(value?.pricingTiers)
    ? value.pricingTiers.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [],
});

const parseAttachmentDataUrl = (dataUrl: string): { mimeType: string; buffer: Buffer } => {
  const match = /^data:([^;]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) {
    throw new Error('Please attach a valid brochure file.');
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const buildCampaignCustomerFilter = (args: {
  audienceMode: 'selected' | 'filtered' | 'all_active';
  selectedCustomerIds: string[];
  filters: ReturnType<typeof normalizeCampaignFilters>;
}) => {
  if (args.audienceMode === 'selected') {
    return {
      _id: {
        $in: args.selectedCustomerIds.map((value) => String(value || '').trim()).filter(Boolean),
      },
    };
  }

  const filter: any = {};
  if (args.audienceMode === 'all_active') {
    filter.isBlocked = false;
    return filter;
  }

  const { search, customerCategories, accountTypes, statuses, pricingTiers } = args.filters;
  if (customerCategories.length === 1) {
    filter.customerCategory = customerCategories[0];
  } else if (customerCategories.length > 1) {
    filter.customerCategory = { $in: customerCategories };
  }

  if (accountTypes.length === 1) {
    filter.accountType = accountTypes[0];
  } else if (accountTypes.length > 1) {
    filter.accountType = { $in: accountTypes };
  }

  if (statuses.length === 1) {
    filter.isBlocked = statuses[0] === 'blocked';
  }

  if (pricingTiers.length === 1) {
    filter.pricingTier = pricingTiers[0];
  } else if (pricingTiers.length > 1) {
    filter.pricingTier = { $in: pricingTiers };
  }

  if (search) {
    const phone = normalizePhone(search);
    filter.$or = [
      { customerCode: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      ...(phone ? [{ phone }] : []),
    ];
  }

  return filter;
};

const resolveCampaignAudience = async (args: {
  audienceMode: 'selected' | 'filtered' | 'all_active';
  selectedCustomerIds: string[];
  filters: ReturnType<typeof normalizeCampaignFilters>;
}) => {
  const rows = await Customer.find(buildCampaignCustomerFilter(args))
    .select('_id customerCode name phone email customerCategory accountType isBlocked pricingTier')
    .sort({ name: 1 })
    .lean();

  const sendableRows = (rows as any[]).filter((row) => !row.isBlocked);
  const recipients = uniqueRecipients(sendableRows.map((row) => String(row.email || '').trim().toLowerCase()).filter(Boolean));
  const customerIds = sendableRows.map((row) => String(row._id));

  return {
    rows: sendableRows,
    customerIds,
    recipients,
    totalResolved: rows.length,
    skippedCount: rows.length - recipients.length,
  };
};

const buildCampaignMailContent = (args: {
  customerName: string;
  campaignName: string;
  subject: string;
  headline?: string;
  message: string;
  brochureFileName?: string;
  business: any;
}) => {
  const businessName = String(args.business?.tradeName || args.business?.legalName || 'Sarva').trim() || 'Sarva';
  const addressLines = [
    args.business?.addressLine1,
    args.business?.addressLine2,
    [args.business?.city, args.business?.state, args.business?.pincode].filter(Boolean).join(', '),
    args.business?.country,
  ]
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  const contactLine = [args.business?.phone, args.business?.email].map((value) => String(value || '').trim()).filter(Boolean).join(' | ');
  const safeMessageHtml = escapeHtml(args.message).replace(/\n/g, '<br />');
  const headline = String(args.headline || '').trim();

  const html = `
    <div style="margin:0;padding:24px;background:#eef2ff;font-family:Arial,Helvetica,sans-serif;color:#111827">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ff;border-radius:20px;overflow:hidden">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#312e81,#0f172a);color:#ffffff">
          <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.82">Customer Campaign</div>
          <div style="margin-top:10px;font-size:28px;font-weight:700">${escapeHtml(businessName)}</div>
          ${addressLines.length ? `<div style="margin-top:8px;font-size:13px;line-height:1.6;opacity:0.86">${addressLines.map((line) => escapeHtml(line)).join('<br />')}</div>` : ''}
          ${contactLine ? `<div style="margin-top:10px;font-size:13px;opacity:0.92">${escapeHtml(contactLine)}</div>` : ''}
        </div>
        <div style="padding:28px">
          <div style="font-size:13px;color:#4b5563">Hello ${escapeHtml(args.customerName || 'Customer')},</div>
          <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.2;color:#111827">${escapeHtml(args.subject)}</h1>
          ${headline ? `<div style="margin:0 0 18px;font-size:16px;color:#4338ca;font-weight:600">${escapeHtml(headline)}</div>` : ''}
          <div style="padding:18px;border:1px solid #e5e7eb;border-radius:16px;background:#f8fafc;font-size:15px;line-height:1.8;color:#1f2937">${safeMessageHtml}</div>
          ${args.brochureFileName ? `<div style="margin-top:18px;padding:14px 16px;border-radius:14px;background:#eef2ff;color:#312e81;font-size:14px"><strong>Attached brochure:</strong> ${escapeHtml(args.brochureFileName)}</div>` : ''}
          <div style="margin-top:26px;font-size:14px;color:#374151">Campaign: <strong>${escapeHtml(args.campaignName)}</strong></div>
        </div>
      </div>
    </div>
  `;

  const text = [
    businessName,
    addressLines.join(', '),
    contactLine,
    '',
    `Hello ${args.customerName || 'Customer'},`,
    args.subject,
    headline,
    '',
    args.message,
    '',
    args.brochureFileName ? `Attached brochure: ${args.brochureFileName}` : '',
    `Campaign: ${args.campaignName}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
};

const normalizeDateValue = (value: any): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
};

const buildTimeSlotLabel = (isoValue: Date | string): string => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const startHour = date.getHours();
  const endHour = (startHour + 1) % 24;
  return `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`;
};

const monthDiffInclusive = (first: Date, last: Date): number => {
  const months = ((last.getFullYear() - first.getFullYear()) * 12) + (last.getMonth() - first.getMonth()) + 1;
  return Math.max(1, months);
};

const visitFrequencyLabel = (visitsPerMonth: number): string => {
  if (visitsPerMonth >= 8) return 'Very frequent';
  if (visitsPerMonth >= 4) return 'Regular';
  if (visitsPerMonth >= 2) return 'Occasional';
  return 'Rare';
};

const customerMatchClauses = (args: { customerId?: string; phone?: string; email?: string }) => {
  const clauses: any[] = [];
  if (args.customerId) clauses.push({ customerId: args.customerId });
  if (args.phone) {
    clauses.push({ customerPhone: args.phone });
    clauses.push({ contactPhone: args.phone });
  }
  if (args.email) {
    clauses.push({ customerEmail: args.email });
    clauses.push({ contactEmail: args.email });
  }
  return clauses;
};

const resolveAssignedTo = async (assignedToUserId?: string, fallbackName?: string) => {
  const normalizedId = String(assignedToUserId || '').trim();
  if (!normalizedId) {
    return { assignedToUserId: undefined, assignedToName: String(fallbackName || '').trim() || undefined };
  }
  const user = await User.findById(normalizedId).select('firstName lastName email');
  if (!user) {
    return { assignedToUserId: undefined, assignedToName: String(fallbackName || '').trim() || undefined };
  }
  const assignedToName = `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim() || String(user.email || '').trim();
  return { assignedToUserId: normalizedId, assignedToName };
};

const findOrCreateLinkedCustomer = async (args: {
  customerId?: string;
  customerName?: string;
  contactPhone?: string;
  contactEmail?: string;
  customerCategory?: string;
  createdBy?: string;
}) => {
  const normalizedPhone = normalizePhone(args.contactPhone);
  const normalizedEmail = normalizeEmail(args.contactEmail);
  const normalizedName = String(args.customerName || '').trim();
  const customerCategory = normalizeCustomerCategory(args.customerCategory);

  if (args.customerId) {
    const existingById = await Customer.findById(args.customerId);
    if (!existingById) throw new Error('Customer not found');
    let changed = false;
    if (normalizedPhone && existingById.phone !== normalizedPhone) {
      existingById.phone = normalizedPhone;
      changed = true;
    }
    if (normalizedEmail && existingById.email !== normalizedEmail) {
      existingById.email = normalizedEmail;
      changed = true;
    }
    if (normalizedName && existingById.name !== normalizedName) {
      existingById.name = normalizedName;
      changed = true;
    }
    if (customerCategory && existingById.customerCategory !== customerCategory) {
      existingById.customerCategory = customerCategory;
      changed = true;
    }
    if (changed) await existingById.save();
    return existingById;
  }

  if (normalizedPhone) {
    const existingByPhone = await Customer.findOne({ phone: normalizedPhone }).sort({ updatedAt: -1, createdAt: -1 });
    if (existingByPhone) {
      let changed = false;
      if (normalizedEmail && !existingByPhone.email) {
        existingByPhone.email = normalizedEmail;
        changed = true;
      }
      if (normalizedName && existingByPhone.name !== normalizedName) {
        existingByPhone.name = normalizedName;
        changed = true;
      }
      if (customerCategory && existingByPhone.customerCategory !== customerCategory) {
        existingByPhone.customerCategory = customerCategory;
        changed = true;
      }
      if (changed) await existingByPhone.save();
      return existingByPhone;
    }
  }

  if (!normalizedName) {
    throw new Error('Customer name is required to create a linked profile');
  }

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  return Customer.create({
    customerCode,
    name: normalizedName,
    phone: normalizedPhone || undefined,
    email: normalizedEmail || undefined,
    customerCategory,
    accountType: 'cash',
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    outstandingBalance: 0,
    createdBy: args.createdBy,
  });
};

router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const weekStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));

    const [customers, activeMembers, facilityBookings, eventBookings, sales, enquiries, facilities] = await Promise.all([
      Customer.find().select('customerCode name phone email createdAt outstandingBalance'),
      MemberSubscription.countDocuments({ status: 'active' }),
      FacilityBooking.find({ status: { $ne: 'cancelled' } }).select('customerId customerPhone facilityId startTime totalAmount balanceAmount status'),
      EventBooking.find({ status: { $ne: 'cancelled' } }).select('customerId contactPhone facilityIds occurrences startTime totalAmount balanceAmount status organizerName'),
      Sale.find({ saleStatus: { $ne: 'cancelled' }, invoiceStatus: { $ne: 'cancelled' } }).select('customerId customerPhone totalAmount outstandingAmount createdAt customerName'),
      CustomerEnquiry.find().select('status source lostReason followUpDate requestKind createdAt'),
      Facility.find().select('name'),
    ]);

    const facilityNameById = new Map(facilities.map((row: any) => [String(row._id), String(row.name || '')]));
    const customerByKey = new Map<string, { customerId?: string; customerName: string; totalSpent: number; visits: number; pendingDues: number; lastVisitAt?: Date }>();
    const facilityCounter = new Map<string, number>();
    const timeSlotCounter = new Map<string, number>();

    const touchCustomer = (key: string, name: string) => {
      const current = customerByKey.get(key) || { customerId: undefined, customerName: name || 'Customer', totalSpent: 0, visits: 0, pendingDues: 0 };
      if (!current.customerName && name) current.customerName = name;
      customerByKey.set(key, current);
      return current;
    };

    (sales as any[]).forEach((sale) => {
      const key = String(sale.customerId || normalizePhone(sale.customerPhone) || sale._id);
      const row = touchCustomer(key, String(sale.customerName || 'Customer'));
      row.customerId = row.customerId || (sale.customerId ? String(sale.customerId) : undefined);
      row.totalSpent += Number(sale.totalAmount || 0);
      row.pendingDues += Number(sale.outstandingAmount || 0);
      const createdAt = sale.createdAt ? new Date(sale.createdAt) : undefined;
      if (createdAt && (!row.lastVisitAt || createdAt > row.lastVisitAt)) row.lastVisitAt = createdAt;
    });

    (facilityBookings as any[]).forEach((booking) => {
      const key = String(booking.customerId || normalizePhone(booking.customerPhone) || booking._id);
      const customer = customers.find((row: any) => String(row._id) === String(booking.customerId));
      const row = touchCustomer(key, String(customer?.name || booking.customerName || 'Customer'));
      row.customerId = row.customerId || (booking.customerId ? String(booking.customerId) : undefined);
      row.totalSpent += Number(booking.totalAmount || 0);
      row.pendingDues += Number(booking.balanceAmount || 0);
      row.visits += 1;
      const startTime = booking.startTime ? new Date(booking.startTime) : undefined;
      if (startTime && (!row.lastVisitAt || startTime > row.lastVisitAt)) row.lastVisitAt = startTime;
      const facilityName = facilityNameById.get(String(booking.facilityId || '')) || 'Unknown Facility';
      facilityCounter.set(facilityName, (facilityCounter.get(facilityName) || 0) + 1);
      if (startTime) {
        const slot = buildTimeSlotLabel(startTime);
        timeSlotCounter.set(slot, (timeSlotCounter.get(slot) || 0) + 1);
      }
    });

    (eventBookings as any[]).forEach((booking) => {
      const key = String(booking.customerId || normalizePhone(booking.contactPhone) || booking._id);
      const customer = customers.find((row: any) => String(row._id) === String(booking.customerId));
      const row = touchCustomer(key, String(customer?.name || booking.organizerName || 'Customer'));
      row.customerId = row.customerId || (booking.customerId ? String(booking.customerId) : undefined);
      row.totalSpent += Number(booking.totalAmount || 0);
      row.pendingDues += Number(booking.balanceAmount || 0);

      const occurrences = Array.isArray(booking.occurrences) && booking.occurrences.length > 0
        ? booking.occurrences
        : [{ startTime: booking.startTime }];
      row.visits += occurrences.length;
      occurrences.forEach((occurrence: any) => {
        const startTime = occurrence?.startTime ? new Date(occurrence.startTime) : undefined;
        if (startTime && (!row.lastVisitAt || startTime > row.lastVisitAt)) row.lastVisitAt = startTime;
        if (startTime) {
          const slot = buildTimeSlotLabel(startTime);
          timeSlotCounter.set(slot, (timeSlotCounter.get(slot) || 0) + 1);
        }
      });

      (Array.isArray(booking.facilityIds) ? booking.facilityIds : []).forEach((facilityId: any) => {
        const facilityName = facilityNameById.get(String(facilityId || '')) || 'Unknown Facility';
        facilityCounter.set(facilityName, (facilityCounter.get(facilityName) || 0) + occurrences.length);
      });
    });

    const repeatCustomers = Array.from(customerByKey.values()).filter((row) => row.visits > 1).length;
    const totalOutstanding = round2(customers.reduce((sum: number, row: any) => sum + Number(row.outstandingBalance || 0), 0));
    const totalCustomers = customers.length;
    const newCustomersThisMonth = customers.filter((row: any) => row.createdAt && new Date(row.createdAt) >= monthStart).length;
    const newCustomersThisWeek = customers.filter((row: any) => row.createdAt && new Date(row.createdAt) >= weekStart).length;
    const overdueFollowUps = enquiries.filter((row: any) => row.followUpDate && new Date(row.followUpDate) < now && !['converted', 'lost'].includes(String(row.status || ''))).length;
    const convertedCount = enquiries.filter((row: any) => String(row.status || '') === 'converted').length;
    const lostCount = enquiries.filter((row: any) => String(row.status || '') === 'lost').length;
    const enquiryCount = enquiries.length;

    const enquiryBySource = Array.from(
      enquiries.reduce((map, row: any) => {
        const key = String(row.source || 'walk_in');
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map<string, number>())
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const lostReasons = Array.from(
      enquiries.reduce((map, row: any) => {
        const reason = String(row.lostReason || '').trim();
        if (!reason) return map;
        map.set(reason, (map.get(reason) || 0) + 1);
        return map;
      }, new Map<string, number>())
    )
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 10);

    const popularFacilities = Array.from(facilityCounter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);

    const popularTimeSlots = Array.from(timeSlotCounter.entries())
      .map(([slot, count]) => ({ slot, count }))
      .sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot))
      .slice(0, 8);

    const topCustomers = Array.from(customerByKey.values())
      .map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        totalSpent: round2(row.totalSpent),
        visits: row.visits,
        pendingDues: round2(row.pendingDues),
        lastVisitAt: row.lastVisitAt || null,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent || b.visits - a.visits)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        summary: {
          totalCustomers,
          activeMembers,
          newCustomersThisMonth,
          newCustomersThisWeek,
          repeatCustomers,
          totalOutstanding,
          enquiryCount,
          convertedCount,
          lostCount,
          conversionRate: enquiryCount > 0 ? round2((convertedCount / enquiryCount) * 100) : 0,
          overdueFollowUps,
        },
        popularFacilities,
        popularTimeSlots,
        topCustomers,
        enquiryBySource,
        lostReasons,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load CRM dashboard' });
  }
});

router.get('/staff', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await User.find({ isActive: true, isDeleted: { $ne: true } })
      .select('_id firstName lastName email role')
      .sort({ firstName: 1, lastName: 1, email: 1 });
    res.json({
      success: true,
      data: rows.map((row: any) => ({
        _id: row._id.toString(),
        name: `${String(row.firstName || '').trim()} ${String(row.lastName || '').trim()}`.trim() || String(row.email || '').trim(),
        email: row.email,
        role: row.role,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load CRM staff list' });
  }
});

router.get('/enquiries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q, status, source, requestKind, assignedTo, skip = 0, limit = 100 } = req.query;
    const filter: any = {};

    if (status) filter.status = normalizeEnquiryStatus(status);
    if (source) filter.source = normalizeEnquirySource(source);
    if (requestKind) filter.requestKind = normalizeRequestKind(requestKind);
    if (assignedTo) filter.assignedToUserId = String(assignedTo);
    if (q) {
      const regex = new RegExp(String(q).trim(), 'i');
      const phone = normalizePhone(q);
      filter.$or = [
        { enquiryNumber: regex },
        { customerName: regex },
        { contactPhone: regex },
        { contactEmail: regex },
        { requestedFacilityName: regex },
        { notes: regex },
        ...(phone ? [{ contactPhone: phone }] : []),
      ];
    }

    const rows = await CustomerEnquiry.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(Math.max(0, Number(skip || 0)))
      .limit(Math.max(1, Number(limit || 100)));
    const total = await CustomerEnquiry.countDocuments(filter);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        skip: Math.max(0, Number(skip || 0)),
        limit: Math.max(1, Number(limit || 100)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load enquiries' });
  }
});

router.post('/enquiries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerName = String(req.body?.customerName || '').trim();
    if (!customerName) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }

    const assigned = await resolveAssignedTo(req.body?.assignedToUserId, req.body?.assignedToName);
    const normalizedPhone = normalizePhone(req.body?.contactPhone);
    const normalizedEmail = normalizeEmail(req.body?.contactEmail);
    const existingCustomer = normalizedPhone
      ? await Customer.findOne({ phone: normalizedPhone }).select('_id customerCode')
      : null;
    const enquiryNumber = await generateNumber('customer_enquiry_number', { prefix: 'ENQ-', datePart: true, padTo: 5 });

    const enquiry = await CustomerEnquiry.create({
      enquiryNumber,
      customerId: existingCustomer?._id?.toString() || undefined,
      customerCode: existingCustomer?.customerCode || undefined,
      customerName,
      contactPhone: normalizedPhone || undefined,
      contactEmail: normalizedEmail || undefined,
      customerCategory: normalizeCustomerCategory(req.body?.customerCategory),
      requestKind: normalizeRequestKind(req.body?.requestKind),
      source: normalizeEnquirySource(req.body?.source),
      status: normalizeEnquiryStatus(req.body?.status),
      assignedToUserId: assigned.assignedToUserId,
      assignedToName: assigned.assignedToName,
      requestedFacilityId: String(req.body?.requestedFacilityId || '').trim() || undefined,
      requestedFacilityName: String(req.body?.requestedFacilityName || '').trim(),
      preferredSport: String(req.body?.preferredSport || '').trim(),
      requestedDate: normalizeDateValue(req.body?.requestedDate),
      requestedStartTime: String(req.body?.requestedStartTime || '').trim(),
      durationHours: Math.max(0, Number(req.body?.durationHours || 0)),
      participantsCount: Math.max(0, Number(req.body?.participantsCount || 0)),
      estimatedAmount: Math.max(0, Number(req.body?.estimatedAmount || 0)),
      followUpDate: normalizeDateValue(req.body?.followUpDate),
      lastFollowUpAt: normalizeEnquiryStatus(req.body?.status) === 'contacted' ? new Date() : undefined,
      notes: String(req.body?.notes || '').trim(),
      lostReason: String(req.body?.lostReason || '').trim(),
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'customer_crm',
      action: 'enquiry_created',
      entityType: 'customer_enquiry',
      entityId: enquiry._id.toString(),
      referenceNo: enquiry.enquiryNumber,
      userId: req.userId,
      after: enquiry.toObject(),
    });

    res.status(201).json({ success: true, data: enquiry, message: 'Enquiry created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create enquiry' });
  }
});

router.put('/enquiries/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const enquiry = await CustomerEnquiry.findById(req.params.id);
    if (!enquiry) return res.status(404).json({ success: false, error: 'Enquiry not found' });

    const customerName = String(req.body?.customerName || '').trim();
    if (!customerName) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }

    const assigned = await resolveAssignedTo(req.body?.assignedToUserId, req.body?.assignedToName);
    const normalizedStatus = normalizeEnquiryStatus(req.body?.status);
    const normalizedPhone = normalizePhone(req.body?.contactPhone);
    const normalizedEmail = normalizeEmail(req.body?.contactEmail);
    const existingCustomer = enquiry.customerId
      ? await Customer.findById(enquiry.customerId).select('_id customerCode')
      : normalizedPhone
        ? await Customer.findOne({ phone: normalizedPhone }).select('_id customerCode')
        : null;

    enquiry.customerId = existingCustomer?._id?.toString() || enquiry.customerId;
    enquiry.customerCode = existingCustomer?.customerCode || enquiry.customerCode;
    enquiry.customerName = customerName;
    enquiry.contactPhone = normalizedPhone || undefined;
    enquiry.contactEmail = normalizedEmail || undefined;
    enquiry.customerCategory = normalizeCustomerCategory(req.body?.customerCategory);
    enquiry.requestKind = normalizeRequestKind(req.body?.requestKind);
    enquiry.source = normalizeEnquirySource(req.body?.source);
    enquiry.status = normalizedStatus;
    enquiry.assignedToUserId = assigned.assignedToUserId;
    enquiry.assignedToName = assigned.assignedToName;
    enquiry.requestedFacilityId = String(req.body?.requestedFacilityId || '').trim() || undefined;
    enquiry.requestedFacilityName = String(req.body?.requestedFacilityName || '').trim();
    enquiry.preferredSport = String(req.body?.preferredSport || '').trim();
    enquiry.requestedDate = normalizeDateValue(req.body?.requestedDate);
    enquiry.requestedStartTime = String(req.body?.requestedStartTime || '').trim();
    enquiry.durationHours = Math.max(0, Number(req.body?.durationHours || 0));
    enquiry.participantsCount = Math.max(0, Number(req.body?.participantsCount || 0));
    enquiry.estimatedAmount = Math.max(0, Number(req.body?.estimatedAmount || 0));
    enquiry.followUpDate = normalizeDateValue(req.body?.followUpDate);
    enquiry.notes = String(req.body?.notes || '').trim();
    enquiry.lostReason = String(req.body?.lostReason || '').trim();
    if (normalizedStatus === 'contacted') {
      enquiry.lastFollowUpAt = new Date();
    }
    await enquiry.save();

    await writeAuditLog({
      module: 'customer_crm',
      action: 'enquiry_updated',
      entityType: 'customer_enquiry',
      entityId: enquiry._id.toString(),
      referenceNo: enquiry.enquiryNumber,
      userId: req.userId,
      after: enquiry.toObject(),
    });

    res.json({ success: true, data: enquiry, message: 'Enquiry updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update enquiry' });
  }
});

router.post('/enquiries/:id/link-customer', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const enquiry = await CustomerEnquiry.findById(req.params.id);
    if (!enquiry) return res.status(404).json({ success: false, error: 'Enquiry not found' });

    const customer = await findOrCreateLinkedCustomer({
      customerId: enquiry.customerId,
      customerName: enquiry.customerName,
      contactPhone: enquiry.contactPhone,
      contactEmail: enquiry.contactEmail,
      customerCategory: enquiry.customerCategory,
      createdBy: req.userId,
    });

    enquiry.customerId = customer._id.toString();
    enquiry.customerCode = customer.customerCode;
    enquiry.convertedToType = enquiry.convertedToType || 'customer';
    enquiry.convertedToId = enquiry.convertedToId || customer._id.toString();
    enquiry.convertedToNumber = enquiry.convertedToNumber || customer.customerCode;
    await enquiry.save();

    await writeAuditLog({
      module: 'customer_crm',
      action: 'enquiry_customer_linked',
      entityType: 'customer_enquiry',
      entityId: enquiry._id.toString(),
      referenceNo: enquiry.enquiryNumber,
      userId: req.userId,
      metadata: {
        customerId: customer._id.toString(),
        customerCode: customer.customerCode,
      },
    });

    res.json({
      success: true,
      data: {
        enquiry,
        customer,
      },
      message: 'Customer profile linked successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to link customer profile' });
  }
});

router.get('/campaigns', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await CustomerCampaign.find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      data: rows.map((row: any) => ({
        ...row,
        brochureDataUrl: undefined,
        hasBrochureAttachment: Boolean(String(row?.brochureDataUrl || '').trim()),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load CRM campaigns' });
  }
});

router.post('/campaigns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const action = normalizeCampaignAction(req.body?.action);
    const campaignId = String(req.body?.id || '').trim();
    const audienceMode = normalizeCampaignAudienceMode(req.body?.audienceMode);
    const filters = normalizeCampaignFilters(req.body?.filters);
    const selectedCustomerIds = Array.isArray(req.body?.selectedCustomerIds)
      ? req.body.selectedCustomerIds.map((value: any) => String(value || '').trim()).filter(Boolean)
      : [];
    const name = String(req.body?.name || '').trim() || String(req.body?.subject || '').trim() || 'Customer Campaign';
    const subject = String(req.body?.subject || '').trim();
    const headline = String(req.body?.headline || '').trim();
    const message = String(req.body?.message || '').trim();
    const brochureFileName = String(req.body?.brochureFileName || '').trim();
    const brochureDataUrl = String(req.body?.brochureDataUrl || '').trim();

    let campaign = campaignId ? await CustomerCampaign.findById(campaignId) : null;
    if (campaign && campaign.status === 'sent') {
      campaign = null;
    }

    if (!campaign) {
      const campaignNumber = await generateNumber('customer_campaign_number', { prefix: 'CRM-CAMP-', datePart: true, padTo: 4 });
      campaign = new CustomerCampaign({
        campaignNumber,
        createdBy: req.userId,
      });
    }

    campaign.name = name;
    campaign.subject = subject;
    campaign.headline = headline;
    campaign.message = message;
    campaign.audienceMode = audienceMode;
    campaign.filters = filters;
    campaign.selectedCustomerIds = selectedCustomerIds;
    const brochureAttachment = brochureDataUrl ? parseAttachmentDataUrl(brochureDataUrl) : null;
    campaign.brochureFileName = brochureFileName || String(campaign.brochureFileName || '');
    campaign.brochureDataUrl = brochureDataUrl || String((campaign as any).brochureDataUrl || '');
    campaign.brochureContentType = brochureAttachment?.mimeType || String(campaign.brochureContentType || '');
    campaign.brochureSizeBytes = brochureAttachment?.buffer.length || Number(campaign.brochureSizeBytes || 0);
    campaign.updatedBy = req.userId;

    if (action === 'draft') {
      campaign.status = 'draft';
      campaign.lastError = '';
      await campaign.save();

      await writeAuditLog({
        module: 'customer_crm',
        action: 'campaign_saved',
        entityType: 'customer_campaign',
        entityId: campaign._id.toString(),
        referenceNo: campaign.campaignNumber,
        userId: req.userId,
        metadata: {
          audienceMode,
          selectedCount: selectedCustomerIds.length,
        },
      });

      return res.json({
        success: true,
        data: campaign,
        message: 'Campaign draft saved successfully',
      });
    }

    if (!subject) {
      return res.status(400).json({ success: false, error: 'Email subject is required before sending.' });
    }

    if (!message) {
      return res.status(400).json({ success: false, error: 'Campaign message is required before sending.' });
    }

    const audience = await resolveCampaignAudience({ audienceMode, selectedCustomerIds, filters });
    if (!audience.rows.length) {
      return res.status(400).json({ success: false, error: 'No customers match the selected audience.' });
    }

    const attachmentDataUrl = brochureDataUrl || String((campaign as any).brochureDataUrl || '');
    const attachment = attachmentDataUrl
      ? (() => {
        const parsed = parseAttachmentDataUrl(attachmentDataUrl);
        return {
          filename: campaign.brochureFileName || 'brochure',
          content: parsed.buffer,
          contentType: parsed.mimeType,
        };
      })()
      : null;

    const settings = await loadTenantGeneralSettings(req.tenantId);
    let deliveredCount = 0;
    let lastError = '';

    for (const row of audience.rows) {
      const recipient = String((row as any).email || '').trim().toLowerCase();
      if (!recipient) continue;
      const mailContent = buildCampaignMailContent({
        customerName: String((row as any).name || 'Customer'),
        campaignName: name,
        subject,
        headline,
        message,
        brochureFileName,
        business: settings.business,
      });

      try {
        await sendConfiguredMail({
          recipients: [recipient],
          subject,
          text: mailContent.text,
          html: mailContent.html,
          attachments: attachment ? [attachment] : undefined,
        });
        deliveredCount += 1;
      } catch (error: any) {
        lastError = error.message || 'Failed to send campaign mail';
      }
    }

    campaign.customerIds = audience.customerIds;
    campaign.recipientEmails = audience.recipients;
    campaign.recipientCount = audience.recipients.length;
    campaign.deliveredCount = deliveredCount;
    campaign.skippedCount = Math.max(0, audience.totalResolved - deliveredCount);
    campaign.status = deliveredCount > 0 ? 'sent' : 'failed';
    campaign.sentAt = deliveredCount > 0 ? new Date() : undefined;
    campaign.lastError = deliveredCount > 0 ? lastError : (lastError || 'No campaign emails could be delivered.');
    await campaign.save();

    await writeAuditLog({
      module: 'customer_crm',
      action: 'campaign_sent',
      entityType: 'customer_campaign',
      entityId: campaign._id.toString(),
      referenceNo: campaign.campaignNumber,
      userId: req.userId,
      metadata: {
        audienceMode,
        recipientCount: campaign.recipientCount,
        deliveredCount: campaign.deliveredCount,
        skippedCount: campaign.skippedCount,
      },
    });

    return res.json({
      success: true,
      data: campaign,
      message:
        deliveredCount > 0
          ? `Campaign sent to ${deliveredCount} customer${deliveredCount === 1 ? '' : 's'}.`
          : 'Campaign could not be delivered. Please check mail settings and recipient email addresses.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to save or send CRM campaign' });
  }
});

router.get('/customer/:id/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    const customerId = String(customer._id);
    const phone = normalizePhone((customer as any).phone);
    const email = normalizeEmail((customer as any).email);
    const clauses = customerMatchClauses({ customerId, phone, email });

    const facilityClauses = clauses.filter((row) => !('contactPhone' in row) && !('contactEmail' in row));
    const eventClauses = clauses.filter((row) => !('customerPhone' in row) && !('customerEmail' in row));

    const [facilityBookings, eventBookings, sales, quotes, eventQuotes, memberships, facilities] = await Promise.all([
      FacilityBooking.find(facilityClauses.length ? { $or: facilityClauses } : { _id: null })
        .populate('facilityId', 'name location')
        .sort({ startTime: -1 })
        .lean(),
      EventBooking.find(eventClauses.length ? { $or: eventClauses } : { _id: null })
        .populate('facilityIds', 'name location')
        .sort({ startTime: -1 })
        .lean(),
      Sale.find(facilityClauses.length ? { $or: facilityClauses } : { _id: null })
        .sort({ createdAt: -1 })
        .lean(),
      Quote.find(facilityClauses.length ? { $or: facilityClauses } : { _id: null })
        .sort({ createdAt: -1 })
        .lean(),
      EventQuotation.find(eventClauses.length ? { $or: eventClauses } : { _id: null })
        .populate('facilityIds', 'name location')
        .sort({ createdAt: -1 })
        .lean(),
      MemberSubscription.find({
        $or: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      }).select('memberCode memberName fullName status startDate endDate rewardPointsBalance').sort({ createdAt: -1 }).lean(),
      Facility.find().select('name').lean(),
    ]);

    const facilityNameById = new Map(facilities.map((row: any) => [String(row._id), String(row.name || '')]));
    const bookingHistory: Array<Record<string, any>> = [];
    const paymentHistory: Array<Record<string, any>> = [];
    const quotationHistory: Array<Record<string, any>> = [];
    const visitDates: Date[] = [];

    (facilityBookings as any[]).forEach((booking) => {
      const startTime = booking.startTime ? new Date(booking.startTime) : null;
      if (startTime && !Number.isNaN(startTime.getTime()) && String(booking.status || '') !== 'cancelled') {
        visitDates.push(startTime);
      }
      bookingHistory.push({
        type: 'Facility Booking',
        referenceNo: booking.bookingNumber || '-',
        itemName: booking.facilityId?.name || facilityNameById.get(String(booking.facilityId || '')) || 'Facility',
        activityDate: booking.startTime,
        amount: Number(booking.totalAmount || booking.amount || 0),
        paidAmount: Number(booking.paidAmount || 0),
        balanceAmount: Number(booking.balanceAmount || 0),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });
      paymentHistory.push({
        type: 'Facility Booking',
        referenceNo: booking.bookingNumber || '-',
        activityDate: booking.startTime,
        totalAmount: Number(booking.totalAmount || booking.amount || 0),
        paidAmount: Number(booking.paidAmount || 0),
        balanceAmount: Number(booking.balanceAmount || 0),
        paymentStatus: booking.paymentStatus,
      });
    });

    (eventBookings as any[]).forEach((booking) => {
      const occurrences = Array.isArray(booking.occurrences) && booking.occurrences.length > 0
        ? booking.occurrences
        : [{ startTime: booking.startTime }];
      occurrences.forEach((occurrence: any) => {
        const startTime = occurrence?.startTime ? new Date(occurrence.startTime) : null;
        if (startTime && !Number.isNaN(startTime.getTime()) && String(booking.status || '') !== 'cancelled') {
          visitDates.push(startTime);
        }
      });
      bookingHistory.push({
        type: 'Event Booking',
        referenceNo: booking.eventNumber || '-',
        itemName: Array.isArray(booking.facilityIds) && booking.facilityIds.length
          ? booking.facilityIds.map((row: any) => String(row?.name || '')).filter(Boolean).join(', ')
          : String(booking.eventName || 'Event'),
        activityDate: booking.startTime,
        amount: Number(booking.totalAmount || 0),
        paidAmount: Number(booking.paidAmount || 0),
        balanceAmount: Number(booking.balanceAmount || 0),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });
      paymentHistory.push({
        type: 'Event Booking',
        referenceNo: booking.eventNumber || '-',
        activityDate: booking.startTime,
        totalAmount: Number(booking.totalAmount || 0),
        paidAmount: Number(booking.paidAmount || 0),
        balanceAmount: Number(booking.balanceAmount || 0),
        paymentStatus: booking.paymentStatus,
      });
    });

    (sales as any[]).forEach((sale) => {
      paymentHistory.push({
        type: 'Sale Invoice',
        referenceNo: sale.invoiceNumber || sale.saleNumber || '-',
        activityDate: sale.createdAt,
        totalAmount: Number(sale.totalAmount || 0),
        paidAmount: round2(Number(sale.totalAmount || 0) - Number(sale.outstandingAmount || 0)),
        balanceAmount: Number(sale.outstandingAmount || 0),
        paymentStatus: sale.paymentStatus,
      });
    });

    (quotes as any[]).forEach((quote) => {
      quotationHistory.push({
        type: 'Sales Quotation',
        referenceNo: quote.quoteNumber || '-',
        activityDate: quote.createdAt,
        amount: Number(quote.totalAmount || 0),
        status: quote.quoteStatus,
      });
    });

    (eventQuotes as any[]).forEach((quote) => {
      quotationHistory.push({
        type: 'Event Quotation',
        referenceNo: quote.quoteNumber || '-',
        activityDate: quote.createdAt,
        amount: Number(quote.totalAmount || 0),
        status: quote.quoteStatus,
      });
    });

    bookingHistory.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    paymentHistory.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    quotationHistory.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    visitDates.sort((a, b) => a.getTime() - b.getTime());

    const totalSpent = round2(paymentHistory.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0));
    const pendingDues = round2(paymentHistory.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0));
    const totalVisits = visitDates.length;
    const visitsPerMonth = totalVisits > 0
      ? round2(totalVisits / monthDiffInclusive(visitDates[0], visitDates[visitDates.length - 1]))
      : 0;

    const preferredFacilityId = String((customer as any).preferences?.preferredFacilityId || '');
    const preferredFacilityName = preferredFacilityId ? (facilityNameById.get(preferredFacilityId) || '') : '';

    res.json({
      success: true,
      data: {
        summary: {
          totalVisits,
          visitsPerMonth,
          visitFrequencyLabel: visitFrequencyLabel(visitsPerMonth),
          totalSpent,
          pendingDues,
          facilityBookingCount: facilityBookings.length,
          eventBookingCount: eventBookings.length,
          invoiceCount: sales.length,
          quotationCount: quotes.length + eventQuotes.length,
          lastVisitAt: visitDates.length ? visitDates[visitDates.length - 1] : null,
        },
        preferences: {
          ...(customer as any).preferences,
          preferredFacilityName,
        },
        memberships,
        bookingHistory: bookingHistory.slice(0, 20),
        paymentHistory: paymentHistory.slice(0, 20),
        quotationHistory: quotationHistory.slice(0, 20),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load customer CRM history' });
  }
});

export default router;
