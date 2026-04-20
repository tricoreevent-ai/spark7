import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { validationApi } from '../services/validationApi';
import { ValidationRunRequest } from '../types';

export const validationQueryKeys = {
  reports: ['validation', 'reports'] as const,
  report: (reportId: string) => ['validation', 'report', reportId] as const,
  job: (jobId: string) => ['validation', 'job', jobId] as const,
  drilldown: (reportId: string, checkName: string) => ['validation', 'drilldown', reportId, checkName] as const,
  settings: ['validation', 'settings'] as const,
};

export const useValidationReports = () =>
  useQuery({
    queryKey: validationQueryKeys.reports,
    queryFn: validationApi.listReports,
  });

export const useValidationReport = (reportId?: string) =>
  useQuery({
    queryKey: validationQueryKeys.report(reportId || ''),
    queryFn: () => validationApi.getReport(reportId || ''),
    enabled: Boolean(reportId),
  });

export const useValidationJobStatus = (jobId?: string) =>
  useQuery({
    queryKey: validationQueryKeys.job(jobId || ''),
    queryFn: () => validationApi.getJobStatus(jobId || ''),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 1500 : false;
    },
  });

export const useRunValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ValidationRunRequest) => validationApi.runValidation(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: validationQueryKeys.reports });
    },
  });
};

export const useValidationDrilldown = (reportId?: string, checkName?: string) =>
  useQuery({
    queryKey: validationQueryKeys.drilldown(reportId || '', checkName || ''),
    queryFn: () => validationApi.getDrilldown(checkName || '', reportId || ''),
    enabled: Boolean(reportId && checkName),
  });

export const useMarkFalsePositive = () =>
  useMutation({
    mutationFn: validationApi.markFalsePositive,
  });

export const useRepairValidationReport = () =>
  useMutation({
    mutationFn: (reportId: string) => validationApi.repairReport(reportId),
  });

export const useValidationSettings = () =>
  useQuery({
    queryKey: validationQueryKeys.settings,
    queryFn: validationApi.getSettings,
  });

export const useSaveValidationSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: validationApi.saveSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: validationQueryKeys.settings });
    },
  });
};
