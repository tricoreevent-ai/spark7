import mongoose, { Schema, Document } from 'mongoose';

export interface IEventBooking extends Document {
  eventNumber?: string;
  customerId?: string;
  customerCode?: string;
  sourceQuotationId?: string;
  sourceQuotationNumber?: string;
  seriesId?: string;
  seriesTotalDates?: number;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilityIds: mongoose.Types.ObjectId[];
  startTime: Date;
  endTime: Date;
  occurrences?: Array<{
    occurrenceDate: Date;
    startTime: Date;
    endTime: Date;
  }>;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  paymentMethod?: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
  totalAmount: number;
  gstAmount?: number;
  gstTreatment?: 'none' | 'intrastate' | 'interstate';
  advanceAmount: number;
  paidAmount: number;
  balanceAmount: number;
  payments?: Array<{
    receiptNumber: string;
    amount: number;
    paymentMethod?: string;
    paidAt: Date;
    remarks?: string;
    confirmationEmail?: string;
    emailedAt?: Date;
    emailedTo?: string;
    receivedBy?: string;
  }>;
  cancellationCharge: number;
  refundAmount: number;
  cancellationReason?: string;
  cancelledAt?: Date;
  reminderAt?: Date;
  remarks?: string;
  rescheduleCount: number;
  rescheduleHistory?: Array<{
    fromStart: Date;
    fromEnd: Date;
    toStart: Date;
    toEnd: Date;
    reason?: string;
    changedBy?: string;
    changedAt: Date;
  }>;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const EventBookingSchema = new Schema<IEventBooking>(
  {
    eventNumber: { type: String, trim: true, index: true },
    customerId: { type: String, trim: true, index: true },
    customerCode: { type: String, trim: true, index: true },
    sourceQuotationId: { type: String, trim: true, index: true },
    sourceQuotationNumber: { type: String, trim: true, index: true },
    seriesId: { type: String, trim: true, index: true },
    seriesTotalDates: { type: Number, min: 1, default: 1 },
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
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true },
    occurrences: [
      {
        occurrenceDate: { type: Date, required: true, index: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'online'],
      default: 'cash',
    },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    gstAmount: { type: Number, min: 0, default: 0 },
    gstTreatment: {
      type: String,
      enum: ['none', 'intrastate', 'interstate'],
      default: 'none',
    },
    advanceAmount: { type: Number, min: 0, default: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    balanceAmount: { type: Number, min: 0, default: 0 },
    payments: [
      {
        receiptNumber: { type: String, trim: true, required: true },
        amount: { type: Number, required: true, min: 0 },
        paymentMethod: { type: String, trim: true, default: 'cash' },
        paidAt: { type: Date, required: true, default: () => new Date() },
        remarks: { type: String, trim: true },
        confirmationEmail: { type: String, trim: true, lowercase: true },
        emailedAt: { type: Date },
        emailedTo: { type: String, trim: true, lowercase: true },
        receivedBy: { type: String, trim: true },
      },
    ],
    cancellationCharge: { type: Number, min: 0, default: 0 },
    refundAmount: { type: Number, min: 0, default: 0 },
    cancellationReason: { type: String, trim: true },
    cancelledAt: { type: Date },
    reminderAt: { type: Date, index: true },
    remarks: { type: String, trim: true },
    rescheduleCount: { type: Number, min: 0, default: 0 },
    rescheduleHistory: [
      {
        fromStart: { type: Date, required: true },
        fromEnd: { type: Date, required: true },
        toStart: { type: Date, required: true },
        toEnd: { type: Date, required: true },
        reason: { type: String, trim: true },
        changedBy: { type: String, trim: true },
        changedAt: { type: Date, required: true, default: () => new Date() },
      },
    ],
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

EventBookingSchema.index({ startTime: 1, endTime: 1, status: 1 });
EventBookingSchema.index({ eventNumber: 1, createdAt: -1 });
EventBookingSchema.index({ seriesId: 1, createdAt: -1 });
EventBookingSchema.index({ 'occurrences.occurrenceDate': 1, status: 1 });

export const EventBooking = mongoose.model<IEventBooking>('EventBooking', EventBookingSchema);
