import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { CardTabs } from '../components/CardTabs';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { getGeneralSettings, resolveGeneralSettingsAssetUrl } from '../utils/generalSettings';

type ReportTabKey =
  | 'profit-loss-store-report'
  | 'balance-sheet-store-report'
  | 'sales-summary-shift-report'
  | 'daily-sales-summary'
  | 'item-wise-sales'
  | 'customer-wise-sales'
  | 'sales-return-report'
  | 'gross-profit-report'
  | 'hsn-wise-sales-report'
  | 'taxability-breakup-report'
  | 'b2b-vs-b2c-report'
  | 'gst-note-register-report'
  | 'sales-register-detailed-report'
  | 'payment-reconciliation-report'
  | 'z-report'
  | 'pos-inventory-movement-report'
  | 'membership-sales-report'
  | 'gst-handoff-report'
  | 'outstanding-receivables-report'
  | 'attendance-report'
  | 'cash-vs-credit-sales-report'
  | 'user-wise-sales-report'
  | 'tax-summary-report';

const REPORT_TAB_KEYS: ReportTabKey[] = [
  'profit-loss-store-report',
  'balance-sheet-store-report',
  'sales-summary-shift-report',
  'daily-sales-summary',
  'item-wise-sales',
  'customer-wise-sales',
  'sales-return-report',
  'gross-profit-report',
  'hsn-wise-sales-report',
  'taxability-breakup-report',
  'b2b-vs-b2c-report',
  'gst-note-register-report',
  'sales-register-detailed-report',
  'payment-reconciliation-report',
  'z-report',
  'pos-inventory-movement-report',
  'membership-sales-report',
  'gst-handoff-report',
  'outstanding-receivables-report',
  'attendance-report',
  'cash-vs-credit-sales-report',
  'user-wise-sales-report',
  'tax-summary-report',
];

const REPORT_TAB_LABEL: Record<ReportTabKey, string> = {
  'profit-loss-store-report': 'Profit & Loss (Store-level)',
  'balance-sheet-store-report': 'Balance Sheet (Store-level)',
  'sales-summary-shift-report': 'Sales Summary (Daily / Shift)',
  'daily-sales-summary': 'Daily Sales Summary',
  'item-wise-sales': 'Item-wise Sales Report',
  'customer-wise-sales': 'Customer-wise Sales Report',
  'sales-return-report': 'Sales Return Report',
  'gross-profit-report': 'Gross Profit Report',
  'hsn-wise-sales-report': 'HSN-wise Sales Report',
  'taxability-breakup-report': 'Taxable / Exempt / Nil / Non-GST',
  'b2b-vs-b2c-report': 'B2B vs B2C Invoice Report',
  'gst-note-register-report': 'Credit / Debit Note Register (GST)',
  'sales-register-detailed-report': 'Sales Register (Detailed)',
  'payment-reconciliation-report': 'Payment Reconciliation Report',
  'z-report': 'Z-Report (End of Day)',
  'pos-inventory-movement-report': 'Inventory Movement (POS only)',
  'membership-sales-report': 'Membership Sales Report',
  'gst-handoff-report': 'GST Handoff Datasets',
  'outstanding-receivables-report': 'Outstanding Receivables Report',
  'attendance-report': 'Attendance Report',
  'cash-vs-credit-sales-report': 'Cash vs Credit Sales Report',
  'user-wise-sales-report': 'User-wise Sales Report',
  'tax-summary-report': 'Tax Summary Report',
};

const KEY_METRIC_TABS: ReportTabKey[] = [
  'gross-profit-report',
  'outstanding-receivables-report',
  'sales-return-report',
  'tax-summary-report',
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

interface RichReportSection {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface RichReportDefinition {
  title: string;
  summary?: Array<[string, string | number]>;
  notes?: string[];
  sections: RichReportSection[];
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

const resolveAssetImageToDataUrl = async (value: string): Promise<string> => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;

  const resolvedUrl = resolveGeneralSettingsAssetUrl(raw);
  if (!resolvedUrl) return '';

  const response = await fetch(resolvedUrl);
  if (!response.ok) return '';
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read report logo'));
    reader.readAsDataURL(blob);
  }).catch(() => '');
};

export const Reports: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [profitLossStore, setProfitLossStore] = useState<any>(null);
  const [balanceSheetStore, setBalanceSheetStore] = useState<any>(null);
  const [salesSummaryShift, setSalesSummaryShift] = useState<any>(null);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [itemSales, setItemSales] = useState<any[]>([]);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [returnsReport, setReturnsReport] = useState<{ summary: any; rows: any[] } | null>(null);
  const [grossProfit, setGrossProfit] = useState<any>(null);
  const [hsnWiseSales, setHsnWiseSales] = useState<any>(null);
  const [taxabilityBreakup, setTaxabilityBreakup] = useState<any>(null);
  const [b2bVsB2c, setB2bVsB2c] = useState<any>(null);
  const [gstNoteRegister, setGstNoteRegister] = useState<any>(null);
  const [salesRegisterDetailed, setSalesRegisterDetailed] = useState<any>(null);
  const [paymentReconciliation, setPaymentReconciliation] = useState<any>(null);
  const [zReport, setZReport] = useState<any>(null);
  const [posInventoryMovement, setPosInventoryMovement] = useState<any>(null);
  const [membershipSales, setMembershipSales] = useState<any>(null);
  const [gstHandoff, setGstHandoff] = useState<any>(null);
  const [receivables, setReceivables] = useState<{ totalOutstanding: number; rows: any[] } | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [cashVsCredit, setCashVsCredit] = useState<{ cash: any; credit: any } | null>(null);
  const [userSales, setUserSales] = useState<any[]>([]);
  const [taxSummary, setTaxSummary] = useState<{ salesTax: any[]; returnTax: any[] } | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTabKey>('profit-loss-store-report');
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
    { key: 'profit-loss-store-report', label: 'Profit & Loss (Store-level)' },
    { key: 'balance-sheet-store-report', label: 'Balance Sheet (Store-level)' },
    { key: 'sales-summary-shift-report', label: 'Sales Summary (Daily / Shift)' },
    { key: 'daily-sales-summary', label: 'Daily Sales Summary' },
    { key: 'item-wise-sales', label: 'Item-wise Sales Report' },
    { key: 'customer-wise-sales', label: 'Customer-wise Sales Report' },
    { key: 'sales-return-report', label: 'Sales Return Report' },
    { key: 'gross-profit-report', label: 'Gross Profit Report' },
    { key: 'hsn-wise-sales-report', label: 'HSN-wise Sales Report' },
    { key: 'taxability-breakup-report', label: 'Taxable / Exempt / Nil / Non-GST' },
    { key: 'b2b-vs-b2c-report', label: 'B2B vs B2C Invoice Report' },
    { key: 'gst-note-register-report', label: 'Credit / Debit Note Register (GST)' },
    { key: 'sales-register-detailed-report', label: 'Sales Register (Detailed)' },
    { key: 'payment-reconciliation-report', label: 'Payment Reconciliation Report' },
    { key: 'z-report', label: 'Z-Report (End of Day)' },
    { key: 'pos-inventory-movement-report', label: 'Inventory Movement (POS only)' },
    { key: 'membership-sales-report', label: 'Membership Sales Report' },
    { key: 'gst-handoff-report', label: 'GST Handoff Datasets' },
    { key: 'outstanding-receivables-report', label: 'Outstanding Receivables Report' },
    { key: 'attendance-report', label: 'Attendance Report' },
    { key: 'cash-vs-credit-sales-report', label: 'Cash vs Credit Sales Report' },
    { key: 'user-wise-sales-report', label: 'User-wise Sales Report' },
    { key: 'tax-summary-report', label: 'Tax Summary Report' },
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
        const hay = `${row?.productName || ''} ${row?.category || ''} ${row?.subcategory || ''} ${row?.variantSize || ''} ${row?.variantColor || ''} ${row?.quantity || 0} ${row?.taxableValue || 0} ${row?.tax || 0} ${row?.amount || 0}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'high-qty' && Number(row?.quantity || 0) < 5) return false;
      if (filter === 'low-qty' && Number(row?.quantity || 0) >= 5) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        item: [String(a?.productName || ''), String(b?.productName || '')],
        category: [String(a?.category || ''), String(b?.category || '')],
        variant: [
          `${String(a?.variantSize || '')} ${String(a?.variantColor || '')}`.trim(),
          `${String(b?.variantSize || '')} ${String(b?.variantColor || '')}`.trim(),
        ],
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

  const taxSummaryRows = useMemo(
    () => [
      ...(taxSummary?.salesTax || []).map((row: any, index: number) => ({
        id: `sales-${row._id ?? index}`,
        source: 'Sales',
        gstRate: Number(row.gstRate ?? row._id ?? 0),
        taxableValue: Number(row.taxableValue || 0),
        taxAmount: Number(row.taxAmount || 0),
        cgstAmount: Number(row.cgstAmount || 0),
        sgstAmount: Number(row.sgstAmount || 0),
        igstAmount: Number(row.igstAmount || 0),
        cessAmount: Number(row.cessAmount || 0),
      })),
      ...(taxSummary?.returnTax || []).map((row: any, index: number) => ({
        id: `returns-${row._id ?? index}`,
        source: 'Returns',
        gstRate: Number(row.gstRate ?? row._id ?? 0),
        taxableValue: Number(row.taxableValue || 0),
        taxAmount: Number(row.taxAmount || 0),
        cgstAmount: Number(row.cgstAmount || 0),
        sgstAmount: Number(row.sgstAmount || 0),
        igstAmount: Number(row.igstAmount || 0),
        cessAmount: Number(row.cessAmount || 0),
      })),
    ],
    [taxSummary]
  );

  const taxSummaryView = useMemo(() => {
    const tab: ReportTabKey = 'tax-summary-report';
    const q = normalizeText(reportSearchByTab[tab]);
    const filter = reportFilterByTab[tab];
    const sortField = reportSortFieldByTab[tab];
    const direction = reportSortDirectionByTab[tab];
    const rows = taxSummaryRows.filter((row) => {
      if (q) {
        const hay = `${row.source} ${row.gstRate} ${row.taxableValue} ${row.taxAmount} ${row.cgstAmount} ${row.sgstAmount} ${row.igstAmount} ${row.cessAmount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter !== 'all' && normalizeText(row.source) !== filter) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const keyMap: Record<string, [unknown, unknown]> = {
        source: [a.source, b.source],
        gstRate: [a.gstRate, b.gstRate],
        taxableValue: [a.taxableValue, b.taxableValue],
        taxAmount: [a.taxAmount, b.taxAmount],
        cgstAmount: [a.cgstAmount, b.cgstAmount],
        sgstAmount: [a.sgstAmount, b.sgstAmount],
        igstAmount: [a.igstAmount, b.igstAmount],
        cessAmount: [a.cessAmount, b.cessAmount],
      };
      const pair = keyMap[sortField];
      if (!pair) return 0;
      return compareSortValues(pair[0], pair[1], direction);
    });
  }, [reportFilterByTab, reportSearchByTab, reportSortDirectionByTab, reportSortFieldByTab, taxSummaryRows]);

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

  const buildRichExportDataset = (report: RichReportDefinition): ExportDataset => {
    if (report.sections.length === 1) {
      return {
        title: report.title,
        columns: report.sections[0].columns,
        rows: report.sections[0].rows,
        summary: report.summary,
      };
    }

    const maxColumns = Math.max(...report.sections.map((section) => section.columns.length));
    const columns = ['Section', ...Array.from({ length: maxColumns }, (_, index) => `Value ${index + 1}`)];
    const rows: Array<Array<string | number>> = [];

    report.sections.forEach((section) => {
      if (!section.rows.length) return;
      section.rows.forEach((row, index) => {
        const padded = [...row, ...Array(Math.max(0, maxColumns - row.length)).fill('')];
        rows.push([index === 0 ? section.title : '', ...padded]);
      });
      rows.push(['', ...Array(maxColumns).fill('')]);
    });

    if (rows.length && rows[rows.length - 1].every((cell) => cell === '')) {
      rows.pop();
    }

    return {
      title: report.title,
      columns,
      rows,
      summary: report.summary,
    };
  };

  const renderRichReportTab = (tab: ReportTabKey, report: RichReportDefinition) => {
    const placeholder = renderTabPlaceholder(tab);
    if (placeholder) return placeholder;

    const q = normalizeText(reportSearchByTab[tab]);
    const renderRows = (section: RichReportSection) => {
      const filtered = q
        ? section.rows.filter((row) => row.some((cell) => String(cell || '').toLowerCase().includes(q)))
        : section.rows;
      if (report.sections.length === 1) {
        return paginateRows(tab, filtered);
      }
      return { rows: filtered, currentPage: 1, totalPages: 1, pageSize: filtered.length, totalRows: filtered.length };
    };

    return (
      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{report.title}</h2>
          {report.sections.length === 1 && renderReportControls(tab, `Filter ${report.title.toLowerCase()}...`)}
        </div>

        {report.summary?.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {report.summary.map(([label, value]) => (
              <div key={`${report.title}-${label}`} className="rounded-lg border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {report.notes?.length ? (
          <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-100">
            {report.notes.map((note, index) => (
              <p key={`${report.title}-note-${index}`}>{note}</p>
            ))}
          </div>
        ) : null}

        {report.sections.map((section) => {
          const paged = renderRows(section);
          return (
            <div key={`${report.title}-${section.title}`} className="overflow-x-auto rounded-lg border border-white/10 bg-black/10 p-3">
              <h3 className="mb-3 text-sm font-semibold text-white">{section.title}</h3>
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr>
                    {section.columns.map((column) => (
                      <th key={`${section.title}-${column}`} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {paged.rows.map((row, rowIndex) => (
                    <tr key={`${section.title}-${rowIndex}`}>
                      {section.columns.map((_, cellIndex) => (
                        <td key={`${section.title}-${rowIndex}-${cellIndex}`} className="px-2 py-2 text-sm text-gray-200">
                          {row[cellIndex] ?? '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!paged.rows.length && (
                    <tr>
                      <td colSpan={section.columns.length} className="px-2 py-3 text-center text-sm text-gray-400">
                        No data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {report.sections.length === 1 ? renderPagination(tab, paged.totalRows) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const richReportDefinitions = useMemo<Partial<Record<ReportTabKey, RichReportDefinition>>>(() => {
    const formatDateCell = (value: unknown) => (value ? String(value).slice(0, 10) : '-');

    return {
      'profit-loss-store-report': {
        title: 'Profit & Loss (Store-level)',
        summary: [
          ['Net Sales', formatCurrency(Number(profitLossStore?.posSummary?.netSales || 0))],
          ['COGS', formatCurrency(Number(profitLossStore?.posSummary?.cogs || 0))],
          ['Gross Profit', formatCurrency(Number(profitLossStore?.posSummary?.grossProfit || 0))],
          ['Margin %', `${Number(profitLossStore?.posSummary?.marginPercent || 0).toFixed(2)}%`],
        ],
        sections: [
          {
            title: 'Accounting Statement',
            columns: ['Section', 'Particulars', 'Amount'],
            rows: (profitLossStore?.statement?.rows || []).map((row: any) => [
              String(row.section || ''),
              String(row.particulars || ''),
              formatCurrency(Number(row.amount || 0)),
            ]),
          },
          {
            title: 'Register / Cashier Performance',
            columns: ['Register', 'Shift', 'Invoices', 'Net Sales', 'Tax', 'COGS', 'Gross Profit'],
            rows: (profitLossStore?.registerRows || []).map((row: any) => [
              String(row.register || ''),
              String(row.shiftName || ''),
              Number(row.invoices || 0),
              formatCurrency(Number(row.netSales || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.cogsAmount || 0)),
              formatCurrency(Number(row.grossProfit || 0)),
            ]),
          },
        ],
      },
      'balance-sheet-store-report': {
        title: 'Balance Sheet (Store-level)',
        summary: [
          ['Total Assets', formatCurrency(Number(balanceSheetStore?.report?.totals?.totalAssets || 0))],
          ['Total Liabilities', formatCurrency(Number(balanceSheetStore?.report?.totals?.totalLiabilities || 0))],
          ['Total Equity', formatCurrency(Number(balanceSheetStore?.report?.totals?.totalEquity || 0))],
          ['Inventory Value', formatCurrency(Number(balanceSheetStore?.operationalSummary?.inventoryValue || 0))],
        ],
        sections: [
          {
            title: 'Balance Sheet Rows',
            columns: ['Section', 'Account', 'Amount'],
            rows: [
              ...(balanceSheetStore?.report?.assets || []).map((row: any) => ['Asset', String(row.accountName || ''), formatCurrency(Number(row.amount || 0))]),
              ...(balanceSheetStore?.report?.liabilities || []).map((row: any) => ['Liability', String(row.accountName || ''), formatCurrency(Number(row.amount || 0))]),
              ...(balanceSheetStore?.report?.equityRows || []).map((row: any) => ['Equity', String(row.accountName || ''), formatCurrency(Number(row.amount || 0))]),
            ],
          },
          {
            title: 'Cash Drawer Balances',
            columns: ['Drawer', 'Calculated', 'Physical', 'Variance', 'Count Date'],
            rows: (balanceSheetStore?.cashDrawerRows || []).map((row: any) => [
              String(row.drawerName || ''),
              formatCurrency(Number(row.calculatedBalance || 0)),
              formatCurrency(Number(row.physicalAmount || 0)),
              formatCurrency(Number(row.varianceAmount || 0)),
              formatDateCell(row.countDate),
            ]),
          },
          {
            title: 'Undeposited Receipts',
            columns: ['Source', 'Reference', 'Customer', 'Method', 'Expected Settlement', 'Amount'],
            rows: (balanceSheetStore?.undepositedRows || []).map((row: any) => [
              String(row.source || ''),
              String(row.referenceNo || ''),
              String(row.customerName || ''),
              String(row.paymentMethod || ''),
              formatDateCell(row.expectedSettlementDate),
              formatCurrency(Number(row.amount || 0)),
            ]),
          },
          {
            title: 'Membership Receivables',
            columns: ['Member Code', 'Member', 'Amount Due', 'Amount Paid', 'End Date'],
            rows: (balanceSheetStore?.membershipReceivableRows || []).map((row: any) => [
              String(row.memberCode || ''),
              String(row.memberName || ''),
              formatCurrency(Number(row.amountDue || 0)),
              formatCurrency(Number(row.amountPaid || 0)),
              formatDateCell(row.endDate),
            ]),
          },
        ],
      },
      'sales-summary-shift-report': {
        title: 'Sales Summary (Daily / Shift)',
        summary: [
          ['Gross Sales', formatCurrency(Number(salesSummaryShift?.summary?.grossSales || 0))],
          ['Returns', formatCurrency(Number(salesSummaryShift?.summary?.returns || 0))],
          ['Discounts', formatCurrency(Number(salesSummaryShift?.summary?.discounts || 0))],
          ['Net Sales', formatCurrency(Number(salesSummaryShift?.summary?.netSales || 0))],
        ],
        sections: [
          {
            title: 'Shift Summary',
            columns: ['Date', 'Shift', 'Invoices', 'Gross Sales', 'Returns', 'Discounts', 'Taxes', 'Net Sales', 'Cash', 'Card', 'UPI', 'Other'],
            rows: (salesSummaryShift?.rows || []).map((row: any) => [
              String(row.dateKey || ''),
              String(row.shiftName || ''),
              Number(row.invoices || 0),
              formatCurrency(Number(row.grossSales || 0)),
              formatCurrency(Number(row.returns || 0)),
              formatCurrency(Number(row.discounts || 0)),
              formatCurrency(Number(row.taxes || 0)),
              formatCurrency(Number(row.netSalesAfterReturns || 0)),
              formatCurrency(Number(row.cash || 0)),
              formatCurrency(Number(row.card || 0)),
              formatCurrency(Number(row.upi || 0)),
              formatCurrency(Number(row.other || 0)),
            ]),
          },
        ],
      },
      'hsn-wise-sales-report': {
        title: 'HSN-wise Sales Report',
        summary: [
          ['HSN Rows', Number(hsnWiseSales?.summary?.hsnCodes || 0)],
          ['Taxable Value', formatCurrency(Number(hsnWiseSales?.summary?.taxableValue || 0))],
          ['Tax Amount', formatCurrency(Number(hsnWiseSales?.summary?.taxAmount || 0))],
        ],
        sections: [
          {
            title: 'HSN Summary',
            columns: ['HSN', 'Quantity', 'Taxable Value', 'Tax Amount', 'CGST', 'SGST', 'IGST', 'Cess', 'Total'],
            rows: (hsnWiseSales?.rows || []).map((row: any) => [
              String(row.hsnCode || ''),
              Number(row.quantity || 0),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.cgstAmount || 0)),
              formatCurrency(Number(row.sgstAmount || 0)),
              formatCurrency(Number(row.igstAmount || 0)),
              formatCurrency(Number(row.cessAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
            ]),
          },
        ],
      },
      'taxability-breakup-report': {
        title: 'Taxable / Exempt / Nil / Non-GST',
        notes: taxabilityBreakup?.notes || [],
        sections: [
          {
            title: 'Taxability Breakup',
            columns: ['Category', 'Taxable Value', 'Tax Amount'],
            rows: (taxabilityBreakup?.rows || []).map((row: any) => [
              String(row.category || ''),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
            ]),
          },
        ],
      },
      'b2b-vs-b2c-report': {
        title: 'B2B vs B2C Invoice Report',
        summary: [
          ['B2B', Number(b2bVsB2c?.summary?.b2bInvoices || 0)],
          ['B2CL', Number(b2bVsB2c?.summary?.b2clInvoices || 0)],
          ['B2CS', Number(b2bVsB2c?.summary?.b2csInvoices || 0)],
          ['Taxable Value', formatCurrency(Number(b2bVsB2c?.summary?.taxableValue || 0))],
        ],
        sections: [
          {
            title: 'Invoice Classification',
            columns: ['Invoice', 'Date', 'Customer', 'GSTIN', 'Class', 'Place Of Supply', 'Payment', 'Taxable', 'Tax', 'Total', 'Shift'],
            rows: (b2bVsB2c?.rows || []).map((row: any) => [
              String(row.invoiceNumber || ''),
              formatDateCell(row.invoiceDate),
              String(row.customerName || ''),
              String(row.customerGstin || ''),
              String(row.classification || ''),
              String(row.placeOfSupply || ''),
              String(row.paymentMethod || ''),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
              String(row.shiftName || ''),
            ]),
          },
        ],
      },
      'gst-note-register-report': {
        title: 'Credit / Debit Note Register (GST)',
        summary: [
          ['Notes', Number(gstNoteRegister?.summary?.notes || 0)],
          ['Taxable Value', formatCurrency(Number(gstNoteRegister?.summary?.taxableValue || 0))],
          ['Tax Amount', formatCurrency(Number(gstNoteRegister?.summary?.taxAmount || 0))],
          ['Total', formatCurrency(Number(gstNoteRegister?.summary?.totalAmount || 0))],
        ],
        sections: [
          {
            title: 'GST Note Register',
            columns: ['Note No', 'Date', 'Category', 'Reference Invoice', 'Customer', 'GSTIN', 'Taxable', 'Tax', 'Total', 'Status'],
            rows: (gstNoteRegister?.rows || []).map((row: any) => [
              String(row.noteNumber || ''),
              formatDateCell(row.noteDate),
              String(row.category || ''),
              String(row.referenceInvoiceNumber || ''),
              String(row.customerName || ''),
              String(row.customerGstin || ''),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
              String(row.status || ''),
            ]),
          },
        ],
      },
      'sales-register-detailed-report': {
        title: 'Sales Register (Detailed)',
        summary: [
          ['Rows', Number(salesRegisterDetailed?.summary?.rows || 0)],
          ['Invoices', Number(salesRegisterDetailed?.summary?.invoices || 0)],
          ['Taxable Value', formatCurrency(Number(salesRegisterDetailed?.summary?.taxableValue || 0))],
          ['Total Amount', formatCurrency(Number(salesRegisterDetailed?.summary?.totalAmount || 0))],
        ],
        sections: [
          {
            title: 'Detailed Register',
            columns: ['Date', 'Invoice', 'Customer', 'GSTIN', 'Item', 'SKU', 'HSN', 'Qty', 'Rate', 'Taxable', 'Discount', 'Tax', 'Total', 'Payment', 'Shift'],
            rows: (salesRegisterDetailed?.rows || []).map((row: any) => [
              formatDateCell(row.invoiceDate),
              String(row.invoiceNumber || ''),
              String(row.customerName || ''),
              String(row.customerGstin || ''),
              String(row.itemName || ''),
              String(row.sku || ''),
              String(row.hsnCode || ''),
              Number(row.quantity || 0),
              formatCurrency(Number(row.unitPrice || 0)),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.discountAmount || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
              String(row.paymentMethod || ''),
              String(row.shiftName || ''),
            ]),
          },
        ],
      },
      'payment-reconciliation-report': {
        title: 'Payment Reconciliation Report',
        summary: [
          ['Methods', Number(paymentReconciliation?.summary?.methods || 0)],
          ['Total Amount', formatCurrency(Number(paymentReconciliation?.summary?.totalAmount || 0))],
          ['Outstanding', formatCurrency(Number(paymentReconciliation?.summary?.outstandingAmount || 0))],
        ],
        sections: [
          {
            title: 'Payment Reconciliation',
            columns: ['Method', 'Channel', 'Invoices', 'Taxable', 'Tax', 'Total', 'Outstanding', 'Pending Settlement'],
            rows: (paymentReconciliation?.rows || []).map((row: any) => [
              String(row.paymentMethod || ''),
              String(row.channel || ''),
              Number(row.invoices || 0),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
              formatCurrency(Number(row.outstandingAmount || 0)),
              formatCurrency(Number(row.pendingSettlement || 0)),
            ]),
          },
        ],
      },
      'z-report': {
        title: 'Z-Report (End of Day)',
        summary: [
          ['Days', Number(zReport?.summary?.days || 0)],
          ['Gross Sales', formatCurrency(Number(zReport?.summary?.grossSales || 0))],
          ['Returns', formatCurrency(Number(zReport?.summary?.returns || 0))],
          ['Net Sales', formatCurrency(Number(zReport?.summary?.netSales || 0))],
        ],
        sections: [
          {
            title: 'Daily Closing',
            columns: ['Date', 'Invoices', 'Gross Sales', 'Returns', 'Net Sales', 'Tax', 'Discounts', 'Cash Sales', 'Digital Sales', 'System Closing Cash', 'Physical Closing Cash', 'Variance'],
            rows: (zReport?.rows || []).map((row: any) => [
              String(row.dateKey || ''),
              Number(row.invoices || 0),
              formatCurrency(Number(row.grossSales || 0)),
              formatCurrency(Number(row.returns || 0)),
              formatCurrency(Number(row.netSales || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.discounts || 0)),
              formatCurrency(Number(row.cashSales || 0)),
              formatCurrency(Number(row.digitalSales || 0)),
              formatCurrency(Number(row.systemClosingCash || 0)),
              formatCurrency(Number(row.physicalClosingCash || 0)),
              formatCurrency(Number(row.variance || 0)),
            ]),
          },
        ],
      },
      'pos-inventory-movement-report': {
        title: 'Inventory Movement (POS only)',
        summary: [
          ['Sold Items', Number(posInventoryMovement?.summary?.soldItems || 0)],
          ['Quantity Sold', Number(posInventoryMovement?.summary?.quantitySold || 0)],
          ['COGS', formatCurrency(Number(posInventoryMovement?.summary?.cogsAmount || 0))],
          ['Stock Alerts', Number(posInventoryMovement?.summary?.stockAlerts || 0)],
        ],
        sections: [
          {
            title: 'Sold Items',
            columns: ['Item', 'SKU', 'Qty Sold', 'Taxable Value', 'COGS', 'Gross Profit'],
            rows: (posInventoryMovement?.soldRows || []).map((row: any) => [
              String(row.productName || ''),
              String(row.sku || ''),
              Number(row.quantitySold || 0),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.cogsAmount || 0)),
              formatCurrency(Number(row.grossProfit || 0)),
            ]),
          },
          {
            title: 'Stock Alerts',
            columns: ['Item', 'SKU', 'Stock', 'Min Stock', 'Alert'],
            rows: (posInventoryMovement?.stockAlerts || []).map((row: any) => [
              String(row.productName || ''),
              String(row.sku || ''),
              Number(row.stock || 0),
              Number(row.minStock || 0),
              String(row.alert || ''),
            ]),
          },
        ],
      },
      'membership-sales-report': {
        title: 'Membership Sales Report',
        summary: [
          ['Events', Number(membershipSales?.summary?.events || 0)],
          ['Amount Paid', formatCurrency(Number(membershipSales?.summary?.amountPaid || 0))],
          ['Recognised Revenue', formatCurrency(Number(membershipSales?.summary?.recognizedRevenue || 0))],
          ['Deferred Revenue', formatCurrency(Number(membershipSales?.summary?.deferredRevenue || 0))],
        ],
        sections: [
          {
            title: 'Membership Sales',
            columns: ['Event', 'Date', 'Member Code', 'Member', 'Plan', 'Amount Paid', 'Amount Due', 'Recognised', 'Deferred'],
            rows: (membershipSales?.rows || []).map((row: any) => [
              String(row.eventType || ''),
              formatDateCell(row.eventDate),
              String(row.memberCode || ''),
              String(row.memberName || ''),
              String(row.planName || ''),
              formatCurrency(Number(row.amountPaid || 0)),
              formatCurrency(Number(row.amountDue || 0)),
              formatCurrency(Number(row.recognizedRevenue || 0)),
              formatCurrency(Number(row.deferredRevenue || 0)),
            ]),
          },
        ],
      },
      'gst-handoff-report': {
        title: 'GST Handoff Datasets',
        notes: ['This tab prepares POS verification and sync datasets only. GSTR JSON generation remains in the main GST Workspace.'],
        summary: [
          ['B2B Invoices', Number(gstHandoff?.summary?.b2bInvoices || 0)],
          ['B2C Invoices', Number(gstHandoff?.summary?.b2cInvoices || 0)],
          ['HSN Rows', Number(gstHandoff?.summary?.hsnRows || 0)],
          ['Tax Liability', formatCurrency(Number(gstHandoff?.summary?.taxLiability || 0))],
        ],
        sections: [
          {
            title: 'Monthly Tax Liability',
            columns: ['Month', 'Taxable Value', 'Tax Amount', 'CGST', 'SGST', 'IGST', 'Cess'],
            rows: (gstHandoff?.monthlyTaxLiability || []).map((row: any) => [
              String(row.monthKey || ''),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.cgstAmount || 0)),
              formatCurrency(Number(row.sgstAmount || 0)),
              formatCurrency(Number(row.igstAmount || 0)),
              formatCurrency(Number(row.cessAmount || 0)),
            ]),
          },
          {
            title: 'Advance Receipts',
            columns: ['Voucher', 'Date', 'Customer', 'Mode', 'Amount', 'Unapplied'],
            rows: (gstHandoff?.advanceReceipts || []).map((row: any) => [
              String(row.voucherNumber || ''),
              formatDateCell(row.entryDate),
              String(row.customerName || ''),
              String(row.mode || ''),
              formatCurrency(Number(row.amount || 0)),
              formatCurrency(Number(row.unappliedAmount || 0)),
            ]),
          },
          {
            title: 'B2B Invoices',
            columns: ['Invoice', 'Date', 'Customer', 'GSTIN', 'Taxable', 'Tax', 'Total'],
            rows: (gstHandoff?.b2bInvoices || []).map((row: any) => [
              String(row.invoiceNumber || ''),
              formatDateCell(row.invoiceDate),
              String(row.customerName || ''),
              String(row.customerGstin || ''),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
            ]),
          },
          {
            title: 'B2C Invoices',
            columns: ['Invoice', 'Date', 'Customer', 'Class', 'Taxable', 'Tax', 'Total'],
            rows: (gstHandoff?.b2cInvoices || []).map((row: any) => [
              String(row.invoiceNumber || ''),
              formatDateCell(row.invoiceDate),
              String(row.customerName || ''),
              String(String(row.classification || '').toUpperCase()),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
            ]),
          },
          {
            title: 'HSN Summary',
            columns: ['HSN', 'Quantity', 'Taxable', 'Tax', 'CGST', 'SGST', 'IGST'],
            rows: (gstHandoff?.hsnSummary || []).map((row: any) => [
              String(row.hsnCode || ''),
              Number(row.quantity || 0),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.cgstAmount || 0)),
              formatCurrency(Number(row.sgstAmount || 0)),
              formatCurrency(Number(row.igstAmount || 0)),
            ]),
          },
          {
            title: 'GST Notes',
            columns: ['Note No', 'Date', 'Category', 'Invoice', 'Customer', 'Taxable', 'Tax', 'Total'],
            rows: (gstHandoff?.notes || []).map((row: any) => [
              String(row.noteNumber || ''),
              formatDateCell(row.noteDate),
              String(row.category || ''),
              String(row.referenceInvoiceNumber || ''),
              String(row.customerName || ''),
              formatCurrency(Number(row.taxableValue || 0)),
              formatCurrency(Number(row.taxAmount || 0)),
              formatCurrency(Number(row.totalAmount || 0)),
            ]),
          },
        ],
      },
    };
  }, [
    b2bVsB2c,
    balanceSheetStore,
    gstHandoff,
    gstNoteRegister,
    hsnWiseSales,
    membershipSales,
    paymentReconciliation,
    posInventoryMovement,
    profitLossStore,
    salesRegisterDetailed,
    salesSummaryShift,
    taxabilityBreakup,
    zReport,
  ]);

  const activeReportExport = useMemo<ExportDataset>(() => {
    const richReport = richReportDefinitions[activeTab];
    if (richReport) {
      return buildRichExportDataset(richReport);
    }

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
        columns: ['Item', 'Category', 'Variant', 'Qty', 'Taxable', 'Tax', 'Total'],
        rows: itemSalesView.map((row) => [
          String(row.productName || ''),
          [String(row.category || ''), String(row.subcategory || '')].filter(Boolean).join(' / '),
          [String(row.variantSize || ''), String(row.variantColor || '')].filter(Boolean).join(' / ') || '-',
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

    if (activeTab === 'tax-summary-report') {
      const totalSalesTax = taxSummaryRows
        .filter((row) => row.source === 'Sales')
        .reduce((sum, row) => sum + toNumber(row.taxAmount), 0);
      const totalReturnTax = taxSummaryRows
        .filter((row) => row.source === 'Returns')
        .reduce((sum, row) => sum + toNumber(row.taxAmount), 0);
      return {
        title: 'Tax Summary Report',
        columns: ['Source', 'GST Rate %', 'Taxable Value', 'Tax Amount', 'CGST', 'SGST', 'IGST', 'Cess'],
        summary: [
          ['Sales Tax', toFixed2(totalSalesTax)],
          ['Return Tax Reversal', toFixed2(totalReturnTax)],
          ['Net Tax', toFixed2(totalSalesTax - totalReturnTax)],
        ],
        rows: taxSummaryView.map((row) => [
          row.source,
          toFixed2(row.gstRate),
          toFixed2(row.taxableValue),
          toFixed2(row.taxAmount),
          toFixed2(row.cgstAmount),
          toFixed2(row.sgstAmount),
          toFixed2(row.igstAmount),
          toFixed2(row.cessAmount),
        ]),
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
    taxSummaryRows,
    taxSummaryView,
    richReportDefinitions,
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

  const exportActiveToPdf = async () => {
    const currentSettings = getGeneralSettings();
    const reportLogoValue =
      currentSettings.business.reportLogoDataUrl || currentSettings.business.invoiceLogoDataUrl || '';
    const reportLogoDataUrl = await resolveAssetImageToDataUrl(reportLogoValue);
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
        case 'profit-loss-store-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/profit-loss-store?${queryRange}`), { headers });
          setProfitLossStore(response?.data || null);
          break;
        }
        case 'balance-sheet-store-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/balance-sheet-store?${queryRange}`), { headers });
          setBalanceSheetStore(response?.data || null);
          break;
        }
        case 'sales-summary-shift-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/sales-summary-shift?${queryRange}`), { headers });
          setSalesSummaryShift(response?.data || null);
          break;
        }
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
        case 'hsn-wise-sales-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/hsn-wise-sales?${queryRange}`), { headers });
          setHsnWiseSales(response?.data || null);
          break;
        }
        case 'taxability-breakup-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/taxability-breakup?${queryRange}`), { headers });
          setTaxabilityBreakup(response?.data || null);
          break;
        }
        case 'b2b-vs-b2c-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/b2b-vs-b2c?${queryRange}`), { headers });
          setB2bVsB2c(response?.data || null);
          break;
        }
        case 'gst-note-register-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/gst-note-register?${queryRange}`), { headers });
          setGstNoteRegister(response?.data || null);
          break;
        }
        case 'sales-register-detailed-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/sales-register-detailed?${queryRange}`), { headers });
          setSalesRegisterDetailed(response?.data || null);
          break;
        }
        case 'payment-reconciliation-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/payment-reconciliation?${queryRange}`), { headers });
          setPaymentReconciliation(response?.data || null);
          break;
        }
        case 'z-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/z-report?${queryRange}`), { headers });
          setZReport(response?.data || null);
          break;
        }
        case 'pos-inventory-movement-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/pos-inventory-movement?${queryRange}`), { headers });
          setPosInventoryMovement(response?.data || null);
          break;
        }
        case 'membership-sales-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/membership-sales?${queryRange}`), { headers });
          setMembershipSales(response?.data || null);
          break;
        }
        case 'gst-handoff-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/gst-handoff?${queryRange}`), { headers });
          setGstHandoff(response?.data || null);
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
        case 'tax-summary-report': {
          const response = await fetchApiJson(apiUrl(`/api/reports/tax-summary?${queryRange}`), { headers });
          setTaxSummary({
            salesTax: Array.isArray(response?.data?.salesTax) ? response.data.salesTax : [],
            returnTax: Array.isArray(response?.data?.returnTax) ? response.data.returnTax : [],
          });
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
    const richReport = richReportDefinitions[activeTab];
    if (richReport) {
      return renderRichReportTab(activeTab, richReport);
    }

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
          {renderReportControls(tab, 'Filter by item, category, variant, qty, taxable, tax or total...', [
            { value: 'all', label: 'All items' },
            { value: 'high-qty', label: 'High qty (>=5)' },
            { value: 'low-qty', label: 'Low qty (<5)' },
          ])}
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Item', 'item')}
                {renderSortHeader(tab, 'Category', 'category')}
                {renderSortHeader(tab, 'Variant', 'variant')}
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
                  <td className="px-2 py-2 text-sm text-gray-300">
                    {[row.category, row.subcategory].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="px-2 py-2 text-sm text-cyan-200">
                    {[row.variantSize, row.variantColor].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="px-2 py-2 text-sm text-gray-300">{row.quantity}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.taxableValue || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.tax || 0))}</td>
                  <td className="px-2 py-2 text-sm text-emerald-300">{formatCurrency(Number(row.amount || 0))}</td>
                </tr>
              ))}
              {!itemSalesView.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
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

    if (activeTab === 'tax-summary-report') {
      const placeholder = renderTabPlaceholder('tax-summary-report');
      if (placeholder) return placeholder;
      const tab: ReportTabKey = 'tax-summary-report';
      const paged = paginateRows(tab, taxSummaryView);
      const totalSalesTax = taxSummaryRows
        .filter((row) => row.source === 'Sales')
        .reduce((sum, row) => sum + Number(row.taxAmount || 0), 0);
      const totalReturnTax = taxSummaryRows
        .filter((row) => row.source === 'Returns')
        .reduce((sum, row) => sum + Number(row.taxAmount || 0), 0);
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Tax Summary Report</h2>
          {renderReportControls(tab, 'Filter by source, GST rate, taxable value, or tax amount...', [
            { value: 'all', label: 'All sources' },
            { value: 'sales', label: 'Sales only' },
            { value: 'returns', label: 'Returns only' },
          ])}
          <div className="mb-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded border border-white/10 p-2 text-gray-300">Sales Tax: {formatCurrency(totalSalesTax)}</div>
            <div className="rounded border border-white/10 p-2 text-gray-300">Return Reversal: {formatCurrency(totalReturnTax)}</div>
            <div className="rounded border border-white/10 p-2 text-emerald-300">Net Tax: {formatCurrency(totalSalesTax - totalReturnTax)}</div>
          </div>
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {renderSortHeader(tab, 'Source', 'source')}
                {renderSortHeader(tab, 'GST Rate %', 'gstRate')}
                {renderSortHeader(tab, 'Taxable Value', 'taxableValue')}
                {renderSortHeader(tab, 'Tax Amount', 'taxAmount')}
                {renderSortHeader(tab, 'CGST', 'cgstAmount')}
                {renderSortHeader(tab, 'SGST', 'sgstAmount')}
                {renderSortHeader(tab, 'IGST', 'igstAmount')}
                {renderSortHeader(tab, 'Cess', 'cessAmount')}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paged.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-2 text-sm text-white">{row.source}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{Number(row.gstRate || 0).toFixed(2)}%</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.taxableValue || 0))}</td>
                  <td className="px-2 py-2 text-sm text-cyan-200">{formatCurrency(Number(row.taxAmount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.cgstAmount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.sgstAmount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.igstAmount || 0))}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(Number(row.cessAmount || 0))}</td>
                </tr>
              ))}
              {!taxSummaryView.length && <tr><td colSpan={8} className="px-2 py-3 text-center text-sm text-gray-400">No data</td></tr>}
            </tbody>
          </table>
          {renderPagination(tab, taxSummaryView.length)}
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
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Sales & POS Reports</h1>
          <p className="text-sm text-gray-300">Operational sales reports, POS accounting views, GST verification datasets, and handoff data for the main GST workspace.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <ManualHelpLink anchor="sales-reports-tabs" />
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
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
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Tax Summary Report</p>
          <p className="mt-1 text-xl font-semibold text-cyan-200">
            {formatCurrency(taxSummaryRows.reduce((sum, row) => sum + (row.source === 'Sales' ? Number(row.taxAmount || 0) : -Number(row.taxAmount || 0)), 0))}
          </p>
        </div>
      </div>

      {renderActiveTab()}
    </div>
  );
};
