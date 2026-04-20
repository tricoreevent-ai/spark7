import mongoose, { Document, Schema } from 'mongoose';

export type AccountGroupUnder = 'asset' | 'liability' | 'income' | 'expense';

export interface IAccountGroup extends Document {
  groupName: string;
  groupCode: string;
  under: AccountGroupUnder;
  parentGroupId?: mongoose.Types.ObjectId;
  parentGroupName?: string;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AccountGroupSchema = new Schema<IAccountGroup>(
  {
    groupName: { type: String, required: true, trim: true, index: true },
    groupCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    under: {
      type: String,
      enum: ['asset', 'liability', 'income', 'expense'],
      required: true,
      index: true,
    },
    parentGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountGroup',
      index: true,
    },
    parentGroupName: { type: String, trim: true },
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

AccountGroupSchema.index({ tenantId: 1, groupCode: 1 }, { unique: true });
AccountGroupSchema.index({ tenantId: 1, groupName: 1 }, { unique: true });
AccountGroupSchema.index({ under: 1, parentGroupId: 1, isActive: 1 });

export const AccountGroup = mongoose.model<IAccountGroup>('AccountGroup', AccountGroupSchema);
