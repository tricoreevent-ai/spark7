export type CustomerCategory = 'individual' | 'group_team' | 'corporate' | 'regular_member' | 'walk_in';

export interface CustomerCrmCustomerRow {
  _id: string;
  customerCode: string;
  name: string;
  phone?: string;
  email?: string;
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

export interface CustomerCrmDirectoryFilters {
  search: string;
  customerCategories: string[];
  accountTypes: string[];
  statuses: string[];
  pricingTiers: string[];
}

export type CustomerCampaignAudienceMode = 'selected' | 'filtered' | 'all_active';
export type CustomerCampaignStatus = 'draft' | 'sent' | 'failed';

export interface CustomerCrmCampaignRow {
  _id: string;
  campaignNumber: string;
  name: string;
  subject: string;
  headline?: string;
  message: string;
  audienceMode: CustomerCampaignAudienceMode;
  filters?: CustomerCrmDirectoryFilters;
  selectedCustomerIds?: string[];
  customerIds?: string[];
  recipientEmails?: string[];
  recipientCount: number;
  deliveredCount: number;
  skippedCount: number;
  brochureFileName?: string;
  brochureContentType?: string;
  brochureSizeBytes?: number;
  hasBrochureAttachment?: boolean;
  status: CustomerCampaignStatus;
  sentAt?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}
