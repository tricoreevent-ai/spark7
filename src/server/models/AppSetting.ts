import mongoose, { Document, Schema } from 'mongoose';

export interface IAppSettingDocument extends Document {
  key: string;
  value: Record<string, any>;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const appSettingSchema = new Schema<IAppSettingDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      default: {},
    },
    updatedBy: {
      type: String,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const AppSetting = mongoose.model<IAppSettingDocument>('AppSetting', appSettingSchema);
