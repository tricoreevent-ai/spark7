import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

interface ReminderChannelStats {
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
}

export const MembershipReports: React.FC = () => {
  const [error, setError] = useState('');
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

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const loadReports = async () => {
    setError('');
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
    } catch (e: any) {
      setError(e.message || 'Failed to load membership reports');
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Membership Reports</h1>
          <p className="text-sm text-gray-300">Dedicated analytics for lifecycle, renewals, reminder channels, and POS benefits usage.</p>
        </div>
        <button onClick={() => void loadReports()} className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Refresh</button>
      </div>

      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Active Members</p><p className="text-xl font-semibold text-emerald-200">{reportSummary.activeMembersCount}</p></div>
        <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Expired Members</p><p className="text-xl font-semibold text-rose-300">{reportSummary.expiredMembersCount}</p></div>
        <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Renewal Rate</p><p className="text-xl font-semibold text-indigo-200">{reportSummary.renewalRate.toFixed(2)}%</p></div>
        <div className="rounded border border-white/10 bg-white/5 p-3"><p className="text-xs text-gray-400">Revenue</p><p className="text-xl font-semibold text-emerald-300">{formatCurrency(reportSummary.revenueFromMemberships)}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Lifecycle And Retention</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-white/10 p-2 text-gray-300">Most Popular Plan: <span className="text-white">{reportSummary.mostPopularPlanName}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Retention Rate: <span className="text-cyan-200">{reportSummary.memberRetentionRate.toFixed(2)}%</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Expiring (7d): <span className="text-amber-200">{lifecycleStats.expiringIn7Days}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Expiring (30d): <span className="text-amber-200">{lifecycleStats.expiringIn30Days}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Grace Period: <span className="text-yellow-200">{lifecycleStats.currentlyInGracePeriod}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Benefit Usage: <span className="text-white">{benefitAnalytics.usageCount}</span></div>
          </div>
          <div className="rounded border border-white/10 p-3 text-xs text-gray-300">
            <p className="mb-1 text-sm font-semibold text-white">Status Mix</p>
            <p>{Object.entries(lifecycleStats.byStatus).map(([status, count]) => `${status}: ${count}`).join(' | ') || 'No data'}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Benefits And Reminder Channels</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-white/10 p-2 text-gray-300">Total Savings: <span className="text-emerald-300">{formatCurrency(benefitAnalytics.totalSavings)}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Total Discount: <span className="text-indigo-200">{formatCurrency(benefitAnalytics.totalDiscount)}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Redeem Value: <span className="text-cyan-200">{formatCurrency(benefitAnalytics.totalRedeemValue)}</span></div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Earned Points: <span className="text-white">{benefitAnalytics.totalEarnedPoints}</span></div>
          </div>
          <div className="rounded border border-white/10 p-3 text-xs text-gray-300">
            <p className="mb-1 text-sm font-semibold text-white">Reminder Channel Delivery (30 days)</p>
            <p>{Object.entries(reminderChannelStats).map(([channel, stat]) => `${channel}: sent ${stat.sent}, failed ${stat.failed}`).join(' | ') || 'No data'}</p>
          </div>
          <div className="rounded border border-white/10 p-3 text-xs text-gray-300">
            <p className="mb-1 text-sm font-semibold text-white">Renewal Trends (Last 6 months)</p>
            <p>{renewalTrends.slice(-6).map((row: any) => `${row.month}: ${row.totalRenewals} renewals`).join(' | ') || 'No data'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
