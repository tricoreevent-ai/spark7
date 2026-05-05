import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { DetailedReport } from '../components/DetailedReport';
import { DrillDownModal } from '../components/DrillDownModal';
import { HealthGauge } from '../components/HealthGauge';
import { ValidationJobLogPanel } from '../components/ValidationJobLogPanel';
import { ReportList } from '../components/ReportList';
import { SummaryCards } from '../components/SummaryCards';
import { TimelineChart } from '../components/TimelineChart';
import { ValidationAssistantPanel } from '../components/ValidationAssistantPanel';
import { ValidationControls } from '../components/ValidationControls';
import {
  useMarkFalsePositive,
  useRepairValidationReport,
  useRunValidation,
  useSaveValidationSettings,
  useValidationDrilldown,
  useValidationJobStatus,
  useValidationReport,
  useValidationReports,
  useValidationSettings,
} from '../hooks/useValidationReports';
import { ValidationCheckDetail, ValidationJobStatus, ValidationRepairResult, ValidationReport } from '../types';
import { showConfirmDialog } from '../../utils/appDialogs';
import { formatAmount, formatDate, formatDateTime } from '../utils';

const repairableCountFromDetail = (detail?: ValidationCheckDetail): number => {
  if (!detail || detail.status !== 'FAIL' || !detail.actual) return 0;
  const actual = detail.actual as Record<string, unknown>;
  if (detail.checkName === 'Orphan Records') {
    return Number(actual.orphanVendors || 0) || 0;
  }
  if (detail.checkName === 'Vendor/Customer Reconciliation') {
    return Number(actual.missingVendorLedgerAccounts || 0) || 0;
  }
  return 0;
};

const buildReplayJobFromReport = (report?: ValidationReport): ValidationJobStatus | undefined => {
  if (!report) return undefined;

  const totalChecks = Math.max(report.summary.totalChecks || 0, report.details.length || 0);
  const runAtMs = new Date(report.runAt).getTime();
  const baseTime = Number.isNaN(runAtMs) ? Date.now() : runAtMs;
  const logs = [
    {
      id: `${report._id}-replay-start`,
      timestamp: new Date(baseTime).toISOString(),
      level: 'info' as const,
      message: `Validation report replay loaded. ${totalChecks} check(s) were executed for this run.`,
      progress: totalChecks ? 6 : 100,
      sequence: 1,
    },
    ...report.details.map((detail, index) => ({
      id: `${report._id}-replay-${index + 1}`,
      timestamp: new Date(baseTime + (index + 1) * 1000).toISOString(),
      level:
        detail.status === 'PASS'
          ? ('success' as const)
          : detail.severity === 'critical'
            ? ('error' as const)
            : detail.severity === 'warning'
              ? ('warning' as const)
              : ('info' as const),
      message:
        detail.status === 'PASS'
          ? `${detail.checkName} passed${detail.durationMs ? ` in ${detail.durationMs} ms` : ''}.`
          : `${detail.checkName} finished with ${detail.severity} findings${detail.durationMs ? ` in ${detail.durationMs} ms` : ''}.`,
      progress: totalChecks ? Math.max(8, Math.min(98, Math.round(((index + 1) / totalChecks) * 100))) : 100,
      sequence: index + 2,
      checkName: detail.checkName,
      durationMs: detail.durationMs,
    })),
    {
      id: `${report._id}-replay-complete`,
      timestamp: new Date(baseTime + (report.details.length + 2) * 1000).toISOString(),
      level: report.summary.critical > 0 ? ('warning' as const) : ('success' as const),
      message: `Validation run completed. Passed: ${report.summary.passed}, warning findings: ${report.summary.warning}, critical findings: ${report.summary.critical}.`,
      progress: 100,
      sequence: report.details.length + 2,
    },
  ];

  return {
    jobId: report.jobId || `report-${report._id}`,
    status: 'completed',
    progress: 100,
    startedAt: report.runAt,
    completedAt: report.completedAt || report.runAt,
    reportId: report._id,
    currentStep: 'Completed',
    completedSteps: totalChecks,
    totalSteps: totalChecks,
    logs,
  };
};

export const ValidationDashboard: React.FC = () => {
  const reportsQuery = useValidationReports();
  const reports = reportsQuery.data || [];
  const [selectedReportId, setSelectedReportId] = useState('');
  const selectedReportQuery = useValidationReport(selectedReportId);
  const selectedReport = selectedReportQuery.data || reports.find((report) => report._id === selectedReportId) || reports[0];
  const runValidation = useRunValidation();
  const [activeJobId, setActiveJobId] = useState('');
  const panelJobId = activeJobId || selectedReport?.jobId || reports[0]?.jobId || '';
  const jobQuery = useValidationJobStatus(panelJobId);
  const [drilldownDetail, setDrilldownDetail] = useState<ValidationCheckDetail | null>(null);
  const drilldownQuery = useValidationDrilldown(selectedReport?._id, drilldownDetail?.checkName);
  const falsePositiveMutation = useMarkFalsePositive();
  const repairValidationReport = useRepairValidationReport();
  const settingsQuery = useValidationSettings();
  const saveSettings = useSaveValidationSettings();
  const [repairResult, setRepairResult] = useState<ValidationRepairResult | null>(null);
  const [repairError, setRepairError] = useState('');

  useEffect(() => {
    if (!selectedReportId && reports[0]?._id) {
      setSelectedReportId(reports[0]._id);
    }
  }, [reports, selectedReportId]);

  useEffect(() => {
    const completedReportId = jobQuery.data?.status === 'completed' ? jobQuery.data.reportId : '';
    if (completedReportId) {
      setSelectedReportId(completedReportId);
      void reportsQuery.refetch();
    }
  }, [jobQuery.data?.reportId, jobQuery.data?.status]);

  useEffect(() => {
    setRepairResult(null);
    setRepairError('');
  }, [selectedReport?._id]);

  const latestReport = useMemo(() => reports[0] || selectedReport, [reports, selectedReport]);
  const replayedJob = useMemo(
    () => buildReplayJobFromReport(selectedReport || latestReport),
    [latestReport, selectedReport]
  );
  const activeJob = jobQuery.data || (activeJobId ? runValidation.data : undefined) || replayedJob;
  const repairableFindingCount = useMemo(
    () => (selectedReport?.details || []).reduce((sum, detail) => sum + repairableCountFromDetail(detail), 0),
    [selectedReport?.details]
  );
  const canRepairReport = Boolean(selectedReport?._id && repairableFindingCount > 0);

  const exportPdf = () => {
    if (!selectedReport) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Accounting Validation Report', 40, 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Period: ${formatDate(selectedReport.periodStart)} to ${formatDate(selectedReport.periodEnd)}`, 40, 66);
    doc.text(`Run: ${formatDateTime(selectedReport.runAt)}`, 40, 82);
    doc.text(
      `Checks: ${selectedReport.summary.totalChecks} | Critical: ${selectedReport.summary.critical} | Warning: ${selectedReport.summary.warning} | Passed: ${selectedReport.summary.passed}`,
      40,
      104
    );

    let y = 132;
    selectedReport.details.forEach((detail) => {
      if (y > 520) {
        doc.addPage();
        y = 44;
      }
      doc.setFont('helvetica', detail.status === 'FAIL' ? 'bold' : 'normal');
      doc.text(`${detail.checkName} (${detail.status}/${detail.severity})`, 40, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`Diff: ${formatAmount(detail.diff || 0)}`, 300, y);
      y += 16;
      if (detail.status === 'FAIL') {
        const lines = doc.splitTextToSize(`Fix: ${detail.suggestedFix}`, 740);
        doc.text(lines, 56, y);
        y += lines.length * 12 + 8;
      }
    });
    doc.save(`validation-report-${selectedReport._id}.pdf`);
  };

  const exportExcel = () => {
    if (!selectedReport) return;
    const rows = selectedReport.details.map((detail) => ({
      Check: detail.checkName,
      Status: detail.status,
      Severity: detail.severity,
      Difference: detail.diff || 0,
      SuggestedFix: detail.suggestedFix,
      PossibleCauses: (detail.possibleCauses || []).join('; '),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Validation');
    XLSX.writeFile(workbook, `validation-report-${selectedReport._id}.xlsx`);
  };

  const handleRun = (periodStart: string, periodEnd: string) => {
    runValidation.mutate(
      { periodStart, periodEnd, includeRawData: true },
      {
        onSuccess: (job) => {
          setActiveJobId(job.jobId);
        },
      }
    );
  };

  const handleRepair = async () => {
    if (!selectedReport?._id || !canRepairReport) return;
    const confirmed = await showConfirmDialog(
      'This repair only fixes supported vendor ledger master issues from the selected validation report. It will not auto-post accounting entries or change balances. Continue?',
      {
        title: 'Fix Database',
        confirmText: 'Apply Repairs',
        cancelText: 'Cancel',
        severity: 'warning',
      }
    );
    if (!confirmed) return;

    setRepairError('');
    setRepairResult(null);

    try {
      const result = await repairValidationReport.mutateAsync(selectedReport._id);
      setRepairResult(result);
    } catch (error) {
      setRepairError((error as Error)?.message || 'Unable to repair validation findings.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <div className="space-y-5">
          <ValidationControls
            running={runValidation.isPending || jobQuery.data?.status === 'queued' || jobQuery.data?.status === 'running'}
            job={activeJob}
            settings={settingsQuery.data}
            savingSettings={saveSettings.isPending}
            onRun={handleRun}
            onSaveSettings={(settings) => saveSettings.mutate(settings)}
          />
          <ValidationJobLogPanel job={activeJob} />
        </div>

        {reportsQuery.isError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
            {(reportsQuery.error as Error)?.message || 'Unable to load validation reports.'}
          </div>
        ) : null}

        {repairError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
            {repairError}
          </div>
        ) : null}

        {repairResult ? (
          <section
            className={`rounded-3xl border p-5 ${
              repairResult.repaired
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/80">Database Repair Result</p>
                <h3 className="mt-1 text-xl font-black text-white">{repairResult.message}</h3>
                <p className="mt-2 text-sm text-white/80">
                  Vendors reviewed: {repairResult.summary.vendorsReviewed} | Ledgers created: {repairResult.summary.vendorLedgersCreated} | Ledgers linked: {repairResult.summary.vendorLedgersLinked} | Manual follow-up: {repairResult.summary.manualFollowUps}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white">
                {repairResult.repairedCount} repaired, {repairResult.skippedCount} skipped
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {repairResult.logs.slice(0, 6).map((log, index) => (
                <div key={`${log.entityId || 'repair'}-${index}`} className="rounded-2xl border border-white/10 bg-black/15 p-3 text-sm leading-6 text-white/90">
                  {log.message}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <SummaryCards report={latestReport} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="space-y-5">
            <HealthGauge report={latestReport} />
            <TimelineChart reports={reports} />
            <ReportList reports={reports} selectedReportId={selectedReport?._id} onSelect={setSelectedReportId} />
          </div>
          <ValidationAssistantPanel report={selectedReport} />
        </div>

        <DetailedReport
          report={selectedReport}
          onDrilldown={setDrilldownDetail}
          onExportPdf={exportPdf}
          onExportExcel={exportExcel}
          canRepair={canRepairReport}
          repairing={repairValidationReport.isPending}
          onRepair={handleRepair}
        />
      </div>

      <DrillDownModal
        open={Boolean(drilldownDetail)}
        loading={drilldownQuery.isLoading}
        error={(drilldownQuery.error as Error)?.message}
        data={drilldownQuery.data}
        onClose={() => setDrilldownDetail(null)}
        onMarkFalsePositive={async (reason) => {
          if (!selectedReport || !drilldownDetail) return;
          await falsePositiveMutation.mutateAsync({
            reportId: selectedReport._id,
            checkName: drilldownDetail.checkName,
            reason,
          });
        }}
      />
    </main>
  );
};
