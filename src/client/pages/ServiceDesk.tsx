import React, { useEffect, useMemo, useState } from 'react';
import { CardTabs } from '../components/CardTabs';
import { PaginationControls } from '../components/PaginationControls';
import { ActionIconButton } from '../components/ActionIconButton';
import { formatCurrency } from '../config';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showConfirmDialog } from '../utils/appDialogs';

type TabKey = 'dashboard' | 'catalog' | 'orders' | 'board' | 'reports';
type ServiceStatus = 'draft' | 'open' | 'in_progress' | 'quality_check' | 'completed' | 'picked_up' | 'cancelled';

interface ServiceCatalogRow {
  _id: string;
  serviceCode: string;
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  laborCharge: number;
  estimatedDurationMinutes: number;
  gstRate: number;
  defaultTension?: string;
  active: boolean;
  specificationTemplate: Array<{ key: string; label: string; inputType: 'text' | 'number' | 'boolean' | 'date' | 'select'; required?: boolean; unit?: string; placeholder?: string; options?: string[]; defaultValue?: string }>;
  consumables: Array<{ productId?: string; productName: string; sku?: string; quantity: number; unitPrice: number; optional?: boolean; notes?: string }>;
}

interface EmployeeRow {
  _id: string;
  name: string;
  designation?: string;
  employeeCode?: string;
}

interface ProductRow {
  _id: string;
  name: string;
  sku?: string;
  category?: string;
  subcategory?: string;
  itemType?: string;
  price?: number;
  stock?: number;
  minStock?: number;
}

interface AttachmentRow {
  name: string;
  url: string;
  contentType?: string;
}

interface OrderRow {
  _id: string;
  orderNumber: string;
  customerId?: string;
  customerCode?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceCatalogId?: string;
  serviceCode?: string;
  serviceName: string;
  serviceCategory?: string;
  quantity: number;
  equipmentName?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  equipmentSerialNumber?: string;
  currentCondition?: string;
  specificationValues: Array<{ key: string; label: string; inputType: string; value: string; unit?: string }>;
  requestedCompletionDate?: string;
  specialInstructions?: string;
  consumableLines: Array<{ productId?: string; productName: string; sku?: string; quantity: number; unitPrice: number; optional?: boolean; notes?: string; issuedQuantity?: number; issueAllocations?: Array<{ batchNumber?: string; locationCode?: string; quantity: number; unitCost: number }> }>;
  attachments?: AttachmentRow[];
  basePrice: number;
  laborCharge: number;
  discountMode: 'none' | 'amount' | 'percentage';
  discountValue: number;
  discountAmount: number;
  subtotal: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  status: ServiceStatus;
  assignedStaffId?: string;
  assignedStaffName?: string;
  priority: 'low' | 'medium' | 'high';
  internalNotes?: string;
  customerFacingNotes?: string;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  inventoryIssued?: boolean;
  saleId?: string;
  saleNumber?: string;
  invoiceNumber?: string;
  completedAt?: string;
  pickedUpAt?: string;
  timeline?: Array<{ action: string; message: string; createdAt?: string; fromStatus?: string; toStatus?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

interface DashboardData {
  summary: { activeOrders: number; pendingPickup: number; pendingApproval: number; averageCompletionHours: number; averageCompletionDays: number; revenueThisMonth: number };
  statusBreakdown: Array<{ status: string; count: number }>;
  recentActivity: Array<{ orderNumber: string; customerName: string; serviceName: string; status: string; assignedStaffName?: string; updatedAt?: string }>;
  lowStockAlerts: Array<{ _id: string; name: string; sku?: string; category?: string; stock: number; minStock: number }>;
}

interface ReportData {
  revenueByType: Array<{ serviceName: string; category?: string; jobs: number; revenue: number }>;
  staffPerformance: Array<{ staffName: string; jobs: number; revenue: number; averageCompletionHours: number }>;
  pendingPickups: Array<{ _id: string; orderNumber: string; customerName: string; serviceName: string; totalAmount: number; requestedCompletionDate?: string; completedAt?: string; assignedStaffName?: string }>;
  gstByRate: Array<{ gstRate: number; taxableValue: number; taxAmount: number }>;
  consumableUsage: Array<{ productId?: string; productName: string; sku?: string; quantity: number; issuedQuantity: number; chargeValue: number }>;
}

interface CustomerOption {
  _id: string;
  customerCode?: string;
  memberCode?: string;
  name: string;
  phone?: string;
  email?: string;
  source?: 'customer' | 'member';
}

const todayInput = () => new Date().toISOString().slice(0, 10);
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
    reader.readAsDataURL(file);
  });

const emptyCatalogForm = () => ({
  id: '',
  name: '',
  category: 'Stringing',
  description: '',
  basePrice: '0',
  laborCharge: '0',
  estimatedDurationMinutes: '60',
  gstRate: '18',
  defaultTension: '',
  active: true,
  specificationTemplate: [] as ServiceCatalogRow['specificationTemplate'],
  consumables: [] as ServiceCatalogRow['consumables'],
});

const emptyOrderForm = () => ({
  id: '',
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  serviceCatalogId: '',
  serviceName: '',
  serviceCategory: '',
  quantity: '1',
  equipmentName: 'Badminton Racquet',
  equipmentBrand: '',
  equipmentModel: '',
  equipmentSerialNumber: '',
  currentCondition: '',
  requestedCompletionDate: todayInput(),
  specialInstructions: '',
  specificationValues: [] as OrderRow['specificationValues'],
  consumableLines: [] as OrderRow['consumableLines'],
  attachments: [] as AttachmentRow[],
  basePrice: '0',
  laborCharge: '0',
  discountMode: 'none' as 'none' | 'amount' | 'percentage',
  discountValue: '0',
  gstRate: '18',
  status: 'open' as ServiceStatus,
  assignedStaffId: '',
  priority: 'medium' as 'low' | 'medium' | 'high',
  internalNotes: '',
  customerFacingNotes: '',
  inventoryIssued: false,
  saleId: '',
  invoiceNumber: '',
  paymentStatus: 'unpaid' as 'unpaid' | 'partially_paid' | 'paid',
});

const statusColor: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-200',
  open: 'bg-cyan-500/15 text-cyan-200',
  in_progress: 'bg-amber-500/15 text-amber-200',
  quality_check: 'bg-fuchsia-500/15 text-fuchsia-200',
  completed: 'bg-emerald-500/15 text-emerald-200',
  picked_up: 'bg-lime-500/15 text-lime-200',
  cancelled: 'bg-rose-500/15 text-rose-200',
};

const prettifyStatus = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const ServiceDesk: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [reports, setReports] = useState<ReportData | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalogRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm());
  const [orderForm, setOrderForm] = useState(emptyOrderForm());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderSortBy, setOrderSortBy] = useState<'updatedAt' | 'requestedCompletionDate' | 'totalAmount' | 'status'>('updatedAt');
  const [orderSortDirection, setOrderSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [reportRange, setReportRange] = useState({ startDate: todayInput().slice(0, 8) + '01', endDate: todayInput() });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const inventoryProducts = useMemo(() => products.filter((row) => row.itemType !== 'service'), [products]);
  const selectedOrder = useMemo(() => orders.find((row) => row._id === selectedOrderId) || null, [orders, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const search = orderSearch.trim().toLowerCase();
    const rows = orders.filter((row) => {
      if (orderStatusFilter !== 'all' && row.status !== orderStatusFilter) return false;
      if (!search) return true;
      return [row.orderNumber, row.customerName, row.customerPhone, row.serviceName, row.equipmentBrand, row.equipmentModel, row.equipmentSerialNumber].join(' ').toLowerCase().includes(search);
    });

    return [...rows].sort((left, right) => {
      const factor = orderSortDirection === 'asc' ? 1 : -1;
      if (orderSortBy === 'totalAmount') return (Number(left.totalAmount || 0) - Number(right.totalAmount || 0)) * factor;
      if (orderSortBy === 'status') return left.status.localeCompare(right.status) * factor;
      return (new Date((left as any)[orderSortBy] || 0).getTime() - new Date((right as any)[orderSortBy] || 0).getTime()) * factor;
    });
  }, [orderSearch, orderSortBy, orderSortDirection, orderStatusFilter, orders]);

  const paginatedOrders = usePaginatedRows(filteredOrders, { initialPageSize: 25, resetDeps: [orderSearch, orderStatusFilter, orderSortBy, orderSortDirection] });

  useEffect(() => {
    setError('');
  }, [activeTab]);

  const refreshDashboard = async () => {
    setDashboardLoading(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/services/dashboard'), { headers });
      setDashboard(response.data || null);
    } finally {
      setDashboardLoading(false);
    }
  };

  const refreshCatalog = async () => {
    setCatalogLoading(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/services/catalog'), { headers });
      setCatalog(Array.isArray(response.data) ? response.data : []);
    } finally {
      setCatalogLoading(false);
    }
  };

  const refreshOrders = async () => {
    setOrdersLoading(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/services/orders?limit=400'), { headers });
      setOrders(Array.isArray(response.data) ? response.data : []);
    } finally {
      setOrdersLoading(false);
    }
  };

  const refreshLookups = async () => {
    const response = await fetchApiJson(apiUrl('/api/services/lookups'), { headers });
    setEmployees(Array.isArray(response.data?.employees) ? response.data.employees : []);
    setProducts(Array.isArray(response.data?.products) ? response.data.products : []);
  };

  const refreshReports = async () => {
    setReportsLoading(true);
    try {
      const response = await fetchApiJson(apiUrl(`/api/services/reports/summary?${new URLSearchParams(reportRange).toString()}`), { headers });
      setReports(response.data || null);
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([refreshDashboard(), refreshCatalog(), refreshOrders(), refreshLookups()]).catch((loadError: any) => {
      setError(loadError?.message || 'Failed to load Service Desk.');
    });
  }, []);

  useEffect(() => {
    if (activeTab === 'reports' && !reports) {
      void refreshReports().catch((loadError: any) => setError(loadError?.message || 'Failed to load service reports.'));
    }
  }, [activeTab]);

  const resetCatalogForm = () => setCatalogForm(emptyCatalogForm());
  const resetOrderForm = () => setOrderForm(emptyOrderForm());

  const applyCatalogToOrder = (catalogId: string) => {
    const row = catalog.find((item) => item._id === catalogId);
    if (!row) return;
    setOrderForm((current) => ({
      ...current,
      serviceCatalogId: row._id,
      serviceName: row.name,
      serviceCategory: row.category,
      basePrice: String(Number(row.basePrice || 0)),
      laborCharge: String(Number(row.laborCharge || 0)),
      gstRate: String(Number(row.gstRate || 18)),
      specificationValues: (row.specificationTemplate || []).map((field) => ({
        key: field.key,
        label: field.label,
        inputType: field.inputType,
        value: String(field.defaultValue || ''),
        unit: field.unit || '',
      })),
      consumableLines: (row.consumables || []).map((line) => ({
        productId: line.productId,
        productName: line.productName,
        sku: line.sku,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        optional: line.optional,
        notes: line.notes || '',
        issuedQuantity: 0,
        issueAllocations: [],
      })),
    }));
  };

  const orderTotalsPreview = useMemo(() => {
    const quantity = Math.max(1, Number(orderForm.quantity || 1));
    const servicePart = (Number(orderForm.basePrice || 0) + Number(orderForm.laborCharge || 0)) * quantity;
    const consumablesPart = (orderForm.consumableLines || []).reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
    const subtotal = servicePart + consumablesPart;
    const discountValue = Number(orderForm.discountValue || 0);
    const discountAmount =
      orderForm.discountMode === 'percentage'
        ? (subtotal * Math.min(100, Math.max(0, discountValue))) / 100
        : orderForm.discountMode === 'amount'
          ? Math.min(subtotal, Math.max(0, discountValue))
          : 0;
    const taxableValue = Math.max(0, subtotal - discountAmount);
    const gstAmount = (taxableValue * Number(orderForm.gstRate || 0)) / 100;
    return { subtotal, discountAmount, gstAmount, totalAmount: taxableValue + gstAmount };
  }, [orderForm]);

  const handleCustomerSearch = async () => {
    if (!customerSearch.trim()) return;
    setSearchingCustomer(true);
    try {
      const response = await fetchApiJson(apiUrl(`/api/customers/search-unified?q=${encodeURIComponent(customerSearch.trim())}`), { headers });
      setCustomerMatches(Array.isArray(response.data) ? response.data : []);
    } finally {
      setSearchingCustomer(false);
    }
  };

  const handleCatalogSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: catalogForm.name,
      category: catalogForm.category,
      description: catalogForm.description,
      basePrice: Number(catalogForm.basePrice || 0),
      laborCharge: Number(catalogForm.laborCharge || 0),
      estimatedDurationMinutes: Number(catalogForm.estimatedDurationMinutes || 60),
      gstRate: Number(catalogForm.gstRate || 18),
      defaultTension: catalogForm.defaultTension,
      active: catalogForm.active,
      specificationTemplate: catalogForm.specificationTemplate,
      consumables: catalogForm.consumables,
    };
    const response = await fetchApiJson(catalogForm.id ? apiUrl(`/api/services/catalog/${catalogForm.id}`) : apiUrl('/api/services/catalog'), {
      method: catalogForm.id ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    setMessage(response.message || 'Service catalog saved.');
    await Promise.all([refreshCatalog(), refreshDashboard()]);
    resetCatalogForm();
  };

  const handleOrderSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      customerId: orderForm.customerId,
      customerName: orderForm.customerName,
      customerPhone: orderForm.customerPhone,
      customerEmail: orderForm.customerEmail,
      serviceCatalogId: orderForm.serviceCatalogId,
      serviceName: orderForm.serviceName,
      serviceCategory: orderForm.serviceCategory,
      quantity: Number(orderForm.quantity || 1),
      equipmentName: orderForm.equipmentName,
      equipmentBrand: orderForm.equipmentBrand,
      equipmentModel: orderForm.equipmentModel,
      equipmentSerialNumber: orderForm.equipmentSerialNumber,
      currentCondition: orderForm.currentCondition,
      requestedCompletionDate: orderForm.requestedCompletionDate,
      specialInstructions: orderForm.specialInstructions,
      specificationValues: orderForm.specificationValues,
      consumableLines: orderForm.consumableLines,
      attachments: orderForm.attachments,
      basePrice: Number(orderForm.basePrice || 0),
      laborCharge: Number(orderForm.laborCharge || 0),
      discountMode: orderForm.discountMode,
      discountValue: Number(orderForm.discountValue || 0),
      gstRate: Number(orderForm.gstRate || 18),
      status: orderForm.status,
      assignedStaffId: orderForm.assignedStaffId,
      priority: orderForm.priority,
      internalNotes: orderForm.internalNotes,
      customerFacingNotes: orderForm.customerFacingNotes,
    };
    const response = await fetchApiJson(orderForm.id ? apiUrl(`/api/services/orders/${orderForm.id}`) : apiUrl('/api/services/orders'), {
      method: orderForm.id ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    setMessage(response.message || 'Service order saved.');
    await Promise.all([refreshOrders(), refreshDashboard(), activeTab === 'reports' ? refreshReports() : Promise.resolve()]);
    setSelectedOrderId(String(response.data?._id || ''));
    resetOrderForm();
  };

  const updateOrderStatus = async (orderId: string, status: ServiceStatus) => {
    const confirmed = await showConfirmDialog(`Move this job to "${prettifyStatus(status)}"?`, { title: 'Update Service Status', confirmText: 'Update' });
    if (!confirmed) return;
    const response = await fetchApiJson(apiUrl(`/api/services/orders/${orderId}/status`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ status }),
    });
    setMessage(response.message || 'Service status updated.');
    await Promise.all([refreshOrders(), refreshDashboard(), activeTab === 'reports' ? refreshReports() : Promise.resolve()]);
    setSelectedOrderId(orderId);
  };

  const generateInvoice = async (orderId: string) => {
    const confirmed = await showConfirmDialog('Generate a Sales invoice for this completed service order?', { title: 'Generate Invoice', confirmText: 'Generate Invoice' });
    if (!confirmed) return;
    const response = await fetchApiJson(apiUrl(`/api/services/orders/${orderId}/generate-invoice`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ paymentMethod: 'cash', markPaid: true }),
    });
    setMessage(response.message || 'Invoice generated.');
    await Promise.all([refreshOrders(), refreshDashboard(), activeTab === 'reports' ? refreshReports() : Promise.resolve()]);
    setSelectedOrderId(orderId);
  };

  const seedSparkDefaults = async () => {
    const confirmed = await showConfirmDialog('Load Spark starter services like badminton stringing, grip change, bat knocking, and calibration?', {
      title: 'Load Spark Services',
      confirmText: 'Load Services',
    });
    if (!confirmed) return;
    const response = await fetchApiJson(apiUrl('/api/services/catalog/seed-defaults'), { method: 'POST', headers });
    setMessage(response.message || 'Spark starter services are ready.');
    await Promise.all([refreshCatalog(), refreshDashboard()]);
  };

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const attachments = await Promise.all(files.map(async (file) => ({ name: file.name, url: await readFileAsDataUrl(file), contentType: file.type })));
    setOrderForm((current) => ({ ...current, attachments: [...current.attachments, ...attachments] }));
    event.target.value = '';
  };

  return (
    <div className="mx-auto max-w-[1750px] space-y-6 px-4 py-6 sm:px-6 xl:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/15 via-slate-950 to-emerald-500/10 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-20 left-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200">Operations / Service Desk</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Spark Equipment Services</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Built for Spark’s daily work like badminton stringing, grip change, bat knocking, and equipment tuning.
              Create service definitions, track jobs on a board, deduct consumables, and turn finished work into Sales invoices.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={() => setActiveTab('orders')} className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400">+ New Service Order</button>
            <button type="button" onClick={() => setActiveTab('catalog')} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15">Manage Service Catalog</button>
            <button type="button" onClick={() => setActiveTab('board')} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15">Open Job Board</button>
            <button type="button" onClick={() => setActiveTab('reports')} className="rounded-xl bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30">Service Reports</button>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <CardTabs
        items={[
          { key: 'dashboard', label: 'Service Dashboard' },
          { key: 'catalog', label: 'Service Catalog' },
          { key: 'orders', label: 'Work Orders' },
          { key: 'board', label: 'Job Status Board' },
          { key: 'reports', label: 'Reports' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        ariaLabel="Service Desk Tabs"
      />

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Active Orders</p><p className="mt-2 text-2xl font-semibold text-white">{dashboardLoading ? '...' : dashboard?.summary.activeOrders || 0}</p><p className="mt-2 text-xs text-gray-400">Open jobs currently moving through the desk.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-amber-200">Pending Pickup</p><p className="mt-2 text-2xl font-semibold text-white">{dashboardLoading ? '...' : dashboard?.summary.pendingPickup || 0}</p><p className="mt-2 text-xs text-gray-400">Completed jobs waiting for collection.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-fuchsia-200">Pending Approval</p><p className="mt-2 text-2xl font-semibold text-white">{dashboardLoading ? '...' : dashboard?.summary.pendingApproval || 0}</p><p className="mt-2 text-xs text-gray-400">Drafts still waiting for desk confirmation.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Avg Completion</p><p className="mt-2 text-2xl font-semibold text-white">{dashboardLoading ? '...' : `${Number(dashboard?.summary.averageCompletionHours || 0).toFixed(1)}h`}</p><p className="mt-2 text-xs text-gray-400">{Number(dashboard?.summary.averageCompletionDays || 0).toFixed(2)} day turnaround.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-sky-200">Revenue This Month</p><p className="mt-2 text-2xl font-semibold text-white">{dashboardLoading ? '...' : formatCurrency(dashboard?.summary.revenueThisMonth || 0)}</p><p className="mt-2 text-xs text-gray-400">Completed or picked-up service income.</p></div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-white">Service Pulse</h2><p className="text-sm text-gray-400">Quick view of the live service queue for Spark operations.</p></div>
                <button type="button" onClick={seedSparkDefaults} className="rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30">Load Spark Starter Services</button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {(dashboard?.statusBreakdown || []).map((row) => (
                  <div key={row.status} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">{prettifyStatus(row.status)}</p><p className="mt-2 text-2xl font-semibold text-white">{row.count}</p></div>
                ))}
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <p className="text-sm font-semibold text-white">Recent Activity Log</p>
                  <div className="mt-3 space-y-3">
                    {(dashboard?.recentActivity || []).map((row) => (
                      <div key={row.orderNumber} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200">
                        <div className="flex items-center justify-between gap-3"><span className="font-semibold text-white">{row.orderNumber}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor[row.status] || statusColor.draft}`}>{prettifyStatus(row.status)}</span></div>
                        <p className="mt-2 text-white">{row.customerName}</p>
                        <p className="text-xs text-gray-400">{row.serviceName}{row.assignedStaffName ? ` • ${row.assignedStaffName}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <p className="text-sm font-semibold text-white">Consumable Low Stock Alerts</p>
                  <div className="mt-3 space-y-3">
                    {(dashboard?.lowStockAlerts || []).map((row) => (
                      <div key={row._id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200"><div><p className="font-semibold text-white">{row.name}</p><p className="text-xs text-gray-400">{row.sku || 'No SKU'} • {row.category || 'Consumable'}</p></div><div className="text-right text-xs"><p className="text-rose-200">Stock {row.stock}</p><p className="text-gray-400">Min {row.minStock}</p></div></div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-semibold text-white">Spark Popular Use Cases</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-300">
                <div className="rounded-2xl border border-white/10 bg-cyan-500/10 p-4"><p className="font-semibold text-cyan-100">Badminton Racquet Stringing</p><p className="mt-2 text-cyan-50/90">Capture racquet model, target tension, string pattern, pre-stretch, and preferred string type.</p></div>
                <div className="rounded-2xl border border-white/10 bg-emerald-500/10 p-4"><p className="font-semibold text-emerald-100">Grip Change / Regrip</p><p className="mt-2 text-emerald-50/90">Track grip type, color, wrap finish, and replacement material from catalog stock.</p></div>
                <div className="rounded-2xl border border-white/10 bg-amber-500/10 p-4"><p className="font-semibold text-amber-100">Bat Knocking / Equipment Tuning</p><p className="mt-2 text-amber-50/90">Store target prep details, staff assignment, due date, and invoice the service when it is ready.</p></div>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={handleCatalogSubmit} className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{catalogForm.id ? 'Edit Service Catalog' : 'Create Service Catalog'}</h2><p className="text-sm text-gray-400">Define Spark services, duration, GST, and default consumables.</p></div><button type="button" onClick={resetCatalogForm} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">Clear</button></div>
            <div className="grid gap-4 xl:grid-cols-4">
              <label className="xl:col-span-2"><span className="text-sm text-gray-300">Service Name</span><input value={catalogForm.name} onChange={(e) => setCatalogForm((c) => ({ ...c, name: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label><span className="text-sm text-gray-300">Category</span><input value={catalogForm.category} onChange={(e) => setCatalogForm((c) => ({ ...c, category: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label><span className="text-sm text-gray-300">Default Tension</span><input value={catalogForm.defaultTension} onChange={(e) => setCatalogForm((c) => ({ ...c, defaultTension: e.target.value }))} placeholder="24 lbs" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label className="xl:col-span-4"><span className="text-sm text-gray-300">Description</span><textarea value={catalogForm.description} onChange={(e) => setCatalogForm((c) => ({ ...c, description: e.target.value }))} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label><span className="text-sm text-gray-300">Base Price</span><input type="number" value={catalogForm.basePrice} onChange={(e) => setCatalogForm((c) => ({ ...c, basePrice: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label><span className="text-sm text-gray-300">Labor Charge</span><input type="number" value={catalogForm.laborCharge} onChange={(e) => setCatalogForm((c) => ({ ...c, laborCharge: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label><span className="text-sm text-gray-300">Duration (mins)</span><input type="number" value={catalogForm.estimatedDurationMinutes} onChange={(e) => setCatalogForm((c) => ({ ...c, estimatedDurationMinutes: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400" /></label>
              <label><span className="text-sm text-gray-300">GST Rate</span><select value={catalogForm.gstRate} onChange={(e) => setCatalogForm((c) => ({ ...c, gstRate: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-cyan-400"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></label>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex items-center justify-between"><p className="font-semibold text-white">Specification Template</p><button type="button" onClick={() => setCatalogForm((c) => ({ ...c, specificationTemplate: [...c.specificationTemplate, { key: '', label: '', inputType: 'text', options: [], defaultValue: '' }] }))} className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100">Add Field</button></div>
                <div className="mt-3 space-y-3">{catalogForm.specificationTemplate.map((field, index) => <div key={`${field.key}-${index}`} className="grid gap-2 xl:grid-cols-4"><input value={field.label} onChange={(e) => setCatalogForm((c) => { const next = [...c.specificationTemplate]; next[index] = { ...next[index], label: e.target.value, key: next[index].key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') }; return { ...c, specificationTemplate: next }; })} placeholder="Label" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><input value={field.key} onChange={(e) => setCatalogForm((c) => { const next = [...c.specificationTemplate]; next[index] = { ...next[index], key: e.target.value }; return { ...c, specificationTemplate: next }; })} placeholder="Key" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><select value={field.inputType} onChange={(e) => setCatalogForm((c) => { const next = [...c.specificationTemplate]; next[index] = { ...next[index], inputType: e.target.value as any }; return { ...c, specificationTemplate: next }; })} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="date">Date</option><option value="select">Select</option></select><input value={field.options?.join(', ') || ''} onChange={(e) => setCatalogForm((c) => { const next = [...c.specificationTemplate]; next[index] = { ...next[index], options: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }; return { ...c, specificationTemplate: next }; })} placeholder="Options" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /></div>)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex items-center justify-between"><p className="font-semibold text-white">Default Consumables</p><button type="button" onClick={() => setCatalogForm((c) => ({ ...c, consumables: [...c.consumables, { productId: '', productName: '', quantity: 1, unitPrice: 0 }] }))} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100">Add Consumable</button></div>
                <div className="mt-3 space-y-3">{catalogForm.consumables.map((line, index) => <div key={`${line.productId}-${index}`} className="grid gap-2 xl:grid-cols-[1.6fr_0.6fr_0.7fr]"><select value={line.productId || ''} onChange={(e) => { const picked = inventoryProducts.find((row) => row._id === e.target.value); setCatalogForm((c) => { const next = [...c.consumables]; next[index] = { ...next[index], productId: e.target.value, productName: picked?.name || '', sku: picked?.sku, unitPrice: Number(picked?.price || 0) }; return { ...c, consumables: next }; }); }} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"><option value="">Select product</option>{inventoryProducts.map((product) => <option key={product._id} value={product._id}>{product.name} {product.sku ? `(${product.sku})` : ''}</option>)}</select><input type="number" value={line.quantity} onChange={(e) => setCatalogForm((c) => { const next = [...c.consumables]; next[index] = { ...next[index], quantity: Number(e.target.value || 0) }; return { ...c, consumables: next }; })} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><input type="number" value={line.unitPrice} onChange={(e) => setCatalogForm((c) => { const next = [...c.consumables]; next[index] = { ...next[index], unitPrice: Number(e.target.value || 0) }; return { ...c, consumables: next }; })} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /></div>)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3"><button type="submit" className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400">{catalogForm.id ? 'Update Service' : 'Create Service'}</button><button type="button" onClick={seedSparkDefaults} className="rounded-xl bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/30">Load Spark Starter Services</button></div>
          </form>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Service Catalog Register</h2><p className="text-sm text-gray-400">{catalogLoading ? 'Refreshing catalog...' : `${catalog.length} service definitions ready`}</p></div></div>
            <div className="mt-4 space-y-3">{catalog.map((row) => <div key={row._id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><p className="text-sm font-semibold text-white">{row.name}</p><p className="text-xs text-gray-400">{row.serviceCode} • {row.category} • {row.estimatedDurationMinutes} mins</p><p className="mt-2 text-sm text-gray-300">{row.description || 'No description provided.'}</p></div><div className="text-right text-sm"><p className="text-cyan-200">{formatCurrency((Number(row.basePrice || 0) + Number(row.laborCharge || 0)))}</p><p className="text-xs text-gray-400">GST {row.gstRate}%</p><button type="button" onClick={() => setCatalogForm({ id: row._id, name: row.name, category: row.category, description: row.description || '', basePrice: String(row.basePrice || 0), laborCharge: String(row.laborCharge || 0), estimatedDurationMinutes: String(row.estimatedDurationMinutes || 60), gstRate: String(row.gstRate || 18), defaultTension: row.defaultTension || '', active: row.active, specificationTemplate: row.specificationTemplate || [], consumables: row.consumables || [] })} className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15">Edit</button></div></div></div>)}</div>
          </section>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-6">
          <form onSubmit={handleOrderSubmit} className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">{orderForm.id ? 'Edit Service Work Order' : 'New Service Work Order'}</h2><p className="text-sm text-gray-400">Capture Spark walk-in service jobs with customer, equipment, specification, pricing, and attachments.</p></div><button type="button" onClick={resetOrderForm} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">Clear</button></div>
            <div className="grid gap-4 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 xl:col-span-2">
                <div className="flex items-center justify-between gap-3"><p className="font-semibold text-white">Customer Information</p><div className="flex gap-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer by phone or name" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><button type="button" onClick={handleCustomerSearch} className="rounded-xl bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100">{searchingCustomer ? 'Searching...' : 'Search'}</button></div></div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  <input value={orderForm.customerName} onChange={(e) => setOrderForm((c) => ({ ...c, customerName: e.target.value }))} placeholder="Customer name" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input value={orderForm.customerPhone} onChange={(e) => setOrderForm((c) => ({ ...c, customerPhone: e.target.value }))} placeholder="Customer phone" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input value={orderForm.customerEmail} onChange={(e) => setOrderForm((c) => ({ ...c, customerEmail: e.target.value }))} placeholder="Customer email" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white xl:col-span-2" />
                </div>
                {!!customerMatches.length && <div className="mt-3 grid gap-2 xl:grid-cols-2">{customerMatches.map((row) => <button key={`${row.source}-${row._id}`} type="button" onClick={() => setOrderForm((c) => ({ ...c, customerId: row._id, customerName: row.name, customerPhone: row.phone || '', customerEmail: row.email || '' }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left text-sm text-gray-200 hover:border-cyan-400/40"><p className="font-semibold text-white">{row.name}</p><p className="text-xs text-gray-400">{row.customerCode || row.memberCode || row.phone || 'No code'} • {row.email || 'No email'}</p></button>)}</div>}
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 xl:col-span-2">
                <p className="font-semibold text-white">Service And Equipment</p>
                <div className="mt-4 grid gap-3 xl:grid-cols-4">
                  <select value={orderForm.serviceCatalogId} onChange={(e) => applyCatalogToOrder(e.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white xl:col-span-2"><option value="">Select service</option>{catalog.filter((row) => row.active).map((row) => <option key={row._id} value={row._id}>{row.name} ({row.category})</option>)}</select>
                  <input type="number" value={orderForm.quantity} onChange={(e) => setOrderForm((c) => ({ ...c, quantity: e.target.value }))} placeholder="Qty" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input type="date" value={orderForm.requestedCompletionDate} onChange={(e) => setOrderForm((c) => ({ ...c, requestedCompletionDate: e.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input value={orderForm.equipmentName} onChange={(e) => setOrderForm((c) => ({ ...c, equipmentName: e.target.value }))} placeholder="Equipment" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input value={orderForm.equipmentBrand} onChange={(e) => setOrderForm((c) => ({ ...c, equipmentBrand: e.target.value }))} placeholder="Brand" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input value={orderForm.equipmentModel} onChange={(e) => setOrderForm((c) => ({ ...c, equipmentModel: e.target.value }))} placeholder="Model" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <input value={orderForm.equipmentSerialNumber} onChange={(e) => setOrderForm((c) => ({ ...c, equipmentSerialNumber: e.target.value }))} placeholder="Serial no." className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" />
                  <textarea value={orderForm.currentCondition} onChange={(e) => setOrderForm((c) => ({ ...c, currentCondition: e.target.value }))} rows={2} placeholder="Current condition / issues" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white xl:col-span-4" />
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex items-center justify-between"><p className="font-semibold text-white">Dynamic Specifications</p><button type="button" onClick={() => setOrderForm((c) => ({ ...c, specificationValues: [...c.specificationValues, { key: '', label: '', inputType: 'text', value: '' }] }))} className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100">Add Spec</button></div>
                <div className="mt-3 space-y-3">{orderForm.specificationValues.map((row, index) => <div key={`${row.key}-${index}`} className="grid gap-2 xl:grid-cols-3"><input value={row.label} onChange={(e) => setOrderForm((c) => { const next = [...c.specificationValues]; next[index] = { ...next[index], label: e.target.value, key: next[index].key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') }; return { ...c, specificationValues: next }; })} placeholder="Label" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><select value={row.inputType} onChange={(e) => setOrderForm((c) => { const next = [...c.specificationValues]; next[index] = { ...next[index], inputType: e.target.value, value: e.target.value === 'boolean' ? 'No' : next[index].value }; return { ...c, specificationValues: next }; })} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="date">Date</option><option value="select">Select</option></select><input value={row.value} onChange={(e) => setOrderForm((c) => { const next = [...c.specificationValues]; next[index] = { ...next[index], value: e.target.value }; return { ...c, specificationValues: next }; })} placeholder="Value" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /></div>)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex items-center justify-between"><p className="font-semibold text-white">Consumables & Pricing</p><button type="button" onClick={() => setOrderForm((c) => ({ ...c, consumableLines: [...c.consumableLines, { productId: '', productName: '', quantity: 1, unitPrice: 0 }] }))} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100">Add Consumable</button></div>
                <div className="mt-3 space-y-3">{orderForm.consumableLines.map((line, index) => <div key={`${line.productId}-${index}`} className="grid gap-2 xl:grid-cols-[1.5fr_0.55fr_0.65fr]"><select value={line.productId || ''} onChange={(e) => { const picked = inventoryProducts.find((row) => row._id === e.target.value); setOrderForm((c) => { const next = [...c.consumableLines]; next[index] = { ...next[index], productId: e.target.value, productName: picked?.name || '', sku: picked?.sku, unitPrice: Number(picked?.price || 0) }; return { ...c, consumableLines: next }; }); }} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"><option value="">Select product</option>{inventoryProducts.map((product) => <option key={product._id} value={product._id}>{product.name} {product.sku ? `(${product.sku})` : ''}</option>)}</select><input type="number" value={line.quantity} onChange={(e) => setOrderForm((c) => { const next = [...c.consumableLines]; next[index] = { ...next[index], quantity: Number(e.target.value || 0) }; return { ...c, consumableLines: next }; })} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><input type="number" value={line.unitPrice} onChange={(e) => setOrderForm((c) => { const next = [...c.consumableLines]; next[index] = { ...next[index], unitPrice: Number(e.target.value || 0) }; return { ...c, consumableLines: next }; })} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /></div>)}</div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2"><input type="number" value={orderForm.basePrice} onChange={(e) => setOrderForm((c) => ({ ...c, basePrice: e.target.value }))} placeholder="Base price" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><input type="number" value={orderForm.laborCharge} onChange={(e) => setOrderForm((c) => ({ ...c, laborCharge: e.target.value }))} placeholder="Labor charge" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><select value={orderForm.discountMode} onChange={(e) => setOrderForm((c) => ({ ...c, discountMode: e.target.value as any }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white"><option value="none">No discount</option><option value="amount">Amount</option><option value="percentage">Percentage</option></select><input type="number" value={orderForm.discountValue} onChange={(e) => setOrderForm((c) => ({ ...c, discountValue: e.target.value }))} placeholder="Discount value" className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><select value={orderForm.gstRate} onChange={(e) => setOrderForm((c) => ({ ...c, gstRate: e.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select><select value={orderForm.priority} onChange={(e) => setOrderForm((c) => ({ ...c, priority: e.target.value as any }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select></div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300"><div className="flex items-center justify-between"><span>Subtotal</span><span>{formatCurrency(orderTotalsPreview.subtotal)}</span></div><div className="mt-2 flex items-center justify-between"><span>Discount</span><span>{formatCurrency(orderTotalsPreview.discountAmount)}</span></div><div className="mt-2 flex items-center justify-between"><span>GST</span><span>{formatCurrency(orderTotalsPreview.gstAmount)}</span></div><div className="mt-3 flex items-center justify-between text-lg font-semibold text-white"><span>Total</span><span>{formatCurrency(orderTotalsPreview.totalAmount)}</span></div></div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.8fr]">
              <textarea value={orderForm.specialInstructions} onChange={(e) => setOrderForm((c) => ({ ...c, specialInstructions: e.target.value }))} rows={3} placeholder="Special instructions" className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-white" />
              <textarea value={orderForm.internalNotes} onChange={(e) => setOrderForm((c) => ({ ...c, internalNotes: e.target.value }))} rows={3} placeholder="Internal staff notes" className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-white" />
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><p className="text-sm font-semibold text-white">Assignment & Attachments</p><select value={orderForm.assignedStaffId} onChange={(e) => setOrderForm((c) => ({ ...c, assignedStaffId: e.target.value }))} className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white"><option value="">Assign staff</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}{employee.designation ? ` • ${employee.designation}` : ''}</option>)}</select><input type="file" multiple accept="image/*" onChange={handleAttachmentUpload} className="mt-3 block w-full text-sm text-gray-300" /></div>
            </div>

            <div className="flex flex-wrap items-center gap-3"><button type="submit" className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400">{orderForm.id ? 'Update Work Order' : 'Create Work Order'}</button><button type="button" onClick={() => setOrderForm((c) => ({ ...c, status: 'draft' }))} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15">Keep As Draft</button></div>
          </form>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="text-lg font-semibold text-white">Service Order Register</h2><p className="text-sm text-gray-400">{ordersLoading ? 'Refreshing work orders...' : `${filteredOrders.length} matching orders`}</p></div><div className="grid gap-3 sm:grid-cols-4"><input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search customer / order / equipment" className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-white sm:col-span-2" /><select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-white"><option value="all">All statuses</option>{['draft','open','in_progress','quality_check','completed','picked_up','cancelled'].map((status) => <option key={status} value={status}>{prettifyStatus(status)}</option>)}</select><select value={`${orderSortBy}:${orderSortDirection}`} onChange={(e) => { const [sortBy, direction] = e.target.value.split(':'); setOrderSortBy(sortBy as any); setOrderSortDirection(direction as any); }} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-white"><option value="updatedAt:desc">Latest updated</option><option value="requestedCompletionDate:asc">Due soonest</option><option value="totalAmount:desc">Highest amount</option><option value="status:asc">Status A-Z</option></select></div></div>
            <div className="mt-4 space-y-3">{paginatedOrders.paginatedRows.map((row) => <div key={row._id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex items-center gap-3"><p className="text-sm font-semibold text-white">{row.orderNumber}</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor[row.status] || statusColor.draft}`}>{prettifyStatus(row.status)}</span></div><p className="mt-2 text-white">{row.customerName} • {row.serviceName}</p><p className="text-xs text-gray-400">{row.customerPhone || 'No phone'} • {row.equipmentBrand || '-'} {row.equipmentModel || ''} {row.equipmentSerialNumber ? `• ${row.equipmentSerialNumber}` : ''}</p><p className="mt-2 text-xs text-gray-400">Assigned: {row.assignedStaffName || 'Unassigned'} • Due: {row.requestedCompletionDate ? new Date(row.requestedCompletionDate).toLocaleDateString('en-IN') : '-'}</p></div><div className="text-right"><p className="text-sm font-semibold text-cyan-200">{formatCurrency(row.totalAmount || 0)}</p><p className="text-xs text-gray-400">{row.paymentStatus}</p><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setSelectedOrderId(row._id); setOrderForm({ id: row._id, customerId: row.customerId || '', customerName: row.customerName || '', customerPhone: row.customerPhone || '', customerEmail: row.customerEmail || '', serviceCatalogId: row.serviceCatalogId || '', serviceName: row.serviceName || '', serviceCategory: row.serviceCategory || '', quantity: String(row.quantity || 1), equipmentName: row.equipmentName || '', equipmentBrand: row.equipmentBrand || '', equipmentModel: row.equipmentModel || '', equipmentSerialNumber: row.equipmentSerialNumber || '', currentCondition: row.currentCondition || '', requestedCompletionDate: row.requestedCompletionDate ? String(row.requestedCompletionDate).slice(0,10) : todayInput(), specialInstructions: row.specialInstructions || '', specificationValues: row.specificationValues || [], consumableLines: row.consumableLines || [], attachments: row.attachments || [], basePrice: String(row.basePrice || 0), laborCharge: String(row.laborCharge || 0), discountMode: row.discountMode || 'none', discountValue: String(row.discountValue || 0), gstRate: String(row.gstRate || 18), status: row.status, assignedStaffId: row.assignedStaffId || '', priority: row.priority || 'medium', internalNotes: row.internalNotes || '', customerFacingNotes: row.customerFacingNotes || '', inventoryIssued: Boolean(row.inventoryIssued), saleId: row.saleId || '', invoiceNumber: row.invoiceNumber || '', paymentStatus: row.paymentStatus || 'unpaid' }); setActiveTab('orders'); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15">Edit</button><button type="button" onClick={() => setSelectedOrderId(row._id)} className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30">Details</button>{!row.saleId && ['completed','picked_up'].includes(row.status) && <button type="button" onClick={() => void generateInvoice(row._id)} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30">Generate Invoice</button>}</div></div></div></div>)}</div>
            <PaginationControls currentPage={paginatedOrders.currentPage} totalPages={paginatedOrders.totalPages} totalRows={paginatedOrders.totalRows} pageSize={paginatedOrders.pageSize} startIndex={paginatedOrders.startIndex} endIndex={paginatedOrders.endIndex} itemLabel="service orders" onPageChange={paginatedOrders.setCurrentPage} onPageSizeChange={paginatedOrders.setPageSize} />
          </section>

          {selectedOrder && <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><h2 className="text-lg font-semibold text-white">Order Detail And Tracking</h2><p className="text-sm text-gray-400">{selectedOrder.orderNumber} • {selectedOrder.customerName} • {selectedOrder.serviceName}</p></div><div className="flex flex-wrap gap-2">{selectedOrder.status === 'open' && <button type="button" onClick={() => void updateOrderStatus(selectedOrder._id, 'in_progress')} className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100">Start Job</button>}{selectedOrder.status === 'in_progress' && <button type="button" onClick={() => void updateOrderStatus(selectedOrder._id, 'quality_check')} className="rounded-lg bg-fuchsia-500/20 px-3 py-2 text-xs font-semibold text-fuchsia-100">Move To QC</button>}{selectedOrder.status === 'quality_check' && <button type="button" onClick={() => void updateOrderStatus(selectedOrder._id, 'completed')} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100">Mark Completed</button>}{selectedOrder.status === 'completed' && <button type="button" onClick={() => void updateOrderStatus(selectedOrder._id, 'picked_up')} className="rounded-lg bg-lime-500/20 px-3 py-2 text-xs font-semibold text-lime-100">Mark Picked Up</button>}</div></div><div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]"><div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><p className="font-semibold text-white">Overview</p><div className="mt-3 space-y-2 text-sm text-gray-300"><p>Status: <span className="text-white">{prettifyStatus(selectedOrder.status)}</span></p><p>Priority: <span className="text-white">{prettifyStatus(selectedOrder.priority)}</span></p><p>Assigned Staff: <span className="text-white">{selectedOrder.assignedStaffName || 'Unassigned'}</span></p><p>Total: <span className="text-white">{formatCurrency(selectedOrder.totalAmount || 0)}</span></p><p>Payment: <span className="text-white">{prettifyStatus(selectedOrder.paymentStatus || 'unpaid')}</span></p><p>Inventory Issued: <span className="text-white">{selectedOrder.inventoryIssued ? 'Yes' : 'No'}</span></p></div></div><div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><p className="font-semibold text-white">Timeline / Activity Log</p><div className="mt-3 space-y-3">{(selectedOrder.timeline || []).map((row, index) => <div key={`${row.action}-${index}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200"><p className="font-semibold text-white">{prettifyStatus(row.action)}</p><p className="mt-1 text-gray-300">{row.message}</p><p className="mt-1 text-xs text-gray-500">{row.createdAt ? new Date(row.createdAt).toLocaleString('en-IN') : '-'}</p></div>)}</div></div><div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><p className="font-semibold text-white">Payment & Invoicing</p><div className="mt-3 space-y-2 text-sm text-gray-300"><p>Invoice: <span className="text-white">{selectedOrder.invoiceNumber || 'Not generated yet'}</span></p><p>Sale Ref: <span className="text-white">{selectedOrder.saleNumber || '-'}</span></p><p>Pickup: <span className="text-white">{selectedOrder.pickedUpAt ? new Date(selectedOrder.pickedUpAt).toLocaleString('en-IN') : '-'}</span></p></div>{!selectedOrder.saleId && ['completed','picked_up'].includes(selectedOrder.status) && <button type="button" onClick={() => void generateInvoice(selectedOrder._id)} className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-400">Generate Sales Invoice</button>}</div></div></section>}
        </div>
      )}

      {activeTab === 'board' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {(['open', 'in_progress', 'quality_check', 'completed', 'picked_up'] as ServiceStatus[]).map((status) => (
            <section key={status} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white">{prettifyStatus(status)}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor[status]}`}>{orders.filter((row) => row.status === status).length}</span></div>
              <div className="mt-4 space-y-3">{orders.filter((row) => row.status === status).map((row) => <div key={row._id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="font-semibold text-white">{row.customerName}</p><p className="mt-1 text-sm text-gray-300">{row.serviceName}</p><p className="mt-1 text-xs text-gray-500">{row.orderNumber} • {row.assignedStaffName || 'Unassigned'}</p><p className="mt-2 text-xs text-gray-400">{row.requestedCompletionDate ? new Date(row.requestedCompletionDate).toLocaleDateString('en-IN') : 'No due date'} • {formatCurrency(row.totalAmount || 0)}</p><div className="mt-3 flex flex-wrap gap-2">{status === 'open' && <button type="button" onClick={() => void updateOrderStatus(row._id, 'in_progress')} className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100">Start</button>}{status === 'in_progress' && <button type="button" onClick={() => void updateOrderStatus(row._id, 'quality_check')} className="rounded-lg bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-100">QC</button>}{status === 'quality_check' && <button type="button" onClick={() => void updateOrderStatus(row._id, 'completed')} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100">Complete</button>}{status === 'completed' && <button type="button" onClick={() => void updateOrderStatus(row._id, 'picked_up')} className="rounded-lg bg-lime-500/20 px-3 py-1.5 text-xs font-semibold text-lime-100">Picked Up</button>}<button type="button" onClick={() => setSelectedOrderId(row._id)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">Details</button></div></div>)}</div>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="text-lg font-semibold text-white">Service Reports</h2><p className="text-sm text-gray-400">Revenue, staff throughput, GST on services, and consumables usage.</p></div><div className="flex flex-wrap items-center gap-3"><input type="date" value={reportRange.startDate} onChange={(e) => setReportRange((r) => ({ ...r, startDate: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-white" /><input type="date" value={reportRange.endDate} onChange={(e) => setReportRange((r) => ({ ...r, endDate: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-white" /><ActionIconButton kind="refresh" onClick={() => void refreshReports()} title={reportsLoading ? 'Refreshing...' : 'Refresh Reports'} /></div></div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="text-base font-semibold text-white">Revenue By Service Type</h3><div className="mt-4 space-y-3">{(reports?.revenueByType || []).map((row) => <div key={row.serviceName} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-sm text-gray-200"><div><p className="font-semibold text-white">{row.serviceName}</p><p className="text-xs text-gray-400">{row.category || 'Service'} • {row.jobs} jobs</p></div><span className="font-semibold text-cyan-200">{formatCurrency(row.revenue || 0)}</span></div>)}</div></section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="text-base font-semibold text-white">Staff Performance</h3><div className="mt-4 space-y-3">{(reports?.staffPerformance || []).map((row) => <div key={row.staffName} className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-sm text-gray-200"><div className="flex items-center justify-between"><p className="font-semibold text-white">{row.staffName}</p><span className="text-emerald-200">{formatCurrency(row.revenue || 0)}</span></div><p className="mt-1 text-xs text-gray-400">{row.jobs} jobs • Avg {Number(row.averageCompletionHours || 0).toFixed(1)}h</p></div>)}</div></section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="text-base font-semibold text-white">GST On Services</h3><div className="mt-4 space-y-3">{(reports?.gstByRate || []).map((row) => <div key={row.gstRate} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-sm text-gray-200"><div><p className="font-semibold text-white">{row.gstRate}% GST</p><p className="text-xs text-gray-400">Taxable {formatCurrency(row.taxableValue || 0)}</p></div><span className="font-semibold text-amber-200">{formatCurrency(row.taxAmount || 0)}</span></div>)}</div></section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="text-base font-semibold text-white">Consumables Usage</h3><div className="mt-4 space-y-3">{(reports?.consumableUsage || []).map((row) => <div key={`${row.productId}-${row.productName}`} className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-sm text-gray-200"><div className="flex items-center justify-between"><p className="font-semibold text-white">{row.productName}</p><span className="text-cyan-200">{row.quantity}</span></div><p className="mt-1 text-xs text-gray-400">{row.sku || 'No SKU'} • Issued {row.issuedQuantity} • Charge {formatCurrency(row.chargeValue || 0)}</p></div>)}</div></section>
          </div>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="text-base font-semibold text-white">Pending Pickups</h3><div className="mt-4 space-y-3">{(reports?.pendingPickups || []).map((row) => <div key={row._id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-sm text-gray-200 xl:flex-row xl:items-center xl:justify-between"><div><p className="font-semibold text-white">{row.orderNumber} • {row.customerName}</p><p className="text-xs text-gray-400">{row.serviceName} • {row.assignedStaffName || 'Unassigned'} • {row.completedAt ? new Date(row.completedAt).toLocaleDateString('en-IN') : '-'}</p></div><span className="font-semibold text-amber-200">{formatCurrency(row.totalAmount || 0)}</span></div>)}</div></section>
        </div>
      )}
    </div>
  );
};
