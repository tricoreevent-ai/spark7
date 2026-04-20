import axios from 'axios';
import { getApiBaseUrl } from '../../utils/api';
import { mockDrilldown, mockValidationReports } from '../mock/mockValidationData';
import { ValidationDrilldownResponse, ValidationJobStatus, ValidationRepairResult, ValidationReport, ValidationRunRequest } from '../types';

const useMocks = (): boolean => {
  const env = (import.meta as any)?.env || {};
  return String(env.VITE_VALIDATION_USE_MOCKS || '').toLowerCase() === 'true';
};

const validationClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30_000,
});

validationClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

validationClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Validation request failed.';
    return Promise.reject(new Error(message));
  }
);

const unwrap = <T,>(response: { data: { data?: T; success?: boolean; error?: string; message?: string } }): T => {
  if (response.data?.success === false) {
    throw new Error(response.data.error || response.data.message || 'Validation request failed.');
  }
  return response.data.data as T;
};

const buildMockJobLog = (
  jobId: string,
  sequence: number,
  args: {
    level: ValidationJobStatus['logs'][number]['level'];
    message: string;
    progress: number;
    checkName?: string;
    durationMs?: number;
  }
): ValidationJobStatus['logs'][number] => ({
  id: `${jobId}-${sequence}`,
  timestamp: new Date(Date.now() - Math.max(0, (3 - sequence) * 2500)).toISOString(),
  level: args.level,
  message: args.message,
  progress: args.progress,
  sequence,
  checkName: args.checkName,
  durationMs: args.durationMs,
});

const buildMockJobStatus = (jobId: string, status: ValidationJobStatus['status']): ValidationJobStatus => ({
  jobId,
  status,
  progress: status === 'completed' ? 100 : 72,
  startedAt: new Date(Date.now() - 12_000).toISOString(),
  completedAt: status === 'completed' ? new Date().toISOString() : undefined,
  reportId: mockValidationReports[0]._id,
  currentStep: status === 'completed' ? 'Completed' : 'GST Reconciliation',
  completedSteps: status === 'completed' ? 13 : 8,
  totalSteps: 13,
  logs: [
    buildMockJobLog(jobId, 1, {
      level: 'info',
      message: 'Validation workspace ready. 13 checks scheduled for this run.',
      progress: 8,
    }),
    buildMockJobLog(jobId, 2, {
      level: 'success',
      message: 'Trial Balance passed in 412 ms.',
      progress: 39,
      checkName: 'Trial Balance',
      durationMs: 412,
    }),
    buildMockJobLog(jobId, 3, {
      level: status === 'completed' ? 'warning' : 'info',
      message:
        status === 'completed'
          ? 'GST Reconciliation finished with warning findings in 1688 ms.'
          : 'Running check 9 of 13: GST Reconciliation.',
      progress: status === 'completed' ? 72 : 68,
      checkName: 'GST Reconciliation',
      durationMs: status === 'completed' ? 1688 : undefined,
    }),
    ...(status === 'completed'
      ? [
          buildMockJobLog(jobId, 4, {
            level: 'success',
            message: 'Validation run completed. The report is ready for review.',
            progress: 100,
          }),
        ]
      : []),
  ],
});

const buildMockRepairResult = (reportId: string): ValidationRepairResult => ({
  reportId,
  repaired: true,
  repairedCount: 2,
  skippedCount: 1,
  supportedFindingCount: 3,
  rerunRecommended: true,
  message: 'Applied 2 vendor ledger repair(s). Run Full Validation Now again to confirm the database is clean.',
  logs: [
    {
      level: 'info',
      message: 'Scanning the current tenant database for vendors with missing or dangling ledger links.',
      entityType: 'validation_report',
      entityId: reportId,
    },
    {
      level: 'success',
      message: 'Created supplier ledger AC-00124 for vendor Blue Ocean Traders.',
      entityType: 'chart_account',
      entityId: 'mock-ledger-1',
    },
    {
      level: 'success',
      message: 'Linked vendor Blue Ocean Traders to ledger AC-00124.',
      entityType: 'vendor',
      entityId: 'mock-vendor-1',
    },
    {
      level: 'warning',
      message: 'Only vendor ledger master-link issues can be repaired automatically right now. Balance corrections still need accountant review.',
      entityType: 'validation_report',
      entityId: reportId,
    },
  ],
  summary: {
    vendorsReviewed: 3,
    vendorLedgersCreated: 1,
    vendorLedgersLinked: 2,
    vendorLedgersSynchronized: 1,
    manualFollowUps: 1,
  },
});

export const validationApi = {
  async listReports(): Promise<ValidationReport[]> {
    if (useMocks()) return mockValidationReports;
    const response = await validationClient.get('/api/validate/reports?limit=50');
    return unwrap<ValidationReport[]>(response);
  },

  async getReport(reportId: string): Promise<ValidationReport> {
    if (useMocks()) {
      return mockValidationReports.find((report) => report._id === reportId) || mockValidationReports[0];
    }
    const response = await validationClient.get(`/api/validate/report/${encodeURIComponent(reportId)}`);
    return unwrap<ValidationReport>(response);
  },

  async runValidation(payload: ValidationRunRequest): Promise<ValidationJobStatus> {
    if (useMocks()) {
      return buildMockJobStatus(`mock-job-${Date.now()}`, 'running');
    }
    const response = await validationClient.post('/api/validate/run', payload);
    return unwrap<ValidationJobStatus>(response);
  },

  async getJobStatus(jobId: string): Promise<ValidationJobStatus> {
    if (useMocks()) {
      return buildMockJobStatus(jobId, 'completed');
    }
    const response = await validationClient.get(`/api/validate/status/${encodeURIComponent(jobId)}`);
    return unwrap<ValidationJobStatus>(response);
  },

  async getDrilldown(checkName: string, reportId: string): Promise<ValidationDrilldownResponse> {
    if (useMocks()) return mockDrilldown;
    const response = await validationClient.get(
      `/api/validate/drilldown/${encodeURIComponent(checkName)}/${encodeURIComponent(reportId)}`
    );
    return unwrap<ValidationDrilldownResponse>(response);
  },

  async repairReport(reportId: string): Promise<ValidationRepairResult> {
    if (useMocks()) return buildMockRepairResult(reportId || mockValidationReports[0]._id);
    const response = await validationClient.post('/api/validate/repair', { reportId });
    return unwrap<ValidationRepairResult>(response);
  },

  async markFalsePositive(args: {
    reportId: string;
    checkName: string;
    reason: string;
  }): Promise<{ saved: boolean }> {
    if (useMocks()) return { saved: true };
    const response = await validationClient.post('/api/validate/feedback', args);
    return unwrap<{ saved: boolean }>(response);
  },

  async getSettings(): Promise<{
    scheduleEnabled: boolean;
    cron: string;
    timezone: string;
    alertEmails: string[];
    source: string;
  }> {
    if (useMocks()) {
      return { scheduleEnabled: true, cron: '0 2 * * *', timezone: 'Asia/Kolkata', alertEmails: [], source: 'mock' };
    }
    const response = await validationClient.get('/api/validate/settings');
    return unwrap(response);
  },

  async saveSettings(payload: {
    scheduleEnabled: boolean;
    cron: string;
    timezone: string;
    alertEmails: string[];
  }): Promise<{
    scheduleEnabled: boolean;
    cron: string;
    timezone: string;
    alertEmails: string[];
  }> {
    if (useMocks()) return payload;
    const response = await validationClient.post('/api/validate/settings', payload);
    return unwrap(response);
  },
};
