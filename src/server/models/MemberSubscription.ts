import mongoose, { Schema, Document } from 'mongoose';

export interface IMemberSubscription extends Document {
  memberCode?: string;
  memberName: string;
  fullName?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: Date;
  profilePhotoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  planId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'expired' | 'cancelled' | 'frozen' | 'suspended';
  renewalDate?: Date;
  autoRenewEnabled?: boolean;
  gracePeriodUntil?: Date;
  amountPaid: number;
  amountDue?: number;
  totalVisits?: number;
  totalSpending?: number;
  rewardPointsBalance?: number;
  pointsEarnedTotal?: number;
  pointsRedeemedTotal?: number;
  pointsExpiredTotal?: number;
  bookingDiscountPercentage?: number;
  validityReminderDays?: number;
  freezeFrom?: Date;
  freezeTo?: Date;
  freezeReason?: string;
  sessionsUsed: number;
  notes?: string;
  languagePreference?: string;
  themePreference?: 'dark' | 'light';
  renewalHistory?: Array<{
    renewalDate: Date;
    renewalType: 'manual' | 'auto' | 'partial' | 'upgrade' | 'downgrade' | 'extend';
    daysExtended: number;
    amountPaid?: number;
    previousEndDate?: Date;
    newEndDate?: Date;
    notes?: string;
    createdBy?: string;
  }>;
  planHistory?: Array<{
    planId?: mongoose.Types.ObjectId;
    planName: string;
    action: 'assigned' | 'renewed' | 'upgraded' | 'downgraded' | 'extended' | 'cancelled' | 'suspended' | 'paused' | 'resumed';
    startDate?: Date;
    endDate?: Date;
    changedAt: Date;
    changedBy?: string;
    notes?: string;
  }>;
  reminderHistory?: Array<{
    reminderType: 'd7' | 'd3' | 'expiry' | 'grace';
    channel: 'sms' | 'email' | 'whatsapp' | 'in_app' | 'pos_popup';
    scheduledFor?: Date;
    sentAt?: Date;
    status?: 'pending' | 'sent' | 'failed' | 'skipped';
  }>;
  rewardTransactions?: Array<{
    type: 'earned' | 'redeemed' | 'expired' | 'adjusted';
    points: number;
    amount?: number;
    reference?: string;
    notes?: string;
    createdAt: Date;
    createdBy?: string;
  }>;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const MemberSubscriptionSchema = new Schema<IMemberSubscription>(
  {
    memberCode: { type: String, trim: true, index: true },
    memberName: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
      default: 'prefer_not_to_say',
    },
    dateOfBirth: { type: Date },
    profilePhotoUrl: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MembershipPlan',
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'frozen', 'suspended'],
      default: 'active',
      index: true,
    },
    renewalDate: { type: Date, index: true },
    autoRenewEnabled: { type: Boolean, default: false },
    gracePeriodUntil: { type: Date, index: true },
    amountPaid: { type: Number, required: true, min: 0, default: 0 },
    amountDue: { type: Number, min: 0, default: 0 },
    totalVisits: { type: Number, min: 0, default: 0 },
    totalSpending: { type: Number, min: 0, default: 0 },
    rewardPointsBalance: { type: Number, default: 0 },
    pointsEarnedTotal: { type: Number, default: 0 },
    pointsRedeemedTotal: { type: Number, default: 0 },
    pointsExpiredTotal: { type: Number, default: 0 },
    bookingDiscountPercentage: { type: Number, min: 0, max: 100, default: 0 },
    validityReminderDays: { type: Number, min: 0, default: 7 },
    freezeFrom: { type: Date },
    freezeTo: { type: Date },
    freezeReason: { type: String, trim: true },
    sessionsUsed: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true },
    languagePreference: { type: String, trim: true, default: 'en' },
    themePreference: { type: String, enum: ['dark', 'light'], default: 'dark' },
    renewalHistory: [
      {
        renewalDate: { type: Date, required: true },
        renewalType: {
          type: String,
          enum: ['manual', 'auto', 'partial', 'upgrade', 'downgrade', 'extend'],
          default: 'manual',
        },
        daysExtended: { type: Number, min: 0, default: 0 },
        amountPaid: { type: Number, min: 0, default: 0 },
        previousEndDate: { type: Date },
        newEndDate: { type: Date },
        notes: { type: String, trim: true },
        createdBy: { type: String, trim: true },
      },
    ],
    planHistory: [
      {
        planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan' },
        planName: { type: String, required: true, trim: true },
        action: {
          type: String,
          enum: ['assigned', 'renewed', 'upgraded', 'downgraded', 'extended', 'cancelled', 'suspended', 'paused', 'resumed'],
          required: true,
        },
        startDate: { type: Date },
        endDate: { type: Date },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: String, trim: true },
        notes: { type: String, trim: true },
      },
    ],
    reminderHistory: [
      {
        reminderType: { type: String, enum: ['d7', 'd3', 'expiry', 'grace'], required: true },
        channel: { type: String, enum: ['sms', 'email', 'whatsapp', 'in_app', 'pos_popup'], required: true },
        scheduledFor: { type: Date },
        sentAt: { type: Date },
        status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
      },
    ],
    rewardTransactions: [
      {
        type: { type: String, enum: ['earned', 'redeemed', 'expired', 'adjusted'], required: true },
        points: { type: Number, required: true },
        amount: { type: Number },
        reference: { type: String, trim: true },
        notes: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: String, trim: true },
      },
    ],
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

MemberSubscriptionSchema.index({ memberName: 1, status: 1 });
MemberSubscriptionSchema.index({ status: 1, endDate: 1 });
MemberSubscriptionSchema.index({ phone: 1, status: 1 });
MemberSubscriptionSchema.index({ renewalDate: 1, status: 1 });

export const MemberSubscription = mongoose.model<IMemberSubscription>('MemberSubscription', MemberSubscriptionSchema);
