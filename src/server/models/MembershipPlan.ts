import mongoose, { Schema, Document } from 'mongoose';

export type MembershipBillingCycle = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'custom';
export type MembershipPlanType = 'free' | 'paid';
export type MembershipPlanStatus = 'active' | 'inactive' | 'archived';

export interface IMembershipPlan extends Document {
  name: string;
  facilityType: string;
  facilityIds?: mongoose.Types.ObjectId[];
  planType?: MembershipPlanType;
  status?: MembershipPlanStatus;
  billingCycle?: MembershipBillingCycle;
  durationDays: number;
  price: number;
  oneTimeFeeEnabled?: boolean;
  oneTimeFeeAmount?: number;
  autoRenew?: boolean;
  gracePeriodDays?: number;
  trialPeriodDays?: number;
  flatDiscountAmount?: number;
  memberOnlyPricing?: boolean;
  rewardPointsMultiplier?: number;
  freeServiceItems?: string[];
  accessRestrictions?: string[];
  maxUsagePerMonth?: number;
  maxDiscountPerCycle?: number;
  memberVisitLimit?: number;
  pointsEarningLimit?: number;
  pointsPerCurrency?: number;
  pointsRedemptionValue?: number;
  minimumRedeemPoints?: number;
  pointsExpiryDays?: number;
  corporateMembership?: boolean;
  familyMembership?: boolean;
  multiLocationValid?: boolean;
  pauseMembershipAllowed?: boolean;
  tierName?: string;
  qrEnabled?: boolean;
  bookingDiscountPercentage?: number;
  sessionsLimit: number;
  freezeAllowed?: boolean;
  customizable?: boolean;
  description?: string;
  active: boolean;
  archivedAt?: Date;
  sourcePlanId?: mongoose.Types.ObjectId;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const MembershipPlanSchema = new Schema<IMembershipPlan>(
  {
    name: { type: String, required: true, trim: true },
    facilityType: { type: String, required: true, trim: true },
    facilityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Facility', index: true }],
    planType: {
      type: String,
      enum: ['free', 'paid'],
      default: 'paid',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'],
      default: 'monthly',
      index: true,
    },
    durationDays: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    oneTimeFeeEnabled: { type: Boolean, default: false },
    oneTimeFeeAmount: { type: Number, min: 0, default: 0 },
    autoRenew: { type: Boolean, default: false },
    gracePeriodDays: { type: Number, min: 0, default: 0 },
    trialPeriodDays: { type: Number, min: 0, default: 0 },
    bookingDiscountPercentage: { type: Number, min: 0, max: 100, default: 0 },
    flatDiscountAmount: { type: Number, min: 0, default: 0 },
    memberOnlyPricing: { type: Boolean, default: false },
    rewardPointsMultiplier: { type: Number, min: 0, default: 1 },
    freeServiceItems: [{ type: String, trim: true }],
    accessRestrictions: [{ type: String, trim: true }],
    maxUsagePerMonth: { type: Number, min: 0, default: 0 },
    maxDiscountPerCycle: { type: Number, min: 0, default: 0 },
    memberVisitLimit: { type: Number, min: 0, default: 0 },
    pointsEarningLimit: { type: Number, min: 0, default: 0 },
    pointsPerCurrency: { type: Number, min: 0, default: 0 },
    pointsRedemptionValue: { type: Number, min: 0, default: 0 },
    minimumRedeemPoints: { type: Number, min: 0, default: 0 },
    pointsExpiryDays: { type: Number, min: 0, default: 0 },
    corporateMembership: { type: Boolean, default: false },
    familyMembership: { type: Boolean, default: false },
    multiLocationValid: { type: Boolean, default: false },
    pauseMembershipAllowed: { type: Boolean, default: false },
    tierName: { type: String, trim: true, default: '' },
    qrEnabled: { type: Boolean, default: false },
    sessionsLimit: { type: Number, required: true, min: 0, default: 0 },
    freezeAllowed: { type: Boolean, default: true },
    customizable: { type: Boolean, default: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true },
    archivedAt: { type: Date },
    sourcePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', index: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

MembershipPlanSchema.index({ facilityType: 1, active: 1 });
MembershipPlanSchema.index({ billingCycle: 1, active: 1 });
MembershipPlanSchema.index({ status: 1, active: 1 });

export const MembershipPlan = mongoose.model<IMembershipPlan>('MembershipPlan', MembershipPlanSchema);
