import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardTabs } from '../components/CardTabs';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { PaginationControls } from '../components/PaginationControls';
import { ActionIconButton } from '../components/ActionIconButton';
import { formatCurrency } from '../config';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { apiUrl, fetchApiJson, resolveAppAssetUrl } from '../utils/api';
import { showConfirmDialog, showPromptDialog } from '../utils/appDialogs';
import memberCardTemplate from '../assets/memberships/member-card-template.png';

interface FacilityOption {
  _id: string;
  name: string;
  location?: string;
}

interface Plan {
  _id: string;
  name: string;
  tierName?: string;
  description?: string;
  planType?: 'free' | 'paid';
  status?: 'active' | 'inactive' | 'archived';
  active: boolean;
  facilityType: string;
  facilityIds?: FacilityOption[];
  billingCycle?: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'custom';
  durationDays: number;
  gracePeriodDays?: number;
  trialPeriodDays?: number;
  price: number;
  oneTimeFeeEnabled?: boolean;
  oneTimeFeeAmount?: number;
  autoRenew?: boolean;
  bookingDiscountPercentage?: number;
  flatDiscountAmount?: number;
  rewardPointsMultiplier?: number;
  freeServiceItems?: string[];
  accessRestrictions?: string[];
  sessionsLimit?: number;
  memberVisitLimit?: number;
  pointsPerCurrency?: number;
  pointsRedemptionValue?: number;
  minimumRedeemPoints?: number;
  pointsExpiryDays?: number;
}

interface Subscription {
  _id: string;
  memberCode?: string;
  memberName: string;
  fullName?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  dateOfBirth?: string;
  gender?: string;
  profilePhotoUrl?: string;
  languagePreference?: string;
  themePreference?: string;
  planId: Plan;
  startDate: string;
  endDate: string;
  renewalDate?: string;
  status: 'active' | 'expired' | 'cancelled' | 'frozen' | 'suspended';
  amountPaid: number;
  amountDue?: number;
  totalVisits?: number;
  totalSpending?: number;
  rewardPointsBalance?: number;
  sessionsUsed: number;
  bookingDiscountPercentage?: number;
  validityReminderDays?: number;
  autoRenewEnabled?: boolean;
  notes?: string;
}

interface ReminderChannelStats {
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
}

interface ReminderWarningRow {
  memberId: string;
  memberName: string;
  memberCode?: string;
  email?: string;
  phone?: string;
  endDate: string;
  planName?: string;
  reminderType?: string;
  emailReady: boolean;
  emailSentToday: boolean;
}

interface ReminderQueueRow {
  memberId: string;
  memberName: string;
  memberCode?: string;
  email?: string;
  phone?: string;
  endDate: string;
  planName?: string;
  reminderType?: string;
  emailReady: boolean;
  emailSentToday: boolean;
  daysRemaining: number;
  source: Subscription;
}

const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
const cycleLabel = (value?: string) => String(value || 'custom').replace('_', ' ').toUpperCase();
const parseCsv = (value: string): string[] => value.split(',').map((x) => x.trim()).filter(Boolean);
const dayMs = 24 * 60 * 60 * 1000;
const resolveStoredImageUrl = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return resolveAppAssetUrl(raw);
};
const monthYearLabel = (value?: string): string => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const daysUntilDate = (value?: string): number => {
  const target = value ? new Date(value) : null;
  if (!target || Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.ceil((startOfTarget.getTime() - startOfToday.getTime()) / dayMs);
};
const fileSafe = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'member';
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
    reader.readAsDataURL(file);
  });
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL.'));
    reader.readAsDataURL(blob);
  });
const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
const loadCanvasFriendlyImage = async (src: string): Promise<HTMLImageElement> => {
  const raw = String(src || '').trim();
  if (!raw) {
    throw new Error('Image source is missing.');
  }

  if (raw.startsWith('data:')) {
    return loadImageElement(raw);
  }

  try {
    const response = await fetch(raw, { credentials: /^https?:\/\//i.test(raw) ? 'omit' : 'include' });
    if (!response.ok) {
      throw new Error(`Image request failed with ${response.status}`);
    }
    const dataUrl = await blobToDataUrl(await response.blob());
    return await loadImageElement(dataUrl);
  } catch {
    return loadImageElement(raw);
  }
};
const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to prepare download file.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
const buildRoundedRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
};
const applyCanvasFont = (ctx: CanvasRenderingContext2D, weight: number, size: number) => {
  ctx.font = `${weight} ${size}px "Segoe UI Variable Text", "Segoe UI", Arial, Helvetica, sans-serif`;
};
const ellipsizeCanvasText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}...`;
};
const drawFittedCanvasText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { color: string; maxFontSize: number; minFontSize: number; weight: number }
) => {
  let fontSize = options.maxFontSize;
  while (fontSize > options.minFontSize) {
    applyCanvasFont(ctx, options.weight, fontSize);
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 0.5;
  }
  applyCanvasFont(ctx, options.weight, Math.max(fontSize, options.minFontSize));
  ctx.fillStyle = options.color;
  ctx.fillText(ellipsizeCanvasText(ctx, text, maxWidth), x, y);
};
const drawCoverCanvasImage = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > frameRatio) {
    sourceWidth = image.height * frameRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / frameRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};
const measureSpacedCanvasText = (ctx: CanvasRenderingContext2D, text: string, letterSpacing: number): number => {
  if (!text) return 0;
  return text.split('').reduce((width, char) => width + ctx.measureText(char).width, 0) + Math.max(0, text.length - 1) * letterSpacing;
};
const drawSpacedCanvasText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number
): number => {
  let cursorX = x;
  text.split('').forEach((char, index) => {
    ctx.fillText(char, cursorX, y);
    cursorX += ctx.measureText(char).width + (index === text.length - 1 ? 0 : letterSpacing);
  });
  return cursorX;
};
const drawMemberCardFooterIcon = (
  ctx: CanvasRenderingContext2D,
  type: 'web' | 'mail' | 'phone',
  x: number,
  y: number,
  size: number
) => {
  ctx.save();
  ctx.strokeStyle = '#222222';
  ctx.fillStyle = '#222222';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'web') {
    ctx.beginPath();
    ctx.arc(x + size / 2, y, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y, size * 0.19, size / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.1, y);
    ctx.lineTo(x + size * 0.9, y);
    ctx.moveTo(x + size / 2, y - size / 2);
    ctx.lineTo(x + size / 2, y + size / 2);
    ctx.stroke();
  } else if (type === 'mail') {
    const top = y - size * 0.34;
    const height = size * 0.68;
    ctx.strokeRect(x, top, size, height);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + size / 2, y + size * 0.08);
    ctx.lineTo(x + size, top);
    ctx.moveTo(x, top + height);
    ctx.lineTo(x + size * 0.38, y + size * 0.02);
    ctx.moveTo(x + size, top + height);
    ctx.lineTo(x + size * 0.62, y + size * 0.02);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.25, y - size * 0.42);
    ctx.bezierCurveTo(x + size * 0.08, y - size * 0.3, x + size * 0.12, y + size * 0.14, x + size * 0.45, y + size * 0.35);
    ctx.bezierCurveTo(x + size * 0.62, y + size * 0.46, x + size * 0.88, y + size * 0.42, x + size * 0.95, y + size * 0.24);
    ctx.lineTo(x + size * 0.72, y + size * 0.07);
    ctx.bezierCurveTo(x + size * 0.63, y + size * 0.16, x + size * 0.56, y + size * 0.16, x + size * 0.47, y + size * 0.08);
    ctx.bezierCurveTo(x + size * 0.36, y - size * 0.02, x + size * 0.34, y - size * 0.11, x + size * 0.43, y - size * 0.21);
    ctx.lineTo(x + size * 0.25, y - size * 0.42);
    ctx.fill();
  }

  ctx.restore();
};

type MembershipWorkspaceTab = 'plan' | 'member' | 'pos';

type MembershipPageMode = 'all' | 'plan' | 'member-create' | 'member-list';

interface MembershipsProps {
  mode?: MembershipPageMode;
}

export const Memberships: React.FC<MembershipsProps> = ({ mode = 'all' }) => {
  const initialWorkspaceTab: MembershipWorkspaceTab =
    mode === 'plan' ? 'plan' : mode === 'all' ? 'member' : 'member';
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [expiringAlerts, setExpiringAlerts] = useState<Subscription[]>([]);
  const [reminderWarningRows, setReminderWarningRows] = useState<ReminderWarningRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState('');
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [dashboardReportsLoading, setDashboardReportsLoading] = useState(false);
  const [advancedReportsLoaded, setAdvancedReportsLoaded] = useState(false);
  const [advancedReportsLoading, setAdvancedReportsLoading] = useState(false);

  const [dashboard, setDashboard] = useState({
    expiringCount: 0,
    emailWarningDue: 0,
    missingEmailWarningCount: 0,
    expiredCount: 0,
    renewedThisMonth: 0,
    renewalRevenue: 0,
  });
  const [reportSummary, setReportSummary] = useState({
    activeMembersCount: 0,
    expiredMembersCount: 0,
    revenueFromMemberships: 0,
    renewalRate: 0,
    memberRetentionRate: 0,
    mostPopularPlanName: '-',
  });
  const [lifecycleStats, setLifecycleStats] = useState({
    byStatus: {} as Record<string, number>,
    expiringIn7Days: 0,
    expiringIn30Days: 0,
    currentlyInGracePeriod: 0,
  });
  const [renewalTrends, setRenewalTrends] = useState<Array<any>>([]);
  const [reminderChannelStats, setReminderChannelStats] = useState<Record<string, ReminderChannelStats>>({});
  const [benefitAnalytics, setBenefitAnalytics] = useState({
    usageCount: 0,
    totalGross: 0,
    totalDiscount: 0,
    totalRedeemValue: 0,
    totalSavings: 0,
    totalEarnedPoints: 0,
  });
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberDetails, setMemberDetails] = useState<any>(null);
  const [memberDetailsLoading, setMemberDetailsLoading] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<MembershipWorkspaceTab>(initialWorkspaceTab);
  const [memberTab, setMemberTab] = useState<'create' | 'list'>(mode === 'member-create' ? 'create' : 'list');
  const [memberSearchInput, setMemberSearchInput] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);
  const [reminderQueueSearch, setReminderQueueSearch] = useState('');
  const [reminderQueueFilter, setReminderQueueFilter] = useState<'all' | 'due_today' | 'due_7_days' | 'mail_ready' | 'missing_email' | 'sent_today'>('all');
  const [reminderType, setReminderType] = useState('d3');
  const [reminderChannels, setReminderChannels] = useState<string[]>(['sms', 'email']);
  const [activeUserRole, setActiveUserRole] = useState('');
  const [memberCardBusyAction, setMemberCardBusyAction] = useState<'print' | 'download' | 'pdf' | ''>('');
  const [memberCardPreviewUrl, setMemberCardPreviewUrl] = useState('');
  const memberIdCardRef = useRef<HTMLDivElement | null>(null);

  const showWorkspaceTabs = mode === 'all';
  const showPlanWorkspace = mode === 'plan' || (mode === 'all' && workspaceTab === 'plan');
  const showMemberWorkspace = mode === 'member-create' || mode === 'member-list' || (mode === 'all' && workspaceTab === 'member');
  const showPosWorkspace = mode === 'all' && workspaceTab === 'pos';
  const showPlanForm = showPlanWorkspace;
  const showMemberTabs = showMemberWorkspace && mode === 'all';
  const showMemberForm = mode === 'member-create' || (showMemberWorkspace && memberTab === 'create');
  const showMemberList = mode === 'member-list' || (showMemberWorkspace && memberTab === 'list');
  const showDashboardCards = mode === 'all';
  const showAutomationActions = showMemberWorkspace;
  const showExpiringAlerts = showMemberWorkspace;
  const showPlanTable = showPlanWorkspace;
  const showMemberProfileDetails = showMemberWorkspace;
  const showPosPreviewAndInlineReports = showPosWorkspace;
  const needsPlanCatalog = showPlanWorkspace || showMemberForm;
  const canPrintMemberCards = ['admin', 'super_admin'].includes(String(activeUserRole || '').toLowerCase());

  const pageTitle =
    mode === 'plan'
      ? 'Create Plan (Admin)'
      : mode === 'member-create'
        ? 'Create Member Subscription'
        : 'Membership Management';
  const pageSubtitle =
    mode === 'plan'
      ? 'Create and manage membership plans.'
      : mode === 'member-create'
        ? 'Create member subscriptions with unique mobile numbers.'
        : 'Full lifecycle: plans, members, renewals, reminders, points, reports, and POS benefits.';

  const [planForm, setPlanForm] = useState({
    name: '',
    tierName: '',
    description: '',
    planType: 'paid',
    status: 'active',
    facilityType: '',
    facilityIds: [] as string[],
    billingCycle: 'monthly',
    durationDays: '30',
    gracePeriodDays: '0',
    trialPeriodDays: '0',
    price: '',
    oneTimeFeeEnabled: false,
    oneTimeFeeAmount: '0',
    autoRenew: false,
    bookingDiscountPercentage: '0',
    flatDiscountAmount: '0',
    rewardPointsMultiplier: '1',
    freeServiceItemsText: '',
    accessRestrictionsText: '',
    sessionsLimit: '0',
    memberVisitLimit: '0',
    pointsPerCurrency: '0',
    pointsRedemptionValue: '0',
    minimumRedeemPoints: '0',
    pointsExpiryDays: '0',
    active: true,
  });

  const [subForm, setSubForm] = useState({
    editId: '',
    memberName: '',
    fullName: '',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    dateOfBirth: '',
    gender: 'prefer_not_to_say',
    profilePhotoUrl: '',
    languagePreference: 'en',
    themePreference: 'dark',
    planId: '',
    startDate: toDateInput(new Date()),
    amountPaid: '',
    bookingDiscountPercentage: '',
    validityReminderDays: '7',
    durationValue: '',
    durationUnit: 'months',
    notes: '',
  });

  const [posForm, setPosForm] = useState({
    mobile: '',
    cartTotal: '',
    redeemPoints: '',
  });
  const [posPreview, setPosPreview] = useState<any>(null);
  const memberCardTemplateUrl = useMemo(() => {
    if (typeof window === 'undefined') return memberCardTemplate;
    return new URL(memberCardTemplate, window.location.origin).toString();
  }, []);

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);
  const selectedPlanForSubscription = useMemo(
    () => plans.find((plan) => plan._id === subForm.planId) || null,
    [plans, subForm.planId]
  );
  const selectedPlanDurationHint = selectedPlanForSubscription
    ? `${cycleLabel(selectedPlanForSubscription.billingCycle)} / ${Number(selectedPlanForSubscription.durationDays || 0)} days`
    : 'Select a plan to see default duration';
  const customDurationLabel = subForm.durationValue
    ? `${subForm.durationValue} ${Number(subForm.durationValue) === 1 ? subForm.durationUnit.replace(/s$/, '') : subForm.durationUnit}`
    : '';

  const loadCurrentUserRole = async () => {
    try {
      const response = await fetchApiJson(apiUrl('/api/auth/me'), { headers });
      setActiveUserRole(String(response?.user?.role || response?.data?.role || '').trim().toLowerCase());
    } catch {
      setActiveUserRole('');
    }
  };

  const loadPlanCatalog = async (force = false) => {
    if (plansLoading || (catalogLoaded && !force)) return;
    setPlansLoading(true);
    try {
      const [optionsData, plansData] = await Promise.all([
        fetchApiJson(apiUrl('/api/memberships/plan-options'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/plans'), { headers }),
      ]);
      const facilityRows = Array.isArray(optionsData?.data?.facilities) ? optionsData.data.facilities : [];
      const planRows = Array.isArray(plansData?.data) ? plansData.data : [];

      setFacilities(facilityRows);
      setPlans(planRows);
      setCatalogLoaded(true);

      if (!subForm.planId && planRows[0]?._id) {
        setSubForm((prev) => ({ ...prev, planId: planRows[0]._id }));
      }
      if (!planForm.facilityType && facilityRows[0]?.name) {
        setPlanForm((prev) => ({ ...prev, facilityType: facilityRows[0].name }));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load membership plans');
    } finally {
      setPlansLoading(false);
    }
  };

  const loadMemberWorkspaceData = async (query = memberSearchQuery) => {
    setError('');
    const trimmedQuery = String(query || '').trim();
    const subscriptionsEndpoint = trimmedQuery
      ? `/api/memberships/subscriptions?q=${encodeURIComponent(trimmedQuery)}`
      : '/api/memberships/subscriptions';
    setMembersLoading(true);
    try {
      const [subscriptionsData, alertsData, dashboardData] = await Promise.all([
        fetchApiJson(apiUrl(subscriptionsEndpoint), { headers }),
        fetchApiJson(apiUrl('/api/memberships/subscriptions/expiry-alerts?days=30'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/dashboard/reminders'), { headers }),
      ]);

      const subRows = Array.isArray(subscriptionsData?.data) ? subscriptionsData.data : [];
      const alertRows = Array.isArray(alertsData?.data?.expiring) ? alertsData.data.expiring : [];

      setSubscriptions(subRows);
      setMemberSearchQuery(trimmedQuery);
      setExpiringAlerts(alertRows);
      setReminderWarningRows(Array.isArray(dashboardData?.data?.warningRows) ? dashboardData.data.warningRows : []);
      setDashboard({
        expiringCount: Number(dashboardData?.data?.expiringCount || 0),
        emailWarningDue: Number(dashboardData?.data?.emailWarningDue || 0),
        missingEmailWarningCount: Number(dashboardData?.data?.missingEmailWarningCount || 0),
        expiredCount: Number(dashboardData?.data?.expiredCount || 0),
        renewedThisMonth: Number(dashboardData?.data?.renewedThisMonth || 0),
        renewalRevenue: Number(dashboardData?.data?.renewalRevenue || 0),
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load memberships');
    } finally {
      setMembersLoading(false);
    }
  };

  const loadDashboardReports = async () => {
    setDashboardReportsLoading(true);
    try {
      const [summaryData, lifecycleData] = await Promise.all([
        fetchApiJson(apiUrl('/api/memberships/reports/summary'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/lifecycle'), { headers }),
      ]);
      const row = summaryData?.data || {};
      setReportSummary({
        activeMembersCount: Number(row.activeMembersCount || 0),
        expiredMembersCount: Number(row.expiredMembersCount || 0),
        revenueFromMemberships: Number(row.revenueFromMemberships || 0),
        renewalRate: Number(row.renewalRate || 0),
        memberRetentionRate: Number(row.memberRetentionRate || 0),
        mostPopularPlanName: String(row?.mostPopularPlan?.planName || '-'),
      });

      setLifecycleStats({
        byStatus: lifecycleData?.data?.byStatus || {},
        expiringIn7Days: Number(lifecycleData?.data?.expiringIn7Days || 0),
        expiringIn30Days: Number(lifecycleData?.data?.expiringIn30Days || 0),
        currentlyInGracePeriod: Number(lifecycleData?.data?.currentlyInGracePeriod || 0),
      });
    } catch {
      // reports can be admin-only
    } finally {
      setDashboardReportsLoading(false);
    }
  };

  const loadAdvancedReports = async (force = false) => {
    if (advancedReportsLoading || (advancedReportsLoaded && !force)) return;
    setAdvancedReportsLoading(true);
    try {
      const [renewalData, reminderData, benefitsData] = await Promise.all([
        fetchApiJson(apiUrl('/api/memberships/reports/renewal-trends?months=6'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/reminder-channels?days=30'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/benefits-analytics?days=30'), { headers }),
      ]);
      setRenewalTrends(Array.isArray(renewalData?.data) ? renewalData.data : []);
      setReminderChannelStats((reminderData?.data?.byChannel || {}) as Record<string, ReminderChannelStats>);
      setBenefitAnalytics({
        usageCount: Number(benefitsData?.data?.summary?.usageCount || 0),
        totalGross: Number(benefitsData?.data?.summary?.totalGross || 0),
        totalDiscount: Number(benefitsData?.data?.summary?.totalDiscount || 0),
        totalRedeemValue: Number(benefitsData?.data?.summary?.totalRedeemValue || 0),
        totalSavings: Number(benefitsData?.data?.summary?.totalSavings || 0),
        totalEarnedPoints: Number(benefitsData?.data?.summary?.totalEarnedPoints || 0),
      });
      setAdvancedReportsLoaded(true);
    } catch {
      // advanced reports are optional and loaded on demand
    } finally {
      setAdvancedReportsLoading(false);
    }
  };

  useEffect(() => {
    void loadMemberWorkspaceData();
    void loadDashboardReports();
    void loadCurrentUserRole();
  }, []);

  useEffect(() => {
    if (!needsPlanCatalog) return;
    void loadPlanCatalog();
  }, [needsPlanCatalog]);

  useEffect(() => {
    if (!showPosPreviewAndInlineReports) return;
    void loadAdvancedReports();
  }, [showPosPreviewAndInlineReports]);

  const toggleFacility = (facilityId: string) => {
    setPlanForm((prev) => {
      const exists = prev.facilityIds.includes(facilityId);
      return {
        ...prev,
        facilityIds: exists ? prev.facilityIds.filter((id) => id !== facilityId) : [...prev.facilityIds, facilityId],
      };
    });
  };

  const resetPlanForm = () => {
    setEditingPlanId('');
    setPlanForm((prev) => ({
      ...prev,
      name: '',
      tierName: '',
      description: '',
      planType: 'paid',
      status: 'active',
      billingCycle: 'monthly',
      durationDays: '30',
      gracePeriodDays: '0',
      trialPeriodDays: '0',
      price: '',
      oneTimeFeeEnabled: false,
      oneTimeFeeAmount: '0',
      autoRenew: false,
      bookingDiscountPercentage: '0',
      flatDiscountAmount: '0',
      rewardPointsMultiplier: '1',
      freeServiceItemsText: '',
      accessRestrictionsText: '',
      sessionsLimit: '0',
      memberVisitLimit: '0',
      pointsPerCurrency: '0',
      pointsRedemptionValue: '0',
      minimumRedeemPoints: '0',
      pointsExpiryDays: '0',
      facilityIds: [],
      active: true,
    }));
  };

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlan(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        name: planForm.name.trim(),
        tierName: planForm.tierName.trim(),
        description: planForm.description.trim(),
        planType: planForm.planType,
        status: planForm.status,
        active: Boolean(planForm.active),
        facilityType: planForm.facilityType.trim() || 'custom',
        facilityIds: planForm.facilityIds,
        billingCycle: planForm.billingCycle,
        durationDays: Number(planForm.durationDays || 0),
        gracePeriodDays: Number(planForm.gracePeriodDays || 0),
        trialPeriodDays: Number(planForm.trialPeriodDays || 0),
        price: Number(planForm.price || 0),
        oneTimeFeeEnabled: Boolean(planForm.oneTimeFeeEnabled),
        oneTimeFeeAmount: Number(planForm.oneTimeFeeAmount || 0),
        autoRenew: Boolean(planForm.autoRenew),
        bookingDiscountPercentage: Number(planForm.bookingDiscountPercentage || 0),
        flatDiscountAmount: Number(planForm.flatDiscountAmount || 0),
        rewardPointsMultiplier: Number(planForm.rewardPointsMultiplier || 1),
        freeServiceItems: parseCsv(planForm.freeServiceItemsText),
        accessRestrictions: parseCsv(planForm.accessRestrictionsText),
        sessionsLimit: Number(planForm.sessionsLimit || 0),
        memberVisitLimit: Number(planForm.memberVisitLimit || 0),
        pointsPerCurrency: Number(planForm.pointsPerCurrency || 0),
        pointsRedemptionValue: Number(planForm.pointsRedemptionValue || 0),
        minimumRedeemPoints: Number(planForm.minimumRedeemPoints || 0),
        pointsExpiryDays: Number(planForm.pointsExpiryDays || 0),
      };

      if (editingPlanId) {
        await fetchApiJson(apiUrl(`/api/memberships/plans/${editingPlanId}`), { method: 'PUT', headers, body: JSON.stringify(payload) });
        setMessage('Membership plan updated');
      } else {
        await fetchApiJson(apiUrl('/api/memberships/plans'), { method: 'POST', headers, body: JSON.stringify(payload) });
        setMessage('Membership plan created');
      }
      resetPlanForm();
      await loadPlanCatalog(true);
      await loadDashboardReports();
    } catch (e: any) {
      setError(e.message || 'Failed to save plan');
    } finally {
      setSavingPlan(false);
    }
  };

  const startEditPlan = (plan: Plan) => {
    setEditingPlanId(plan._id);
    setPlanForm({
      name: plan.name || '',
      tierName: plan.tierName || '',
      description: plan.description || '',
      planType: plan.planType || 'paid',
      status: plan.status || (plan.active ? 'active' : 'inactive'),
      facilityType: plan.facilityType || '',
      facilityIds: Array.isArray(plan.facilityIds) ? plan.facilityIds.map((f) => f._id) : [],
      billingCycle: plan.billingCycle || 'monthly',
      durationDays: String(plan.durationDays || 30),
      gracePeriodDays: String(plan.gracePeriodDays || 0),
      trialPeriodDays: String(plan.trialPeriodDays || 0),
      price: String(plan.price || 0),
      oneTimeFeeEnabled: Boolean(plan.oneTimeFeeEnabled),
      oneTimeFeeAmount: String(plan.oneTimeFeeAmount || 0),
      autoRenew: Boolean(plan.autoRenew),
      bookingDiscountPercentage: String(plan.bookingDiscountPercentage || 0),
      flatDiscountAmount: String(plan.flatDiscountAmount || 0),
      rewardPointsMultiplier: String(plan.rewardPointsMultiplier || 1),
      freeServiceItemsText: (plan.freeServiceItems || []).join(', '),
      accessRestrictionsText: (plan.accessRestrictions || []).join(', '),
      sessionsLimit: String(plan.sessionsLimit || 0),
      memberVisitLimit: String(plan.memberVisitLimit || 0),
      pointsPerCurrency: String(plan.pointsPerCurrency || 0),
      pointsRedemptionValue: String(plan.pointsRedemptionValue || 0),
      minimumRedeemPoints: String(plan.minimumRedeemPoints || 0),
      pointsExpiryDays: String(plan.pointsExpiryDays || 0),
      active: plan.active !== false,
    });
  };

  const quickPlanAction = async (planId: string, action: 'duplicate' | 'archive' | 'activate' | 'deactivate') => {
    try {
      if (action === 'duplicate') {
        await fetchApiJson(apiUrl(`/api/memberships/plans/${planId}/duplicate`), { method: 'POST', headers });
      } else if (action === 'archive') {
        await fetchApiJson(apiUrl(`/api/memberships/plans/${planId}/archive`), { method: 'PUT', headers });
      } else {
        await fetchApiJson(apiUrl(`/api/memberships/plans/${planId}/status`), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ status: action === 'activate' ? 'active' : 'inactive' }),
        });
      }
      setMessage(`Plan ${action} successful`);
      await loadPlanCatalog(true);
    } catch (e: any) {
      setError(e.message || `Failed to ${action} plan`);
    }
  };

  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMember(true);
    setError('');
    setMessage('');
    try {
      if (subForm.editId) {
        await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${subForm.editId}/profile`), {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            memberName: subForm.memberName,
            fullName: subForm.fullName,
            phone: subForm.phone,
            email: subForm.email,
            address: subForm.address,
            emergencyContact: subForm.emergencyContact,
            dateOfBirth: subForm.dateOfBirth || undefined,
            gender: subForm.gender,
            profilePhotoUrl: subForm.profilePhotoUrl || undefined,
            languagePreference: subForm.languagePreference || 'en',
            themePreference: subForm.themePreference || 'dark',
            bookingDiscountPercentage: subForm.bookingDiscountPercentage ? Number(subForm.bookingDiscountPercentage) : undefined,
            validityReminderDays: Number(subForm.validityReminderDays || 7),
            notes: subForm.notes,
          }),
        });
        setMessage('Member profile updated');
      } else {
        await fetchApiJson(apiUrl('/api/memberships/subscriptions'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            memberName: subForm.memberName,
            fullName: subForm.fullName,
            phone: subForm.phone,
            email: subForm.email,
            address: subForm.address,
            emergencyContact: subForm.emergencyContact,
            dateOfBirth: subForm.dateOfBirth || undefined,
            gender: subForm.gender,
            profilePhotoUrl: subForm.profilePhotoUrl || undefined,
            languagePreference: subForm.languagePreference || 'en',
            themePreference: subForm.themePreference || 'dark',
            planId: subForm.planId,
            startDate: subForm.startDate,
            durationValue: subForm.durationValue ? Number(subForm.durationValue) : undefined,
            durationUnit: subForm.durationUnit,
            amountPaid: subForm.amountPaid ? Number(subForm.amountPaid) : undefined,
            bookingDiscountPercentage: subForm.bookingDiscountPercentage ? Number(subForm.bookingDiscountPercentage) : undefined,
            validityReminderDays: Number(subForm.validityReminderDays || 7),
            notes: subForm.notes,
          }),
        });
        setMessage('Subscription created');
      }
      setSubForm((prev) => ({
        ...prev,
        editId: '',
        memberName: '',
        fullName: '',
        phone: '',
        email: '',
        address: '',
        emergencyContact: '',
        dateOfBirth: '',
        profilePhotoUrl: '',
        languagePreference: 'en',
        themePreference: 'dark',
        amountPaid: '',
        bookingDiscountPercentage: '',
        validityReminderDays: '7',
        durationValue: '',
        durationUnit: 'months',
        notes: '',
      }));
      await loadMemberWorkspaceData();
      await loadDashboardReports();
      if (advancedReportsLoaded) {
        await loadAdvancedReports(true);
      }
      if (mode === 'all') {
        setMemberTab('list');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save member');
    } finally {
      setSavingMember(false);
    }
  };

  const memberLifecycle = async (sub: Subscription, action: 'upgrade' | 'downgrade' | 'extend' | 'cancel' | 'suspend' | 'pause' | 'resume') => {
    try {
      const body: any = { action };
      if (action === 'upgrade' || action === 'downgrade') {
        const targetPlanId = await showPromptDialog(`Enter target plan ID for ${action}.`, {
          title: `${action === 'upgrade' ? 'Upgrade' : 'Downgrade'} Membership`,
          label: 'Target plan ID',
          confirmText: 'Continue',
          required: true,
        });
        if (!targetPlanId) return;
        body.targetPlanId = targetPlanId.trim();
      }
      if (action === 'extend') {
        const days = await showPromptDialog('Extend by how many days?', {
          title: 'Extend Membership',
          label: 'Days',
          defaultValue: '30',
          inputType: 'number',
          confirmText: 'Extend',
          required: true,
        });
        if (!days) return;
        body.days = Number(days);
      }
      body.notes = (await showPromptDialog(`Notes for ${action} (optional).`, {
        title: 'Membership Notes',
        label: 'Notes',
        defaultValue: '',
        inputType: 'textarea',
        confirmText: 'Save',
      })) || '';
      await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${sub._id}/lifecycle`), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      setMessage(`Membership ${action} done`);
      await loadMemberWorkspaceData();
      await loadDashboardReports();
    } catch (e: any) {
      setError(e.message || `Failed to ${action}`);
    }
  };

  const renewMember = async (sub: Subscription) => {
    try {
      const renewalType = ((await showPromptDialog('Renewal type: manual / partial / auto', {
        title: 'Renew Membership',
        label: 'Renewal type',
        defaultValue: 'manual',
        confirmText: 'Next',
        required: true,
      })) || 'manual').toLowerCase();
      const days = await showPromptDialog('Days to extend (blank to use plan default)', {
        title: 'Renew Membership',
        label: 'Days to extend',
        defaultValue: '',
        inputType: 'number',
        confirmText: 'Next',
      });
      const amountPaid = await showPromptDialog('Renewal amount paid', {
        title: 'Renew Membership',
        label: 'Amount paid',
        defaultValue: '0',
        inputType: 'number',
        confirmText: 'Renew',
        required: true,
      });
      await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${sub._id}/renew`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          renewalType,
          days: days ? Number(days) : undefined,
          amountPaid: Number(amountPaid || 0),
        }),
      });
      setMessage('Membership renewed');
      await loadMemberWorkspaceData();
      await loadDashboardReports();
      if (advancedReportsLoaded) {
        await loadAdvancedReports(true);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to renew');
    }
  };

  const adjustPoints = async (sub: Subscription) => {
    try {
      const action = ((await showPromptDialog('Points action: earned / redeemed / expired / adjusted', {
        title: 'Adjust Points',
        label: 'Points action',
        defaultValue: 'earned',
        confirmText: 'Next',
        required: true,
      })) || 'earned').toLowerCase();
      const points = Number((await showPromptDialog('Points value', {
        title: 'Adjust Points',
        label: 'Points value',
        defaultValue: '0',
        inputType: 'number',
        confirmText: 'Update Points',
        required: true,
      })) || 0);
      if (points <= 0) return;
      await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${sub._id}/points`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, points }),
      });
      setMessage('Points updated');
      await loadMemberWorkspaceData();
    } catch (e: any) {
      setError(e.message || 'Failed to adjust points');
    }
  };

  const startEditMember = (sub: Subscription) => {
    if (mode === 'all') {
      setWorkspaceTab('member');
    }
    setMemberTab('create');
    setSubForm({
      editId: sub._id,
      memberName: sub.memberName || '',
      fullName: sub.fullName || '',
      phone: sub.phone || '',
      email: sub.email || '',
      address: sub.address || '',
      emergencyContact: String((sub as any).emergencyContact || ''),
      dateOfBirth: sub.dateOfBirth ? String(sub.dateOfBirth).slice(0, 10) : '',
      gender: sub.gender || 'prefer_not_to_say',
      profilePhotoUrl: (sub as any).profilePhotoUrl || '',
      languagePreference: String((sub as any).languagePreference || 'en'),
      themePreference: String((sub as any).themePreference || 'dark'),
      planId: sub.planId?._id || '',
      startDate: toDateInput(new Date(sub.startDate)),
      amountPaid: String(sub.amountPaid || ''),
      bookingDiscountPercentage: String(sub.bookingDiscountPercentage ?? ''),
      validityReminderDays: String(sub.validityReminderDays ?? 7),
      durationValue: '',
      durationUnit: 'months',
      notes: String((sub as any).notes || ''),
    });
  };

  const previewPosBenefits = async () => {
    try {
      const data = await fetchApiJson(apiUrl('/api/memberships/pos/apply-benefits'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mobile: posForm.mobile,
          cartTotal: Number(posForm.cartTotal || 0),
          redeemPoints: Number(posForm.redeemPoints || 0),
          commit: false,
        }),
      });
      setPosPreview(data.data || null);
    } catch (e: any) {
      setPosPreview(null);
      setError(e.message || 'POS preview failed');
    }
  };

  const loadMemberDetails = async (memberId: string) => {
    if (mode === 'all') {
      setWorkspaceTab('member');
    }
    setMemberDetailsLoading(true);
    setSelectedMemberId(memberId);
    try {
      const data = await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${memberId}/profile-details`), { headers });
      setMemberDetails(data?.data || null);
      const suggested = String(data?.data?.membership?.reminderType || 'd3');
      setReminderType(suggested);
      setReminderChannels((prev) => (prev.length ? prev : ['sms', 'email']));
    } catch (e: any) {
      setMemberDetails(null);
      setError(e.message || 'Failed to load member details');
    } finally {
      setMemberDetailsLoading(false);
    }
  };

  const toggleReminderChannel = (channel: string) => {
    setReminderChannels((prev) => (
      prev.includes(channel) ? prev.filter((row) => row !== channel) : [...prev, channel]
    ));
  };

  const sendMemberReminder = async () => {
    if (!selectedMemberId) return;
    if (!reminderChannels.length) {
      setError('Select at least one reminder channel');
      return;
    }
    try {
      if (reminderChannels.includes('email')) {
        const previewData = await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${selectedMemberId}/reminders/send`), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            reminderType,
            channels: reminderChannels,
            dryRun: true,
          }),
        });
        const preview = previewData?.data?.preview || {};
        const confirmed = await showConfirmDialog(
          [
            `Send membership reminder to ${preview.memberName || memberDetails?.profile?.memberName || 'selected member'}?`,
            `Email: ${preview.email || 'missing'}`,
            `Channels: ${reminderChannels.join(', ').toUpperCase()}`,
            `Subject: ${preview.subject || '-'}`,
            '',
            preview.message || '',
          ].join('\n'),
          {
            title: 'Confirm Reminder Email',
            confirmText: 'Send Reminder',
            cancelText: 'Review Again',
            severity: 'warning',
          }
        );
        if (!confirmed) return;
      }
      await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${selectedMemberId}/reminders/send`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reminderType,
          channels: reminderChannels,
          confirmSend: reminderChannels.includes('email'),
        }),
      });
      setMessage('Reminder sent');
      await loadMemberDetails(selectedMemberId);
      await loadMemberWorkspaceData();
      await loadDashboardReports();
      if (advancedReportsLoaded) {
        await loadAdvancedReports(true);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to send reminder');
    }
  };

  const runReminderBatch = async () => {
    try {
      const previewData = await fetchApiJson(apiUrl('/api/memberships/reminders/process-renewals'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          days: 15,
          channels: ['sms', 'email'],
          dryRun: true,
        }),
      });
      const preview = previewData?.data || {};
      const confirmed = await showConfirmDialog(
        [
          `Review renewal reminder batch before sending email.`,
          `Candidates checked: ${preview.candidates ?? 0}`,
          `Ready to send: ${preview.sentCount ?? 0}`,
          `Skipped: ${preview.skippedCount ?? 0}`,
          `Failed preview: ${preview.failedCount ?? 0}`,
          '',
          'Send SMS + Email reminders now?',
        ].join('\n'),
        {
          title: 'Confirm Renewal Reminder Batch',
          confirmText: 'Send Batch',
          cancelText: 'Cancel',
          severity: 'warning',
        }
      );
      if (!confirmed) return;
      await fetchApiJson(apiUrl('/api/memberships/reminders/process-renewals'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          days: 15,
          channels: ['sms', 'email'],
          confirmSend: true,
        }),
      });
      setMessage('Renewal reminder batch processed');
      await loadMemberWorkspaceData();
      await loadDashboardReports();
      if (advancedReportsLoaded) {
        await loadAdvancedReports(true);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to process renewal reminder batch');
    }
  };

  const runLifecycleSync = async () => {
    try {
      await fetchApiJson(apiUrl('/api/memberships/lifecycle/sync'), {
        method: 'POST',
        headers,
      });
      setMessage('Membership lifecycle sync completed');
      await loadMemberWorkspaceData();
      await loadDashboardReports();
      if (advancedReportsLoaded) {
        await loadAdvancedReports(true);
      }
      if (selectedMemberId) await loadMemberDetails(selectedMemberId);
    } catch (e: any) {
      setError(e.message || 'Failed to run lifecycle sync');
    }
  };

  const searchMembers = async () => {
    await loadMemberWorkspaceData(memberSearchInput);
  };

  const clearMemberSearch = async () => {
    setMemberSearchInput('');
    await loadMemberWorkspaceData('');
  };

  const handleMemberPhotoUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid member photo image.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('Member photo should be less than 6 MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSubForm((prev) => ({ ...prev, profilePhotoUrl: dataUrl }));
      setError('');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Failed to read member photo');
    }
  };

  const memberCardData = useMemo(() => {
    if (!memberDetails?.profile || !memberDetails?.membership) return null;

    const benefitLines = Array.from(
      new Set(
        [
          ...(Array.isArray(memberDetails?.plan?.facilityNames) ? memberDetails.plan.facilityNames : []),
          ...(Array.isArray(memberDetails?.plan?.freeServiceItems) ? memberDetails.plan.freeServiceItems : []),
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 3);

    const displayName = String(memberDetails.profile.fullName || memberDetails.profile.memberName || '').trim() || 'Member';
    const cardLevel = String(memberDetails?.plan?.levelLabel || memberDetails?.plan?.tierName || memberDetails?.plan?.name || 'Member').trim();
    const photoUrl = resolveStoredImageUrl(memberDetails?.profile?.profilePhotoUrl || '');

    return {
      displayName,
      memberCode: String(memberDetails?.profile?.memberCode || '-').trim() || '-',
      cardLevel: cardLevel || 'Member',
      validUntilLabel: monthYearLabel(memberDetails?.membership?.endDate),
      photoUrl,
      initials: displayName.slice(0, 1).toUpperCase(),
      benefitLines: benefitLines.length ? benefitLines : ['Member access benefits'],
    };
  }, [memberDetails]);

  const memberCardBenefitPreviewLines = useMemo(
    () => ['SWIMMING POOL', 'FULLY EQUIPPED GYM', 'BADMINTON COURTS'],
    []
  );

  const reminderWarningMap = useMemo(
    () => new Map(reminderWarningRows.map((row) => [row.memberId, row])),
    [reminderWarningRows]
  );

  const reminderQueueRows = useMemo<ReminderQueueRow[]>(
    () =>
      expiringAlerts
        .map((sub) => {
          const warning = reminderWarningMap.get(sub._id);
          const email = String(warning?.email || sub.email || '').trim();
          return {
            memberId: sub._id,
            memberName: sub.memberName,
            memberCode: sub.memberCode || warning?.memberCode || '',
            phone: String(warning?.phone || sub.phone || '').trim(),
            email,
            endDate: sub.endDate,
            planName: warning?.planName || sub.planId?.name || '-',
            reminderType: warning?.reminderType || String((sub as any).reminderType || '').trim() || 'upcoming',
            emailReady: warning?.emailReady ?? Boolean(email),
            emailSentToday: warning?.emailSentToday ?? false,
            daysRemaining: daysUntilDate(sub.endDate),
            source: sub,
          };
        })
        .sort((left, right) => new Date(left.endDate).getTime() - new Date(right.endDate).getTime()),
    [expiringAlerts, reminderWarningMap]
  );

  const reminderQueueSummary = useMemo(
    () => ({
      total: reminderQueueRows.length,
      dueToday: reminderQueueRows.filter((row) => row.daysRemaining === 0).length,
      dueThisWeek: reminderQueueRows.filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7).length,
      mailReady: reminderQueueRows.filter((row) => row.emailReady).length,
      missingEmail: reminderQueueRows.filter((row) => !row.emailReady).length,
      sentToday: reminderQueueRows.filter((row) => row.emailSentToday).length,
    }),
    [reminderQueueRows]
  );

  const filteredReminderQueueRows = useMemo(() => {
    const normalizedSearch = String(reminderQueueSearch || '').trim().toLowerCase();
    return reminderQueueRows.filter((row) => {
      const matchesSearch =
        !normalizedSearch
        || [row.memberName, row.memberCode, row.phone, row.email, row.planName]
          .some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      if (!matchesSearch) return false;

      switch (reminderQueueFilter) {
        case 'due_today':
          return row.daysRemaining === 0;
        case 'due_7_days':
          return row.daysRemaining >= 0 && row.daysRemaining <= 7;
        case 'mail_ready':
          return row.emailReady;
        case 'missing_email':
          return !row.emailReady;
        case 'sent_today':
          return row.emailSentToday;
        case 'all':
        default:
          return true;
      }
    });
  }, [reminderQueueFilter, reminderQueueRows, reminderQueueSearch]);

  const reminderQueuePagination = usePaginatedRows(filteredReminderQueueRows, {
    initialPageSize: 10,
    resetDeps: [reminderQueueSearch, reminderQueueFilter, reminderQueueRows.length],
  });

  const renderMemberIdCardCanvas = async (scale = 3): Promise<HTMLCanvasElement> => {
    if (!memberCardData) {
      throw new Error('Open a member profile first to preview the ID card.');
    }

    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await document.fonts.ready;
      } catch {
        // Continue even if the browser cannot confirm font readiness.
      }
    }

    const cardWidth = 1083;
    const cardHeight = 750;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cardWidth * scale);
    canvas.height = Math.round(cardHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to prepare ID card export.');
    }

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const templateImage = await loadCanvasFriendlyImage(memberCardTemplateUrl);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cardWidth, cardHeight);
    ctx.drawImage(templateImage, 0, 0, cardWidth, cardHeight);

    const detailRows = [
      ['Name', memberCardData.displayName],
      ['Member Code', memberCardData.memberCode],
      ['Level', memberCardData.cardLevel],
      ['Valid Until', memberCardData.validUntilLabel],
    ];
    const detailsX = 82;
    const detailsY = 352;
    const rowGap = 46;
    const labelWidth = 178;
    const colonX = detailsX + labelWidth + 12;
    const valueX = colonX + 26;
    const valueMaxWidth = 330;

    detailRows.forEach(([label, value], index) => {
      const rowY = detailsY + rowGap * index;
      drawFittedCanvasText(ctx, label, detailsX, rowY, labelWidth, {
        color: '#474747',
        maxFontSize: 24,
        minFontSize: 20,
        weight: 500,
      });
      applyCanvasFont(ctx, 500, 24);
      ctx.fillStyle = '#474747';
      ctx.fillText(':', colonX, rowY);
      drawFittedCanvasText(ctx, value, valueX, rowY, valueMaxWidth, {
        color: '#2d3d50',
        maxFontSize: 25,
        minFontSize: 20,
        weight: 650,
      });
    });

    const copyX = 79;
    const copyY = 548;
    applyCanvasFont(ctx, 700, 11.2);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillText('THIS CARD ENTITLES TO FULL ACCESS AND ENJOYMENT OF', copyX, copyY);
    ctx.fillText('THE PREMIUM FACILITIES AT SPARK7 SPORTS ARENA,', copyX, copyY + 17);
    ctx.fillText('INCLUDING:', copyX, copyY + 34);

    const bulletColors = ['#f97316', '#15945f', '#38bdf8'];
    memberCardBenefitPreviewLines.forEach((line, index) => {
      const bulletY = 607 + index * 18;
      ctx.fillStyle = bulletColors[index] || '#f97316';
      ctx.beginPath();
      ctx.arc(copyX + 4, bulletY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      drawFittedCanvasText(ctx, line, copyX + 17, bulletY, 245, {
        color: '#353535',
        maxFontSize: 12,
        minFontSize: 9.5,
        weight: 700,
      });
    });

    const footerX = 78;
    const footerY = 706;
    ctx.fillStyle = '#222222';
    ctx.fillRect(footerX, footerY - 23, 132, 2.5);
    const footerTextGroups: Array<{ icon: 'web' | 'mail' | 'phone'; text: string }> = [
      { icon: 'web', text: 'WWW.SPARK7.IN' },
      { icon: 'mail', text: 'CONTACT@SPARK7.IN' },
      { icon: 'phone', text: '9980100494 / 7349588884' },
    ];
    let footerFontSize = 16.2;
    let footerLetterSpacing = 0.34;
    const footerIconSize = 14;
    const footerIconGap = 5.5;
    const footerGroupGap = 15;
    const footerMaxWidth = 830;
    const measureFooterWidth = () =>
      footerTextGroups.reduce(
        (width, group) => width + footerIconSize + footerIconGap + measureSpacedCanvasText(ctx, group.text, footerLetterSpacing),
        footerGroupGap * (footerTextGroups.length - 1)
      );
    applyCanvasFont(ctx, 800, footerFontSize);
    while (measureFooterWidth() > footerMaxWidth && footerFontSize > 13.4) {
      footerFontSize -= 0.25;
      footerLetterSpacing = Math.max(0.12, footerLetterSpacing - 0.025);
      applyCanvasFont(ctx, 800, footerFontSize);
    }
    ctx.fillStyle = '#222222';
    footerTextGroups.reduce((cursorX, group) => {
      drawMemberCardFooterIcon(ctx, group.icon, cursorX, footerY, footerIconSize);
      const textX = cursorX + footerIconSize + footerIconGap;
      const nextX = drawSpacedCanvasText(ctx, group.text, textX, footerY, footerLetterSpacing);
      return nextX + footerGroupGap;
    }, footerX);

    const photoFrame = { x: 623, y: 300, width: 218, height: 236, radius: 20 };
    const photoImageBox = {
      x: photoFrame.x + 5,
      y: photoFrame.y + 5,
      width: photoFrame.width - 10,
      height: photoFrame.height - 10,
      radius: photoFrame.radius - 4,
    };
    ctx.save();
    ctx.shadowColor = 'rgba(25, 111, 67, 0.22)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    buildRoundedRectPath(ctx, photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius);
    ctx.fill();
    ctx.restore();

    let didDrawPhoto = false;
    ctx.save();
    buildRoundedRectPath(ctx, photoImageBox.x, photoImageBox.y, photoImageBox.width, photoImageBox.height, photoImageBox.radius);
    ctx.clip();
    if (memberCardData.photoUrl) {
      const photoImage = await loadCanvasFriendlyImage(memberCardData.photoUrl).catch(() => null);
      if (photoImage) {
        drawCoverCanvasImage(ctx, photoImage, photoImageBox.x, photoImageBox.y, photoImageBox.width, photoImageBox.height);
        didDrawPhoto = true;
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(photoImageBox.x, photoImageBox.y, photoImageBox.width, photoImageBox.height);
      }
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(photoImageBox.x, photoImageBox.y, photoImageBox.width, photoImageBox.height);
    }
    ctx.restore();

    if (!didDrawPhoto) {
      applyCanvasFont(ctx, 700, 72);
      ctx.fillStyle = '#1a8b64';
      ctx.textAlign = 'center';
      ctx.fillText(memberCardData.initials, photoFrame.x + photoFrame.width / 2, photoFrame.y + photoFrame.height / 2 + 4);
      ctx.textAlign = 'left';
    }

    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1f7a45';
    buildRoundedRectPath(ctx, photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius);
    ctx.stroke();
    ctx.restore();

    return canvas;
  };

  const captureMemberIdCardDataUrl = async (): Promise<string> => {
    const canvas = await renderMemberIdCardCanvas(3);
    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    let cancelled = false;

    if (!memberCardData) {
      setMemberCardPreviewUrl('');
      return () => {
        cancelled = true;
      };
    }

    const refreshPreview = async () => {
      try {
        const canvas = await renderMemberIdCardCanvas(3);
        if (!cancelled) {
          setMemberCardPreviewUrl(canvas.toDataURL('image/png'));
        }
      } catch {
        if (!cancelled) {
          setMemberCardPreviewUrl('');
        }
      }
    };

    void refreshPreview();
    return () => {
      cancelled = true;
    };
  }, [memberCardData, memberCardTemplateUrl, memberCardBenefitPreviewLines]);

  const downloadMemberIdCard = async () => {
    if (!canPrintMemberCards) {
      setError('Only admin or super admin can download member ID cards.');
      return;
    }

    try {
      setMemberCardBusyAction('download');
      setError('');
      const canvas = await renderMemberIdCardCanvas(3);
      const blob = await canvasToBlob(canvas, 'image/png');
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${fileSafe(memberCardData?.memberCode || memberCardData?.displayName || 'member')}-id-card.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (downloadError: any) {
      setError(downloadError?.message || 'Failed to download member ID card');
    } finally {
      setMemberCardBusyAction('');
    }
  };

  const downloadMemberIdCardPdf = async () => {
    if (!canPrintMemberCards) {
      setError('Only admin or super admin can download member ID cards as PDF.');
      return;
    }

    try {
      setMemberCardBusyAction('pdf');
      setError('');
      const canvas = await renderMemberIdCardCanvas(3);
      const pngDataUrl = canvas.toDataURL('image/png');
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [1083, 750],
        compress: true,
      });
      pdf.addImage(pngDataUrl, 'PNG', 0, 0, 1083, 750, undefined, 'FAST');
      pdf.save(`${fileSafe(memberCardData?.memberCode || memberCardData?.displayName || 'member')}-id-card.pdf`);
    } catch (pdfError: any) {
      setError(pdfError?.message || 'Failed to download member ID card PDF');
    } finally {
      setMemberCardBusyAction('');
    }
  };

  const printMemberIdCard = async () => {
    if (!canPrintMemberCards) {
      setError('Only admin or super admin can print member ID cards.');
      return;
    }

    try {
      setMemberCardBusyAction('print');
      setError('');
      const dataUrl = await captureMemberIdCardDataUrl();
      const printWindow = window.open('', '_blank', 'width=1100,height=760');
      if (!printWindow) {
        throw new Error('Allow popups in the browser to print member ID cards.');
      }

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>Member ID Card</title>
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; background: #0f172a; }
      body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 18px; }
      img { width: min(96vw, 1083px); height: auto; display: block; border-radius: 18px; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.45); }
      @page { size: landscape; margin: 10mm; }
      @media print {
        html, body { background: #fff; min-height: auto; padding: 0; }
        img { width: 100%; box-shadow: none; border-radius: 0; }
      }
    </style>
  </head>
  <body>
    <img src="${dataUrl}" alt="Member ID Card" />
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
      printWindow.document.close();
    } catch (printError: any) {
      setError(printError?.message || 'Failed to print member ID card');
    } finally {
      setMemberCardBusyAction('');
    }
  };

  const openMemberIdCard = async (memberId: string) => {
    if (mode === 'all') {
      setWorkspaceTab('member');
      setMemberTab('list');
    }
    await loadMemberDetails(memberId);
    setTimeout(() => {
      memberIdCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-400';
  const fieldLabelClass = 'mb-1 block text-xs font-medium text-gray-300';

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{pageTitle}</h1>
        <p className="text-sm text-gray-300">{pageSubtitle}</p>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      {showWorkspaceTabs && (
        <CardTabs
          ariaLabel="Membership workspace tabs"
          items={[
            { key: 'member', label: 'Member Subscriptions' },
            { key: 'plan', label: 'Create Plan (Admin)' },
            { key: 'pos', label: 'POS Benefit Preview' },
          ]}
          activeKey={workspaceTab}
          onChange={setWorkspaceTab}
          listClassName="flex flex-wrap gap-2 border-b-0 px-0 pt-0"
        />
      )}

      {showDashboardCards && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <div className="rounded border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Active Members</p>
              <p className="mt-2 text-2xl font-semibold text-white">{reportSummary.activeMembersCount}</p>
              <p className="mt-1 text-[11px] text-gray-500">{dashboardReportsLoading ? 'Refreshing dashboard...' : 'Current live subscriptions'}</p>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-amber-200">Expiring (7d)</p>
              <p className="mt-2 text-2xl font-semibold text-amber-200">{dashboard.expiringCount}</p>
              <p className="mt-1 text-[11px] text-gray-500">Immediate renewal watchlist</p>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-indigo-200">Renewal Queue (30d)</p>
              <p className="mt-2 text-2xl font-semibold text-white">{reminderQueueSummary.total}</p>
              <p className="mt-1 text-[11px] text-gray-500">Paged queue for 100+ renewals</p>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-sky-200">Mail Warnings Due</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-200">{dashboard.emailWarningDue}</p>
              <p className="mt-1 text-[11px] text-gray-500">{dashboard.missingEmailWarningCount} missing email</p>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">Renewal Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(dashboard.renewalRevenue)}</p>
              <p className="mt-1 text-[11px] text-gray-500">{dashboard.renewedThisMonth} renewals this month</p>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-200">ID Card Printing</p>
              <p className="mt-2 text-lg font-semibold text-white">{canPrintMemberCards ? 'Ready In Member Subscriptions' : 'Admin / Super Admin Only'}</p>
              <p className="mt-1 text-[11px] text-gray-500">Open any member row and use `ID Card`</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Membership Dashboard</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Member subscriptions come first, with renewals and ID cards on the same desk</h2>
                <p className="mt-2 max-w-4xl text-sm text-gray-300">
                  The dashboard is optimized for daily membership work: open the member list first, search quickly, manage renewal queues in pages,
                  and print or download ID cards directly from the subscription row without opening a separate tool.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceTab('member');
                    setMemberTab('list');
                  }}
                  className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                >
                  Open Member Subscriptions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceTab('member');
                    setMemberTab('create');
                  }}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/5"
                >
                  Create Member Subscription
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Most Popular Plan</p>
                <p className="mt-2 text-sm font-semibold text-white">{reportSummary.mostPopularPlanName}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Grace Period</p>
                <p className="mt-2 text-sm font-semibold text-white">{lifecycleStats.currentlyInGracePeriod}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Due Today</p>
                <p className="mt-2 text-sm font-semibold text-white">{reminderQueueSummary.dueToday}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Ready For Email</p>
                <p className="mt-2 text-sm font-semibold text-white">{reminderQueueSummary.mailReady}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAutomationActions && (
        <div className="flex flex-wrap gap-2">
          <button onClick={runReminderBatch} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-400">Run Renewal Reminder Batch (SMS+Email)</button>
          <button onClick={runLifecycleSync} className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400">Run Lifecycle Sync</button>
        </div>
      )}

      {showMemberTabs && (
        <CardTabs
          ariaLabel="Membership tabs"
          items={[
            { key: 'list', label: 'Member List' },
            { key: 'create', label: 'Create Member Subscription' },
          ]}
          activeKey={memberTab}
          onChange={setMemberTab}
          listClassName="flex flex-wrap gap-2 border-b-0 px-0 pt-0"
        />
      )}

      {(showPlanForm || showMemberForm) && (
      <div className={`grid grid-cols-1 gap-5 ${showPlanForm && showMemberForm ? 'xl:grid-cols-2' : ''}`}>
        {showPlanForm && (
        <form onSubmit={savePlan} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">{editingPlanId ? 'Edit Plan' : 'Create Plan (Admin)'}</h2>
            <ManualHelpLink anchor="transaction-membership-plan" />
          </div>
          <div>
            <label className={fieldLabelClass}>Plan Name</label>
            <input title="Unique plan name shown to staff and members." className={inputClass} required placeholder="Plan Name" value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={fieldLabelClass}>Membership Level</label>
            <input
              title="Level label shown on member ID cards, such as Platinum or Gold."
              className={inputClass}
              placeholder="Membership Level / Tier"
              value={planForm.tierName}
              onChange={(e) => setPlanForm((p) => ({ ...p, tierName: e.target.value }))}
            />
          </div>
          <div>
            <label className={fieldLabelClass}>Description</label>
            <textarea title="Short summary of this membership plan." className={`${inputClass} min-h-[64px]`} placeholder="Description" value={planForm.description} onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Plan Type</p>
            <p>Status</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select title="Choose whether this plan is paid or free." className={inputClass} value={planForm.planType} onChange={(e) => setPlanForm((p) => ({ ...p, planType: e.target.value }))}><option value="paid">Paid</option><option value="free">Free</option></select>
            <select title="Only active plans can be assigned to new members." className={inputClass} value={planForm.status} onChange={(e) => setPlanForm((p) => ({ ...p, status: e.target.value }))}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Facility Type Label</p>
            <p>Billing Cycle</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input title="Optional facility type label for this plan." className={inputClass} placeholder="Facility Type Label" value={planForm.facilityType} onChange={(e) => setPlanForm((p) => ({ ...p, facilityType: e.target.value }))} />
            <select title="Billing cycle determines default plan duration." className={inputClass} value={planForm.billingCycle} onChange={(e) => setPlanForm((p) => ({ ...p, billingCycle: e.target.value }))}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half_yearly">Half-Yearly</option><option value="yearly">Yearly</option><option value="custom">Custom</option></select>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <p className="mb-1 text-xs text-gray-300">Facilities</p>
            {plansLoading && <p className="mb-2 text-xs text-gray-500">Loading facility options...</p>}
            <div className="grid grid-cols-2 gap-1">
              {facilities.map((facility) => (
                <label key={facility._id} className="flex items-center gap-2 text-xs text-gray-200">
                  <input type="checkbox" checked={planForm.facilityIds.includes(facility._id)} onChange={() => toggleFacility(facility._id)} />
                  {facility.name}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-300">
            <p>Validity Days</p>
            <p>Grace Days</p>
            <p>Trial Days</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input title="Membership validity period in days." className={inputClass} type="number" min="1" placeholder="Validity Days" value={planForm.durationDays} onChange={(e) => setPlanForm((p) => ({ ...p, durationDays: e.target.value }))} />
            <input title="Extra grace days after expiry before full expiration." className={inputClass} type="number" min="0" placeholder="Grace Days" value={planForm.gracePeriodDays} onChange={(e) => setPlanForm((p) => ({ ...p, gracePeriodDays: e.target.value }))} />
            <input title="Optional free trial days added at start." className={inputClass} type="number" min="0" placeholder="Trial Days" value={planForm.trialPeriodDays} onChange={(e) => setPlanForm((p) => ({ ...p, trialPeriodDays: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-300">
            <p>Plan Price</p>
            <p>Flat Discount</p>
            <p>Discount %</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input title="Base amount charged for this plan." className={inputClass} type="number" min="0" step="0.01" placeholder="Plan Price" value={planForm.price} onChange={(e) => setPlanForm((p) => ({ ...p, price: e.target.value }))} />
            <input title="Flat discount available to member at POS." className={inputClass} type="number" min="0" step="0.01" placeholder="Flat Discount" value={planForm.flatDiscountAmount} onChange={(e) => setPlanForm((p) => ({ ...p, flatDiscountAmount: e.target.value }))} />
            <input title="Percentage discount available to member at POS." className={inputClass} type="number" min="0" max="100" step="0.01" placeholder="Discount %" value={planForm.bookingDiscountPercentage} onChange={(e) => setPlanForm((p) => ({ ...p, bookingDiscountPercentage: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-300">
            <p>Points / Currency</p>
            <p>100 Points = Value</p>
            <p>Minimum Redeem Points</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Points / Currency" value={planForm.pointsPerCurrency} onChange={(e) => setPlanForm((p) => ({ ...p, pointsPerCurrency: e.target.value }))} />
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="100 pts = Value" value={planForm.pointsRedemptionValue} onChange={(e) => setPlanForm((p) => ({ ...p, pointsRedemptionValue: e.target.value }))} />
            <input className={inputClass} type="number" min="0" step="1" placeholder="Min Redeem Points" value={planForm.minimumRedeemPoints} onChange={(e) => setPlanForm((p) => ({ ...p, minimumRedeemPoints: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-300">
            <p>Sessions Limit</p>
            <p>Visit Limit</p>
            <p>Points Multiplier</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className={inputClass} type="number" min="0" placeholder="Sessions Limit" value={planForm.sessionsLimit} onChange={(e) => setPlanForm((p) => ({ ...p, sessionsLimit: e.target.value }))} />
            <input className={inputClass} type="number" min="0" placeholder="Visit Limit" value={planForm.memberVisitLimit} onChange={(e) => setPlanForm((p) => ({ ...p, memberVisitLimit: e.target.value }))} />
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Points Multiplier" value={planForm.rewardPointsMultiplier} onChange={(e) => setPlanForm((p) => ({ ...p, rewardPointsMultiplier: e.target.value }))} />
          </div>
          <div>
            <label className={fieldLabelClass}>Free Services/Items</label>
            <input title="Optional complimentary services, comma separated." className={inputClass} placeholder="Free services/items (comma separated)" value={planForm.freeServiceItemsText} onChange={(e) => setPlanForm((p) => ({ ...p, freeServiceItemsText: e.target.value }))} />
          </div>
          <div>
            <label className={fieldLabelClass}>Access Restrictions</label>
            <input title="Optional restrictions or rules, comma separated." className={inputClass} placeholder="Access restrictions (comma separated)" value={planForm.accessRestrictionsText} onChange={(e) => setPlanForm((p) => ({ ...p, accessRestrictionsText: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={planForm.autoRenew} onChange={(e) => setPlanForm((p) => ({ ...p, autoRenew: e.target.checked }))} />Auto Renew</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={planForm.oneTimeFeeEnabled} onChange={(e) => setPlanForm((p) => ({ ...p, oneTimeFeeEnabled: e.target.checked }))} />One-Time Fee</label>
          </div>
          {planForm.oneTimeFeeEnabled && (
            <div>
              <label className={fieldLabelClass}>One-Time Fee Amount</label>
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="One-time fee amount" value={planForm.oneTimeFeeAmount} onChange={(e) => setPlanForm((p) => ({ ...p, oneTimeFeeAmount: e.target.value }))} />
            </div>
          )}
          <div className="flex gap-2">
            <button disabled={savingPlan} className="flex-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-70">{savingPlan ? 'Saving...' : editingPlanId ? 'Update Plan' : 'Create Plan'}</button>
            {editingPlanId && <button type="button" onClick={resetPlanForm} className="rounded-md border border-white/20 px-3 py-2 text-sm text-gray-200">Cancel</button>}
          </div>
        </form>
        )}

        {showMemberForm && (
        <form onSubmit={saveMember} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">{subForm.editId ? 'Edit Member Profile' : 'Create Member Subscription'}</h2>
            <ManualHelpLink anchor="transaction-membership-subscription" />
          </div>
          <div>
            <label className={fieldLabelClass}>Membership Plan</label>
            <select title="Select the membership plan to assign." className={inputClass} required value={subForm.planId} onChange={(e) => setSubForm((p) => ({ ...p, planId: e.target.value }))} disabled={Boolean(subForm.editId) || plansLoading}>
              <option value="">Select Plan</option>
              {plansLoading && <option value="" disabled>Loading plans...</option>}
              {plans.filter((p) => p.status !== 'archived').map((plan) => (
                <option key={plan._id} value={plan._id}>{plan.name} | {cycleLabel(plan.billingCycle)} | {formatCurrency(plan.price)}</option>
              ))}
            </select>
            {plansLoading && <p className="mt-1 text-xs text-gray-500">Preparing membership plan options...</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Full Name</p>
            <p>Mobile (Primary)</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input title="Primary member name used in membership records." className={inputClass} required placeholder="Full Name" value={subForm.memberName} onChange={(e) => setSubForm((p) => ({ ...p, memberName: e.target.value, fullName: e.target.value }))} />
            <input title="Primary mobile number. Must be unique." className={inputClass} required placeholder="Mobile (primary)" value={subForm.phone} onChange={(e) => setSubForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Email</p>
            <p>Date Of Birth</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input title="Optional email for renewal reminders and communication." className={inputClass} type="email" placeholder="Email" value={subForm.email} onChange={(e) => setSubForm((p) => ({ ...p, email: e.target.value }))} />
            <input title="Member date of birth." className={inputClass} type="date" value={subForm.dateOfBirth} onChange={(e) => setSubForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Emergency Contact</p>
            <p>Alternate Full Name</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input title="Optional emergency contact number." className={inputClass} placeholder="Emergency Contact" value={subForm.emergencyContact} onChange={(e) => setSubForm((p) => ({ ...p, emergencyContact: e.target.value }))} />
            <input title="Alternate display name for the member profile." className={inputClass} placeholder="Alternate Full Name" value={subForm.fullName} onChange={(e) => setSubForm((p) => ({ ...p, fullName: e.target.value }))} />
          </div>
          <div>
            <label className={fieldLabelClass}>Gender</label>
            <select title="Member gender preference." className={inputClass} value={subForm.gender} onChange={(e) => setSubForm((p) => ({ ...p, gender: e.target.value }))}>
              <option value="prefer_not_to_say">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Language Preference</p>
            <p>Theme Preference</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select title="Preferred communication language." className={inputClass} value={subForm.languagePreference} onChange={(e) => setSubForm((p) => ({ ...p, languagePreference: e.target.value }))}>
              <option value="en">Language: English</option>
              <option value="hi">Language: Hindi</option>
              <option value="ta">Language: Tamil</option>
              <option value="te">Language: Telugu</option>
              <option value="ml">Language: Malayalam</option>
            </select>
            <select title="Preferred app theme saved in profile." className={inputClass} value={subForm.themePreference} onChange={(e) => setSubForm((p) => ({ ...p, themePreference: e.target.value }))}>
              <option value="dark">Theme: Dark</option>
              <option value="light">Theme: Light</option>
            </select>
          </div>
          <div>
            <label className={fieldLabelClass}>Address</label>
            <textarea title="Member address for profile records." className={`${inputClass} min-h-[66px]`} placeholder="Address" value={subForm.address} onChange={(e) => setSubForm((p) => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <label className={fieldLabelClass}>Member Photo</label>
                <p className="text-xs text-gray-400">Upload the member photo here. It will be stored in managed storage and used later for ID card printing.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {subForm.profilePhotoUrl ? (
                    <img
                      src={resolveStoredImageUrl(subForm.profilePhotoUrl)}
                      alt={subForm.memberName || 'Member'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-semibold text-cyan-100">{(subForm.memberName || 'M').slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10">
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        void handleMemberPhotoUpload(e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {subForm.profilePhotoUrl ? (
                    <button
                      type="button"
                      onClick={() => setSubForm((p) => ({ ...p, profilePhotoUrl: '' }))}
                      className="block rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300"
                    >
                      Remove Photo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-300">
            <p>Start Date</p>
            <p>Amount Paid</p>
            <p>Discount %</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input title="Membership start date." className={inputClass} type="date" value={subForm.startDate} onChange={(e) => setSubForm((p) => ({ ...p, startDate: e.target.value }))} disabled={Boolean(subForm.editId)} />
            <input title="Initial amount paid for this subscription." className={inputClass} type="number" min="0" step="0.01" placeholder="Amount Paid" value={subForm.amountPaid} onChange={(e) => setSubForm((p) => ({ ...p, amountPaid: e.target.value }))} />
            <input title="Override plan discount percentage for this member." className={inputClass} type="number" min="0" max="100" step="0.01" placeholder="Discount %" value={subForm.bookingDiscountPercentage} onChange={(e) => setSubForm((p) => ({ ...p, bookingDiscountPercentage: e.target.value }))} />
          </div>
          {!subForm.editId && (
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-xs text-cyan-100">
              <p className="font-semibold">Membership Duration</p>
              <p className="mt-1 text-cyan-100/80">
                Leave custom duration blank to use the selected plan default: {selectedPlanDurationHint}.
                {customDurationLabel ? ` This member will use ${customDurationLabel}.` : ''}
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-300">
            <p>Reminder Days</p>
            <p>Duration Value</p>
            <p>Duration Unit</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input title="How many days before expiry to send reminders." className={inputClass} type="number" min="0" step="1" placeholder="Reminder Days" value={subForm.validityReminderDays} onChange={(e) => setSubForm((p) => ({ ...p, validityReminderDays: e.target.value }))} />
            <input
              title="Optional custom membership duration. Leave blank to use the selected plan duration."
              className={inputClass}
              type="number"
              min="1"
              step="1"
              placeholder="Use plan"
              value={subForm.durationValue}
              onChange={(e) => setSubForm((p) => ({ ...p, durationValue: e.target.value }))}
              disabled={Boolean(subForm.editId)}
            />
            <select
              title="Choose whether the custom duration is in days, months, or years."
              className={inputClass}
              value={subForm.durationUnit}
              onChange={(e) => setSubForm((p) => ({ ...p, durationUnit: e.target.value }))}
              disabled={Boolean(subForm.editId)}
            >
              <option value="days">Days</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
          <div>
            <label className={fieldLabelClass}>Notes</label>
            <textarea title="Internal notes about this membership." className={`${inputClass} min-h-[66px]`} placeholder="Notes" value={subForm.notes} onChange={(e) => setSubForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <button disabled={savingMember} className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-70">{savingMember ? 'Saving...' : subForm.editId ? 'Update Member' : 'Create Subscription'}</button>
        </form>
        )}
      </div>
      )}

      {showExpiringAlerts && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-200">Renewal Reminder Dashboard</h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-200">
                This queue is designed for large renewal volumes. Search, filter, and page through upcoming renewals instead of loading every reminder card at once.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-200">
              Batch sending still works, but the queue view stays manageable even with 100+ members.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
            <div className="rounded border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Queue (30d)</p>
              <p className="mt-2 text-xl font-semibold text-white">{reminderQueueSummary.total}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Due Today</p>
              <p className="mt-2 text-xl font-semibold text-amber-200">{reminderQueueSummary.dueToday}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Due In 7 Days</p>
              <p className="mt-2 text-xl font-semibold text-white">{reminderQueueSummary.dueThisWeek}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Mail Ready</p>
              <p className="mt-2 text-xl font-semibold text-cyan-200">{reminderQueueSummary.mailReady}</p>
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Missing Email</p>
              <p className="mt-2 text-xl font-semibold text-rose-200">{reminderQueueSummary.missingEmail}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} sm:w-72`}
              placeholder="Search member, code, mobile, email, or plan"
              value={reminderQueueSearch}
              onChange={(e) => setReminderQueueSearch(e.target.value)}
            />
            <select
              className={`${inputClass} sm:w-52`}
              value={reminderQueueFilter}
              onChange={(e) => setReminderQueueFilter(e.target.value as 'all' | 'due_today' | 'due_7_days' | 'mail_ready' | 'missing_email' | 'sent_today')}
            >
              <option value="all">All reminders</option>
              <option value="due_today">Due today</option>
              <option value="due_7_days">Due in 7 days</option>
              <option value="mail_ready">Mail ready</option>
              <option value="missing_email">Missing email</option>
              <option value="sent_today">Mail sent today</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setReminderQueueSearch('');
                setReminderQueueFilter('all');
              }}
              className="rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  {['Member', 'Plan', 'Expires', 'Reminder Window', 'Delivery', 'Actions'].map((header) => (
                    <th key={header} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-300">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {reminderQueuePagination.paginatedRows.map((row) => (
                  <tr key={row.memberId}>
                    <td className="px-3 py-3 text-xs text-gray-200">
                      <p className="text-sm font-semibold text-white">{row.memberName}</p>
                      <p>{row.memberCode || '-'}</p>
                      <p>{row.phone || '-'}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-300">{row.planName || '-'}</td>
                    <td className="px-3 py-3 text-xs text-gray-300">
                      <p>{new Date(row.endDate).toLocaleDateString('en-IN')}</p>
                      <p className={row.daysRemaining < 0 ? 'text-rose-200' : 'text-amber-200'}>
                        {row.daysRemaining < 0 ? `${Math.abs(row.daysRemaining)} day(s) overdue` : `${row.daysRemaining} day(s) left`}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-300">
                      <p className="uppercase text-white">{String(row.reminderType || 'upcoming').replace(/_/g, ' ')}</p>
                      <p>{row.emailSentToday ? 'Email already sent today' : 'Pending review'}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className={row.emailReady ? 'text-cyan-200' : 'text-rose-200'}>
                        {row.emailReady ? row.email : 'Email missing'}
                      </p>
                      <p className="text-gray-400">{row.emailSentToday ? 'Sent today' : 'Not sent today'}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => void loadMemberDetails(row.memberId)} className="rounded bg-blue-500/20 px-2 py-1 text-blue-200">Details</button>
                        <button onClick={() => void openMemberIdCard(row.memberId)} className="rounded bg-fuchsia-500/20 px-2 py-1 text-fuchsia-100">ID Card</button>
                        <button onClick={() => renewMember(row.source)} className="rounded bg-indigo-500/20 px-2 py-1 text-indigo-200">Renew</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!reminderQueuePagination.totalRows && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-300">
                      No reminder rows match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={reminderQueuePagination.currentPage}
            totalPages={reminderQueuePagination.totalPages}
            totalRows={reminderQueuePagination.totalRows}
            pageSize={reminderQueuePagination.pageSize}
            startIndex={reminderQueuePagination.startIndex}
            endIndex={reminderQueuePagination.endIndex}
            itemLabel="renewal reminders"
            onPageChange={reminderQueuePagination.setCurrentPage}
            onPageSizeChange={reminderQueuePagination.setPageSize}
          />
        </div>
      )}

      {showPlanTable && (
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">Plans</h2>
        <table className="min-w-full divide-y divide-white/10">
          <thead><tr>{['Plan', 'Type', 'Cycle', 'Price', 'Benefits', 'Status', 'Actions'].map((h) => <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/10">
            {plans.map((plan) => (
              <tr key={plan._id}>
                <td className="px-2 py-2 text-xs text-gray-200">
                  <p className="text-sm text-white">{plan.name}</p>
                  <p className="text-cyan-200">{plan.tierName || 'Standard level'}</p>
                  <p>{plan.description || '-'}</p>
                </td>
                <td className="px-2 py-2 text-xs text-gray-300">{String(plan.planType || 'paid').toUpperCase()}</td>
                <td className="px-2 py-2 text-xs text-gray-300">{cycleLabel(plan.billingCycle)} / {plan.durationDays}d</td>
                <td className="px-2 py-2 text-xs text-gray-300">{formatCurrency(plan.price)} {plan.oneTimeFeeEnabled ? `+ ${formatCurrency(Number(plan.oneTimeFeeAmount || 0))}` : ''}</td>
                <td className="px-2 py-2 text-xs text-emerald-300">{Number(plan.bookingDiscountPercentage || 0)}% + {formatCurrency(Number(plan.flatDiscountAmount || 0))}</td>
                <td className="px-2 py-2 text-xs text-gray-300">{String(plan.status || (plan.active ? 'active' : 'inactive')).toUpperCase()}</td>
                <td className="px-2 py-2 text-xs"><div className="flex flex-wrap gap-1.5">
                  <button onClick={() => startEditPlan(plan)} className="rounded bg-cyan-500/20 px-2 py-1 text-cyan-200">Edit</button>
                  <button onClick={() => quickPlanAction(plan._id, 'duplicate')} className="rounded bg-indigo-500/20 px-2 py-1 text-indigo-200">Duplicate</button>
                  <button onClick={() => quickPlanAction(plan._id, plan.active ? 'deactivate' : 'activate')} className="rounded bg-amber-500/20 px-2 py-1 text-amber-200">{plan.active ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => quickPlanAction(plan._id, 'archive')} className="rounded bg-rose-500/20 px-2 py-1 text-rose-200">Archive</button>
                </div></td>
              </tr>
            ))}
            {!plans.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-sm text-gray-400">No plans found.</td></tr>}
          </tbody>
        </table>
      </div>
      )}

      {showMemberList && (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-white">Member Subscriptions</h2>
              <p className="mt-1 text-xs text-gray-400">This is the main workbench for renewals, lifecycle actions, and ID card printing.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-gray-300">Member Search</label>
              <input
                title="Search by member name, member code, or mobile number."
                className={`${inputClass} sm:w-64`}
                placeholder="Search name, code, or mobile"
                value={memberSearchInput}
                onChange={(e) => setMemberSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void searchMembers();
                  }
                }}
              />
              <button onClick={() => void searchMembers()} className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400">Search</button>
              <button onClick={() => void clearMemberSearch()} className="rounded-md border border-white/20 px-3 py-2 text-xs text-gray-200">Clear</button>
            </div>
          </div>
          {memberSearchQuery && (
            <p className="mb-2 text-xs text-gray-300">
              Showing filtered results for: <span className="text-white">{memberSearchQuery}</span>
            </p>
          )}
          <table className="min-w-full divide-y divide-white/10">
            <thead><tr>{['Member', 'Plan', 'Validity', 'Status', 'Visits/Spend', 'Points', 'Actions'].map((h) => <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/10">
              {subscriptions.map((sub) => (
                <tr key={sub._id}>
                  <td className="px-2 py-2 text-xs text-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {sub.profilePhotoUrl ? (
                          <img src={resolveStoredImageUrl(sub.profilePhotoUrl)} alt={sub.memberName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-cyan-100">{(sub.memberName || 'M').slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-white">{sub.memberName}</p>
                        <p>{sub.memberCode || '-'}</p>
                        <p>{sub.phone || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-300">{sub.planId?.name || '-'}</td>
                  <td className="px-2 py-2 text-xs text-gray-300"><p>{new Date(sub.startDate).toLocaleDateString('en-IN')}</p><p>{new Date(sub.endDate).toLocaleDateString('en-IN')}</p><p>Renewal: {sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString('en-IN') : '-'}</p></td>
                  <td className="px-2 py-2 text-xs uppercase text-gray-300">{sub.status}</td>
                  <td className="px-2 py-2 text-xs text-gray-300"><p>Visits: {Number(sub.totalVisits || 0)}</p><p>Spend: {formatCurrency(Number(sub.totalSpending || 0))}</p></td>
                  <td className="px-2 py-2 text-xs text-emerald-300">{Number(sub.rewardPointsBalance || 0)}</td>
                  <td className="px-2 py-2 text-xs"><div className="flex flex-wrap gap-1.5">
                    <button onClick={() => void loadMemberDetails(sub._id)} className="rounded bg-blue-500/20 px-2 py-1 text-blue-200">Details</button>
                    <button onClick={() => void openMemberIdCard(sub._id)} className="rounded bg-fuchsia-500/20 px-2 py-1 text-fuchsia-100">ID Card</button>
                    <button onClick={() => startEditMember(sub)} className="rounded bg-cyan-500/20 px-2 py-1 text-cyan-200">Edit</button>
                    <button onClick={() => renewMember(sub)} className="rounded bg-indigo-500/20 px-2 py-1 text-indigo-200">Renew</button>
                    <button onClick={() => memberLifecycle(sub, 'extend')} className="rounded bg-sky-500/20 px-2 py-1 text-sky-200">Extend</button>
                    <button onClick={() => memberLifecycle(sub, 'upgrade')} className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">Upgrade</button>
                    <button onClick={() => memberLifecycle(sub, 'downgrade')} className="rounded bg-amber-500/20 px-2 py-1 text-amber-200">Downgrade</button>
                    <button onClick={() => adjustPoints(sub)} className="rounded bg-fuchsia-500/20 px-2 py-1 text-fuchsia-200">Points</button>
                    <button onClick={() => memberLifecycle(sub, 'pause')} className="rounded bg-yellow-500/20 px-2 py-1 text-yellow-200">Pause</button>
                    <button onClick={() => memberLifecycle(sub, 'resume')} className="rounded bg-lime-500/20 px-2 py-1 text-lime-200">Resume</button>
                    <button onClick={() => memberLifecycle(sub, 'suspend')} className="rounded bg-rose-500/20 px-2 py-1 text-rose-200">Suspend</button>
                    <button onClick={() => memberLifecycle(sub, 'cancel')} className="rounded bg-red-500/20 px-2 py-1 text-red-200">Cancel</button>
                  </div></td>
                </tr>
              ))}
              {!membersLoading && !subscriptions.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-sm text-gray-400">No member subscriptions found.</td></tr>}
              {membersLoading && <tr><td colSpan={7} className="px-2 py-3 text-center text-sm text-gray-400">Loading members...</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {showMemberProfileDetails && (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Member Profile And ID Card</h2>
          {selectedMemberId ? (
            <ActionIconButton kind="refresh" onClick={() => void loadMemberDetails(selectedMemberId)} title="Refresh Details" className="h-8 w-8" />
          ) : null}
        </div>
        {memberDetailsLoading && <p className="text-sm text-gray-400">Loading member details...</p>}
        {!memberDetailsLoading && !memberDetails && <p className="text-sm text-gray-400">Select a member and click `Details` to view full profile, lifecycle history, reminders, and benefits.</p>}
        {!memberDetailsLoading && memberDetails && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
                  <div className="rounded border border-white/10 p-3">
                    <p className="text-gray-400">Member</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                        {memberDetails.profile?.profilePhotoUrl ? (
                          <img
                            src={resolveStoredImageUrl(memberDetails.profile.profilePhotoUrl)}
                            alt={memberDetails.profile?.memberName || 'Member'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-semibold text-cyan-100">
                            {String(memberDetails.profile?.memberName || 'M').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-white">{memberDetails.profile?.memberName || '-'}</p>
                        <p className="text-cyan-200">{memberDetails.profile?.memberCode || '-'}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-gray-300">{memberDetails.profile?.phone || '-'}</p>
                    <p className="text-gray-300">{memberDetails.profile?.email || '-'}</p>
                    <p className="text-gray-300">{memberDetails.profile?.emergencyContact || '-'}</p>
                  </div>
                  <div className="rounded border border-white/10 p-3">
                    <p className="text-gray-400">Membership</p>
                    <p className="mt-3 text-white uppercase">{memberDetails.membership?.status || '-'}</p>
                    <p className="text-gray-300">Level: {memberDetails.plan?.levelLabel || memberDetails.plan?.name || '-'}</p>
                    <p className="text-gray-300">Start: {memberDetails.membership?.startDate ? new Date(memberDetails.membership.startDate).toLocaleDateString('en-IN') : '-'}</p>
                    <p className="text-gray-300">End: {memberDetails.membership?.endDate ? new Date(memberDetails.membership.endDate).toLocaleDateString('en-IN') : '-'}</p>
                    <p className="text-amber-300">Days Remaining: {Number(memberDetails.membership?.daysRemaining || 0)}</p>
                  </div>
                  <div className="rounded border border-white/10 p-3">
                    <p className="text-gray-400">Benefits</p>
                    <p className="mt-3 text-emerald-300">Discount: {Number(memberDetails.plan?.bookingDiscountPercentage || 0)}%</p>
                    <p className="text-gray-300">Flat: {formatCurrency(Number(memberDetails.plan?.flatDiscountAmount || 0))}</p>
                    <p className="text-cyan-300">Points Balance: {Number(memberDetails.wallet?.rewardPointsBalance || 0)}</p>
                    <p className="text-gray-300">Sessions: {Number(memberDetails.plan?.sessionsUsed || 0)} / {memberDetails.plan?.sessionsLimit ?? 'Unlimited'}</p>
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-black/20 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Member ID Card</p>
                      <p className="text-xs text-gray-400">Use the uploaded member photo plus live member name, member code, and level from the database.</p>
                    </div>
                    {canPrintMemberCards ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void printMemberIdCard()}
                          disabled={memberCardBusyAction === 'print' || !memberCardData}
                          className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-70"
                        >
                          {memberCardBusyAction === 'print' ? 'Preparing Print...' : 'Print ID Card'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadMemberIdCard()}
                          disabled={memberCardBusyAction === 'download' || !memberCardData}
                          className="rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-gray-200 disabled:opacity-70"
                        >
                          {memberCardBusyAction === 'download' ? 'Preparing Download...' : 'Download PNG'}
                        </button>
                        <ActionIconButton
                          kind="downloadPdf"
                          onClick={() => void downloadMemberIdCardPdf()}
                          disabled={memberCardBusyAction === 'pdf' || !memberCardData}
                          title={memberCardBusyAction === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-amber-200">ID card print/download is available for admin and super admin.</p>
                    )}
                  </div>

                  {memberCardData ? (
                    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                      <div
                        ref={memberIdCardRef}
                        className="relative mx-auto aspect-[1083/750] w-full min-w-[320px] max-w-[860px] overflow-hidden rounded-[26px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.3)]"
                      >
                        {memberCardPreviewUrl ? (
                          <img
                            src={memberCardPreviewUrl}
                            alt={`${memberCardData.displayName} member ID card preview`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center bg-white text-sm font-semibold text-slate-600"
                            style={{
                              backgroundImage: `url("${memberCardTemplateUrl}")`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                          >
                            Preparing high-quality ID card preview...
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-sm font-semibold text-amber-200">Renewal Reminder System (SMS / Email / In-App)</p>
                  <div className="mb-2 flex flex-wrap gap-2 text-xs text-gray-200">
                    {['sms', 'email', 'whatsapp', 'in_app', 'pos_popup'].map((channel) => (
                      <label key={channel} className="flex items-center gap-1 rounded border border-white/20 px-2 py-1">
                        <input type="checkbox" checked={reminderChannels.includes(channel)} onChange={() => toggleReminderChannel(channel)} />
                        {channel.toUpperCase()}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select className={inputClass} value={reminderType} onChange={(e) => setReminderType(e.target.value)}>
                      <option value="d7">D7 Reminder</option>
                      <option value="d3">D3 Reminder</option>
                      <option value="expiry">Expiry Day</option>
                      <option value="grace">Grace Period</option>
                    </select>
                    <button onClick={sendMemberReminder} className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Send Reminder Now</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                  <div className="rounded border border-white/10 p-3">
                    <p className="mb-2 text-sm font-semibold text-white">Recent Renewal History</p>
                    {(memberDetails.histories?.renewalHistory || []).slice(0, 5).map((row: any, idx: number) => (
                      <p key={idx} className="text-gray-300">{row.renewalType} | {row.daysExtended} days | {formatCurrency(Number(row.amountPaid || 0))}</p>
                    ))}
                    {!(memberDetails.histories?.renewalHistory || []).length && <p className="text-gray-400">No renewals yet.</p>}
                  </div>
                  <div className="rounded border border-white/10 p-3">
                    <p className="mb-2 text-sm font-semibold text-white">Recent Reminder History</p>
                    {(memberDetails.histories?.reminderHistory || []).slice(0, 5).map((row: any, idx: number) => (
                      <p key={idx} className="text-gray-300">{row.channel} | {row.reminderType} | {row.status}</p>
                    ))}
                    {!(memberDetails.histories?.reminderHistory || []).length && <p className="text-gray-400">No reminders sent yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {showPosPreviewAndInlineReports && (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">POS Benefit Preview</h2>
          <div className="grid grid-cols-3 gap-2">
            <input className={inputClass} placeholder="Mobile" value={posForm.mobile} onChange={(e) => setPosForm((p) => ({ ...p, mobile: e.target.value }))} />
            <input className={inputClass} type="number" min="0" placeholder="Cart Total" value={posForm.cartTotal} onChange={(e) => setPosForm((p) => ({ ...p, cartTotal: e.target.value }))} />
            <input className={inputClass} type="number" min="0" placeholder="Redeem Points" value={posForm.redeemPoints} onChange={(e) => setPosForm((p) => ({ ...p, redeemPoints: e.target.value }))} />
          </div>
          <button onClick={previewPosBenefits} className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Preview POS Apply</button>
          {posPreview && (
            <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
              <p>Member: <span className="text-white">{posPreview.memberName}</span></p>
              <p>Plan: <span className="text-white">{posPreview.planName}</span></p>
              <p>Discount: <span className="text-emerald-300">{formatCurrency(Number(posPreview.discountAmount || 0))}</span></p>
              <p>Redeem: <span className="text-amber-300">{formatCurrency(Number(posPreview.redeemValue || 0))}</span></p>
              <p>Final Payable: <span className="text-white">{formatCurrency(Number(posPreview.finalPayable || 0))}</span></p>
              <p>Points After: <span className="text-cyan-300">{Number(posPreview.rewardPointsBalance || 0)}</span></p>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Membership Reports</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-white/10 p-2 text-gray-300">Active Members: <span className="text-white">{reportSummary.activeMembersCount}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Expired Members: <span className="text-white">{reportSummary.expiredMembersCount}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Membership Revenue: <span className="text-emerald-300">{formatCurrency(reportSummary.revenueFromMemberships)}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Renewal Rate: <span className="text-indigo-200">{reportSummary.renewalRate.toFixed(2)}%</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Retention Rate: <span className="text-cyan-200">{reportSummary.memberRetentionRate.toFixed(2)}%</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Most Popular Plan: <span className="text-white">{reportSummary.mostPopularPlanName}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Expiring (30d): <span className="text-amber-200">{lifecycleStats.expiringIn30Days}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Grace Period: <span className="text-yellow-200">{lifecycleStats.currentlyInGracePeriod}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Benefits Usage: <span className="text-white">{benefitAnalytics.usageCount}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Benefits Savings: <span className="text-emerald-300">{formatCurrency(benefitAnalytics.totalSavings)}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Benefit Discounts: <span className="text-indigo-200">{formatCurrency(benefitAnalytics.totalDiscount)}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Benefit Redeem Value: <span className="text-cyan-200">{formatCurrency(benefitAnalytics.totalRedeemValue)}</span></div>
          </div>
          <div className="rounded border border-white/10 p-3 text-xs text-gray-300">
            <p className="mb-1 text-sm font-semibold text-white">Lifecycle Status Mix</p>
            <p>
              {Object.entries(lifecycleStats.byStatus).map(([status, count]) => `${status}: ${count}`).join(' | ') || 'No data'}
            </p>
          </div>
          <div className="rounded border border-white/10 p-3 text-xs text-gray-300">
            <p className="mb-1 text-sm font-semibold text-white">Reminder Channel Delivery (30 days)</p>
            <p>
              {Object.entries(reminderChannelStats)
                .map(([channel, stat]) => `${channel}: sent ${stat.sent}, failed ${stat.failed}`)
                .join(' | ') || 'No data'}
            </p>
          </div>
          <div className="rounded border border-white/10 p-3 text-xs text-gray-300">
            <p className="mb-1 text-sm font-semibold text-white">Renewal Trends (Last 6 months)</p>
            <p>
              {renewalTrends
                .slice(-6)
                .map((row: any) => `${row.month}: ${row.totalRenewals} renewals`)
                .join(' | ') || 'No data'}
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
