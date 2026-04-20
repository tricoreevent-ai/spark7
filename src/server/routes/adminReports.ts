import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { AppSetting } from '../models/AppSetting.js';
import { AuditFlag } from '../models/AuditFlag.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { deriveStoreScope, describeIpAddress, normalizeIpAddress, writeAuditLog } from '../services/audit.js';
import { loadTenantGeneralSettings } from '../services/generalSettings.js';
import { isValidEmailAddress, sendConfiguredMail, uniqueRecipients } from '../services/mail.js';
import { writeAuditFlag } from '../services/auditFlag.js';

const router = Router();

const ADMIN_REPORT_SETTINGS_KEY = 'admin_report_settings';
const DEFAULT_WARNING_ROW_LIMIT = 5000;
const MIN_WARNING_ROW_LIMIT = 500;
const MAX_WARNING_ROW_LIMIT = 500000;
const DEFAULT_LOG_PAGE_SIZE = 25;
const MAX_LOG_PAGE_SIZE = 200;
const MAX_EXPORT_ROWS = 2000;
const SYSTEM_MODULES = new Set(['auth', 'settings', 'admin_reports']);
const LOGIN_ACTIONS = [
  'login',
  'login_failed',
  'login_otp_challenge_sent',
  'login_otp_failed',
  'login_otp_resent',
  'logout',
] as const;

type AdminReportSettings = {
  warningRowLimit: number;
};

type ViewerContext = {
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  storeKey: string;
  storeName?: string;
  storeGstin?: string;
};

type AuditLogLean = {
  _id: Types.ObjectId;
  createdAt?: Date;
  module?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  referenceNo?: string;
  userId?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
  before?: Record<string, any>;
  after?: Record<string, any>;
  storeName?: string;
  storeGstin?: string;
};

const tenantFilter = (req: AuthenticatedRequest, extra: Record<string, any> = {}) => {
  const filter: Record<string, any> = { ...extra };
  if (req.tenantId) filter.tenantId = req.tenantId;
  return filter;
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const normalizeAdminReportSettings = (value: any): AdminReportSettings => ({
  warningRowLimit: clampNumber(value?.warningRowLimit, DEFAULT_WARNING_ROW_LIMIT, MIN_WARNING_ROW_LIMIT, MAX_WARNING_ROW_LIMIT),
});

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const humanize = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const joinReadableList = (items: string[]): string => {
  const values = items.filter(Boolean);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
};

const moduleLabelMap: Record<string, string> = {
  auth: 'Login & Access',
  users: 'Users',
  settings: 'Settings',
  admin_reports: 'Admin Reports',
  accounting: 'Accounting',
  inventory: 'Inventory',
  sales: 'Sales',
  returns: 'Returns',
  memberships: 'Memberships',
  shifts: 'Shifts',
  payroll: 'Payroll',
  facilities: 'Facilities',
  events: 'Events',
  quotes: 'Quotations',
  customers: 'Customers',
  settlements: 'Settlements',
};

const entityLabelMap: Record<string, string> = {
  user: 'User',
  audit_log: 'Log entry',
  admin_report_settings: 'Report setting',
  membership_plan: 'Membership plan',
  member_subscription: 'Membership subscription',
  journal_entry: 'Journal entry',
  payment: 'Payment',
  invoice: 'Invoice',
  voucher: 'Voucher',
};

const actionLabelMap: Record<string, string> = {
  login: 'Signed in',
  login_failed: 'Sign-in failed',
  login_otp_challenge_sent: 'Sent one-time passcode',
  login_otp_failed: 'One-time passcode failed',
  login_otp_resent: 'Sent one-time passcode again',
  logout: 'Signed out',
  user_created: 'Created user',
  user_updated: 'Updated user',
  user_activated: 'Activated user',
  user_deactivated: 'Deactivated user',
  user_soft_deleted: 'Deleted user',
  admin_report_settings_updated: 'Updated report warning limit',
  audit_logs_cleaned: 'Deleted old logs',
};

const fieldLabelMap: Record<string, string> = {
  email: 'email',
  employeeId: 'employee link',
  firstName: 'first name',
  lastName: 'last name',
  phoneNumber: 'phone number',
  businessName: 'business name',
  gstin: 'GST number',
  role: 'role',
  isActive: 'active status',
  password: 'password',
};

const formatModuleLabel = (value: unknown): string => {
  const key = String(value || '').trim().toLowerCase();
  return moduleLabelMap[key] || humanize(key) || '-';
};

const formatActionLabel = (value: unknown): string => {
  const key = String(value || '').trim().toLowerCase();
  return actionLabelMap[key] || humanize(key) || '-';
};

const formatEntityLabel = (value: unknown): string => {
  const key = String(value || '').trim().toLowerCase();
  return entityLabelMap[key] || humanize(key) || '-';
};

const formatFieldLabel = (value: unknown): string => {
  const key = String(value || '').trim();
  return fieldLabelMap[key] || humanize(key).toLowerCase();
};

const summarizeUserAgent = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return 'Not available';

  const browser =
    /edg\//i.test(raw) ? 'Edge'
    : /chrome\//i.test(raw) && !/edg\//i.test(raw) ? 'Chrome'
    : /firefox\//i.test(raw) ? 'Firefox'
    : /safari\//i.test(raw) && !/chrome\//i.test(raw) ? 'Safari'
    : /opr\//i.test(raw) || /opera/i.test(raw) ? 'Opera'
    : 'Browser';

  const device =
    /iphone/i.test(raw) ? 'iPhone'
    : /ipad/i.test(raw) ? 'iPad'
    : /android/i.test(raw) ? 'Android phone'
    : /windows/i.test(raw) ? 'Windows computer'
    : /mac os x|macintosh/i.test(raw) ? 'Mac'
    : /linux/i.test(raw) ? 'Linux computer'
    : /mobile/i.test(raw) ? 'Mobile device'
    : 'Device';

  return `${browser} on ${device}`;
};

const parseDateParam = (raw: string | undefined, fallback: Date, endOfDay = false): Date => {
  const value = String(raw || '').trim();
  let date: Date;

  if (!value) {
    date = new Date(fallback);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const parseRange = (startDate?: string, endDate?: string) => {
  const today = new Date();
  const startFallback = new Date(today);
  startFallback.setDate(startFallback.getDate() - 29);
  const start = parseDateParam(startDate, startFallback, false);
  const end = parseDateParam(endDate, today, true);
  if (start > end) {
    const normalizedStart = new Date(end);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(start);
    normalizedEnd.setHours(23, 59, 59, 999);
    return { start: normalizedStart, end: normalizedEnd };
  }
  return { start, end };
};

const loadViewerContext = async (req: AuthenticatedRequest, res: Response): Promise<ViewerContext | null> => {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }

  const user = await User.findById(req.userId).select('role businessName gstin isActive isDeleted');
  if (!user || !user.isActive || user.isDeleted) {
    res.status(403).json({ success: false, error: 'User is inactive or not found' });
    return null;
  }

  const role = String(user.role || '').trim().toLowerCase();
  if (!['admin', 'super_admin'].includes(role)) {
    res.status(403).json({ success: false, error: 'Only admin users can access admin reports' });
    return null;
  }

  const scope = deriveStoreScope(user, req.userId);
  return {
    userId: req.userId,
    role,
    isSuperAdmin: role === 'super_admin',
    storeKey: scope.storeKey,
    storeName: scope.storeName,
    storeGstin: scope.storeGstin,
  };
};

const loadAdminReportSettings = async (req: AuthenticatedRequest): Promise<AdminReportSettings> => {
  const row = await AppSetting.findOne(tenantFilter(req, { key: ADMIN_REPORT_SETTINGS_KEY })).select('value').lean();
  return normalizeAdminReportSettings(row?.value || {});
};

const saveAdminReportSettings = async (req: AuthenticatedRequest, settings: AdminReportSettings) => {
  return AppSetting.findOneAndUpdate(
    tenantFilter(req, { key: ADMIN_REPORT_SETTINGS_KEY }),
    {
      $set: {
        key: ADMIN_REPORT_SETTINGS_KEY,
        tenantId: req.tenantId,
        value: normalizeAdminReportSettings(settings),
        updatedBy: req.userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const buildSearchOrFilter = (search: string) => {
  const query = String(search || '').trim();
  if (!query) return null;
  const regex = new RegExp(escapeRegex(query), 'i');
  return [
    { module: regex },
    { action: regex },
    { entityType: regex },
    { referenceNo: regex },
    { ipAddress: regex },
    { 'metadata.email': regex },
    { 'metadata.reason': regex },
    { 'metadata.description': regex },
    { 'metadata.invoiceNumber': regex },
    { 'metadata.voucherNumber': regex },
    { 'metadata.orderNumber': regex },
    { 'metadata.paymentNumber': regex },
  ];
};

const mapActorDetails = async (rows: AuditLogLean[]) => {
  const userIds = Array.from(
    new Set(
      rows
        .map((row) => String(row.userId || '').trim())
        .filter((value) => Boolean(value) && Types.ObjectId.isValid(value))
    )
  );

  const actors = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('firstName lastName email role').lean()
    : [];

  return new Map(
    actors.map((actor) => [
      String(actor._id),
      {
        actorName: `${String(actor.firstName || '').trim()} ${String(actor.lastName || '').trim()}`
          .trim()
          .replace(/\s+/g, ' '),
        actorEmail: String(actor.email || '').trim(),
        actorRole: String(actor.role || '').trim(),
      },
    ])
  );
};

const buildReadableSummary = (row: AuditLogLean): string => {
  const action = String(row.action || '').trim().toLowerCase();
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const changedFields = Array.isArray(metadata.changedFields)
    ? metadata.changedFields.map((field: unknown) => formatFieldLabel(field))
    : [];

  const referenceParts = [
    row.referenceNo ? `Reference ${row.referenceNo}` : '',
    metadata.invoiceNumber ? `Invoice ${metadata.invoiceNumber}` : '',
    metadata.voucherNumber ? `Voucher ${metadata.voucherNumber}` : '',
    metadata.orderNumber ? `Order ${metadata.orderNumber}` : '',
    metadata.paymentNumber ? `Payment ${metadata.paymentNumber}` : '',
  ].filter(Boolean);

  if (action === 'user_created') {
    const userName = [row.after?.firstName, row.after?.lastName].filter(Boolean).join(' ').trim();
    return userName ? `Created the user account for ${userName}.` : 'Created a new user account.';
  }

  if (action === 'user_updated') {
    if (changedFields.length) {
      return `Updated user details: ${joinReadableList(changedFields)}.`;
    }
    return 'Updated the user details.';
  }

  if (action === 'user_activated') return 'Activated the user account.';
  if (action === 'user_deactivated') return 'Deactivated the user account.';
  if (action === 'user_soft_deleted') return 'Deleted the user account from active use.';

  if (action === 'login') return 'Signed in successfully.';
  if (action === 'login_failed') {
    return metadata.reason ? `Sign-in failed: ${String(metadata.reason).trim()}.` : 'Sign-in failed.';
  }
  if (action === 'login_otp_challenge_sent') return 'Sent a one-time passcode for sign-in.';
  if (action === 'login_otp_failed') {
    return metadata.reason ? `One-time passcode check failed: ${String(metadata.reason).trim()}.` : 'One-time passcode check failed.';
  }
  if (action === 'login_otp_resent') return 'Sent the one-time passcode again.';
  if (action === 'logout') return 'Signed out of the application.';

  if (action === 'admin_report_settings_updated' && metadata.warningRowLimit) {
    return `Updated the log warning limit to ${metadata.warningRowLimit} rows.`;
  }

  if (action === 'audit_logs_cleaned') {
    const deletedCount = Number(metadata.deletedCount || 0);
    const keepLatestRows = Number(metadata.keepLatestRows || 0);
    if (deletedCount > 0) {
      return `Deleted ${deletedCount} old log entries and kept the latest ${keepLatestRows} rows.`;
    }
    return `Checked old log entries and kept the latest ${keepLatestRows} rows.`;
  }

  if (metadata.reason) return String(metadata.reason).trim();
  if (metadata.description) return String(metadata.description).trim();

  if (referenceParts.length) {
    return `${referenceParts.join('. ')}.`;
  }

  const firstEntry = Object.entries(metadata).find(([, value]) => value !== null && value !== undefined && value !== '');
  if (firstEntry) {
    return `${humanize(firstEntry[0])}: ${String(firstEntry[1])}`;
  }

  const actionLabel = formatActionLabel(action);
  const entityLabel = formatEntityLabel(row.entityType);
  return entityLabel && entityLabel !== '-'
    ? `${actionLabel} for ${entityLabel.toLowerCase()}.`
    : `${actionLabel}.`;
};

const enrichAuditRows = async (rows: AuditLogLean[]) => {
  const actorMap = await mapActorDetails(rows);
  return rows.map((row) => {
    const actor = actorMap.get(String(row.userId || '').trim());
    const normalizedIp = normalizeIpAddress(row.ipAddress);
    return {
      id: String(row._id),
      createdAt: row.createdAt || null,
      module: String(row.module || '').trim(),
      moduleLabel: formatModuleLabel(row.module),
      action: String(row.action || '').trim(),
      actionLabel: formatActionLabel(row.action),
      entityType: String(row.entityType || '').trim(),
      entityLabel: formatEntityLabel(row.entityType),
      entityId: String(row.entityId || '').trim(),
      referenceNo: String(row.referenceNo || '').trim(),
      ipAddress: normalizedIp,
      ipAddressLabel: describeIpAddress(normalizedIp),
      actorName: actor?.actorName || '',
      actorEmail: actor?.actorEmail || String(row.metadata?.email || '').trim(),
      actorRole: actor?.actorRole || '',
      summary: buildReadableSummary(row),
      metadata: row.metadata || {},
    };
  });
};

const countTransactionLogs = async (baseFilter: Record<string, any>) => {
  return AuditLog.countDocuments({
    ...baseFilter,
    module: { $nin: Array.from(SYSTEM_MODULES) },
  });
};

const loadModuleOptions = async (baseFilter: Record<string, any>) => {
  const rows = await AuditLog.aggregate([
    { $match: baseFilter },
    { $group: { _id: '$module' } },
    { $sort: { _id: 1 } },
  ]);

  const allModules = rows.map((row) => String(row._id || '').trim()).filter(Boolean);
  return {
    audit: allModules,
    transactions: allModules.filter((module) => !SYSTEM_MODULES.has(module)),
  };
};

const notifySuperAdminsIfNeeded = async (req: AuthenticatedRequest, viewer: ViewerContext, currentCount: number, warningRowLimit: number) => {
  try {
    const superAdmins = await User.find({
      role: 'super_admin',
      isActive: true,
      isDeleted: { $ne: true },
      ...(req.tenantId ? { tenantId: req.tenantId } : {}),
    }).select('email firstName lastName');

    const recipients = uniqueRecipients(
      superAdmins
        .map((row) => String(row.email || '').trim().toLowerCase())
        .filter((email) => isValidEmailAddress(email))
    );

    if (!recipients.length) return 0;

    const settings = await loadTenantGeneralSettings(req.tenantId);
    const businessLabel = viewer.storeName || 'the workspace';
    const overLimitBy = Math.max(0, currentCount - warningRowLimit);

    await sendConfiguredMail({
      settingsOverride: settings,
      recipients,
      subject: `${settings.mail.appName || 'Sarva'} admin reports warning`,
      text: [
        `Admin reports warning for ${businessLabel}.`,
        `Current audit log rows: ${currentCount}.`,
        `Configured warning limit: ${warningRowLimit}.`,
        `Rows above warning limit: ${overLimitBy}.`,
        'Please take a backup and delete old logs if they are no longer required.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2 style="margin-bottom:8px">Admin reports warning</h2>
          <p><strong>${businessLabel}</strong> has crossed the configured audit log warning limit.</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 12px;border:1px solid #d1d5db">Current audit log rows</td><td style="padding:6px 12px;border:1px solid #d1d5db">${currentCount}</td></tr>
            <tr><td style="padding:6px 12px;border:1px solid #d1d5db">Warning limit</td><td style="padding:6px 12px;border:1px solid #d1d5db">${warningRowLimit}</td></tr>
            <tr><td style="padding:6px 12px;border:1px solid #d1d5db">Rows above limit</td><td style="padding:6px 12px;border:1px solid #d1d5db">${overLimitBy}</td></tr>
          </table>
          <p>Please take a backup and delete old logs if they are no longer required.</p>
        </div>
      `,
    });

    return recipients.length;
  } catch (error) {
    console.warn('Failed to notify super admins about admin reports warning:', error);
    return 0;
  }
};

const syncWarningFlag = async (
  req: AuthenticatedRequest,
  viewer: ViewerContext,
  currentCount: number,
  warningRowLimit: number
) => {
  const dedupeKey = `admin_reports:log_size_warning:${viewer.storeKey}`;
  const existing = await AuditFlag.findOne({
    storeKey: viewer.storeKey,
    module: 'admin_reports',
    flagType: 'log_size_warning',
    dedupeKey,
    status: 'open',
  }).sort({ detectedAt: -1 });

  if (currentCount > warningRowLimit) {
    if (!existing) {
      const recipientCount = await notifySuperAdminsIfNeeded(req, viewer, currentCount, warningRowLimit);
      await writeAuditFlag({
        storeKey: viewer.storeKey,
        storeName: viewer.storeName,
        storeGstin: viewer.storeGstin,
        module: 'admin_reports',
        flagType: 'log_size_warning',
        severity: currentCount >= warningRowLimit * 2 ? 'high' : 'medium',
        message: `Audit log rows reached ${currentCount}, above the warning limit of ${warningRowLimit}. Take backup and delete old logs.`,
        dedupeKey,
        metadata: {
          currentCount,
          warningRowLimit,
          recipientCount,
          escalatedRole: 'super_admin',
        },
        detectedBy: viewer.userId,
      });
    }

    const openFlag = await AuditFlag.findOne({
      storeKey: viewer.storeKey,
      module: 'admin_reports',
      flagType: 'log_size_warning',
      dedupeKey,
      status: 'open',
    }).sort({ detectedAt: -1 }).lean();

    return openFlag;
  }

  if (existing) {
    existing.status = 'resolved';
    existing.resolvedAt = new Date();
    existing.resolvedBy = viewer.userId;
    existing.resolutionNote = 'Audit log row count is within the configured warning limit.';
    await existing.save();
  }

  return null;
};

router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;

    const settings = await loadAdminReportSettings(req);
    const baseFilter: Record<string, any> = { storeKey: viewer.storeKey };

    const [totalAuditLogs, loginEvents, transactionEvents, oldestRow, latestRow, moduleOptions] = await Promise.all([
      AuditLog.countDocuments(baseFilter),
      AuditLog.countDocuments({ ...baseFilter, module: 'auth' }),
      countTransactionLogs(baseFilter),
      AuditLog.findOne(baseFilter).sort({ createdAt: 1, _id: 1 }).select('createdAt').lean(),
      AuditLog.findOne(baseFilter).sort({ createdAt: -1, _id: -1 }).select('createdAt').lean(),
      loadModuleOptions(baseFilter),
    ]);

    const warningFlag = await syncWarningFlag(req, viewer, totalAuditLogs, settings.warningRowLimit);
    const thresholdExceeded = totalAuditLogs > settings.warningRowLimit;

    res.json({
      success: true,
      data: {
        currentUserRole: viewer.role,
        canManageLogs: viewer.isSuperAdmin,
        settings,
        summary: {
          totalAuditLogs,
          loginEvents,
          transactionEvents,
          warningRowLimit: settings.warningRowLimit,
          thresholdExceeded,
          overLimitBy: thresholdExceeded ? totalAuditLogs - settings.warningRowLimit : 0,
          oldestEntryAt: oldestRow?.createdAt || null,
          latestEntryAt: latestRow?.createdAt || null,
        },
        moduleOptions,
        warning: warningFlag
          ? {
              id: String(warningFlag._id),
              severity: warningFlag.severity,
              message: warningFlag.message,
              detectedAt: warningFlag.detectedAt,
              metadata: warningFlag.metadata || {},
            }
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load admin reports overview' });
  }
});

router.put('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;

    const nextSettings = normalizeAdminReportSettings(req.body?.settings || {});
    await saveAdminReportSettings(req, nextSettings);

    await writeAuditLog({
      module: 'admin_reports',
      action: 'admin_report_settings_updated',
      entityType: 'admin_report_settings',
      userId: viewer.userId,
      metadata: {
        warningRowLimit: nextSettings.warningRowLimit,
      },
    });

    res.json({
      success: true,
      message: 'Admin report warning limit updated successfully',
      data: nextSettings,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update admin report settings' });
  }
});

router.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;

    const { start, end } = parseRange(String(req.query.startDate || ''), String(req.query.endDate || ''));
    const module = String(req.query.module || '').trim();
    const action = String(req.query.action || '').trim();
    const search = String(req.query.search || '').trim();
    const limit = Math.min(MAX_LOG_PAGE_SIZE, Math.max(1, Number(req.query.limit) || DEFAULT_LOG_PAGE_SIZE));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const filter: Record<string, any> = {
      storeKey: viewer.storeKey,
      createdAt: { $gte: start, $lte: end },
    };

    if (module) filter.module = module;
    if (action) filter.action = new RegExp(escapeRegex(action), 'i');

    const searchOr = buildSearchOrFilter(search);
    if (searchOr?.length) {
      filter.$or = searchOr;
    }

    const [rows, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean<AuditLogLean[]>(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: await enrichAuditRows(rows),
      pagination: { total, skip, limit },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch audit logs' });
  }
});

router.get('/login-activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;

    const { start, end } = parseRange(String(req.query.startDate || ''), String(req.query.endDate || ''));
    const action = String(req.query.action || '').trim();
    const search = String(req.query.search || '').trim();
    const limit = Math.min(MAX_LOG_PAGE_SIZE, Math.max(1, Number(req.query.limit) || DEFAULT_LOG_PAGE_SIZE));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const filter: Record<string, any> = {
      storeKey: viewer.storeKey,
      module: 'auth',
      action: action || { $in: Array.from(LOGIN_ACTIONS) },
      createdAt: { $gte: start, $lte: end },
    };

    const searchOr = buildSearchOrFilter(search);
    if (searchOr?.length) {
      filter.$or = searchOr;
    }

    const [rows, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean<AuditLogLean[]>(),
      AuditLog.countDocuments(filter),
    ]);

    const enriched = await enrichAuditRows(rows);
    res.json({
      success: true,
      data: enriched.map((row) => ({
        ...row,
        result: row.action.includes('failed') ? 'Failed' : row.action === 'logout' ? 'Logged out' : 'Success',
        reason: String(row.metadata?.reason || '').trim(),
        device: summarizeUserAgent(row.metadata?.userAgent),
      })),
      pagination: { total, skip, limit },
      filters: {
        actions: Array.from(LOGIN_ACTIONS),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch login activity' });
  }
});

router.get('/transaction-activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;

    const { start, end } = parseRange(String(req.query.startDate || ''), String(req.query.endDate || ''));
    const module = String(req.query.module || '').trim();
    const search = String(req.query.search || '').trim();
    const limit = Math.min(MAX_LOG_PAGE_SIZE, Math.max(1, Number(req.query.limit) || DEFAULT_LOG_PAGE_SIZE));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const filter: Record<string, any> = {
      storeKey: viewer.storeKey,
      module: module || { $nin: Array.from(SYSTEM_MODULES) },
      createdAt: { $gte: start, $lte: end },
    };

    const searchOr = buildSearchOrFilter(search);
    if (searchOr?.length) {
      filter.$or = searchOr;
    }

    const [rows, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean<AuditLogLean[]>(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: await enrichAuditRows(rows),
      pagination: { total, skip, limit },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch transaction activity' });
  }
});

router.post('/cleanup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;
    if (!viewer.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only super admin can delete old logs' });
    }

    await writeAuditLog({
      module: 'admin_reports',
      action: 'audit_log_cleanup_blocked',
      entityType: 'audit_log',
      userId: viewer.userId,
      metadata: {
        reason: 'Audit logs are immutable. Cleanup deletion endpoint is disabled; archival must preserve read-only history.',
      },
    });

    res.status(410).json({
      success: false,
      error: 'Audit log deletion is disabled. Use read-only archival instead of purge/cleanup.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete old logs' });
  }
});

router.get('/export/:reportType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const viewer = await loadViewerContext(req, res);
    if (!viewer) return;

    const reportType = String(req.params.reportType || '').trim().toLowerCase();
    const { start, end } = parseRange(String(req.query.startDate || ''), String(req.query.endDate || ''));
    const search = String(req.query.search || '').trim();
    const module = String(req.query.module || '').trim();
    const action = String(req.query.action || '').trim();

    const filter: Record<string, any> = {
      storeKey: viewer.storeKey,
      createdAt: { $gte: start, $lte: end },
    };

    if (reportType === 'login-activity') {
      filter.module = 'auth';
      filter.action = action || { $in: Array.from(LOGIN_ACTIONS) };
    } else if (reportType === 'transaction-activity') {
      filter.module = module || { $nin: Array.from(SYSTEM_MODULES) };
    } else {
      if (module) filter.module = module;
      if (action) filter.action = new RegExp(escapeRegex(action), 'i');
    }

    const searchOr = buildSearchOrFilter(search);
    if (searchOr?.length) {
      filter.$or = searchOr;
    }

    const rows = await AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_EXPORT_ROWS)
      .lean<AuditLogLean[]>();

    await writeAuditLog({
      module: 'admin_reports',
      action: 'report_exported',
      entityType: 'admin_report',
      referenceNo: reportType,
      userId: viewer.userId,
      metadata: {
        reportType,
        filters: {
          startDate: start,
          endDate: end,
          search,
          module,
          action,
        },
        rowCount: rows.length,
        truncated: rows.length >= MAX_EXPORT_ROWS,
      },
    });

    res.json({
      success: true,
      data: await enrichAuditRows(rows),
      meta: {
        reportType,
        rowCount: rows.length,
        truncated: rows.length >= MAX_EXPORT_ROWS,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to export admin report' });
  }
});

export default router;
