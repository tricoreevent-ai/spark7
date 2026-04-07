import React, { useEffect, useMemo, useState } from 'react';
import { CardTabs } from '../components/CardTabs';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showPromptDialog } from '../utils/appDialogs';

interface FacilityOption {
  _id: string;
  name: string;
  location?: string;
}

interface Plan {
  _id: string;
  name: string;
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

const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
const cycleLabel = (value?: string) => String(value || 'custom').replace('_', ' ').toUpperCase();
const parseCsv = (value: string): string[] => value.split(',').map((x) => x.trim()).filter(Boolean);

type MembershipPageMode = 'all' | 'plan' | 'member-create' | 'member-list';

interface MembershipsProps {
  mode?: MembershipPageMode;
}

export const Memberships: React.FC<MembershipsProps> = ({ mode = 'all' }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [expiringAlerts, setExpiringAlerts] = useState<Subscription[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState('');

  const [dashboard, setDashboard] = useState({
    expiringCount: 0,
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
  const [memberTab, setMemberTab] = useState<'create' | 'list'>('create');
  const [memberSearchInput, setMemberSearchInput] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);
  const [reminderType, setReminderType] = useState('d3');
  const [reminderChannels, setReminderChannels] = useState<string[]>(['sms', 'email']);

  const showPlanForm = mode === 'all' || mode === 'plan';
  const showMemberTabs = mode === 'all';
  const showMemberForm = mode === 'member-create' || (mode === 'all' && memberTab === 'create');
  const showMemberList = mode === 'member-list' || (mode === 'all' && memberTab === 'list');
  const showDashboardCards = mode === 'all';
  const showAutomationActions = mode === 'all';
  const showExpiringAlerts = mode === 'all';
  const showPlanTable = mode === 'all' || mode === 'plan';
  const showMemberProfileDetails = mode === 'all';
  const showPosPreviewAndInlineReports = mode === 'all';

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
    autoRenewEnabled: false,
    notes: '',
  });

  const [posForm, setPosForm] = useState({
    mobile: '',
    cartTotal: '',
    redeemPoints: '',
  });
  const [posPreview, setPosPreview] = useState<any>(null);

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const loadData = async (query = memberSearchQuery) => {
    setError('');
    const trimmedQuery = String(query || '').trim();
    const subscriptionsEndpoint = trimmedQuery
      ? `/api/memberships/subscriptions?q=${encodeURIComponent(trimmedQuery)}`
      : '/api/memberships/subscriptions';
    setMembersLoading(true);
    try {
      const [optionsData, plansData, subscriptionsData, alertsData, dashboardData] = await Promise.all([
        fetchApiJson(apiUrl('/api/memberships/plan-options'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/plans'), { headers }),
        fetchApiJson(apiUrl(subscriptionsEndpoint), { headers }),
        fetchApiJson(apiUrl('/api/memberships/subscriptions/expiry-alerts?days=15'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/dashboard/reminders'), { headers }),
      ]);

      const facilityRows = Array.isArray(optionsData?.data?.facilities) ? optionsData.data.facilities : [];
      const planRows = Array.isArray(plansData?.data) ? plansData.data : [];
      const subRows = Array.isArray(subscriptionsData?.data) ? subscriptionsData.data : [];
      const alertRows = Array.isArray(alertsData?.data?.expiring) ? alertsData.data.expiring : [];

      setFacilities(facilityRows);
      setPlans(planRows);
      setSubscriptions(subRows);
      setMemberSearchQuery(trimmedQuery);
      setExpiringAlerts(alertRows);
      setDashboard({
        expiringCount: Number(dashboardData?.data?.expiringCount || 0),
        expiredCount: Number(dashboardData?.data?.expiredCount || 0),
        renewedThisMonth: Number(dashboardData?.data?.renewedThisMonth || 0),
        renewalRevenue: Number(dashboardData?.data?.renewalRevenue || 0),
      });

      if (!subForm.planId && planRows[0]?._id) {
        setSubForm((prev) => ({ ...prev, planId: planRows[0]._id }));
      }
      if (!planForm.facilityType && facilityRows[0]?.name) {
        setPlanForm((prev) => ({ ...prev, facilityType: facilityRows[0].name }));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load memberships');
    } finally {
      setMembersLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      const [summaryData, lifecycleData, renewalData, reminderData, benefitsData] = await Promise.all([
        fetchApiJson(apiUrl('/api/memberships/reports/summary'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/lifecycle'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/renewal-trends?months=6'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/reminder-channels?days=30'), { headers }),
        fetchApiJson(apiUrl('/api/memberships/reports/benefits-analytics?days=30'), { headers }),
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
    } catch {
      // reports can be admin-only
    }
  };

  useEffect(() => {
    void loadData();
    void loadReports();
  }, []);

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
      await loadData();
      await loadReports();
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
      await loadData();
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
            autoRenewEnabled: Boolean(subForm.autoRenewEnabled),
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
            amountPaid: subForm.amountPaid ? Number(subForm.amountPaid) : undefined,
            bookingDiscountPercentage: subForm.bookingDiscountPercentage ? Number(subForm.bookingDiscountPercentage) : undefined,
            validityReminderDays: Number(subForm.validityReminderDays || 7),
            autoRenewEnabled: Boolean(subForm.autoRenewEnabled),
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
        notes: '',
      }));
      await loadData();
      await loadReports();
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
      await loadData();
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
      await loadData();
      await loadReports();
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
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to adjust points');
    }
  };

  const startEditMember = (sub: Subscription) => {
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
      autoRenewEnabled: Boolean((sub as any).autoRenewEnabled),
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
      await fetchApiJson(apiUrl(`/api/memberships/subscriptions/${selectedMemberId}/reminders/send`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reminderType,
          channels: reminderChannels,
        }),
      });
      setMessage('Reminder sent');
      await loadMemberDetails(selectedMemberId);
      await loadData();
      await loadReports();
    } catch (e: any) {
      setError(e.message || 'Failed to send reminder');
    }
  };

  const runReminderBatch = async () => {
    try {
      await fetchApiJson(apiUrl('/api/memberships/reminders/process-renewals'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          days: 15,
          channels: ['sms', 'email'],
        }),
      });
      setMessage('Renewal reminder batch processed');
      await loadData();
      await loadReports();
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
      await loadData();
      await loadReports();
      if (selectedMemberId) await loadMemberDetails(selectedMemberId);
    } catch (e: any) {
      setError(e.message || 'Failed to run lifecycle sync');
    }
  };

  const searchMembers = async () => {
    await loadData(memberSearchInput);
  };

  const clearMemberSearch = async () => {
    setMemberSearchInput('');
    await loadData('');
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

      {showDashboardCards && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Expiring (7d)</p><p className="text-xl font-semibold text-amber-200">{dashboard.expiringCount}</p></div>
          <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Expired</p><p className="text-xl font-semibold text-rose-300">{dashboard.expiredCount}</p></div>
          <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Renewed This Month</p><p className="text-xl font-semibold text-indigo-200">{dashboard.renewedThisMonth}</p></div>
          <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Renewal Revenue</p><p className="text-xl font-semibold text-emerald-300">{formatCurrency(dashboard.renewalRevenue)}</p></div>
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
            { key: 'create', label: 'Create Member Subscription' },
            { key: 'list', label: 'Member List' },
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
          <h2 className="text-lg font-semibold text-white">{editingPlanId ? 'Edit Plan' : 'Create Plan (Admin)'}</h2>
          <div>
            <label className={fieldLabelClass}>Plan Name</label>
            <input title="Unique plan name shown to staff and members." className={inputClass} required placeholder="Plan Name" value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} />
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
          <h2 className="text-lg font-semibold text-white">{subForm.editId ? 'Edit Member Profile' : 'Create Member Subscription'}</h2>
          <div>
            <label className={fieldLabelClass}>Membership Plan</label>
            <select title="Select the membership plan to assign." className={inputClass} required value={subForm.planId} onChange={(e) => setSubForm((p) => ({ ...p, planId: e.target.value }))} disabled={Boolean(subForm.editId)}>
              <option value="">Select Plan</option>
              {plans.filter((p) => p.status !== 'archived').map((plan) => (
                <option key={plan._id} value={plan._id}>{plan.name} | {cycleLabel(plan.billingCycle)} | {formatCurrency(plan.price)}</option>
              ))}
            </select>
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
          <div>
            <label className={fieldLabelClass}>Profile Photo URL</label>
            <input title="Optional profile photo URL." className={inputClass} placeholder="Profile Photo URL (optional)" value={subForm.profilePhotoUrl} onChange={(e) => setSubForm((p) => ({ ...p, profilePhotoUrl: e.target.value }))} />
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
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-300">
            <p>Reminder Days</p>
            <p>Auto Renew</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input title="How many days before expiry to send reminders." className={inputClass} type="number" min="0" step="1" placeholder="Reminder Days" value={subForm.validityReminderDays} onChange={(e) => setSubForm((p) => ({ ...p, validityReminderDays: e.target.value }))} />
            <label title="Enable auto-renewal for this member." className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300"><input type="checkbox" checked={subForm.autoRenewEnabled} onChange={(e) => setSubForm((p) => ({ ...p, autoRenewEnabled: e.target.checked }))} />Auto Renew</label>
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

      {showExpiringAlerts && !!expiringAlerts.length && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-amber-200">Renewal Reminders</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {expiringAlerts.slice(0, 9).map((row) => (
              <div key={row._id} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs">
                <p className="font-semibold text-white">{row.memberName}</p>
                <p className="text-gray-300">{row.planId?.name || '-'}</p>
                <p className="text-amber-200">Expires: {new Date(row.endDate).toLocaleDateString('en-IN')}</p>
              </div>
            ))}
          </div>
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
                <td className="px-2 py-2 text-xs text-gray-200"><p className="text-sm text-white">{plan.name}</p><p>{plan.description || '-'}</p></td>
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
            <h2 className="text-lg font-semibold text-white">Member Subscriptions</h2>
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
                  <td className="px-2 py-2 text-xs text-gray-200"><p className="text-sm text-white">{sub.memberName}</p><p>{sub.memberCode || '-'}</p><p>{sub.phone || '-'}</p></td>
                  <td className="px-2 py-2 text-xs text-gray-300">{sub.planId?.name || '-'}</td>
                  <td className="px-2 py-2 text-xs text-gray-300"><p>{new Date(sub.startDate).toLocaleDateString('en-IN')}</p><p>{new Date(sub.endDate).toLocaleDateString('en-IN')}</p><p>Renewal: {sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString('en-IN') : '-'}</p></td>
                  <td className="px-2 py-2 text-xs uppercase text-gray-300">{sub.status}</td>
                  <td className="px-2 py-2 text-xs text-gray-300"><p>Visits: {Number(sub.totalVisits || 0)}</p><p>Spend: {formatCurrency(Number(sub.totalSpending || 0))}</p></td>
                  <td className="px-2 py-2 text-xs text-emerald-300">{Number(sub.rewardPointsBalance || 0)}</td>
                  <td className="px-2 py-2 text-xs"><div className="flex flex-wrap gap-1.5">
                    <button onClick={() => void loadMemberDetails(sub._id)} className="rounded bg-blue-500/20 px-2 py-1 text-blue-200">Details</button>
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
          <h2 className="text-lg font-semibold text-white">Membership Details Section (Member Profile)</h2>
          {selectedMemberId ? (
            <button onClick={() => void loadMemberDetails(selectedMemberId)} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-gray-200">Refresh Details</button>
          ) : null}
        </div>
        {memberDetailsLoading && <p className="text-sm text-gray-400">Loading member details...</p>}
        {!memberDetailsLoading && !memberDetails && <p className="text-sm text-gray-400">Select a member and click `Details` to view full profile, lifecycle history, reminders, and benefits.</p>}
        {!memberDetailsLoading && memberDetails && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
              <div className="rounded border border-white/10 p-3">
                <p className="text-gray-400">Member</p>
                <p className="text-white">{memberDetails.profile?.memberName || '-'}</p>
                <p className="text-gray-300">{memberDetails.profile?.phone || '-'}</p>
                <p className="text-gray-300">{memberDetails.profile?.email || '-'}</p>
                <p className="text-gray-300">{memberDetails.profile?.emergencyContact || '-'}</p>
              </div>
              <div className="rounded border border-white/10 p-3">
                <p className="text-gray-400">Membership</p>
                <p className="text-white uppercase">{memberDetails.membership?.status || '-'}</p>
                <p className="text-gray-300">Start: {memberDetails.membership?.startDate ? new Date(memberDetails.membership.startDate).toLocaleDateString('en-IN') : '-'}</p>
                <p className="text-gray-300">End: {memberDetails.membership?.endDate ? new Date(memberDetails.membership.endDate).toLocaleDateString('en-IN') : '-'}</p>
                <p className="text-amber-300">Days Remaining: {Number(memberDetails.membership?.daysRemaining || 0)}</p>
              </div>
              <div className="rounded border border-white/10 p-3">
                <p className="text-gray-400">Benefits</p>
                <p className="text-emerald-300">Discount: {Number(memberDetails.plan?.bookingDiscountPercentage || 0)}%</p>
                <p className="text-gray-300">Flat: {formatCurrency(Number(memberDetails.plan?.flatDiscountAmount || 0))}</p>
                <p className="text-cyan-300">Points Balance: {Number(memberDetails.wallet?.rewardPointsBalance || 0)}</p>
                <p className="text-gray-300">Sessions: {Number(memberDetails.plan?.sessionsUsed || 0)} / {memberDetails.plan?.sessionsLimit ?? 'Unlimited'}</p>
              </div>
            </div>
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
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
