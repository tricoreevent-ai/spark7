import mongoose, { Schema, Document } from 'mongoose';

export type FacilityType =
  | 'badminton_court'
  | 'football_turf'
  | 'box_cricket'
  | 'swimming_pool'
  | 'gym'
  | 'other';

export interface IFacility extends Document {
  name: string;
  type?: FacilityType;
  location?: string;
  hourlyRate: number;
  capacity?: number;
  description?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  imageFileName?: string;
  imageSizeBytes?: number;
  active: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const FacilitySchema = new Schema<IFacility>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['badminton_court', 'football_turf', 'box_cricket', 'swimming_pool', 'gym', 'other'],
      default: 'other',
    },
    location: { type: String, trim: true },
    hourlyRate: { type: Number, required: true, min: 0 },
    capacity: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    imageStoragePath: { type: String, trim: true },
    imageFileName: { type: String, trim: true },
    imageSizeBytes: { type: Number, min: 0 },
    active: { type: Boolean, default: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

FacilitySchema.index({ type: 1, active: 1 });

export const Facility = mongoose.model<IFacility>('Facility', FacilitySchema);
