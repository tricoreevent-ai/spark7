import mongoose, { Document, Schema } from 'mongoose';
import { CustomerCategory } from './Customer.js';

export type EnquirySource = 'website' | 'phone' | 'walk_in' | 'social_media';
export type EnquiryStatus = 'new' | 'contacted' | 'converted' | 'lost';
export type EnquiryRequestKind = 'facility_booking' | 'event_booking' | 'membership' | 'shop_purchase' | 'general';
export type EnquiryConversionType = 'customer' | 'facility_booking' | 'event_booking' | 'sales_quote' | 'event_quote';

export interface ICustomerEnquiry extends Document {
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
  requestedDate?: Date;
  requestedStartTime?: string;
  durationHours?: number;
  participantsCount?: number;
  estimatedAmount?: number;
  followUpDate?: Date;
  lastFollowUpAt?: Date;
  notes?: string;
  lostReason?: string;
  convertedToType?: EnquiryConversionType;
  convertedToId?: string;
  convertedToNumber?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CustomerEnquirySchema = new Schema<ICustomerEnquiry>(
  {
    enquiryNumber: { type: String, required: true, unique: true, trim: true, index: true },
    customerId: { type: String, trim: true, index: true },
    customerCode: { type: String, trim: true, index: true },
    customerName: { type: String, required: true, trim: true, index: true },
    contactPhone: { type: String, trim: true, index: true },
    contactEmail: { type: String, trim: true, lowercase: true, index: true },
    customerCategory: {
      type: String,
      enum: ['individual', 'group_team', 'corporate', 'regular_member', 'walk_in'],
      default: 'individual',
      index: true,
    },
    requestKind: {
      type: String,
      enum: ['facility_booking', 'event_booking', 'membership', 'shop_purchase', 'general'],
      default: 'general',
      index: true,
    },
    source: {
      type: String,
      enum: ['website', 'phone', 'walk_in', 'social_media'],
      default: 'walk_in',
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'converted', 'lost'],
      default: 'new',
      index: true,
    },
    assignedToUserId: { type: String, trim: true, index: true },
    assignedToName: { type: String, trim: true, default: '' },
    requestedFacilityId: { type: String, trim: true, index: true },
    requestedFacilityName: { type: String, trim: true, default: '' },
    preferredSport: { type: String, trim: true, default: '' },
    requestedDate: { type: Date, index: true },
    requestedStartTime: { type: String, trim: true, default: '' },
    durationHours: { type: Number, min: 0, default: 0 },
    participantsCount: { type: Number, min: 0, default: 0 },
    estimatedAmount: { type: Number, min: 0, default: 0 },
    followUpDate: { type: Date, index: true },
    lastFollowUpAt: { type: Date },
    notes: { type: String, trim: true, default: '' },
    lostReason: { type: String, trim: true, default: '' },
    convertedToType: {
      type: String,
      enum: ['customer', 'facility_booking', 'event_booking', 'sales_quote', 'event_quote'],
      default: undefined,
    },
    convertedToId: { type: String, trim: true, default: '' },
    convertedToNumber: { type: String, trim: true, default: '' },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

CustomerEnquirySchema.index({ status: 1, followUpDate: 1, createdAt: -1 });
CustomerEnquirySchema.index({ requestKind: 1, source: 1, createdAt: -1 });

export const CustomerEnquiry = mongoose.model<ICustomerEnquiry>('CustomerEnquiry', CustomerEnquirySchema);
