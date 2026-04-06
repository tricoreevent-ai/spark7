import mongoose, { Schema, Document } from 'mongoose';

export interface IFacilityBooking extends Document {
  bookingNumber?: string;
  facilityId: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  memberSubscriptionId?: mongoose.Types.ObjectId;
  startTime: Date;
  endTime: Date;
  status: 'pending' | 'confirmed' | 'booked' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  paymentMethod?: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
  bookedUnits: number;
  amount: number; // backward compatibility alias to totalAmount
  totalAmount: number;
  gstAmount?: number;
  gstTreatment?: 'none' | 'intrastate' | 'interstate';
  advanceAmount: number;
  paidAmount: number;
  balanceAmount: number;
  cancellationCharge: number;
  refundAmount: number;
  cancellationReason?: string;
  cancelledAt?: Date;
  reminderAt?: Date;
  remarks?: string;
  notes?: string;
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

const FacilityBookingSchema = new Schema<IFacilityBooking>(
  {
    bookingNumber: { type: String, trim: true, index: true },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Facility',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, trim: true },
    customerEmail: { type: String, trim: true, lowercase: true },
    memberSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MemberSubscription',
      index: true,
    },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'booked', 'completed', 'cancelled'],
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
    bookedUnits: { type: Number, min: 1, default: 1 },
    amount: { type: Number, required: true, min: 0, default: 0 },
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
    cancellationCharge: { type: Number, min: 0, default: 0 },
    refundAmount: { type: Number, min: 0, default: 0 },
    cancellationReason: { type: String, trim: true },
    cancelledAt: { type: Date },
    reminderAt: { type: Date, index: true },
    remarks: { type: String, trim: true },
    notes: { type: String, trim: true },
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

FacilityBookingSchema.index({ facilityId: 1, startTime: 1, endTime: 1, status: 1 });
FacilityBookingSchema.index({ bookingNumber: 1, createdAt: -1 });
FacilityBookingSchema.index({ status: 1, startTime: 1 });

export const FacilityBooking = mongoose.model<IFacilityBooking>('FacilityBooking', FacilityBookingSchema);
