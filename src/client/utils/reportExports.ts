type ExportRow = Record<string, unknown>;

const DEFAULT_PDF_WIDTH = 760;

const sanitizeFileName = (value: string, extension: string): string => {
  const normalized = String(value || 'report').trim() || 'report';
  const baseName = normalized.replace(/\.[a-z0-9]+$/i, '');
  return `${baseName}.${extension}`;
};

const toCsvCell = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const downloadCsvRows = (fileName: string, rows: ExportRow[]) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvCell(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName, 'csv');
  anchor.click();
  URL.revokeObjectURL(url);
};

export const downloadExcelRows = async (fileName: string, rows: ExportRow[], sheetName = 'Report') => {
  if (!rows.length) return;
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31) || 'Report');
  XLSX.writeFile(workbook, sanitizeFileName(fileName, 'xlsx'));
};

export const downloadPdfRows = async (args: {
  fileName: string;
  title: string;
  rows: ExportRow[];
  subtitle?: string;
}) => {
  if (!args.rows.length) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const headers = Object.keys(args.rows[0] || {});
  const generatedAt = new Date().toLocaleString('en-IN');
  let y = 40;

  const addPageHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(args.title || 'Report Export', 40, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (args.subtitle) {
      doc.text(args.subtitle, 40, y);
      y += 14;
    }
    doc.text(`Generated: ${generatedAt}`, 40, y);
    y += 14;
    doc.text(`Rows: ${args.rows.length}`, 40, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const headerLine = headers.join(' | ');
    const wrappedHeaders = doc.splitTextToSize(headerLine, DEFAULT_PDF_WIDTH);
    doc.text(wrappedHeaders, 40, y);
    y += wrappedHeaders.length * 12 + 8;

    doc.setLineWidth(0.6);
    doc.line(40, y, 800, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };

  addPageHeader();

  for (const row of args.rows) {
    const rowLine = headers.map((header) => `${header}: ${String(row[header] ?? '')}`).join(' | ');
    const wrapped = doc.splitTextToSize(rowLine, DEFAULT_PDF_WIDTH);
    const rowHeight = wrapped.length * 12 + 6;
    if (y + rowHeight > 560) {
      doc.addPage();
      y = 40;
      addPageHeader();
    }
    doc.text(wrapped, 40, y);
    y += rowHeight;
  }

  doc.save(sanitizeFileName(args.fileName, 'pdf'));
};
