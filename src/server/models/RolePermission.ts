import mongoose, { Document, Schema } from 'mongoose';
import { PageKey } from '@shared/rbac';

export interface IRolePermissionDocument extends Document {
  role: string;
  permissions: Map<PageKey, boolean>;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rolePermissionSchema = new Schema<IRolePermissionDocument>(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    permissions: {
      type: Map,
      of: Boolean,
      default: {},
    },
    isSystemRole: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, tenantScoped: false, tenantUniqueRewrite: false } as any
);

export const RolePermission = mongoose.model<IRolePermissionDocument>('RolePermission', rolePermissionSchema);
