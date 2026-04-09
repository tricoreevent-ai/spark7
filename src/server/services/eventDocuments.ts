import { jsPDF } from 'jspdf';
import { AppSetting } from '../models/AppSetting.js';

const GENERAL_SETTINGS_KEYS = ['general_settings', 'pos_general_settings_v1', 'pos_settings'];
const PAGE_MARGIN = 12;
const PAGE_TOP = 14;
const PAGE_BOTTOM = 283;
const CONTENT_WIDTH = 210 - PAGE_MARGIN * 2;
const CARD_GAP = 6;

const palette = {
  titleBg: [30, 78, 130] as const,
  titleText: [255, 255, 255] as const,
  subtitleText: [235, 241, 249] as const,
  bodyText: [24, 37, 59] as const,
  mutedText: [88, 102, 126] as const,
  cardBg: [248, 250, 252] as const,
  cardBorder: [214, 223, 235] as const,
  cardTitle: [49, 65, 88] as const,
  tableHeadBg: [39, 79, 125] as const,
  tableHeadText: [255, 255, 255] as const,
  rowOdd: [255, 255, 255] as const,
  rowEven: [246, 249, 253] as const,
  rowBorder: [220, 228, 240] as const,
  okFill: [220, 252, 231] as const,
  okText: [22, 101, 52] as const,
  warnFill: [254, 243, 199] as const,
  warnText: [146, 64, 14] as const,
  dangerFill: [254, 226, 226] as const,
  dangerText: [153, 27, 27] as const,
  neutralFill: [219, 234, 254] as const,
  neutralText: [30, 64, 175] as const,
};

type EventOccurrenceDocumentRow = {
  startTime: Date | string;
  endTime: Date | string;
};

type EventPaymentDocumentRow = {
  receiptNumber: string;
  amount: number;
  paidAt: Date | string;
  paymentMethod?: string;
  remarks?: string;
};

type InfoRow = {
  label: string;
  value: string;
};

type TableColumn = {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
};

export type EventConfirmationDocumentInput = {
  receiptNumber: string;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilities: Array<{ name: string; location?: string }>;
  occurrences: EventOccurrenceDocumentRow[];
  status: string;
  paymentStatus: string;
  totalAmount: number;
  advanceAmount: number;
  paidAmount: number;
  balanceAmount: number;
  remarks?: string;
  generatedAt: Date | string;
};

export type EventPaymentReceiptDocumentInput = {
  receiptNumber: string;
  bookingNumber: string;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilities: Array<{ name: string; location?: string }>;
  occurrences: EventOccurrenceDocumentRow[];
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: string;
  payment: EventPaymentDocumentRow;
  generatedAt: Date | string;
};

export type EventQuotationDocumentInput = {
  quoteNumber: string;
  quoteStatus: string;
  validUntil?: Date | string;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilities: Array<{ name: string; location?: string; hourlyRate?: number }>;
  occurrences: EventOccurrenceDocumentRow[];
  items: Array<{
    description: string;
    quantity: number;
    unitLabel?: string;
    unitPrice: number;
    lineTotal: number;
    notes?: string;
  }>;
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
  generatedAt: Date | string;
};

type BusinessProfile = {
  legalName: string;
  tradeName: string;
  gstin: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  invoiceLogoDataUrl: string;
  reportLogoDataUrl: string;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const toDate = (value: Date | string): Date => {
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? new Date() : next;
};

const formatDateTime = (value: Date | string): string =>
  toDate(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const formatDate = (value: Date | string): string =>
  toDate(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const formatTime = (value: Date | string): string =>
  toDate(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const formatCurrency = (value: number): string => `INR ${round2(Number(value || 0)).toFixed(2)}`;

const sanitizeFileNamePart = (value: string): string => {
  return String(value || 'document')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'document';
};

const safeValue = (value: string | undefined | null, fallback = '-'): string => {
  const next = String(value || '').trim();
  return next || fallback;
};

const imageFormatFromDataUrl = (value: string): 'PNG' | 'JPEG' | 'WEBP' | null => {
  const match = String(value || '').match(/^data:image\/(png|jpe?g|webp);/i);
  if (!match) return null;
  const format = match[1].toLowerCase();
  if (format === 'png') return 'PNG';
  if (format === 'jpg' || format === 'jpeg') return 'JPEG';
  if (format === 'webp') return 'WEBP';
  return null;
};

const findGeneralSettingsRow = async () => {
  return AppSetting.findOne({ key: { $in: GENERAL_SETTINGS_KEYS } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
};

const loadBusinessProfile = async (): Promise<BusinessProfile> => {
  const row = await findGeneralSettingsRow();
  const business = row?.value?.business && typeof row.value.business === 'object'
    ? row.value.business
    : {};

  return {
    legalName: String(business.legalName || '').trim(),
    tradeName: String(business.tradeName || '').trim(),
    gstin: String(business.gstin || '').trim(),
    phone: String(business.phone || '').trim(),
    email: String(business.email || '').trim(),
    addressLine1: String(business.addressLine1 || '').trim(),
    addressLine2: String(business.addressLine2 || '').trim(),
    city: String(business.city || '').trim(),
    state: String(business.state || '').trim(),
    pincode: String(business.pincode || '').trim(),
    country: String(business.country || '').trim(),
    invoiceLogoDataUrl: String(business.invoiceLogoDataUrl || '').trim(),
    reportLogoDataUrl: String(business.reportLogoDataUrl || '').trim(),
  };
};

const businessLabel = (business: BusinessProfile): string =>
  business.tradeName || business.legalName || 'SPARK AI';

const businessAddressLines = (business: BusinessProfile): string[] => {
  return [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state].filter(Boolean).join(', '),
    [business.pincode, business.country].filter(Boolean).join(' '),
  ].filter(Boolean);
};

const businessLogoDataUrl = (business: BusinessProfile): string =>
  business.reportLogoDataUrl || business.invoiceLogoDataUrl || '';

const setTextColor = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setTextColor(color[0], color[1], color[2]);
};

const setFillColor = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setFillColor(color[0], color[1], color[2]);
};

const setDrawColor = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
};

const ensureSpace = (doc: jsPDF, currentY: number, requiredHeight: number): number => {
  if (currentY + requiredHeight <= PAGE_BOTTOM) return currentY;
  doc.addPage();
  return PAGE_TOP;
};

const badgeColors = (value: string): { fill: readonly [number, number, number]; text: readonly [number, number, number] } => {
  const normalized = String(value || '').trim().toUpperCase();
  if (['PAID', 'CONFIRMED', 'COMPLETED', 'SUCCESS'].includes(normalized)) {
    return { fill: palette.okFill, text: palette.okText };
  }
  if (['PARTIAL', 'PENDING', 'DUE', 'OPEN'].includes(normalized)) {
    return { fill: palette.warnFill, text: palette.warnText };
  }
  if (['CANCELLED', 'FAILED', 'REFUNDED', 'VOID'].includes(normalized)) {
    return { fill: palette.dangerFill, text: palette.dangerText };
  }
  return { fill: palette.neutralFill, text: palette.neutralText };
};

const drawBadge = (doc: jsPDF, x: number, y: number, text: string) => {
  const label = safeValue(text, '-').toUpperCase();
  const width = Math.max(26, doc.getTextWidth(label) + 8);
  const colors = badgeColors(label);
  setFillColor(doc, colors.fill);
  doc.roundedRect(x, y, width, 7, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setTextColor(doc, colors.text);
  doc.text(label, x + width / 2, y + 4.8, { align: 'center' });
  return width;
};

const drawDocumentHeader = (
  doc: jsPDF,
  business: BusinessProfile,
  title: string,
  documentNumber: string,
  generatedAt: Date | string
): number => {
  const y = PAGE_TOP;
  const bannerHeight = 34;
  const rightEdge = PAGE_MARGIN + CONTENT_WIDTH - 6;
  const logo = businessLogoDataUrl(business);
  const logoFormat = imageFormatFromDataUrl(logo);

  setFillColor(doc, palette.titleBg);
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, bannerHeight, 3, 3, 'F');

  let textX = PAGE_MARGIN + 6;
  if (logo && logoFormat) {
    try {
      const logoBoxX = PAGE_MARGIN + 5;
      const logoBoxY = y + 5;
      const logoBoxW = 24;
      const logoBoxH = 24;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 2, 2, 'F');
      doc.addImage(logo, logoFormat, logoBoxX + 1.5, logoBoxY + 1.5, logoBoxW - 3, logoBoxH - 3);
      textX = PAGE_MARGIN + 33;
    } catch {
      textX = PAGE_MARGIN + 6;
    }
  }

  const businessName = businessLabel(business);
  const addressText = businessAddressLines(business).join(', ');
  const addressLines = doc.splitTextToSize(addressText || 'Business address not configured', 78) as string[];
  const contactBits = [
    business.gstin ? `GSTIN ${business.gstin}` : '',
    business.phone ? `Ph ${business.phone}` : '',
    business.email ? business.email : '',
  ].filter(Boolean);
  const contactLine = contactBits.join('  |  ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setTextColor(doc, palette.titleText);
  doc.text(businessName, textX, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.7);
  setTextColor(doc, palette.subtitleText);
  addressLines.slice(0, 2).forEach((line, index) => {
    doc.text(line, textX, y + 15 + index * 4.2);
  });
  if (contactLine) {
    doc.text(contactLine, textX, y + 24.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setTextColor(doc, palette.titleText);
  doc.text(title, rightEdge, y + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.text(`Document No: ${safeValue(documentNumber)}`, rightEdge, y + 16, { align: 'right' });
  doc.text(`Generated: ${formatDateTime(generatedAt)}`, rightEdge, y + 21, { align: 'right' });
  doc.text('Computer generated document', rightEdge, y + 26, { align: 'right' });

  return y + bannerHeight + 8;
};

const drawHero = (
  doc: jsPDF,
  y: number,
  title: string,
  subtitle: string,
  badges: string[]
): number => {
  let nextY = ensureSpace(doc, y, 22);
  setFillColor(doc, palette.cardBg);
  setDrawColor(doc, palette.cardBorder);
  doc.roundedRect(PAGE_MARGIN, nextY, CONTENT_WIDTH, 20, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setTextColor(doc, palette.bodyText);
  doc.text(safeValue(title, 'Event Document'), PAGE_MARGIN + 6, nextY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setTextColor(doc, palette.mutedText);
  const subtitleLines = doc.splitTextToSize(safeValue(subtitle, '-'), 110) as string[];
  doc.text(subtitleLines.slice(0, 2), PAGE_MARGIN + 6, nextY + 13.5);

  let badgeX = PAGE_MARGIN + CONTENT_WIDTH - 6;
  badges
    .filter(Boolean)
    .reverse()
    .forEach((badge) => {
      const width = Math.max(26, doc.getTextWidth(String(badge).toUpperCase()) + 8);
      badgeX -= width;
      drawBadge(doc, badgeX, nextY + 6, badge);
      badgeX -= 3;
    });

  return nextY + 26;
};

const measureInfoCardHeight = (doc: jsPDF, width: number, rows: InfoRow[]): number => {
  const valueX = width * 0.42;
  const valueWidth = Math.max(24, width - valueX - 6);
  let height = 12;

  rows.forEach((row) => {
    const lines = doc.splitTextToSize(safeValue(row.value), valueWidth) as string[];
    height += Math.max(7, lines.length * 4.2 + 2);
  });

  return height + 4;
};

const drawInfoCard = (doc: jsPDF, x: number, y: number, width: number, title: string, rows: InfoRow[]): number => {
  const height = measureInfoCardHeight(doc, width, rows);
  const valueX = x + width * 0.42;
  const labelX = x + 4;
  const valueWidth = Math.max(24, width - (valueX - x) - 4);

  setFillColor(doc, palette.cardBg);
  setDrawColor(doc, palette.cardBorder);
  doc.roundedRect(x, y, width, height, 3, 3, 'FD');

  setFillColor(doc, palette.rowEven);
  doc.roundedRect(x, y, width, 9, 3, 3, 'F');
  doc.rect(x, y + 7.5, width, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setTextColor(doc, palette.cardTitle);
  doc.text(title, x + 4, y + 6);

  let cursorY = y + 12;
  rows.forEach((row, index) => {
    const lines = doc.splitTextToSize(safeValue(row.value), valueWidth) as string[];
    const rowHeight = Math.max(7, lines.length * 4.2 + 2);

    if (index > 0) {
      setDrawColor(doc, palette.rowBorder);
      doc.line(x + 3, cursorY - 1.5, x + width - 3, cursorY - 1.5);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextColor(doc, palette.mutedText);
    doc.text(row.label, labelX, cursorY + 3.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setTextColor(doc, palette.bodyText);
    doc.text(lines, valueX, cursorY + 3.8);

    cursorY += rowHeight;
  });

  return height;
};

const drawInfoCardsRow = (
  doc: jsPDF,
  y: number,
  left: { title: string; rows: InfoRow[] },
  right: { title: string; rows: InfoRow[] }
): number => {
  const nextY = ensureSpace(doc, y, 54);
  const cardWidth = (CONTENT_WIDTH - CARD_GAP) / 2;
  const leftHeight = drawInfoCard(doc, PAGE_MARGIN, nextY, cardWidth, left.title, left.rows);
  const rightHeight = drawInfoCard(doc, PAGE_MARGIN + cardWidth + CARD_GAP, nextY, cardWidth, right.title, right.rows);
  return nextY + Math.max(leftHeight, rightHeight) + 6;
};

const drawTable = (
  doc: jsPDF,
  y: number,
  title: string,
  columns: TableColumn[],
  rows: string[][]
): number => {
  const colWidths = columns.map((column) => CONTENT_WIDTH * column.width);
  const rowPaddingX = 2.5;
  const rowPaddingY = 2.2;
  const lineHeight = 4;

  let nextY = ensureSpace(doc, y, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, palette.bodyText);
  doc.text(title, PAGE_MARGIN, nextY);
  nextY += 5;

  const drawHeader = () => {
    setFillColor(doc, palette.tableHeadBg);
    setDrawColor(doc, palette.rowBorder);
    doc.rect(PAGE_MARGIN, nextY, CONTENT_WIDTH, 8.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextColor(doc, palette.tableHeadText);

    let x = PAGE_MARGIN;
    columns.forEach((column, index) => {
      const colWidth = colWidths[index];
      const textX = column.align === 'right'
        ? x + colWidth - rowPaddingX
        : column.align === 'center'
          ? x + colWidth / 2
          : x + rowPaddingX;
      const options = column.align === 'right'
        ? { align: 'right' as const }
        : column.align === 'center'
          ? { align: 'center' as const }
          : undefined;
      doc.text(column.header, textX, nextY + 5.6, options);
      x += colWidth;
      if (index < columns.length - 1) {
        doc.setDrawColor(86, 119, 161);
        doc.line(x, nextY, x, nextY + 8.5);
      }
    });

    nextY += 8.5;
  };

  drawHeader();

  const safeRows = rows.length
    ? rows
    : [['No records available', ...Array(Math.max(0, columns.length - 1)).fill('')]];

  safeRows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell, index) => {
      const text = safeValue(cell);
      return doc.splitTextToSize(text, Math.max(10, colWidths[index] - rowPaddingX * 2)) as string[];
    });
    const maxLines = Math.max(...cellLines.map((lines) => lines.length));
    const rowHeight = Math.max(8, maxLines * lineHeight + rowPaddingY * 2);

    if (nextY + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      nextY = PAGE_TOP;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setTextColor(doc, palette.bodyText);
      doc.text(`${title} (cont.)`, PAGE_MARGIN, nextY);
      nextY += 5;
      drawHeader();
    }

    const rowFill = rowIndex % 2 === 0 ? palette.rowOdd : palette.rowEven;
    setFillColor(doc, rowFill);
    setDrawColor(doc, palette.rowBorder);
    doc.rect(PAGE_MARGIN, nextY, CONTENT_WIDTH, rowHeight, 'FD');

    let x = PAGE_MARGIN;
    row.forEach((cell, colIndex) => {
      const lines = cellLines[colIndex] || ['-'];
      const align = columns[colIndex]?.align || 'left';
      const colWidth = colWidths[colIndex];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      setTextColor(doc, palette.bodyText);

      lines.forEach((line, lineIndex) => {
        const textY = nextY + rowPaddingY + lineHeight + lineIndex * lineHeight - 0.6;
        if (align === 'right') {
          doc.text(line, x + colWidth - rowPaddingX, textY, { align: 'right' });
        } else if (align === 'center') {
          doc.text(line, x + colWidth / 2, textY, { align: 'center' });
        } else {
          doc.text(line, x + rowPaddingX, textY);
        }
      });

      x += colWidth;
      if (colIndex < row.length - 1) {
        setDrawColor(doc, palette.rowBorder);
        doc.line(x, nextY, x, nextY + rowHeight);
      }
    });

    nextY += rowHeight;
  });

  return nextY + 6;
};

const drawRemarksBox = (
  doc: jsPDF,
  y: number,
  note?: string,
  footerNote?: string,
  title = 'Remarks'
): number => {
  const parts = [String(note || '').trim(), String(footerNote || '').trim()].filter(Boolean);
  if (!parts.length) return y;

  const nextY = ensureSpace(doc, y, 24);
  const text = parts.join('\n\n');
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 8) as string[];
  const boxHeight = Math.max(18, lines.length * 4.5 + 10);

  setFillColor(doc, palette.cardBg);
  setDrawColor(doc, palette.cardBorder);
  doc.roundedRect(PAGE_MARGIN, nextY, CONTENT_WIDTH, boxHeight, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, palette.cardTitle);
  doc.text(title, PAGE_MARGIN + 4, nextY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, palette.bodyText);
  doc.text(lines, PAGE_MARGIN + 4, nextY + 11);

  return nextY + boxHeight + 6;
};

const drawDocumentFooter = (doc: jsPDF, y: number, business: BusinessProfile, note: string): number => {
  const nextY = ensureSpace(doc, y, 16);
  setDrawColor(doc, palette.rowBorder);
  doc.line(PAGE_MARGIN, nextY, PAGE_MARGIN + CONTENT_WIDTH, nextY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setTextColor(doc, palette.mutedText);
  doc.text(note, PAGE_MARGIN, nextY + 5);
  const supportText = [business.phone, business.email].filter(Boolean).join(' | ');
  if (supportText) {
    doc.text(`Support: ${supportText}`, PAGE_MARGIN, nextY + 10);
  }
  return nextY + 12;
};

const createPdfBuffer = (
  render: (doc: jsPDF, business: BusinessProfile) => void,
  business: BusinessProfile
): Buffer => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  render(doc, business);
  return Buffer.from(doc.output('arraybuffer'));
};

export const buildEventConfirmationDocument = async (input: EventConfirmationDocumentInput) => {
  const business = await loadBusinessProfile();
  const pdfBuffer = createPdfBuffer((doc, currentBusiness) => {
    let y = drawDocumentHeader(
      doc,
      currentBusiness,
      'Event Booking Confirmation',
      input.receiptNumber,
      input.generatedAt
    );

    y = drawHero(
      doc,
      y,
      safeValue(input.eventName, 'Event Booking'),
      `Organizer: ${safeValue(input.organizerName)}${input.organizationName ? ` | Organization: ${safeValue(input.organizationName)}` : ''}`,
      [input.status, input.paymentStatus]
    );

    y = drawInfoCardsRow(
      doc,
      y,
      {
        title: 'Booking Details',
        rows: [
          { label: 'Booking No', value: input.receiptNumber },
          { label: 'Organizer', value: input.organizerName },
          { label: 'Organization', value: safeValue(input.organizationName) },
          { label: 'Contact Phone', value: safeValue(input.contactPhone) },
          { label: 'Contact Email', value: safeValue(input.contactEmail) },
        ],
      },
      {
        title: 'Status & Payment',
        rows: [
          { label: 'Booking Status', value: String(input.status || '-').toUpperCase() },
          { label: 'Payment Status', value: String(input.paymentStatus || '-').toUpperCase() },
          { label: 'Event Dates', value: String(input.occurrences?.length || 0) },
          { label: 'Advance Paid', value: formatCurrency(input.advanceAmount) },
          { label: 'Balance Due', value: formatCurrency(input.balanceAmount) },
        ],
      }
    );

    y = drawTable(
      doc,
      y,
      'Facilities',
      [
        { header: '#', width: 0.1, align: 'center' },
        { header: 'Facility / Item', width: 0.55 },
        { header: 'Location / Court', width: 0.35 },
      ],
      input.facilities.map((facility, index) => [
        String(index + 1).padStart(2, '0'),
        safeValue(facility.name),
        safeValue(facility.location),
      ])
    );

    y = drawTable(
      doc,
      y,
      'Booked Schedule',
      [
        { header: '#', width: 0.1, align: 'center' },
        { header: 'Event Date', width: 0.3 },
        { header: 'Time Slot', width: 0.3 },
        { header: 'Duration', width: 0.3 },
      ],
      input.occurrences.map((row, index) => [
        String(index + 1).padStart(2, '0'),
        formatDate(row.startTime),
        `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        `${formatDateTime(row.startTime)} to ${formatDateTime(row.endTime)}`,
      ])
    );

    y = drawTable(
      doc,
      y,
      'Financial Summary',
      [
        { header: 'Description', width: 0.68 },
        { header: 'Amount', width: 0.32, align: 'right' },
      ],
      [
        ['Total Amount', formatCurrency(input.totalAmount)],
        ['Advance Amount', formatCurrency(input.advanceAmount)],
        ['Paid Amount', formatCurrency(input.paidAmount)],
        ['Balance Amount', formatCurrency(input.balanceAmount)],
      ]
    );

    y = drawRemarksBox(
      doc,
      y,
      input.remarks,
      'Please retain this confirmation for reference at the venue and payment desk.'
    );

    drawDocumentFooter(
      doc,
      y,
      currentBusiness,
      'Thank you for booking with us. This confirmation is generated from the SPARK AI event management system.'
    );
  }, business);

  const fileName = `${sanitizeFileNamePart(input.receiptNumber || input.eventName || 'event-booking')}-confirmation.pdf`;
  const subject = `${businessLabel(business)} Event Booking Confirmation - ${input.receiptNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin-bottom:8px">${businessLabel(business)} Event Booking Confirmation</h2>
      <p>Your event booking confirmation is attached as a PDF.</p>
      <table style="border-collapse:collapse;margin-top:12px">
        <tr><td style="padding:4px 12px 4px 0"><strong>Booking No</strong></td><td style="padding:4px 0">${input.receiptNumber}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Event</strong></td><td style="padding:4px 0">${input.eventName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Organizer</strong></td><td style="padding:4px 0">${input.organizerName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Total</strong></td><td style="padding:4px 0">${formatCurrency(input.totalAmount)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Balance</strong></td><td style="padding:4px 0">${formatCurrency(input.balanceAmount)}</td></tr>
      </table>
    </div>
  `;
  const text = `Event booking confirmation\nBooking No: ${input.receiptNumber}\nEvent: ${input.eventName}\nOrganizer: ${input.organizerName}\nTotal: ${formatCurrency(input.totalAmount)}\nBalance: ${formatCurrency(input.balanceAmount)}`;

  return {
    fileName,
    subject,
    html,
    text,
    pdfBuffer,
  };
};

export const buildEventPaymentReceiptDocument = async (input: EventPaymentReceiptDocumentInput) => {
  const business = await loadBusinessProfile();
  const pdfBuffer = createPdfBuffer((doc, currentBusiness) => {
    let y = drawDocumentHeader(
      doc,
      currentBusiness,
      'Event Payment Receipt',
      input.receiptNumber,
      input.generatedAt
    );

    y = drawHero(
      doc,
      y,
      safeValue(input.eventName, 'Event Payment Receipt'),
      `Organizer: ${safeValue(input.organizerName)}${input.organizationName ? ` | Organization: ${safeValue(input.organizationName)}` : ''}`,
      [input.paymentStatus]
    );

    y = drawInfoCardsRow(
      doc,
      y,
      {
        title: 'Booking Details',
        rows: [
          { label: 'Booking No', value: input.bookingNumber },
          { label: 'Organizer', value: input.organizerName },
          { label: 'Organization', value: safeValue(input.organizationName) },
          { label: 'Contact Phone', value: safeValue(input.contactPhone) },
          { label: 'Facilities Count', value: String(input.facilities?.length || 0) },
        ],
      },
      {
        title: 'Receipt Details',
        rows: [
          { label: 'Receipt No', value: input.receiptNumber },
          { label: 'Payment Mode', value: safeValue(input.payment.paymentMethod, 'CASH').toUpperCase() },
          { label: 'Paid On', value: formatDateTime(input.payment.paidAt) },
          { label: 'Email', value: safeValue(input.contactEmail) },
          { label: 'Receipt Amount', value: formatCurrency(input.payment.amount) },
        ],
      }
    );

    y = drawTable(
      doc,
      y,
      'Facilities',
      [
        { header: '#', width: 0.1, align: 'center' },
        { header: 'Facility / Item', width: 0.55 },
        { header: 'Location / Court', width: 0.35 },
      ],
      input.facilities.map((facility, index) => [
        String(index + 1).padStart(2, '0'),
        safeValue(facility.name),
        safeValue(facility.location),
      ])
    );

    y = drawTable(
      doc,
      y,
      'Booked Schedule',
      [
        { header: '#', width: 0.1, align: 'center' },
        { header: 'Event Date', width: 0.3 },
        { header: 'Time Slot', width: 0.3 },
        { header: 'Schedule Detail', width: 0.3 },
      ],
      input.occurrences.map((row, index) => [
        String(index + 1).padStart(2, '0'),
        formatDate(row.startTime),
        `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        `${formatDateTime(row.startTime)} to ${formatDateTime(row.endTime)}`,
      ])
    );

    y = drawTable(
      doc,
      y,
      'Payment Summary',
      [
        { header: 'Description', width: 0.68 },
        { header: 'Amount / Value', width: 0.32, align: 'right' },
      ],
      [
        ['Receipt Amount', formatCurrency(input.payment.amount)],
        ['Total Contract Amount', formatCurrency(input.totalAmount)],
        ['Paid Till Date', formatCurrency(input.paidAmount)],
        ['Balance Amount', formatCurrency(input.balanceAmount)],
        ['Payment Status', String(input.paymentStatus || '-').toUpperCase()],
      ]
    );

    y = drawRemarksBox(
      doc,
      y,
      input.payment.remarks,
      'Please retain this receipt as proof of payment. Present it for any payment or booking clarification.'
    );

    drawDocumentFooter(
      doc,
      y,
      currentBusiness,
      'Thank you for your payment. This receipt is generated from the SPARK AI event management system.'
    );
  }, business);

  const fileName = `${sanitizeFileNamePart(input.receiptNumber || input.bookingNumber || 'event-payment')}-receipt.pdf`;
  const subject = `${businessLabel(business)} Event Payment Receipt - ${input.receiptNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin-bottom:8px">${businessLabel(business)} Event Payment Receipt</h2>
      <p>Your payment receipt is attached as a PDF.</p>
      <table style="border-collapse:collapse;margin-top:12px">
        <tr><td style="padding:4px 12px 4px 0"><strong>Booking No</strong></td><td style="padding:4px 0">${input.bookingNumber}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Receipt No</strong></td><td style="padding:4px 0">${input.receiptNumber}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Event</strong></td><td style="padding:4px 0">${input.eventName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Receipt Amount</strong></td><td style="padding:4px 0">${formatCurrency(input.payment.amount)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Balance</strong></td><td style="padding:4px 0">${formatCurrency(input.balanceAmount)}</td></tr>
      </table>
    </div>
  `;
  const text = `Event payment receipt\nBooking No: ${input.bookingNumber}\nReceipt No: ${input.receiptNumber}\nEvent: ${input.eventName}\nReceipt Amount: ${formatCurrency(input.payment.amount)}\nBalance: ${formatCurrency(input.balanceAmount)}`;

  return {
    fileName,
    subject,
    html,
    text,
    pdfBuffer,
  };
};

export const buildEventQuotationDocument = async (input: EventQuotationDocumentInput) => {
  const business = await loadBusinessProfile();
  const pdfBuffer = createPdfBuffer((doc, currentBusiness) => {
    let y = drawDocumentHeader(
      doc,
      currentBusiness,
      'Event Quotation',
      input.quoteNumber,
      input.generatedAt
    );

    y = drawHero(
      doc,
      y,
      safeValue(input.eventName, 'Event Quotation'),
      `Organizer: ${safeValue(input.organizerName)}${input.organizationName ? ` | Organization: ${safeValue(input.organizationName)}` : ''}`,
      [input.quoteStatus, input.linkedBookingNumber ? 'Booked' : 'Quotation']
    );

    y = drawInfoCardsRow(
      doc,
      y,
      {
        title: 'Quotation Details',
        rows: [
          { label: 'Quote No', value: input.quoteNumber },
          { label: 'Status', value: String(input.quoteStatus || '-').toUpperCase() },
          { label: 'Valid Until', value: input.validUntil ? formatDate(input.validUntil) : '-' },
          { label: 'Linked Booking', value: safeValue(input.linkedBookingNumber) },
          { label: 'Generated On', value: formatDateTime(input.generatedAt) },
        ],
      },
      {
        title: 'Contact Details',
        rows: [
          { label: 'Organizer', value: input.organizerName },
          { label: 'Organization', value: safeValue(input.organizationName) },
          { label: 'Phone', value: safeValue(input.contactPhone) },
          { label: 'Email', value: safeValue(input.contactEmail) },
          { label: 'Facility Count', value: String(input.facilities?.length || 0) },
        ],
      }
    );

    y = drawTable(
      doc,
      y,
      'Facilities',
      [
        { header: '#', width: 0.1, align: 'center' },
        { header: 'Facility', width: 0.48 },
        { header: 'Location', width: 0.26 },
        { header: 'Default Rate / Hr', width: 0.16, align: 'right' },
      ],
      input.facilities.map((facility, index) => [
        String(index + 1).padStart(2, '0'),
        safeValue(facility.name),
        safeValue(facility.location),
        formatCurrency(Number(facility.hourlyRate || 0)),
      ])
    );

    y = drawTable(
      doc,
      y,
      'Requested Schedule',
      [
        { header: '#', width: 0.1, align: 'center' },
        { header: 'Event Date', width: 0.22 },
        { header: 'Time Slot', width: 0.28 },
        { header: 'Schedule Detail', width: 0.4 },
      ],
      input.occurrences.map((row, index) => [
        String(index + 1).padStart(2, '0'),
        formatDate(row.startTime),
        `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        `${formatDateTime(row.startTime)} to ${formatDateTime(row.endTime)}`,
      ])
    );

    y = drawTable(
      doc,
      y,
      'Quotation Items',
      [
        { header: '#', width: 0.08, align: 'center' },
        { header: 'Description', width: 0.4 },
        { header: 'Qty', width: 0.1, align: 'right' },
        { header: 'Unit', width: 0.12 },
        { header: 'Rate', width: 0.14, align: 'right' },
        { header: 'Amount', width: 0.16, align: 'right' },
      ],
      input.items.map((item, index) => [
        String(index + 1).padStart(2, '0'),
        safeValue(item.description),
        round2(Number(item.quantity || 0)).toFixed(2),
        safeValue(item.unitLabel || 'Unit'),
        formatCurrency(Number(item.unitPrice || 0)),
        formatCurrency(Number(item.lineTotal || 0)),
      ])
    );

    y = drawTable(
      doc,
      y,
      'Financial Breakdown',
      [
        { header: 'Description', width: 0.68 },
        { header: 'Amount / Value', width: 0.32, align: 'right' },
      ],
      [
        ['Subtotal', formatCurrency(input.subtotal)],
        [
          input.discountType === 'percentage'
            ? `Discount (${round2(Number(input.discountValue || 0)).toFixed(2)}%)`
            : 'Discount (Fixed)',
          formatCurrency(input.discountAmount),
        ],
        ['Taxable Value', formatCurrency(input.taxableAmount)],
        [`GST (${round2(Number(input.gstRate || 0)).toFixed(2)}%)`, formatCurrency(input.gstAmount)],
        ['Grand Total', formatCurrency(input.totalAmount)],
      ]
    );

    y = drawRemarksBox(
      doc,
      y,
      input.termsAndConditions,
      'These terms can be revised before final approval and booking confirmation.',
      'Terms & Conditions'
    );

    y = drawRemarksBox(
      doc,
      y,
      input.notes,
      'Quotation prepared for discussion and booking confirmation.'
    );

    drawDocumentFooter(
      doc,
      y,
      currentBusiness,
      'This is a computer-generated quotation from the SPARK AI event management system.'
    );
  }, business);

  const fileName = `${sanitizeFileNamePart(input.quoteNumber || input.eventName || 'event-quotation')}.pdf`;
  const subject = `${businessLabel(business)} Event Quotation - ${input.quoteNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin-bottom:8px">${businessLabel(business)} Event Quotation</h2>
      <p>Your event quotation is attached as a PDF.</p>
      <table style="border-collapse:collapse;margin-top:12px">
        <tr><td style="padding:4px 12px 4px 0"><strong>Quote No</strong></td><td style="padding:4px 0">${input.quoteNumber}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Event</strong></td><td style="padding:4px 0">${input.eventName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Organizer</strong></td><td style="padding:4px 0">${input.organizerName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Quotation Total</strong></td><td style="padding:4px 0">${formatCurrency(input.totalAmount)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Valid Until</strong></td><td style="padding:4px 0">${input.validUntil ? formatDate(input.validUntil) : '-'}</td></tr>
      </table>
    </div>
  `;
  const text = `Event quotation\nQuote No: ${input.quoteNumber}\nEvent: ${input.eventName}\nOrganizer: ${input.organizerName}\nQuotation Total: ${formatCurrency(input.totalAmount)}`;

  return {
    fileName,
    subject,
    html,
    text,
    pdfBuffer,
  };
};
