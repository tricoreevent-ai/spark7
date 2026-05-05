import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardTabs } from '../components/CardTabs';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { ReportDataTable } from '../components/ReportDataTable';
import { ActionIconButton } from '../components/ActionIconButton';
import { apiUrl, fetchApiJson } from '../utils/api';
import { getGeneralSettings } from '../utils/generalSettings';

type AttendanceReportTab = 'detail' | 'monthly';

type EmployeeOption = {
  _id: string;
  employeeCode: string;
  name: string;
  designation?: string;
};

type DetailedSummary = {
  totalEntries: number;
  employeeCount: number;
  presentCount: number;
  halfDayCount: number;
  leaveCount: number;
  absentCount: number;
  totalWorkedMinutes: number;
  totalWorkedHours: number;
  totalWorkedLabel: string;
  totalOvertimeHours: number;
};

type DetailedRow = {
  _id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation?: string;
  date: string;
  dateKey: string;
  status: 'present' | 'half_day' | 'absent' | 'leave';
  checkIn?: string;
  checkOut?: string;
  totalWorkedMinutes: number;
  totalWorkedHours: number;
  totalWorkedLabel: string;
  overtimeHours: number;
  checkInLocationLink?: string;
  checkOutLocationLink?: string;
  checkInSource?: string;
  checkOutSource?: string;
  notes?: string;
  isLocked?: boolean;
};

type MonthlyDay = {
  day: number;
  dateKey: string;
  weekdayShort: string;
};

type MonthlyDayMark = MonthlyDay & {
  mark: string;
  status: string;
};

type MonthlyRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation?: string;
  presentEquivalentDays: number;
  attendancePercent: number;
  markedDays: number;
  dayMarks: MonthlyDayMark[];
};

type MonthlyPayload = {
  month: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  daysInMonth: number;
  days: MonthlyDay[];
  rows: MonthlyRow[];
  totalEmployees: number;
  totalPresentEquivalentDays: number;
};

type LegacyAttendanceEntry = {
  _id: string;
  employeeId:
    | string
    | {
        _id: string;
        employeeCode?: string;
        name?: string;
        designation?: string;
      };
  date?: string;
  dateKey?: string;
  status?: DetailedRow['status'];
  checkIn?: string;
  checkOut?: string;
  checkInAt?: string;
  checkOutAt?: string;
  checkInSource?: string;
  checkOutSource?: string;
  checkInLocation?: { latitude?: number; longitude?: number };
  checkOutLocation?: { latitude?: number; longitude?: number };
  overtimeHours?: number;
  notes?: string;
  isLocked?: boolean;
};

const getTodayLocalDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getCurrentMonth = (): string => getTodayLocalDate().slice(0, 7);

const DEFAULT_DETAIL_SUMMARY: DetailedSummary = {
  totalEntries: 0,
  employeeCount: 0,
  presentCount: 0,
  halfDayCount: 0,
  leaveCount: 0,
  absentCount: 0,
  totalWorkedMinutes: 0,
  totalWorkedHours: 0,
  totalWorkedLabel: '00h 00m',
  totalOvertimeHours: 0,
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const toCsvCell = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const downloadCsv = (fileName: string, rows: Array<Array<unknown>>, headers: string[]) => {
  const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const statusLabel = (value: DetailedRow['status']) => {
  if (value === 'half_day') return 'Half Day';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const isEndpointMissingError = (error: any): boolean =>
  /api endpoint not found/i.test(String(error?.message || ''));

const buildLocationLink = (location?: { latitude?: number; longitude?: number }): string => {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

const parseClockMinutes = (value?: string): number | null => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const computeWorkedMinutes = (entry: LegacyAttendanceEntry): number => {
  if (entry?.checkInAt && entry?.checkOutAt) {
    const start = new Date(entry.checkInAt).getTime();
    const end = new Date(entry.checkOutAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Math.round((end - start) / 60000);
    }
  }

  const checkInMinutes = parseClockMinutes(entry.checkIn);
  const checkOutMinutes = parseClockMinutes(entry.checkOut);
  if (checkInMinutes === null || checkOutMinutes === null || checkOutMinutes < checkInMinutes) {
    return 0;
  }
  return checkOutMinutes - checkInMinutes;
};

const formatWorkedLabel = (minutes: number): string => {
  const safe = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(hours).padStart(2, '0')}h ${String(remainder).padStart(2, '0')}m`;
};

const formatDateLabel = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}-${month}-${year}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
};

const getDateKey = (value?: string): string => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = raw ? new Date(raw) : new Date();
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const buildMonthlyPayloadFromEntries = (
  entries: LegacyAttendanceEntry[],
  employeeOptions: EmployeeOption[],
  month: string,
  employeeIdFilter: string
): MonthlyPayload => {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const days: MonthlyDay[] = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const currentDate = new Date(year, monthNumber - 1, day);
    const dateKey = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return {
      day,
      dateKey,
      weekdayShort: currentDate.toLocaleDateString('en-IN', { weekday: 'short' }),
    };
  });

  const employeeMap = new Map<string, EmployeeOption>();
  employeeOptions.forEach((employee) => {
    employeeMap.set(employee._id, employee);
  });

  entries.forEach((entry) => {
    const employee = typeof entry.employeeId === 'object' ? entry.employeeId : null;
    const employeeId = String(employee?._id || entry.employeeId || '').trim();
    if (!employeeId || employeeMap.has(employeeId)) return;
    employeeMap.set(employeeId, {
      _id: employeeId,
      employeeCode: String(employee?.employeeCode || ''),
      name: String(employee?.name || 'Unknown'),
      designation: String(employee?.designation || ''),
    });
  });

  const employeeList = Array.from(employeeMap.values())
    .filter((employee) => employeeIdFilter === 'all' || employee._id === employeeIdFilter)
    .sort((a, b) => `${a.employeeCode} ${a.name}`.localeCompare(`${b.employeeCode} ${b.name}`, undefined, { numeric: true, sensitivity: 'base' }));

  const entryMap = new Map<string, LegacyAttendanceEntry>();
  entries.forEach((entry) => {
    const currentEmployeeId = String(typeof entry.employeeId === 'object' ? entry.employeeId?._id : entry.employeeId || '').trim();
    const dateKey = String(entry.dateKey || getDateKey(entry.date)).trim();
    if (!currentEmployeeId || !dateKey) return;
    entryMap.set(`${currentEmployeeId}_${dateKey}`, entry);
  });

  const rows: MonthlyRow[] = employeeList.map((employee) => {
    let presentEquivalentDays = 0;
    let markedDays = 0;

    const dayMarks: MonthlyDayMark[] = days.map((day) => {
      const entry = entryMap.get(`${employee._id}_${day.dateKey}`);
      const status = String(entry?.status || '');
      const mark = status === 'present' || status === 'half_day' ? '✓' : '';
      if (entry) markedDays += 1;
      if (status === 'present') presentEquivalentDays += 1;
      if (status === 'half_day') presentEquivalentDays += 0.5;
      return { ...day, mark, status };
    });

    return {
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      designation: employee.designation || '',
      presentEquivalentDays: Number(presentEquivalentDays.toFixed(1)),
      attendancePercent: Number(((presentEquivalentDays / Math.max(daysInMonth, 1)) * 100).toFixed(2)),
      markedDays,
      dayMarks,
    };
  });

  return {
    month,
    monthLabel: new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    startDate: `${String(1).padStart(2, '0')}-${String(monthNumber).padStart(2, '0')}-${year}`,
    endDate: `${String(daysInMonth).padStart(2, '0')}-${String(monthNumber).padStart(2, '0')}-${year}`,
    daysInMonth,
    days,
    rows,
    totalEmployees: rows.length,
    totalPresentEquivalentDays: Number(rows.reduce((sum, row) => sum + Number(row.presentEquivalentDays || 0), 0).toFixed(1)),
  };
};

export const AttendanceReports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AttendanceReportTab>('detail');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [detailRows, setDetailRows] = useState<DetailedRow[]>([]);
  const [detailSummary, setDetailSummary] = useState<DetailedSummary>(DEFAULT_DETAIL_SUMMARY);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailStartDate, setDetailStartDate] = useState(getCurrentMonth().concat('-01'));
  const [detailEndDate, setDetailEndDate] = useState(getTodayLocalDate());
  const [detailEmployeeId, setDetailEmployeeId] = useState('all');
  const [detailStatus, setDetailStatus] = useState('all');
  const [monthlyPayload, setMonthlyPayload] = useState<MonthlyPayload | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState('');
  const [monthlyMonth, setMonthlyMonth] = useState(getCurrentMonth());
  const [monthlyEmployeeId, setMonthlyEmployeeId] = useState('all');
  const [monthlySearch, setMonthlySearch] = useState('');

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadEmployees = async () => {
    try {
      const response = await fetchApiJson(apiUrl('/api/employees'), { headers });
      setEmployees(Array.isArray(response?.data) ? response.data : []);
    } catch {
      setEmployees([]);
    }
  };

  const loadLegacyAttendanceEntries = async (month?: string): Promise<LegacyAttendanceEntry[]> => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (!month && detailEmployeeId !== 'all') params.set('employeeId', detailEmployeeId);
    if (month && monthlyEmployeeId !== 'all') params.set('employeeId', monthlyEmployeeId);
    const query = params.toString();
    const response = await fetchApiJson(apiUrl(`/api/attendance/entries${query ? `?${query}` : ''}`), { headers });
    return Array.isArray(response?.data) ? response.data : [];
  };

  const loadDetailReport = async () => {
    if (detailStartDate > detailEndDate) {
      setDetailError('Start date should be before or equal to end date.');
      return;
    }

    setDetailLoading(true);
    setDetailError('');
    try {
      const params = new URLSearchParams({
        startDate: detailStartDate,
        endDate: detailEndDate,
      });
      if (detailEmployeeId !== 'all') params.set('employeeId', detailEmployeeId);
      if (detailStatus !== 'all') params.set('status', detailStatus);
      const response = await fetchApiJson(apiUrl(`/api/attendance/reports/detailed?${params.toString()}`), { headers });
      setDetailRows(Array.isArray(response?.data?.rows) ? response.data.rows : []);
      setDetailSummary(response?.data?.summary || DEFAULT_DETAIL_SUMMARY);
    } catch (error: any) {
      if (!isEndpointMissingError(error)) {
        setDetailRows([]);
        setDetailSummary(DEFAULT_DETAIL_SUMMARY);
        setDetailError(error?.message || 'Failed to load attendance detail report.');
      } else {
        try {
          const entries = await loadLegacyAttendanceEntries();
          const startKey = detailStartDate;
          const endKey = detailEndDate;
          const rows = entries
            .filter((entry) => {
              const dateKey = String(entry.dateKey || getDateKey(entry.date)).trim();
              if (!dateKey || dateKey < startKey || dateKey > endKey) return false;
              const currentEmployeeId = String(typeof entry.employeeId === 'object' ? entry.employeeId?._id : entry.employeeId || '').trim();
              if (detailEmployeeId !== 'all' && currentEmployeeId !== detailEmployeeId) return false;
              if (detailStatus !== 'all' && String(entry.status || '') !== detailStatus) return false;
              return true;
            })
            .map((entry) => {
              const employee = typeof entry.employeeId === 'object' ? entry.employeeId : null;
              const currentEmployeeId = String(employee?._id || entry.employeeId || '').trim();
              const workedMinutes = computeWorkedMinutes(entry);
              return {
                _id: String(entry._id),
                employeeId: currentEmployeeId,
                employeeCode: String(employee?.employeeCode || employees.find((row) => row._id === currentEmployeeId)?.employeeCode || ''),
                employeeName: String(employee?.name || employees.find((row) => row._id === currentEmployeeId)?.name || 'Unknown'),
                designation: String(employee?.designation || employees.find((row) => row._id === currentEmployeeId)?.designation || ''),
                date: formatDateLabel(entry.dateKey || entry.date),
                dateKey: String(entry.dateKey || getDateKey(entry.date)),
                status: String(entry.status || 'present') as DetailedRow['status'],
                checkIn: String(entry.checkIn || ''),
                checkOut: String(entry.checkOut || ''),
                totalWorkedMinutes: workedMinutes,
                totalWorkedHours: Number((workedMinutes / 60).toFixed(2)),
                totalWorkedLabel: formatWorkedLabel(workedMinutes),
                overtimeHours: Number(Number(entry.overtimeHours || 0).toFixed(2)),
                checkInLocationLink: buildLocationLink(entry.checkInLocation),
                checkOutLocationLink: buildLocationLink(entry.checkOutLocation),
                checkInSource: String(entry.checkInSource || ''),
                checkOutSource: String(entry.checkOutSource || ''),
                notes: String(entry.notes || ''),
                isLocked: Boolean(entry.isLocked),
              } satisfies DetailedRow;
            });

          const summary = rows.reduce(
            (acc, row) => {
              acc.totalEntries += 1;
              acc.employeeIds.add(row.employeeId);
              acc.totalWorkedMinutes += Number(row.totalWorkedMinutes || 0);
              acc.totalOvertimeHours += Number(row.overtimeHours || 0);
              if (row.status === 'present') acc.presentCount += 1;
              else if (row.status === 'half_day') acc.halfDayCount += 1;
              else if (row.status === 'leave') acc.leaveCount += 1;
              else if (row.status === 'absent') acc.absentCount += 1;
              return acc;
            },
            {
              totalEntries: 0,
              employeeIds: new Set<string>(),
              presentCount: 0,
              halfDayCount: 0,
              leaveCount: 0,
              absentCount: 0,
              totalWorkedMinutes: 0,
              totalOvertimeHours: 0,
            }
          );

          setDetailRows(rows);
          setDetailSummary({
            totalEntries: summary.totalEntries,
            employeeCount: summary.employeeIds.size,
            presentCount: summary.presentCount,
            halfDayCount: summary.halfDayCount,
            leaveCount: summary.leaveCount,
            absentCount: summary.absentCount,
            totalWorkedMinutes: summary.totalWorkedMinutes,
            totalWorkedHours: Number((summary.totalWorkedMinutes / 60).toFixed(2)),
            totalWorkedLabel: formatWorkedLabel(summary.totalWorkedMinutes),
            totalOvertimeHours: Number(summary.totalOvertimeHours.toFixed(2)),
          });
          setDetailError('');
        } catch (fallbackError: any) {
          setDetailRows([]);
          setDetailSummary(DEFAULT_DETAIL_SUMMARY);
          setDetailError(fallbackError?.message || error?.message || 'Failed to load attendance detail report.');
        }
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const loadMonthlyReport = async () => {
    setMonthlyLoading(true);
    setMonthlyError('');
    try {
      const params = new URLSearchParams({ month: monthlyMonth });
      if (monthlyEmployeeId !== 'all') params.set('employeeId', monthlyEmployeeId);
      const response = await fetchApiJson(apiUrl(`/api/attendance/reports/monthly?${params.toString()}`), { headers });
      setMonthlyPayload((response?.data as MonthlyPayload) || null);
    } catch (error: any) {
      if (!isEndpointMissingError(error)) {
        setMonthlyPayload(null);
        setMonthlyError(error?.message || 'Failed to load monthly attendance sheet.');
      } else {
        try {
          const entries = await loadLegacyAttendanceEntries(monthlyMonth);
          const payload = buildMonthlyPayloadFromEntries(entries, employees, monthlyMonth, monthlyEmployeeId);
          setMonthlyPayload(payload);
          setMonthlyError('');
        } catch (fallbackError: any) {
          setMonthlyPayload(null);
          setMonthlyError(fallbackError?.message || error?.message || 'Failed to load monthly attendance sheet.');
        }
      }
    } finally {
      setMonthlyLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
    void loadDetailReport();
    void loadMonthlyReport();
  }, []);

  const filteredMonthlyRows = useMemo(() => {
    const rows = monthlyPayload?.rows || [];
    const query = normalizeText(monthlySearch);
    if (!query) return rows;
    return rows.filter((row) => normalizeText(`${row.employeeCode} ${row.employeeName} ${row.designation || ''}`).includes(query));
  }, [monthlyPayload?.rows, monthlySearch]);

  const exportMonthlyCsv = () => {
    if (!monthlyPayload) return;
    const headerRow = ['Employee Code', 'Employee Name', 'Designation', ...monthlyPayload.days.map((day) => `Day ${day.day}`), 'Present Days', 'Attendance %'];
    const rows = filteredMonthlyRows.map((row) => [
      row.employeeCode,
      row.employeeName,
      row.designation || '',
      ...row.dayMarks.map((mark) => mark.mark),
      row.presentEquivalentDays,
      row.attendancePercent,
    ]);
    downloadCsv(`attendance-monthly-${monthlyPayload.month}.csv`, rows, headerRow);
  };

  const printMonthlySheet = () => {
    if (!monthlyPayload) return;
    const settings = getGeneralSettings();
    const companyName = settings.business.tradeName || settings.business.legalName || 'Sarva Sports Complex';
    const popup = window.open('', '_blank', 'width=1440,height=900');
    if (!popup) {
      setMonthlyError('Allow popups in the browser to print the monthly attendance sheet.');
      return;
    }

    const headerCells = monthlyPayload.days
      .map((day) => {
        const weekend = day.weekdayShort === 'Sun' || day.weekdayShort === 'Sat';
        return `<th class="day-header${weekend ? ' weekend' : ''}"><span>${day.day}</span><small>${escapeHtml(day.weekdayShort)}</small></th>`;
      })
      .join('');

    const bodyRows = filteredMonthlyRows
      .map((row, index) => {
        const dayCells = row.dayMarks
          .map((mark) => `<td class="day-cell${mark.weekdayShort === 'Sun' || mark.weekdayShort === 'Sat' ? ' weekend' : ''}">${mark.mark ? '&#10003;' : ''}</td>`)
          .join('');

        return `<tr>
          <td class="rank-cell">${index + 1}</td>
          <td class="employee-cell"><div class="employee-code">${escapeHtml(row.employeeCode)}</div><div class="employee-name">${escapeHtml(row.employeeName)}</div></td>
          ${dayCells}
          <td class="summary-cell">${escapeHtml(String(row.presentEquivalentDays))}</td>
          <td class="summary-cell">${escapeHtml(String(row.attendancePercent.toFixed(2)))}%</td>
        </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(companyName)} - Monthly Attendance Sheet</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
      .sheet { width: 100%; }
      .title-band { border: 1px solid #111827; background: linear-gradient(90deg, #fef08a, #facc15); padding: 12px 16px; text-align: center; }
      .title-band h1 { margin: 0; font-size: 24px; letter-spacing: 0.18em; color: #0f172a; }
      .meta-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr 0.8fr; border: 1px solid #111827; border-top: none; }
      .meta-card { border-right: 1px solid #111827; padding: 10px 12px; min-height: 68px; background: #f8fafc; }
      .meta-card:last-child { border-right: none; }
      .meta-card h2 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: #475569; }
      .meta-card p { margin: 0; font-size: 14px; font-weight: 700; }
      .meta-note { padding: 8px 12px; border: 1px solid #111827; border-top: none; font-size: 11px; color: #334155; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #111827; border-top: none; }
      th, td { border: 1px solid #111827; padding: 3px; text-align: center; font-size: 9px; }
      thead th { background: #f8fafc; font-weight: 700; }
      .rank-cell { width: 36px; }
      .employee-cell { width: 140px; text-align: left; padding-left: 6px; }
      .employee-code { font-size: 9px; color: #334155; }
      .employee-name { font-size: 10px; font-weight: 700; color: #0f172a; }
      .day-header span { display: block; font-size: 10px; }
      .day-header small { display: block; margin-top: 2px; font-size: 8px; color: #475569; }
      .weekend { background: #fef3c7 !important; }
      .day-cell { height: 22px; font-size: 11px; font-weight: 700; }
      .summary-cell { width: 48px; font-weight: 700; background: #ecfccb; }
      .footer-note { margin-top: 8px; font-size: 10px; color: #475569; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title-band"><h1>Monthly Attendance Sheet</h1></div>
      <div class="meta-grid">
        <div class="meta-card"><h2>Company</h2><p>${escapeHtml(companyName)}</p></div>
        <div class="meta-card"><h2>Month</h2><p>${escapeHtml(monthlyPayload.monthLabel)}</p></div>
        <div class="meta-card"><h2>Period</h2><p>${escapeHtml(monthlyPayload.startDate)} to ${escapeHtml(monthlyPayload.endDate)}</p></div>
        <div class="meta-card"><h2>Total Staff</h2><p>${escapeHtml(String(filteredMonthlyRows.length))}</p></div>
      </div>
      <div class="meta-note">Tick marks show days with presence recorded. For exact check-in, check-out, GPS link, and worked time, use the employee-wise attendance detail report.</div>
      <table>
        <thead>
          <tr>
            <th class="rank-cell">No.</th>
            <th class="employee-cell">Employee</th>
            ${headerCells}
            <th class="summary-cell">Present</th>
            <th class="summary-cell">%</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || `<tr><td colspan="${monthlyPayload.days.length + 4}">No attendance rows found.</td></tr>`}
        </tbody>
      </table>
      <div class="footer-note">Printed from Sarva Attendance Reports on ${escapeHtml(new Date().toLocaleString('en-IN'))}.</div>
    </div>
    <script>window.onload = function () { window.print(); };</script>
  </body>
</html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  const summaryCards = [
    { label: 'Entries', value: detailSummary.totalEntries, tone: 'text-white' },
    { label: 'Employees', value: detailSummary.employeeCount, tone: 'text-cyan-200' },
    { label: 'Worked Time', value: detailSummary.totalWorkedLabel, tone: 'text-emerald-200' },
    { label: 'Overtime', value: `${detailSummary.totalOvertimeHours.toFixed(2)} hrs`, tone: 'text-indigo-200' },
    { label: 'Present', value: detailSummary.presentCount, tone: 'text-emerald-200' },
    { label: 'Absent', value: detailSummary.absentCount, tone: 'text-rose-200' },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">People Reports</p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Attendance Reports</h1>
          <p className="max-w-4xl text-sm text-gray-300">
            Use the employee-wise detail report to review exact check-in, check-out, worked time, and map links.
            Use the monthly sheet to print one month of attendance on a single date grid with tick marks.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ManualHelpLink anchor="attendance-reports" />
            <Link
              to="/attendance"
              className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/20"
            >
              Open Attendance Register
            </Link>
            <Link
              to="/attendance/self"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              Open Employee Check In
            </Link>
          </div>
        </div>
      </div>

      <CardTabs
        items={[
          { key: 'detail', label: 'Employee-wise Detail' },
          { key: 'monthly', label: 'Monthly Attendance Sheet' },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
        ariaLabel="Attendance report type"
      />

      {activeTab === 'detail' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_260px_200px_auto]">
              <label className="space-y-1 text-sm text-gray-300">
                <span>Start Date</span>
                <input
                  type="date"
                  value={detailStartDate}
                  onChange={(e) => setDetailStartDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </label>
              <label className="space-y-1 text-sm text-gray-300">
                <span>End Date</span>
                <input
                  type="date"
                  value={detailEndDate}
                  onChange={(e) => setDetailEndDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </label>
              <label className="space-y-1 text-sm text-gray-300">
                <span>Employee</span>
                <select
                  value={detailEmployeeId}
                  onChange={(e) => setDetailEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                >
                  <option value="all">All employees</option>
                  {employees.map((employee) => (
                    <option key={employee._id} value={employee._id} className="bg-slate-950">
                      {employee.employeeCode} - {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm text-gray-300">
                <span>Status</span>
                <select
                  value={detailStatus}
                  onChange={(e) => setDetailStatus(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                >
                  <option value="all">All status</option>
                  <option value="present">Present</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave</option>
                  <option value="absent">Absent</option>
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  onClick={() => void loadDetailReport()}
                  disabled={detailLoading}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
                >
                  {detailLoading ? 'Loading...' : 'Load Report'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailStartDate(getCurrentMonth().concat('-01'));
                    setDetailEndDate(getTodayLocalDate());
                    setDetailEmployeeId('all');
                    setDetailStatus('all');
                  }}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Reset Filters
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              This report shows exact day-wise attendance rows with check-in, check-out, worked hours, overtime, and a map link for the check-in and check-out location when available.
            </p>
          </div>

          {detailError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {detailError}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
                <p className={`mt-3 text-xl font-semibold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <ReportDataTable
            title="Employee-wise Attendance Detail"
            data={detailRows}
            itemLabel="attendance rows"
            searchPlaceholder="Search by employee, date, status, note, or location source"
            exportFileName={`attendance-detail-${detailStartDate}-${detailEndDate}.csv`}
            columns={[
              {
                key: 'date',
                header: 'Date',
                accessor: 'dateKey',
                render: (row) => <span className="text-white">{row.date}</span>,
              },
              {
                key: 'employee',
                header: 'Employee',
                render: (row) => (
                  <div>
                    <div className="font-semibold text-white">
                      {row.employeeCode ? `${row.employeeCode} - ${row.employeeName}` : row.employeeName}
                    </div>
                    <div className="text-xs text-gray-400">{row.designation || 'No designation'}</div>
                  </div>
                ),
                searchValue: (row) => `${row.employeeCode} ${row.employeeName} ${row.designation || ''}`,
                sortValue: (row) => `${row.employeeCode} ${row.employeeName}`,
                exportValue: (row) => `${row.employeeCode ? `${row.employeeCode} - ` : ''}${row.employeeName}`,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-white">
                    {statusLabel(row.status)}
                  </span>
                ),
                accessor: 'status',
                exportValue: (row) => statusLabel(row.status),
              },
              {
                key: 'checkIn',
                header: 'Check In',
                accessor: 'checkIn',
                exportValue: (row) => row.checkIn || '-',
              },
              {
                key: 'checkOut',
                header: 'Check Out',
                accessor: 'checkOut',
                exportValue: (row) => row.checkOut || '-',
              },
              {
                key: 'worked',
                header: 'Total Time',
                render: (row) => <span className="text-emerald-200">{row.totalWorkedLabel}</span>,
                sortValue: (row) => row.totalWorkedMinutes,
                exportValue: (row) => row.totalWorkedLabel,
              },
              {
                key: 'overtime',
                header: 'OT Hours',
                accessor: 'overtimeHours',
              },
              {
                key: 'checkInLocation',
                header: 'Check In Link',
                render: (row) =>
                  row.checkInLocationLink ? (
                    <a
                      href={row.checkInLocationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-200 underline"
                    >
                      Open Map
                    </a>
                  ) : (
                    <span className="text-gray-500">-</span>
                  ),
                searchValue: (row) => `${row.checkInSource || ''} ${row.checkInLocationLink || ''}`,
                sortValue: (row) => row.checkInLocationLink || '',
                exportValue: (row) => row.checkInLocationLink || '',
              },
              {
                key: 'checkOutLocation',
                header: 'Check Out Link',
                render: (row) =>
                  row.checkOutLocationLink ? (
                    <a
                      href={row.checkOutLocationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-200 underline"
                    >
                      Open Map
                    </a>
                  ) : (
                    <span className="text-gray-500">-</span>
                  ),
                searchValue: (row) => `${row.checkOutSource || ''} ${row.checkOutLocationLink || ''}`,
                sortValue: (row) => row.checkOutLocationLink || '',
                exportValue: (row) => row.checkOutLocationLink || '',
              },
              {
                key: 'notes',
                header: 'Notes',
                accessor: 'notes',
                exportValue: (row) => row.notes || '',
              },
            ]}
          />
        </section>
      ) : (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_260px_1fr_auto_auto]">
              <label className="space-y-1 text-sm text-gray-300">
                <span>Month</span>
                <input
                  type="month"
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </label>
              <label className="space-y-1 text-sm text-gray-300">
                <span>Employee</span>
                <select
                  value={monthlyEmployeeId}
                  onChange={(e) => setMonthlyEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                >
                  <option value="all">All employees</option>
                  {employees.map((employee) => (
                    <option key={employee._id} value={employee._id} className="bg-slate-950">
                      {employee.employeeCode} - {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm text-gray-300">
                <span>Search on sheet</span>
                <input
                  type="text"
                  value={monthlySearch}
                  onChange={(e) => setMonthlySearch(e.target.value)}
                  placeholder="Search employee code, name, or designation"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-gray-500"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadMonthlyReport()}
                disabled={monthlyLoading}
                className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {monthlyLoading ? 'Loading...' : 'Load Sheet'}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={printMonthlySheet}
                  disabled={!monthlyPayload || monthlyLoading}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                >
                  Print Sheet
                </button>
                <ActionIconButton
                  kind="exportCsv"
                  onClick={exportMonthlyCsv}
                  disabled={!monthlyPayload || monthlyLoading}
                  title="Export CSV"
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Tick marks show attendance presence on the monthly sheet. Use the employee-wise detail tab when you need exact check-in, check-out, or GPS location links.
            </p>
          </div>

          {monthlyError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {monthlyError}
            </div>
          )}

          {monthlyPayload && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Month</p>
                <p className="mt-3 text-xl font-semibold text-white">{monthlyPayload.monthLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Employees On Sheet</p>
                <p className="mt-3 text-xl font-semibold text-cyan-200">{filteredMonthlyRows.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Days In Month</p>
                <p className="mt-3 text-xl font-semibold text-white">{monthlyPayload.daysInMonth}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Present Equivalent Days</p>
                <p className="mt-3 text-xl font-semibold text-emerald-200">{monthlyPayload.totalPresentEquivalentDays}</p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Monthly Attendance Sheet</h2>
                <p className="text-sm text-gray-400">
                  One month on one grid. Print this sheet when you need a simple present-mark register.
                </p>
              </div>
              {monthlyPayload && (
                <div className="text-xs text-gray-400">
                  Period: <span className="font-semibold text-white">{monthlyPayload.startDate}</span> to{' '}
                  <span className="font-semibold text-white">{monthlyPayload.endDate}</span>
                </div>
              )}
            </div>

            {monthlyLoading ? (
              <div className="py-10 text-center text-sm text-indigo-200">Loading monthly attendance sheet...</div>
            ) : monthlyPayload ? (
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="sticky left-0 z-20 border border-white/10 bg-slate-950 px-2 py-2 text-left text-slate-300">Code</th>
                    <th className="sticky left-[76px] z-20 border border-white/10 bg-slate-950 px-2 py-2 text-left text-slate-300">Employee</th>
                    {monthlyPayload.days.map((day) => {
                      const weekend = day.weekdayShort === 'Sat' || day.weekdayShort === 'Sun';
                      return (
                        <th
                          key={day.dateKey}
                          className={`min-w-[42px] border border-white/10 px-1 py-2 text-center ${weekend ? 'bg-amber-500/10 text-amber-100' : 'bg-slate-950 text-slate-300'}`}
                        >
                          <div className="font-semibold text-white">{day.day}</div>
                          <div className="text-[10px]">{day.weekdayShort}</div>
                        </th>
                      );
                    })}
                    <th className="border border-white/10 bg-slate-950 px-2 py-2 text-center text-slate-300">Present</th>
                    <th className="border border-white/10 bg-slate-950 px-2 py-2 text-center text-slate-300">%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMonthlyRows.map((row) => (
                    <tr key={row.employeeId} className="border-b border-white/10">
                      <td className="sticky left-0 z-10 border border-white/10 bg-slate-950/95 px-2 py-2 text-left text-cyan-100">
                        {row.employeeCode}
                      </td>
                      <td className="sticky left-[76px] z-10 border border-white/10 bg-slate-950/95 px-2 py-2 text-left">
                        <div className="font-semibold text-white">{row.employeeName}</div>
                        <div className="text-[10px] text-gray-400">{row.designation || 'No designation'}</div>
                      </td>
                      {row.dayMarks.map((mark) => {
                        const weekend = mark.weekdayShort === 'Sat' || mark.weekdayShort === 'Sun';
                        return (
                          <td
                            key={`${row.employeeId}-${mark.dateKey}`}
                            className={`border border-white/10 px-1 py-2 text-center text-sm font-bold ${weekend ? 'bg-amber-500/5 text-amber-100' : 'text-white'}`}
                            title={mark.status ? `Status: ${statusLabel(mark.status as DetailedRow['status'])}` : 'No present mark'}
                          >
                            {mark.mark}
                          </td>
                        );
                      })}
                      <td className="border border-white/10 px-2 py-2 text-center text-emerald-200">{row.presentEquivalentDays}</td>
                      <td className="border border-white/10 px-2 py-2 text-center text-cyan-100">{row.attendancePercent.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {filteredMonthlyRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={(monthlyPayload.days?.length || 0) + 4}
                        className="px-2 py-8 text-center text-sm text-gray-400"
                      >
                        No attendance rows found for the selected month or employee filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="py-10 text-center text-sm text-gray-400">Load a month to view the attendance sheet.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
