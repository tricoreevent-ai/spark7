import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { useCategories } from '../hooks/useCategories';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showAlertDialog } from '../utils/appDialogs';
import { notifyProductsChanged } from '../utils/productCatalogEvents';

type TemplateColumn = {
  key: string;
  label: string;
  required?: boolean;
  description: string;
  example?: string;
};

type RowError = {
  rowNumber: number;
  sku?: string;
  name?: string;
  messages: string[];
};

type UploadSummary = {
  receivedRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  batchesProcessed: number;
  totalBatches: number;
};

type DuplicateMode = 'update_existing' | 'skip_existing' | 'error_existing';

type NormalizedUploadRow = Record<string, any> & {
  sourceRowNumber: number;
  name: string;
  sku: string;
};

type EditableFailedRow = {
  rowNumber: number;
  messages: string[];
  row: NormalizedUploadRow;
};

const BATCH_SIZE = 500;
const MAX_CLIENT_ROWS = 10_000;

const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: 'name', label: 'Product Name', required: true, description: 'Visible product name used in catalog and billing.', example: 'Badminton Court Shoes' },
  { key: 'sku', label: 'SKU', required: true, description: 'Unique stock code used for product matching during bulk update.', example: 'BDM-SHOE-001' },
  { key: 'barcode', label: 'Barcode', description: 'Optional barcode, must be unique when provided.', example: '8902402601002' },
  { key: 'category', label: 'Category', required: true, description: 'Existing category name from the catalog setup.', example: 'Badminton' },
  { key: 'subcategory', label: 'Subcategory', description: 'Optional subgroup under the category.', example: 'Footwear' },
  { key: 'itemType', label: 'Item Type', description: 'Use inventory, service, or non_inventory.', example: 'inventory' },
  { key: 'description', label: 'Description', description: 'Optional product description shown in catalog review.', example: 'Indoor non-marking badminton shoes.' },
  { key: 'price', label: 'Selling Price', required: true, description: 'Main selling price, decimal allowed.', example: '2499' },
  { key: 'wholesalePrice', label: 'Wholesale Purchase Price', description: 'Used for the Total Worth of Products in Shop calculation.', example: '1800' },
  { key: 'promotionalPrice', label: 'Promotional Price', description: 'Optional special selling price inside the promo window.', example: '2399' },
  { key: 'promotionStartDate', label: 'Promo Start Date', description: 'Optional start date in YYYY-MM-DD format.', example: '2026-04-25' },
  { key: 'promotionEndDate', label: 'Promo End Date', description: 'Optional end date in YYYY-MM-DD format.', example: '2026-05-31' },
  { key: 'cost', label: 'Cost (Buying)', required: true, description: 'Base buying cost used for margin reporting.', example: '1800' },
  { key: 'stock', label: 'Quantity In Stock', description: 'Current stock quantity.', example: '12' },
  { key: 'openingStockValue', label: 'Opening Stock Value', description: 'Opening valuation amount.', example: '21600' },
  { key: 'stockLedgerAccountId', label: 'Stock Ledger Account ID', description: 'Optional chart account id for inventory valuation link.', example: '69e04ae945bc202acf1' },
  { key: 'minStock', label: 'Min Stock Alert', description: 'Low-stock threshold.', example: '4' },
  { key: 'autoReorder', label: 'Auto Reorder', description: 'Use Yes/No, True/False, or 1/0.', example: 'Yes' },
  { key: 'reorderQuantity', label: 'Preferred Reorder Quantity', description: 'Suggested reorder quantity when auto-reorder is enabled.', example: '8' },
  { key: 'unit', label: 'Unit', description: 'Use piece, pcs, kg, gram, liter, ml, meter, box, pack, or dozen.', example: 'piece' },
  { key: 'gstRate', label: 'GST Rate', description: 'Use 0, 5, 12, 18, or 28.', example: '18' },
  { key: 'cgstRate', label: 'CGST Rate', description: 'Optional CGST split.', example: '9' },
  { key: 'sgstRate', label: 'SGST Rate', description: 'Optional SGST split.', example: '9' },
  { key: 'igstRate', label: 'IGST Rate', description: 'Optional IGST split.', example: '0' },
  { key: 'taxType', label: 'Tax Type', description: 'Use gst or vat.', example: 'gst' },
  { key: 'hsnCode', label: 'HSN/SAC Code', description: 'Optional HSN or SAC code.', example: '6404' },
  { key: 'returnStock', label: 'Return Stock', description: 'Optional returned stock balance.', example: '0' },
  { key: 'damagedStock', label: 'Damaged Stock', description: 'Optional damaged stock balance.', example: '0' },
  { key: 'allowNegativeStock', label: 'Allow Negative Stock', description: 'Use Yes/No.', example: 'No' },
  { key: 'batchTracking', label: 'Batch Tracking', description: 'Use Yes/No.', example: 'No' },
  { key: 'expiryRequired', label: 'Expiry Required', description: 'Use Yes/No.', example: 'No' },
  { key: 'serialNumberTracking', label: 'Serial Number Tracking', description: 'Use Yes/No.', example: 'No' },
  { key: 'variantSize', label: 'Variant Size List', description: 'Comma-separated size helper values.', example: '7, 8, 9, 10' },
  { key: 'variantColor', label: 'Variant Color List', description: 'Comma-separated color helper values.', example: 'Navy, White' },
  { key: 'variantMatrix', label: 'Variant Matrix JSON', description: 'Optional JSON array of variant rows.', example: '[{"size":"8","color":"Navy","skuSuffix":"8-NVY","barcode":"890240260100201","price":2499,"isActive":true}]' },
  { key: 'priceTiers', label: 'Price Tiers JSON', description: 'Optional JSON array of bulk pricing tiers.', example: '[{"tierName":"Club Order","minQuantity":4,"unitPrice":2325}]' },
  { key: 'imageUrl', label: 'Image URL', description: 'Optional public image URL.', example: 'https://placehold.co/600x600/png?text=Badminton+Court+Shoes' },
  { key: 'isActive', label: 'Status', description: 'Use Active/Inactive, Yes/No, or True/False.', example: 'Active' },
];

const normalizeHeader = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const toCellText = (value: unknown): string => String(value ?? '').trim();

const parseBooleanCell = (value: unknown, defaultValue: boolean): boolean => {
  const raw = String(value ?? '').trim();
  if (!raw) return defaultValue;
  const normalized = raw.toLowerCase();
  if (['true', 'yes', 'y', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'inactive'].includes(normalized)) return false;
  return defaultValue;
};

const parseItemType = (value: unknown, errors: string[]): 'inventory' | 'service' | 'non_inventory' => {
  const normalized = String(value || 'inventory').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized || normalized === 'inventory') return 'inventory';
  if (normalized === 'service') return 'service';
  if (normalized === 'non_inventory') return 'non_inventory';
  errors.push('Item Type must be inventory, service, or non_inventory.');
  return 'inventory';
};

const parseUnit = (value: unknown, errors: string[]): string => {
  const normalized = String(value || 'piece').trim().toLowerCase();
  const allowed = new Set(['piece', 'pcs', 'kg', 'gram', 'liter', 'ml', 'meter', 'box', 'pack', 'dozen']);
  if (!normalized) return 'piece';
  if (allowed.has(normalized)) return normalized;
  errors.push('Unit must be piece, pcs, kg, gram, liter, ml, meter, box, pack, or dozen.');
  return 'piece';
};

const parseNumberCell = (
  value: unknown,
  label: string,
  errors: string[],
  options: { required?: boolean; min?: number; defaultValue?: number } = {}
): number => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (options.required) {
      errors.push(`${label} is required.`);
      return Number.NaN;
    }
    return Number(options.defaultValue || 0);
  }

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    errors.push(`${label} must be a valid number.`);
    return Number.NaN;
  }
  if (options.min !== undefined && parsed < options.min) {
    errors.push(`${label} must be greater than or equal to ${options.min}.`);
  }
  return parsed;
};

const parseDateCell = (value: unknown, label: string, errors: string[]): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${label} must be a valid date.`);
    return '';
  }
  return parsed.toISOString().slice(0, 10);
};

const parseJsonArrayCell = (value: unknown, label: string, errors: string[]): any[] => {
  if (Array.isArray(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      errors.push(`${label} must be a JSON array.`);
      return [];
    }
    return parsed;
  } catch {
    errors.push(`${label} must be valid JSON.`);
    return [];
  }
};

const chunkRows = <T,>(rows: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
};

const buildUploadDraftFromRawRecord = (rawRecord: Record<string, unknown>, sourceRowNumber: number): NormalizedUploadRow => ({
  sourceRowNumber,
  name: toCellText(rawRecord.name),
  sku: toCellText(rawRecord.sku).toUpperCase(),
  barcode: toCellText(rawRecord.barcode).toUpperCase(),
  category: toCellText(rawRecord.category),
  subcategory: toCellText(rawRecord.subcategory),
  itemType: toCellText(rawRecord.itemType) || 'inventory',
  description: toCellText(rawRecord.description),
  price: toCellText(rawRecord.price),
  wholesalePrice: toCellText(rawRecord.wholesalePrice),
  promotionalPrice: toCellText(rawRecord.promotionalPrice),
  promotionStartDate: toCellText(rawRecord.promotionStartDate),
  promotionEndDate: toCellText(rawRecord.promotionEndDate),
  cost: toCellText(rawRecord.cost),
  stock: toCellText(rawRecord.stock),
  openingStockValue: toCellText(rawRecord.openingStockValue),
  stockLedgerAccountId: toCellText(rawRecord.stockLedgerAccountId),
  minStock: toCellText(rawRecord.minStock),
  autoReorder: parseBooleanCell(rawRecord.autoReorder, false),
  reorderQuantity: toCellText(rawRecord.reorderQuantity),
  unit: toCellText(rawRecord.unit) || 'piece',
  gstRate: toCellText(rawRecord.gstRate) || '18',
  cgstRate: toCellText(rawRecord.cgstRate),
  sgstRate: toCellText(rawRecord.sgstRate),
  igstRate: toCellText(rawRecord.igstRate),
  taxType: toCellText(rawRecord.taxType) || 'gst',
  hsnCode: toCellText(rawRecord.hsnCode),
  returnStock: toCellText(rawRecord.returnStock),
  damagedStock: toCellText(rawRecord.damagedStock),
  allowNegativeStock: parseBooleanCell(rawRecord.allowNegativeStock, false),
  batchTracking: parseBooleanCell(rawRecord.batchTracking, false),
  expiryRequired: parseBooleanCell(rawRecord.expiryRequired, false),
  serialNumberTracking: parseBooleanCell(rawRecord.serialNumberTracking, false),
  variantSize: toCellText(rawRecord.variantSize),
  variantColor: toCellText(rawRecord.variantColor),
  variantMatrix: Array.isArray(rawRecord.variantMatrix) ? JSON.stringify(rawRecord.variantMatrix) : toCellText(rawRecord.variantMatrix),
  priceTiers: Array.isArray(rawRecord.priceTiers) ? JSON.stringify(rawRecord.priceTiers) : toCellText(rawRecord.priceTiers),
  imageUrl: toCellText(rawRecord.imageUrl),
  isActive: parseBooleanCell(rawRecord.isActive, true),
});

const validateEditableDraftRow = (row: NormalizedUploadRow): string[] => {
  const errors: string[] = [];
  if (!toCellText(row.name)) errors.push('Product name is required.');
  if (!toCellText(row.sku)) errors.push('SKU is required.');
  if (!toCellText(row.category)) errors.push('Category is required.');

  parseItemType(row.itemType, errors);
  parseUnit(row.unit, errors);
  parseNumberCell(row.price, 'Selling Price', errors, { required: true, min: 0 });
  parseNumberCell(row.wholesalePrice, 'Wholesale Purchase Price', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.promotionalPrice, 'Promotional Price', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.cost, 'Cost (Buying)', errors, { required: true, min: 0 });
  parseNumberCell(row.stock, 'Quantity In Stock', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.openingStockValue, 'Opening Stock Value', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.minStock, 'Min Stock Alert', errors, { defaultValue: 10, min: 0 });
  parseNumberCell(row.reorderQuantity, 'Preferred Reorder Quantity', errors, { defaultValue: 0, min: 0 });
  const gstRate = parseNumberCell(row.gstRate, 'GST Rate', errors, { defaultValue: 18, min: 0 });
  parseNumberCell(row.cgstRate, 'CGST Rate', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.sgstRate, 'SGST Rate', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.igstRate, 'IGST Rate', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.returnStock, 'Return Stock', errors, { defaultValue: 0, min: 0 });
  parseNumberCell(row.damagedStock, 'Damaged Stock', errors, { defaultValue: 0, min: 0 });

  if (![0, 5, 12, 18, 28].includes(Number(gstRate))) {
    errors.push('GST Rate must be one of 0, 5, 12, 18, or 28.');
  }

  const start = parseDateCell(row.promotionStartDate, 'Promo Start Date', errors);
  const end = parseDateCell(row.promotionEndDate, 'Promo End Date', errors);
  if (start && end && end < start) {
    errors.push('Promo End Date must be on or after Promo Start Date.');
  }

  parseJsonArrayCell(row.variantMatrix, 'Variant Matrix JSON', errors);
  parseJsonArrayCell(row.priceTiers, 'Price Tiers JSON', errors);
  return errors;
};

const buildFailedEditableRows = (errors: RowError[], rowMap: Map<number, NormalizedUploadRow>): EditableFailedRow[] => {
  const grouped = new Map<number, EditableFailedRow>();
  errors.forEach((error) => {
    const rowNumber = Number(error.rowNumber || 0);
    const row = rowMap.get(rowNumber);
    if (!row) return;
    const existing = grouped.get(rowNumber);
    if (existing) {
      existing.messages = Array.from(new Set([...existing.messages, ...error.messages]));
      return;
    }
    grouped.set(rowNumber, {
      rowNumber,
      messages: Array.from(new Set(error.messages)),
      row,
    });
  });
  return Array.from(grouped.values()).sort((left, right) => left.rowNumber - right.rowNumber);
};

export const BulkProductEntry: React.FC = () => {
  const { categories } = useCategories();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [processingUpload, setProcessingUpload] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('update_existing');
  const [progressMessage, setProgressMessage] = useState('');
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [failedRows, setFailedRows] = useState<EditableFailedRow[]>([]);
  const [previewRows, setPreviewRows] = useState<NormalizedUploadRow[]>([]);
  const [headerError, setHeaderError] = useState('');

  const requiredHeaders = useMemo(() => TEMPLATE_COLUMNS.filter((column) => column.required).map((column) => column.label), []);
  const displayedErrors = useMemo(() => rowErrors.slice(0, 200), [rowErrors]);

  const downloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const productSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((column) => column.label)]);
      productSheet['!cols'] = TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(column.label.length + 4, 18) }));
      XLSX.utils.book_append_sheet(workbook, productSheet, 'Products');

      const instructionSheet = XLSX.utils.json_to_sheet(
        TEMPLATE_COLUMNS.map((column) => ({
          Field: column.label,
          Required: column.required ? 'Yes' : 'No',
          Description: column.description,
          Example: column.example || '',
        }))
      );
      instructionSheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 80 }, { wch: 55 }];
      XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');

      const categoriesSheet = XLSX.utils.aoa_to_sheet([
        ['Available Categories'],
        ...categories.map((category) => [category.name]),
      ]);
      categoriesSheet['!cols'] = [{ wch: 28 }];
      XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');

      XLSX.writeFile(workbook, `bulk-product-entry-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      console.error(error);
      await showAlertDialog('Failed to generate the Excel template.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const parseWorkbookRows = async (
    file: File
  ): Promise<{ rows: NormalizedUploadRow[]; errors: RowError[]; draftRowsByNumber: Map<number, NormalizedUploadRow> }> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', raw: false });
    const targetSheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'products') || workbook.SheetNames[0];
    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) {
      throw new Error('The workbook does not contain a readable Products sheet.');
    }

    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const headerIndexByKey = new Map<string, number>();
    headerRow.forEach((cell, index) => {
      headerIndexByKey.set(normalizeHeader(cell), index);
    });

    const missingHeaders = TEMPLATE_COLUMNS.filter((column) => column.required && !headerIndexByKey.has(normalizeHeader(column.label))).map(
      (column) => column.label
    );
    if (missingHeaders.length) {
      throw new Error(`The uploaded file is missing required headers: ${missingHeaders.join(', ')}`);
    }

    const parsedRows: NormalizedUploadRow[] = [];
    const errors: RowError[] = [];
    const draftRowsByNumber = new Map<number, NormalizedUploadRow>();

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const excelRowNumber = rowIndex + 1;
      const cells = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const rawRecord = TEMPLATE_COLUMNS.reduce<Record<string, unknown>>((acc, column) => {
        const cellIndex = headerIndexByKey.get(normalizeHeader(column.label));
        acc[column.key] = cellIndex === undefined ? '' : cells[cellIndex];
        return acc;
      }, {});

      const isBlankRow = Object.values(rawRecord).every((value) => String(value ?? '').trim() === '');
      if (isBlankRow) continue;

      const rowPayload = buildUploadDraftFromRawRecord(rawRecord, excelRowNumber);
      draftRowsByNumber.set(excelRowNumber, rowPayload);

      const currentErrors: string[] = [];
      const name = String(rawRecord.name || '').trim();
      const sku = String(rawRecord.sku || '').trim().toUpperCase();
      const category = String(rawRecord.category || '').trim();
      if (!name) currentErrors.push('Product name is required.');
      if (!sku) currentErrors.push('SKU is required.');
      if (!category) currentErrors.push('Category is required.');

      const price = parseNumberCell(rawRecord.price, 'Selling Price', currentErrors, { required: true, min: 0 });
      const wholesalePrice = parseNumberCell(rawRecord.wholesalePrice, 'Wholesale Purchase Price', currentErrors, {
        defaultValue: 0,
        min: 0,
      });
      const promotionalPrice = parseNumberCell(rawRecord.promotionalPrice, 'Promotional Price', currentErrors, {
        defaultValue: 0,
        min: 0,
      });
      const cost = parseNumberCell(rawRecord.cost, 'Cost (Buying)', currentErrors, { required: true, min: 0 });
      const stock = parseNumberCell(rawRecord.stock, 'Quantity In Stock', currentErrors, { defaultValue: 0, min: 0 });
      const openingStockValue = parseNumberCell(rawRecord.openingStockValue, 'Opening Stock Value', currentErrors, {
        defaultValue: 0,
        min: 0,
      });
      const minStock = parseNumberCell(rawRecord.minStock, 'Min Stock Alert', currentErrors, { defaultValue: 10, min: 0 });
      const reorderQuantity = parseNumberCell(rawRecord.reorderQuantity, 'Preferred Reorder Quantity', currentErrors, {
        defaultValue: 0,
        min: 0,
      });
      const gstRate = parseNumberCell(rawRecord.gstRate, 'GST Rate', currentErrors, { defaultValue: 18, min: 0 });
      const cgstRate = parseNumberCell(rawRecord.cgstRate, 'CGST Rate', currentErrors, { defaultValue: 0, min: 0 });
      const sgstRate = parseNumberCell(rawRecord.sgstRate, 'SGST Rate', currentErrors, { defaultValue: 0, min: 0 });
      const igstRate = parseNumberCell(rawRecord.igstRate, 'IGST Rate', currentErrors, { defaultValue: 0, min: 0 });
      const returnStock = parseNumberCell(rawRecord.returnStock, 'Return Stock', currentErrors, { defaultValue: 0, min: 0 });
      const damagedStock = parseNumberCell(rawRecord.damagedStock, 'Damaged Stock', currentErrors, { defaultValue: 0, min: 0 });

      if (![0, 5, 12, 18, 28].includes(Number(gstRate))) {
        currentErrors.push('GST Rate must be one of 0, 5, 12, 18, or 28.');
      }

      const promotionStartDate = parseDateCell(rawRecord.promotionStartDate, 'Promo Start Date', currentErrors);
      const promotionEndDate = parseDateCell(rawRecord.promotionEndDate, 'Promo End Date', currentErrors);
      if (promotionStartDate && promotionEndDate && promotionEndDate < promotionStartDate) {
        currentErrors.push('Promo End Date must be on or after Promo Start Date.');
      }

      if (currentErrors.length) {
        errors.push({ rowNumber: excelRowNumber, sku, name, messages: currentErrors });
        continue;
      }
      parsedRows.push(rowPayload);
    }

    if (parsedRows.length > MAX_CLIENT_ROWS) {
      throw new Error(`This file contains ${parsedRows.length} data rows. The current limit is ${MAX_CLIENT_ROWS.toLocaleString()} rows per upload.`);
    }

    return { rows: parsedRows, errors, draftRowsByNumber };
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      await showAlertDialog('Please choose an Excel file first.');
      return;
    }

    try {
      setProcessingUpload(true);
      setProgressMessage('Reading workbook...');
      setHeaderError('');
      setSummary(null);
      setRowErrors([]);
      setFailedRows([]);
      setPreviewRows([]);

      const { rows, errors: clientErrors, draftRowsByNumber } = await parseWorkbookRows(selectedFile);
      setPreviewRows(rows.slice(0, 8));

      if (!rows.length && clientErrors.length) {
        setRowErrors(clientErrors);
        setFailedRows(buildFailedEditableRows(clientErrors, draftRowsByNumber));
        setSummary({
          receivedRows: clientErrors.length,
          processedRows: 0,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: clientErrors.length,
          batchesProcessed: 0,
          totalBatches: 0,
        });
        return;
      }

      const token = localStorage.getItem('token');
      const batches = chunkRows(rows, BATCH_SIZE);
      const aggregateSummary: UploadSummary = {
        receivedRows: rows.length + clientErrors.length,
        processedRows: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: clientErrors.length,
        batchesProcessed: 0,
        totalBatches: batches.length,
      };
      const aggregateErrors = [...clientErrors];
      const uploadedRowMap = new Map<number, NormalizedUploadRow>(draftRowsByNumber);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        batch.forEach((row) => {
          uploadedRowMap.set(Number(row.sourceRowNumber || 0), row);
        });
        setProgressMessage(`Uploading batch ${batchIndex + 1} of ${batches.length} (${batch.length} rows)...`);
        const response = await fetchApiJson(apiUrl('/api/products/bulk-upsert'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rows: batch, duplicateMode }),
        });

        aggregateSummary.processedRows += Number(response?.data?.processedRows || 0);
        aggregateSummary.createdCount += Number(response?.data?.createdCount || 0);
        aggregateSummary.updatedCount += Number(response?.data?.updatedCount || 0);
        aggregateSummary.skippedCount += Number(response?.data?.skippedCount || 0);
        aggregateSummary.errorCount += Number(response?.data?.errorCount || 0);
        aggregateSummary.batchesProcessed = batchIndex + 1;
        aggregateErrors.push(...((Array.isArray(response?.data?.errors) ? response.data.errors : []) as RowError[]));
      }

      setSummary(aggregateSummary);
      setRowErrors(aggregateErrors);
      setFailedRows(buildFailedEditableRows(aggregateErrors, uploadedRowMap));
      if (aggregateSummary.createdCount > 0 || aggregateSummary.updatedCount > 0) {
        notifyProductsChanged();
      }
      setProgressMessage(
        `Completed ${aggregateSummary.batchesProcessed}/${aggregateSummary.totalBatches} batches. Created ${aggregateSummary.createdCount}, updated ${aggregateSummary.updatedCount}, skipped ${aggregateSummary.skippedCount}.`
      );
    } catch (error: any) {
      const message = error?.message || 'Bulk upload failed.';
      setHeaderError(message);
      setProgressMessage('');
      await showAlertDialog(message);
    } finally {
      setProcessingUpload(false);
    }
  };

  const updateFailedRowField = (rowNumber: number, field: string, value: any) => {
    setFailedRows((prev) =>
      prev.map((entry) =>
        entry.rowNumber === rowNumber
          ? {
              ...entry,
              row: {
                ...entry.row,
                [field]: value,
              },
              messages: validateEditableDraftRow({
                ...entry.row,
                [field]: value,
              }),
            }
          : entry
      )
    );
  };

  const removeFailedRow = (rowNumber: number) => {
    setFailedRows((prev) => prev.filter((entry) => entry.rowNumber !== rowNumber));
    setRowErrors((prev) => prev.filter((entry) => Number(entry.rowNumber || 0) !== rowNumber));
  };

  const retryFailedRows = async () => {
    if (!failedRows.length) {
      await showAlertDialog('There are no failed rows to retry.');
      return;
    }

    try {
      setProcessingUpload(true);
      setHeaderError('');
      setProgressMessage('Validating edited failed rows...');

      const token = localStorage.getItem('token');
      const localErrors: RowError[] = [];
      const retryableRows: NormalizedUploadRow[] = [];
      const rowMap = new Map<number, NormalizedUploadRow>();

      failedRows.forEach((entry) => {
        rowMap.set(entry.rowNumber, entry.row);
        const messages = validateEditableDraftRow(entry.row);
        if (messages.length) {
          localErrors.push({
            rowNumber: entry.rowNumber,
            sku: String(entry.row.sku || ''),
            name: String(entry.row.name || ''),
            messages,
          });
          return;
        }
        retryableRows.push({
          ...entry.row,
          sourceRowNumber: entry.rowNumber,
        });
      });

      if (!retryableRows.length) {
        setRowErrors(localErrors);
        setFailedRows(buildFailedEditableRows(localErrors, rowMap));
        setSummary({
          receivedRows: failedRows.length,
          processedRows: 0,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: localErrors.length,
          batchesProcessed: 0,
          totalBatches: 0,
        });
        setProgressMessage('');
        return;
      }

      const batches = chunkRows(retryableRows, BATCH_SIZE);
      const aggregateSummary: UploadSummary = {
        receivedRows: failedRows.length,
        processedRows: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: localErrors.length,
        batchesProcessed: 0,
        totalBatches: batches.length,
      };
      const aggregateErrors = [...localErrors];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        setProgressMessage(`Retrying failed rows: batch ${batchIndex + 1} of ${batches.length}...`);
        const response = await fetchApiJson(apiUrl('/api/products/bulk-upsert'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rows: batch, duplicateMode }),
        });

        aggregateSummary.processedRows += Number(response?.data?.processedRows || 0);
        aggregateSummary.createdCount += Number(response?.data?.createdCount || 0);
        aggregateSummary.updatedCount += Number(response?.data?.updatedCount || 0);
        aggregateSummary.skippedCount += Number(response?.data?.skippedCount || 0);
        aggregateSummary.errorCount += Number(response?.data?.errorCount || 0);
        aggregateSummary.batchesProcessed = batchIndex + 1;
        aggregateErrors.push(...((Array.isArray(response?.data?.errors) ? response.data.errors : []) as RowError[]));
      }

      setSummary(aggregateSummary);
      setRowErrors(aggregateErrors);
      setFailedRows(buildFailedEditableRows(aggregateErrors, rowMap));
      setPreviewRows(retryableRows.slice(0, 8));
      if (aggregateSummary.createdCount > 0 || aggregateSummary.updatedCount > 0) {
        notifyProductsChanged();
      }
      setProgressMessage(
        `Retry completed. Created ${aggregateSummary.createdCount}, updated ${aggregateSummary.updatedCount}, skipped ${aggregateSummary.skippedCount}.`
      );
    } catch (error: any) {
      const message = error?.message || 'Retry failed.';
      setHeaderError(message);
      setProgressMessage('');
      await showAlertDialog(message);
    } finally {
      setProcessingUpload(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-200/80">Catalog Workspace</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Bulk Product Entry</h1>
          <p className="mt-3 text-sm text-gray-300">
            Download the Excel template, fill your product rows, and upload them here in bulk. The upload validates headers, data
            types, and required fields, then inserts or updates products batch by batch.
          </p>
          <p className="mt-2 text-xs text-gray-500 sm:text-sm">
            The dashboard worth metric uses <span className="font-semibold text-gray-300">Quantity In Stock × Wholesale Purchase Price</span>.
            Large files are processed in batches of {BATCH_SIZE} rows so uploads stay stable up to {MAX_CLIENT_ROWS.toLocaleString()} rows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ManualHelpLink anchor="product-entry-logic" label="Catalog help" />
          <Link to="/products" className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">
            Product Center
          </Link>
          <Link to="/products/entry" className="rounded-md bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
            Single Product Entry
          </Link>
          <Link to="/products/catalog" className="rounded-md bg-sky-500/20 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">
            Product Catalog
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Template And Upload</p>
              <p className="mt-1 text-sm text-gray-400">
                Use the generated workbook so the headers stay correct and row updates match products by SKU.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              disabled={downloadingTemplate}
              className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-400 disabled:opacity-60"
            >
              {downloadingTemplate ? 'Preparing template...' : 'Download Excel Template'}
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
            <label className="block text-sm font-medium text-white">Upload filled Excel file</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setSelectedFile(file);
                setHeaderError('');
                setSummary(null);
                setRowErrors([]);
                setFailedRows([]);
                setPreviewRows([]);
                setProgressMessage('');
              }}
              className="mt-3 block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20"
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-300">
                {selectedFile ? (
                  <>
                    <span className="font-semibold text-white">{selectedFile.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({Math.max(1, Math.round(selectedFile.size / 1024))} KB)</span>
                  </>
                ) : (
                  'No file selected yet.'
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={!selectedFile || processingUpload}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
              >
                {processingUpload ? 'Processing upload...' : 'Validate And Upload'}
              </button>
            </div>
            {progressMessage ? <p className="mt-3 text-xs text-cyan-200">{progressMessage}</p> : null}
            {headerError ? <p className="mt-3 text-sm text-rose-300">{headerError}</p> : null}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
            <p className="text-sm font-medium text-white">Duplicate SKU Handling</p>
            <p className="mt-1 text-xs text-gray-400">
              Choose what should happen when a SKU from the upload already exists in this tenant.
            </p>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {[
                {
                  value: 'update_existing',
                  label: 'Update Existing',
                  help: 'Use the uploaded row to update the existing product for the same SKU.',
                },
                {
                  value: 'skip_existing',
                  label: 'Skip Existing',
                  help: 'Leave existing products unchanged and skip duplicate SKUs from this upload.',
                },
                {
                  value: 'error_existing',
                  label: 'Show As Error',
                  help: 'Send duplicate SKUs to the failed rows table so they can be reviewed and edited.',
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDuplicateMode(option.value as DuplicateMode)}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    duplicateMode === option.value
                      ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <div className="text-sm font-semibold">{option.label}</div>
                  <div className={`mt-1 text-xs ${duplicateMode === option.value ? 'text-cyan-100/85' : 'text-gray-400'}`}>{option.help}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-black/10">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-gray-400">
                  <th className="px-3 py-3">Template Field</th>
                  <th className="px-3 py-3">Required</th>
                  <th className="px-3 py-3">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {TEMPLATE_COLUMNS.map((column) => (
                  <tr key={column.key}>
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm font-semibold text-white">{column.label}</p>
                      <p className="mt-1 text-xs text-gray-400">{column.description}</p>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-300">{column.required ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-3 text-sm text-cyan-200">{column.example || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Upload Summary</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-gray-400">Required Headers</p>
                <p className="mt-2 text-lg font-semibold text-white">{requiredHeaders.length}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-gray-400">Categories Listed</p>
                <p className="mt-2 text-lg font-semibold text-white">{categories.length}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-gray-400">Preview Rows</p>
                <p className="mt-2 text-lg font-semibold text-white">{previewRows.length}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-gray-400">Error Rows</p>
                <p className="mt-2 text-lg font-semibold text-rose-300">{rowErrors.length}</p>
              </div>
            </div>

            {summary ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-xs text-gray-400">Received</p>
                  <p className="mt-2 text-lg font-semibold text-white">{summary.receivedRows}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-xs text-gray-400">Processed</p>
                  <p className="mt-2 text-lg font-semibold text-cyan-200">{summary.processedRows}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-xs text-gray-400">Created</p>
                  <p className="mt-2 text-lg font-semibold text-emerald-300">{summary.createdCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-xs text-gray-400">Updated</p>
                  <p className="mt-2 text-lg font-semibold text-amber-200">{summary.updatedCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-xs text-gray-400">Skipped</p>
                  <p className="mt-2 text-lg font-semibold text-slate-200">{summary.skippedCount}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-gray-300">
              {duplicateMode === 'update_existing'
                ? 'Matching SKUs update the existing product in this tenant. New SKUs create new products.'
                : duplicateMode === 'skip_existing'
                  ? 'Matching SKUs are skipped and left unchanged. New SKUs still create new products.'
                  : 'Matching SKUs are sent to the failed rows table so you can edit them before retrying.'}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200/80">Preview</p>
            <div className="mt-4 space-y-3">
              {previewRows.map((row) => (
                <div key={`${row.sourceRowNumber}-${row.sku}`} className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <p className="text-sm font-semibold text-white">{row.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Row {row.sourceRowNumber} • {row.sku} • {row.category}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
                    <span className="rounded-full bg-white/10 px-2.5 py-1">Sell {row.price}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1">Wholesale {row.wholesalePrice}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1">Stock {row.stock}</span>
                  </div>
                </div>
              ))}
              {!previewRows.length ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-gray-400">
                  Upload a file to preview the first few parsed rows here.
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-200/80">Row-wise Validation</p>
            <p className="mt-1 text-sm text-gray-400">
              Fix the rows below in Excel and upload again. Only the first 200 errors are shown here for readability.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-gray-300">
            {rowErrors.length} error row{rowErrors.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/10">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.14em] text-gray-400">
                <th className="px-3 py-3">Row</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {displayedErrors.map((error, index) => (
                <tr key={`${error.rowNumber}-${error.sku || 'row'}-${index}`}>
                  <td className="px-3 py-3 text-sm text-white">{error.rowNumber}</td>
                  <td className="px-3 py-3 text-sm text-cyan-200">{error.sku || '-'}</td>
                  <td className="px-3 py-3 text-sm text-gray-300">{error.name || '-'}</td>
                  <td className="px-3 py-3 text-sm text-rose-300">{error.messages.join(' ')}</td>
                </tr>
              ))}
              {!displayedErrors.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                    No validation errors yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {rowErrors.length > displayedErrors.length ? (
          <p className="mt-3 text-xs text-gray-500">
            Showing the first {displayedErrors.length} error rows out of {rowErrors.length}.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200/80">Failed Rows Editor</p>
            <p className="mt-1 text-sm text-gray-400">
              Edit failed rows here and retry them directly without going back to Excel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-gray-300">
              {failedRows.length} editable failed row{failedRows.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={() => void retryFailedRows()}
              disabled={!failedRows.length || processingUpload}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
            >
              {processingUpload ? 'Retrying...' : 'Retry Failed Rows'}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/10">
          <table className="min-w-[1600px] divide-y divide-white/10">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.14em] text-gray-400">
                <th className="px-3 py-3">Row</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Barcode</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Sell</th>
                <th className="px-3 py-3">Wholesale</th>
                <th className="px-3 py-3">Cost</th>
                <th className="px-3 py-3">Stock</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3">GST</th>
                <th className="px-3 py-3">HSN</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Variant Matrix JSON</th>
                <th className="px-3 py-3">Price Tiers JSON</th>
                <th className="px-3 py-3">Issue</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {failedRows.map((entry) => (
                <tr key={`failed-${entry.rowNumber}`}>
                  <td className="px-3 py-3 text-sm text-white">{entry.rowNumber}</td>
                  <td className="px-3 py-3">
                    <input value={entry.row.name || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'name', e.target.value)} className="w-40 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input value={entry.row.sku || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'sku', e.target.value.toUpperCase())} className="w-36 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input value={entry.row.barcode || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'barcode', e.target.value.toUpperCase())} className="w-40 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input value={entry.row.category || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'category', e.target.value)} className="w-32 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input type="number" min="0" step="0.01" value={entry.row.price || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'price', e.target.value)} className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input type="number" min="0" step="0.01" value={entry.row.wholesalePrice || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'wholesalePrice', e.target.value)} className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input type="number" min="0" step="0.01" value={entry.row.cost || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'cost', e.target.value)} className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input type="number" min="0" step="0.01" value={entry.row.stock || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'stock', e.target.value)} className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input value={entry.row.unit || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'unit', e.target.value)} className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input type="number" min="0" step="0.01" value={entry.row.gstRate || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'gstRate', e.target.value)} className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <input value={entry.row.hsnCode || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'hsnCode', e.target.value)} className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <select value={entry.row.isActive ? 'active' : 'inactive'} onChange={(e) => updateFailedRowField(entry.rowNumber, 'isActive', e.target.value === 'active')} className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white">
                      <option value="active" className="bg-gray-900">Active</option>
                      <option value="inactive" className="bg-gray-900">Inactive</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <textarea value={entry.row.variantMatrix || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'variantMatrix', e.target.value)} rows={3} className="w-52 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
                  </td>
                  <td className="px-3 py-3">
                    <textarea value={entry.row.priceTiers || ''} onChange={(e) => updateFailedRowField(entry.rowNumber, 'priceTiers', e.target.value)} rows={3} className="w-52 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
                  </td>
                  <td className="px-3 py-3 text-xs text-rose-300">{entry.messages.join(' ')}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => removeFailedRow(entry.rowNumber)} className="rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!failedRows.length ? (
                <tr>
                  <td colSpan={17} className="px-3 py-8 text-center text-sm text-gray-400">
                    No failed rows waiting for inline editing.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
