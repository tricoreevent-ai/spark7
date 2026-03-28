import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceStatus = 'present' | 'half_day' | 'absent' | 'leave';

export interface IAttendance extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: Date;
  dateKey: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  overtimeHours?: number;
  notes?: string;
  createdBy?: string;
  lastUpdatedBy?: string;
  isLocked?: boolean;
  lockedAt?: Date;
  unlockedAt?: Date;
  unlockedBy?: string;
  unlockReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'half_day', 'absent', 'leave'],
      required: true,
      default: 'present',
    },
    checkIn: { type: String },
    checkOut: { type: String },
    overtimeHours: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: String, index: true },
    lastUpdatedBy: { type: String, index: true },
    isLocked: { type: Boolean, default: false, index: true },
    lockedAt: { type: Date },
    unlockedAt: { type: Date },
    unlockedBy: { type: String, index: true },
    unlockReason: { type: String, trim: true },
  },
  { timestamps: true }
);

AttendanceSchema.index({ tenantId: 1, employeeId: 1, dateKey: 1 }, { unique: true });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
