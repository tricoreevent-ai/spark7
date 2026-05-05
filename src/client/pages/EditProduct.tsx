import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CodeScannerSettingsDialog } from '../components/CodeScannerSettingsDialog';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useCodeScannerCapture } from '../hooks/useCodeScannerCapture';
import { useCategories } from '../hooks/useCategories';
import { apiUrl } from '../utils/api';
import { showAlertDialog } from '../utils/appDialogs';
import {
  getCodeScannerModeLabel,
  getCodeScannerSettings,
  getCodeScannerSubmitLabel,
  isConfiguredScannerSubmitKey,
  saveCodeScannerSettings,
} from '../utils/codeScanner';
import { notifyProductsChanged } from '../utils/productCatalogEvents';

interface VariantMatrixRowForm {
  rowId: string;
  size: string;
  color: string;
  skuSuffix: string;
  barcode: string;
  price: string;
  isActive: boolean;
}

interface PriceTierRowForm {
  rowId: string;
  tierName: string;
  minQuantity: string;
  unitPrice: string;
}

const makeLocalRowId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const splitVariantTokens = (value: string): string[] =>
  Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );

const buildVariantMatrixRows = (
  sizesRaw: string,
  colorsRaw: string,
  basePrice: string,
  existing: VariantMatrixRowForm[]
): VariantMatrixRowForm[] => {
  const sizes = splitVariantTokens(sizesRaw);
  const colors = splitVariantTokens(colorsRaw);
  const price = String(basePrice || '').trim();
  const nextRows: VariantMatrixRowForm[] = [];
  const existingMap = new Map(
    existing.map((row) => [`${String(row.size || '').toLowerCase()}::${String(row.color || '').toLowerCase()}`, row])
  );

  if (!sizes.length && !colors.length) return existing;

  if (sizes.length && colors.length) {
    sizes.forEach((size) => {
      colors.forEach((color) => {
        const key = `${size.toLowerCase()}::${color.toLowerCase()}`;
        const prior = existingMap.get(key);
        nextRows.push(
          prior || {
            rowId: makeLocalRowId(),
            size,
            color,
            skuSuffix: `${size}-${color}`.replace(/\s+/g, '-').toUpperCase(),
            barcode: '',
            price,
            isActive: true,
          }
        );
      });
    });
    return nextRows;
  }

  const singles = sizes.length ? sizes : colors;
  const singleField = sizes.length ? 'size' : 'color';
  singles.forEach((token) => {
    const key = sizes.length ? `${token.toLowerCase()}::` : `::${token.toLowerCase()}`;
    const prior = existingMap.get(key);
    nextRows.push(
      prior || {
        rowId: makeLocalRowId(),
        size: singleField === 'size' ? token : '',
        color: singleField === 'color' ? token : '',
        skuSuffix: token.replace(/\s+/g, '-').toUpperCase(),
        barcode: '',
        price,
        isActive: true,
      }
    );
  });
  return nextRows;
};

export const EditProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { categories, loading: categoriesLoading } = useCategories();
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category: '',
    subcategory: '',
    itemType: 'inventory',
    price: '',
    wholesalePrice: '',
    promotionalPrice: '',
    promotionStartDate: '',
    promotionEndDate: '',
    cost: '',
    hsnCode: '',
    gstRate: '18',
    cgstRate: '9',
    sgstRate: '9',
    igstRate: '0',
    stock: '',
    openingStockValue: '',
    stockLedgerAccountId: '',
    minStock: '5',
    autoReorder: false,
    reorderQuantity: '0',
    unit: 'piece',
    imageUrl: '',
    batchTracking: false,
    expiryRequired: false,
    serialNumberTracking: false,
    allowNegativeStock: false,
    variantSize: '',
    variantColor: '',
    variantMatrix: [] as VariantMatrixRowForm[],
    priceTiers: [] as PriceTierRowForm[],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [enableCodeScanner, setEnableCodeScanner] = useState(false);
  const [showScannerSettings, setShowScannerSettings] = useState(false);
  const [scannerSettings, setScannerSettings] = useState(() => getCodeScannerSettings());
  const [scanTarget, setScanTarget] = useState<'sku' | 'barcode'>('barcode');
  const [scanValue, setScanValue] = useState('');
  const scannerInputRef = useRef<HTMLInputElement | null>(null);

  useEscapeKey(() => navigate('/products/catalog'), {
    enabled: !showScannerSettings,
    ignoreTypingTarget: true,
  });

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) {
        setLoading(false);
        await showAlertDialog('Missing product id');
        navigate('/products/catalog');
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(apiUrl(`/api/products/${id}`), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          await showAlertDialog('Failed to fetch product details');
          navigate('/products/catalog');
          return;
        }

        const payload = await response.json();
        const product = payload?.data || payload;

        setFormData({
          name: String(product?.name || ''),
          sku: String(product?.sku || ''),
          barcode: String(product?.barcode || ''),
          description: String(product?.description || ''),
          category: String(product?.category || ''),
          subcategory: String(product?.subcategory || ''),
          itemType: String(product?.itemType || 'inventory'),
          price: String(product?.price ?? ''),
          wholesalePrice: String(product?.wholesalePrice ?? ''),
          promotionalPrice: String(product?.promotionalPrice ?? ''),
          promotionStartDate: product?.promotionStartDate ? String(product.promotionStartDate).slice(0, 10) : '',
          promotionEndDate: product?.promotionEndDate ? String(product.promotionEndDate).slice(0, 10) : '',
          cost: String(product?.cost ?? ''),
          hsnCode: String(product?.hsnCode || ''),
          gstRate: String(product?.gstRate ?? 18),
          cgstRate: String(product?.cgstRate ?? 0),
          sgstRate: String(product?.sgstRate ?? 0),
          igstRate: String(product?.igstRate ?? 0),
          stock: String(product?.stock ?? 0),
          openingStockValue: String(product?.openingStockValue ?? 0),
          stockLedgerAccountId: String(product?.stockLedgerAccountId || ''),
          minStock: String(product?.minStock ?? 5),
          autoReorder: Boolean(product?.autoReorder),
          reorderQuantity: String(product?.reorderQuantity ?? 0),
          unit: String(product?.unit || 'piece'),
          imageUrl: String(product?.imageUrl || ''),
          batchTracking: Boolean(product?.batchTracking),
          expiryRequired: Boolean(product?.expiryRequired),
          serialNumberTracking: Boolean(product?.serialNumberTracking),
          allowNegativeStock: Boolean(product?.allowNegativeStock),
          variantSize: String(product?.variantSize || ''),
          variantColor: String(product?.variantColor || ''),
          variantMatrix: Array.isArray(product?.variantMatrix)
            ? product.variantMatrix.map((row: any) => ({
              rowId: String(row?.rowId || row?._id || makeLocalRowId()),
              size: String(row?.size || ''),
              color: String(row?.color || ''),
              skuSuffix: String(row?.skuSuffix || ''),
              barcode: String(row?.barcode || ''),
              price: String(row?.price ?? ''),
              isActive: row?.isActive !== false,
            }))
            : [],
          priceTiers: Array.isArray(product?.priceTiers)
            ? product.priceTiers.map((row: any) => ({
              rowId: String(row?.rowId || row?._id || makeLocalRowId()),
              tierName: String(row?.tierName || ''),
              minQuantity: String(row?.minQuantity ?? 1),
              unitPrice: String(row?.unitPrice ?? ''),
            }))
            : [],
        });
      } catch (error) {
        console.error(error);
        await showAlertDialog('Error loading product');
      } finally {
        setLoading(false);
      }
    };

    void fetchProduct();
  }, [id, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const nextValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: nextValue }));
  };

  const updatePriceTier = (index: number, field: 'tierName' | 'minQuantity' | 'unitPrice', value: string) => {
    setFormData((prev) => ({
      ...prev,
      priceTiers: prev.priceTiers.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    }));
  };

  const addPriceTier = () => {
    setFormData((prev) => ({
      ...prev,
      priceTiers: [...prev.priceTiers, { rowId: makeLocalRowId(), tierName: '', minQuantity: '1', unitPrice: '' }],
    }));
  };

  const removePriceTier = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      priceTiers: prev.priceTiers.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const updateVariantMatrixRow = (index: number, field: keyof VariantMatrixRowForm, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      variantMatrix: prev.variantMatrix.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    }));
  };

  const addVariantMatrixRow = () => {
    setFormData((prev) => ({
      ...prev,
      variantMatrix: [
        ...prev.variantMatrix,
        { rowId: makeLocalRowId(), size: '', color: '', skuSuffix: '', barcode: '', price: prev.price || '', isActive: true },
      ],
    }));
  };

  const removeVariantMatrixRow = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variantMatrix: prev.variantMatrix.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const generateVariantMatrix = () => {
    setFormData((prev) => ({
      ...prev,
      variantMatrix: buildVariantMatrixRows(prev.variantSize, prev.variantColor, prev.price, prev.variantMatrix),
    }));
  };

  const focusScannerInput = () => {
    if (!scannerSettings.autoFocusInput) return;
    window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    }, 20);
  };

  useEffect(() => {
    if (enableCodeScanner) {
      focusScannerInput();
    }
  }, [enableCodeScanner, scannerSettings.autoFocusInput]);

  const applyScannedCode = (rawValue?: string) => {
    const code = String(rawValue ?? scanValue ?? '').trim().toUpperCase();
    if (!code) {
      void showAlertDialog('Please scan or enter a product code first.');
      return;
    }

    setFormData((prev) => ({ ...prev, [scanTarget]: code }));
    setScanValue('');
    focusScannerInput();
  };

  useCodeScannerCapture({
    enabled: enableCodeScanner,
    settings: scannerSettings,
    onScan: (value) => {
      setScanValue(value);
      applyScannedCode(value);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl(`/api/products/${id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          itemType: formData.itemType,
          price: Number(formData.price),
          wholesalePrice: Number(formData.wholesalePrice || 0),
          promotionalPrice: Number(formData.promotionalPrice || 0),
          promotionStartDate: formData.promotionStartDate || undefined,
          promotionEndDate: formData.promotionEndDate || undefined,
          cost: Number(formData.cost),
          hsnCode: formData.hsnCode.trim() || undefined,
          stock: Number(formData.stock),
          minStock: Number(formData.minStock),
          reorderQuantity: Number(formData.reorderQuantity || 0),
          gstRate: Number(formData.gstRate),
          cgstRate: Number(formData.cgstRate || 0),
          sgstRate: Number(formData.sgstRate || 0),
          igstRate: Number(formData.igstRate || 0),
          openingStockValue: Number(formData.openingStockValue || 0),
          stockLedgerAccountId: formData.stockLedgerAccountId.trim() || undefined,
          priceTiers: formData.priceTiers
            .map((row) => ({
              tierName: row.tierName.trim(),
              minQuantity: Number(row.minQuantity || 1),
              unitPrice: Number(row.unitPrice || 0),
            }))
            .filter((row) => row.unitPrice > 0),
          variantMatrix: formData.variantMatrix
            .map((row) => ({
              size: row.size.trim(),
              color: row.color.trim(),
              skuSuffix: row.skuSuffix.trim().toUpperCase(),
              barcode: row.barcode.trim().toUpperCase(),
              price: Number(row.price || 0),
              isActive: row.isActive !== false,
            }))
            .filter((row) => row.size || row.color || row.skuSuffix || row.barcode || row.price > 0),
        }),
      });

      if (response.ok) {
        notifyProductsChanged();
        await showAlertDialog('Product updated successfully', { title: 'Product Updated', severity: 'success' });
        navigate('/products/catalog');
      } else {
        const data = await response.json();
        await showAlertDialog(data.error || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      await showAlertDialog('Error updating product');
    } finally {
      setSubmitting(false);
    }
  };

  const sectionClassName = 'min-w-0 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.28)]';
  const labelClassName = 'block text-sm font-medium leading-6 text-white';
  const fieldClassName = 'mt-1 block w-full rounded-md bg-white/5 px-3 py-2 text-sm text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500';
  const compactFieldClassName = 'w-full min-w-0 rounded-md bg-black/20 px-3 py-1.5 text-xs text-white outline-1 -outline-offset-1 outline-white/15 placeholder:text-gray-400';

  if (loading) {
    return (
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8 2xl:px-10">
        <div className="mx-auto w-full max-w-[1600px] rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-sm text-gray-400">
          Loading product workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8 2xl:px-10">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-emerald-200/80">Product Entry</p>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Edit Product</h1>
            <p className="mt-2 text-sm text-gray-400 sm:text-base">
              Use the same full workspace as Add New Product to revise catalog basics, pricing, stock, variants, and controls without losing the lower fields or action buttons.
            </p>
            <p className="mt-2 text-xs text-gray-500 sm:text-sm">
              Update identity, pricing, GST, opening stock, reorder, variants, and tracking flags here. Changes made on this screen flow directly into catalog review, stock alerts, POS tax handling, and item-level sales reporting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ManualHelpLink anchor="product-entry-logic" />
            <Link to="/products" className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">
              Product Center
            </Link>
            <Link to="/products/bulk-entry" className="rounded-md bg-violet-500/20 px-3 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/30">
              Bulk Entry
            </Link>
            <Link to="/products/catalog" className="rounded-md bg-sky-500/20 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">
              Product Catalog
            </Link>
            <Link to="/products/alerts" className="rounded-md bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30">
              Stock Alerts
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 pb-28">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className={`${sectionClassName} xl:col-span-6 2xl:col-span-3`}>
              <div className="mb-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Core Details</p>
                <p className="mt-1 text-xs text-gray-400">Update identity fields first and use the optional scanner when barcode hardware is available.</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-emerald-200">Product Code Scanner</p>
                    <p className="mt-1 text-[11px] text-emerald-100/80">
                      Mode: {getCodeScannerModeLabel(scannerSettings.captureMode)} • Submit: {getCodeScannerSubmitLabel(scannerSettings.submitKey)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowScannerSettings(true)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
                      title="Code Scanner settings"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                        <path d="M11.983 1.722a1 1 0 0 0-1.966 0l-.143.86a7.329 7.329 0 0 0-1.62.669l-.708-.507a1 1 0 0 0-1.37.12L4.6 4.44a1 1 0 0 0 .12 1.37l.507.708a7.329 7.329 0 0 0-.669 1.62l-.86.143a1 1 0 0 0 0 1.966l.86.143c.13.564.354 1.105.669 1.62l-.507.708a1 1 0 0 0-.12 1.37l1.576 1.576a1 1 0 0 0 1.37.12l.708-.507c.515.315 1.056.539 1.62.669l.143.86a1 1 0 0 0 1.966 0l.143-.86a7.33 7.33 0 0 0 1.62-.669l.708.507a1 1 0 0 0 1.37-.12l1.576-1.576a1 1 0 0 0-.12-1.37l-.507-.708a7.33 7.33 0 0 0 .669-1.62l.86-.143a1 1 0 0 0 0-1.966l-.86-.143a7.33 7.33 0 0 0-.669-1.62l.507-.708a1 1 0 0 0 .12-1.37L13.824 2.864a1 1 0 0 0-1.37-.12l-.708.507a7.329 7.329 0 0 0-1.62-.669l-.143-.86ZM10 12.75A2.75 2.75 0 1 1 10 7.25a2.75 2.75 0 0 1 0 5.5Z" />
                      </svg>
                      Code Scanner
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnableCodeScanner((prev) => !prev)}
                      className={`rounded px-2 py-1 text-[11px] font-semibold ${enableCodeScanner ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-200'}`}
                    >
                      {enableCodeScanner ? 'Scanner On' : 'Scanner Off'}
                    </button>
                  </div>
                </div>
                {enableCodeScanner ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        value={scanTarget}
                        onChange={(e) => setScanTarget(e.target.value as 'sku' | 'barcode')}
                        className={`${compactFieldClassName} [&>option]:bg-gray-900`}
                      >
                        <option value="barcode">Apply to Barcode</option>
                        <option value="sku">Apply to SKU</option>
                      </select>
                      <input
                        ref={scannerInputRef}
                        type="text"
                        value={scanValue}
                        onChange={(e) => setScanValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (isConfiguredScannerSubmitKey(e.key, scannerSettings.submitKey)) {
                            e.preventDefault();
                            applyScannedCode();
                          }
                        }}
                        placeholder={`Scan code and press ${getCodeScannerSubmitLabel(scannerSettings.submitKey)}`}
                        className={compactFieldClassName}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => applyScannedCode()}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                    >
                      Apply Scanned Code
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-100/80">Turn this on when you want to scan directly into SKU or barcode.</p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClassName}>Product Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} required className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>SKU</label>
                <input type="text" name="sku" value={formData.sku} onChange={handleChange} required className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Barcode</label>
                <input type="text" name="barcode" value={formData.barcode} onChange={handleChange} placeholder="Optional barcode" className={fieldClassName} />
              </div>
            </div>
          </section>

          <section className={`${sectionClassName} xl:col-span-6 2xl:col-span-3`}>
            <div className="mb-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200/80">Catalog Setup</p>
              <p className="mt-1 text-xs text-gray-400">Keep category, subcategory, item type, and description together for faster master setup.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={labelClassName}>Category</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className={`${fieldClassName} [&>option]:bg-gray-900`}
                >
                  <option value="">Select Category</option>
                  {categoriesLoading ? (
                    <option disabled>Loading categories...</option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat._id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className={labelClassName}>Subcategory</label>
                <input type="text" name="subcategory" value={formData.subcategory} onChange={handleChange} placeholder="Optional subcategory" className={fieldClassName} />
              </div>

              <div>
                <label className={labelClassName}>Item Type</label>
                <select name="itemType" value={formData.itemType} onChange={handleChange} className={`${fieldClassName} [&>option]:bg-gray-900`}>
                  <option value="inventory">Inventory Item</option>
                  <option value="service">Service</option>
                  <option value="non_inventory">Non-Inventory Item</option>
                </select>
              </div>

              <div>
                <label className={labelClassName}>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={6}
                  placeholder="Product description"
                  className={`${fieldClassName} resize-y`}
                />
              </div>
            </div>
          </section>

          <section className={`${sectionClassName} xl:col-span-6 2xl:col-span-3`}>
            <div className="mb-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-200/80">Pricing And Tax</p>
              <p className="mt-1 text-xs text-gray-400">Selling, cost, promotional, GST, and HSN details are grouped together for easier review.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClassName}>Price (Selling)</label>
                <input type="number" name="price" value={formData.price} onChange={handleChange} required min="0" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Cost (Buying)</label>
                <input type="number" name="cost" value={formData.cost} onChange={handleChange} required min="0" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Wholesale Price</label>
                <input type="number" name="wholesalePrice" value={formData.wholesalePrice} onChange={handleChange} min="0" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>HSN / SAC Code</label>
                <input type="text" name="hsnCode" value={formData.hsnCode} onChange={handleChange} placeholder="9506 / 9983" className={fieldClassName} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <label className={labelClassName}>Promotional Price</label>
                <input type="number" name="promotionalPrice" value={formData.promotionalPrice} onChange={handleChange} min="0" step="0.01" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Promo Start</label>
                <input type="date" name="promotionStartDate" value={formData.promotionStartDate} onChange={handleChange} className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Promo End</label>
                <input type="date" name="promotionEndDate" value={formData.promotionEndDate} onChange={handleChange} className={fieldClassName} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClassName}>GST Rate (%)</label>
                <select name="gstRate" value={formData.gstRate} onChange={handleChange} className={`${fieldClassName} [&>option]:bg-gray-900`}>
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              <div>
                <label className={labelClassName}>Unit</label>
                <select name="unit" value={formData.unit} onChange={handleChange} className={`${fieldClassName} [&>option]:bg-gray-900`}>
                  <option value="piece">Piece</option>
                  <option value="pcs">Pcs</option>
                  <option value="kg">Kg</option>
                  <option value="gram">Gram</option>
                  <option value="liter">Liter</option>
                  <option value="ml">ML</option>
                  <option value="meter">Meter</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                  <option value="dozen">Dozen</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClassName}>CGST %</label>
                <input type="number" name="cgstRate" value={formData.cgstRate} onChange={handleChange} min="0" step="0.01" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>SGST %</label>
                <input type="number" name="sgstRate" value={formData.sgstRate} onChange={handleChange} min="0" step="0.01" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>IGST %</label>
                <input type="number" name="igstRate" value={formData.igstRate} onChange={handleChange} min="0" step="0.01" className={fieldClassName} />
              </div>
            </div>

            <div>
              <label className={labelClassName}>Image URL</label>
              <input type="url" name="imageUrl" value={formData.imageUrl} onChange={handleChange} placeholder="https://example.com/product.jpg" className={fieldClassName} />
            </div>
          </section>

          <section className={`${sectionClassName} xl:col-span-6 2xl:col-span-3`}>
            <div className="mb-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200/80">Stock And Controls</p>
              <p className="mt-1 text-xs text-gray-400">Stock, reorder, and quick variant inputs stay visible on the first screen for faster desktop entry.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClassName}>Initial Stock</label>
                <input type="number" name="stock" value={formData.stock} onChange={handleChange} required min="0" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Min Stock Alert</label>
                <input type="number" name="minStock" value={formData.minStock} onChange={handleChange} required min="0" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Opening Stock Value</label>
                <input type="number" name="openingStockValue" value={formData.openingStockValue} onChange={handleChange} min="0" step="0.01" placeholder="Initial valuation amount" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Stock Ledger Account ID</label>
                <input type="text" name="stockLedgerAccountId" value={formData.stockLedgerAccountId} onChange={handleChange} placeholder="Optional Chart Account ID" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Variant Size</label>
                <input type="text" name="variantSize" value={formData.variantSize} onChange={handleChange} placeholder="e.g. XS, S, M, L" className={fieldClassName} />
              </div>
              <div>
                <label className={labelClassName}>Variant Color</label>
                <input type="text" name="variantColor" value={formData.variantColor} onChange={handleChange} placeholder="e.g. Black, Blue" className={fieldClassName} />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" name="autoReorder" checked={formData.autoReorder} onChange={handleChange} />
                  Enable auto-reorder suggestion
                </label>
              </div>
              <div>
                <label className={labelClassName}>Preferred Reorder Quantity</label>
                <input type="number" name="reorderQuantity" value={formData.reorderQuantity} onChange={handleChange} min="0" className={fieldClassName} />
              </div>
            </div>

          </section>

          <section className={`${sectionClassName} xl:col-span-12 min-[1800px]:col-span-7`}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Variant Matrix</p>
                <p className="mt-1 text-xs text-gray-400">Generate size and color combinations, then edit barcode, suffix, and price row by row.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={generateVariantMatrix}
                  className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400"
                >
                  Generate Matrix
                </button>
                <button
                  type="button"
                  onClick={addVariantMatrixRow}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  Add Row
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {formData.variantMatrix.map((row, index) => (
                <div
                  key={row.rowId}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 min-[1800px]:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto_auto]"
                >
                  <input value={row.size} onChange={(e) => updateVariantMatrixRow(index, 'size', e.target.value)} placeholder="Size" className={compactFieldClassName} />
                  <input value={row.color} onChange={(e) => updateVariantMatrixRow(index, 'color', e.target.value)} placeholder="Color" className={compactFieldClassName} />
                  <input value={row.skuSuffix} onChange={(e) => updateVariantMatrixRow(index, 'skuSuffix', e.target.value)} placeholder="SKU suffix" className={compactFieldClassName} />
                  <input value={row.barcode} onChange={(e) => updateVariantMatrixRow(index, 'barcode', e.target.value)} placeholder="Variant barcode" className={compactFieldClassName} />
                  <input type="number" min="0" step="0.01" value={row.price} onChange={(e) => updateVariantMatrixRow(index, 'price', e.target.value)} placeholder="Price" className={compactFieldClassName} />
                  <label className="flex items-center gap-2 rounded-md bg-black/20 px-3 py-2 text-xs text-gray-200">
                    <input type="checkbox" checked={row.isActive} onChange={(e) => updateVariantMatrixRow(index, 'isActive', e.target.checked)} />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => removeVariantMatrixRow(index)}
                    className="rounded-md bg-rose-500/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/30"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!formData.variantMatrix.length && (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center text-sm text-gray-400">
                  No variant matrix configured yet. Enter comma-separated sizes and colors above, then click <span className="font-semibold text-gray-200">Generate Matrix</span>.
                </div>
              )}
            </div>
          </section>

          <section className={`${sectionClassName} xl:col-span-12 min-[1800px]:col-span-5`}>
            <div className="mb-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-200/80">Tiers And Tracking</p>
              <p className="mt-1 text-xs text-gray-400">Keep tier pricing and inventory controls visible beside the matrix on large screens.</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Price Tiers</p>
                  <p className="text-xs text-gray-400">Use tier name and minimum quantity for wholesale or volume pricing.</p>
                </div>
                <button
                  type="button"
                  onClick={addPriceTier}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  Add Tier
                </button>
              </div>
              <div className="space-y-2">
                {formData.priceTiers.map((tier, index) => (
                  <div
                    key={tier.rowId}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 min-[1800px]:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_auto]"
                  >
                    <input value={tier.tierName} onChange={(e) => updatePriceTier(index, 'tierName', e.target.value)} placeholder="Tier name" className={compactFieldClassName} />
                    <input type="number" min="1" value={tier.minQuantity} onChange={(e) => updatePriceTier(index, 'minQuantity', e.target.value)} placeholder="Min qty" className={compactFieldClassName} />
                    <input type="number" min="0" step="0.01" value={tier.unitPrice} onChange={(e) => updatePriceTier(index, 'unitPrice', e.target.value)} placeholder="Unit price" className={compactFieldClassName} />
                    <button
                      type="button"
                      onClick={() => removePriceTier(index)}
                      className="rounded-md bg-rose-500/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/30"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {!formData.priceTiers.length && <p className="text-xs text-gray-400">No tier pricing configured.</p>}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3 text-xs text-cyan-100">
                Change these controls carefully. If <span className="font-semibold">Serial Number Tracking</span> is enabled here, the Sales screen will show an optional serial-tracking toggle for that item, but it still stays off by default during billing.
              </div>
              <label className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-gray-200">
                <input type="checkbox" name="batchTracking" checked={formData.batchTracking} onChange={handleChange} className="mt-1" />
                <span>
                  <span className="block font-medium text-white">Batch Tracking</span>
                  <span className="mt-1 block text-xs text-gray-400">Require batch or lot number entry during stock movement and sale.</span>
                </span>
              </label>
              <label className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-gray-200">
                <input type="checkbox" name="expiryRequired" checked={formData.expiryRequired} onChange={handleChange} className="mt-1" />
                <span>
                  <span className="block font-medium text-white">Expiry Required</span>
                  <span className="mt-1 block text-xs text-gray-400">Block sales until an expiry date is captured for the stock being sold.</span>
                </span>
              </label>
              <label className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-gray-200">
                <input type="checkbox" name="serialNumberTracking" checked={formData.serialNumberTracking} onChange={handleChange} className="mt-1" />
                <span>
                  <span className="block font-medium text-white">Serial Number Tracking</span>
                  <span className="mt-1 block text-xs text-gray-400">Require one unique serial number per unit on sales and stock transactions.</span>
                </span>
              </label>
              <label className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-gray-200">
                <input type="checkbox" name="allowNegativeStock" checked={formData.allowNegativeStock} onChange={handleChange} className="mt-1" />
                <span>
                  <span className="block font-medium text-white">Allow Negative Stock</span>
                  <span className="mt-1 block text-xs text-gray-400">Let billing continue even if stock falls below zero for this item.</span>
                </span>
              </label>
            </div>
          </section>
        </div>

          <div className="sticky bottom-3 z-20 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-4 shadow-[0_18px_44px_rgba(2,6,23,0.45)] backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-gray-300">
                <div className="font-semibold text-white">{formData.name || 'Product draft'}</div>
                <div className="mt-1 text-xs text-gray-400">
                  SKU: {formData.sku || 'Pending'} • Category: {formData.category || 'Unassigned'} • Variant rows: {formData.variantMatrix.length}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/products/catalog" className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
                  Back to Catalog
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus:outline-indigo-500 disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Update Product'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      <CodeScannerSettingsDialog
        open={showScannerSettings}
        settings={scannerSettings}
        onClose={() => setShowScannerSettings(false)}
        onSave={(nextSettings) => {
          const saved = saveCodeScannerSettings(nextSettings);
          setScannerSettings(saved);
          setShowScannerSettings(false);
          if (enableCodeScanner) focusScannerInput();
        }}
      />
    </div>
  );
};
