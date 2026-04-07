import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories';
import { apiUrl } from '../utils/api';
import { showAlertDialog } from '../utils/appDialogs';

export const EditProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { categories, loading: categoriesLoading } = useCategories();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
    gstRate: '18',
    stock: '',
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
    priceTiers: [] as Array<{ tierName: string; minQuantity: string; unitPrice: string }>,
  });

  useEffect(() => {
    const fetchProduct = async () => {
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
          gstRate: String(product?.gstRate ?? 18),
          stock: String(product?.stock ?? 0),
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
          priceTiers: Array.isArray(product?.priceTiers)
            ? product.priceTiers.map((row: any) => ({
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

    if (id) void fetchProduct();
  }, [id, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const nextValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
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
      priceTiers: [...prev.priceTiers, { tierName: '', minQuantity: '1', unitPrice: '' }],
    }));
  };

  const removePriceTier = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      priceTiers: prev.priceTiers.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

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
          stock: Number(formData.stock),
          minStock: Number(formData.minStock),
          reorderQuantity: Number(formData.reorderQuantity || 0),
          gstRate: Number(formData.gstRate),
          priceTiers: formData.priceTiers
            .map((row) => ({
              tierName: row.tierName.trim(),
              minQuantity: Number(row.minQuantity || 1),
              unitPrice: Number(row.unitPrice || 0),
            }))
            .filter((row) => row.unitPrice > 0),
        }),
      });

      if (response.ok) {
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

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold leading-7 text-white sm:text-3xl sm:tracking-tight">Edit Product</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium leading-6 text-white">Product Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} required className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-white">SKU</label>
              <input type="text" name="sku" value={formData.sku} onChange={handleChange} required className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-white">Barcode</label>
              <input type="text" name="barcode" value={formData.barcode} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-white">Category</label>
              <select name="category" value={formData.category} onChange={handleChange} required className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 [&>option]:bg-gray-900">
                <option value="">Select Category</option>
                {categoriesLoading ? (
                  <option disabled>Loading categories...</option>
                ) : (
                  categories.map((cat) => (
                    <option key={cat._id} value={cat.name}>{cat.name}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-white">Subcategory</label>
              <input type="text" name="subcategory" value={formData.subcategory} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-white">Item Type</label>
              <select name="itemType" value={formData.itemType} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 [&>option]:bg-gray-900">
                <option value="inventory">Inventory Item</option>
                <option value="service">Service</option>
                <option value="non_inventory">Non-Inventory Item</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-white">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="block w-full rounded-md bg-white/5 px-3 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Price (Selling)</label>
                <input type="number" name="price" value={formData.price} onChange={handleChange} required min="0" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Wholesale Price</label>
                <input type="number" name="wholesalePrice" value={formData.wholesalePrice} onChange={handleChange} min="0" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Promotional Price</label>
                <input type="number" name="promotionalPrice" value={formData.promotionalPrice} onChange={handleChange} min="0" step="0.01" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Promo Start</label>
                <input type="date" name="promotionStartDate" value={formData.promotionStartDate} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Promo End</label>
                <input type="date" name="promotionEndDate" value={formData.promotionEndDate} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Cost (Buying)</label>
                <input type="number" name="cost" value={formData.cost} onChange={handleChange} required min="0" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium leading-6 text-white">GST Rate (%)</label>
                <select name="gstRate" value={formData.gstRate} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 [&>option]:bg-gray-900">
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Unit</label>
                <select name="unit" value={formData.unit} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 [&>option]:bg-gray-900">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Stock</label>
                <input type="number" name="stock" value={formData.stock} onChange={handleChange} required min="0" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Min Stock Alert</label>
                <input type="number" name="minStock" value={formData.minStock} onChange={handleChange} required min="0" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <label className="mb-2 flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" name="autoReorder" checked={formData.autoReorder} onChange={handleChange} />
                Enable auto-reorder suggestion
              </label>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Preferred Reorder Quantity</label>
                <input type="number" name="reorderQuantity" value={formData.reorderQuantity} onChange={handleChange} min="0" className="mt-1 block w-full rounded-md bg-black/20 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium leading-6 text-white">Image URL</label>
              <input type="url" name="imageUrl" value={formData.imageUrl} onChange={handleChange} placeholder="https://example.com/product.jpg" className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Variant Size</label>
                <input type="text" name="variantSize" value={formData.variantSize} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-white">Variant Color</label>
                <input type="text" name="variantColor" value={formData.variantColor} onChange={handleChange} className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6" />
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Price Tiers</p>
                  <p className="text-xs text-gray-400">Configure segment or volume pricing.</p>
                </div>
                <button type="button" onClick={addPriceTier} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400">
                  Add Tier
                </button>
              </div>
              <div className="space-y-2">
                {formData.priceTiers.map((tier, index) => (
                  <div key={`${tier.tierName}-${index}`} className="grid grid-cols-[1.2fr_0.7fr_0.8fr_auto] gap-2">
                    <input value={tier.tierName} onChange={(e) => updatePriceTier(index, 'tierName', e.target.value)} placeholder="Tier name" className="rounded-md bg-black/20 px-3 py-1.5 text-xs text-white outline-1 -outline-offset-1 outline-white/15" />
                    <input type="number" min="1" value={tier.minQuantity} onChange={(e) => updatePriceTier(index, 'minQuantity', e.target.value)} placeholder="Min qty" className="rounded-md bg-black/20 px-3 py-1.5 text-xs text-white outline-1 -outline-offset-1 outline-white/15" />
                    <input type="number" min="0" step="0.01" value={tier.unitPrice} onChange={(e) => updatePriceTier(index, 'unitPrice', e.target.value)} placeholder="Unit price" className="rounded-md bg-black/20 px-3 py-1.5 text-xs text-white outline-1 -outline-offset-1 outline-white/15" />
                    <button type="button" onClick={() => removePriceTier(index)} className="rounded-md bg-rose-500/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/30">
                      Remove
                    </button>
                  </div>
                ))}
                {!formData.priceTiers.length && <p className="text-xs text-gray-400">No tier pricing configured.</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                <input type="checkbox" name="batchTracking" checked={formData.batchTracking} onChange={handleChange} />
                Batch Tracking
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                <input type="checkbox" name="expiryRequired" checked={formData.expiryRequired} onChange={handleChange} />
                Expiry Required
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                <input type="checkbox" name="serialNumberTracking" checked={formData.serialNumberTracking} onChange={handleChange} />
                Serial Number Tracking
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                <input type="checkbox" name="allowNegativeStock" checked={formData.allowNegativeStock} onChange={handleChange} />
                Allow Negative Stock
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-4 border-t border-white/10 pt-4">
          <button type="submit" disabled={submitting} className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50">
            {submitting ? 'Updating...' : 'Update Product'}
          </button>
          <button type="button" onClick={() => navigate('/products/catalog')} className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
