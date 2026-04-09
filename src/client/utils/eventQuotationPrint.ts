import { formatCurrency } from '../config';
import { GeneralSettings, resolveGeneralSettingsAssetUrl } from './generalSettings';

export interface PrintableEventQuotationOccurrence {
  startTime: string;
  endTime: string;
}

export interface PrintableEventQuotationItem {
  description: string;
  quantity: number;
  unitLabel?: string;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
}

export interface PrintableEventQuotation {
  quoteNumber: string;
  quoteStatus: string;
  validUntil?: string;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilities: Array<{ name: string; location?: string; hourlyRate?: number }>;
  occurrences: PrintableEventQuotationOccurrence[];
  items: PrintableEventQuotationItem[];
  subtotal: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  termsAndConditions: string;
  notes?: string;
  linkedBookingNumber?: string;
}

const escapeHtml = (value: string): string =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const businessAddress = (settings: GeneralSettings) => {
  const b = settings.business;
  return [b.addressLine1, b.addressLine2, `${b.city} ${b.state} ${b.pincode}`.trim(), b.country]
    .filter(Boolean)
    .join(', ');
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');

const formatDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '-';

const discountLabel = (quotation: PrintableEventQuotation) =>
  quotation.discountType === 'percentage'
    ? `Discount (${Number(quotation.discountValue || 0).toFixed(2)}%)`
    : 'Discount (Fixed)';

const sanitizeFileName = (value: string) =>
  String(value || 'quotation')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export const buildEventQuotationHtml = (
  quotation: PrintableEventQuotation,
  settings: GeneralSettings,
  options?: { forExcel?: boolean }
): string => {
  const businessTitle = settings.business.tradeName || settings.business.legalName || 'Sarva';
  const legalName = settings.business.legalName || businessTitle;
  const logoUrl = resolveGeneralSettingsAssetUrl(
    settings.business.reportLogoDataUrl || settings.business.invoiceLogoDataUrl || ''
  );
  const terms = String(quotation.termsAndConditions || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const noteLines = String(quotation.notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const facilityRows = quotation.facilities
    .map(
      (facility, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(facility.name || '-')}</td>
          <td>${escapeHtml(facility.location || '-')}</td>
          <td class="num">${formatCurrency(Number(facility.hourlyRate || 0))}</td>
        </tr>
      `
    )
    .join('');
  const occurrenceRows = quotation.occurrences
    .map(
      (occurrence, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(formatDate(occurrence.startTime))}</td>
          <td>${escapeHtml(`${formatDateTime(occurrence.startTime)} - ${formatDateTime(occurrence.endTime)}`)}</td>
        </tr>
      `
    )
    .join('');
  const itemRows = quotation.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.description || '-')}</td>
          <td class="num">${Number(item.quantity || 0).toFixed(2)}</td>
          <td>${escapeHtml(item.unitLabel || 'Unit')}</td>
          <td class="num">${formatCurrency(Number(item.unitPrice || 0))}</td>
          <td class="num">${formatCurrency(Number(item.lineTotal || 0))}</td>
        </tr>
      `
    )
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Event Quotation ${escapeHtml(quotation.quoteNumber)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Segoe UI", Arial, sans-serif; background: #eef3fa; color: #172033; margin: ${options?.forExcel ? '0' : '18px'}; }
    .sheet { max-width: 1120px; margin: 0 auto; background: #fff; border: 1px solid #d9e3f1; border-radius: 14px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #173b68, #2a5c96); color: #fff; padding: 18px 22px; display: flex; justify-content: space-between; gap: 18px; }
    .brand { display: flex; gap: 14px; align-items: flex-start; }
    .logo-box { width: 84px; height: 84px; border-radius: 12px; background: rgba(255,255,255,0.06); overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .logo-box img { width: 100%; height: 100%; object-fit: contain; }
    .header h1 { margin: 0; font-size: 28px; }
    .header .subtitle { margin-top: 6px; font-size: 13px; color: #dbe9fb; }
    .doc-meta { text-align: right; min-width: 220px; }
    .doc-meta .badge { display: inline-block; margin-bottom: 10px; padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,0.14); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .body { padding: 20px 22px 24px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .card { border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #f9fbff; }
    .card h3 { margin: 0; padding: 10px 12px; font-size: 14px; background: #eef4fc; color: #21324b; }
    .card .content { padding: 10px 12px; font-size: 13px; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px dashed #dbe4f0; }
    .row:last-child { border-bottom: 0; }
    .row strong { color: #51637f; font-weight: 600; }
    .table-card { border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; margin-bottom: 14px; }
    .table-title { padding: 10px 12px; font-size: 14px; font-weight: 700; color: #21324b; background: #eef4fc; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #274f7d; color: #fff; font-size: 12px; padding: 9px 10px; text-align: left; }
    td { border-top: 1px solid #dbe4f0; padding: 8px 10px; font-size: 12px; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f9fbff; }
    td.num { text-align: right; white-space: nowrap; }
    .summary { margin-left: auto; width: 360px; }
    .summary td { font-size: 12px; }
    .summary td:first-child { font-weight: 600; color: #51637f; }
    .summary .grand td { background: #e7f0fb; font-size: 14px; font-weight: 700; color: #173b68; }
    .terms, .notes { border: 1px solid #dbe4f0; border-radius: 12px; padding: 12px 14px; background: #f9fbff; margin-top: 14px; }
    .terms h3, .notes h3 { margin: 0 0 8px; font-size: 14px; color: #21324b; }
    .terms ol { margin: 0; padding-left: 18px; }
    .terms li { margin-bottom: 6px; font-size: 12px; }
    .notes p { margin: 0 0 6px; font-size: 12px; }
    .footer { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #c8d3e1; color: #5a6982; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        ${logoUrl ? `<div class="logo-box"><img src="${logoUrl}" alt="Business Logo" /></div>` : ''}
        <div>
          <h1>Event Quotation</h1>
          <div class="subtitle">${escapeHtml(businessTitle)}</div>
          <div class="subtitle">${escapeHtml(legalName)}</div>
          <div class="subtitle">${escapeHtml(businessAddress(settings) || '-')}</div>
          <div class="subtitle">${escapeHtml(settings.business.phone || '-')} | ${escapeHtml(settings.business.email || '-')}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="badge">${escapeHtml(quotation.quoteStatus || 'Draft')}</div>
        <div><strong>Quote No:</strong> ${escapeHtml(quotation.quoteNumber)}</div>
        <div><strong>Valid Until:</strong> ${escapeHtml(formatDate(quotation.validUntil))}</div>
        <div><strong>Linked Booking:</strong> ${escapeHtml(quotation.linkedBookingNumber || '-')}</div>
      </div>
    </div>

    <div class="body">
      <div class="grid">
        <div class="card">
          <h3>Event Details</h3>
          <div class="content">
            <div class="row"><strong>Event</strong><span>${escapeHtml(quotation.eventName || '-')}</span></div>
            <div class="row"><strong>Organizer</strong><span>${escapeHtml(quotation.organizerName || '-')}</span></div>
            <div class="row"><strong>Organization</strong><span>${escapeHtml(quotation.organizationName || '-')}</span></div>
          </div>
        </div>
        <div class="card">
          <h3>Contact Details</h3>
          <div class="content">
            <div class="row"><strong>Phone</strong><span>${escapeHtml(quotation.contactPhone || '-')}</span></div>
            <div class="row"><strong>Email</strong><span>${escapeHtml(quotation.contactEmail || '-')}</span></div>
            <div class="row"><strong>Facilities</strong><span>${quotation.facilities.length}</span></div>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-title">Facilities</div>
        <table>
          <thead>
            <tr><th>#</th><th>Facility</th><th>Location</th><th>Default Rate / Hr</th></tr>
          </thead>
          <tbody>${facilityRows || '<tr><td colspan="4">No facilities selected.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="table-card">
        <div class="table-title">Requested Schedule</div>
        <table>
          <thead>
            <tr><th>#</th><th>Date</th><th>Schedule</th></tr>
          </thead>
          <tbody>${occurrenceRows || '<tr><td colspan="3">No schedule added.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="table-card">
        <div class="table-title">Quotation Items</div>
        <table>
          <thead>
            <tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>${itemRows || '<tr><td colspan="6">No items added.</td></tr>'}</tbody>
        </table>
      </div>

      <table class="summary">
        <tbody>
          <tr><td>Subtotal</td><td class="num">${formatCurrency(Number(quotation.subtotal || 0))}</td></tr>
          <tr><td>${escapeHtml(discountLabel(quotation))}</td><td class="num">${formatCurrency(Number(quotation.discountAmount || 0))}</td></tr>
          <tr><td>Taxable Value</td><td class="num">${formatCurrency(Number(quotation.taxableAmount || 0))}</td></tr>
          <tr><td>GST (${Number(quotation.gstRate || 0).toFixed(2)}%)</td><td class="num">${formatCurrency(Number(quotation.gstAmount || 0))}</td></tr>
          <tr class="grand"><td>Grand Total</td><td class="num">${formatCurrency(Number(quotation.totalAmount || 0))}</td></tr>
        </tbody>
      </table>

      <div class="terms">
        <h3>Terms & Conditions</h3>
        <ol>
          ${terms.length ? terms.map((term) => `<li>${escapeHtml(term)}</li>`).join('') : '<li>No terms added.</li>'}
        </ol>
      </div>

      ${noteLines.length ? `
        <div class="notes">
          <h3>Additional Notes</h3>
          ${noteLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
        </div>
      ` : ''}

      <div class="footer">
        This is a computer-generated quotation prepared from the Sarva event management workflow.
      </div>
    </div>
  </div>
</body>
</html>`;
};

const openPrintWindow = (html: string): boolean => {
  const popup = window.open('', '_blank', 'width=1000,height=720');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  window.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 250);
  return true;
};

const downloadBlob = (content: Blob, fileName: string) => {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const printEventQuotation = (quotation: PrintableEventQuotation, settings: GeneralSettings): boolean =>
  openPrintWindow(buildEventQuotationHtml(quotation, settings));

export const downloadEventQuotationWord = (quotation: PrintableEventQuotation, settings: GeneralSettings): void => {
  const html = buildEventQuotationHtml(quotation, settings);
  const fileName = `${sanitizeFileName(quotation.quoteNumber || quotation.eventName)}.doc`;
  downloadBlob(new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), fileName);
};

export const downloadEventQuotationExcel = (quotation: PrintableEventQuotation, settings: GeneralSettings): void => {
  const html = buildEventQuotationHtml(quotation, settings, { forExcel: true });
  const fileName = `${sanitizeFileName(quotation.quoteNumber || quotation.eventName)}.xls`;
  downloadBlob(new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), fileName);
};
