import mongoose, { Document, Schema } from 'mongoose';

export type CustomerCampaignAudienceMode = 'selected' | 'filtered' | 'all_active';
export type CustomerCampaignStatus = 'draft' | 'sent' | 'failed';

export interface ICustomerCampaignFilters {
  search?: string;
  customerCategories?: string[];
  accountTypes?: string[];
  statuses?: string[];
  pricingTiers?: string[];
}

export interface ICustomerCampaign extends Document {
  campaignNumber: string;
  name: string;
  subject: string;
  headline?: string;
  message: string;
  audienceMode: CustomerCampaignAudienceMode;
  filters: ICustomerCampaignFilters;
  selectedCustomerIds: string[];
  customerIds: string[];
  recipientEmails: string[];
  recipientCount: number;
  deliveredCount: number;
  skippedCount: number;
  brochureFileName?: string;
  brochureDataUrl?: string;
  brochureContentType?: string;
  brochureSizeBytes?: number;
  status: CustomerCampaignStatus;
  sentAt?: Date;
  lastError?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CampaignFiltersSchema = new Schema<ICustomerCampaignFilters>(
  {
    search: { type: String, trim: true, default: '' },
    customerCategories: { type: [String], default: [] },
    accountTypes: { type: [String], default: [] },
    statuses: { type: [String], default: [] },
    pricingTiers: { type: [String], default: [] },
  },
  { _id: false }
);

const CustomerCampaignSchema = new Schema<ICustomerCampaign>(
  {
    campaignNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    subject: { type: String, trim: true, default: '' },
    headline: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    audienceMode: {
      type: String,
      enum: ['selected', 'filtered', 'all_active'],
      default: 'selected',
      index: true,
    },
    filters: { type: CampaignFiltersSchema, default: () => ({}) },
    selectedCustomerIds: { type: [String], default: [] },
    customerIds: { type: [String], default: [] },
    recipientEmails: { type: [String], default: [] },
    recipientCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    brochureFileName: { type: String, trim: true, default: '' },
    brochureDataUrl: { type: String, default: '' },
    brochureContentType: { type: String, trim: true, default: '' },
    brochureSizeBytes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'sent', 'failed'],
      default: 'draft',
      index: true,
    },
    sentAt: { type: Date, default: undefined },
    lastError: { type: String, trim: true, default: '' },
    createdBy: { type: String, index: true },
    updatedBy: { type: String, index: true },
  },
  { timestamps: true }
);

export const CustomerCampaign = mongoose.model<ICustomerCampaign>('CustomerCampaign', CustomerCampaignSchema);
