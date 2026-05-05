import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { MembershipPlan } from '../models/MembershipPlan.js';
import { MemberSubscription } from '../models/MemberSubscription.js';
import { Customer } from '../models/Customer.js';
import { Facility } from '../models/Facility.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { writeAuditLog } from '../services/audit.js';
import {
  persistManagedImageValue,
  removeManagedStoredFile,
  resolveManagedStoragePath,
} from '../services/assetStorage.js';
import { generateNumber } from '../services/numbering.js';
import { loadTenantGeneralSettings } from '../services/generalSettings.js';
import { sendConfiguredMail } from '../services/mail.js';

const router = Router();
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const dayMs = 24 * 60 * 60 * 1000;

const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const parseBoolean = (value: any, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};
const matchCustomerByMemberContact = async (phone?: string, email?: string) => {
  const clauses = [
    ...(phone ? [{ phone }] : []),
    ...(email ? [{ email }] : []),
  ];
  if (!clauses.length) return null;
  return Customer.findOne({ $or: clauses }).sort({ updatedAt: -1, createdAt: -1 });
};

const syncCustomerProfileFromSubscription = async (subscription: any, userId?: string) => {
  const normalizedPhone = normalizePhone(subscription?.phone);
  const normalizedEmail = normalizeEmail(subscription?.email);
  const memberName =
    String(subscription?.fullName || '').trim()
    || String(subscription?.memberName || '').trim();

  const existing = await matchCustomerByMemberContact(normalizedPhone, normalizedEmail);
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
    if (memberName && existing.name !== memberName && ['individual', 'walk_in', 'regular_member'].includes(String(existing.customerCategory || ''))) {
      existing.name = memberName;
      changed = true;
    }
    if (!['corporate', 'group_team'].includes(String(existing.customerCategory || ''))) {
      if (existing.customerCategory !== 'regular_member') {
        existing.customerCategory = 'regular_member';
        changed = true;
      }
    }
    if (changed) {
      if (!existing.createdBy && userId) existing.createdBy = userId;
      await existing.save();
    }
    return existing;
  }

  if (!memberName) return null;

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  return Customer.create({
    customerCode,
    name: memberName,
    phone: normalizedPhone || undefined,
    email: normalizedEmail || undefined,
    customerCategory: 'regular_member',
    accountType: 'cash',
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    outstandingBalance: 0,
    notes: 'Created automatically from membership subscription.',
    createdBy: userId,
  });
};

type ReminderChannel = 'sms' | 'email' | 'whatsapp' | 'in_app' | 'pos_popup';
type ReminderType = 'd7' | 'd3' | 'expiry' | 'grace';

const reminderChannels: ReminderChannel[] = ['sms', 'email', 'whatsapp', 'in_app', 'pos_popup'];

const requireMembershipAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }
  const user = await User.findById(req.userId).select('role');
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return null;
  }
  const role = String(user.role || '').toLowerCase();
  if (!['admin', 'super_admin'].includes(role)) {
    res.status(403).json({ success: false, error: 'Only admin/super admin can perform this action' });
    return null;
  }
  return user;
};

const durationFromCycle = (cycle: string, customDays?: number): number => {
  const normalized = String(cycle || '').toLowerCase();
  if (normalized === 'monthly') return 30;
  if (normalized === 'quarterly') return 90;
  if (normalized === 'half_yearly') return 180;
  if (normalized === 'yearly') return 365;
  return Math.max(1, Number(customDays || 30));
};

const addDateDuration = (start: Date, value: number, unit: string): Date => {
  const amount = Math.max(1, Math.floor(Number(value || 0)));
  const normalizedUnit = String(unit || 'days').toLowerCase();
  const end = new Date(start);

  if (normalizedUnit === 'months') {
    const originalDay = end.getDate();
    end.setMonth(end.getMonth() + amount);
    if (end.getDate() !== originalDay) {
      end.setDate(0);
    }
    return end;
  }

  if (normalizedUnit === 'years') {
    const originalMonth = end.getMonth();
    end.setFullYear(end.getFullYear() + amount);
    if (end.getMonth() !== originalMonth) {
      end.setDate(0);
    }
    return end;
  }

  end.setDate(end.getDate() + amount);
  return end;
};

const normalizeDurationOverride = (raw: any): { value: number; unit: 'days' | 'months' | 'years'; label: string } | null => {
  const value = Math.floor(Number(raw?.durationValue || raw?.membershipDurationValue || 0));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unitInput = String(raw?.durationUnit || raw?.membershipDurationUnit || 'days').toLowerCase();
  const unit = unitInput === 'years' ? 'years' : unitInput === 'months' ? 'months' : 'days';
  const label = `${value} ${value === 1 ? unit.slice(0, -1) || unit : unit}`;
  return { value, unit, label };
};

const withPlanDefaults = (raw: any) => {
  const billingCycle = String(raw?.billingCycle || 'monthly').toLowerCase();
  const durationDays = durationFromCycle(billingCycle, Number(raw?.durationDays || 0));
  const active = raw?.active !== undefined ? Boolean(raw.active) : true;
  const status = String(raw?.status || (active ? 'active' : 'inactive')).toLowerCase();

  return {
    name: String(raw?.name || '').trim(),
    description: String(raw?.description || '').trim(),
    planType: String(raw?.planType || (Number(raw?.price || 0) <= 0 ? 'free' : 'paid')).toLowerCase(),
    status: ['active', 'inactive', 'archived'].includes(status) ? status : active ? 'active' : 'inactive',
    active: status === 'active' ? true : active && status !== 'archived',
    facilityType: String(raw?.facilityType || 'custom').trim(),
    facilityIds: Array.isArray(raw?.facilityIds) ? raw.facilityIds : [],
    billingCycle,
    durationDays,
    price: Math.max(0, Number(raw?.price || 0)),
    oneTimeFeeEnabled: Boolean(raw?.oneTimeFeeEnabled),
    oneTimeFeeAmount: Math.max(0, Number(raw?.oneTimeFeeAmount || 0)),
    autoRenew: Boolean(raw?.autoRenew),
    gracePeriodDays: Math.max(0, Number(raw?.gracePeriodDays || 0)),
    trialPeriodDays: Math.max(0, Number(raw?.trialPeriodDays || 0)),
    bookingDiscountPercentage: Math.max(0, Math.min(100, Number(raw?.bookingDiscountPercentage || 0))),
    flatDiscountAmount: Math.max(0, Number(raw?.flatDiscountAmount || 0)),
    memberOnlyPricing: Boolean(raw?.memberOnlyPricing),
    rewardPointsMultiplier: Math.max(0, Number(raw?.rewardPointsMultiplier || 1)),
    freeServiceItems: Array.isArray(raw?.freeServiceItems) ? raw.freeServiceItems.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
    accessRestrictions: Array.isArray(raw?.accessRestrictions) ? raw.accessRestrictions.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
    maxUsagePerMonth: Math.max(0, Number(raw?.maxUsagePerMonth || 0)),
    maxDiscountPerCycle: Math.max(0, Number(raw?.maxDiscountPerCycle || 0)),
    memberVisitLimit: Math.max(0, Number(raw?.memberVisitLimit || 0)),
    sessionsLimit: Math.max(0, Number(raw?.sessionsLimit || 0)),
    pointsEarningLimit: Math.max(0, Number(raw?.pointsEarningLimit || 0)),
    pointsPerCurrency: Math.max(0, Number(raw?.pointsPerCurrency || 0)),
    pointsRedemptionValue: Math.max(0, Number(raw?.pointsRedemptionValue || 0)),
    minimumRedeemPoints: Math.max(0, Number(raw?.minimumRedeemPoints || 0)),
    pointsExpiryDays: Math.max(0, Number(raw?.pointsExpiryDays || 0)),
    freezeAllowed: raw?.freezeAllowed !== undefined ? Boolean(raw.freezeAllowed) : true,
    pauseMembershipAllowed: Boolean(raw?.pauseMembershipAllowed),
    corporateMembership: Boolean(raw?.corporateMembership),
    familyMembership: Boolean(raw?.familyMembership),
    multiLocationValid: Boolean(raw?.multiLocationValid),
    tierName: String(raw?.tierName || '').trim(),
    qrEnabled: Boolean(raw?.qrEnabled),
    customizable: raw?.customizable !== undefined ? Boolean(raw.customizable) : true,
  };
};

const computeReminderType = (subscription: any, now: Date): 'd7' | 'd3' | 'expiry' | 'grace' | null => {
  const end = new Date(subscription.endDate);
  const diffDays = Math.floor((end.getTime() - now.getTime()) / dayMs);
  if (diffDays === 7) return 'd7';
  if (diffDays === 3) return 'd3';
  if (diffDays === 0) return 'expiry';
  const graceUntil = subscription.gracePeriodUntil ? new Date(subscription.gracePeriodUntil) : null;
  if (end.getTime() < now.getTime() && graceUntil && graceUntil.getTime() >= now.getTime()) return 'grace';
  return null;
};

const buildReminderMessage = (args: {
  subscription: any;
  planName: string;
  reminderType: ReminderType;
  now: Date;
}): string => {
  const memberName = String(args.subscription?.memberName || 'Member');
  const planName = args.planName || 'Membership Plan';
  const endDate = new Date(args.subscription?.endDate || args.now);
  const endLabel = endDate.toLocaleDateString('en-IN');

  if (args.reminderType === 'd7') {
    return `Hi ${memberName}, your ${planName} membership expires in 7 days on ${endLabel}. Renew soon to continue benefits.`;
  }
  if (args.reminderType === 'd3') {
    return `Hi ${memberName}, your ${planName} membership expires in 3 days on ${endLabel}. Please renew to avoid interruption.`;
  }
  if (args.reminderType === 'expiry') {
    return `Hi ${memberName}, your ${planName} membership expires today (${endLabel}). Renew now to keep your member benefits active.`;
  }
  return `Hi ${memberName}, your ${planName} membership is in grace period after ${endLabel}. Renew immediately to avoid full expiry.`;
};

const buildReminderSubject = (args: { reminderType: ReminderType; planName: string }): string => {
  const labelMap: Record<ReminderType, string> = {
    d7: 'expires in 7 days',
    d3: 'expires in 3 days',
    expiry: 'expires today',
    grace: 'is in grace period',
  };
  return `Membership reminder: ${args.planName} ${labelMap[args.reminderType]}`;
};

const buildReminderMailContent = (args: {
  subscription: any;
  planName: string;
  reminderType: ReminderType;
  now: Date;
}) => {
  const message = buildReminderMessage(args);
  const endDate = new Date(args.subscription?.endDate || args.now);
  const endLabel = endDate.toLocaleDateString('en-IN');
  const memberName = String(args.subscription?.fullName || args.subscription?.memberName || 'Member');
  const memberCode = String(args.subscription?.memberCode || '-');
  const subject = buildReminderSubject({ reminderType: args.reminderType, planName: args.planName });

  return {
    subject,
    text: [
      message,
      '',
      `Member: ${memberName}`,
      `Member Code: ${memberCode}`,
      `Plan: ${args.planName}`,
      `Valid Until: ${endLabel}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
        <h2 style="margin:0 0 10px 0;color:#0f5132">Membership Renewal Reminder</h2>
        <p style="margin:0 0 14px 0">${escapeHtml(message)}</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Member</td><td style="padding:4px 0"><strong>${escapeHtml(memberName)}</strong></td></tr>
          <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Member Code</td><td style="padding:4px 0">${escapeHtml(memberCode)}</td></tr>
          <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Plan</td><td style="padding:4px 0">${escapeHtml(args.planName)}</td></tr>
          <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Valid Until</td><td style="padding:4px 0">${escapeHtml(endLabel)}</td></tr>
        </table>
      </div>
    `,
  };
};

const buildReminderPreview = (args: {
  subscription: any;
  channels: ReminderChannel[];
  reminderType: ReminderType;
  now: Date;
}) => {
  const planName = String((args.subscription?.planId as any)?.name || 'Membership Plan');
  const mailContent = buildReminderMailContent({
    subscription: args.subscription,
    planName,
    reminderType: args.reminderType,
    now: args.now,
  });

  return {
    memberId: args.subscription?._id?.toString?.() || '',
    memberName: String(args.subscription?.memberName || ''),
    memberCode: String(args.subscription?.memberCode || ''),
    planName,
    reminderType: args.reminderType,
    channels: args.channels,
    phone: normalizePhone(args.subscription?.phone),
    email: normalizeEmail(args.subscription?.email),
    subject: mailContent.subject,
    message: buildReminderMessage({
      subscription: args.subscription,
      planName,
      reminderType: args.reminderType,
      now: args.now,
    }),
  };
};

const postWebhook = async (url: string, payload: Record<string, any>): Promise<void> => {
  const trimmed = String(url || '').trim();
  if (!trimmed) return;
  const response = await fetch(trimmed, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Webhook failed (${response.status})`);
  }
};

const dispatchReminder = async (args: {
  channel: ReminderChannel;
  subscription: any;
  reminderType: ReminderType;
  planName: string;
  now: Date;
  settingsOverride?: any;
}): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string }> => {
  const message = buildReminderMessage({
    subscription: args.subscription,
    planName: args.planName,
    reminderType: args.reminderType,
    now: args.now,
  });
  const memberCode = String(args.subscription?.memberCode || '');
  const memberName = String(args.subscription?.memberName || '');
  const phone = normalizePhone(args.subscription?.phone);
  const email = normalizeEmail(args.subscription?.email);

  try {
    if (args.channel === 'sms') {
      if (!phone) return { status: 'failed', error: 'Member phone is missing' };
      await postWebhook(String(process.env.MEMBERSHIP_SMS_WEBHOOK_URL || ''), {
        channel: 'sms',
        phone,
        message,
        memberCode,
        memberName,
        reminderType: args.reminderType,
      });
      return { status: 'sent' };
    }

    if (args.channel === 'email') {
      if (!email) return { status: 'failed', error: 'Member email is missing' };
      const mailContent = buildReminderMailContent({
        subscription: args.subscription,
        planName: args.planName,
        reminderType: args.reminderType,
        now: args.now,
      });
      await sendConfiguredMail({
        settingsOverride: args.settingsOverride,
        recipients: [email],
        subject: mailContent.subject,
        text: mailContent.text,
        html: mailContent.html,
      });
      return { status: 'sent' };
    }

    if (args.channel === 'whatsapp') {
      if (!phone) return { status: 'failed', error: 'Member phone is missing' };
      await postWebhook(String(process.env.MEMBERSHIP_WHATSAPP_WEBHOOK_URL || ''), {
        channel: 'whatsapp',
        phone,
        message,
        memberCode,
        memberName,
      });
      return { status: 'sent' };
    }

    // in_app and pos_popup are internal reminder channels; mark as sent.
    return { status: 'sent' };
  } catch (error: any) {
    return { status: 'failed', error: error.message || 'Dispatch failed' };
  }
};

const sendReminderForSubscription = async (args: {
  req: AuthenticatedRequest;
  subscription: any;
  channels: ReminderChannel[];
  reminderType: ReminderType;
  source: 'manual' | 'automation';
}): Promise<{
  memberId: string;
  memberName: string;
  reminderType: ReminderType;
  results: Array<{ channel: ReminderChannel; status: string; error?: string }>;
}> => {
  const sub = args.subscription;
  const now = new Date();
  const planName = String((sub?.planId as any)?.name || 'Membership Plan');
  const selectedChannels = args.channels.filter((channel) => reminderChannels.includes(channel));
  const results: Array<{ channel: ReminderChannel; status: string; error?: string }> = [];
  const settings = selectedChannels.includes('email') ? await loadTenantGeneralSettings(args.req.tenantId) : null;

  sub.reminderHistory = Array.isArray(sub.reminderHistory) ? sub.reminderHistory : [];

  for (const channel of selectedChannels) {
    const dispatch = await dispatchReminder({
      channel,
      subscription: sub,
      reminderType: args.reminderType,
      planName,
      now,
      settingsOverride: settings,
    });
    results.push({
      channel,
      status: dispatch.status,
      ...(dispatch.error ? { error: dispatch.error } : {}),
    });
    sub.reminderHistory.push({
      reminderType: args.reminderType,
      channel,
      scheduledFor: now,
      sentAt: dispatch.status === 'sent' ? now : undefined,
      status: dispatch.status,
    });
  }

  await sub.save();
  await pushAudit(
    args.req,
    args.source === 'manual' ? 'subscription_reminder_manual_send' : 'subscription_reminder_auto_send',
    'member_subscription',
    sub._id.toString(),
    undefined,
    sub.toObject(),
    {
      channels: selectedChannels,
      reminderType: args.reminderType,
      result: results,
    }
  );

  return {
    memberId: sub._id.toString(),
    memberName: String(sub.memberName || ''),
    reminderType: args.reminderType,
    results,
  };
};

const isSubActiveForBilling = (subscription: any, now = new Date()): { ok: boolean; reason?: string } => {
  const status = String(subscription?.status || '').toLowerCase();
  if (!['active'].includes(status)) return { ok: false, reason: `Membership is ${status}` };
  const endDate = new Date(subscription.endDate);
  const graceUntil = subscription.gracePeriodUntil ? new Date(subscription.gracePeriodUntil) : null;
  if (endDate.getTime() >= now.getTime()) return { ok: true };
  if (graceUntil && graceUntil.getTime() >= now.getTime()) return { ok: true };
  return { ok: false, reason: 'Membership has expired' };
};

const pushAudit = async (
  req: AuthenticatedRequest,
  action: string,
  entityType: string,
  entityId: string,
  before?: Record<string, any>,
  after?: Record<string, any>,
  metadata?: Record<string, any>
) => {
  await writeAuditLog({
    module: 'memberships',
    action,
    entityType,
    entityId,
    userId: req.userId,
    before,
    after,
    metadata,
  });
};

router.get('/plan-options', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const facilities = await Facility.find({ active: true })
      .select('name location active')
      .sort({ name: 1 });
    res.json({
      success: true,
      data: {
        billingCycles: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'],
        planTypes: ['free', 'paid'],
        statuses: ['active', 'inactive', 'archived'],
        reminderChannels: ['sms', 'email', 'whatsapp', 'in_app', 'pos_popup'],
        facilities,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load membership plan options' });
  }
});

router.get('/plans', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, activeOnly = false } = req.query;
    const filter: any = {};
    if (status) filter.status = String(status);
    if (String(activeOnly) === 'true') {
      filter.active = true;
      filter.status = { $ne: 'archived' };
    }

    const plans = await MembershipPlan.find(filter)
      .populate('facilityIds', 'name location active')
      .sort({ active: -1, status: 1, price: 1 });
    res.json({ success: true, data: plans });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch membership plans' });
  }
});

router.post('/plans', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const payload = withPlanDefaults(req.body || {});
    if (!payload.name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const plan = await MembershipPlan.create({
      ...payload,
      createdBy: req.userId,
    });

    await pushAudit(req, 'plan_create', 'membership_plan', plan._id.toString(), undefined, plan.toObject());
    res.status(201).json({ success: true, data: plan, message: 'Membership plan created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create membership plan' });
  }
});

router.put('/plans/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const before = await MembershipPlan.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    const updates = withPlanDefaults({ ...before.toObject(), ...req.body });
    const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).populate('facilityIds', 'name location active');
    if (!plan) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    await pushAudit(req, 'plan_update', 'membership_plan', plan._id.toString(), before.toObject(), plan.toObject());
    res.json({ success: true, data: plan, message: 'Membership plan updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update membership plan' });
  }
});

router.post('/plans/:id/duplicate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const source = await MembershipPlan.findById(req.params.id);
    if (!source) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    const sourceObj: any = source.toObject();
    delete sourceObj._id;
    delete sourceObj.createdAt;
    delete sourceObj.updatedAt;
    sourceObj.name = String(req.body?.name || `${source.name} Copy`).trim();
    sourceObj.status = 'inactive';
    sourceObj.active = false;
    sourceObj.sourcePlanId = source._id;
    sourceObj.createdBy = req.userId;

    const duplicate = await MembershipPlan.create(sourceObj);
    await pushAudit(req, 'plan_duplicate', 'membership_plan', duplicate._id.toString(), undefined, duplicate.toObject(), {
      sourcePlanId: source._id.toString(),
    });
    res.status(201).json({ success: true, data: duplicate, message: 'Membership plan duplicated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to duplicate membership plan' });
  }
});

router.put('/plans/:id/archive', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const before = await MembershipPlan.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    const plan = await MembershipPlan.findByIdAndUpdate(
      req.params.id,
      {
        status: 'archived',
        active: false,
        archivedAt: new Date(),
      },
      { returnDocument: 'after' }
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    await pushAudit(req, 'plan_archive', 'membership_plan', plan._id.toString(), before.toObject(), plan.toObject());
    res.json({ success: true, data: plan, message: 'Membership plan archived' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to archive membership plan' });
  }
});

router.put('/plans/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'inactive', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be active, inactive, or archived' });
    }

    const before = await MembershipPlan.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    const plan = await MembershipPlan.findByIdAndUpdate(
      req.params.id,
      {
        status,
        active: status === 'active',
        ...(status === 'archived' ? { archivedAt: new Date() } : {}),
      },
      { returnDocument: 'after', runValidators: true }
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Membership plan not found' });

    await pushAudit(req, 'plan_status_update', 'membership_plan', plan._id.toString(), before.toObject(), plan.toObject(), { status });
    res.json({ success: true, data: plan, message: 'Plan status updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update plan status' });
  }
});

router.get('/subscriptions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, expiringInDays, q } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (q) {
      const regex = new RegExp(String(q), 'i');
      const phone = normalizePhone(q);
      filter.$or = [{ memberName: regex }, { memberCode: regex }, { phone: regex }, ...(phone ? [{ phone }] : [])];
    }
    if (expiringInDays !== undefined) {
      const days = Math.max(0, Math.min(120, Number(expiringInDays || 0)));
      const until = new Date(Date.now() + days * dayMs);
      filter.endDate = { $lte: until };
      filter.status = { $in: ['active', 'frozen', 'suspended'] };
    }

    const items = await MemberSubscription.find(filter)
      .populate({
        path: 'planId',
        select:
          'name tierName facilityType facilityIds planType status billingCycle durationDays price sessionsLimit bookingDiscountPercentage flatDiscountAmount rewardPointsMultiplier freezeAllowed pauseMembershipAllowed pointsPerCurrency pointsRedemptionValue minimumRedeemPoints',
        populate: { path: 'facilityIds', select: 'name location active' },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch subscriptions' });
  }
});

router.get('/subscriptions/:id/profile-details', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sub = await MemberSubscription.findById(req.params.id).populate({
      path: 'planId',
      select:
        'name tierName facilityType facilityIds planType status billingCycle durationDays price oneTimeFeeEnabled oneTimeFeeAmount gracePeriodDays trialPeriodDays bookingDiscountPercentage flatDiscountAmount rewardPointsMultiplier freeServiceItems accessRestrictions sessionsLimit memberVisitLimit pointsPerCurrency pointsRedemptionValue minimumRedeemPoints pointsExpiryDays',
      populate: { path: 'facilityIds', select: 'name location active' },
    });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const now = new Date();
    const plan: any = sub.planId as any;
    const start = new Date(sub.startDate);
    const end = new Date(sub.endDate);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs));
    const daysRemaining = Math.ceil((end.getTime() - now.getTime()) / dayMs);
    const progressDays = Math.min(100, Math.max(0, round2(((totalDays - Math.max(daysRemaining, 0)) / totalDays) * 100)));
    const sessionsLimit = Number(plan?.sessionsLimit || 0);
    const visitsLimit = Number(plan?.memberVisitLimit || 0);
    const sessionsUsed = Number(sub.sessionsUsed || 0);
    const visitsUsed = Number(sub.totalVisits || 0);

    const renewalHistory = Array.isArray(sub.renewalHistory) ? [...sub.renewalHistory].reverse() : [];
    const planHistory = Array.isArray(sub.planHistory) ? [...sub.planHistory].reverse() : [];
    const reminderHistory = Array.isArray(sub.reminderHistory) ? [...sub.reminderHistory].reverse() : [];
    const rewardTransactions = Array.isArray(sub.rewardTransactions) ? [...sub.rewardTransactions].reverse() : [];
    const reminderType = computeReminderType(sub, now);

    res.json({
      success: true,
      data: {
        profile: {
          memberId: sub._id,
          memberCode: sub.memberCode || '',
          memberName: sub.memberName,
          fullName: sub.fullName || sub.memberName,
          phone: sub.phone || '',
          email: sub.email || '',
          address: sub.address || '',
          emergencyContact: sub.emergencyContact || '',
          gender: sub.gender || 'prefer_not_to_say',
          dateOfBirth: sub.dateOfBirth || null,
          profilePhotoUrl: sub.profilePhotoUrl || '',
          languagePreference: sub.languagePreference || 'en',
          themePreference: sub.themePreference || 'dark',
        },
        membership: {
          status: sub.status,
          startDate: sub.startDate,
          endDate: sub.endDate,
          renewalDate: sub.renewalDate || null,
          gracePeriodUntil: sub.gracePeriodUntil || null,
          autoRenewEnabled: Boolean(sub.autoRenewEnabled),
          validityReminderDays: Number(sub.validityReminderDays || 0),
          daysRemaining,
          progressDaysPercent: progressDays,
          reminderType: reminderType || undefined,
        },
        plan: plan
          ? {
              planId: plan._id,
              name: plan.name,
              tierName: String(plan.tierName || '').trim(),
              levelLabel: String(plan.tierName || '').trim() || String(plan.name || '').trim() || 'Member',
              planType: plan.planType,
              billingCycle: plan.billingCycle,
              durationDays: Number(plan.durationDays || 0),
              price: Number(plan.price || 0),
              bookingDiscountPercentage: Number(sub.bookingDiscountPercentage || plan.bookingDiscountPercentage || 0),
              flatDiscountAmount: Number(plan.flatDiscountAmount || 0),
              freeServiceItems: Array.isArray(plan.freeServiceItems) ? plan.freeServiceItems : [],
              accessRestrictions: Array.isArray(plan.accessRestrictions) ? plan.accessRestrictions : [],
              facilityNames: Array.isArray(plan.facilityIds)
                ? plan.facilityIds.map((facility: any) => String(facility?.name || '').trim()).filter(Boolean)
                : [],
              sessionsLimit: sessionsLimit,
              sessionsUsed: sessionsUsed,
              sessionsRemaining: sessionsLimit > 0 ? Math.max(0, sessionsLimit - sessionsUsed) : null,
              visitLimit: visitsLimit,
              visitsUsed: visitsUsed,
              visitsRemaining: visitsLimit > 0 ? Math.max(0, visitsLimit - visitsUsed) : null,
              pointsPerCurrency: Number(plan.pointsPerCurrency || 0),
              pointsRedemptionValue: Number(plan.pointsRedemptionValue || 0),
              minimumRedeemPoints: Number(plan.minimumRedeemPoints || 0),
            }
          : null,
        wallet: {
          rewardPointsBalance: Number(sub.rewardPointsBalance || 0),
          pointsEarnedTotal: Number(sub.pointsEarnedTotal || 0),
          pointsRedeemedTotal: Number(sub.pointsRedeemedTotal || 0),
          pointsExpiredTotal: Number(sub.pointsExpiredTotal || 0),
          totalSpending: Number(sub.totalSpending || 0),
          amountPaid: Number(sub.amountPaid || 0),
          amountDue: Number(sub.amountDue || 0),
        },
        histories: {
          renewalHistory,
          planHistory,
          reminderHistory,
          rewardTransactions,
        },
        availableReminderChannels: {
          sms: Boolean(normalizePhone(sub.phone)),
          email: Boolean(normalizeEmail(sub.email)),
          whatsapp: Boolean(normalizePhone(sub.phone)),
          in_app: true,
          pos_popup: true,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch member profile details' });
  }
});

router.post('/subscriptions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  let writtenPhotoStoragePath = '';
  try {
    const {
      memberName,
      fullName,
      phone,
      email,
      address,
      emergencyContact,
      dateOfBirth,
      gender,
      profilePhotoUrl,
      languagePreference,
      themePreference,
      planId,
      startDate,
      durationValue,
      durationUnit,
      amountPaid,
      bookingDiscountPercentage,
      validityReminderDays,
      notes,
    } = req.body;
    if (!memberName || !planId) {
      return res.status(400).json({ success: false, error: 'memberName and planId are required' });
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, error: 'mobile number is required' });
    }
    const existingMember = await MemberSubscription.findOne({
      phone: normalizedPhone,
    }).select('_id memberName status');
    if (existingMember) {
      return res.status(409).json({
        success: false,
        error: `Mobile number already exists for member ${existingMember.memberName} (${String(existingMember.status || 'active').toUpperCase()})`,
      });
    }

    const plan = await MembershipPlan.findById(planId);
    if (!plan || plan.status === 'archived') return res.status(404).json({ success: false, error: 'Plan not found' });
    if (!plan.active) return res.status(400).json({ success: false, error: 'Selected plan is inactive' });

    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    const durationOverride = normalizeDurationOverride({ durationValue, durationUnit });
    const end = new Date(start);
    if (durationOverride) {
      const customEnd = addDateDuration(start, durationOverride.value, durationOverride.unit);
      end.setTime(customEnd.getTime());
    } else {
      end.setDate(end.getDate() + Math.max(1, Number(plan.durationDays || 0)));
    }
    if (Number(plan.trialPeriodDays || 0) > 0) {
      end.setDate(end.getDate() + Number(plan.trialPeriodDays || 0));
    }
    const totalPrice = Number(plan.price || 0) + (plan.oneTimeFeeEnabled ? Number(plan.oneTimeFeeAmount || 0) : 0);
    const paid = amountPaid !== undefined ? Number(amountPaid) : totalPrice;
    const due = round2(Math.max(0, totalPrice - paid));
    const memberCode = `MEM-${Date.now().toString().slice(-8)}`;
    const discount = Number(
      bookingDiscountPercentage !== undefined ? bookingDiscountPercentage : plan.bookingDiscountPercentage || 0
    );
    const renewalDate = new Date(end);
    const gracePeriodUntil =
      Number(plan.gracePeriodDays || 0) > 0
        ? new Date(end.getTime() + Number(plan.gracePeriodDays || 0) * dayMs)
        : undefined;
    const persistedPhoto = await persistManagedImageValue({
      imageValue: String(profilePhotoUrl || '').trim(),
      tenantId: req.tenantId,
      directorySegments: ['memberships', 'profile-photos'],
      fileBaseName: String(fullName || memberName || 'member-photo'),
    });
    writtenPhotoStoragePath = persistedPhoto.wroteNewFile ? String(persistedPhoto.storagePath || '') : '';

    const subscription = await MemberSubscription.create({
      memberCode,
      memberName,
      fullName: fullName || memberName,
      phone: normalizedPhone,
      email: normalizeEmail(email),
      address,
      emergencyContact,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      profilePhotoUrl: persistedPhoto.url,
      profilePhotoStoragePath: persistedPhoto.storagePath || '',
      languagePreference: String(languagePreference || 'en').trim() || 'en',
      themePreference: String(themePreference || 'dark') === 'light' ? 'light' : 'dark',
      planId,
      startDate: start,
      endDate: end,
      renewalDate,
      autoRenewEnabled: false,
      gracePeriodUntil,
      amountPaid: paid,
      amountDue: due,
      totalVisits: 0,
      totalSpending: 0,
      rewardPointsBalance: 0,
      pointsEarnedTotal: 0,
      pointsRedeemedTotal: 0,
      pointsExpiredTotal: 0,
      bookingDiscountPercentage: Math.max(0, Math.min(100, discount)),
      validityReminderDays: Math.max(0, Number(validityReminderDays ?? 7)),
      status: 'active',
      sessionsUsed: 0,
      notes,
      planHistory: [
        {
          planId: plan._id,
          planName: plan.name,
          action: 'assigned',
          startDate: start,
          endDate: end,
          changedAt: new Date(),
          changedBy: req.userId,
          notes: durationOverride ? `Initial assignment (${durationOverride.label})` : 'Initial assignment',
        },
      ],
      createdBy: req.userId,
    });
    writtenPhotoStoragePath = '';

    await syncCustomerProfileFromSubscription(subscription, req.userId);
    await pushAudit(req, 'subscription_create', 'member_subscription', subscription._id.toString(), undefined, subscription.toObject(), {
      planId: plan._id.toString(),
      planName: plan.name,
    });

    res.status(201).json({ success: true, data: subscription, message: 'Subscription created' });
  } catch (error: any) {
    if (writtenPhotoStoragePath) {
      await removeManagedStoredFile(writtenPhotoStoragePath);
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to create subscription' });
  }
});

router.put('/subscriptions/:id/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  let writtenPhotoStoragePath = '';
  try {
    const subscriptionId = String(req.params.id || '');
    const before = await MemberSubscription.findById(subscriptionId);
    if (!before) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const updates = { ...req.body } as any;
    const previousStoragePath = resolveManagedStoragePath(before.profilePhotoUrl, before.profilePhotoStoragePath);
    if (updates.phone !== undefined) {
      updates.phone = normalizePhone(updates.phone);
      if (!updates.phone) {
        return res.status(400).json({ success: false, error: 'mobile number is required' });
      }
      const duplicateMember = await MemberSubscription.findOne({
        phone: updates.phone,
        _id: { $ne: before._id },
      }).select('_id memberName status');
      if (duplicateMember) {
        return res.status(409).json({
          success: false,
          error: `Mobile number already exists for member ${duplicateMember.memberName} (${String(duplicateMember.status || 'active').toUpperCase()})`,
        });
      }
    }
    if (updates.email !== undefined) updates.email = normalizeEmail(updates.email);
    if (updates.bookingDiscountPercentage !== undefined) {
      updates.bookingDiscountPercentage = Math.max(0, Math.min(100, Number(updates.bookingDiscountPercentage || 0)));
    }
    if (updates.validityReminderDays !== undefined) {
      updates.validityReminderDays = Math.max(0, Number(updates.validityReminderDays || 0));
    }
    if (updates.dateOfBirth !== undefined) {
      updates.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : undefined;
    }
    if (updates.themePreference !== undefined) {
      updates.themePreference = String(updates.themePreference) === 'light' ? 'light' : 'dark';
    }
    if (updates.languagePreference !== undefined) {
      updates.languagePreference = String(updates.languagePreference || 'en').trim() || 'en';
    }
    if (updates.profilePhotoUrl !== undefined) {
      const incomingPhotoValue = String(updates.profilePhotoUrl || '').trim();
      if (!incomingPhotoValue) {
        updates.profilePhotoUrl = '';
        updates.profilePhotoStoragePath = '';
      } else {
        const persistedPhoto = await persistManagedImageValue({
          imageValue: incomingPhotoValue,
          tenantId: req.tenantId,
          directorySegments: ['memberships', 'profile-photos'],
          fileBaseName: String(
            updates.fullName
            || updates.memberName
            || before.fullName
            || before.memberName
            || 'member-photo'
          ),
        });
        writtenPhotoStoragePath = persistedPhoto.wroteNewFile ? String(persistedPhoto.storagePath || '') : '';
        updates.profilePhotoUrl = persistedPhoto.url;
        updates.profilePhotoStoragePath = persistedPhoto.storagePath || '';
      }
    }

    const sub = await MemberSubscription.findByIdAndUpdate(subscriptionId, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).populate({
      path: 'planId',
      select: 'name tierName facilityType facilityIds billingCycle durationDays price sessionsLimit bookingDiscountPercentage',
      populate: { path: 'facilityIds', select: 'name location active' },
    });

    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    const nextStoragePath = resolveManagedStoragePath(sub.profilePhotoUrl, sub.profilePhotoStoragePath);
    if (previousStoragePath && previousStoragePath !== nextStoragePath) {
      await removeManagedStoredFile(previousStoragePath);
    }
    writtenPhotoStoragePath = '';
    await syncCustomerProfileFromSubscription(sub, req.userId);
    await pushAudit(req, 'subscription_profile_update', 'member_subscription', sub._id.toString(), before.toObject(), sub.toObject());
    res.json({ success: true, data: sub, message: 'Member profile updated' });
  } catch (error: any) {
    if (writtenPhotoStoragePath) {
      await removeManagedStoredFile(writtenPhotoStoragePath);
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to update member profile' });
  }
});

router.post('/subscriptions/:id/lifecycle', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, targetPlanId, days, notes } = req.body || {};
    const normalizedAction = String(action || '').toLowerCase();
    if (!['upgrade', 'downgrade', 'extend', 'cancel', 'suspend', 'pause', 'resume'].includes(normalizedAction)) {
      return res.status(400).json({ success: false, error: 'Invalid lifecycle action' });
    }

    const sub = await MemberSubscription.findById(req.params.id).populate('planId');
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    const before = sub.toObject();

    if (normalizedAction === 'upgrade' || normalizedAction === 'downgrade') {
      if (!targetPlanId) return res.status(400).json({ success: false, error: 'targetPlanId is required' });
      const nextPlan = await MembershipPlan.findById(targetPlanId);
      if (!nextPlan || !nextPlan.active || nextPlan.status === 'archived') {
        return res.status(400).json({ success: false, error: 'Target plan is not active' });
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + Number(nextPlan.durationDays || 30) * dayMs);
      sub.planId = nextPlan._id as any;
      sub.startDate = start;
      sub.endDate = end;
      sub.renewalDate = end;
      sub.bookingDiscountPercentage = Number(nextPlan.bookingDiscountPercentage || 0);
      sub.autoRenewEnabled = Boolean(nextPlan.autoRenew);
      sub.gracePeriodUntil =
        Number(nextPlan.gracePeriodDays || 0) > 0
          ? new Date(end.getTime() + Number(nextPlan.gracePeriodDays || 0) * dayMs)
          : undefined;
      sub.status = 'active';
      sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
      sub.planHistory.push({
        planId: nextPlan._id,
        planName: nextPlan.name,
        action: normalizedAction as any,
        startDate: start,
        endDate: end,
        changedAt: new Date(),
        changedBy: req.userId,
        notes: notes || '',
      });
    }

    if (normalizedAction === 'extend') {
      const extendDays = Math.max(1, Number(days || 0));
      const prevEnd = new Date(sub.endDate);
      const base = prevEnd.getTime() > Date.now() ? prevEnd : new Date();
      const nextEnd = new Date(base.getTime() + extendDays * dayMs);
      sub.endDate = nextEnd;
      sub.renewalDate = nextEnd;
      sub.status = 'active';
      sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
      sub.planHistory.push({
        planId: (sub.planId as any)?._id || (sub.planId as any),
        planName: String((sub.planId as any)?.name || 'Plan'),
        action: 'extended',
        startDate: sub.startDate,
        endDate: nextEnd,
        changedAt: new Date(),
        changedBy: req.userId,
        notes: notes || `Extended by ${extendDays} days`,
      });
    }

    if (normalizedAction === 'cancel') {
      sub.status = 'cancelled';
      sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
      sub.planHistory.push({
        planId: (sub.planId as any)?._id || (sub.planId as any),
        planName: String((sub.planId as any)?.name || 'Plan'),
        action: 'cancelled',
        changedAt: new Date(),
        changedBy: req.userId,
        notes: notes || '',
      });
    }

    if (normalizedAction === 'suspend') {
      sub.status = 'suspended';
      sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
      sub.planHistory.push({
        planId: (sub.planId as any)?._id || (sub.planId as any),
        planName: String((sub.planId as any)?.name || 'Plan'),
        action: 'suspended',
        changedAt: new Date(),
        changedBy: req.userId,
        notes: notes || '',
      });
    }

    if (normalizedAction === 'pause') {
      sub.status = 'frozen';
      sub.freezeFrom = new Date();
      sub.freezeReason = notes || 'Paused membership';
      sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
      sub.planHistory.push({
        planId: (sub.planId as any)?._id || (sub.planId as any),
        planName: String((sub.planId as any)?.name || 'Plan'),
        action: 'paused',
        changedAt: new Date(),
        changedBy: req.userId,
        notes: notes || '',
      });
    }

    if (normalizedAction === 'resume') {
      sub.status = 'active';
      sub.freezeFrom = undefined;
      sub.freezeTo = undefined;
      sub.freezeReason = undefined;
      sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
      sub.planHistory.push({
        planId: (sub.planId as any)?._id || (sub.planId as any),
        planName: String((sub.planId as any)?.name || 'Plan'),
        action: 'resumed',
        changedAt: new Date(),
        changedBy: req.userId,
        notes: notes || '',
      });
    }

    await sub.save();
    await pushAudit(req, `subscription_lifecycle_${normalizedAction}`, 'member_subscription', sub._id.toString(), before, sub.toObject(), {
      action: normalizedAction,
      targetPlanId,
      days,
    });

    res.json({ success: true, data: sub, message: `Lifecycle action ${normalizedAction} applied` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to apply lifecycle action' });
  }
});

router.post('/subscriptions/:id/renew', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { renewalType = 'manual', days, amountPaid = 0, notes, autoRenewEnabled } = req.body || {};
    const sub = await MemberSubscription.findById(req.params.id).populate('planId');
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    const plan: any = sub.planId as any;
    const baseDays = Number(plan?.durationDays || 30);
    const extendDays =
      String(renewalType) === 'partial'
        ? Math.max(1, Number(days || 0))
        : Math.max(1, Number(days || baseDays));

    const prevEnd = new Date(sub.endDate);
    const baseStart = prevEnd.getTime() > Date.now() ? prevEnd : new Date();
    const newEnd = new Date(baseStart.getTime() + extendDays * dayMs);
    sub.endDate = newEnd;
    sub.renewalDate = newEnd;
    sub.status = 'active';
    sub.autoRenewEnabled = autoRenewEnabled !== undefined ? Boolean(autoRenewEnabled) : sub.autoRenewEnabled;
    const graceDays = Number(plan?.gracePeriodDays || 0);
    sub.gracePeriodUntil = graceDays > 0 ? new Date(newEnd.getTime() + graceDays * dayMs) : undefined;
    sub.amountPaid = round2(Number(sub.amountPaid || 0) + Number(amountPaid || 0));
    sub.renewalHistory = Array.isArray(sub.renewalHistory) ? sub.renewalHistory : [];
    sub.renewalHistory.push({
      renewalDate: new Date(),
      renewalType: String(renewalType) as any,
      daysExtended: extendDays,
      amountPaid: round2(Number(amountPaid || 0)),
      previousEndDate: prevEnd,
      newEndDate: newEnd,
      notes: notes || '',
      createdBy: req.userId,
    });
    sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
    sub.planHistory.push({
      planId: plan?._id,
      planName: String(plan?.name || 'Plan'),
      action: String(renewalType) === 'partial' ? 'extended' : 'renewed',
      startDate: sub.startDate,
      endDate: newEnd,
      changedAt: new Date(),
      changedBy: req.userId,
      notes: notes || '',
    });
    await sub.save();

    await pushAudit(req, 'subscription_renew', 'member_subscription', sub._id.toString(), undefined, sub.toObject(), {
      renewalType,
      daysExtended: extendDays,
      amountPaid: Number(amountPaid || 0),
    });

    res.json({ success: true, data: sub, message: 'Membership renewed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to renew membership' });
  }
});

router.post('/subscriptions/:id/points', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, points, amount = 0, reference = '', notes = '' } = req.body || {};
    const normalizedAction = String(action || '').toLowerCase();
    const value = Math.abs(Number(points || 0));
    if (!['earned', 'redeemed', 'expired', 'adjusted'].includes(normalizedAction)) {
      return res.status(400).json({ success: false, error: 'Invalid points action' });
    }
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ success: false, error: 'points must be greater than zero' });
    }

    const sub = await MemberSubscription.findById(req.params.id).populate('planId');
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    const before = sub.toObject();
    const plan: any = sub.planId as any;

    const currentBalance = Number(sub.rewardPointsBalance || 0);
    const minRedeem = Number(plan?.minimumRedeemPoints || 0);

    if (normalizedAction === 'redeemed') {
      if (value > currentBalance) return res.status(400).json({ success: false, error: 'Insufficient points balance' });
      if (minRedeem > 0 && value < minRedeem) {
        return res.status(400).json({ success: false, error: `Minimum redeem points is ${minRedeem}` });
      }
      sub.rewardPointsBalance = currentBalance - value;
      sub.pointsRedeemedTotal = Number(sub.pointsRedeemedTotal || 0) + value;
    } else if (normalizedAction === 'expired') {
      sub.rewardPointsBalance = Math.max(0, currentBalance - value);
      sub.pointsExpiredTotal = Number(sub.pointsExpiredTotal || 0) + value;
    } else {
      sub.rewardPointsBalance = currentBalance + value;
      sub.pointsEarnedTotal = Number(sub.pointsEarnedTotal || 0) + value;
    }

    sub.rewardTransactions = Array.isArray(sub.rewardTransactions) ? sub.rewardTransactions : [];
    sub.rewardTransactions.push({
      type: normalizedAction as any,
      points: normalizedAction === 'redeemed' || normalizedAction === 'expired' ? -value : value,
      amount: Number(amount || 0),
      reference: String(reference || ''),
      notes: String(notes || ''),
      createdAt: new Date(),
      createdBy: req.userId,
    });

    await sub.save();
    await pushAudit(req, 'subscription_points_update', 'member_subscription', sub._id.toString(), before, sub.toObject(), {
      action: normalizedAction,
      points: value,
    });

    res.json({
      success: true,
      data: {
        rewardPointsBalance: Number(sub.rewardPointsBalance || 0),
        pointsEarnedTotal: Number(sub.pointsEarnedTotal || 0),
        pointsRedeemedTotal: Number(sub.pointsRedeemedTotal || 0),
        pointsExpiredTotal: Number(sub.pointsExpiredTotal || 0),
      },
      message: 'Points updated',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update points' });
  }
});

router.get('/subscriptions/:id/points-history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sub = await MemberSubscription.findById(req.params.id).select('rewardPointsBalance pointsEarnedTotal pointsRedeemedTotal pointsExpiredTotal rewardTransactions');
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    const rows = Array.isArray((sub as any).rewardTransactions) ? (sub as any).rewardTransactions.slice().reverse() : [];
    res.json({
      success: true,
      data: {
        balance: Number((sub as any).rewardPointsBalance || 0),
        earned: Number((sub as any).pointsEarnedTotal || 0),
        redeemed: Number((sub as any).pointsRedeemedTotal || 0),
        expired: Number((sub as any).pointsExpiredTotal || 0),
        rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch points history' });
  }
});

router.get('/subscriptions/:id/reminders/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const sub = await MemberSubscription.findById(req.params.id).select('memberName reminderHistory');
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const rows = Array.isArray((sub as any).reminderHistory)
      ? (sub as any).reminderHistory.slice().reverse().slice(0, limit)
      : [];

    res.json({
      success: true,
      data: {
        memberId: sub._id,
        memberName: (sub as any).memberName || '',
        rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch reminder history' });
  }
});

router.post('/subscriptions/:id/reminders/send', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channelsInput = Array.isArray(req.body?.channels) ? req.body.channels : ['sms', 'email'];
    const channels = channelsInput
      .map((channel: any) => String(channel || '').toLowerCase())
      .filter((channel: string) => reminderChannels.includes(channel as ReminderChannel)) as ReminderChannel[];
    if (!channels.length) {
      return res.status(400).json({ success: false, error: 'At least one valid channel is required' });
    }

    const sub = await MemberSubscription.findById(req.params.id).populate('planId');
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const now = new Date();
    const inputType = String(req.body?.reminderType || '').toLowerCase();
    const computed = computeReminderType(sub, now);
    const reminderType: ReminderType = (['d7', 'd3', 'expiry', 'grace'].includes(inputType) ? inputType : computed || 'd3') as ReminderType;
    const dryRun = parseBoolean(req.body?.dryRun, false);
    const confirmSend = parseBoolean(req.body?.confirmSend, false);
    const preview = buildReminderPreview({
      subscription: sub,
      channels,
      reminderType,
      now,
    });

    if (dryRun) {
      return res.json({
        success: true,
        data: {
          preview,
          requiresConfirmation: channels.includes('email'),
        },
        message: 'Reminder preview prepared',
      });
    }

    if (channels.includes('email') && !confirmSend) {
      return res.status(400).json({
        success: false,
        error: 'Preview and confirm email reminder before sending.',
        data: { preview, requiresConfirmation: true },
      });
    }

    const result = await sendReminderForSubscription({
      req,
      subscription: sub,
      channels,
      reminderType,
      source: 'manual',
    });

    res.json({
      success: true,
      data: result,
      message: 'Reminder dispatched',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to send reminder' });
  }
});

router.get('/subscriptions/expiry-alerts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query.days || 15)));
    const now = new Date();
    const until = new Date(now.getTime() + days * dayMs);

    const expiring = await MemberSubscription.find({
      status: { $in: ['active', 'frozen', 'suspended'] },
      endDate: { $gte: now, $lte: until },
    })
      .populate('planId', 'name billingCycle gracePeriodDays autoRenew')
      .sort({ endDate: 1 })
      .limit(300);

    const expired = await MemberSubscription.find({
      status: { $in: ['active', 'frozen', 'suspended'] },
      endDate: { $lt: now },
    }).populate('planId', 'name gracePeriodDays');

    if (expired.length > 0) {
      const hardExpired = expired.filter((item: any) => {
        const graceUntil = item.gracePeriodUntil ? new Date(item.gracePeriodUntil) : null;
        return !graceUntil || graceUntil.getTime() < now.getTime();
      });
      if (hardExpired.length > 0) {
        await MemberSubscription.updateMany(
          { _id: { $in: hardExpired.map((item: any) => item._id) } },
          { $set: { status: 'expired' } }
        );
      }
    }

    const alertRows = expiring.map((item: any) => {
      const reminderType = computeReminderType(item, now);
      return {
        ...item.toObject(),
        reminderType: reminderType || undefined,
      };
    });

    res.json({
      success: true,
      data: {
        expiring: alertRows,
        expiringIn7Days: alertRows.filter((row: any) => {
          const diff = Math.ceil((new Date(row.endDate).getTime() - now.getTime()) / dayMs);
          return diff >= 0 && diff <= 7;
        }),
        expiredCount: expired.length,
        days,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch expiry alerts' });
  }
});

router.post('/reminders/process-renewals', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const days = Math.max(1, Math.min(90, Number(req.body?.days ?? req.query.days ?? 15)));
    const dryRun = parseBoolean(req.body?.dryRun ?? req.query.dryRun, false);
    const confirmSend = parseBoolean(req.body?.confirmSend ?? req.query.confirmSend, false);
    const channelsInput = Array.isArray(req.body?.channels) ? req.body.channels : ['sms', 'email'];
    const channels = channelsInput
      .map((channel: any) => String(channel || '').toLowerCase())
      .filter((channel: string) => reminderChannels.includes(channel as ReminderChannel)) as ReminderChannel[];
    if (!channels.length) {
      return res.status(400).json({ success: false, error: 'At least one valid channel is required' });
    }
    if (channels.includes('email') && !dryRun && !confirmSend) {
      return res.status(400).json({
        success: false,
        error: 'Preview and confirm email reminder batch before sending.',
      });
    }

    const now = new Date();
    const until = new Date(now.getTime() + days * dayMs);
    const subscriptions = await MemberSubscription.find({
      status: { $in: ['active', 'frozen', 'suspended'] },
      endDate: { $lte: until },
    }).populate('planId');

    const sent: any[] = [];
    const skipped: any[] = [];
    const failed: any[] = [];

    for (const sub of subscriptions as any[]) {
      const reminderType = computeReminderType(sub, now);
      if (!reminderType) {
        skipped.push({
          memberId: sub._id.toString(),
          memberName: sub.memberName,
          reason: 'No reminder window matched today',
        });
        continue;
      }

      const existingRows = Array.isArray(sub.reminderHistory) ? sub.reminderHistory : [];
      const wasSentToday = existingRows.some((row: any) => {
        if (String(row?.reminderType || '') !== reminderType) return false;
        if (!channels.includes(String(row?.channel || '') as ReminderChannel)) return false;
        const sentAt = row?.sentAt ? new Date(row.sentAt) : null;
        if (!sentAt) return false;
        return (
          sentAt.getFullYear() === now.getFullYear()
          && sentAt.getMonth() === now.getMonth()
          && sentAt.getDate() === now.getDate()
        );
      });
      if (wasSentToday) {
        skipped.push({
          memberId: sub._id.toString(),
          memberName: sub.memberName,
          reason: 'Already sent today',
          reminderType,
        });
        continue;
      }

      if (dryRun) {
        const preview = buildReminderPreview({
          subscription: sub,
          channels,
          reminderType,
          now,
        });
        sent.push({
          memberId: sub._id.toString(),
          memberName: sub.memberName,
          reminderType,
          channels,
          status: 'dry_run',
          email: preview.email,
          phone: preview.phone,
          subject: preview.subject,
          message: preview.message,
        });
        continue;
      }

      const result = await sendReminderForSubscription({
        req,
        subscription: sub,
        channels,
        reminderType,
        source: 'automation',
      });

      const allFailed = result.results.every((row) => row.status === 'failed');
      if (allFailed) failed.push(result);
      else sent.push(result);
    }

    await pushAudit(req, 'renewal_reminder_batch_process', 'member_subscription', 'batch', undefined, undefined, {
      days,
      dryRun,
      channels,
      candidates: subscriptions.length,
      sent: sent.length,
      failed: failed.length,
      skipped: skipped.length,
    });

    res.json({
      success: true,
      data: {
        days,
        dryRun,
        channels,
        candidates: subscriptions.length,
        sentCount: sent.length,
        failedCount: failed.length,
        skippedCount: skipped.length,
        sent,
        failed,
        skipped,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to process renewal reminders' });
  }
});

const lifecycleSyncHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const now = new Date();
    const candidates = await MemberSubscription.find({
      status: { $in: ['active', 'frozen', 'suspended'] },
    }).populate('planId');

    let autoRenewed = 0;
    let expired = 0;
    let resumed = 0;
    let unchanged = 0;

    for (const sub of candidates as any[]) {
      const before = sub.toObject();
      const plan: any = sub.planId as any;
      let changed = false;

      if (sub.status === 'frozen' && sub.freezeTo && new Date(sub.freezeTo).getTime() <= now.getTime()) {
        sub.status = 'active';
        sub.freezeFrom = undefined;
        sub.freezeTo = undefined;
        sub.freezeReason = undefined;
        sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
        sub.planHistory.push({
          planId: plan?._id,
          planName: String(plan?.name || 'Plan'),
          action: 'resumed',
          changedAt: now,
          changedBy: req.userId,
          notes: 'Auto resumed after freeze period',
        });
        resumed += 1;
        changed = true;
      }

      if (sub.status === 'active') {
        const endDate = new Date(sub.endDate);
        const graceUntil = sub.gracePeriodUntil ? new Date(sub.gracePeriodUntil) : null;
        if (endDate.getTime() < now.getTime()) {
          const canAutoRenew = Boolean(sub.autoRenewEnabled) || Boolean(plan?.autoRenew);
          if (canAutoRenew && plan && Number(plan.durationDays || 0) > 0) {
            const extendDays = Math.max(1, Number(plan.durationDays || 30));
            const nextEnd = new Date(now.getTime() + extendDays * dayMs);
            sub.endDate = nextEnd;
            sub.renewalDate = nextEnd;
            sub.status = 'active';
            const graceDays = Number(plan?.gracePeriodDays || 0);
            sub.gracePeriodUntil = graceDays > 0 ? new Date(nextEnd.getTime() + graceDays * dayMs) : undefined;
            sub.renewalHistory = Array.isArray(sub.renewalHistory) ? sub.renewalHistory : [];
            sub.renewalHistory.push({
              renewalDate: now,
              renewalType: 'auto',
              daysExtended: extendDays,
              amountPaid: 0,
              previousEndDate: endDate,
              newEndDate: nextEnd,
              notes: 'Automatic renewal by lifecycle sync',
              createdBy: req.userId,
            });
            sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
            sub.planHistory.push({
              planId: plan?._id,
              planName: String(plan?.name || 'Plan'),
              action: 'renewed',
              startDate: sub.startDate,
              endDate: nextEnd,
              changedAt: now,
              changedBy: req.userId,
              notes: 'Auto-renewed by lifecycle sync',
            });
            autoRenewed += 1;
            changed = true;
          } else {
            if (!graceUntil || graceUntil.getTime() < now.getTime()) {
              sub.status = 'expired';
              sub.planHistory = Array.isArray(sub.planHistory) ? sub.planHistory : [];
              sub.planHistory.push({
                planId: plan?._id,
                planName: String(plan?.name || 'Plan'),
                action: 'cancelled',
                changedAt: now,
                changedBy: req.userId,
                notes: 'Auto-expired by lifecycle sync',
              });
              expired += 1;
              changed = true;
            }
          }
        }
      }

      if (changed) {
        await sub.save();
        await pushAudit(req, 'subscription_lifecycle_sync', 'member_subscription', sub._id.toString(), before, sub.toObject());
      } else {
        unchanged += 1;
      }
    }

    res.json({
      success: true,
      data: {
        totalCandidates: candidates.length,
        autoRenewed,
        expired,
        resumed,
        unchanged,
      },
      message: 'Membership lifecycle sync completed',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to run lifecycle sync' });
  }
};

router.post('/lifecycle/sync', authMiddleware, lifecycleSyncHandler);
router.post('/lifecyle/sync', authMiddleware, lifecycleSyncHandler);

router.get('/dashboard/reminders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const until = new Date(now.getTime() + 7 * dayMs);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [expiring7, expiredCount, renewedMonthRows] = await Promise.all([
      MemberSubscription.find({
        status: { $in: ['active', 'frozen', 'suspended'] },
        endDate: { $gte: now, $lte: until },
      })
        .populate('planId', 'name')
        .sort({ endDate: 1 })
        .limit(200),
      MemberSubscription.countDocuments({ status: 'expired' }),
      MemberSubscription.find({
        'renewalHistory.renewalDate': { $gte: startMonth, $lte: now },
      }).select('memberName phone renewalHistory'),
    ]);

    let renewedThisMonth = 0;
    let renewalRevenue = 0;
    renewedMonthRows.forEach((row: any) => {
      const rows = Array.isArray(row.renewalHistory) ? row.renewalHistory : [];
      rows.forEach((entry: any) => {
        const dt = entry?.renewalDate ? new Date(entry.renewalDate) : null;
        if (dt && dt.getTime() >= startMonth.getTime() && dt.getTime() <= now.getTime()) {
          renewedThisMonth += 1;
          renewalRevenue += Number(entry.amountPaid || 0);
        }
      });
    });

    const warningRows = expiring7.map((row: any) => {
      const reminderType = computeReminderType(row, now);
      const rows = Array.isArray(row.reminderHistory) ? row.reminderHistory : [];
      const emailSentToday = rows.some((history: any) => {
        if (String(history?.channel || '') !== 'email') return false;
        const sentAt = history?.sentAt ? new Date(history.sentAt) : null;
        if (!sentAt) return false;
        return (
          sentAt.getFullYear() === now.getFullYear()
          && sentAt.getMonth() === now.getMonth()
          && sentAt.getDate() === now.getDate()
        );
      });
      return {
        memberId: row._id.toString(),
        memberName: row.memberName,
        memberCode: row.memberCode || '',
        email: normalizeEmail(row.email),
        phone: normalizePhone(row.phone),
        endDate: row.endDate,
        planName: String((row.planId as any)?.name || ''),
        reminderType,
        emailReady: Boolean(normalizeEmail(row.email)),
        emailSentToday,
      };
    });
    const emailWarningDue = warningRows.filter((row) => row.emailReady && !row.emailSentToday).length;
    const missingEmailWarningCount = warningRows.filter((row) => !row.emailReady).length;

    res.json({
      success: true,
      data: {
        membersExpiringIn7Days: expiring7,
        warningRows,
        expiringCount: expiring7.length,
        emailWarningDue,
        missingEmailWarningCount,
        expiredCount,
        renewedThisMonth,
        renewalRevenue: round2(renewalRevenue),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch reminder dashboard' });
  }
});

router.get('/reports/summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeMembers, expiredMembers, totalRevenueAgg, planWiseRows, allSubs] = await Promise.all([
      MemberSubscription.countDocuments({ status: 'active' }),
      MemberSubscription.countDocuments({ status: 'expired' }),
      MemberSubscription.aggregate([{ $group: { _id: null, total: { $sum: '$amountPaid' } } }]),
      MemberSubscription.aggregate([
        { $group: { _id: '$planId', totalMembers: { $sum: 1 }, activeMembers: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
        { $sort: { totalMembers: -1 } },
      ]),
      MemberSubscription.find({}).select('planId status renewalHistory'),
    ]);

    let renewedThisMonth = 0;
    let renewalRevenue = 0;
    let retentionEligible = 0;
    let retainedMembers = 0;

    allSubs.forEach((sub: any) => {
      const renewals = Array.isArray(sub.renewalHistory) ? sub.renewalHistory : [];
      if (renewals.length > 0) retainedMembers += 1;
      retentionEligible += 1;
      renewals.forEach((entry: any) => {
        const dt = entry?.renewalDate ? new Date(entry.renewalDate) : null;
        if (dt && dt.getTime() >= startMonth.getTime() && dt.getTime() <= now.getTime()) {
          renewedThisMonth += 1;
          renewalRevenue += Number(entry.amountPaid || 0);
        }
      });
    });

    const renewalRate = activeMembers > 0 ? (renewedThisMonth / activeMembers) * 100 : 0;
    const retentionRate = retentionEligible > 0 ? (retainedMembers / retentionEligible) * 100 : 0;

    const planIds = planWiseRows.map((row: any) => row._id).filter(Boolean);
    const plans = await MembershipPlan.find({ _id: { $in: planIds } }).select('name');
    const planMap = new Map(plans.map((p: any) => [String(p._id), p.name]));
    const planWiseBreakdown = planWiseRows.map((row: any) => ({
      planId: row._id,
      planName: planMap.get(String(row._id)) || 'Unknown Plan',
      totalMembers: Number(row.totalMembers || 0),
      activeMembers: Number(row.activeMembers || 0),
    }));

    const mostPopularPlan = planWiseBreakdown[0] || null;

    res.json({
      success: true,
      data: {
        activeMembersCount: activeMembers,
        expiredMembersCount: expiredMembers,
        revenueFromMemberships: round2(Number(totalRevenueAgg?.[0]?.total || 0)),
        renewalRate: round2(renewalRate),
        planWiseSubscriptionBreakdown: planWiseBreakdown,
        mostPopularPlan,
        memberRetentionRate: round2(retentionRate),
        renewedThisMonth,
        renewalRevenue: round2(renewalRevenue),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch membership reports' });
  }
});

router.get('/reports/lifecycle', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const now = new Date();
    const d7 = new Date(now.getTime() + 7 * dayMs);
    const d30 = new Date(now.getTime() + 30 * dayMs);

    const [byStatusRows, expiring7, expiring30, inGrace] = await Promise.all([
      MemberSubscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      MemberSubscription.countDocuments({
        status: { $in: ['active', 'frozen', 'suspended'] },
        endDate: { $gte: now, $lte: d7 },
      }),
      MemberSubscription.countDocuments({
        status: { $in: ['active', 'frozen', 'suspended'] },
        endDate: { $gte: now, $lte: d30 },
      }),
      MemberSubscription.countDocuments({
        status: { $in: ['active', 'frozen', 'suspended'] },
        endDate: { $lt: now },
        gracePeriodUntil: { $gte: now },
      }),
    ]);

    const byStatus = byStatusRows.reduce((acc: Record<string, number>, row: any) => {
      acc[String(row._id || 'unknown')] = Number(row.count || 0);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        byStatus,
        expiringIn7Days: expiring7,
        expiringIn30Days: expiring30,
        currentlyInGracePeriod: inGrace,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch lifecycle analytics' });
  }
});

router.get('/reports/renewal-trends', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const months = Math.max(1, Math.min(24, Number(req.query.months || 12)));
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - (months - 1));

    const rows = await MemberSubscription.aggregate([
      { $unwind: '$renewalHistory' },
      { $match: { 'renewalHistory.renewalDate': { $gte: start } } },
      {
        $group: {
          _id: {
            year: { $year: '$renewalHistory.renewalDate' },
            month: { $month: '$renewalHistory.renewalDate' },
            renewalType: '$renewalHistory.renewalType',
          },
          renewals: { $sum: 1 },
          revenue: { $sum: '$renewalHistory.amountPaid' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthlyMap = new Map<string, any>();
    for (const row of rows as any[]) {
      const ym = `${row._id.year}-${String(row._id.month).padStart(2, '0')}`;
      if (!monthlyMap.has(ym)) {
        monthlyMap.set(ym, {
          month: ym,
          totalRenewals: 0,
          totalRevenue: 0,
          byType: {},
        });
      }
      const item = monthlyMap.get(ym);
      const type = String(row._id.renewalType || 'manual');
      item.totalRenewals += Number(row.renewals || 0);
      item.totalRevenue = round2(item.totalRevenue + Number(row.revenue || 0));
      item.byType[type] = {
        renewals: Number(row.renewals || 0),
        revenue: round2(Number(row.revenue || 0)),
      };
    }

    const trend = Array.from(monthlyMap.values());
    res.json({ success: true, data: trend });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch renewal trends' });
  }
});

router.get('/reports/reminder-channels', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const days = Math.max(1, Math.min(180, Number(req.query.days || 30)));
    const since = new Date(Date.now() - (days * dayMs));

    const rows = await MemberSubscription.aggregate([
      { $unwind: '$reminderHistory' },
      {
        $match: {
          $or: [
            { 'reminderHistory.sentAt': { $gte: since } },
            { 'reminderHistory.scheduledFor': { $gte: since } },
          ],
        },
      },
      {
        $group: {
          _id: {
            channel: '$reminderHistory.channel',
            status: '$reminderHistory.status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.channel': 1, '_id.status': 1 } },
    ]);

    const byChannel: Record<string, { sent: number; failed: number; pending: number; skipped: number; total: number }> = {};
    for (const row of rows as any[]) {
      const channel = String(row._id.channel || 'unknown');
      const status = String(row._id.status || 'pending');
      if (!byChannel[channel]) {
        byChannel[channel] = { sent: 0, failed: 0, pending: 0, skipped: 0, total: 0 };
      }
      const value = Number(row.count || 0);
      byChannel[channel].total += value;
      if (status in byChannel[channel]) {
        (byChannel[channel] as any)[status] += value;
      }
    }

    res.json({
      success: true,
      data: {
        daysWindow: days,
        byChannel,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch reminder channel analytics' });
  }
});

router.get('/reports/benefits-analytics', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUser = await requireMembershipAdmin(req, res);
    if (!adminUser) return;

    const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - (days * dayMs));

    const rows = await AuditLog.find({
      module: 'memberships',
      action: 'pos_membership_benefits_committed',
      createdAt: { $gte: since },
    }).select('entityId metadata createdAt');

    const summary = rows.reduce(
      (acc, row: any) => {
        acc.count += 1;
        acc.totalGross += Number(row?.metadata?.cartTotal || 0);
        acc.totalDiscount += Number(row?.metadata?.discountAmount || 0);
        acc.totalRedeemValue += Number(row?.metadata?.redeemValue || 0);
        acc.totalSavings += Number(row?.metadata?.discountAmount || 0) + Number(row?.metadata?.redeemValue || 0);
        acc.totalEarnedPoints += Number(row?.metadata?.earnedPoints || 0);
        return acc;
      },
      { count: 0, totalGross: 0, totalDiscount: 0, totalRedeemValue: 0, totalSavings: 0, totalEarnedPoints: 0 }
    );

    const byMember = new Map<string, { memberId: string; usageCount: number; savings: number; gross: number }>();
    for (const row of rows as any[]) {
      const memberId = String(row.entityId || '');
      if (!memberId) continue;
      const savings = Number(row?.metadata?.discountAmount || 0) + Number(row?.metadata?.redeemValue || 0);
      const gross = Number(row?.metadata?.cartTotal || 0);
      if (!byMember.has(memberId)) {
        byMember.set(memberId, { memberId, usageCount: 0, savings: 0, gross: 0 });
      }
      const item = byMember.get(memberId)!;
      item.usageCount += 1;
      item.savings = round2(item.savings + savings);
      item.gross = round2(item.gross + gross);
    }

    const topMembers = Array.from(byMember.values())
      .sort((a, b) => b.savings - a.savings || b.usageCount - a.usageCount)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        daysWindow: days,
        summary: {
          usageCount: summary.count,
          totalGross: round2(summary.totalGross),
          totalDiscount: round2(summary.totalDiscount),
          totalRedeemValue: round2(summary.totalRedeemValue),
          totalSavings: round2(summary.totalSavings),
          totalEarnedPoints: round2(summary.totalEarnedPoints),
        },
        topMembers,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch benefits analytics' });
  }
});

router.get('/pos/member/:mobile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mobile = normalizePhone(req.params.mobile);
    if (!mobile) return res.status(400).json({ success: false, error: 'Valid mobile number is required' });

    const subscription = await MemberSubscription.findOne({ phone: mobile })
      .populate('planId')
      .sort({ endDate: -1, createdAt: -1 });
    if (!subscription) return res.status(404).json({ success: false, error: 'Member not found' });

    const validity = isSubActiveForBilling(subscription);
    const plan: any = subscription.planId as any;
    const now = new Date();
    const daysToExpiry = Math.floor((new Date(subscription.endDate).getTime() - now.getTime()) / dayMs);

    res.json({
      success: true,
      data: {
        memberId: subscription._id,
        memberCode: subscription.memberCode,
        memberName: subscription.memberName,
        mobile: subscription.phone,
        status: subscription.status,
        validForBilling: validity.ok,
        invalidReason: validity.reason || '',
        planName: plan?.name || '',
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        renewalDate: subscription.renewalDate,
        bookingDiscountPercentage: Number(subscription.bookingDiscountPercentage || plan?.bookingDiscountPercentage || 0),
        flatDiscountAmount: Number(plan?.flatDiscountAmount || 0),
        rewardPointsBalance: Number(subscription.rewardPointsBalance || 0),
        rewardPointsMultiplier: Number(plan?.rewardPointsMultiplier || 1),
        pointsRedemptionValue: Number(plan?.pointsRedemptionValue || 0),
        minimumRedeemPoints: Number(plan?.minimumRedeemPoints || 0),
        alert:
          daysToExpiry <= 7
            ? `Membership expires in ${Math.max(daysToExpiry, 0)} day(s)`
            : '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to lookup member for POS' });
  }
});

router.post('/pos/apply-benefits', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mobile, cartTotal, redeemPoints = 0, commit = false, reference = '' } = req.body || {};
    const normalizedMobile = normalizePhone(mobile);
    const gross = Math.max(0, Number(cartTotal || 0));
    if (!normalizedMobile) return res.status(400).json({ success: false, error: 'mobile is required' });
    if (!Number.isFinite(gross) || gross < 0) return res.status(400).json({ success: false, error: 'cartTotal must be a valid number' });

    const subscription = await MemberSubscription.findOne({ phone: normalizedMobile })
      .populate('planId')
      .sort({ endDate: -1, createdAt: -1 });
    if (!subscription) return res.status(404).json({ success: false, error: 'Member not found' });

    const validity = isSubActiveForBilling(subscription);
    if (!validity.ok) return res.status(400).json({ success: false, error: validity.reason || 'Membership invalid' });

    const plan: any = subscription.planId as any;
    const percentage = Math.max(0, Number(subscription.bookingDiscountPercentage || plan?.bookingDiscountPercentage || 0));
    const flat = Math.max(0, Number(plan?.flatDiscountAmount || 0));
    const percentAmount = round2((gross * Math.min(percentage, 100)) / 100);

    const cap = Math.max(0, Number(plan?.maxDiscountPerCycle || 0));
    let discountAmount = round2(percentAmount + flat);
    if (cap > 0) discountAmount = Math.min(discountAmount, cap);
    discountAmount = Math.min(discountAmount, gross);

    let payableAfterDiscount = round2(Math.max(0, gross - discountAmount));
    const requestedRedeem = Math.max(0, Number(redeemPoints || 0));
    const pointsBalance = Math.max(0, Number(subscription.rewardPointsBalance || 0));
    const minRedeem = Math.max(0, Number(plan?.minimumRedeemPoints || 0));
    const redeemablePoints = Math.min(pointsBalance, requestedRedeem);
    const redeemRate = Math.max(0, Number(plan?.pointsRedemptionValue || 0));
    let redeemValue = 0;
    if (redeemablePoints >= minRedeem && redeemRate > 0) {
      redeemValue = round2((redeemablePoints / 100) * redeemRate);
      redeemValue = Math.min(redeemValue, payableAfterDiscount);
    }
    const finalPayable = round2(Math.max(0, payableAfterDiscount - redeemValue));

    const pointsPerCurrency = Math.max(0, Number(plan?.pointsPerCurrency || 0));
    const pointsMultiplier = Math.max(0, Number(plan?.rewardPointsMultiplier || 1));
    const earnedPointsRaw = Math.floor(finalPayable * pointsPerCurrency * pointsMultiplier);
    const pointsLimit = Math.max(0, Number(plan?.pointsEarningLimit || 0));
    const earnedPoints = pointsLimit > 0 ? Math.min(earnedPointsRaw, pointsLimit) : earnedPointsRaw;

    if (Boolean(commit)) {
      if (redeemValue > 0 && redeemablePoints > 0) {
        subscription.rewardPointsBalance = Math.max(0, pointsBalance - redeemablePoints);
        subscription.pointsRedeemedTotal = Number(subscription.pointsRedeemedTotal || 0) + redeemablePoints;
        subscription.rewardTransactions = Array.isArray(subscription.rewardTransactions) ? subscription.rewardTransactions : [];
        subscription.rewardTransactions.push({
          type: 'redeemed',
          points: -redeemablePoints,
          amount: redeemValue,
          reference: String(reference || 'POS-BILL'),
          notes: 'POS redemption',
          createdAt: new Date(),
          createdBy: req.userId,
        });
      }
      if (earnedPoints > 0) {
        subscription.rewardPointsBalance = Number(subscription.rewardPointsBalance || 0) + earnedPoints;
        subscription.pointsEarnedTotal = Number(subscription.pointsEarnedTotal || 0) + earnedPoints;
        subscription.totalSpending = Number(subscription.totalSpending || 0) + finalPayable;
        subscription.rewardTransactions = Array.isArray(subscription.rewardTransactions) ? subscription.rewardTransactions : [];
        subscription.rewardTransactions.push({
          type: 'earned',
          points: earnedPoints,
          amount: finalPayable,
          reference: String(reference || 'POS-BILL'),
          notes: 'POS earned points',
          createdAt: new Date(),
          createdBy: req.userId,
        });
      }
      await subscription.save();
      await pushAudit(req, 'pos_membership_benefits_committed', 'member_subscription', subscription._id.toString(), undefined, subscription.toObject(), {
        cartTotal: gross,
        discountAmount,
        redeemPoints: redeemablePoints,
        redeemValue,
        earnedPoints,
        finalPayable,
      });
    }

    res.json({
      success: true,
      data: {
        memberId: subscription._id,
        memberName: subscription.memberName,
        planName: plan?.name || '',
        grossTotal: gross,
        discountAmount,
        discountPercentage: percentage,
        redeemPoints: redeemValue > 0 ? redeemablePoints : 0,
        redeemValue: round2(redeemValue),
        finalPayable,
        earnedPoints,
        rewardPointsBalance:
          Boolean(commit)
            ? Number(subscription.rewardPointsBalance || 0)
            : Number(subscription.rewardPointsBalance || 0) - (redeemValue > 0 ? redeemablePoints : 0) + earnedPoints,
        savings: round2(discountAmount + redeemValue),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to apply membership benefits' });
  }
});

router.post('/subscriptions/:id/consume-session', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subscription = await MemberSubscription.findById(req.params.id).populate('planId');
    if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const validity = isSubActiveForBilling(subscription);
    if (!validity.ok) {
      if (String(validity.reason || '').includes('expired')) {
        subscription.status = 'expired';
        await subscription.save();
      }
      return res.status(400).json({ success: false, error: validity.reason || 'Subscription invalid' });
    }

    const plan: any = subscription.planId as any;
    const sessionsLimit = Number(plan?.sessionsLimit || 0);
    const visitLimit = Number(plan?.memberVisitLimit || 0);

    if (sessionsLimit > 0 && subscription.sessionsUsed >= sessionsLimit) {
      return res.status(400).json({ success: false, error: 'No sessions left' });
    }
    if (visitLimit > 0 && Number(subscription.totalVisits || 0) >= visitLimit) {
      return res.status(400).json({ success: false, error: 'Visit limit reached for this cycle' });
    }

    subscription.sessionsUsed += 1;
    subscription.totalVisits = Number(subscription.totalVisits || 0) + 1;
    await subscription.save();

    await pushAudit(req, 'subscription_session_consumed', 'member_subscription', subscription._id.toString(), undefined, subscription.toObject(), {
      sessionsUsed: subscription.sessionsUsed,
      totalVisits: subscription.totalVisits,
    });

    res.json({ success: true, data: subscription, message: 'Session consumed' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to consume session' });
  }
});

router.put('/subscriptions/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, freezeFrom, freezeTo, freezeReason } = req.body;
    if (!['active', 'expired', 'cancelled', 'frozen', 'suspended'].includes(String(status || ''))) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const current = await MemberSubscription.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Subscription not found' });
    const updates: any = { status };
    if (status === 'frozen') {
      updates.freezeFrom = freezeFrom ? new Date(freezeFrom) : new Date();
      updates.freezeTo = freezeTo ? new Date(freezeTo) : undefined;
      updates.freezeReason = freezeReason ? String(freezeReason) : undefined;
    }
    if (status !== 'frozen') {
      updates.freezeFrom = undefined;
      updates.freezeTo = undefined;
      updates.freezeReason = undefined;
    }

    const sub = await MemberSubscription.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).populate('planId', 'name');

    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    await pushAudit(req, 'subscription_status_update', 'member_subscription', sub._id.toString(), current.toObject(), sub.toObject(), {
      status,
    });

    res.json({ success: true, data: sub, message: 'Subscription status updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update subscription status' });
  }
});

export default router;
