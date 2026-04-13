import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Customer } from '../models/Customer.js';
import { CustomerLedgerEntry } from '../models/CustomerLedgerEntry.js';
import { Sale } from '../models/Sale.js';
import { MemberSubscription } from '../models/MemberSubscription.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { validateGstinLocally } from '../services/gstCompliance.js';

const router = Router();
const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const normalizeGstin = (value: any): string => String(value || '').trim().toUpperCase();
const normalizeCustomerCategory = (value: any): 'individual' | 'group_team' | 'corporate' | 'regular_member' | 'walk_in' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'group_team') return 'group_team';
  if (normalized === 'corporate') return 'corporate';
  if (normalized === 'regular_member') return 'regular_member';
  if (normalized === 'walk_in') return 'walk_in';
  return 'individual';
};
const normalizePreferences = (value: any): Record<string, any> => ({
  preferredSport: String(value?.preferredSport || '').trim(),
  preferredFacilityId: String(value?.preferredFacilityId || '').trim(),
  preferredTimeSlot: String(value?.preferredTimeSlot || '').trim(),
  preferredShopItems: Array.isArray(value?.preferredShopItems)
    ? value.preferredShopItems.map((item: any) => String(item || '').trim()).filter(Boolean)
    : String(value?.preferredShopItems || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
});
const normalizeContacts = (value: any): Array<Record<string, any>> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      name: String(row?.name || '').trim(),
      role: String(row?.role || '').trim(),
      email: normalizeEmail(row?.email),
      phone: normalizePhone(row?.phone),
      isPrimary: Boolean(row?.isPrimary),
      visibility: ['billing', 'operational', 'c_level', 'general'].includes(String(row?.visibility || ''))
        ? String(row?.visibility)
        : 'general',
      notes: String(row?.notes || '').trim(),
    }))
    .filter((row) => row.name);
};
const normalizeActivityEntry = (value: any, createdBy?: string): Record<string, any> | null => {
  const activityType = String(value?.activityType || '').trim().toLowerCase();
  const summary = String(value?.summary || '').trim();
  if (!summary) return null;
  const validType = ['call', 'email', 'meeting', 'payment_reminder', 'note', 'dispute'].includes(activityType)
    ? activityType
    : 'note';
  const nextFollowUpDate = value?.nextFollowUpDate ? new Date(value.nextFollowUpDate) : undefined;
  return {
    activityType: validType,
    summary,
    details: String(value?.details || '').trim(),
    nextFollowUpDate: nextFollowUpDate && !Number.isNaN(nextFollowUpDate.getTime()) ? nextFollowUpDate : undefined,
    createdAt: new Date(),
    createdBy,
  };
};
const recommendDunningAction = (daysPastDue: number): string => {
  if (daysPastDue >= 90) return 'Escalate immediately';
  if (daysPastDue >= 60) return 'Manager follow-up';
  if (daysPastDue >= 30) return 'Send firm reminder';
  if (daysPastDue > 0) return 'Send reminder';
  return 'Monitor';
};

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q, accountType, isBlocked, customerCategory, skip = 0, limit } = req.query;
    const filter: any = {};

    if (accountType) filter.accountType = accountType;
    if (isBlocked !== undefined) filter.isBlocked = String(isBlocked) === 'true';
    if (customerCategory) filter.customerCategory = normalizeCustomerCategory(customerCategory);
    if (q) {
      const phone = normalizePhone(q);
      filter.$or = [
        { customerCode: { $regex: String(q), $options: 'i' } },
        { name: { $regex: String(q), $options: 'i' } },
        { phone: { $regex: String(q), $options: 'i' } },
        { email: { $regex: String(q), $options: 'i' } },
        { gstin: { $regex: String(q), $options: 'i' } },
        ...(phone ? [{ phone }] : []),
      ];
    }

    const skipNum = Math.max(0, Number(skip || 0));
    const hasLimit = typeof limit !== 'undefined' && String(limit).trim() !== '';
    const limitNum = hasLimit ? Math.max(1, Number(limit || 50)) : 0;

    const query = Customer.find(filter).sort({ name: 1 }).skip(skipNum);
    if (hasLimit) query.limit(limitNum);

    const [rows, total] = await Promise.all([
      query,
      Customer.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        skip: skipNum,
        limit: hasLimit ? limitNum : rows.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch customers' });
  }
});

router.get('/search-unified', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const normalizedPhone = normalizePhone(q);
    const regex = new RegExp(q, 'i');

    const customerFilter: any = {
      $or: [
        { customerCode: regex },
        { name: regex },
        { phone: regex },
        { email: regex },
      ],
    };
    if (normalizedPhone) {
      customerFilter.$or.push({ phone: normalizedPhone });
    }

    const memberFilter: any = {
      $or: [
        { memberCode: regex },
        { memberName: regex },
        { fullName: regex },
        { phone: regex },
        { email: regex },
      ],
    };
    if (normalizedPhone) {
      memberFilter.$or.push({ phone: normalizedPhone });
    }

    const [customers, members] = await Promise.all([
      Customer.find(customerFilter)
        .select('_id customerCode name phone email accountType isBlocked')
        .sort({ updatedAt: -1, name: 1 })
        .limit(10),
      MemberSubscription.find(memberFilter)
        .select('_id memberCode memberName fullName phone email status')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(10),
    ]);

    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    const results: Array<Record<string, any>> = [];

    for (const customer of customers as any[]) {
      const phone = normalizePhone(customer.phone);
      const email = normalizeEmail(customer.email);
      if (phone) seenPhones.add(phone);
      if (email) seenEmails.add(email);
      results.push({
        _id: customer._id,
        customerCode: customer.customerCode,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        accountType: customer.accountType,
        isBlocked: customer.isBlocked,
        source: 'customer',
      });
    }

    for (const member of members as any[]) {
      const phone = normalizePhone(member.phone);
      const email = normalizeEmail(member.email);
      if ((phone && seenPhones.has(phone)) || (email && seenEmails.has(email))) continue;
      if (phone) seenPhones.add(phone);
      if (email) seenEmails.add(email);
      results.push({
        _id: `member:${member._id}`,
        memberSubscriptionId: member._id,
        memberCode: member.memberCode,
        name: member.memberName || member.fullName || '',
        phone: member.phone || '',
        email: member.email || '',
        memberStatus: member.status || '',
        source: 'member',
      });
    }

    res.json({ success: true, data: results.slice(0, 20) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to search customers and members' });
  }
});

router.get('/by-phone/:phone', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!phone) return res.status(400).json({ success: false, error: 'Valid phone number is required' });
    const customer = await Customer.findOne({ phone }).sort({ updatedAt: -1, createdAt: -1 });
    res.json({ success: true, data: customer || null });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch customer by phone' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      customerCode,
      name,
      phone,
      email,
      profilePhotoUrl,
      customerCategory = 'individual',
      gstin,
      address,
      accountType = 'cash',
      creditLimit = 0,
      creditDays = 0,
      openingBalance = 0,
      notes,
      priceOverrides = [],
      pricingTier = '',
      contacts = [],
      preferences = {},
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);
    const normalizedGstin = normalizeGstin(gstin);

    if (normalizedGstin) {
      const gstValidation = validateGstinLocally(normalizedGstin);
      if (!gstValidation.isValid) {
        return res.status(400).json({ success: false, error: gstValidation.message });
      }
    }

    if (normalizedPhone) {
      const duplicateByPhone = await Customer.findOne({ phone: normalizedPhone }).select('_id name customerCode');
      if (duplicateByPhone) {
        return res.status(409).json({
          success: false,
          error: `Customer already exists for this phone (${duplicateByPhone.name})`,
          data: duplicateByPhone,
        });
      }
    }

    const finalCode = String(customerCode || '').trim().toUpperCase()
      || await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });

    const existing = await Customer.findOne({ customerCode: finalCode });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Customer code already exists' });
    }

    const customer = await Customer.create({
      customerCode: finalCode,
      name,
      phone: normalizedPhone || undefined,
      email: normalizedEmail || undefined,
      profilePhotoUrl: String(profilePhotoUrl || '').trim(),
      customerCategory: normalizeCustomerCategory(customerCategory),
      gstin: normalizedGstin || undefined,
      address,
      accountType: String(accountType) === 'credit' ? 'credit' : 'cash',
      creditLimit: Number(creditLimit || 0),
      creditDays: Number(creditDays || 0),
      openingBalance: Number(openingBalance || 0),
      outstandingBalance: Number(openingBalance || 0),
      notes,
      priceOverrides: Array.isArray(priceOverrides) ? priceOverrides : [],
      pricingTier: String(pricingTier || '').trim(),
      contacts: normalizeContacts(contacts),
      preferences: normalizePreferences(preferences),
      createdBy: req.userId,
    });

    if (Number(openingBalance || 0) !== 0) {
      await CustomerLedgerEntry.create({
        customerId: customer._id,
        entryType: 'opening',
        entryDate: new Date(),
        debit: Number(openingBalance || 0) > 0 ? Number(openingBalance) : 0,
        credit: Number(openingBalance || 0) < 0 ? Math.abs(Number(openingBalance)) : 0,
        balanceAfter: Number(openingBalance || 0),
        narration: 'Opening balance',
        createdBy: req.userId,
      });
    }

    await writeAuditLog({
      module: 'customer',
      action: 'create',
      entityType: 'customer',
      entityId: customer._id.toString(),
      referenceNo: customer.customerCode,
      userId: req.userId,
      after: customer.toObject(),
    });

    res.status(201).json({ success: true, data: customer, message: 'Customer created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create customer' });
  }
});

router.get('/outstanding/summary', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await Customer.aggregate([
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          blockedCustomers: { $sum: { $cond: ['$isBlocked', 1, 0] } },
          totalOutstanding: { $sum: '$outstandingBalance' },
        },
      },
    ]);

    res.json({
      success: true,
      data: result[0] || { totalCustomers: 0, blockedCustomers: 0, totalOutstanding: 0 },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch outstanding summary' });
  }
});

router.get('/aging/report', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const asOn = req.query.asOnDate ? new Date(String(req.query.asOnDate)) : new Date();
    asOn.setHours(23, 59, 59, 999);

    const invoices = await Sale.find({
      invoiceType: 'credit',
      invoiceStatus: 'posted',
      outstandingAmount: { $gt: 0 },
    }).sort({ dueDate: 1, createdAt: 1 });

    const report = invoices.map((invoice: any) => {
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      const daysPastDue =
        dueDate ? Math.max(Math.floor((asOn.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)), 0) : 0;

      let bucket: 'current' | '30' | '60' | '90' = 'current';
      if (daysPastDue > 90) bucket = '90';
      else if (daysPastDue > 60) bucket = '60';
      else if (daysPastDue > 30) bucket = '30';

      return {
        saleId: invoice._id,
        invoiceNumber: invoice.invoiceNumber || invoice.saleNumber,
        customerId: invoice.customerId || null,
        customerCode: invoice.customerCode || '',
        customerName: invoice.customerName || 'Walk-in Customer',
        dueDate,
        outstandingAmount: Number(invoice.outstandingAmount || 0),
        daysPastDue,
        bucket,
      };
    });

    const summary = report.reduce(
      (acc, row) => {
        acc.total += row.outstandingAmount;
        if (row.bucket === 'current') acc.current += row.outstandingAmount;
        if (row.bucket === '30') acc.bucket30 += row.outstandingAmount;
        if (row.bucket === '60') acc.bucket60 += row.outstandingAmount;
        if (row.bucket === '90') acc.bucket90 += row.outstandingAmount;
        return acc;
      },
      { total: 0, current: 0, bucket30: 0, bucket60: 0, bucket90: 0 }
    );

    res.json({ success: true, data: { asOnDate: asOn, summary, rows: report } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate aging report' });
  }
});

router.get('/dunning/report', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const asOn = req.query.asOnDate ? new Date(String(req.query.asOnDate)) : new Date();
    asOn.setHours(23, 59, 59, 999);
    const minDays = Math.max(0, Number(req.query.minDays || 1));

    const invoices = await Sale.find({
      invoiceType: 'credit',
      invoiceStatus: 'posted',
      outstandingAmount: { $gt: 0 },
    }).sort({ dueDate: 1, createdAt: 1 });

    const customerIds = Array.from(
      new Set(
        invoices
          .map((row: any) => String(row.customerId || '').trim())
          .filter(Boolean)
      )
    );
    const customerRows = customerIds.length
      ? await Customer.find({ _id: { $in: customerIds } }).select('customerCode name phone email pricingTier contacts activityLog')
      : [];
    const customerById = new Map(customerRows.map((row: any) => [String(row._id), row]));

    const grouped = new Map<string, any>();

    for (const invoice of invoices as any[]) {
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      const daysPastDue =
        dueDate ? Math.max(Math.floor((asOn.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)), 0) : 0;
      if (daysPastDue < minDays) continue;

      const key = String(invoice.customerId || invoice.customerPhone || invoice.customerName || invoice._id);
      const customer = invoice.customerId ? customerById.get(String(invoice.customerId)) : null;
      const current = grouped.get(key) || {
        customerId: invoice.customerId || null,
        customerCode: customer?.customerCode || invoice.customerCode || '',
        customerName: customer?.name || invoice.customerName || 'Walk-in Customer',
        customerPhone: customer?.phone || invoice.customerPhone || '',
        customerEmail: customer?.email || invoice.customerEmail || '',
        pricingTier: customer?.pricingTier || '',
        totalOutstanding: 0,
        invoiceCount: 0,
        maxDaysPastDue: 0,
        lastDueDate: dueDate,
        invoiceNumbers: [] as string[],
        billingContact: null as any,
        lastReminderAt: null as Date | null,
      };

      current.totalOutstanding += Number(invoice.outstandingAmount || 0);
      current.invoiceCount += 1;
      current.maxDaysPastDue = Math.max(current.maxDaysPastDue, daysPastDue);
      if (dueDate && (!current.lastDueDate || dueDate < current.lastDueDate)) current.lastDueDate = dueDate;
      current.invoiceNumbers.push(invoice.invoiceNumber || invoice.saleNumber);

      const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];
      const billingContact =
        contacts.find((row: any) => row?.visibility === 'billing' || String(row?.role || '').toLowerCase().includes('billing'))
        || contacts.find((row: any) => row?.isPrimary)
        || contacts[0]
        || null;
      current.billingContact = billingContact;

      const reminderRows = Array.isArray(customer?.activityLog)
        ? customer.activityLog.filter((row: any) => row?.activityType === 'payment_reminder')
        : [];
      const latestReminder = reminderRows
        .map((row: any) => (row?.createdAt ? new Date(row.createdAt) : null))
        .filter((row: Date | null): row is Date => row instanceof Date && !Number.isNaN(row.getTime()))
        .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] || null;
      current.lastReminderAt = latestReminder;

      grouped.set(key, current);
    }

    const rows = Array.from(grouped.values())
      .map((row) => ({
        ...row,
        totalOutstanding: Number(row.totalOutstanding.toFixed(2)),
        recommendedAction: recommendDunningAction(Number(row.maxDaysPastDue || 0)),
      }))
      .sort((a, b) => b.maxDaysPastDue - a.maxDaysPastDue || b.totalOutstanding - a.totalOutstanding);

    res.json({
      success: true,
      data: {
        asOnDate: asOn,
        rows,
        summary: {
          customers: rows.length,
          invoices: rows.reduce((sum, row) => sum + Number(row.invoiceCount || 0), 0),
          totalOutstanding: Number(rows.reduce((sum, row) => sum + Number(row.totalOutstanding || 0), 0).toFixed(2)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to build dunning report' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: customer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch customer' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const current = await Customer.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Customer not found' });

    const normalizedPhone = req.body.phone !== undefined ? normalizePhone(req.body.phone) : current.phone;
    const normalizedEmail = req.body.email !== undefined ? normalizeEmail(req.body.email) : current.email;
    const normalizedGstin = req.body.gstin !== undefined ? normalizeGstin(req.body.gstin) : normalizeGstin(current.gstin);

    if (normalizedPhone) {
      const duplicateByPhone = await Customer.findOne({
        phone: normalizedPhone,
        _id: { $ne: current._id },
      }).select('_id name customerCode');
      if (duplicateByPhone) {
        return res.status(409).json({
          success: false,
          error: `Another customer already uses this phone (${duplicateByPhone.name})`,
          data: duplicateByPhone,
        });
      }
    }

    if (normalizedGstin) {
      const gstValidation = validateGstinLocally(normalizedGstin);
      if (!gstValidation.isValid) {
        return res.status(400).json({ success: false, error: gstValidation.message });
      }
    }

    const updates = {
      ...req.body,
      customerCode: req.body.customerCode ? String(req.body.customerCode).toUpperCase() : current.customerCode,
      phone: normalizedPhone || undefined,
      email: normalizedEmail || undefined,
      profilePhotoUrl: req.body.profilePhotoUrl !== undefined ? String(req.body.profilePhotoUrl || '').trim() : current.profilePhotoUrl,
      customerCategory: req.body.customerCategory !== undefined ? normalizeCustomerCategory(req.body.customerCategory) : current.customerCategory,
      gstin: normalizedGstin || undefined,
      accountType: req.body.accountType === 'credit' ? 'credit' : req.body.accountType === 'cash' ? 'cash' : current.accountType,
      creditLimit: req.body.creditLimit !== undefined ? Number(req.body.creditLimit) : current.creditLimit,
      creditDays: req.body.creditDays !== undefined ? Number(req.body.creditDays) : current.creditDays,
      priceOverrides: Array.isArray(req.body.priceOverrides) ? req.body.priceOverrides : current.priceOverrides,
      pricingTier: req.body.pricingTier !== undefined ? String(req.body.pricingTier || '').trim() : current.pricingTier,
      contacts: req.body.contacts !== undefined ? normalizeContacts(req.body.contacts) : current.contacts,
      preferences: req.body.preferences !== undefined ? normalizePreferences(req.body.preferences) : current.preferences,
    };

    const customer = await Customer.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    await writeAuditLog({
      module: 'customer',
      action: 'update',
      entityType: 'customer',
      entityId: String(req.params.id),
      referenceNo: customer?.customerCode,
      userId: req.userId,
      before: current.toObject(),
      after: customer?.toObject(),
    });

    res.json({ success: true, data: customer, message: 'Customer updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update customer' });
  }
});

router.put('/:id/block', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { isBlocked } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { isBlocked: Boolean(isBlocked) },
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    res.json({
      success: true,
      data: customer,
      message: customer.isBlocked ? 'Customer blocked successfully' : 'Customer unblocked successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update customer block state' });
  }
});

router.post('/:id/activities', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    const activity = normalizeActivityEntry(req.body, req.userId);
    if (!activity) {
      return res.status(400).json({ success: false, error: 'Activity summary is required' });
    }

    customer.activityLog = Array.isArray(customer.activityLog) ? customer.activityLog : [];
    customer.activityLog.unshift(activity as any);
    await customer.save();

    await writeAuditLog({
      module: 'customer',
      action: 'activity_logged',
      entityType: 'customer',
      entityId: customer._id.toString(),
      referenceNo: customer.customerCode,
      userId: req.userId,
      metadata: {
        activityType: activity.activityType,
        summary: activity.summary,
      },
    });

    res.status(201).json({ success: true, data: customer, message: 'Customer activity logged' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to log customer activity' });
  }
});

router.get('/:id/ledger', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await CustomerLedgerEntry.find({ customerId: req.params.id }).sort({ entryDate: 1, createdAt: 1 });
    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit || 0);
        acc.credit += Number(row.credit || 0);
        return acc;
      },
      { debit: 0, credit: 0 }
    );

    res.json({
      success: true,
      data: {
        totals: { ...totals, balance: Number((totals.debit - totals.credit).toFixed(2)) },
        rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch customer ledger' });
  }
});

router.get('/:id/invoices', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await Sale.find({ customerId: req.params.id }).sort({ createdAt: -1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch customer invoices' });
  }
});

export default router;
