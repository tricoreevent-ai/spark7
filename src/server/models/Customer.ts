import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomerPriceOverride {
  productId: string;
  priceType: 'retail' | 'wholesale' | 'custom';
  unitPrice: number;
}

export type CustomerCategory = 'individual' | 'group_team' | 'corporate' | 'regular_member' | 'walk_in';

export interface ICustomerPreferences {
  preferredSport?: string;
  preferredFacilityId?: string;
  preferredTimeSlot?: string;
  preferredShopItems?: string[];
}

export interface ICustomerContact {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  visibility?: 'billing' | 'operational' | 'c_level' | 'general';
  notes?: string;
}

export interface ICustomerActivity {
  activityType: 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute';
  summary: string;
  details?: string;
  nextFollowUpDate?: Date;
  createdAt?: Date;
  createdBy?: string;
}

export interface ICustomer extends Document {
  customerCode: string;
  name: string;
  phone?: string;
  email?: string;
  profilePhotoUrl?: string;
  profilePhotoStoragePath?: string;
  customerCategory: CustomerCategory;
  gstin?: string;
  address?: string;
  accountType: 'cash' | 'credit';
  creditLimit: number;
  creditDays: number;
  outstandingBalance: number;
  isBlocked: boolean;
  openingBalance: number;
  priceOverrides: ICustomerPriceOverride[];
  pricingTier?: string;
  contacts: ICustomerContact[];
  activityLog: ICustomerActivity[];
  preferences?: ICustomerPreferences;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CustomerPriceOverrideSchema = new Schema<ICustomerPriceOverride>(
  {
    productId: { type: String, required: true, index: true },
    priceType: {
      type: String,
      enum: ['retail', 'wholesale', 'custom'],
      default: 'custom',
    },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const CustomerContactSchema = new Schema<ICustomerContact>(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    isPrimary: { type: Boolean, default: false },
    visibility: {
      type: String,
      enum: ['billing', 'operational', 'c_level', 'general'],
      default: 'general',
    },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const CustomerActivitySchema = new Schema<ICustomerActivity>(
  {
    activityType: {
      type: String,
      enum: ['call', 'email', 'meeting', 'payment_reminder', 'note', 'dispute'],
      required: true,
    },
    summary: { type: String, required: true, trim: true },
    details: { type: String, trim: true, default: '' },
    nextFollowUpDate: { type: Date, default: undefined },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: '' },
  },
  { _id: false }
);

const CustomerPreferencesSchema = new Schema<ICustomerPreferences>(
  {
    preferredSport: { type: String, trim: true, default: '' },
    preferredFacilityId: { type: String, trim: true, default: '' },
    preferredTimeSlot: { type: String, trim: true, default: '' },
    preferredShopItems: { type: [String], default: [] },
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    customerCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    profilePhotoUrl: { type: String, trim: true, default: '' },
    profilePhotoStoragePath: { type: String, trim: true, default: '' },
    customerCategory: {
      type: String,
      enum: ['individual', 'group_team', 'corporate', 'regular_member', 'walk_in'],
      default: 'individual',
      index: true,
    },
    gstin: { type: String, trim: true, uppercase: true },
    address: { type: String, trim: true },
    accountType: {
      type: String,
      enum: ['cash', 'credit'],
      default: 'cash',
      index: true,
    },
    creditLimit: { type: Number, min: 0, default: 0 },
    creditDays: { type: Number, min: 0, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false, index: true },
    openingBalance: { type: Number, default: 0 },
    priceOverrides: [CustomerPriceOverrideSchema],
    pricingTier: { type: String, trim: true, default: '' },
    contacts: { type: [CustomerContactSchema], default: [] },
    activityLog: { type: [CustomerActivitySchema], default: [] },
    preferences: { type: CustomerPreferencesSchema, default: () => ({}) },
    notes: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ phone: 1, email: 1 });
CustomerSchema.index({ tenantId: 1, customerCode: 1 }, { unique: true });

export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema);
