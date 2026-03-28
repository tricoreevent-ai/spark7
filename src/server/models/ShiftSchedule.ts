import mongoose, { Schema, Document } from 'mongoose';

export interface IShiftSchedule extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: Date;
  dateKey: string;
  shiftName: string;
  startTime?: string;
  endTime?: string;
  isWeeklyOff: boolean;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ShiftScheduleSchema = new Schema<IShiftSchedule>(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    shiftName: { type: String, required: true, trim: true, default: 'General' },
    startTime: { type: String, trim: true },
    endTime: { type: String, trim: true },
    isWeeklyOff: { type: Boolean, default: false },
    notes: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

ShiftScheduleSchema.index({ tenantId: 1, employeeId: 1, dateKey: 1 }, { unique: true });

export const ShiftSchedule = mongoose.model<IShiftSchedule>('ShiftSchedule', ShiftScheduleSchema);
