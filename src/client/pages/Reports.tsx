import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { CardTabs } from '../components/CardTabs';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { getGeneralSettings } from '../utils/generalSettings';

type ReportTabKey =
  | 'daily-sales-summary'
  | 'item-wise-sales'
  | 'customer-wise-sales'
  | 'sales-return-report'
  | 'gross-profit-report'
  | 'outstanding-receivables-report'
  | 'attendance-report'
  | 'cash-vs-credit-sales-report'
  | 'user-wise-sales-report';

const REPORT_TAB_KEYS: ReportTabKey[] = [
  'daily-sales-summary',
  'item-wise-sales',
  'customer-wise-sales',
  'sales-return-report',
  'gross-profit-report',
  'outstanding-receivables-report',
  'attendance-report',
  'cash-vs-credit-sales-report',
  'user-wise-sales-report',
];

const REPORT_TAB_LABEL: Record<ReportTabKey, string> = {
  'daily-sales-summary': 'Daily Sales Summary',
  'item-wise-sales': 'Item-wise Sales Report',
  'customer-wise-sales': 'Customer-wise Sales Report',
  'sales-return-report': 'Sales Return Report',
  'gross-profit-report': 'Gross Profit Report',
  'outstanding-receivables-report': 'Outstanding Receivables Report',
  'attendance-report': 'Attendance Report',
  'cash-vs-credit-sales-report': 'Cash vs Credit Sales Report',
  'user-wise-sales-report': 'User-wise Sales Report',
};

const KEY_METRIC_TABS: ReportTabKey[] = [
  'gross-profit-report',
  'outstanding-receivables-report',
  'sales-return-report',
];

const REPORT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
type SortDirection = 'asc' | 'desc';

const createTabState = <T,>(initial: T): Record<ReportTabKey, T> =>
  REPORT_TAB_KEYS.reduce((acc, key) => {
    acc[key] = initial;
    return acc;
  }, {} as Record<ReportTabKey, T>);

interface ExportDataset {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  summary?: Array<[string, string | number]>;
}

const toNumber = (value: any): number => Number(value || 0);
const toFixed2 = (value: any): number => Number(toNumber(value).toFixed(2));
const valueAsString = (value: string | number): string => (typeof value === 'number' ? String(value) : value);
const normalizeText = (value: unknown): string => String(value || '').trim().toLowerCase();
const compareSortValues = (a: unknown, b: unknown, direction: SortDirection): number => {
  let result = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else {
    result = String(a ?? '').localeCompare(String(b ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  return direction === 'asc' ? result : -result;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fileSafe = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const imageFormatFromDataUrl = (dataUrl: string): 'PNG' | 'JPEG' => {
  const value = String(dataUrl || '').toLowerCase();
  if (value.startsWith('data:image/png')) return 'PNG';
  return 'JPEG';
};

export const Reports: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [dailySales, setDailySales] = useState<any[]>([]);
  const [itemSales, setItemSales] = useState<any[]>([]);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [returnsReport, setReturnsReport] = useState<{ summary: any; rows: any[] } | null>(null);
  const [grossProfit, setGrossProfit] = useState<any>(null);
  const [receivables, setReceivables] = useState<{ totalOutstanding: number; rows: any[] } | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [cashVsCredit, setCashVsCredit] = useState<{ cash: any; credit: any } | null>(null);
  const [userSales, setUserSales] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTabKey>('daily-sales-summary');
  const [reportPageByTab, setReportPageByTab] = useState<Record<ReportTabKey, number>>(() => createTabState(1));
  const [reportPageSizeByTab, setReportPageSizeByTab] = useState<Record<ReportTabKey, number>>(() => createTabState(25));
  const [tabLoaded, setTabLoaded] = useState<Record<ReportTabKey, boolean>>(() => createTabState(false));
  const [tabLoading, setTabLoading] = useState<Record<ReportTabKey, boolean>>(() => createTabState(false));
  const [reportSearchByTab, setReportSearchByTab] = useState<Record<ReportTabKey, string>>(() => createTabState(''));
  const [reportFilterByTab, setReportFilterByTab] = useState<Record<ReportTabKey, string>>(() => createTabState('all'));
  const [reportSortFieldByTab, setReportSortFieldByTab] = useState<Record<ReportTabKey, string>>(() => createTabState(''));
  const [reportSortDirectionByTab, setReportSortDirectionByTab] = useState<Record<ReportTabKey, SortDirection>>(
    () => createTabState('asc')
  );

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const queryRange = `startDate=${startDate}&endDate=${endDate}`;
  const reportMenu: Array<{ key: ReportTabKey; label: string }> = [
    { key: 'daily-sales-summary', label: 'Daily Sales Summary' },
    { key: 'item-wise-sales', label: 'Item-wise Sales Report' },
    { key: 'customer-wise-sales', label: 'Customer-wise Sales Report' },
    { key: 'sales-return-report', label: 'Sales Return Report' },
    { key: 'gross-profit-report', label: 'Gross Profit Report' },
    { key: 'outstanding-receivables-report', label: 'Outstanding Receivables Report' },
    { key: 'attendance-report', label: 'Attendance Report' },
    { key: 'cash-vs-credit-sales-report', label: 'Cash vs Credit Sales Report' },
    { key: 'user-wise-sales-report', label: 'User-wise Sales Report' },
  ];

  const setSearchForTab = (tab: ReportTabKey, value: string) => {
    setReportSearchByTab((prev) => ({ ...prev, [tab]: value }));
    setReportPageByTab((prev) => ({ ...prev, [tab]: 1 }));
  };

  const setFilterForTab = (tab: ReportTabKey, value: string) => {
    setReportFilterByTab((prev) => ({ ...prev, [tab]: value }));
    setReportPageByTab((prev) => ({ ...prev, [tab]: 1 }));
  };

  const toggleSortForTab = (tab: ReportTabKey, field: string) => {
    const currentField = reportSortFieldByTab[tab] || '';
    const currentDirection = reportSortDirectionByTab[tab] || 'asc';
    if (currentField === field) {
      const nextDirection: SortDirection = currentDirection === 'asc' ? 'desc' : 'asc';
      setReportSortDirectionByTab((prev) => ({ ...prev, [tab]: nextDirection }));
    } else {
      setReportSortFieldByTab((prev) => ({ ...prev, [tab]: field }));
      setReportSortDirectionByTab((prev) => ({ ...prev, [tab]: 'asc' }));
    }
    setReportPageByTab((prev) => ({ ...prev, [tab]: 1 }));
  };

  const resetControlsForTab = (tab: ReportTabKey) => {
    setReportSearchByTab((prev) => ({ ...prev, [tab]: '' }));
    setReportFilterByTab((prev) => ({ ...prev, [tab]: 'all' }));
    setReportSortFieldByTab((prev) => ({ ...prev, [tab]: '' }));
    setReportSortDirectionByTab((prev) => ({ ...prev, [tab]: 'asc' }));
    setReportPageByTab((prev) => ({ ...prev, [tab]: 1 }));
  };

  const sortArrowFor = (tab: ReportTabKey, field: string): string => {
    if (reportSortFieldByTab[tab] !== field) return ' ↕';
    return reportSortDirectionByTab[tab] === 'asc' ? ' ↑' : ' ↓';
  };

  const getPaginationMeta = (tab: ReportTabKey, totalRows: number) => {
    const pageSize = Math.max(1, Number(reportPageSizeByTab[tab] || 25));
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const currentPage = Math.min(Math.max(1, Number(reportPageByTab[tab] || 1)), totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return {
      currentPage,
      totalPages,
      pageSize,
      totalRows,
      start,
      end,
      startIndex: totalRows ? start + 1 : 0,
      endIndex: Math.min(end, totalRows),
    };
  };

  const paginateRows = <T,>(tab: ReportTabKey, rows: T[]) => {
    const meta = getPaginationMeta(tab, rows.length);
    return {
      rows: rows.slice(meta.start, meta.end),
      ...meta,
    };
  };

  const renderPagination = (tab: ReportTabKey, totalRows: number) => {
    const { currentPage, totalPages, pageSize, startIndex, endIndex } = getPaginationMeta(tab, totalRows);
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <p className="text-xs text-gray-400">
          Showing {startIndex}-{endIndex} of {totalRows}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              const nextSize = Math.max(1, Number(e.target.value || 25));
              setReportPageSizeByTab((prev) => ({ ...prev, [tab]: nextSize }));
              setReportPageByTab((prev) => ({ ...prev, [tab]: 1 }));
            }}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
          >
            {REPORT_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-gray-900">
                {option}/page
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setReportPageByTab((prev) => ({ ...prev, [tab]: currentPage - 1 }))}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-gray-300">
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setReportPageByTab((prev) => ({ ...prev, [tab]: currentPage + 1 }))}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const returnStatusOptions = useMemo(() => {
    return Array.from(
      new Set((returnsReport?.rows || []).map((row: any) => String(row?.returnStatus || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [returnsReport?.rows]);

  const dailySalesView = useMemo(() => {
    const tab: ReportTabKey = 'daily-sales-summary';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = dailySales.filter((row) => {
      const dateText = `${row?._id?.year}-${String(row?._id?.month || '').padStart(2, '0')}-${String(row?._id?.day || '').padStart(2, '0')}`;
      if (q) {
        const hay = `${dateText} ${row?.invoices || 0} ${row?.salesAmount || 0} ${row?.taxAmount || 0} ${row?.outstanding || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'with-outstanding' && Number(row?.outstanding || 0) <= 0) return false;
      if (filter === 'no-outstanding' && Number(row?.outstanding || 0) > 0) return false;
      return true;
    });
    const sorted = [...rows].sort((a, b) => {
      if (!sortField) return 0;
      const dateA = `${a?._id?.year}-${String(a?._id?.month || '').padStart(2, '0')}-${String(a?._id?.day || '').padStart(2, '0')}`;
      const dateB = `${b?._id?.year}-${String(b?._id?.month || '').padStart(2, '0')}-${String(b?._id?.day || '').padStart(2, '0')}`;
      const accessors: Record<string, unknown> = {
        dateA,
        invoicesA: Number(a?.invoices || 0),
        salesA: Number(a?.salesAmount || 0),
        taxA: Number(a?.taxAmount || 0),
        outstandingA: Number(a?.outstanding || 0),
      };
      const accessorsB: Record<string, unknown> = {
        dateA: dateB,
        invoicesA: Number(b?.invoices || 0),
        salesA: Number(b?.salesAmount || 0),
        taxA: Number(b?.taxAmount || 0),
        outstandingA: Number(b?.outstanding || 0),
      };
      const keyMap: Record<string, string> = {
        date: 'dateA',
        invoices: 'invoicesA',
        salesAmount: 'salesA',
        taxAmount: 'taxA',
        outstanding: 'outstandingA',
      };
      const mapKey = keyMap[sortField];
      if (!mapKey) return 0;
      return compareSortValues(accessors[mapKey], accessorsB[mapKey], direction);
    });
    return sorted;
  }, [dailySales, reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab]);

  const itemSalesView = useMemo(() => {
    const tab: ReportTabKey = 'item-wise-sales';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = itemSales.filter((row) => {
      if (q) {
        const hay = `${row?.productName || ''} ${row?.quantity || 0} ${row?.taxableValue || 0} ${row?.tax || 0} ${row?.amount || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'high-qty' && Number(row?.quantity || 0) < 5) return false;
      if (filter === 'low-qty' && Number(row?.quantity || 0) >= 5) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        item: [String(a?.productName || ''), String(b?.productName || '')],
        quantity: [Number(a?.quantity || 0), Number(b?.quantity || 0)],
        taxableValue: [Number(a?.taxableValue || 0), Number(b?.taxableValue || 0)],
        tax: [Number(a?.tax || 0), Number(b?.tax || 0)],
        amount: [Number(a?.amount || 0), Number(b?.amount || 0)],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [itemSales, reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab]);

  const customerSalesView = useMemo(() => {
    const tab: ReportTabKey = 'customer-wise-sales';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = customerSales.filter((row) => {
      if (q) {
        const hay = `${row?._id?.customerName || 'Walk-in Customer'} ${row?.invoices || 0} ${row?.amount || 0} ${row?.outstanding || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'with-outstanding' && Number(row?.outstanding || 0) <= 0) return false;
      if (filter === 'no-outstanding' && Number(row?.outstanding || 0) > 0) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        customer: [String(a?._id?.customerName || 'Walk-in Customer'), String(b?._id?.customerName || 'Walk-in Customer')],
        invoices: [Number(a?.invoices || 0), Number(b?.invoices || 0)],
        amount: [Number(a?.amount || 0), Number(b?.amount || 0)],
        outstanding: [Number(a?.outstanding || 0), Number(b?.outstanding || 0)],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [customerSales, reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab]);

  const salesReturnView = useMemo(() => {
    const tab: ReportTabKey = 'sales-return-report';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = (returnsReport?.rows || []).filter((row: any) => {
      if (q) {
        const hay = `${row?.returnNumber || ''} ${row?.customerName || 'N/A'} ${row?.returnStatus || ''} ${row?.refundAmount || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter !== 'all' && String(row?.returnStatus || '').trim().toLowerCase() !== filter) return false;
      return true;
    });
    return [...rows].sort((a: any, b: any) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        returnNumber: [String(a?.returnNumber || ''), String(b?.returnNumber || '')],
        customer: [String(a?.customerName || 'N/A'), String(b?.customerName || 'N/A')],
        status: [String(a?.returnStatus || ''), String(b?.returnStatus || '')],
        refundAmount: [Number(a?.refundAmount || 0), Number(b?.refundAmount || 0)],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab, returnsReport?.rows]);

  const receivablesView = useMemo(() => {
    const tab: ReportTabKey = 'outstanding-receivables-report';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const todayText = new Date().toISOString().slice(0, 10);
    const rows = (receivables?.rows || []).filter((row: any) => {
      const dueDate = row?.dueDate ? String(row.dueDate).slice(0, 10) : '';
      if (q) {
        const hay = `${row?.invoiceNumber || row?.saleNumber || 'N/A'} ${row?.customerName || 'Walk-in Customer'} ${dueDate} ${row?.outstandingAmount || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'overdue' && (!dueDate || dueDate >= todayText)) return false;
      if (filter === 'due-today-or-future' && dueDate && dueDate < todayText) return false;
      return true;
    });
    return [...rows].sort((a: any, b: any) => {
      const dueA = a?.dueDate ? String(a.dueDate).slice(0, 10) : '';
      const dueB = b?.dueDate ? String(b.dueDate).slice(0, 10) : '';
      const keyMap: Record<string, [unknown, unknown]> = {
        invoice: [String(a?.invoiceNumber || a?.saleNumber || 'N/A'), String(b?.invoiceNumber || b?.saleNumber || 'N/A')],
        customer: [String(a?.customerName || 'Walk-in Customer'), String(b?.customerName || 'Walk-in Customer')],
        dueDate: [dueA, dueB],
        outstandingAmount: [Number(a?.outstandingAmount || 0), Number(b?.outstandingAmount || 0)],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [receivables?.rows, reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab]);

  const attendanceView = useMemo(() => {
    const tab: ReportTabKey = 'attendance-report';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = attendanceSummary.filter((row) => {
      const employeeName = row.employeeCode ? `${row.employeeCode} - ${row.employeeName || ''}` : row.employeeName || 'Unknown';
      if (q) {
        const hay = `${employeeName} ${row?.presentDays || 0} ${row?.halfDays || 0} ${row?.leaveDays || 0} ${row?.absentDays || 0} ${row?.overtimeHours || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'with-absence' && Number(row?.absentDays || 0) <= 0) return false;
      if (filter === 'perfect' && (Number(row?.absentDays || 0) > 0 || Number(row?.leaveDays || 0) > 0)) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const employeeA = a.employeeCode ? `${a.employeeCode} - ${a.employeeName || ''}` : a.employeeName || 'Unknown';
      const employeeB = b.employeeCode ? `${b.employeeCode} - ${b.employeeName || ''}` : b.employeeName || 'Unknown';
      const keyMap: Record<string, [unknown, unknown]> = {
        employee: [employeeA, employeeB],
        presentDays: [Number(a?.presentDays || 0), Number(b?.presentDays || 0)],
        halfDays: [Number(a?.halfDays || 0), Number(b?.halfDays || 0)],
        leaveDays: [Number(a?.leaveDays || 0), Number(b?.leaveDays || 0)],
        absentDays: [Number(a?.absentDays || 0), Number(b?.absentDays || 0)],
        overtimeHours: [Number(a?.overtimeHours || 0), Number(b?.overtimeHours || 0)],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [attendanceSummary, reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab]);

  const cashVsCreditRows = useMemo(
    () => [
      {
        type: 'Cash',
        invoices: Number(cashVsCredit?.cash?.count || 0),
        amount: Number(cashVsCredit?.cash?.amount || 0),
      },
      {
        type: 'Credit',
        invoices: Number(cashVsCredit?.credit?.count || 0),
        amount: Number(cashVsCredit?.credit?.amount || 0),
      },
    ],
    [cashVsCredit]
  );

  const cashVsCreditView = useMemo(() => {
    const tab: ReportTabKey = 'cash-vs-credit-sales-report';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = cashVsCreditRows.filter((row) => {
      if (q) {
        const hay = `${row.type} ${row.invoices} ${row.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter !== 'all' && normalizeText(row.type) !== filter) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        type: [a.type, b.type],
        invoices: [a.invoices, b.invoices],
        amount: [a.amount, b.amount],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [cashVsCreditRows, reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab]);

  const userSalesView = useMemo(() => {
    const tab: ReportTabKey = 'user-wise-sales-report';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = userSales.filter((row) => {
      if (q) {
        const hay = `${row?._id || 'Unknown'} ${row?.invoices || 0} ${row?.totalAmount || 0} ${row?.cash || 0} ${row?.upi || 0} ${row?.card || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'with-cash' && Number(row?.cash || 0) <= 0) return false;
      if (filter === 'with-upi' && Number(row?.upi || 0) <= 0) return false;
      if (filter === 'with-card' && Number(row?.card || 0) <= 0) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        user: [String(a?._id || 'Unknown'), String(b?._id || 'Unknown')],
        invoices: [Number(a?.invoices || 0), Number(b?.invoices || 0)],
        totalAmount: [Number(a?.totalAmount || 0), Number(b?.totalAmount || 0)],
        cash: [Number(a?.cash || 0), Number(b?.cash || 0)],
        upi: [Number(a?.upi || 0), Number(b?.upi || 0)],
        card: [Number(a?.card || 0), Number(b?.card || 0)],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab, userSales]);

  const renderSortHeader = (
    tab: ReportTabKey,
    label: string,
    field: string,
    align: 'left' | 'right' = 'left'
  ) => (
    <th className={`px-2 py-2 text-xs font-semibold text-gray-300 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => toggleSortForTab(tab, field)}
        className={`cursor-pointer select-none rounded px-1 py-0.5 transition hover:bg-white/10 ${align === 'right' ? 'ml-auto flex' : ''}`}
        title="Sort"
      >
        {label}
        {sortArrowFor(tab, field)}
      </button>
    </th>
  );

  const renderReportControls = (
    tab: ReportTabKey,
    searchPlaceholder: string,
    filterOptions: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All' }]
  ) => (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        value={reportSearchByTab[tab] || ''}
        onChange={(e) => setSearchForTab(tab, e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full max-w-sm rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500"
      />
      <select
        value={reportFilterByTab[tab] || 'all'}
        onChange={(e) => setFilterForTab(tab, e.target.value)}
        className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
      >
        {filterOptions.map((option) => (
          <option key={option.value} value={option.value} className="bg-gray-900">
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => resetControlsForTab(tab)}
        className="cursor-pointer rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
      >
        Reset
      </button>
    </div>
  );

  const activeReportExport = useMemo<ExportDataset>(() => {
    if (activeTab === 'daily-sales-summary') {
      return {
        title: 'Daily Sales Summary',
        columns: ['Date', 'Invoices', 'Sales', 'Tax', 'Outstanding'],
        rows: dailySalesView.map((row) => [
          `${row._id.year}-${String(row._id.month).padStart(2, '0')}-${String(row._id.day).padStart(2, '0')}`,
          toNumber(row.invoices),
          toFixed2(row.salesAmount),
          toFixed2(row.taxAmount),
          toFixed2(row.outstanding),
        ]),
      };
    }

    if (activeTab === 'item-wise-sales') {
      return {
        title: 'Item-wise Sales Report',
        columns: ['Item', 'Qty', 'Taxable', 'Tax', 'Total'],
        rows: itemSalesView.map((row) => [
          String(row.productName || ''),
          toNumber(row.quantity),
          toFixed2(row.taxableValue),
          toFixed2(row.tax),
          toFixed2(row.amount),
        ]),
      };
    }

    if (activeTab === 'customer-wise-sales') {
      return {
        title: 'Customer-wise Sales Report',
        columns: ['Customer', 'Invoices', 'Amount', 'Outstanding'],
        rows: customerSalesView.map((row) => [
          String(row._id?.customerName || 'Walk-in Customer'),
          toNumber(row.invoices),
          toFixed2(row.amount),
          toFixed2(row.outstanding),
        ]),
      };
    }

    if (activeTab === 'sales-return-report') {
      return {
        title: 'Sales Return Report',
        columns: ['Return No', 'Customer', 'Status', 'Refund', 'Returned Amount', 'Returned Tax'],
        summary: [
          ['Returns', toNumber(returnsReport?.summary?.count || 0)],
          ['Refund Amount', toFixed2(returnsReport?.summary?.refundAmount || 0)],
          ['Returned Amount', toFixed2(returnsReport?.summary?.returnedAmount || 0)],
          ['Returned Tax', toFixed2(returnsReport?.summary?.returnedTax || 0)],
        ],
        rows: salesReturnView.map((row: any) => [
          String(row.returnNumber || ''),
          String(row.customerName || 'N/A'),
          String(row.returnStatus || ''),
          toFixed2(row.refundAmount),
          toFixed2(row.returnedAmount),
          toFixed2(row.returnedGst),
        ]),
      };
    }

    if (activeTab === 'gross-profit-report') {
      return {
        title: 'Gross Profit Report',
        columns: ['Metric', 'Value'],
        rows: [
          ['Revenue', toFixed2(grossProfit?.revenue)],
          ['Cost of Goods', toFixed2(grossProfit?.costOfGoods)],
          ['Gross Profit', toFixed2(grossProfit?.grossProfit)],
          ['Margin %', Number(toNumber(grossProfit?.marginPercent).toFixed(2))],
        ],
      };
    }

    if (activeTab === 'outstanding-receivables-report') {
      return {
        title: 'Outstanding Receivables Report',
        columns: ['Invoice', 'Customer', 'Due Date', 'Outstanding'],
        summary: [['Total Outstanding', toFixed2(receivables?.totalOutstanding || 0)]],
        rows: receivablesView.map((row: any) => [
          String(row.invoiceNumber || row.saleNumber || 'N/A'),
          String(row.customerName || 'Walk-in Customer'),
          row.dueDate ? String(row.dueDate).slice(0, 10) : '-',
          toFixed2(row.outstandingAmount),
        ]),
      };
    }

    if (activeTab === 'attendance-report') {
      return {
        title: 'Attendance Report',
        columns: ['Employee', 'Present', 'Half Day', 'Leave', 'Absent', 'OT Hours'],
        rows: attendanceView.map((row) => [
          row.employeeCode ? `${row.employeeCode} - ${row.employeeName || ''}` : row.employeeName || 'Unknown',
          toNumber(row.presentDays),
          toNumber(row.halfDays),
          toNumber(row.leaveDays),
          toNumber(row.absentDays),
          toFixed2(row.overtimeHours),
        ]),
      };
    }

    if (activeTab === 'cash-vs-credit-sales-report') {
      return {
        title: 'Cash vs Credit Sales Report',
        columns: ['Type', 'Invoices', 'Amount'],
        rows: cashVsCreditView.map((row) => [row.type, toNumber(row.invoices), toFixed2(row.amount)]),
      };
    }

    return {
      title: 'User-wise Sales Report',
      columns: ['User', 'Invoices', 'Total', 'Cash', 'UPI', 'Card'],
      rows: userSalesView.map((row) => [
        String(row._id || 'Unknown'),
        toNumber(row.invoices),
        toFixed2(row.totalAmount),
        toFixed2(row.cash),
        toFixed2(row.upi),
        toFixed2(row.card),
      ]),
    };
  }, [
    activeTab,
    attendanceView,
    cashVsCreditView,
    customerSalesView,
    dailySalesView,
    grossProfit,
    itemSalesView,
    receivables,
    receivablesView,
    returnsReport,
    salesReturnView,
    userSalesView,
  ]);

  const hasExportData = activeReportExport.rows.length > 0;

  const exportActiveToExcel = () => {
    const currentSettings = getGeneralSettings();
    const reportLogoDataUrl =
      currentSettings.business.reportLogoDataUrl || currentSettings.business.invoiceLogoDataUrl || '';
    const generatedAt = new Date().toLocaleString('en-IN');
    const summaryHtml = (activeReportExport.summary || [])
      .map(
        ([label, value]) =>
          `<tr><td class="summary-label">${escapeHtml(valueAsString(label))}</td><td class="summary-value">${escapeHtml(
            valueAsString(value)
          )}</td></tr>`
      )
      .join('');

    const headersHtml = activeReportExport.columns
      .map((column) => `<th>${escapeHtml(column)}</th>`)
      .join('');

    const rowsHtml = activeReportExport.rows
      .map((row) => {
        const cells = row
          .map((cell) => {
            const value = valueAsString(cell);
            const cls = typeof cell === 'number' ? 'num' : '';
            return `<td class="${cls}">${escapeHtml(value)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const noDataHtml = `<tr><td colspan="${activeReportExport.columns.length}" class="empty">No data</td></tr>`;

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Calibri, "Segoe UI", sans-serif; background: #f4f7fb; color: #1f2937; margin: 20px; }
      .sheet { background: #ffffff; border: 1px solid #d6dfeb; border-radius: 10px; overflow: hidden; }
      .title-wrap { background: linear-gradient(90deg, #1f4e78, #2f5d8f); color: #fff; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
      .title { font-size: 18px; font-weight: 700; }
      .title-sub { margin-top: 4px; font-size: 12px; color: #dbe9fb; }
      .report-logo-box { width: 90px; height: 56px; border: 1px solid rgba(255,255,255,0.28); border-radius: 6px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.08); overflow: hidden; }
      .report-logo { width: 100%; height: 100%; object-fit: contain; }
      .meta { display: flex; gap: 16px; padding: 10px 16px 14px; border-bottom: 1px solid #e4ebf5; font-size: 12px; color: #4f5f78; }
      .meta strong { color: #25324a; }
      .summary { width: 100%; border-collapse: collapse; margin: 12px 16px 0; max-width: 560px; }
      .summary td { border: 1px solid #dce5f2; padding: 8px 10px; font-size: 12px; }
      .summary-label { background: #f3f7fd; font-weight: 600; width: 60%; }
      .summary-value { background: #ffffff; text-align: right; font-weight: 700; color: #1f4e78; }
      .data-wrap { padding: 12px 16px 16px; }
      table.data { width: 100%; border-collapse: collapse; table-layout: auto; }
      table.data th { background: #274f7d; color: #fff; font-size: 12px; padding: 9px 10px; border: 1px solid #355f8f; text-align: left; }
      table.data td { border: 1px solid #d9e2ef; padding: 8px 10px; font-size: 11px; color: #1f2937; vertical-align: top; }
      table.data tr:nth-child(even) td { background: #f8fbff; }
      table.data tr:nth-child(odd) td { background: #ffffff; }
      table.data td.num { text-align: right; font-variant-numeric: tabular-nums; }
      table.data td.empty { text-align: center; color: #6b7280; padding: 14px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title-wrap">
        <div>
          <div class="title">${escapeHtml(activeReportExport.title)}</div>
          <div class="title-sub">${escapeHtml(currentSettings.business.tradeName || currentSettings.business.legalName || 'Sarva')}</div>
        </div>
        ${reportLogoDataUrl ? `<div class="report-logo-box"><img class="report-logo" src="${reportLogoDataUrl}" alt="Report Logo" /></div>` : ''}
      </div>
      <div class="meta">
        <div><strong>Date Range:</strong> ${escapeHtml(startDate)} to ${escapeHtml(endDate)}</div>
        <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
      </div>
      ${activeReportExport.summary?.length ? `<table class="summary">${summaryHtml}</table>` : ''}
      <div class="data-wrap">
        <table class="data">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${activeReportExport.rows.length ? rowsHtml : noDataHtml}</tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;

    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileSafe(activeReportExport.title)}_${startDate}_to_${endDate}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportActiveToPdf = () => {
    const currentSettings = getGeneralSettings();
    const reportLogoDataUrl =
      currentSettings.business.reportLogoDataUrl || currentSettings.business.invoiceLogoDataUrl || '';
    const isWide = activeReportExport.columns.length > 5;
    const doc = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const tableTopPadding = 8;
    const tableWidth = pageWidth - margin * 2;
    const lineHeight = 4;
    const rowPaddingY = 2.4;
    const rowPaddingX = 2;
    const generatedAt = new Date().toLocaleString('en-IN');

    const palette = {
      titleBg: [30, 78, 130] as const,
      titleText: [255, 255, 255] as const,
      subtitleText: [235, 241, 249] as const,
      cardBg: [240, 245, 252] as const,
      cardBorder: [214, 223, 235] as const,
      cardLabel: [77, 92, 118] as const,
      cardValue: [31, 64, 112] as const,
      tableHeadBg: [39, 79, 125] as const,
      tableHeadText: [255, 255, 255] as const,
      rowOdd: [255, 255, 255] as const,
      rowEven: [247, 250, 255] as const,
      rowBorder: [220, 228, 240] as const,
      textBody: [33, 45, 66] as const,
      textMuted: [92, 105, 128] as const,
    };

    let y = margin;

    const drawHeaderBanner = () => {
      doc.setFillColor(...palette.titleBg);
      doc.roundedRect(margin, y, tableWidth, 24, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...palette.titleText);
      doc.text(activeReportExport.title, margin + 6, y + 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...palette.subtitleText);
      doc.text(`Date Range: ${startDate} to ${endDate}`, margin + 6, y + 15);
      doc.text(`Generated: ${generatedAt}`, margin + 6, y + 20);
      const businessLabel = currentSettings.business.tradeName || currentSettings.business.legalName || 'Sarva';
      doc.text(businessLabel, margin + 6, y + 24 - 1.5);

      if (reportLogoDataUrl) {
        try {
          const logoW = 26;
          const logoH = 16;
          const logoX = margin + tableWidth - logoW - 3;
          const logoY = y + 4;
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(logoX - 1, logoY - 1, logoW + 2, logoH + 2, 1.5, 1.5, 'F');
          doc.addImage(reportLogoDataUrl, imageFormatFromDataUrl(reportLogoDataUrl), logoX, logoY, logoW, logoH);
        } catch {
          // ignore invalid logo image data in export
        }
      }
      y += 29;
    };

    const drawSummaryCards = () => {
      const summary = activeReportExport.summary || [];
      if (!summary.length) return;

      const cards = summary.slice(0, 6);
      const gap = 4;
      const cardHeight = 14;
      const cardWidth = (tableWidth - gap * (cards.length - 1)) / cards.length;

      cards.forEach(([label, value], idx) => {
        const x = margin + idx * (cardWidth + gap);
        doc.setFillColor(...palette.cardBg);
        doc.setDrawColor(...palette.cardBorder);
        doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...palette.cardLabel);
        doc.text(valueAsString(label), x + 2, y + 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...palette.cardValue);
        doc.text(valueAsString(value), x + 2, y + 10.5);
      });

      y += cardHeight + 5;
    };

    const colCount = Math.max(1, activeReportExport.columns.length);
    let colWidths: number[] = [];
    if (colCount === 1) {
      colWidths = [tableWidth];
    } else if (colCount === 2) {
      colWidths = [tableWidth * 0.55, tableWidth * 0.45];
    } else {
      const firstWidth = colCount >= 6 ? tableWidth * 0.24 : tableWidth * 0.3;
      const remaining = tableWidth - firstWidth;
      const each = remaining / (colCount - 1);
      colWidths = [firstWidth, ...Array(colCount - 1).fill(each)];
    }

    const drawTableHeader = () => {
      doc.setFillColor(...palette.tableHeadBg);
      doc.setDrawColor(...palette.rowBorder);
      doc.rect(margin, y, tableWidth, 8.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...palette.tableHeadText);

      let x = margin;
      activeReportExport.columns.forEach((column, index) => {
        doc.text(column, x + rowPaddingX, y + 5.7);
        x += colWidths[index];
        if (index < activeReportExport.columns.length - 1) {
          doc.setDrawColor(86, 119, 161);
          doc.line(x, y, x, y + 8.5);
        }
      });
      y += 8.5;
    };

    const goToNextPage = () => {
      doc.addPage();
      y = margin;
      drawHeaderBanner();
      y += 2;
      drawTableHeader();
    };

    drawHeaderBanner();
    drawSummaryCards();
    y += tableTopPadding;
    drawTableHeader();

    const rows = activeReportExport.rows.length
      ? activeReportExport.rows
      : [[`No data for selected range: ${startDate} to ${endDate}`, ...Array(Math.max(0, colCount - 1)).fill('')]];

    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) => {
        const text = valueAsString(cell);
        const wrapped = doc.splitTextToSize(text, Math.max(12, colWidths[index] - rowPaddingX * 2)) as string[];
        return wrapped.length ? wrapped : ['-'];
      });
      const maxLines = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = Math.max(8, maxLines * lineHeight + rowPaddingY * 2);

      if (y + rowHeight > pageHeight - margin) {
        goToNextPage();
      }

      const rowFill = rowIndex % 2 === 0 ? palette.rowOdd : palette.rowEven;
      doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
      doc.setDrawColor(...palette.rowBorder);
      doc.rect(margin, y, tableWidth, rowHeight, 'FD');

      let x = margin;
      for (let col = 0; col < colCount; col += 1) {
        const lines = cellLines[col] || [''];
        const rawValue = row[col];
        const isNumeric = typeof rawValue === 'number';

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const textColor = isNumeric ? palette.textBody : palette.textMuted;
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);

        lines.forEach((line, lineIndex) => {
          const yLine = y + rowPaddingY + lineHeight + lineIndex * lineHeight - 0.8;
          if (isNumeric) {
            doc.text(line, x + colWidths[col] - rowPaddingX, yLine, { align: 'right' });
          } else {
            doc.text(line, x + rowPaddingX, yLine);
          }
        });

        x += colWidths[col];
        if (col < colCount - 1) {
          doc.setDrawColor(...palette.rowBorder);
          doc.line(x, y, x, y + rowHeight);
        }
      }

      y += rowHeight;
    });

    doc.save(`${fileSafe(activeReportExport.title)}_${startDate}_to_${endDate}.pdf`);
  };

  const loadReportTab = async (tab: ReportTabKey, force = false) => {
    if (!force && tabLoaded[tab]) return;

    setTabLoading((prev) => ({ ...prev, [tab]: true }));
    try {
      switch (tab) {
        case 'daily-sales-summary': {
          const response = await fetchApiJson(apiUrl(`/api/reports/daily-sales-summary?${queryRange}`), { headers });
          setDailySales(Array.isArray(response?.data) ? response.data : []);
          break;
        }
        case 'item-wise-sales': {
          const response = await fetchApiJson(apiUrl(`/api/reports/item-wise-sales?${queryRange}`), { headers });
          setItemSales(Array.isArray(response?.data) ? response.data : []);
          break;
        }
        case 'customer-wise-sales': {
          const response = await fetchApiJson(apiUrl(`/api/reports/customer-wise-sales?${queryRange}`), { headers });
          setCustomerSales(Array.isArray(response?.data) ? response.data : []);
          break;
        }
        case 'sales-return-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/sales-returns?${queryRange}`), { headers });
          setReturnsReport(response?.data || null);
          break;
        }
        case 'gross-profit-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/gross-profit?${queryRange}`), { headers });
          setGrossProfit(response?.data || null);
          break;
        }
        case 'outstanding-receivables-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/outstanding-receivables?${queryRange}`), { headers });
          setReceivables(response?.data || null);
          break;
        }
        case 'attendance-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/attendance-summary?${queryRange}`), { headers });
          setAttendanceSummary(Array.isArray(response?.data) ? response.data : []);
          break;
        }
        case 'cash-vs-credit-sales-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/cash-vs-credit?${queryRange}`), { headers });
          setCashVsCredit(response?.data || null);
          break;
        }
        case 'user-wise-sales-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/user-wise-sales?${queryRange}`), { headers });
          setUserSales(Array.isArray(response?.data) ? response.data : []);
          break;
        }
        default:
          break;
      }
      setTabLoaded((prev) => ({ ...prev, [tab]: true }));
    } catch (e: any) {
      setError(e?.message || `Failed to load ${REPORT_TAB_LABEL[tab]}`);
    } finally {
      setTabLoading((prev) => ({ ...prev, [tab]: false }));
    }
  };

  const runReportsLoad = async (force = false) => {
    if (startDate > endDate) {
      setError('Start date should be before or equal to end date');
      return;
    }

    setLoading(true);
    setError('');
    setReportPageByTab(createTabState(1));
    if (force) {
      setTabLoaded(createTabState(false));
    }
    const targetTabs = Array.from(new Set<ReportTabKey>([activeTab, ...KEY_METRIC_TABS]));
    try {
      await Promise.all(targetTabs.map((tab) => loadReportTab(tab, true)));
    } finally {
      setLoading(false);
    }
  };

  const loadReports = () => {
    void runReportsLoad(true);
  };

  useEffect(() => {
    void runReportsLoad(true);
  }, []);

  useEffect(() => {
    if (tabLoaded[activeTab] || tabLoading[activeTab]) return;
    void loadReportTab(activeTab, false);
  }, [activeTab, tabLoaded, tabLoading]);

  const renderTabPlaceholder = (tab: ReportTabKey) => {
    if (tabLoading[tab] && !tabLoaded[tab]) {
      return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-gray-300">
          Loading {REPORT_TAB_LABEL[tab]}...
        </div>
      );
    }
    if (!tabLoaded[tab]) {
      return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-gray-300">
          {REPORT_TAB_LABEL[tab]} will load when you open this tab.
        </div>
      );
    }
    return null;
  };

  const renderActiveTab = () => {
    if (activeTab === 'daily-sales-summary') {
      const placeholder = renderTabPlaceholder('daily-sales-summary');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'daily-sales-summary';
      const paged = paginateRows(tab, dailySalesView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Daily Sales Summary</h2>
          {renderReportControls(tab, 'Filter by date, invoices, sales, tax or outstanding...', [
            { value: 'all', label: 'All rows' },
            { value: 'with-outstanding', label: 'Outstanding only' },
            { value: 'no-outstanding', label: 'No outstanding' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Date', 'date')}
                {renderSortHeader(tab, 'Invoices', 'invoices')}
                {renderSortHeader(tab, 'Sales', 'salesAmount')}
                {renderSortHeader(tab, 'Tax', 'taxAmount')}
                {renderSortHeader(tab, 'Outstanding', 'outstanding')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-2 text-sm text-gray-300">{`${row._id.year}-${String(row._id.month).padStart(2, '0')}-${String(row._id.day).padStart(2, '0')}`}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.invoices}</td>
                  <td className="px-2 py-2 text-sm text-white">{formatCurrency(Number(row.salesAmount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.taxAmount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-amber-300">{formatCurrency(Number(row.outstanding || 0))}</td>
                </tr>
              ))}
              {!dailySalesView.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, dailySalesView.length)}
        </div>
      );
    }

    if (activeTab === 'item-wise-sales') {
      const placeholder = renderTabPlaceholder('item-wise-sales');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'item-wise-sales';
      const paged = paginateRows(tab, itemSalesView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Item-wise Sales Report</h2>
          {renderReportControls(tab, 'Filter by item, qty, taxable, tax or total...', [
            { value: 'all', label: 'All items' },
            { value: 'high-qty', label: 'High qty (>=5)' },
            { value: 'low-qty', label: 'Low qty (<5)' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Item', 'item')}
                {renderSortHeader(tab, 'Qty', 'quantity')}
                {renderSortHeader(tab, 'Taxable', 'taxableValue')}
                {renderSortHeader(tab, 'Tax', 'tax')}
                {renderSortHeader(tab, 'Total', 'amount')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-2 text-sm text-white">{row.productName}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.quantity}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.taxableValue || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.tax || 0))}</td>
                  <td className="px-2 py-2 text-sm text-emerald-300">{formatCurrency(Number(row.amount || 0))}</td>
                </tr>
              ))}
              {!itemSalesView.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, itemSalesView.length)}
        </div>
      );
    }

    if (activeTab === 'customer-wise-sales') {
      const placeholder = renderTabPlaceholder('customer-wise-sales');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'customer-wise-sales';
      const paged = paginateRows(tab, customerSalesView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Customer-wise Sales Report</h2>
          {renderReportControls(tab, 'Filter by customer, invoice count, amount...', [
            { value: 'all', label: 'All customers' },
            { value: 'with-outstanding', label: 'With outstanding' },
            { value: 'no-outstanding', label: 'No outstanding' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Customer', 'customer')}
                {renderSortHeader(tab, 'Invoices', 'invoices')}
                {renderSortHeader(tab, 'Amount', 'amount')}
                {renderSortHeader(tab, 'Outstanding', 'outstanding')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-2 text-sm text-white">{row._id?.customerName || 'Walk-in Customer'}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.invoices}</td>
                  <td className="px-2 py-2 text-sm text-emerald-300">{formatCurrency(Number(row.amount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-amber-300">{formatCurrency(Number(row.outstanding || 0))}</td>
                </tr>
              ))}
              {!customerSalesView.length && <tr><td colSpan={4} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, customerSalesView.length)}
        </div>
      );
    }

    if (activeTab === 'sales-return-report') {
      const placeholder = renderTabPlaceholder('sales-return-report');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'sales-return-report';
      const paged = paginateRows(tab, salesReturnView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Sales Return Report</h2>
          {renderReportControls(
            tab,
            'Filter by return no, customer, status, refund...',
            [{ value: 'all', label: 'All status' }, ...returnStatusOptions.map((status) => ({
              value: status.toLowerCase(),
              label: status,
            }))]
          )}
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-white/10 p-2 text-gray-300">Returns: {returnsReport?.summary?.count || 0}</div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Refund: {formatCurrency(Number(returnsReport?.summary?.refundAmount || 0))}</div>
          </div>
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Return No', 'returnNumber')}
                {renderSortHeader(tab, 'Customer', 'customer')}
                {renderSortHeader(tab, 'Status', 'status')}
                {renderSortHeader(tab, 'Refund', 'refundAmount')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row: any) => (
                <tr key={row._id}>
                  <td className="px-2 py-2 text-sm text-white">{row.returnNumber}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.customerName || 'N/A'}</td>
                  <td className="px-2 py-2 text-sm uppercase text-gray-300">{row.returnStatus}</td>
                  <td className="px-2 py-2 text-sm text-red-300">{formatCurrency(Number(row.refundAmount || 0))}</td>
                </tr>
              ))}
              {!salesReturnView.length && <tr><td colSpan={4} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, salesReturnView.length)}
        </div>
      );
    }

    if (activeTab === 'gross-profit-report') {
      const placeholder = renderTabPlaceholder('gross-profit-report');
      if (placeholder) return placeholder;
      return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-4 text-lg font-semibold text-white">Gross Profit Report</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded border border-white/10 p-3">
              <p className="text-xs text-gray-400">Revenue</p>
              <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(Number(grossProfit?.revenue || 0))}</p>
            </div>
            <div className="rounded border border-white/10 p-3">
              <p className="text-xs text-gray-400">Cost of Goods</p>
              <p className="mt-1 text-lg font-semibold text-gray-200">{formatCurrency(Number(grossProfit?.costOfGoods || 0))}</p>
            </div>
            <div className="rounded border border-white/10 p-3">
              <p className="text-xs text-gray-400">Gross Profit</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(Number(grossProfit?.grossProfit || 0))}</p>
            </div>
            <div className="rounded border border-white/10 p-3">
              <p className="text-xs text-gray-400">Margin %</p>
              <p className="mt-1 text-lg font-semibold text-indigo-200">{Number(grossProfit?.marginPercent || 0).toFixed(2)}%</p>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'outstanding-receivables-report') {
      const placeholder = renderTabPlaceholder('outstanding-receivables-report');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'outstanding-receivables-report';
      const paged = paginateRows(tab, receivablesView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Outstanding Receivables Report</h2>
          {renderReportControls(tab, 'Filter by invoice, customer, due date, outstanding...', [
            { value: 'all', label: 'All dues' },
            { value: 'overdue', label: 'Overdue only' },
            { value: 'due-today-or-future', label: 'Due today/future' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Invoice', 'invoice')}
                {renderSortHeader(tab, 'Customer', 'customer')}
                {renderSortHeader(tab, 'Due Date', 'dueDate')}
                {renderSortHeader(tab, 'Outstanding', 'outstandingAmount')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row: any) => (
                <tr key={row._id}>
                  <td className="px-2 py-2 text-sm text-white">{row.invoiceNumber || row.saleNumber || 'N/A'}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.customerName || 'Walk-in Customer'}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.dueDate ? String(row.dueDate).slice(0, 10) : '-'}</td>
                  <td className="px-2 py-2 text-sm text-amber-300">{formatCurrency(Number(row.outstandingAmount || 0))}</td>
                </tr>
              ))}
              {!receivablesView.length && <tr><td colSpan={4} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, receivablesView.length)}
        </div>
      );
    }

    if (activeTab === 'attendance-report') {
      const placeholder = renderTabPlaceholder('attendance-report');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'attendance-report';
      const paged = paginateRows(tab, attendanceView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Attendance Report</h2>
          {renderReportControls(tab, 'Filter by employee or attendance values...', [
            { value: 'all', label: 'All employees' },
            { value: 'with-absence', label: 'With absence' },
            { value: 'perfect', label: 'Perfect attendance' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Employee', 'employee')}
                {renderSortHeader(tab, 'Present', 'presentDays')}
                {renderSortHeader(tab, 'Half Day', 'halfDays')}
                {renderSortHeader(tab, 'Leave', 'leaveDays')}
                {renderSortHeader(tab, 'Absent', 'absentDays')}
                {renderSortHeader(tab, 'OT Hours', 'overtimeHours')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-2 text-sm text-white">{row.employeeCode ? `${row.employeeCode} - ${row.employeeName || ''}` : (row.employeeName || 'Unknown')}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.presentDays || 0}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.halfDays || 0}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.leaveDays || 0}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.absentDays || 0}</td>
                  <td className="px-2 py-2 text-sm text-indigo-200">{row.overtimeHours || 0}</td>
                </tr>
              ))}
              {!attendanceView.length && <tr><td colSpan={6} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, attendanceView.length)}
        </div>
      );
    }

    if (activeTab === 'cash-vs-credit-sales-report') {
      const placeholder = renderTabPlaceholder('cash-vs-credit-sales-report');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'cash-vs-credit-sales-report';
      const paged = paginateRows(tab, cashVsCreditView);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Cash vs Credit Sales Report</h2>
          {renderReportControls(tab, 'Filter by type, invoice count or amount...', [
            { value: 'all', label: 'All types' },
            { value: 'cash', label: 'Cash only' },
            { value: 'credit', label: 'Credit only' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Type', 'type')}
                {renderSortHeader(tab, 'Invoices', 'invoices')}
                {renderSortHeader(tab, 'Amount', 'amount')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row, index) => (
                <tr key={`${row.type}-${index}`}>
                  <td className="px-2 py-2 text-sm text-white">{row.type}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.invoices}</td>
                  <td className={`px-2 py-2 text-sm ${row.type === 'Cash' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {formatCurrency(Number(row.amount || 0))}
                  </td>
                </tr>
              ))}
              {!cashVsCreditView.length && <tr><td colSpan={3} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, cashVsCreditView.length)}
        </div>
      );
    }

    if (activeTab !== 'user-wise-sales-report') {
      return null;
    }

    const placeholder = renderTabPlaceholder('user-wise-sales-report');
    if (placeholder) return placeholder;
    const tab: ReportTabKey = 'user-wise-sales-report';
    const paged = paginateRows(tab, userSalesView);

    return (
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-2 text-lg font-semibold text-white">User-wise Sales Report</h2>
        {renderReportControls(tab, 'Filter by user, invoices, payment totals...', [
          { value: 'all', label: 'All users' },
          { value: 'with-cash', label: 'With cash sales' },
          { value: 'with-upi', label: 'With UPI sales' },
          { value: 'with-card', label: 'With card sales' },
        ])}
        <table className="min-w-full divide-y divide-white/10">
          <thead>
            <tr>
              {renderSortHeader(tab, 'User', 'user')}
              {renderSortHeader(tab, 'Invoices', 'invoices')}
              {renderSortHeader(tab, 'Total', 'totalAmount')}
              {renderSortHeader(tab, 'Cash', 'cash')}
              {renderSortHeader(tab, 'UPI', 'upi')}
              {renderSortHeader(tab, 'Card', 'card')}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {paged.rows.map((row, idx) => (
              <tr key={idx}>
                <td className="px-2 py-2 text-sm text-white">{row._id || 'Unknown'}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.invoices}</td>
                <td className="px-2 py-2 text-sm text-emerald-300">{formatCurrency(Number(row.totalAmount || 0))}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.cash || 0))}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.upi || 0))}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.card || 0))}</td>
              </tr>
            ))}
            {!userSalesView.length && <tr><td colSpan={6} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
          </tbody>
        </table>
        {renderPagination(tab, userSalesView.length)}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Advanced Reports</h1>
          <p className="text-sm text-gray-300">Date-wise reports for sales, returns, profit, receivables, attendance and user performance.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          </div>
          <button onClick={loadReports} className="cursor-pointer rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Refresh</button>
          <button
            onClick={exportActiveToExcel}
            disabled={!hasExportData}
            className="cursor-pointer rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Excel
          </button>
          <button
            onClick={exportActiveToPdf}
            disabled={!hasExportData}
            className="cursor-pointer rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading reports...</p>}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-2 text-lg font-semibold text-white">Reports Menu</h2>
        <CardTabs
          compact
          frame={false}
          ariaLabel="Report tabs"
          items={reportMenu}
          activeKey={activeTab}
          onChange={setActiveTab}
          listClassName="flex flex-wrap gap-2 border-b-0 px-0 pt-0"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Gross Profit Report</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{formatCurrency(Number(grossProfit?.grossProfit || 0))}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Revenue</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatCurrency(Number(grossProfit?.revenue || 0))}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Outstanding Receivables Report</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{formatCurrency(Number(receivables?.totalOutstanding || 0))}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Sales Return Report</p>
          <p className="mt-1 text-xl font-semibold text-red-300">{formatCurrency(Number(returnsReport?.summary?.refundAmount || 0))}</p>
        </div>
      </div>

      {renderActiveTab()}
    </div>
  );
};
