import { formatCurrency } from '../config';
import { GeneralSettings, PrintProfile, resolveGeneralSettingsAssetUrl } from './generalSettings';

export interface InvoiceLineItem {
  productName: string;
  sku?: string;
  hsnCode?: string;
  batchNo?: string;
  expiryDate?: string;
  serialNumbers?: string[];
  variantSize?: string;
  variantColor?: string;
  quantity: number;
  unitPrice: number;
  gstRate?: number;
  gstAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  lineTotal?: number;
}

export interface PrintableSale {
  saleNumber?: string;
  invoiceNumber?: string;
  createdAt?: string;
  isGstBill?: boolean;
  paymentMethod?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  discountAmount?: number;
  items: InvoiceLineItem[];
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const profileStyles = (profile: PrintProfile) => {
  if (profile === 'thermal58') {
    return {
      page: '58mm auto',
      width: '58mm',
      fontSize: '10px',
    };
  }

  if (profile === 'thermal80') {
    return {
      page: '80mm auto',
      width: '76mm',
      fontSize: '12px',
    };
  }

  return {
    page: 'A4',
    width: '100%',
    fontSize: '13px',
  };
};

const businessAddress = (settings: GeneralSettings) => {
  const b = settings.business;
  return [b.addressLine1, b.addressLine2, `${b.city} ${b.state} ${b.pincode}`.trim(), b.country]
    .filter(Boolean)
    .join(', ');
};

const resolveInvoiceLogoUrl = (settings: GeneralSettings): string =>
  (() => {
    const resolved = resolveGeneralSettingsAssetUrl(
      settings.business.invoiceLogoDataUrl || settings.business.reportLogoDataUrl || ''
    );
    if (!resolved) return '';
    if (resolved.startsWith('data:') || /^https?:\/\//i.test(resolved)) return resolved;
    if (typeof window !== 'undefined') {
      return new URL(resolved, window.location.origin).toString();
    }
    return resolved;
  })();

const buildThermal58Html = (sale: PrintableSale, settings: GeneralSettings): string => {
  const invoiceDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const invoiceNumber = sale.invoiceNumber || sale.saleNumber || '-';
  const isGstBill = sale.isGstBill !== false;
  const businessTitle = settings.business.tradeName || settings.business.legalName || 'Business';
  const invoiceTitle = isGstBill ? (settings.invoice.title || 'TAX INVOICE') : 'INVOICE';
  const gstLine = settings.invoice.showBusinessGstin && settings.business.gstin && isGstBill
    ? `<div class="line"><span>GSTIN</span><span>${escapeHtml(settings.business.gstin)}</span></div>`
    : '';
  const invoiceLogoUrl = resolveInvoiceLogoUrl(settings);
  const logo = invoiceLogoUrl
    ? `<div class="logo-wrap"><img src="${invoiceLogoUrl}" alt="Logo" class="logo" /></div>`
    : '';
  const notes = sale.notes || settings.invoice.terms || '';
  const footerNote = settings.invoice.footerNote || 'Thank you for your business.';

  const itemRows = sale.items
      .map((item, idx) => {
        const lineTotal = item.lineTotal ?? item.quantity * item.unitPrice + (isGstBill ? (item.gstAmount || 0) : 0);
        const metaParts = [
          item.sku ? `SKU: ${escapeHtml(item.sku)}` : '',
          item.variantSize || item.variantColor
            ? `Variant: ${escapeHtml([item.variantSize, item.variantColor].filter(Boolean).join(' / '))}`
            : '',
          item.batchNo ? `Batch: ${escapeHtml(item.batchNo)}` : '',
          item.expiryDate ? `Expiry: ${escapeHtml(new Date(item.expiryDate).toLocaleDateString('en-IN'))}` : '',
          Array.isArray(item.serialNumbers) && item.serialNumbers.length
            ? `Serials: ${escapeHtml(item.serialNumbers.join(', '))}`
            : '',
        ].filter(Boolean);
        const sku = metaParts.map((part) => `<div class="sub">${part}</div>`).join('');
        return `
          <tr>
            <td class="item">${idx + 1}. ${escapeHtml(item.productName)}${sku}</td>
          <td class="num">${Number(item.quantity || 0)}</td>
          <td class="num">${formatCurrency(Number(item.unitPrice || 0))}</td>
          <td class="num">${formatCurrency(Number(lineTotal || 0))}</td>
        </tr>
      `;
    })
    .join('');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/" />
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { width: 58mm; margin: 0; padding: 0; background: #fff; color: #000; font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; }
    .receipt { width: 58mm; padding: 1.6mm; }
    .logo-wrap { text-align: center; margin-bottom: 1mm; }
    .logo { max-width: 24mm; max-height: 10mm; object-fit: contain; }
    .center { text-align: center; }
    .title { font-size: 12px; font-weight: 700; margin: 0; line-height: 1.2; }
    .subtitle { margin: 0.2mm 0 0; font-size: 8px; }
    .badge { margin-top: 0.8mm; font-size: 8px; font-weight: 700; }
    .biz { font-weight: 700; font-size: 10px; margin-top: 1mm; }
    .addr { margin-top: 0.6mm; word-break: break-word; }
    .line { display: flex; justify-content: space-between; gap: 1.2mm; margin-top: 0.5mm; }
    .divider { border-top: 1px dashed #000; margin: 1.2mm 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 0.7mm 0.5mm; vertical-align: top; }
    th { font-size: 8px; font-weight: 700; }
    .item { width: 52%; word-break: break-word; }
    .num { width: 16%; text-align: right; white-space: nowrap; }
    .sub { font-size: 7px; margin-top: 0.4mm; color: #333; }
    .totals td { border: 1px solid #000; padding: 0.8mm 0.6mm; }
    .totals .label { width: 58%; }
    .totals .amount { text-align: right; white-space: nowrap; }
    .grand td { font-weight: 700; }
    .note { margin-top: 1mm; word-break: break-word; }
    .footer { margin-top: 1.4mm; border-top: 1px dashed #000; padding-top: 1mm; font-size: 8px; text-align: center; }
  </style>
</head>
<body>
  <div class="receipt">
    ${logo}
    <p class="title center">${escapeHtml(invoiceTitle)}</p>
    <p class="subtitle center">${escapeHtml(isGstBill ? (settings.invoice.subtitle || '') : 'Bill of Supply')}</p>
    <p class="badge center">${isGstBill ? 'GST BILL' : 'NON-GST BILL'}</p>
    <p class="biz center">${escapeHtml(businessTitle)}</p>
    <p class="addr center">${escapeHtml(businessAddress(settings) || '-')}</p>
    <div class="line"><span>Phone</span><span>${escapeHtml(settings.business.phone || '-')}</span></div>
    ${gstLine}
    <div class="divider"></div>
    <div class="line"><span>Invoice</span><span>${escapeHtml(invoiceNumber)}</span></div>
    <div class="line"><span>Date</span><span>${invoiceDate.toLocaleDateString('en-IN')} ${invoiceDate.toLocaleTimeString('en-IN')}</span></div>
    <div class="line"><span>Payment</span><span>${escapeHtml((sale.paymentMethod || '-').toUpperCase())}</span></div>
    ${settings.invoice.showCustomerDetails ? `<div class="line"><span>Customer</span><span>${escapeHtml(sale.customerName || 'Walk-in')}</span></div>` : ''}
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th class="item">Item</th>
          <th class="num">Qty</th>
          <th class="num">Rate</th>
          <th class="num">Amt</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <table class="totals" style="margin-top: 1mm;">
      <tr><td class="label">Subtotal</td><td class="amount">${formatCurrency(sale.subtotal || 0)}</td></tr>
      ${isGstBill ? `<tr><td class="label">Total GST</td><td class="amount">${formatCurrency(sale.totalGst || 0)}</td></tr>` : ''}
      <tr><td class="label">Discount</td><td class="amount">${formatCurrency(sale.discountAmount || 0)}</td></tr>
      <tr class="grand"><td class="label">Grand Total</td><td class="amount">${formatCurrency(sale.totalAmount || 0)}</td></tr>
    </table>
    ${notes ? `<p class="note"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
    <div class="footer">
      <div>${escapeHtml(footerNote)}</div>
      <div>This is a computer-generated invoice.</div>
    </div>
  </div>
</body>
</html>`;
};

export const buildInvoiceHtml = (sale: PrintableSale, settings: GeneralSettings): string => {
  if (settings.printing.profile === 'thermal58') {
    return buildThermal58Html(sale, settings);
  }

  const css = profileStyles(settings.printing.profile);
  const invoiceDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const invoiceNumber = sale.invoiceNumber || sale.saleNumber || '-';
  const isGstBill = sale.isGstBill !== false;
  const showGstBreakup = settings.invoice.showGstBreakup && isGstBill;
  const invoiceTitle = isGstBill ? (settings.invoice.title || 'TAX INVOICE') : 'INVOICE';
  const invoiceSubtitle = isGstBill ? settings.invoice.subtitle : 'Bill of Supply (Non-GST)';

  const rows = sale.items
      .map((item, idx) => {
        const lineTotal = item.lineTotal ?? item.quantity * item.unitPrice + (isGstBill ? (item.gstAmount || 0) : 0);
        const hsnCol = settings.invoice.showHsnCode ? `<td>${escapeHtml(item.hsnCode || '-')}</td>` : '';
        const gstCol = showGstBreakup
          ? `<td class="num">${item.gstRate ?? 0}%</td><td class="num">${formatCurrency(item.gstAmount || 0)}</td>`
          : '';
        const productLabel = [
          escapeHtml(item.productName),
          item.variantSize || item.variantColor
            ? `<div style="font-size:11px;color:#475569">Variant: ${escapeHtml([item.variantSize, item.variantColor].filter(Boolean).join(' / '))}</div>`
            : '',
          item.batchNo ? `<div style="font-size:11px;color:#475569">Batch: ${escapeHtml(item.batchNo)}</div>` : '',
          Array.isArray(item.serialNumbers) && item.serialNumbers.length
            ? `<div style="font-size:11px;color:#475569">Serials: ${escapeHtml(item.serialNumbers.join(', '))}</div>`
            : '',
        ].filter(Boolean).join('');

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${productLabel}</td>
            <td>${escapeHtml(item.sku || '-')}</td>
            ${hsnCol}
          <td class="num">${item.quantity}</td>
          <td class="num">${formatCurrency(item.unitPrice)}</td>
          ${gstCol}
          <td class="num">${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const gstColumns = showGstBreakup
    ? '<th>GST %</th><th>GST Amt</th>'
    : '';

  const hsnHeader = settings.invoice.showHsnCode ? '<th>HSN</th>' : '';

  const customerBlock = settings.invoice.showCustomerDetails
    ? `
      <div class="meta-group customer-group">
        <h4>Customer Details</h4>
        <p><strong>Name:</strong> ${escapeHtml(sale.customerName || '-')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(sale.customerPhone || '-')}</p>
        ${sale.customerEmail ? `<p><strong>Email:</strong> ${escapeHtml(sale.customerEmail)}</p>` : ''}
      </div>
    `
    : '';

  const gstLine = settings.invoice.showBusinessGstin && settings.business.gstin && isGstBill
    ? `<p><strong>GSTIN:</strong> ${escapeHtml(settings.business.gstin)}</p>`
    : '';

  const invoiceLogoUrl = resolveInvoiceLogoUrl(settings);
  const invoiceLogo = invoiceLogoUrl
    ? `<img src="${escapeHtml(invoiceLogoUrl)}" alt="Business Logo" class="logo-img" />`
    : '';
  const businessName = settings.business.tradeName || settings.business.legalName || 'Business';
  const legalName = settings.business.legalName && settings.business.legalName !== businessName
    ? settings.business.legalName
    : '';
  const contactLine = [
    settings.business.phone ? `Phone: ${settings.business.phone}` : '',
    settings.business.email ? `Email: ${settings.business.email}` : '',
  ].filter(Boolean).join(' | ');
  const taxLine = [
    settings.business.gstin ? `GSTIN: ${settings.business.gstin}` : '',
    settings.business.pan ? `PAN: ${settings.business.pan}` : '',
  ].filter(Boolean).join(' | ') || 'GST / PAN details can be configured in Settings';
  const addressLine = businessAddress(settings) || 'Business address can be configured in Settings';

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/" />
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    @page { size: ${css.page}; margin: 12mm 12mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: ${css.fontSize}; color: #111; margin: 0; background: #fff; }
    .container { width: ${css.width}; margin: 0 auto; padding: 0 1mm 4mm; }
    .top { display: grid; grid-template-columns: minmax(0, 1.55fr) 250px; gap: 18px; align-items: start; border-bottom: 2px solid #0f172a; padding: 8px 0 14px; margin-bottom: 14px; }
    .brandline { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .brand-head { display: grid; grid-template-columns: ${invoiceLogo ? '96px minmax(0, 1fr)' : 'minmax(0, 1fr)'}; gap: 14px; align-items: center; }
    .logo-box { width: 96px; min-width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: transparent; padding: 0; }
    .logo-img { width: 100%; height: 100%; object-fit: contain; }
    .brandcopy { min-width: 0; }
    .eyebrow { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #475569; }
    .subtitle { margin: 2px 0 0; color: #334155; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
    h1 { margin: 4px 0 0; font-size: 22px; letter-spacing: 0.4px; color: #0f172a; }
    h2 { margin: 10px 0 0; font-size: 18px; }
    .legal-name { color: #475569; margin-top: 3px; }
    h3 { margin: 0 0 6px; font-size: 14px; }
    h4 { margin: 0 0 4px; font-size: 13px; }
    p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #94a3b8; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; color: #0f172a; font-weight: 700; }
    .num { text-align: right; white-space: nowrap; }
    .brand-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; padding: 2px 0 0; }
    .brand-meta-card { min-width: 0; }
    .brand-meta-label { display: block; margin-bottom: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; }
    .brand-meta-value { font-size: 12px; line-height: 1.45; color: #0f172a; word-break: break-word; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .meta-group { padding: 0; min-height: 0; }
    .invoice-info { padding: 0; }
    .invoice-info p { margin: 5px 0; }
    .notes-copy { white-space: pre-wrap; line-height: 1.6; color: #334155; }
    .totals { margin-top: 12px; margin-left: auto; width: 332px; }
    .totals table td { border: 1px solid #94a3b8; }
    .totals .grand td { background: #e2e8f0; }
    .foot { margin-top: 18px; border-top: 1px dashed #888; padding-top: 10px; }
    .center { text-align: center; }
    .invoice-badge { display: inline-block; margin-top: 2px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${isGstBill ? '#dbeafe' : '#fef3c7'}; color: ${isGstBill ? '#1e3a8a' : '#92400e'}; }
    .section-chip { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #eef2ff; color: #3730a3; }
    @media print {
      .logo-box, .brand-meta, .meta-group, .invoice-info { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="top">
      <div class="brandline">
        <div class="brand-head">
          ${invoiceLogo ? `<div class="logo-box">${invoiceLogo}</div>` : ''}
          <div class="brandcopy">
            <p class="eyebrow">${escapeHtml(isGstBill ? 'GST Invoice' : 'Sales Invoice')}</p>
            <h1>${escapeHtml(invoiceTitle)}</h1>
            <p class="subtitle">${escapeHtml(invoiceSubtitle || '')}</p>
            <div class="badge-row">
              <span class="invoice-badge">${isGstBill ? 'GST BILL' : 'NON-GST BILL'}</span>
              <span class="section-chip">${escapeHtml((sale.paymentMethod || 'cash').toUpperCase())}</span>
            </div>
            <h2>${escapeHtml(businessName)}</h2>
            ${legalName ? `<p class="legal-name">${escapeHtml(legalName)}</p>` : ''}
          </div>
        </div>
        <div class="brand-meta">
          <div class="brand-meta-card">
            <span class="brand-meta-label">Tax Details</span>
            <div class="brand-meta-value">${escapeHtml(taxLine)}</div>
          </div>
          <div class="brand-meta-card">
            <span class="brand-meta-label">Contact</span>
            <div class="brand-meta-value">${escapeHtml(contactLine || 'Phone and email can be configured in Settings')}</div>
          </div>
          <div class="brand-meta-card">
            <span class="brand-meta-label">Address</span>
            <div class="brand-meta-value">${escapeHtml(addressLine)}</div>
          </div>
          <div class="brand-meta-card">
            <span class="brand-meta-label">Customer</span>
            <div class="brand-meta-value">${escapeHtml(sale.customerName || 'Walk-in Customer')}</div>
          </div>
        </div>
      </div>
      <div class="invoice-info">
        <h3>Invoice Info</h3>
        <p><strong>Invoice No:</strong> ${escapeHtml(invoiceNumber)}</p>
        <p><strong>Date:</strong> ${invoiceDate.toLocaleDateString('en-IN')} ${invoiceDate.toLocaleTimeString('en-IN')}</p>
        <p><strong>Payment:</strong> ${escapeHtml((sale.paymentMethod || '-').toUpperCase())}</p>
      </div>
    </div>

    <div class="meta">
      ${customerBlock}
      <div class="meta-group notes-group">
        <h4>Invoice Notes</h4>
        <p class="notes-copy">${escapeHtml(sale.notes || settings.invoice.terms || '-')}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th>SKU</th>
          ${hsnHeader}
          <th>Qty</th>
          <th>Rate</th>
          ${gstColumns}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Subtotal</td><td class="num">${formatCurrency(sale.subtotal || 0)}</td></tr>
        ${isGstBill ? `<tr><td>Total GST</td><td class="num">${formatCurrency(sale.totalGst || 0)}</td></tr>` : ''}
        <tr><td>Discount</td><td class="num">${formatCurrency(sale.discountAmount || 0)}</td></tr>
        <tr class="grand"><td><strong>Grand Total</strong></td><td class="num"><strong>${formatCurrency(sale.totalAmount || 0)}</strong></td></tr>
      </table>
    </div>

    <div class="foot">
      <p>${escapeHtml(settings.invoice.footerNote)}</p>
      <p class="center">This is a computer-generated invoice.</p>
    </div>
  </div>
</body>
</html>`;
};

export const printInvoice = (sale: PrintableSale, settings: GeneralSettings): boolean => {
  const invoiceHtml = buildInvoiceHtml(sale, settings);
  const popupWidth = settings.printing.profile === 'thermal58'
    ? 420
    : settings.printing.profile === 'thermal80'
      ? 520
      : 900;
  const printWindow = window.open('', '_blank', `width=${popupWidth},height=700`);

  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(invoiceHtml);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);

  return true;
};
