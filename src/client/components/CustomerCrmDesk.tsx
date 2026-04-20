import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerCampaignManager } from './CustomerCampaignManager';
import { CustomerDirectoryTable } from './CustomerDirectoryTable';
import { FloatingField } from './FloatingField';
import { ManualHelpLink } from './ManualHelpLink';
import { CustomerCrmDirectoryFilters } from './customerCrmShared';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { saveCrmConversionDraft } from '../utils/crmDrafts';
import { showConfirmDialog } from '../utils/appDialogs';

type CustomerCategory = 'individual' | 'group_team' | 'corporate' | 'regular_member' | 'walk_in';
type EnquiryStatus = 'new' | 'contacted' | 'converted' | 'lost';
type EnquirySource = 'website' | 'phone' | 'walk_in' | 'social_media';
type EnquiryRequestKind = 'facility_booking' | 'event_booking' | 'membership' | 'shop_purchase' | 'general';

interface CustomerRow {
  _id: string;
  customerCode: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  profilePhotoUrl?: string;
  customerCategory?: CustomerCategory;
  address?: string;
  notes?: string;
  accountType: 'cash' | 'credit';
  creditLimit?: number;
  creditDays?: number;
  isBlocked?: boolean;
  pricingTier?: string;
  contacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
    visibility?: 'billing' | 'operational' | 'c_level' | 'general';
    notes?: string;
  }>;
  activityLog?: Array<{
    activityType: 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute';
    summary: string;
    details?: string;
    nextFollowUpDate?: string;
    createdAt?: string;
  }>;
  preferences?: {
    preferredSport?: string;
    preferredFacilityId?: string;
    preferredTimeSlot?: string;
    preferredShopItems?: string[];
  };
}

interface UnifiedOption {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: 'customer' | 'member';
  customerCode?: string;
  memberCode?: string;
}

interface DunningRow {
  customerId?: string;
  customerCode?: string;
  customerName: string;
  pricingTier?: string;
  totalOutstanding: number;
  invoiceCount: number;
  maxDaysPastDue: number;
  recommendedAction: string;
  billingContact?: { name?: string } | null;
}

interface StaffOption {
  _id: string;
  name: string;
  email?: string;
  role?: string;
}

interface FacilityOption {
  _id: string;
  name: string;
  location?: string;
}

interface EnquiryRow {
  _id: string;
  enquiryNumber: string;
  customerId?: string;
  customerCode?: string;
  customerName: string;
  contactPhone?: string;
  contactEmail?: string;
  customerCategory?: CustomerCategory;
  requestKind: EnquiryRequestKind;
  source: EnquirySource;
  status: EnquiryStatus;
  assignedToUserId?: string;
  assignedToName?: string;
  requestedFacilityId?: string;
  requestedFacilityName?: string;
  preferredSport?: string;
  requestedDate?: string;
  requestedStartTime?: string;
  durationHours?: number;
  participantsCount?: number;
  estimatedAmount?: number;
  followUpDate?: string;
  notes?: string;
  lostReason?: string;
}

interface DashboardPayload {
  summary: {
    totalCustomers: number;
    activeMembers: number;
    newCustomersThisMonth: number;
    newCustomersThisWeek: number;
    repeatCustomers: number;
    totalOutstanding: number;
    enquiryCount: number;
    convertedCount: number;
    lostCount: number;
    conversionRate: number;
    overdueFollowUps: number;
  };
  popularFacilities: Array<{ name: string; count: number }>;
  popularTimeSlots: Array<{ slot: string; count: number }>;
  topCustomers: Array<{ customerId?: string; customerName: string; totalSpent: number; visits: number; pendingDues: number; lastVisitAt?: string | null }>;
  enquiryBySource: Array<{ label: string; count: number }>;
  lostReasons: Array<{ reason: string; count: number }>;
}

interface HistoryPayload {
  summary: {
    totalVisits: number;
    visitsPerMonth: number;
    visitFrequencyLabel: string;
    totalSpent: number;
    pendingDues: number;
    facilityBookingCount: number;
    eventBookingCount: number;
    invoiceCount: number;
    quotationCount: number;
    lastVisitAt?: string | null;
  };
  preferences: {
    preferredSport?: string;
    preferredFacilityId?: string;
    preferredFacilityName?: string;
    preferredTimeSlot?: string;
    preferredShopItems?: string[];
  };
  memberships: Array<{
    memberCode?: string;
    memberName?: string;
    fullName?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    rewardPointsBalance?: number;
  }>;
  bookingHistory: Array<{
    type: string;
    referenceNo: string;
    itemName: string;
    activityDate: string;
    amount: number;
    paidAmount: number;
    balanceAmount: number;
    status: string;
    paymentStatus: string;
  }>;
  paymentHistory: Array<{
    type: string;
    referenceNo: string;
    activityDate: string;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    paymentStatus: string;
  }>;
  quotationHistory: Array<{
    type: string;
    referenceNo: string;
    activityDate: string;
    amount: number;
    status: string;
  }>;
}

type CustomerCrmTab = 'directory' | 'profiles' | 'enquiries' | 'campaigns' | 'reports';

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);
const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';
const buttonClass = 'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';
const panelClass = 'rounded-xl border border-white/10 bg-white/5 p-5';
const sectionTitleClass = 'text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200';
const CUSTOMER_BATCH_SIZE = 50;
const customerCategoryOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'group_team', label: 'Group / Team' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'regular_member', label: 'Regular Member' },
  { value: 'walk_in', label: 'Walk In' },
];
const accountTypeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit', label: 'Credit' },
];
const contactVisibilityOptions = [
  { value: 'billing', label: 'Billing' },
  { value: 'operational', label: 'Operational' },
  { value: 'c_level', label: 'C-Level' },
  { value: 'general', label: 'General' },
];
const activityTypeOptions = [
  { value: 'note', label: 'General Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'payment_reminder', label: 'Payment Reminder' },
  { value: 'dispute', label: 'Complaint / Dispute' },
];
const enquiryRequestKindOptions = [
  { value: 'facility_booking', label: 'Facility Booking' },
  { value: 'event_booking', label: 'Event Booking' },
  { value: 'membership', label: 'Membership' },
  { value: 'shop_purchase', label: 'Shop Purchase' },
  { value: 'general', label: 'General' },
];
const enquirySourceOptions = [
  { value: 'walk_in', label: 'Walk In' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'social_media', label: 'Social Media' },
];
const enquiryStatusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

const downloadCsv = (fileName: string, rows: Array<Array<string | number>>) => {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }).join(',')).join('\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
};

const categoryLabel = (value?: string) =>
  String(value || 'individual')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const relativeDate = (value?: string) => (value ? new Date(value).toLocaleString('en-IN') : '-');

const customerCrmTabPath = (tab: CustomerCrmTab): string => {
  if (tab === 'directory') return '/customers/directory';
  if (tab === 'enquiries') return '/customers/enquiries';
  if (tab === 'campaigns') return '/customers/campaigns';
  if (tab === 'reports') return '/customers/reports';
  return '/customers/profiles';
};

const CRM_CAPABILITY_CARDS = [
  {
    title: 'Member And Lead Management',
    description: 'Use customer profiles and lead enquiries as the central CRM source for contact details, preferences, activity timeline, linked memberships, and follow-up ownership.',
    sourceLabel: 'Single source',
    sourceValue: 'Customer Profiles + CRM Enquiries',
    actionLabel: 'Open CRM',
    path: '/customers/directory',
  },
  {
    title: 'Scheduling And Booking',
    description: 'Run facility and event booking from the booking pages, with availability checks, confirmations, reminders, and conversion from enquiries into bookings or quotations.',
    sourceLabel: 'Single source',
    sourceValue: 'Facility Booking + Event Bookings',
    actionLabel: 'Open Bookings',
    path: '/facilities',
  },
  {
    title: 'Membership And Payments',
    description: 'Manage plan tiers, passes, discounts, renewals, reminder automation, POS member benefits, and subscription lifecycle from the memberships workspace.',
    sourceLabel: 'Single source',
    sourceValue: 'Memberships',
    actionLabel: 'Open Memberships',
    path: '/memberships',
  },
  {
    title: 'Communication And Engagement',
    description: 'Segment customers, save campaign drafts, send professional email campaigns, and keep follow-up activity inside the CRM instead of separate contact lists.',
    sourceLabel: 'Single source',
    sourceValue: 'CRM Campaigns + Customer Activity',
    actionLabel: 'Open Campaigns',
    path: '/customers/campaigns',
  },
  {
    title: 'Reporting And Analytics',
    description: 'Review conversion, retention signals, revenue trends, popular facilities, time slots, overdue follow-up, and collection cases without duplicating reports across modules.',
    sourceLabel: 'Single source',
    sourceValue: 'CRM Reports + Membership Reports',
    actionLabel: 'Open Reports',
    path: '/customers/reports',
  },
] as const;

export const CustomerCrmDesk: React.FC<{ initialTab?: CustomerCrmTab }> = ({ initialTab = 'directory' }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CustomerCrmTab>(initialTab);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState('');
  const [enquirySearch, setEnquirySearch] = useState('');
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState<'all' | EnquiryStatus>('all');
  const [enquirySourceFilter, setEnquirySourceFilter] = useState<'all' | EnquirySource>('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingEnquiry, setSavingEnquiry] = useState(false);
  const [memberSuggestions, setMemberSuggestions] = useState<UnifiedOption[]>([]);
  const [dunningRows, setDunningRows] = useState<DunningRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [directorySelectedIds, setDirectorySelectedIds] = useState<string[]>([]);
  const [directoryFilteredRows, setDirectoryFilteredRows] = useState<CustomerRow[]>([]);
  const [directoryFilters, setDirectoryFilters] = useState<CustomerCrmDirectoryFilters>({
    search: '',
    customerCategories: [],
    accountTypes: [],
    statuses: [],
    pricingTiers: [],
  });
  const [form, setForm] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    gstin: '',
    profilePhotoUrl: '',
    customerCategory: 'individual' as CustomerCategory,
    address: '',
    accountType: 'cash' as 'cash' | 'credit',
    creditLimit: '0',
    creditDays: '0',
    pricingTier: '',
    preferredSport: '',
    preferredFacilityId: '',
    preferredTimeSlot: '',
    preferredShopItems: '',
    notes: '',
    contacts: [] as Array<{
      name: string;
      role: string;
      phone: string;
      email: string;
      visibility: 'billing' | 'operational' | 'c_level' | 'general';
      isPrimary: boolean;
      notes: string;
    }>,
  });
  const [activityForm, setActivityForm] = useState({
    activityType: 'note' as 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute',
    summary: '',
    details: '',
    nextFollowUpDate: '',
  });
  const [enquiryForm, setEnquiryForm] = useState({
    id: '',
    customerName: '',
    contactPhone: '',
    contactEmail: '',
    customerCategory: 'individual' as CustomerCategory,
    requestKind: 'facility_booking' as EnquiryRequestKind,
    source: 'walk_in' as EnquirySource,
    status: 'new' as EnquiryStatus,
    assignedToUserId: '',
    requestedFacilityId: '',
    requestedFacilityName: '',
    preferredSport: '',
    requestedDate: '',
    requestedStartTime: '',
    durationHours: '1',
    participantsCount: '1',
    estimatedAmount: '',
    followUpDate: '',
    notes: '',
    lostReason: '',
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const openTab = (tab: CustomerCrmTab) => {
    setActiveTab(tab);
    navigate(customerCrmTabPath(tab));
  };

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const selectedCustomer = useMemo(() => rows.find((row) => row._id === form.id) || null, [form.id, rows]);

  const loadCustomers = async (q = search, reset = true) => {
    void q;
    void reset;
    setLoading(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/customers'), { headers });
      const incoming = Array.isArray(response?.data) ? response.data : [];
      setTotalRows(incoming.length);
      setRows(incoming);
      setHasMoreRows(false);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
      setLoadingMoreRows(false);
    }
  };

  const loadDashboard = async () => {
    try {
      const response = await fetchApiJson(apiUrl('/api/customer-crm/dashboard'), { headers });
      setDashboard(response?.data || null);
    } catch {
      setDashboard(null);
    }
  };

  const loadDunning = async () => {
    try {
      const response = await fetchApiJson(apiUrl('/api/customers/dunning/report?minDays=1'), { headers });
      setDunningRows(Array.isArray(response?.data?.rows) ? response.data.rows : []);
    } catch {
      setDunningRows([]);
    }
  };

  const loadFacilities = async () => {
    try {
      const response = await fetchApiJson(apiUrl('/api/facilities'), { headers });
      setFacilities(Array.isArray(response?.data) ? response.data : []);
    } catch {
      setFacilities([]);
    }
  };

  const loadStaff = async () => {
    try {
      const response = await fetchApiJson(apiUrl('/api/customer-crm/staff'), { headers });
      setStaffOptions(Array.isArray(response?.data) ? response.data : []);
    } catch {
      setStaffOptions([]);
    }
  };

  const loadMemberSuggestions = async (q = search) => {
    try {
      const query = String(q || '').trim();
      if (!query) {
        setMemberSuggestions([]);
        return;
      }
      const response = await fetchApiJson(apiUrl(`/api/customers/search-unified?q=${encodeURIComponent(query)}`), { headers });
      const all = Array.isArray(response?.data) ? response.data : [];
      setMemberSuggestions(all.filter((row: UnifiedOption) => row.source === 'member'));
    } catch {
      setMemberSuggestions([]);
    }
  };

  const loadEnquiries = async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (enquirySearch.trim()) params.set('q', enquirySearch.trim());
      if (enquiryStatusFilter !== 'all') params.set('status', enquiryStatusFilter);
      if (enquirySourceFilter !== 'all') params.set('source', enquirySourceFilter);
      const response = await fetchApiJson(apiUrl(`/api/customer-crm/enquiries?${params.toString()}`), { headers });
      setEnquiries(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load enquiries');
    }
  };

  const loadHistory = async (customerId: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetchApiJson(apiUrl(`/api/customer-crm/customer/${customerId}/history`), { headers });
      setHistory(response?.data || null);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      loadCustomers('', true),
      loadDashboard(),
      loadDunning(),
      loadEnquiries(),
      loadFacilities(),
      loadStaff(),
    ]);
  }, []);

  useEffect(() => {
    if (form.id) {
      void loadHistory(form.id);
    } else {
      setHistory(null);
    }
  }, [form.id]);

  useEffect(() => {
    setDirectorySelectedIds((previous) => previous.filter((id) => rows.some((row) => row._id === id)));
  }, [rows]);

  const resetCustomerForm = () => {
    setForm({
      id: '',
      name: '',
      phone: '',
      email: '',
      gstin: '',
      profilePhotoUrl: '',
      customerCategory: 'individual',
      address: '',
      accountType: 'cash',
      creditLimit: '0',
      creditDays: '0',
      pricingTier: '',
      preferredSport: '',
      preferredFacilityId: '',
      preferredTimeSlot: '',
      preferredShopItems: '',
      notes: '',
      contacts: [],
    });
    setActivityForm({ activityType: 'note', summary: '', details: '', nextFollowUpDate: '' });
    setHistory(null);
  };

  const closeProfileDialog = () => {
    setProfileDialogOpen(false);
    resetCustomerForm();
  };

  useEffect(() => {
    if (!profileDialogOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeProfileDialog();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profileDialogOpen]);

  const resetEnquiryForm = () => {
    setEnquiryForm({
      id: '',
      customerName: '',
      contactPhone: '',
      contactEmail: '',
      customerCategory: 'individual',
      requestKind: 'facility_booking',
      source: 'walk_in',
      status: 'new',
      assignedToUserId: '',
      requestedFacilityId: '',
      requestedFacilityName: '',
      preferredSport: '',
      requestedDate: '',
      requestedStartTime: '',
      durationHours: '1',
      participantsCount: '1',
      estimatedAmount: '',
      followUpDate: '',
      notes: '',
      lostReason: '',
    });
  };

  const populateCustomerForm = (row: CustomerRow) => {
    setForm({
      id: row._id,
      name: row.name || '',
      phone: row.phone || '',
      email: row.email || '',
      gstin: row.gstin || '',
      profilePhotoUrl: row.profilePhotoUrl || '',
      customerCategory: (row.customerCategory || 'individual') as CustomerCategory,
      address: row.address || '',
      accountType: row.accountType || 'cash',
      creditLimit: String(Number(row.creditLimit || 0)),
      creditDays: String(Number(row.creditDays || 0)),
      pricingTier: String(row.pricingTier || ''),
      preferredSport: String(row.preferences?.preferredSport || ''),
      preferredFacilityId: String(row.preferences?.preferredFacilityId || ''),
      preferredTimeSlot: String(row.preferences?.preferredTimeSlot || ''),
      preferredShopItems: Array.isArray(row.preferences?.preferredShopItems) ? row.preferences?.preferredShopItems.join(', ') : '',
      notes: row.notes || '',
      contacts: Array.isArray(row.contacts)
        ? row.contacts.map((contact) => ({
          name: String(contact.name || ''),
          role: String(contact.role || ''),
          phone: String(contact.phone || ''),
          email: String(contact.email || ''),
          visibility: (contact.visibility || 'general') as 'billing' | 'operational' | 'c_level' | 'general',
          isPrimary: Boolean(contact.isPrimary),
          notes: String(contact.notes || ''),
        }))
        : [],
    });
  };

  const editCustomer = (row: CustomerRow) => {
    populateCustomerForm(row);
    setProfileDialogOpen(true);
  };

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const normalizedPhone = normalizePhone(form.phone);
    if (!form.name.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!normalizedPhone) {
      setError('Phone number is required');
      return;
    }

    setSavingCustomer(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: normalizedPhone,
        email: form.email.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        profilePhotoUrl: form.profilePhotoUrl,
        customerCategory: form.customerCategory,
        address: form.address.trim(),
        accountType: form.accountType,
        creditLimit: Number(form.creditLimit || 0),
        creditDays: Number(form.creditDays || 0),
        pricingTier: form.pricingTier.trim(),
        preferences: {
          preferredSport: form.preferredSport.trim(),
          preferredFacilityId: form.preferredFacilityId,
          preferredTimeSlot: form.preferredTimeSlot.trim(),
          preferredShopItems: form.preferredShopItems.split(',').map((item) => item.trim()).filter(Boolean),
        },
        notes: form.notes.trim(),
        contacts: form.contacts.map((contact) => ({
          name: contact.name.trim(),
          role: contact.role.trim(),
          phone: normalizePhone(contact.phone),
          email: contact.email.trim(),
          visibility: contact.visibility,
          isPrimary: Boolean(contact.isPrimary),
          notes: contact.notes.trim(),
        })).filter((contact) => contact.name),
      };

      if (form.id) {
        await fetchApiJson(apiUrl(`/api/customers/${form.id}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('Customer profile updated');
      } else {
        await fetchApiJson(apiUrl('/api/customers'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('Customer profile created');
      }

      const shouldCloseDialog = profileDialogOpen;
      resetCustomerForm();
      if (shouldCloseDialog) setProfileDialogOpen(false);
      await Promise.all([loadCustomers(search, true), loadDashboard(), loadDunning()]);
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save customer');
    } finally {
      setSavingCustomer(false);
    }
  };

  const toggleBlock = async (row: CustomerRow) => {
    const confirmed = await showConfirmDialog(
      row.isBlocked ? 'Unblock this customer profile?' : 'Block this customer profile?',
      { title: row.isBlocked ? 'Unblock Customer' : 'Block Customer', confirmText: row.isBlocked ? 'Unblock' : 'Block' }
    );
    if (!confirmed) return;

    try {
      await fetchApiJson(apiUrl(`/api/customers/${row._id}/block`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isBlocked: !row.isBlocked }),
      });
      setMessage(row.isBlocked ? 'Customer unblocked' : 'Customer blocked');
      await Promise.all([loadCustomers(search, true), loadDashboard(), loadDunning()]);
    } catch (blockError: any) {
      setError(blockError?.message || 'Failed to update customer status');
    }
  };

  const logActivity = async () => {
    if (!form.id) return;
    try {
      await fetchApiJson(apiUrl(`/api/customers/${form.id}/activities`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          activityType: activityForm.activityType,
          summary: activityForm.summary.trim(),
          details: activityForm.details.trim(),
          nextFollowUpDate: activityForm.nextFollowUpDate || undefined,
        }),
      });
      setMessage('Customer note logged');
      setActivityForm({ activityType: 'note', summary: '', details: '', nextFollowUpDate: '' });
      await Promise.all([loadCustomers(search, true), loadHistory(form.id)]);
    } catch (activityError: any) {
      setError(activityError?.message || 'Failed to log customer activity');
    }
  };

  const addMemberAsCustomer = async (row: UnifiedOption) => {
    try {
      await fetchApiJson(apiUrl('/api/customers'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: row.name,
          phone: normalizePhone(String(row.phone || '')),
          email: String(row.email || '').trim(),
          customerCategory: 'regular_member',
          accountType: 'cash',
        }),
      });
      setMessage('Member added as customer profile');
      await Promise.all([loadCustomers(search, true), loadDashboard()]);
    } catch (memberError: any) {
      setError(memberError?.message || 'Failed to add member as customer');
    }
  };

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: '', role: '', phone: '', email: '', visibility: 'general', isPrimary: false, notes: '' }],
    }));
  };

  const updateContact = (index: number, field: 'name' | 'role' | 'phone' | 'email' | 'visibility' | 'isPrimary' | 'notes', value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, contactIndex) => (contactIndex === index ? { ...contact, [field]: value } : contact)),
    }));
  };

  const removeContact = (index: number) => {
    setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, contactIndex) => contactIndex !== index) }));
  };

  const saveEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!enquiryForm.customerName.trim()) {
      setError('Enquiry customer name is required');
      return;
    }

    setSavingEnquiry(true);
    try {
      const payload = {
        customerName: enquiryForm.customerName.trim(),
        contactPhone: normalizePhone(enquiryForm.contactPhone) || enquiryForm.contactPhone.trim(),
        contactEmail: enquiryForm.contactEmail.trim(),
        customerCategory: enquiryForm.customerCategory,
        requestKind: enquiryForm.requestKind,
        source: enquiryForm.source,
        status: enquiryForm.status,
        assignedToUserId: enquiryForm.assignedToUserId || undefined,
        requestedFacilityId: enquiryForm.requestedFacilityId || undefined,
        requestedFacilityName:
          facilities.find((row) => row._id === enquiryForm.requestedFacilityId)?.name
          || enquiryForm.requestedFacilityName.trim()
          || undefined,
        preferredSport: enquiryForm.preferredSport.trim(),
        requestedDate: enquiryForm.requestedDate || undefined,
        requestedStartTime: enquiryForm.requestedStartTime || undefined,
        durationHours: Number(enquiryForm.durationHours || 0),
        participantsCount: Number(enquiryForm.participantsCount || 0),
        estimatedAmount: Number(enquiryForm.estimatedAmount || 0),
        followUpDate: enquiryForm.followUpDate || undefined,
        notes: enquiryForm.notes.trim(),
        lostReason: enquiryForm.lostReason.trim(),
      };

      if (enquiryForm.id) {
        await fetchApiJson(apiUrl(`/api/customer-crm/enquiries/${enquiryForm.id}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('Enquiry updated');
      } else {
        await fetchApiJson(apiUrl('/api/customer-crm/enquiries'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('Enquiry created');
      }

      resetEnquiryForm();
      await Promise.all([loadEnquiries(), loadDashboard()]);
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save enquiry');
    } finally {
      setSavingEnquiry(false);
    }
  };

  const editEnquiry = (row: EnquiryRow) => {
    openTab('enquiries');
    setEnquiryForm({
      id: row._id,
      customerName: row.customerName || '',
      contactPhone: row.contactPhone || '',
      contactEmail: row.contactEmail || '',
      customerCategory: (row.customerCategory || 'individual') as CustomerCategory,
      requestKind: row.requestKind || 'general',
      source: row.source || 'walk_in',
      status: row.status || 'new',
      assignedToUserId: row.assignedToUserId || '',
      requestedFacilityId: row.requestedFacilityId || '',
      requestedFacilityName: row.requestedFacilityName || '',
      preferredSport: row.preferredSport || '',
      requestedDate: row.requestedDate ? String(row.requestedDate).slice(0, 10) : '',
      requestedStartTime: row.requestedStartTime || '',
      durationHours: String(Number(row.durationHours || 1)),
      participantsCount: String(Number(row.participantsCount || 1)),
      estimatedAmount: row.estimatedAmount ? String(row.estimatedAmount) : '',
      followUpDate: row.followUpDate ? String(row.followUpDate).slice(0, 10) : '',
      notes: row.notes || '',
      lostReason: row.lostReason || '',
    });
  };

  const linkEnquiryCustomer = async (row: EnquiryRow) => {
    const confirmed = await showConfirmDialog('Link this enquiry to a customer profile now?', {
      title: 'Link Customer Profile',
      confirmText: 'Link Customer',
    });
    if (!confirmed) return;

    try {
      await fetchApiJson(apiUrl(`/api/customer-crm/enquiries/${row._id}/link-customer`), {
        method: 'POST',
        headers,
      });
      setMessage('Customer profile linked from enquiry');
      await Promise.all([loadEnquiries(), loadCustomers(search, true), loadDashboard()]);
    } catch (linkError: any) {
      setError(linkError?.message || 'Failed to link customer profile');
    }
  };

  const useEnquiryDraft = (row: EnquiryRow, target: 'facility-booking' | 'event-booking' | 'event-quotation' | 'sales-quotation', path: string) => {
    saveCrmConversionDraft({
      target,
      enquiryId: row._id,
      enquiryNumber: row.enquiryNumber,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.contactPhone,
      customerEmail: row.contactEmail,
      requestedFacilityId: row.requestedFacilityId,
      requestedFacilityName: row.requestedFacilityName,
      requestedDate: row.requestedDate ? String(row.requestedDate).slice(0, 10) : '',
      requestedStartTime: row.requestedStartTime,
      durationHours: Number(row.durationHours || 1),
      preferredSport: row.preferredSport,
      notes: row.notes,
    });
    navigate(path);
  };

  const customerTableRows = useMemo(() => rows, [rows]);

  const exportCustomerCsv = () => {
    downloadCsv('customer-crm-list.csv', [
      ['Code', 'Name', 'Phone', 'Email', 'Category', 'Account Type', 'Pricing Tier', 'Status'],
      ...customerTableRows.map((row) => [
        row.customerCode,
        row.name,
        row.phone || '',
        row.email || '',
        categoryLabel(row.customerCategory),
        row.accountType,
        row.pricingTier || '',
        row.isBlocked ? 'Blocked' : 'Active',
      ]),
    ]);
  };

  const exportEnquiryCsv = () => {
    downloadCsv('customer-enquiries.csv', [
      ['Enquiry No', 'Customer', 'Phone', 'Email', 'Type', 'Source', 'Status', 'Assigned To', 'Requested Facility', 'Follow Up', 'Notes'],
      ...enquiries.map((row) => [
        row.enquiryNumber,
        row.customerName,
        row.contactPhone || '',
        row.contactEmail || '',
        categoryLabel(row.requestKind),
        categoryLabel(row.source),
        categoryLabel(row.status),
        row.assignedToName || '',
        row.requestedFacilityName || '',
        row.followUpDate ? String(row.followUpDate).slice(0, 10) : '',
        row.notes || '',
      ]),
    ]);
  };

  const enquirySummary = useMemo(() => ({
    total: enquiries.length,
    newCount: enquiries.filter((row) => row.status === 'new').length,
    contactedCount: enquiries.filter((row) => row.status === 'contacted').length,
    convertedCount: enquiries.filter((row) => row.status === 'converted').length,
    lostCount: enquiries.filter((row) => row.status === 'lost').length,
  }), [enquiries]);

  const searchProfiles = async () => {
    await Promise.all([loadCustomers(search, true), loadMemberSuggestions(search), loadDashboard(), loadDunning()]);
  };

  const clearProfiles = async () => {
    setSearch('');
    setMemberSuggestions([]);
    await Promise.all([loadCustomers('', true), loadDashboard(), loadDunning()]);
  };

  const searchEnquiryRows = async () => {
    await Promise.all([loadEnquiries(), loadDashboard()]);
  };

  const clearEnquiries = async () => {
    setEnquirySearch('');
    setEnquiryStatusFilter('all');
    setEnquirySourceFilter('all');
    await Promise.all([loadEnquiries(), loadDashboard()]);
  };

  const handlePhotoUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, profilePhotoUrl: dataUrl }));
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Failed to read profile photo');
    }
  };

  const renderCustomerProfileForm = (options?: { inDialog?: boolean }) => {
    const inDialog = Boolean(options?.inDialog);

    return (
      <form onSubmit={saveCustomer} className={inDialog ? 'space-y-4' : `${panelClass} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={sectionTitleClass}>{form.id ? 'Edit Profile' : 'New Profile'}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{form.id ? 'Update customer profile' : 'Create customer profile'}</h2>
            <p className="mt-1 text-sm text-gray-400">Keep identity, preferences, contact roles, and notes in one record.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {form.profilePhotoUrl ? (
                <img src={form.profilePhotoUrl} alt={form.name || 'Customer'} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-cyan-100">{(form.name || 'C').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10">
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handlePhotoUpload(e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {form.profilePhotoUrl && (
                <button type="button" onClick={() => setForm((prev) => ({ ...prev, profilePhotoUrl: '' }))} className="block rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300">
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FloatingField label="Customer Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
          <FloatingField label="Phone" value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
          <FloatingField label="Email" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
          <FloatingField label="GSTIN" value={form.gstin} onChange={(value) => setForm((prev) => ({ ...prev, gstin: value.toUpperCase() }))} />
          <FloatingField
            label="Customer Category"
            value={form.customerCategory}
            onChange={(value) => setForm((prev) => ({ ...prev, customerCategory: value as CustomerCategory }))}
            options={customerCategoryOptions}
          />
          <FloatingField
            label="Account Type"
            value={form.accountType}
            onChange={(value) => setForm((prev) => ({ ...prev, accountType: value as 'cash' | 'credit' }))}
            options={accountTypeOptions}
          />
          <FloatingField label="Pricing Tier" value={form.pricingTier} onChange={(value) => setForm((prev) => ({ ...prev, pricingTier: value }))} />
          <FloatingField label="Credit Limit" type="number" min="0" step="0.01" value={form.creditLimit} onChange={(value) => setForm((prev) => ({ ...prev, creditLimit: value }))} />
          <FloatingField label="Credit Days" type="number" min="0" step="1" value={form.creditDays} onChange={(value) => setForm((prev) => ({ ...prev, creditDays: value }))} />
        </div>

        <FloatingField label="Address" rows={3} value={form.address} onChange={(value) => setForm((prev) => ({ ...prev, address: value }))} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FloatingField label="Preferred Sport" value={form.preferredSport} onChange={(value) => setForm((prev) => ({ ...prev, preferredSport: value }))} />
          <FloatingField
            label="Preferred Facility"
            value={form.preferredFacilityId}
            onChange={(value) => setForm((prev) => ({ ...prev, preferredFacilityId: value }))}
            options={[
              { value: '', label: 'Preferred facility' },
              ...facilities.map((facility) => ({ value: facility._id, label: facility.name })),
            ]}
          />
          <FloatingField label="Preferred Time Slot" value={form.preferredTimeSlot} onChange={(value) => setForm((prev) => ({ ...prev, preferredTimeSlot: value }))} />
          <FloatingField label="Preferred Shop Items" value={form.preferredShopItems} onChange={(value) => setForm((prev) => ({ ...prev, preferredShopItems: value }))} />
        </div>

        <FloatingField
          label="Notes, Complaints, Feedback, Or Special Requests"
          rows={3}
          value={form.notes}
          onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))}
        />

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className={sectionTitleClass}>Contact Roles</p>
              <p className="mt-1 text-xs text-gray-400">Add billing, operational, or decision-maker contacts under the same customer.</p>
            </div>
            <button type="button" onClick={addContact} className="rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100">
              Add Contact
            </button>
          </div>
          <div className="space-y-3">
            {form.contacts.map((contact, index) => (
              <div key={`contact-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FloatingField label="Contact Name" value={contact.name} onChange={(value) => updateContact(index, 'name', value)} />
                  <FloatingField label="Role" value={contact.role} onChange={(value) => updateContact(index, 'role', value)} />
                  <FloatingField label="Phone" value={contact.phone} onChange={(value) => updateContact(index, 'phone', value)} />
                  <FloatingField label="Email" type="email" value={contact.email} onChange={(value) => updateContact(index, 'email', value)} />
                  <FloatingField
                    label="Visibility"
                    value={contact.visibility}
                    onChange={(value) => updateContact(index, 'visibility', value)}
                    options={contactVisibilityOptions}
                  />
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                    <input type="checkbox" checked={contact.isPrimary} onChange={(e) => updateContact(index, 'isPrimary', e.target.checked)} />
                    Primary contact
                  </label>
                </div>
                <FloatingField className="mt-3" label="Contact Notes" rows={2} value={contact.notes} onChange={(value) => updateContact(index, 'notes', value)} />
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => removeContact(index)} className="rounded-md bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100">
                    Remove Contact
                  </button>
                </div>
              </div>
            ))}
            {!form.contacts.length && <p className="text-sm text-gray-400">No additional contacts added yet.</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={savingCustomer} className={buttonClass}>
            {savingCustomer ? 'Saving...' : form.id ? 'Update Profile' : 'Create Profile'}
          </button>
          {inDialog ? (
            <button type="button" onClick={closeProfileDialog} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200">
              Cancel
            </button>
          ) : (
            <button type="button" onClick={resetCustomerForm} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200">
              Clear Form
            </button>
          )}
        </div>
      </form>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={sectionTitleClass}>Sales CRM</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Customer Relationship Desk</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-300">
            Sarva already handles bookings, memberships, sales, and collections. This desk adds the customer profile,
            website and walk-in lead capture, enquiry follow-up, and CRM summary layer that fits those existing modules
            without duplicate tracking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ManualHelpLink anchor="customers" />
          {activeTab === 'directory' && (
            <button onClick={exportCustomerCsv} className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100">
              Export Customers CSV
            </button>
          )}
          {activeTab === 'directory' && (
            <button
              onClick={() => {
                resetCustomerForm();
                openTab('profiles');
              }}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
            >
              New Profile
            </button>
          )}
          {activeTab === 'enquiries' && (
            <button onClick={exportEnquiryCsv} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">
              Export Enquiries CSV
            </button>
          )}
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div className={`${panelClass} flex flex-wrap gap-2 p-3`}>
        {[
          ['directory', 'Customer Directory'],
          ['profiles', 'Customer Profiles'],
          ['enquiries', 'Lead And Enquiries'],
          ['campaigns', 'Campaign Management'],
          ['reports', 'CRM Reports'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => openTab(key as CustomerCrmTab)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === key ? 'bg-indigo-500 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'directory' && (
        <CustomerDirectoryTable
          rows={rows}
          loading={loading}
          query={search}
          selectedIds={directorySelectedIds}
          onQueryChange={setSearch}
          onSelectedIdsChange={setDirectorySelectedIds}
          onFilteredRowsChange={setDirectoryFilteredRows}
          onFilterPayloadChange={setDirectoryFilters}
          onEditCustomer={editCustomer}
          onToggleBlock={toggleBlock}
          onOpenCampaigns={() => openTab('campaigns')}
        />
      )}

      {activeTab === 'profiles' && (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            {renderCustomerProfileForm()}

            <div className="space-y-5">
              <div className={panelClass}>
                <p className={sectionTitleClass}>CRM Snapshot</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Customers</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.totalCustomers || 0}</p>
                    <p className="mt-1 text-xs text-gray-400">Profiles ready for booking and sales.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Repeat</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.repeatCustomers || 0}</p>
                    <p className="mt-1 text-xs text-gray-400">Customers with more than one visit.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-200">New This Month</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.newCustomersThisMonth || 0}</p>
                    <p className="mt-1 text-xs text-gray-400">Fresh additions this month.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-fuchsia-200">Outstanding</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(Number(dashboard?.summary.totalOutstanding || 0))}</p>
                    <p className="mt-1 text-xs text-gray-400">Open customer dues.</p>
                  </div>
                </div>
              </div>

              <div className={panelClass}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className={sectionTitleClass}>Member Suggestions</p>
                    <p className="mt-1 text-sm text-gray-400">Search with phone or member code, then add the member into CRM.</p>
                  </div>
                  <button onClick={() => void loadMemberSuggestions(search)} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200">
                    Refresh
                  </button>
                </div>
                <div className="max-h-[220px] space-y-3 overflow-y-auto pr-1">
                  {memberSuggestions.map((row) => (
                    <div key={row._id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="font-semibold text-white">{row.name || '-'}</p>
                      <p className="mt-1 text-xs text-gray-400">{row.memberCode || row.customerCode || '-'}</p>
                      <p className="text-sm text-gray-300">{row.phone || '-'}</p>
                      {row.email && <p className="text-xs text-gray-400">{row.email}</p>}
                      <button onClick={() => void addMemberAsCustomer(row)} className="mt-3 rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100">
                        Add To CRM
                      </button>
                    </div>
                  ))}
                  {!memberSuggestions.length && <p className="text-sm text-gray-400">Run a search to see member suggestions here.</p>}
                </div>
              </div>

              <div className={panelClass}>
                <p className={sectionTitleClass}>Collections Watchlist</p>
                <div className="mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                  {dunningRows.map((row, index) => (
                    <div key={`${row.customerId || row.customerCode || row.customerName}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{row.customerName}</p>
                          <p className="mt-1 text-xs text-gray-400">{row.customerCode || '-'} {row.pricingTier ? `| ${row.pricingTier}` : ''}</p>
                          {row.billingContact?.name && <p className="mt-1 text-xs text-cyan-200">Billing: {row.billingContact.name}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-amber-300">{formatCurrency(Number(row.totalOutstanding || 0))}</p>
                          <p className="text-xs text-gray-400">{row.invoiceCount} invoice(s)</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-rose-200">{row.maxDaysPastDue} days overdue. Suggested next step: {row.recommendedAction}.</p>
                    </div>
                  ))}
                  {!dunningRows.length && <p className="text-sm text-gray-400">No overdue customer dues right now.</p>}
                </div>
              </div>
            </div>
          </div>

          {selectedCustomer && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <div className={`${panelClass} space-y-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={sectionTitleClass}>Customer 360</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{selectedCustomer.name}</h2>
                    <p className="mt-1 text-sm text-gray-400">{selectedCustomer.customerCode} • {categoryLabel(selectedCustomer.customerCategory)}</p>
                  </div>
                  <button onClick={() => void toggleBlock(selectedCustomer)} className={`rounded-md px-3 py-2 text-sm font-semibold ${selectedCustomer.isBlocked ? 'bg-emerald-500/15 text-emerald-100' : 'bg-amber-500/15 text-amber-100'}`}>
                    {selectedCustomer.isBlocked ? 'Unblock Profile' : 'Block Profile'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Visits</p><p className="mt-2 text-2xl font-semibold text-white">{history?.summary.totalVisits || 0}</p><p className="mt-1 text-xs text-gray-400">{history?.summary.visitFrequencyLabel || 'No visits yet'}</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Spend</p><p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(Number(history?.summary.totalSpent || 0))}</p><p className="mt-1 text-xs text-gray-400">Booking and sales value.</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-amber-200">Pending</p><p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(Number(history?.summary.pendingDues || 0))}</p><p className="mt-1 text-xs text-gray-400">Open dues.</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-fuchsia-200">Bookings</p><p className="mt-2 text-2xl font-semibold text-white">{(history?.summary.facilityBookingCount || 0) + (history?.summary.eventBookingCount || 0)}</p><p className="mt-1 text-xs text-gray-400">Facility and event rows.</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-sky-200">Quotes</p><p className="mt-2 text-2xl font-semibold text-white">{history?.summary.quotationCount || 0}</p><p className="mt-1 text-xs text-gray-400">Sales and event quotations.</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-gray-300">Last Visit</p><p className="mt-2 text-sm font-semibold text-white">{relativeDate(history?.summary.lastVisitAt)}</p><p className="mt-1 text-xs text-gray-400">Most recent recorded activity.</p></div>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className={sectionTitleClass}>Saved Preferences</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-300">
                      <p><span className="text-gray-400">Preferred sport:</span> {history?.preferences.preferredSport || '-'}</p>
                      <p><span className="text-gray-400">Preferred facility:</span> {history?.preferences.preferredFacilityName || '-'}</p>
                      <p><span className="text-gray-400">Preferred time:</span> {history?.preferences.preferredTimeSlot || '-'}</p>
                      <p><span className="text-gray-400">Preferred shop items:</span> {(history?.preferences.preferredShopItems || []).join(', ') || '-'}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className={sectionTitleClass}>Membership Links</p>
                    <div className="mt-3 space-y-2">
                      {(history?.memberships || []).map((membership, index) => (
                        <div key={`${membership.memberCode || membership.fullName || 'membership'}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-200">
                          <p className="font-semibold text-white">{membership.fullName || membership.memberName || membership.memberCode || 'Member'}</p>
                          <p className="mt-1 text-xs text-gray-400">{membership.memberCode || '-'} • {categoryLabel(membership.status)}</p>
                          <p className="mt-1 text-xs text-gray-400">{membership.startDate ? String(membership.startDate).slice(0, 10) : '-'} to {membership.endDate ? String(membership.endDate).slice(0, 10) : '-'}</p>
                          <p className="mt-1 text-xs text-cyan-200">Reward points: {Number(membership.rewardPointsBalance || 0)}</p>
                        </div>
                      ))}
                      {!historyLoading && !(history?.memberships || []).length && <p className="text-sm text-gray-400">No linked membership records found.</p>}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className={sectionTitleClass}>Notes And Follow-Up</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FloatingField
                      label="Activity Type"
                      value={activityForm.activityType}
                      onChange={(value) => setActivityForm((prev) => ({ ...prev, activityType: value as 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute' }))}
                      options={activityTypeOptions}
                    />
                    <FloatingField
                      label="Next Follow-Up Date"
                      type="date"
                      value={activityForm.nextFollowUpDate}
                      onChange={(value) => setActivityForm((prev) => ({ ...prev, nextFollowUpDate: value }))}
                    />
                  </div>
                  <FloatingField className="mt-3" label="Short Summary" value={activityForm.summary} onChange={(value) => setActivityForm((prev) => ({ ...prev, summary: value }))} />
                  <FloatingField className="mt-3" label="Full Details" rows={3} value={activityForm.details} onChange={(value) => setActivityForm((prev) => ({ ...prev, details: value }))} />
                  <div className="mt-3">
                    <button type="button" onClick={() => void logActivity()} className={buttonClass}>Save Note</button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className={sectionTitleClass}>Recent Activity Log</p>
                  <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {(selectedCustomer.activityLog || []).map((activity, index) => (
                      <div key={`${activity.summary}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-200">{categoryLabel(activity.activityType)}</span>
                          <span className="text-xs text-gray-400">{relativeDate(activity.createdAt)}</span>
                        </div>
                        <p className="mt-2 font-semibold text-white">{activity.summary}</p>
                        {activity.details && <p className="mt-1 text-xs text-gray-400">{activity.details}</p>}
                        {activity.nextFollowUpDate && <p className="mt-1 text-xs text-amber-200">Next follow-up: {String(activity.nextFollowUpDate).slice(0, 10)}</p>}
                      </div>
                    ))}
                    {!selectedCustomer.activityLog?.length && <p className="text-sm text-gray-400">No notes logged for this customer yet.</p>}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className={panelClass}>
                  <p className={sectionTitleClass}>Recent Booking History</p>
                  <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {(history?.bookingHistory || []).map((row, index) => (
                      <div key={`${row.referenceNo}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{row.referenceNo}</p>
                            <p className="mt-1 text-xs text-gray-400">{row.type} • {row.itemName}</p>
                          </div>
                          <span className="text-xs text-gray-400">{relativeDate(row.activityDate)}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <p>Amount: <span className="text-white">{formatCurrency(Number(row.amount || 0))}</span></p>
                          <p>Paid: <span className="text-white">{formatCurrency(Number(row.paidAmount || 0))}</span></p>
                          <p>Balance: <span className="text-white">{formatCurrency(Number(row.balanceAmount || 0))}</span></p>
                          <p>Status: <span className="text-white">{categoryLabel(row.status)}</span></p>
                        </div>
                      </div>
                    ))}
                    {!historyLoading && !(history?.bookingHistory || []).length && <p className="text-sm text-gray-400">No booking history found yet.</p>}
                  </div>
                </div>

                <div className={panelClass}>
                  <p className={sectionTitleClass}>Payment History</p>
                  <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {(history?.paymentHistory || []).map((row, index) => (
                      <div key={`${row.referenceNo}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{row.referenceNo}</p>
                            <p className="mt-1 text-xs text-gray-400">{row.type}</p>
                          </div>
                          <span className="text-xs text-gray-400">{relativeDate(row.activityDate)}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <p>Total: <span className="text-white">{formatCurrency(Number(row.totalAmount || 0))}</span></p>
                          <p>Paid: <span className="text-white">{formatCurrency(Number(row.paidAmount || 0))}</span></p>
                          <p>Balance: <span className="text-white">{formatCurrency(Number(row.balanceAmount || 0))}</span></p>
                          <p>Payment: <span className="text-white">{categoryLabel(row.paymentStatus)}</span></p>
                        </div>
                      </div>
                    ))}
                    {!historyLoading && !(history?.paymentHistory || []).length && <p className="text-sm text-gray-400">No payment records found yet.</p>}
                  </div>
                </div>

                <div className={panelClass}>
                  <p className={sectionTitleClass}>Quotation History</p>
                  <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {(history?.quotationHistory || []).map((row, index) => (
                      <div key={`${row.referenceNo}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{row.referenceNo}</p>
                            <p className="mt-1 text-xs text-gray-400">{row.type}</p>
                          </div>
                          <span className="text-xs text-gray-400">{relativeDate(row.activityDate)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                          <p>Amount: <span className="text-white">{formatCurrency(Number(row.amount || 0))}</span></p>
                          <p>Status: <span className="text-white">{categoryLabel(row.status)}</span></p>
                        </div>
                      </div>
                    ))}
                    {!historyLoading && !(history?.quotationHistory || []).length && <p className="text-sm text-gray-400">No quotation history found yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {activeTab === 'campaigns' && (
        <CustomerCampaignManager
          allRows={rows}
          filteredRows={directoryFilteredRows}
          selectedRows={rows.filter((row) => directorySelectedIds.includes(row._id))}
          directoryFilters={directoryFilters}
          onClearSelection={() => setDirectorySelectedIds([])}
        />
      )}

      {activeTab === 'enquiries' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <form onSubmit={saveEnquiry} className={`${panelClass} space-y-4`}>
            <div>
              <p className={sectionTitleClass}>{enquiryForm.id ? 'Edit Enquiry' : 'New Enquiry'}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{enquiryForm.id ? 'Update enquiry' : 'Capture lead or enquiry'}</h2>
              <p className="mt-1 text-sm text-gray-400">Track source, owner, follow-up date, and move the lead into booking or quotation when ready.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FloatingField label="Customer Name" value={enquiryForm.customerName} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, customerName: value }))} />
              <FloatingField label="Phone" value={enquiryForm.contactPhone} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, contactPhone: value }))} />
              <FloatingField label="Email" type="email" value={enquiryForm.contactEmail} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, contactEmail: value }))} />
              <FloatingField
                label="Customer Category"
                value={enquiryForm.customerCategory}
                onChange={(value) => setEnquiryForm((prev) => ({ ...prev, customerCategory: value as CustomerCategory }))}
                options={customerCategoryOptions}
              />
              <FloatingField
                label="Request Kind"
                value={enquiryForm.requestKind}
                onChange={(value) => setEnquiryForm((prev) => ({ ...prev, requestKind: value as EnquiryRequestKind }))}
                options={enquiryRequestKindOptions}
              />
              <FloatingField
                label="Source"
                value={enquiryForm.source}
                onChange={(value) => setEnquiryForm((prev) => ({ ...prev, source: value as EnquirySource }))}
                options={enquirySourceOptions}
              />
              <FloatingField
                label="Status"
                value={enquiryForm.status}
                onChange={(value) => setEnquiryForm((prev) => ({ ...prev, status: value as EnquiryStatus }))}
                options={enquiryStatusOptions}
              />
              <FloatingField
                label="Assigned To"
                value={enquiryForm.assignedToUserId}
                onChange={(value) => setEnquiryForm((prev) => ({ ...prev, assignedToUserId: value }))}
                options={[
                  { value: '', label: 'Not assigned' },
                  ...staffOptions.map((staff) => ({ value: staff._id, label: staff.name })),
                ]}
              />
              <FloatingField
                label="Requested Facility"
                value={enquiryForm.requestedFacilityId}
                onChange={(value) => setEnquiryForm((prev) => ({ ...prev, requestedFacilityId: value }))}
                options={[
                  { value: '', label: 'Requested facility' },
                  ...facilities.map((facility) => ({ value: facility._id, label: facility.name })),
                ]}
              />
              <FloatingField label="Preferred Sport" value={enquiryForm.preferredSport} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, preferredSport: value }))} />
              <FloatingField label="Requested Date" type="date" value={enquiryForm.requestedDate} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, requestedDate: value }))} />
              <FloatingField label="Requested Start Time" type="time" value={enquiryForm.requestedStartTime} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, requestedStartTime: value }))} />
              <FloatingField label="Duration (hours)" type="number" min="0" step="0.5" value={enquiryForm.durationHours} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, durationHours: value }))} />
              <FloatingField label="Participants" type="number" min="0" step="1" value={enquiryForm.participantsCount} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, participantsCount: value }))} />
              <FloatingField label="Estimated Amount" type="number" min="0" step="0.01" value={enquiryForm.estimatedAmount} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, estimatedAmount: value }))} />
              <FloatingField label="Follow-Up Date" type="date" value={enquiryForm.followUpDate} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, followUpDate: value }))} />
            </div>

            {enquiryForm.status === 'lost' && (
              <FloatingField label="Lost Reason" value={enquiryForm.lostReason} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, lostReason: value }))} />
            )}

            <FloatingField label="Notes" rows={4} value={enquiryForm.notes} onChange={(value) => setEnquiryForm((prev) => ({ ...prev, notes: value }))} />

            <div className="flex flex-wrap gap-2">
              <button disabled={savingEnquiry} className={buttonClass}>{savingEnquiry ? 'Saving...' : enquiryForm.id ? 'Update Enquiry' : 'Create Enquiry'}</button>
              <button type="button" onClick={resetEnquiryForm} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200">Clear Form</button>
            </div>
          </form>

          <div className="space-y-5">
            <div className={panelClass}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Total</p><p className="mt-2 text-2xl font-semibold text-white">{enquirySummary.total}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-sky-200">New</p><p className="mt-2 text-2xl font-semibold text-white">{enquirySummary.newCount}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-amber-200">Contacted</p><p className="mt-2 text-2xl font-semibold text-white">{enquirySummary.contactedCount}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Converted</p><p className="mt-2 text-2xl font-semibold text-white">{enquirySummary.convertedCount}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-rose-200">Lost</p><p className="mt-2 text-2xl font-semibold text-white">{enquirySummary.lostCount}</p></div>
              </div>
            </div>

            <div className={panelClass}>
              <div className="flex flex-wrap items-end gap-3">
                <input className={`${inputClass} min-w-[240px] flex-1`} placeholder="Search enquiries" value={enquirySearch} onChange={(e) => setEnquirySearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchEnquiryRows(); } }} />
                <select className={`${inputClass} min-w-[150px]`} value={enquiryStatusFilter} onChange={(e) => setEnquiryStatusFilter(e.target.value as 'all' | EnquiryStatus)}>
                  <option value="all">All status</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
                <select className={`${inputClass} min-w-[150px]`} value={enquirySourceFilter} onChange={(e) => setEnquirySourceFilter(e.target.value as 'all' | EnquirySource)}>
                  <option value="all">All source</option>
                  <option value="walk_in">Walk In</option>
                  <option value="phone">Phone</option>
                  <option value="website">Website</option>
                  <option value="social_media">Social Media</option>
                </select>
                <button onClick={() => void searchEnquiryRows()} className={buttonClass}>Load List</button>
                <button onClick={() => void clearEnquiries()} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200">Reset</button>
              </div>
            </div>

            <div className={`${panelClass} space-y-3`}>
              <p className={sectionTitleClass}>Enquiry Queue</p>
              <div className="max-h-[920px] space-y-3 overflow-y-auto pr-1">
                {enquiries.map((row) => (
                  <div key={row._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-white">{row.customerName}</p>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-200">{row.enquiryNumber}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-400">{categoryLabel(row.requestKind)} • {categoryLabel(row.source)} • {row.contactPhone || '-'} {row.contactEmail ? `• ${row.contactEmail}` : ''}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'converted' ? 'bg-emerald-500/15 text-emerald-100' : row.status === 'lost' ? 'bg-rose-500/15 text-rose-100' : row.status === 'contacted' ? 'bg-amber-500/15 text-amber-100' : 'bg-sky-500/15 text-sky-100'}`}>{categoryLabel(row.status)}</span>
                        {row.customerCode && <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">{row.customerCode}</span>}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Requested Slot</p>
                        <p className="mt-2 text-sm font-semibold text-white">{row.requestedFacilityName || 'Not selected'}</p>
                        <p className="mt-1 text-xs text-gray-400">{row.requestedDate ? String(row.requestedDate).slice(0, 10) : 'Date not set'} {row.requestedStartTime ? `• ${row.requestedStartTime}` : ''}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Staff Owner</p>
                        <p className="mt-2 text-sm font-semibold text-white">{row.assignedToName || 'Not assigned'}</p>
                        <p className="mt-1 text-xs text-gray-400">Follow-up: {row.followUpDate ? String(row.followUpDate).slice(0, 10) : 'Not scheduled'}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Estimated Value</p>
                        <p className="mt-2 text-sm font-semibold text-white">{formatCurrency(Number(row.estimatedAmount || 0))}</p>
                        <p className="mt-1 text-xs text-gray-400">{Number(row.durationHours || 0) > 0 ? `${row.durationHours} hr` : 'Duration not set'} {Number(row.participantsCount || 0) > 0 ? `• ${row.participantsCount} people` : ''}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Notes</p>
                        <p className="mt-2 text-sm text-gray-200">{row.notes || 'No notes added yet.'}</p>
                        {row.lostReason && <p className="mt-1 text-xs text-rose-200">Lost reason: {row.lostReason}</p>}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => editEnquiry(row)} className="rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100">Edit Enquiry</button>
                      {!row.customerId && <button onClick={() => void linkEnquiryCustomer(row)} className="rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100">Link Customer Profile</button>}
                      {row.requestKind === 'facility_booking' && <button onClick={() => useEnquiryDraft(row, 'facility-booking', '/facilities')} className="rounded-md bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-100">Open Facility Booking</button>}
                      {row.requestKind === 'event_booking' && (
                        <>
                          <button onClick={() => useEnquiryDraft(row, 'event-booking', '/events')} className="rounded-md bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-100">Open Event Booking</button>
                          <button onClick={() => useEnquiryDraft(row, 'event-quotation', '/events/quotations')} className="rounded-md bg-fuchsia-500/20 px-3 py-2 text-xs font-semibold text-fuchsia-100">Create Event Quote</button>
                        </>
                      )}
                      {!['facility_booking', 'event_booking'].includes(row.requestKind) && <button onClick={() => useEnquiryDraft(row, 'sales-quotation', '/sales/quotes')} className="rounded-md bg-fuchsia-500/20 px-3 py-2 text-xs font-semibold text-fuchsia-100">Create Sales Quote</button>}
                    </div>
                  </div>
                ))}
                {!enquiries.length && <p className="text-sm text-gray-400">No enquiries match the current filters.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={sectionTitleClass}>Sports Facility CRM Coverage</p>
                <h2 className="mt-2 text-xl font-semibold text-white">One module per job, without duplicate tracking sheets</h2>
                <p className="mt-2 max-w-3xl text-sm text-gray-400">
                  These CRM capabilities are already mapped to the right workspace so teams can avoid re-entering the same member,
                  lead, booking, and communication details in different places.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {CRM_CAPABILITY_CARDS.map((card) => (
                <div key={card.title} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{card.title}</p>
                      <p className="mt-2 text-sm text-gray-300">{card.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(card.path)}
                      className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100"
                    >
                      {card.actionLabel}
                    </button>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-gray-500">{card.sourceLabel}</p>
                  <p className="mt-1 text-sm text-cyan-100">{card.sourceValue}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Customers</p><p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.totalCustomers || 0}</p><p className="mt-1 text-xs text-gray-400">Total CRM profiles.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Active Members</p><p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.activeMembers || 0}</p><p className="mt-1 text-xs text-gray-400">Live membership records.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-amber-200">New This Week</p><p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.newCustomersThisWeek || 0}</p><p className="mt-1 text-xs text-gray-400">Latest profile additions.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-fuchsia-200">Conversion Rate</p><p className="mt-2 text-2xl font-semibold text-white">{Number(dashboard?.summary.conversionRate || 0).toFixed(1)}%</p><p className="mt-1 text-xs text-gray-400">Converted enquiries out of all enquiries.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-rose-200">Overdue Follow-Up</p><p className="mt-2 text-2xl font-semibold text-white">{dashboard?.summary.overdueFollowUps || 0}</p><p className="mt-1 text-xs text-gray-400">Enquiries waiting past the follow-up date.</p></div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className={panelClass}><p className={sectionTitleClass}>Popular Facilities</p><div className="mt-3 space-y-3">{(dashboard?.popularFacilities || []).map((row) => <div key={row.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200"><span>{row.name}</span><span className="font-semibold text-white">{row.count}</span></div>)}{!dashboard?.popularFacilities?.length && <p className="text-sm text-gray-400">No facility usage trend available yet.</p>}</div></div>
            <div className={panelClass}><p className={sectionTitleClass}>Popular Time Slots</p><div className="mt-3 space-y-3">{(dashboard?.popularTimeSlots || []).map((row) => <div key={row.slot} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200"><span>{row.slot}</span><span className="font-semibold text-white">{row.count}</span></div>)}{!dashboard?.popularTimeSlots?.length && <p className="text-sm text-gray-400">No time slot trend available yet.</p>}</div></div>
            <div className={panelClass}><p className={sectionTitleClass}>Enquiry Source Mix</p><div className="mt-3 space-y-3">{(dashboard?.enquiryBySource || []).map((row) => <div key={row.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200"><span>{categoryLabel(row.label)}</span><span className="font-semibold text-white">{row.count}</span></div>)}{!dashboard?.enquiryBySource?.length && <p className="text-sm text-gray-400">No enquiry source data available yet.</p>}</div></div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className={panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className={sectionTitleClass}>Top Customers</p><p className="mt-1 text-sm text-gray-400">Highest spend and strongest repeat customers across bookings and sales.</p></div>
                <button onClick={exportCustomerCsv} className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100">Export Customer List</button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-[0.24em] text-gray-400"><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Spend</th><th className="px-3 py-3">Visits</th><th className="px-3 py-3">Pending</th><th className="px-3 py-3">Last Visit</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {(dashboard?.topCustomers || []).map((row, index) => (
                      <tr key={`${row.customerId || row.customerName}-${index}`}>
                        <td className="px-3 py-3 text-white">{row.customerName}</td>
                        <td className="px-3 py-3 text-gray-200">{formatCurrency(Number(row.totalSpent || 0))}</td>
                        <td className="px-3 py-3 text-gray-200">{row.visits}</td>
                        <td className="px-3 py-3 text-gray-200">{formatCurrency(Number(row.pendingDues || 0))}</td>
                        <td className="px-3 py-3 text-gray-400">{relativeDate(row.lastVisitAt || undefined)}</td>
                      </tr>
                    ))}
                    {!dashboard?.topCustomers?.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">No top customer trend available yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              <div className={panelClass}><p className={sectionTitleClass}>Lost Lead Reasons</p><div className="mt-3 space-y-3">{(dashboard?.lostReasons || []).map((row) => <div key={row.reason} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-200"><span>{row.reason}</span><span className="font-semibold text-white">{row.count}</span></div>)}{!dashboard?.lostReasons?.length && <p className="text-sm text-gray-400">No lost lead reasons recorded yet.</p>}</div></div>
              <div className={panelClass}><p className={sectionTitleClass}>Open Collection Cases</p><div className="mt-3 space-y-3">{dunningRows.slice(0, 8).map((row, index) => <div key={`${row.customerId || row.customerCode || row.customerName}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-200"><p className="font-semibold text-white">{row.customerName}</p><p className="mt-1 text-xs text-gray-400">{row.invoiceCount} invoice(s) • {row.maxDaysPastDue} days overdue</p><p className="mt-2 text-amber-200">{formatCurrency(Number(row.totalOutstanding || 0))}</p><p className="mt-1 text-xs text-gray-400">{row.recommendedAction}</p></div>)}{!dunningRows.length && <p className="text-sm text-gray-400">No open collection alerts right now.</p>}</div></div>
            </div>
          </div>
        </div>
      )}

      {profileDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Edit customer profile"
          onClick={closeProfileDialog}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className={sectionTitleClass}>Customer Profile</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Edit customer profile in dialog</h2>
              </div>
              <button
                type="button"
                onClick={closeProfileDialog}
                className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/5"
              >
                Close
              </button>
            </div>
            {renderCustomerProfileForm({ inDialog: true })}
          </div>
        </div>
      )}
    </div>
  );
};
