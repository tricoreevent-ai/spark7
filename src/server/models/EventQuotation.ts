import mongoose, { Document, Schema } from 'mongoose';

export type EventQuotationStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'replaced'
  | 'booked';

export type EventQuotationDiscountType = 'percentage' | 'fixed';

export interface IEventQuotationOccurrence {
  occurrenceDate: Date;
  startTime: Date;
  endTime: Date;
}

export interface IEventQuotationItem {
  itemType: 'facility' | 'service' | 'custom';
  facilityId?: mongoose.Types.ObjectId;
  description: string;
  quantity: number;
  unitLabel?: string;
  unitPrice: number;
  discountType: EventQuotationDiscountType;
  discountValue: number;
  discountAmount: number;
  lineTotal: number;
  notes?: string;
}

export interface IEventQuotation extends Document {
  quoteNumber: string;
  quoteGroupCode: string;
  version: number;
  customerId?: string;
  customerCode?: string;
  sourceQuotationId?: string;
  replacedByQuotationId?: string;
  quoteStatus: EventQuotationStatus;
  validUntil?: Date;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilityIds: mongoose.Types.ObjectId[];
  occurrences: IEventQuotationOccurrence[];
  items: IEventQuotationItem[];
  subtotal: number;
  discountType: EventQuotationDiscountType;
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  termsAndConditions: string;
  notes?: string;
  linkedBookingId?: string;
  linkedBookingNumber?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const EventQuotationOccurrenceSchema = new Schema<IEventQuotationOccurrence>(
  {
    occurrenceDate: { type: Date, required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
  },
  { _id: false }
);

const EventQuotationItemSchema = new Schema<IEventQuotationItem>(
  {
    itemType: {
      type: String,
      enum: ['facility', 'service', 'custom'],
      default: 'facility',
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Facility',
    },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitLabel: { type: String, trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage',
    },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, required: true, min: 0, default: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const EventQuotationSchema = new Schema<IEventQuotation>(
  {
    quoteNumber: { type: String, required: true, unique: true, index: true, trim: true },
    quoteGroupCode: { type: String, required: true, index: true, trim: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    customerId: { type: String, trim: true, index: true },
    customerCode: { type: String, trim: true, index: true },
    sourceQuotationId: { type: String, trim: true, index: true },
    replacedByQuotationId: { type: String, trim: true, index: true },
    quoteStatus: {
      type: String,
      enum: ['draft', 'sent', 'approved', 'rejected', 'expired', 'replaced', 'booked'],
      default: 'draft',
      index: true,
    },
    validUntil: { type: Date, index: true },
    eventName: { type: String, required: true, trim: true },
    organizerName: { type: String, required: true, trim: true },
    organizationName: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    facilityIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Facility',
        required: true,
        index: true,
      },
    ],
    occurrences: { type: [EventQuotationOccurrenceSchema], default: [] },
    items: { type: [EventQuotationItemSchema], default: [] },
    subtotal: { type: Number, min: 0, default: 0 },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage',
    },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    taxableAmount: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, default: 0 },
    gstAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    termsAndConditions: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true },
    linkedBookingId: { type: String, trim: true, index: true },
    linkedBookingNumber: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
    updatedBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

EventQuotationSchema.index({ quoteGroupCode: 1, version: -1 });
EventQuotationSchema.index({ eventName: 1, organizerName: 1, createdAt: -1 });
EventQuotationSchema.index({ 'occurrences.occurrenceDate': 1, quoteStatus: 1 });

export const EventQuotation = mongoose.model<IEventQuotation>('EventQuotation', EventQuotationSchema);
