import { jsPDF } from 'jspdf';
import { AppSetting } from '../models/AppSetting.js';

const GENERAL_SETTINGS_KEYS = ['general_settings', 'pos_general_settings_v1', 'pos_settings'];

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

type BusinessProfile = {
  legalName: string;
  tradeName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
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

const formatCurrency = (value: number): string => {
  return `INR ${round2(Number(value || 0)).toFixed(2)}`;
};

const sanitizeFileNamePart = (value: string): string => {
  return String(value || 'document')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'document';
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
    phone: String(business.phone || '').trim(),
    email: String(business.email || '').trim(),
    addressLine1: String(business.addressLine1 || '').trim(),
    addressLine2: String(business.addressLine2 || '').trim(),
    city: String(business.city || '').trim(),
    state: String(business.state || '').trim(),
    pincode: String(business.pincode || '').trim(),
    country: String(business.country || '').trim(),
  };
};

const businessLabel = (business: BusinessProfile): string =>
  business.tradeName || business.legalName || 'SPARK AI';

const businessAddress = (business: BusinessProfile): string[] => {
  const parts = [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state].filter(Boolean).join(', '),
    [business.pincode, business.country].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.length ? parts : ['Business address not configured'];
};

const ensureSpace = (doc: jsPDF, currentY: number, requiredHeight: number): number => {
  if (currentY + requiredHeight <= 280) return currentY;
  doc.addPage();
  return 20;
};

const drawHeading = (doc: jsPDF, business: BusinessProfile, title: string, documentNumber: string, generatedAt: Date | string) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(businessLabel(business), 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 24;
  businessAddress(business).forEach((line) => {
    doc.text(line, 14, y);
    y += 5;
  });
  const contactLine = [business.phone, business.email].filter(Boolean).join(' | ');
  if (contactLine) {
    doc.text(contactLine, 14, y);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 196, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Document No: ${documentNumber}`, 196, 25, { align: 'right' });
  doc.text(`Generated: ${formatDateTime(generatedAt)}`, 196, 31, { align: 'right' });

  doc.setDrawColor(190, 190, 190);
  doc.line(14, 36, 196, 36);
  return 44;
};

const drawPair = (doc: jsPDF, y: number, label: string, value: string, rightLabel?: string, rightValue?: string) => {
  doc.setFont('helvetica', 'bold');
  doc.text(label, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(value || '-', 52, y);

  if (rightLabel) {
    doc.setFont('helvetica', 'bold');
    doc.text(rightLabel, 112, y);
    doc.setFont('helvetica', 'normal');
    doc.text(rightValue || '-', 150, y);
  }
};

const drawOccurrences = (doc: jsPDF, y: number, occurrences: EventOccurrenceDocumentRow[]) => {
  let nextY = ensureSpace(doc, y, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Booked Schedule', 14, nextY);
  nextY += 7;

  occurrences.forEach((row, index) => {
    nextY = ensureSpace(doc, nextY, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${String(index + 1).padStart(2, '0')}. ${formatDateTime(row.startTime)} to ${formatDateTime(row.endTime)}`, 18, nextY);
    nextY += 6;
  });

  return nextY;
};

const drawFinancialSummary = (
  doc: jsPDF,
  y: number,
  values: Array<{ label: string; value: string }>
) => {
  let nextY = ensureSpace(doc, y, 14 + values.length * 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Payment Summary', 14, nextY);
  nextY += 7;

  values.forEach((entry) => {
    doc.setFont('helvetica', 'bold');
    doc.text(entry.label, 18, nextY);
    doc.setFont('helvetica', 'normal');
    doc.text(entry.value, 80, nextY);
    nextY += 6;
  });

  return nextY;
};

const drawFooter = (doc: jsPDF, y: number, note?: string) => {
  const nextY = ensureSpace(doc, y, 18);
  if (note) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Remarks', 14, nextY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(note, 178);
    doc.text(lines, 14, nextY + 6);
    return nextY + 8 + lines.length * 5;
  }
  return nextY;
};

const createPdfBuffer = (render: (doc: jsPDF, business: BusinessProfile) => void, business: BusinessProfile): Buffer => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  render(doc, business);
  return Buffer.from(doc.output('arraybuffer'));
};

export const buildEventConfirmationDocument = async (input: EventConfirmationDocumentInput) => {
  const business = await loadBusinessProfile();
  const pdfBuffer = createPdfBuffer((doc, currentBusiness) => {
    let y = drawHeading(doc, currentBusiness, 'Event Booking Confirmation', input.receiptNumber, input.generatedAt);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(input.eventName || 'Event Booking', 14, y);
    y += 8;

    drawPair(doc, y, 'Organizer', input.organizerName || '-', 'Status', String(input.status || '-').toUpperCase());
    y += 7;
    drawPair(doc, y, 'Organization', input.organizationName || '-', 'Payment', String(input.paymentStatus || '-').toUpperCase());
    y += 7;
    drawPair(doc, y, 'Phone', input.contactPhone || '-', 'Email', input.contactEmail || '-');
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Facilities', 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    input.facilities.forEach((facility, index) => {
      y = ensureSpace(doc, y, 7);
      doc.text(`${String(index + 1).padStart(2, '0')}. ${facility.name}${facility.location ? ` (${facility.location})` : ''}`, 18, y);
      y += 6;
    });

    y += 2;
    y = drawOccurrences(doc, y, input.occurrences);
    y += 4;
    y = drawFinancialSummary(doc, y, [
      { label: 'Total Amount', value: formatCurrency(input.totalAmount) },
      { label: 'Advance Amount', value: formatCurrency(input.advanceAmount) },
      { label: 'Paid Amount', value: formatCurrency(input.paidAmount) },
      { label: 'Balance Amount', value: formatCurrency(input.balanceAmount) },
    ]);
    drawFooter(doc, y + 4, input.remarks);
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
    let y = drawHeading(doc, currentBusiness, 'Event Payment Receipt', input.receiptNumber, input.generatedAt);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(input.eventName || 'Event Payment', 14, y);
    y += 8;

    drawPair(doc, y, 'Booking No', input.bookingNumber || '-', 'Receipt No', input.receiptNumber || '-');
    y += 7;
    drawPair(doc, y, 'Organizer', input.organizerName || '-', 'Payment Mode', String(input.payment.paymentMethod || 'cash').toUpperCase());
    y += 7;
    drawPair(doc, y, 'Organization', input.organizationName || '-', 'Paid On', formatDateTime(input.payment.paidAt));
    y += 7;
    drawPair(doc, y, 'Phone', input.contactPhone || '-', 'Email', input.contactEmail || '-');
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Facilities', 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    input.facilities.forEach((facility, index) => {
      y = ensureSpace(doc, y, 7);
      doc.text(`${String(index + 1).padStart(2, '0')}. ${facility.name}${facility.location ? ` (${facility.location})` : ''}`, 18, y);
      y += 6;
    });

    y += 2;
    y = drawOccurrences(doc, y, input.occurrences);
    y += 4;
    y = drawFinancialSummary(doc, y, [
      { label: 'Receipt Amount', value: formatCurrency(input.payment.amount) },
      { label: 'Total Amount', value: formatCurrency(input.totalAmount) },
      { label: 'Paid Till Date', value: formatCurrency(input.paidAmount) },
      { label: 'Balance Amount', value: formatCurrency(input.balanceAmount) },
      { label: 'Payment Status', value: String(input.paymentStatus || '-').toUpperCase() },
    ]);
    drawFooter(doc, y + 4, input.payment.remarks);
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
