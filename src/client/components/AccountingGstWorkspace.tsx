import React, { useEffect, useMemo, useState } from 'react';
import { CardTabs } from './CardTabs';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

type GstWorkspaceTab = 'returns' | 'reconciliation' | 'validation' | 'history';
type ReturnType = 'GSTR1' | 'GSTR3B' | 'GSTR9';
type ReconciliationDecision = 'pending' | 'accept_supplier' | 'keep_ledger' | 'ignore';

interface GstMetaResponse {
  storeGstin?: string;
  currentFinancialYear?: string;
  supported?: Record<string, boolean>;
  externalOnly?: Record<string, boolean>;
}

const workspaceTabs: Array<{ key: GstWorkspaceTab; label: string }> = [
  { key: 'returns', label: 'Returns' },
  { key: 'reconciliation', label: 'GSTR-2B Match' },
  { key: 'validation', label: 'GSTIN / HSN' },
  { key: 'history', label: 'History & Audit' },
];

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN');
};

const formatDate = (value?: string | Date) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
};

const downloadJsonFile = (fileName: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const titleCase = (value: string) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const currentPeriodKey = () => new Date().toISOString().slice(0, 7);

type WorkspaceStatus = {
  message: string;
  error: string;
};

type LoadingScope = 'workspace' | GstWorkspaceTab | null;

type CustomTabNotes = Record<GstWorkspaceTab, string>;

interface TabGuide {
  title: string;
  description: string;
  checkpoints: string[];
  noteLabel: string;
  notePlaceholder: string;
}

interface GstErrorExplanation {
  tone: 'input' | 'format' | 'application';
  title: string;
  summary: string;
  causes: string[];
  actions: string[];
}

const GST_WORKSPACE_CUSTOM_NOTES_KEY = 'sarva_gst_workspace_custom_notes_v1';

const createEmptyTabStatuses = (): Record<GstWorkspaceTab, WorkspaceStatus> => ({
  returns: { message: '', error: '' },
  reconciliation: { message: '', error: '' },
  validation: { message: '', error: '' },
  history: { message: '', error: '' },
});

const createEmptyCustomTabNotes = (): CustomTabNotes => ({
  returns: '',
  reconciliation: '',
  validation: '',
  history: '',
});

const readCustomTabNotes = (): CustomTabNotes => {
  if (typeof window === 'undefined') return createEmptyCustomTabNotes();
  try {
    const raw = localStorage.getItem(GST_WORKSPACE_CUSTOM_NOTES_KEY);
    if (!raw) return createEmptyCustomTabNotes();
    const parsed = JSON.parse(raw) as Partial<CustomTabNotes>;
    return {
      returns: String(parsed?.returns || ''),
      reconciliation: String(parsed?.reconciliation || ''),
      validation: String(parsed?.validation || ''),
      history: String(parsed?.history || ''),
    };
  } catch {
    return createEmptyCustomTabNotes();
  }
};

const persistCustomTabNotes = (value: CustomTabNotes) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GST_WORKSPACE_CUSTOM_NOTES_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures so GST work is not blocked.
  }
};

const tabGuides: Record<GstWorkspaceTab, TabGuide> = {
  returns: {
    title: 'Returns tab',
    description:
      'Prepare GSTR-1, GSTR-3B, or GSTR-9 from the transactions already saved in the application, review the summary, then download JSON for external filing.',
    checkpoints: [
      'Choose the correct return type and matching month or financial year before generating a preview.',
      'Review warnings before saving or exporting because the downloaded JSON uses the same source data shown in the preview.',
      'Use the History tab after portal work is complete to mark the draft as submitted, filed, processed, or rejected.',
    ],
    noteLabel: 'Custom return instructions',
    notePlaceholder:
      'Example: Review B2B invoices, confirm HSN summary, download JSON, import it in the GST utility, then mark the return filed after ARN is received.',
  },
  reconciliation: {
    title: 'GSTR-2B Match tab',
    description:
      'Compare purchase ledger entries with the supplier-uploaded GSTR-2B import, understand why rows do not match, and decide whether to accept supplier data or keep your ledger view.',
    checkpoints: [
      'Paste either a JSON array or a CSV export into the import box. Each usable row must include supplier GSTIN and invoice number.',
      'Preview first to review matched, partial, missing in 2B, and missing in ledger rows before saving the run.',
      'Decision changes affect the eligible ITC calculation only after you rerun the preview or save the reconciliation.',
    ],
    noteLabel: 'Custom reconciliation checklist',
    notePlaceholder:
      'Example: Follow up with suppliers for missing invoices, verify date differences up to 5 days, and keep a note of disputed invoices before claiming ITC.',
  },
  validation: {
    title: 'GSTIN / HSN tab',
    description:
      'Validate masters before using them in transactions or returns so that GSTIN format, checksum, and HSN/SAC coding issues are caught early.',
    checkpoints: [
      'Use GSTIN validation when creating or reviewing customer, supplier, or business master records.',
      'Use HSN / SAC validation to confirm minimum digit length and get a rate hint before saving item masters.',
      'If the validation result changes after editing the input, run the check again because the previous result applies only to the old value.',
    ],
    noteLabel: 'Custom validation reminders',
    notePlaceholder:
      'Example: For turnover above 5 crore, insist on 6-digit HSN before month-end closing and correct supplier GSTIN mistakes before reconciliation.',
  },
  history: {
    title: 'History & Audit tab',
    description:
      'Track what was prepared inside the app, which reconciliation runs were saved, and the local audit trail of GST actions performed by the team.',
    checkpoints: [
      'Saved Returns shows local records from this application, not direct GSTN acknowledgements.',
      'Reconciliation Runs preserve the imported summary and eligible ITC snapshot at the time the run was saved.',
      'GST Audit Trail is useful for review, internal control, and checking who validated, saved, or changed statuses.',
    ],
    noteLabel: 'Custom audit notes',
    notePlaceholder:
      'Example: After every filing cycle, refresh history, verify the final status, and record reviewer remarks or ARN references in your external compliance log.',
  },
};

const reconciliationJsonExample = `[
  {
    "supplierGstin": "32ABCDE1234F1Z5",
    "supplierName": "Kerala Sports Traders",
    "invoiceNumber": "INV-1042",
    "invoiceDate": "2026-04-09",
    "taxableValue": 10000,
    "cgst": 900,
    "sgst": 900,
    "igst": 0,
    "cess": 0,
    "eligible": "yes"
  }
]`;

const reconciliationCsvExample =
  'supplierGstin,invoiceNumber,invoiceDate,taxableValue,cgst,sgst,igst,cess,eligible\n32ABCDE1234F1Z5,INV-1042,2026-04-09,10000,900,900,0,0,yes';

const buildDownloadGuide = (
  returnType: ReturnType,
  periodKey: string,
  financialYear: string,
  fileName?: string
): { fileName: string; scopeLabel: string; steps: string[]; example: string } => {
  const scopeLabel = returnType === 'GSTR9' ? financialYear || 'selected financial year' : periodKey || 'selected month';
  const resolvedFileName = fileName || `${String(returnType).toLowerCase()}-${scopeLabel}.json`;
  const commonSteps = [
    `Keep the file name ${resolvedFileName} or rename it clearly so your accountant can identify the correct return and period.`,
    `Open the matching ${returnType} workflow in your GST portal process or offline utility for ${scopeLabel}.`,
    'Import the JSON, review the populated tables, and compare the totals with the preview shown in this screen before final submission.',
    'If the utility rejects the file, return to this screen, fix the source data or master data, regenerate the preview, and download a fresh JSON instead of reusing the rejected file.',
    'After the final portal submission is complete, come back to the History tab and update the local record status so your internal tracker stays correct.',
  ];

  if (returnType === 'GSTR1') {
    return {
      fileName: resolvedFileName,
      scopeLabel,
      steps: commonSteps,
      example:
        'Example: Download gstr1-2026-04.json, import it into the April 2026 GSTR-1 preparation flow, review B2B/B2CS values and HSN summary, then complete filing on the portal side.',
    };
  }

  if (returnType === 'GSTR3B') {
    return {
      fileName: resolvedFileName,
      scopeLabel,
      steps: [
        ...commonSteps.slice(0, 2),
        'Pay special attention to Table 3.1, ITC values, reversals, interest, and late fee because those adjustments are part of this preview.',
        ...commonSteps.slice(3),
      ],
      example:
        'Example: Download gstr3b-2026-04.json, import it into the April 2026 GSTR-3B workflow, verify outward tax, net ITC, and net tax payable, then complete the final payment and submission outside this app.',
    };
  }

  return {
    fileName: resolvedFileName,
    scopeLabel,
    steps: [
      ...commonSteps.slice(0, 2),
      'Review the annual monthly breakdown after import so you can spot any month where GSTR-1, GSTR-3B, or eligible ITC totals do not align with expectations.',
      ...commonSteps.slice(3),
    ],
    example:
      'Example: Download gstr9-2025-2026.json, import it into the annual return preparation flow for FY 2025-2026, review the month-wise summaries, and then complete final annual filing outside this app.',
  };
};

const describeReconciliationDifferences = (row: any): string[] => {
  const differences = row?.differences || {};
  const details: string[] = [];
  if (Number(differences.taxableValue || 0) > 0.01) details.push(`Taxable difference ${formatCurrency(Number(differences.taxableValue || 0))}`);
  if (Number(differences.cgst || 0) > 0.01) details.push(`CGST difference ${formatCurrency(Number(differences.cgst || 0))}`);
  if (Number(differences.sgst || 0) > 0.01) details.push(`SGST difference ${formatCurrency(Number(differences.sgst || 0))}`);
  if (Number(differences.igst || 0) > 0.01) details.push(`IGST difference ${formatCurrency(Number(differences.igst || 0))}`);
  if (Number(differences.cess || 0) > 0.01) details.push(`Cess difference ${formatCurrency(Number(differences.cess || 0))}`);
  if (Number(differences.dateDays || 0) > 0) details.push(`Invoice date gap ${Number(differences.dateDays || 0)} day(s)`);
  return details;
};

const buildGstErrorExplanation = (tab: GstWorkspaceTab, rawError: string): GstErrorExplanation => {
  const error = String(rawError || '').trim() || 'Request failed';
  const normalized = error.toLowerCase();

  if (normalized.includes('importtext is required') || normalized.includes('gstr-2b import data is required')) {
    return {
      tone: 'input',
      title: 'GSTR-2B import data is missing',
      summary:
        'The reconciliation request did not receive any usable import text. This usually means the paste box is empty, contains only spaces, or the data was removed before clicking Preview Match or Save Run.',
      causes: [
        'No JSON or CSV was pasted into the import box.',
        'The import area contains only blank lines or spaces, so the server treats it as empty input.',
        'This is normally a data-entry issue, not a backend crash.',
      ],
      actions: [
        'Paste the GSTR-2B export in JSON array or CSV format into the import box.',
        'Make sure the period is selected separately, then run Preview Match again.',
        'Use rows that include supplier GSTIN and invoice number so they can be matched against the ledger.',
      ],
    };
  }

  if (normalized.includes('no valid gstr-2b rows were found')) {
    return {
      tone: 'format',
      title: 'The GSTR-2B file was pasted, but no valid rows could be read',
      summary:
        'The pasted content reached the application, but none of the rows contained the minimum keys needed for matching. The app can only use rows that carry supplier GSTIN and invoice number.',
      causes: [
        'The file is not JSON array or CSV in a readable structure.',
        'Header names do not map to supplier GSTIN and invoice number fields.',
        'The pasted content may be a report extract or screen copy instead of the raw import export.',
      ],
      actions: [
        'Paste a JSON array or CSV export instead of a formatted report or screenshot text.',
        'Include columns like supplierGstin or ctin, and invoiceNumber or inum.',
        'Try the sample format shown on this screen and compare your headers before re-running the preview.',
      ],
    };
  }

  if (normalized.includes('periodkey is required') || normalized.includes('return period is required')) {
    return {
      tone: 'input',
      title: 'Return period is missing',
      summary:
        tab === 'reconciliation'
          ? 'The reconciliation cannot run without the target month because the purchase ledger and supplier data must be compared period by period.'
          : 'The return cannot be prepared until the filing month is selected.',
      causes: [
        'No filing month was selected in the month field.',
        'The month value may have been cleared before you clicked the action button.',
      ],
      actions: [
        'Choose the correct month in YYYY-MM format using the month field.',
        'Confirm the selected month matches the return you are preparing, then retry.',
      ],
    };
  }

  if (normalized.includes('period must be in yyyy-mm format')) {
    return {
      tone: 'format',
      title: 'The month format is invalid',
      summary:
        'The request reached the server, but the period value was not in the required YYYY-MM format. This is usually caused by a manually edited value or a malformed request.',
      causes: [
        'The month value was not selected using the month picker.',
        'A custom or old value was sent in a format the GST service does not support.',
      ],
      actions: [
        'Use the month picker instead of typing a custom date format.',
        'Retry after selecting a month like 2026-04.',
      ],
    };
  }

  if (normalized.includes('financial year must be in yyyy-yyyy format') || normalized.includes('financial year is required')) {
    return {
      tone: 'input',
      title: 'Financial year is missing or invalid',
      summary:
        'GSTR-9 needs a financial year such as 2025-2026. Without it, the application cannot assemble the annual totals and monthly breakdown.',
      causes: [
        'The financial year field is blank.',
        'The value is not in the expected YYYY-YYYY format.',
      ],
      actions: [
        'Enter a financial year like 2025-2026.',
        'Generate the preview again after correcting the format.',
      ],
    };
  }

  if (normalized.includes('gstin is required')) {
    return {
      tone: 'input',
      title: 'GSTIN value is missing',
      summary:
        'The GSTIN validation request ran without a GSTIN value. This is a missing-input problem, so the validation service had nothing to check.',
      causes: [
        'The GSTIN field is blank.',
        'The value was cleared before validation was triggered.',
      ],
      actions: [
        'Enter the full 15-character GSTIN.',
        'Run Validate GSTIN again after checking the business, customer, or supplier master.',
      ],
    };
  }

  if (normalized.includes('hsn or sac code is required')) {
    return {
      tone: 'input',
      title: 'HSN / SAC code is missing',
      summary:
        'The validation request was sent without a code, so the app could not determine the code type, length, or rate hint.',
      causes: [
        'The HSN / SAC field is blank.',
        'The code was removed before validation was triggered.',
      ],
      actions: [
        'Enter the HSN or SAC code you want to verify.',
        'Select the correct turnover band and validate again.',
      ],
    };
  }

  if (
    normalized.includes('could not reach the application server')
    || normalized.includes('your device appears to be offline')
    || normalized.includes('api returned non-json response')
    || normalized.includes('invalid json response from api')
  ) {
    return {
      tone: 'application',
      title: 'The GST screen could not talk to the application server',
      summary:
        'This looks like a connectivity or backend-response issue rather than a GST data-entry problem. The screen either could not reach the API or received a broken response back.',
      causes: [
        'The backend server is stopped, restarting, or temporarily unreachable.',
        'The browser is offline or the deployed route is not responding correctly.',
        'A proxy or server error returned HTML or invalid JSON instead of the expected API response.',
      ],
      actions: [
        'Check whether the backend is running and reachable, then retry the same action.',
        'Reload the page after confirming network access if you are on a deployed environment.',
        'If the same error repeats with valid input, treat it as an application issue and inspect the server logs.',
      ],
    };
  }

  if (normalized.includes('failed to')) {
    return {
      tone: 'application',
      title: 'The GST request failed inside the application',
      summary:
        'The request was submitted, but the application could not finish the GST operation successfully. This may be data related, or it may be a backend issue that needs inspection.',
      causes: [
        'The server hit an unexpected validation or processing error.',
        'The underlying data may be incomplete or inconsistent for the selected GST action.',
      ],
      actions: [
        'Review the input on the current tab and retry once with the same values.',
        'If the error repeats with correct input, inspect the API logs because it is likely an application-side issue.',
      ],
    };
  }

  return {
    tone: 'format',
    title: 'The GST action needs review',
    summary:
      'The request did not complete cleanly. The raw system message below should help identify whether the issue is with missing data, formatting, or backend processing.',
    causes: ['The server returned a message that did not match a known GST help pattern.'],
    actions: [
      'Review the current tab inputs and try again.',
      'If the values look correct and the same message keeps returning, inspect the backend logs as a possible application issue.',
    ],
  };
};

const FieldHelp: React.FC<{
  label: string;
  description: string;
  example?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, description, example, required = false, children }) => (
  <div className="space-y-2">
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-white">{label}</p>
        {required && <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100">Required</span>}
      </div>
      <p className="text-xs text-gray-400">{description}</p>
      {example && <p className="text-[11px] text-gray-500">Example: {example}</p>}
    </div>
    {children}
  </div>
);

export const AccountingGstWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<GstWorkspaceTab>('returns');
  const [meta, setMeta] = useState<GstMetaResponse | null>(null);
  const [loadingScope, setLoadingScope] = useState<LoadingScope>(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [tabStatus, setTabStatus] = useState<Record<GstWorkspaceTab, WorkspaceStatus>>(createEmptyTabStatuses);
  const [customTabNotes, setCustomTabNotes] = useState<CustomTabNotes>(readCustomTabNotes);

  const [returnType, setReturnType] = useState<ReturnType>('GSTR1');
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [financialYear, setFinancialYear] = useState('');
  const [notes, setNotes] = useState('');
  const [adjustments, setAdjustments] = useState({
    itcReversal: '',
    reverseChargeTax: '',
    interest: '',
    lateFee: '',
    otherItcReduction: '',
  });
  const [previewData, setPreviewData] = useState<any>(null);

  const [gstinInput, setGstinInput] = useState('');
  const [gstinValidation, setGstinValidation] = useState<any>(null);
  const [hsnInput, setHsnInput] = useState('');
  const [turnoverBand, setTurnoverBand] = useState<'up_to_5cr' | 'above_5cr'>('up_to_5cr');
  const [hsnValidation, setHsnValidation] = useState<any>(null);

  const [reconciliationPeriod, setReconciliationPeriod] = useState(currentPeriodKey());
  const [reconciliationImportText, setReconciliationImportText] = useState('');
  const [reconciliationPreview, setReconciliationPreview] = useState<any>(null);
  const [reconciliationNotes, setReconciliationNotes] = useState('');
  const [reconciliationDecisions, setReconciliationDecisions] = useState<Record<string, ReconciliationDecision>>({});

  const [returnHistory, setReturnHistory] = useState<any[]>([]);
  const [reconciliationHistory, setReconciliationHistory] = useState<any[]>([]);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [lastDownloadedJson, setLastDownloadedJson] = useState<{
    fileName: string;
    returnType: ReturnType;
    scopeLabel: string;
  } | null>(null);

  const headers = useMemo<HeadersInit>(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    }),
    []
  );

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';
  const buttonClass =
    'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';
  const secondaryButtonClass =
    'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-60';
  const loading = loadingScope !== null;

  const setTabMessage = (tab: GstWorkspaceTab, message: string) => {
    setTabStatus((prev) => ({
      ...prev,
      [tab]: { message, error: '' },
    }));
  };

  const setTabError = (tab: GstWorkspaceTab, error: string) => {
    setTabStatus((prev) => ({
      ...prev,
      [tab]: { message: '', error },
    }));
  };

  const clearTabStatus = (tab: GstWorkspaceTab) => {
    setTabStatus((prev) => {
      if (!prev[tab].message && !prev[tab].error) return prev;
      return {
        ...prev,
        [tab]: { message: '', error: '' },
      };
    });
  };

  const runWorkspaceTask = async (fn: () => Promise<void>) => {
    setLoadingScope('workspace');
    setWorkspaceError('');
    try {
      await fn();
    } catch (requestError: any) {
      setWorkspaceError(requestError?.message || 'Failed to load GST workspace');
    } finally {
      setLoadingScope(null);
    }
  };

  const runTabTask = async (tab: GstWorkspaceTab, fn: () => Promise<void>) => {
    setLoadingScope(tab);
    clearTabStatus(tab);
    try {
      await fn();
    } catch (requestError: any) {
      setTabError(tab, requestError?.message || 'Request failed');
    } finally {
      setLoadingScope(null);
    }
  };

  const loadMeta = async () => {
    const response = await fetchApiJson(apiUrl('/api/gst/meta'), { headers });
    setMeta(response?.data || null);
    setFinancialYear(String(response?.data?.currentFinancialYear || ''));
  };

  const refreshHistory = async () => {
    const [returnsResponse, reconciliationResponse, auditResponse] = await Promise.all([
      fetchApiJson(apiUrl('/api/gst/returns'), { headers }),
      fetchApiJson(apiUrl('/api/gst/reconciliation/runs'), { headers }),
      fetchApiJson(apiUrl('/api/gst/audit?limit=100'), { headers }),
    ]);
    setReturnHistory(Array.isArray(returnsResponse?.data) ? returnsResponse.data : []);
    setReconciliationHistory(Array.isArray(reconciliationResponse?.data) ? reconciliationResponse.data : []);
    setAuditRows(Array.isArray(auditResponse?.data) ? auditResponse.data : []);
  };

  useEffect(() => {
    void runWorkspaceTask(async () => {
      await Promise.all([loadMeta(), refreshHistory()]);
    });
  }, []);

  useEffect(() => {
    persistCustomTabNotes(customTabNotes);
  }, [customTabNotes]);

  const validateReturnInputs = () => {
    if (returnType === 'GSTR9') {
      const year = String(financialYear || '').trim();
      if (!year) {
        setTabError('returns', 'Financial year is required for GSTR-9. Enter a value like 2025-2026 before continuing.');
        return false;
      }
      if (!/^\d{4}-\d{4}$/.test(year)) {
        setTabError('returns', 'Financial year is invalid. Use YYYY-YYYY format such as 2025-2026.');
        return false;
      }
      return true;
    }

    if (!String(periodKey || '').trim()) {
      setTabError('returns', 'Return period is required. Choose the filing month before previewing or saving the return.');
      return false;
    }
    return true;
  };

  const validateReconciliationInputs = () => {
    if (!String(reconciliationPeriod || '').trim()) {
      setTabError('reconciliation', 'Return period is required. Choose the month before running GSTR-2B reconciliation.');
      return false;
    }
    if (!String(reconciliationImportText || '').trim()) {
      setTabError(
        'reconciliation',
        'GSTR-2B import data is required. Paste the JSON or CSV export before previewing or saving the match.'
      );
      return false;
    }
    return true;
  };

  const previewReturn = async () => {
    if (!validateReturnInputs()) return;
    await runTabTask('returns', async () => {
      const body =
        returnType === 'GSTR9'
          ? { returnType, financialYear }
          : {
              returnType,
              periodKey,
              adjustments: {
                itcReversal: Number(adjustments.itcReversal || 0),
                reverseChargeTax: Number(adjustments.reverseChargeTax || 0),
                interest: Number(adjustments.interest || 0),
                lateFee: Number(adjustments.lateFee || 0),
                otherItcReduction: Number(adjustments.otherItcReduction || 0),
              },
            };
      const response = await fetchApiJson(apiUrl('/api/gst/returns/preview'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      setPreviewData(response?.data || null);
      setTabMessage('returns', `${returnType} preview prepared.`);
    });
  };

  const saveReturn = async () => {
    if (!validateReturnInputs()) return;
    await runTabTask('returns', async () => {
      const body =
        returnType === 'GSTR9'
          ? { returnType, financialYear, notes }
          : {
              returnType,
              periodKey,
              notes,
              adjustments: {
                itcReversal: Number(adjustments.itcReversal || 0),
                reverseChargeTax: Number(adjustments.reverseChargeTax || 0),
                interest: Number(adjustments.interest || 0),
                lateFee: Number(adjustments.lateFee || 0),
                otherItcReduction: Number(adjustments.otherItcReduction || 0),
              },
            };
      const response = await fetchApiJson(apiUrl('/api/gst/returns/save'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      setTabMessage('returns', response?.message || `${returnType} saved locally.`);
      await refreshHistory();
    });
  };

  const submitReturnRecord = async (id: string) => {
    await runTabTask('history', async () => {
      const response = await fetchApiJson(apiUrl(`/api/gst/returns/${id}/submit`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: 'Submitted from accounting GST workspace' }),
      });
      setTabMessage('history', response?.message || 'GST return marked submitted.');
      await refreshHistory();
    });
  };

  const updateReturnStatus = async (id: string, status: string) => {
    await runTabTask('history', async () => {
      const response = await fetchApiJson(apiUrl(`/api/gst/returns/${id}/status`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ status, note: `Status updated to ${status}` }),
      });
      setTabMessage('history', response?.message || 'Return status updated.');
      await refreshHistory();
    });
  };

  const validateGstin = async () => {
    if (!String(gstinInput || '').trim()) {
      setTabError('validation', 'GSTIN is required. Enter the 15-character GSTIN you want to validate.');
      return;
    }
    await runTabTask('validation', async () => {
      const response = await fetchApiJson(apiUrl('/api/gst/validate/gstin'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ gstin: gstinInput }),
      });
      setGstinValidation(response?.data || null);
      setTabMessage('validation', 'GSTIN validation complete.');
    });
  };

  const validateHsn = async () => {
    if (!String(hsnInput || '').trim()) {
      setTabError('validation', 'HSN or SAC code is required. Enter the code you want to validate.');
      return;
    }
    await runTabTask('validation', async () => {
      const response = await fetchApiJson(apiUrl('/api/gst/validate/hsn'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: hsnInput, turnoverBand }),
      });
      setHsnValidation(response?.data || null);
      setTabMessage('validation', 'HSN/SAC validation complete.');
    });
  };

  const previewReconciliation = async () => {
    if (!validateReconciliationInputs()) return;
    await runTabTask('reconciliation', async () => {
      const response = await fetchApiJson(apiUrl('/api/gst/reconciliation/preview'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          periodKey: reconciliationPeriod,
          importText: reconciliationImportText,
          decisions: reconciliationDecisions,
        }),
      });
      setReconciliationPreview(response?.data || null);
      setTabMessage('reconciliation', 'GSTR-2B reconciliation preview prepared.');
    });
  };

  const saveReconciliation = async () => {
    if (!validateReconciliationInputs()) return;
    await runTabTask('reconciliation', async () => {
      const response = await fetchApiJson(apiUrl('/api/gst/reconciliation/runs'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          periodKey: reconciliationPeriod,
          importText: reconciliationImportText,
          notes: reconciliationNotes,
          decisions: reconciliationDecisions,
        }),
      });
      setTabMessage('reconciliation', response?.message || 'Reconciliation saved.');
      await refreshHistory();
    });
  };

  const downloadPreviewPayload = () => {
    if (!previewData?.payload) return;
    const guide = buildDownloadGuide(returnType, periodKey, financialYear);
    downloadJsonFile(guide.fileName, previewData.payload);
    setLastDownloadedJson({
      fileName: guide.fileName,
      returnType,
      scopeLabel: guide.scopeLabel,
    });
    setTabMessage('returns', `${guide.fileName} downloaded. Follow the next-step checklist before final filing.`);
  };

  const previewWarnings = Array.isArray(previewData?.warnings) ? previewData.warnings : [];
  const reconciliationRows = Array.isArray(reconciliationPreview?.rows) ? reconciliationPreview.rows : [];
  const activeStatus = tabStatus[activeTab];
  const activeGuide = tabGuides[activeTab];
  const activeErrorExplanation = activeStatus.error ? buildGstErrorExplanation(activeTab, activeStatus.error) : null;
  const downloadGuide = previewData?.payload
    ? buildDownloadGuide(
        returnType,
        periodKey,
        financialYear,
        lastDownloadedJson?.returnType === returnType ? lastDownloadedJson.fileName : undefined
      )
    : null;
  const errorPanelClass = activeErrorExplanation
    ? activeErrorExplanation.tone === 'application'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-50'
      : activeErrorExplanation.tone === 'format'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-50'
        : 'border-orange-500/30 bg-orange-500/10 text-orange-50'
    : '';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">GST Workspace</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Prepare returns, validate masters, and track filing activity</h2>
            <p className="mt-1 max-w-3xl text-sm text-cyan-100/80">
              This workspace supports offline GST preparation and internal filing tracking. Live GSTN OTP filing, e-Invoice IRN,
              e-Way Bill generation, and direct GSTR-2B fetch still need external GSTN or GSP integration.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Business GSTIN</p>
              <p className="mt-1 font-semibold text-white">{meta?.storeGstin || 'Not configured'}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Current FY</p>
              <p className="mt-1 font-semibold text-white">{meta?.currentFinancialYear || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {workspaceError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-semibold text-white">GST workspace could not finish loading</p>
          <p className="mt-1">{workspaceError}</p>
        </div>
      )}

      {activeStatus.message && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {activeStatus.message}
        </div>
      )}

      {activeErrorExplanation && (
        <div className={`rounded-xl border px-4 py-4 ${errorPanelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
                {titleCase(activeErrorExplanation.tone)} issue
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">{activeErrorExplanation.title}</h3>
              <p className="mt-2 text-sm text-white/85">{activeErrorExplanation.summary}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-white">Why this error came</p>
              <ul className="mt-2 space-y-2 text-sm text-white/80">
                {activeErrorExplanation.causes.map((item, index) => (
                  <li key={`cause-${index}`}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-white">What the user should do</p>
              <ul className="mt-2 space-y-2 text-sm text-white/80">
                {activeErrorExplanation.actions.map((item, index) => (
                  <li key={`action-${index}`}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
            System message: {activeStatus.error}
          </div>
        </div>
      )}

      <CardTabs
        ariaLabel="GST workspace tabs"
        items={workspaceTabs}
        activeKey={activeTab}
        onChange={setActiveTab}
        className="w-fit max-w-full"
        listClassName="border-b-0 px-0 pt-0"
      />

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Tab guide</p>
            <h3 className="mt-2 text-lg font-semibold text-white">{activeGuide.title}</h3>
            <p className="mt-2 text-sm text-gray-300">{activeGuide.description}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
            Status is isolated per tab, so an error in one GST tab will not appear as a common error in the other tabs.
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-semibold text-white">What to review on this tab</p>
            <ul className="mt-2 space-y-2 text-sm text-gray-300">
              {activeGuide.checkpoints.map((item, index) => (
                <li key={`checkpoint-${activeTab}-${index}`}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <div>
              <p className="text-sm font-semibold text-white">{activeGuide.noteLabel}</p>
              <p className="mt-1 text-xs text-gray-400">
                Saved on this browser only. Use it for your accountant checklist, internal review note, or portal steps.
              </p>
            </div>
            <textarea
              className={`${inputClass} min-h-[140px]`}
              placeholder={activeGuide.notePlaceholder}
              value={customTabNotes[activeTab]}
              onChange={(e) => setCustomTabNotes((prev) => ({ ...prev, [activeTab]: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {activeTab === 'returns' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Return Builder</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Prepare GST return draft</h3>
              </div>

              <FieldHelp
                label="Return type"
                description="Choose the GST return you want to prepare. This changes the required fields and the preview section on the right."
                example="Use GSTR-1 for outward supplies, GSTR-3B for monthly summary tax payment, and GSTR-9 for annual summary."
                required
              >
                <select
                  className={inputClass}
                  value={returnType}
                  onChange={(e) => {
                    setReturnType(e.target.value as ReturnType);
                    setPreviewData(null);
                    setLastDownloadedJson(null);
                    clearTabStatus('returns');
                  }}
                >
                  <option value="GSTR1">GSTR-1</option>
                  <option value="GSTR3B">GSTR-3B</option>
                  <option value="GSTR9">GSTR-9</option>
                </select>
              </FieldHelp>

              {returnType === 'GSTR9' ? (
                <FieldHelp
                  label="Financial year"
                  description="Required only for GSTR-9. The annual return is built across the full financial year."
                  example="2025-2026"
                  required
                >
                  <input
                    className={inputClass}
                    placeholder="Financial year (YYYY-YYYY)"
                    value={financialYear}
                    onChange={(e) => {
                      setFinancialYear(e.target.value);
                      setPreviewData(null);
                      setLastDownloadedJson(null);
                      clearTabStatus('returns');
                    }}
                  />
                </FieldHelp>
              ) : (
                <FieldHelp
                  label="Return month"
                  description="Select the filing month for GSTR-1 or GSTR-3B. The preview uses this exact period to collect source transactions."
                  example="2026-04"
                  required
                >
                  <input
                    className={inputClass}
                    type="month"
                    value={periodKey}
                    onChange={(e) => {
                      setPeriodKey(e.target.value);
                      setPreviewData(null);
                      setLastDownloadedJson(null);
                      clearTabStatus('returns');
                    }}
                  />
                </FieldHelp>
              )}

              {returnType === 'GSTR3B' && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold text-white">3B adjustments</p>
                  <p className="text-xs text-gray-400">
                    Use these fields only when the monthly GSTR-3B needs manual adjustments beyond what the app derives from transactions.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FieldHelp label="ITC reversal" description="Use when part of the input tax credit should not be claimed this month." example="2500.00">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="ITC reversal"
                        value={adjustments.itcReversal}
                        onChange={(e) => {
                          setAdjustments((prev) => ({ ...prev, itcReversal: e.target.value }));
                          setPreviewData(null);
                          setLastDownloadedJson(null);
                          clearTabStatus('returns');
                        }}
                      />
                    </FieldHelp>
                    <FieldHelp label="Reverse charge tax" description="Enter tax payable under reverse charge if it needs to be added in this return." example="1800.00">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Reverse charge tax"
                        value={adjustments.reverseChargeTax}
                        onChange={(e) => {
                          setAdjustments((prev) => ({ ...prev, reverseChargeTax: e.target.value }));
                          setPreviewData(null);
                          setLastDownloadedJson(null);
                          clearTabStatus('returns');
                        }}
                      />
                    </FieldHelp>
                    <FieldHelp label="Interest" description="Interest on delayed payment, short payment, or other GST liability corrections." example="150.00">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Interest"
                        value={adjustments.interest}
                        onChange={(e) => {
                          setAdjustments((prev) => ({ ...prev, interest: e.target.value }));
                          setPreviewData(null);
                          setLastDownloadedJson(null);
                          clearTabStatus('returns');
                        }}
                      />
                    </FieldHelp>
                    <FieldHelp label="Late fee" description="Use if filing is delayed and a late fee amount must be reflected in the summary." example="50.00">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Late fee"
                        value={adjustments.lateFee}
                        onChange={(e) => {
                          setAdjustments((prev) => ({ ...prev, lateFee: e.target.value }));
                          setPreviewData(null);
                          setLastDownloadedJson(null);
                          clearTabStatus('returns');
                        }}
                      />
                    </FieldHelp>
                    <FieldHelp label="Other ITC reduction" description="Use for any additional ITC reduction not covered by the standard reversal field." example="300.00">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Other ITC reduction"
                        value={adjustments.otherItcReduction}
                        onChange={(e) => {
                          setAdjustments((prev) => ({ ...prev, otherItcReduction: e.target.value }));
                          setPreviewData(null);
                          setLastDownloadedJson(null);
                          clearTabStatus('returns');
                        }}
                      />
                    </FieldHelp>
                  </div>
                </div>
              )}

              <FieldHelp
                label="Internal notes"
                description="These notes stay with the saved local record and are useful for audit context, reviewer comments, or filing reminders."
                example="Waiting for one supplier amendment before final portal filing."
              >
                <textarea
                  className={`${inputClass} min-h-[84px]`}
                  placeholder="Internal notes for this saved return"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    clearTabStatus('returns');
                  }}
                />
              </FieldHelp>

              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} onClick={() => void previewReturn()} disabled={loading}>
                  Preview Return
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => void saveReturn()} disabled={loading}>
                  Save Draft
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Preview</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    {previewData ? `${returnType} summary ready` : 'Generate a preview to review the filing payload'}
                  </h3>
                </div>
                {previewData?.payload && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={downloadPreviewPayload}
                  >
                    Download JSON
                  </button>
                )}
              </div>

              {!previewData && <p className="text-sm text-gray-400">Preview data will appear here after running the return builder.</p>}

              {previewData && (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-gray-400">{returnType === 'GSTR9' ? 'Financial Year' : 'Period'}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{previewData.financialYear || previewData.periodKey || '-'}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Taxable Value</p>
                      <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(previewData?.summary?.totals?.taxableValue || previewData?.summary?.outwardTaxableValue || 0)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-gray-400">{returnType === 'GSTR3B' ? 'Net ITC' : 'Tax Total'}</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {formatCurrency(
                          previewData?.summary?.netItc
                          || previewData?.summary?.outwardTax
                          || (
                            Number(previewData?.summary?.totals?.cgst || 0)
                            + Number(previewData?.summary?.totals?.sgst || 0)
                            + Number(previewData?.summary?.totals?.igst || 0)
                            + Number(previewData?.summary?.totals?.cess || 0)
                          )
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-gray-400">{returnType === 'GSTR3B' ? 'Net Tax Payable' : 'Documents'}</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {returnType === 'GSTR3B'
                          ? formatCurrency(previewData?.summary?.netTaxPayable || 0)
                          : Number(previewData?.summary?.counts?.totalInvoices || previewData?.monthlyBreakdown?.length || 0)}
                      </p>
                    </div>
                  </div>

                  {previewWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                      <p className="text-sm font-semibold text-amber-100">Review warnings before export</p>
                      <ul className="mt-2 space-y-1 text-sm text-amber-50/90">
                        {previewWarnings.map((warning: string, index: number) => (
                          <li key={`warning-${index}`}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {downloadGuide && (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">After downloading JSON</p>
                          <p className="mt-1 text-sm text-cyan-50/90">
                            This application prepares the file and local tracking, but the final filing still happens outside this screen.
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
                          File: {downloadGuide.fileName}
                        </div>
                      </div>
                      <ol className="mt-3 space-y-2 text-sm text-cyan-50/90">
                        {downloadGuide.steps.map((step, index) => (
                          <li key={`download-step-${index}`}>{index + 1}. {step}</li>
                        ))}
                      </ol>
                      <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
                        {downloadGuide.example}
                      </p>
                    </div>
                  )}

                  {returnType === 'GSTR1' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-3">
                        <h4 className="mb-2 font-semibold text-white">Invoice split</h4>
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-400">
                              <th className="px-2 py-1">Type</th>
                              <th className="px-2 py-1">Count</th>
                              <th className="px-2 py-1">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ['B2B', previewData?.summary?.counts?.b2b, previewData?.invoiceRows?.filter((row: any) => row.classification === 'b2b').reduce((sum: number, row: any) => sum + Number(row.invoiceValue || 0), 0)],
                              ['B2CL', previewData?.summary?.counts?.b2cl, previewData?.invoiceRows?.filter((row: any) => row.classification === 'b2cl').reduce((sum: number, row: any) => sum + Number(row.invoiceValue || 0), 0)],
                              ['B2CS', previewData?.summary?.counts?.b2cs, previewData?.invoiceRows?.filter((row: any) => row.classification === 'b2cs').reduce((sum: number, row: any) => sum + Number(row.invoiceValue || 0), 0)],
                            ].map(([label, count, value]) => (
                              <tr key={String(label)} className="border-t border-white/10">
                                <td className="px-2 py-1 text-white">{label}</td>
                                <td className="px-2 py-1 text-gray-300">{Number(count || 0)}</td>
                                <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(value || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-3">
                        <h4 className="mb-2 font-semibold text-white">HSN summary</h4>
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-400">
                              <th className="px-2 py-1">HSN/SAC</th>
                              <th className="px-2 py-1">Qty</th>
                              <th className="px-2 py-1">Taxable</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(Array.isArray(previewData?.hsnSummary) ? previewData.hsnSummary : []).slice(0, 8).map((row: any) => (
                              <tr key={String(row.hsnCode)} className="border-t border-white/10">
                                <td className="px-2 py-1 text-white">{row.hsnCode}</td>
                                <td className="px-2 py-1 text-gray-300">{Number(row.quantity || 0)}</td>
                                <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.taxableValue || 0))}</td>
                              </tr>
                            ))}
                            {!previewData?.hsnSummary?.length && (
                              <tr>
                                <td colSpan={3} className="px-2 py-3 text-center text-gray-400">No HSN summary rows.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {returnType === 'GSTR3B' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <h4 className="mb-2 font-semibold text-white">Table 3.1</h4>
                        <div className="space-y-2 text-sm text-gray-300">
                          <div className="flex items-center justify-between"><span>Outward taxable supplies</span><span>{formatCurrency(previewData?.tables?.table3_1?.outwardTaxableSupplies?.taxableValue || 0)}</span></div>
                          <div className="flex items-center justify-between"><span>CGST</span><span>{formatCurrency(previewData?.tables?.table3_1?.outwardTaxableSupplies?.cgst || 0)}</span></div>
                          <div className="flex items-center justify-between"><span>SGST</span><span>{formatCurrency(previewData?.tables?.table3_1?.outwardTaxableSupplies?.sgst || 0)}</span></div>
                          <div className="flex items-center justify-between"><span>IGST</span><span>{formatCurrency(previewData?.tables?.table3_1?.outwardTaxableSupplies?.igst || 0)}</span></div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <h4 className="mb-2 font-semibold text-white">Table 4 / 5</h4>
                        <div className="space-y-2 text-sm text-gray-300">
                          <div className="flex items-center justify-between"><span>Available ITC</span><span>{formatCurrency(previewData?.tables?.table4?.totalAvailable || 0)}</span></div>
                          <div className="flex items-center justify-between"><span>Total reversal</span><span>{formatCurrency(previewData?.tables?.table4?.reversal?.totalReversal || 0)}</span></div>
                          <div className="flex items-center justify-between"><span>Net ITC</span><span>{formatCurrency(previewData?.tables?.table4?.netAvailable || 0)}</span></div>
                          <div className="flex items-center justify-between"><span>Nil / exempt / non-GST</span><span>{formatCurrency(previewData?.tables?.table5?.exemptNilNonGst?.totalValue || 0)}</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {returnType === 'GSTR9' && (
                    <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-3">
                      <h4 className="mb-2 font-semibold text-white">Monthly breakdown</h4>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-400">
                            <th className="px-2 py-1">Month</th>
                            <th className="px-2 py-1">Outward</th>
                            <th className="px-2 py-1">Tax</th>
                            <th className="px-2 py-1">GSTR-1</th>
                            <th className="px-2 py-1">GSTR-3B</th>
                            <th className="px-2 py-1">Eligible ITC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(Array.isArray(previewData?.monthlyBreakdown) ? previewData.monthlyBreakdown : []).map((row: any) => (
                            <tr key={String(row.periodKey)} className="border-t border-white/10">
                              <td className="px-2 py-1 text-white">{row.periodKey}</td>
                              <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.outwardTaxableValue || 0))}</td>
                              <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.tax || 0))}</td>
                              <td className="px-2 py-1 text-gray-300">{titleCase(String(row.gstr1Status || 'not_saved'))}</td>
                              <td className="px-2 py-1 text-gray-300">{titleCase(String(row.gstr3bStatus || 'not_saved'))}</td>
                              <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.eligibleItc || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">GSTR-2B Reconciliation</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Compare purchase ledger with supplier upload data</h3>
            </div>
            <FieldHelp
              label="Reconciliation month"
              description="Choose the month you want to compare. The ledger purchases for this month are matched against the GSTR-2B import you paste below."
              example="2026-04"
              required
            >
              <input
                className={inputClass}
                type="month"
                value={reconciliationPeriod}
                onChange={(e) => {
                  setReconciliationPeriod(e.target.value);
                  setReconciliationPreview(null);
                  clearTabStatus('reconciliation');
                }}
              />
            </FieldHelp>
            <FieldHelp
              label="GSTR-2B import text"
              description="Paste a JSON array or CSV export. Each usable row should contain supplier GSTIN, invoice number, invoice date, taxable value, tax amounts, and eligibility."
              example="Use the sample JSON or CSV format shown below."
              required
            >
              <textarea
                className={`${inputClass} min-h-[220px] font-mono text-xs`}
                placeholder="Paste GSTR-2B import as JSON array or CSV with supplierGstin, invoiceNumber, invoiceDate, taxableValue, cgst, sgst, igst, cess, eligible"
                value={reconciliationImportText}
                onChange={(e) => {
                  setReconciliationImportText(e.target.value);
                  setReconciliationPreview(null);
                  clearTabStatus('reconciliation');
                }}
              />
            </FieldHelp>
            <div className="grid gap-3">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-semibold text-white">Accepted JSON example</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-gray-300">{reconciliationJsonExample}</pre>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-semibold text-white">Accepted CSV example</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-gray-300">{reconciliationCsvExample}</pre>
              </div>
            </div>
            <FieldHelp
              label="Reconciliation notes"
              description="Save remarks about supplier follow-up, disputes, or why you accepted supplier data or kept the ledger values."
              example="Supplier promised to amend invoice in next GSTR-1 upload."
            >
              <textarea
                className={`${inputClass} min-h-[84px]`}
                placeholder="Notes for this reconciliation run"
                value={reconciliationNotes}
                onChange={(e) => {
                  setReconciliationNotes(e.target.value);
                  clearTabStatus('reconciliation');
                }}
              />
            </FieldHelp>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={() => void previewReconciliation()} disabled={loading}>
                Preview Match
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => void saveReconciliation()} disabled={loading}>
                Save Run
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Preview</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Match results and ITC eligibility</h3>
              </div>
              {reconciliationPreview && (
                <button type="button" className={secondaryButtonClass} onClick={() => void previewReconciliation()} disabled={loading}>
                  Re-run With Decisions
                </button>
              )}
            </div>

            {!reconciliationPreview && <p className="text-sm text-gray-400">Load a preview to classify matched, partial, and missing entries.</p>}

            {reconciliationPreview && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs uppercase tracking-[0.22em] text-gray-400">Imported</p><p className="mt-1 text-lg font-semibold text-white">{Number(reconciliationPreview.importedRowsCount || 0)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs uppercase tracking-[0.22em] text-gray-400">Matched</p><p className="mt-1 text-lg font-semibold text-emerald-300">{Number(reconciliationPreview.summary?.matched || 0)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs uppercase tracking-[0.22em] text-gray-400">Partial</p><p className="mt-1 text-lg font-semibold text-amber-300">{Number(reconciliationPreview.summary?.partialMatch || 0)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs uppercase tracking-[0.22em] text-gray-400">Missing In 2B</p><p className="mt-1 text-lg font-semibold text-rose-300">{Number(reconciliationPreview.summary?.missingInGstr2b || 0)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs uppercase tracking-[0.22em] text-gray-400">Eligible ITC</p><p className="mt-1 text-lg font-semibold text-white">{formatCurrency(Number(reconciliationPreview.eligibleItc?.total || 0))}</p></div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-3">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="px-2 py-1">Supplier GSTIN</th>
                        <th className="px-2 py-1">Invoice</th>
                        <th className="px-2 py-1">Category</th>
                        <th className="px-2 py-1">Ledger Taxable</th>
                        <th className="px-2 py-1">2B Taxable</th>
                        <th className="px-2 py-1">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliationRows.map((row: any) => (
                        <tr key={String(row.key)} className="border-t border-white/10 align-top">
                          <td className="px-2 py-1 text-white">{row.supplierGstin || '-'}</td>
                          <td className="px-2 py-1 text-gray-300">
                            <div>{row.invoiceNumber}</div>
                            <div className="text-xs text-gray-500">{formatDate(row.invoiceDate)}</div>
                          </td>
                          <td className="px-2 py-1 text-gray-300">
                            <div>{titleCase(String(row.category || 'pending'))}</div>
                            {row.recommendedAction && <div className="mt-1 text-xs text-gray-500">{row.recommendedAction}</div>}
                            {describeReconciliationDifferences(row).length > 0 && (
                              <div className="mt-1 text-xs text-amber-200">{describeReconciliationDifferences(row).join(' | ')}</div>
                            )}
                          </td>
                          <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.ledger?.taxableValue || 0))}</td>
                          <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.gst2b?.taxableValue || 0))}</td>
                          <td className="px-2 py-1">
                            <select
                              className={inputClass}
                              value={reconciliationDecisions[row.key] || row.decision || 'pending'}
                              onChange={(e) => {
                                setReconciliationDecisions((prev) => ({ ...prev, [row.key]: e.target.value as ReconciliationDecision }));
                                clearTabStatus('reconciliation');
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="accept_supplier">Accept Supplier</option>
                              <option value="keep_ledger">Keep Ledger</option>
                              <option value="ignore">Ignore</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {!reconciliationRows.length && (
                        <tr>
                          <td colSpan={6} className="px-2 py-3 text-center text-gray-400">No reconciliation rows available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'validation' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">GSTIN Validation</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Check GSTIN format and checksum</h3>
            </div>
            <FieldHelp
              label="GSTIN"
              description="Validate the structure, checksum, state code, and PAN part of a GSTIN before using it in business, customer, or supplier masters."
              example="32ABCDE1234F1Z5"
              required
            >
              <input
                className={inputClass}
                placeholder="Enter GSTIN"
                value={gstinInput}
                onChange={(e) => {
                  setGstinInput(e.target.value.toUpperCase());
                  setGstinValidation(null);
                  clearTabStatus('validation');
                }}
              />
            </FieldHelp>
            <button type="button" className={buttonClass} onClick={() => void validateGstin()} disabled={loading}>
              Validate GSTIN
            </button>
            {gstinValidation && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">{gstinValidation.gstin}</span>
                  <span className={`rounded-full px-2 py-1 text-xs ${gstinValidation.isValid ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
                    {gstinValidation.isValid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-gray-300">
                  <div>State Code: {gstinValidation.stateCode || '-'}</div>
                  <div>PAN: {gstinValidation.pan || '-'}</div>
                  <div>Checksum: {gstinValidation.checksumValid ? 'Pass' : 'Fail'}</div>
                  <div>Source: {titleCase(String(gstinValidation.source || 'local_checksum'))}</div>
                </div>
                <p className="mt-3 text-gray-300">{gstinValidation.message}</p>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">HSN / SAC Validation</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Check code format and tax-rate hint</h3>
            </div>
            <FieldHelp
              label="HSN / SAC code"
              description="Check whether the code length and type are valid and get a GST rate hint based on the available lookup rules."
              example="950699 or 9983"
              required
            >
              <input
                className={inputClass}
                placeholder="Enter HSN or SAC code"
                value={hsnInput}
                onChange={(e) => {
                  setHsnInput(e.target.value);
                  setHsnValidation(null);
                  clearTabStatus('validation');
                }}
              />
            </FieldHelp>
            <FieldHelp
              label="Turnover band"
              description="This affects the minimum HSN digits expected by the validation rules."
              example="Above 5 crore usually expects 6-digit HSN."
            >
              <select
                className={inputClass}
                value={turnoverBand}
                onChange={(e) => {
                  setTurnoverBand(e.target.value as 'up_to_5cr' | 'above_5cr');
                  setHsnValidation(null);
                  clearTabStatus('validation');
                }}
              >
                <option value="up_to_5cr">Turnover up to 5 crore</option>
                <option value="above_5cr">Turnover above 5 crore</option>
              </select>
            </FieldHelp>
            <button type="button" className={buttonClass} onClick={() => void validateHsn()} disabled={loading}>
              Validate HSN / SAC
            </button>
            {hsnValidation && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">{hsnValidation.normalizedCode || '-'}</span>
                  <span className={`rounded-full px-2 py-1 text-xs ${hsnValidation.isValid ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
                    {hsnValidation.isValid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-gray-300">
                  <div>Type: {String(hsnValidation.codeType || '-').toUpperCase()}</div>
                  <div>Length: {Number(hsnValidation.length || 0)}</div>
                  <div>Minimum digits: {Number(hsnValidation.requiresMinDigits || 0)}</div>
                  <div>Suggested rate: {Number(hsnValidation.suggestedRate || 0)}%</div>
                </div>
                <p className="mt-3 text-gray-300">{hsnValidation.message}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void runTabTask('history', async () => {
                await refreshHistory();
                setTabMessage('history', 'GST history refreshed.');
              })}
              disabled={loading}
            >
              Refresh GST History
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Saved Returns</h3>
              <span className="text-sm text-gray-400">{returnHistory.length} row(s)</span>
            </div>
            <p className="mb-3 text-sm text-gray-400">
              This table tracks return drafts and local status markers created inside the application. It is helpful for internal follow-up even though the final GST filing happens externally.
            </p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Period</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Reference</th>
                  <th className="px-2 py-1">Generated</th>
                  <th className="px-2 py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {returnHistory.map((row) => (
                  <tr key={String(row._id)} className="border-t border-white/10 align-top">
                    <td className="px-2 py-1 text-white">{row.returnType}</td>
                    <td className="px-2 py-1 text-gray-300">{row.periodKey || row.financialYear || '-'}</td>
                    <td className="px-2 py-1 text-gray-300">{titleCase(String(row.status || 'draft'))}</td>
                    <td className="px-2 py-1 text-gray-300">{row.filingReference || row.filingKey || '-'}</td>
                    <td className="px-2 py-1 text-gray-300">{formatDateTime(row.generatedAt)}</td>
                    <td className="px-2 py-1">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="text-xs text-cyan-200 hover:text-cyan-100" onClick={() => void submitReturnRecord(String(row._id))}>Submit</button>
                        <button type="button" className="text-xs text-emerald-200 hover:text-emerald-100" onClick={() => void updateReturnStatus(String(row._id), 'filed')}>Filed</button>
                        <button type="button" className="text-xs text-indigo-200 hover:text-indigo-100" onClick={() => void updateReturnStatus(String(row._id), 'processed')}>Processed</button>
                        <button type="button" className="text-xs text-rose-200 hover:text-rose-100" onClick={() => void updateReturnStatus(String(row._id), 'rejected')}>Rejected</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!returnHistory.length && (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-gray-400">No GST return history saved yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Reconciliation Runs</h3>
              <span className="text-sm text-gray-400">{reconciliationHistory.length} row(s)</span>
            </div>
            <p className="mb-3 text-sm text-gray-400">
              Each saved run captures the imported row count, match summary, and eligible ITC snapshot at the time the reconciliation was saved.
            </p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="px-2 py-1">Period</th>
                  <th className="px-2 py-1">Imported</th>
                  <th className="px-2 py-1">Eligible ITC</th>
                  <th className="px-2 py-1">Created</th>
                  <th className="px-2 py-1">Summary</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationHistory.map((row) => (
                  <tr key={String(row._id)} className="border-t border-white/10">
                    <td className="px-2 py-1 text-white">{row.periodKey}</td>
                    <td className="px-2 py-1 text-gray-300">{Number(row.importedRowsCount || 0)}</td>
                    <td className="px-2 py-1 text-gray-300">{formatCurrency(Number(row.eligibleItc?.total || 0))}</td>
                    <td className="px-2 py-1 text-gray-300">{formatDateTime(row.createdAt)}</td>
                    <td className="px-2 py-1 text-gray-300">
                      {[
                        `Matched ${Number(row.summary?.matched || 0)}`,
                        `Partial ${Number(row.summary?.partialMatch || 0)}`,
                        `Missing 2B ${Number(row.summary?.missingInGstr2b || 0)}`,
                        `Missing ledger ${Number(row.summary?.missingInLedger || 0)}`,
                      ].join(' | ')}
                    </td>
                  </tr>
                ))}
                {!reconciliationHistory.length && (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-gray-400">No reconciliation runs saved yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">GST Audit Trail</h3>
              <span className="text-sm text-gray-400">{auditRows.length} row(s)</span>
            </div>
            <p className="mb-3 text-sm text-gray-400">
              Audit rows show who performed GST actions in the app and when they happened, which is useful for review and troubleshooting.
            </p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="px-2 py-1">When</th>
                  <th className="px-2 py-1">Action</th>
                  <th className="px-2 py-1">Reference</th>
                  <th className="px-2 py-1">IP</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={String(row._id)} className="border-t border-white/10">
                    <td className="px-2 py-1 text-gray-300">{formatDateTime(row.createdAt)}</td>
                    <td className="px-2 py-1 text-white">{titleCase(String(row.action || 'activity'))}</td>
                    <td className="px-2 py-1 text-gray-300">{row.referenceNo || row.entityType || '-'}</td>
                    <td className="px-2 py-1 text-gray-300">{row.ipAddress || '-'}</td>
                  </tr>
                ))}
                {!auditRows.length && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-gray-400">No GST audit entries available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
