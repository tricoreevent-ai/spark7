import mongoose, { Document, Schema } from 'mongoose';
import type { ServiceCatalogInputType } from './ServiceCatalog.js';

export type ServiceOrderStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'quality_check'
  | 'completed'
  | 'picked_up'
  | 'cancelled';

export interface IServiceOrderAttachment {
  name: string;
  url: string;
  contentType?: string;
}

export interface IServiceOrderSpecification {
  key: string;
  label: string;
  inputType: ServiceCatalogInputType;
  value: string;
  unit?: string;
}

export interface IServiceOrderConsumableIssue {
  batchId?: string;
  batchNumber?: string;
  locationId?: string;
  locationCode?: string;
  expiryDate?: Date | string;
  quantity: number;
  unitCost: number;
  valueOut?: number;
}

export interface IServiceOrderConsumableLine {
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  optional?: boolean;
  notes?: string;
  issuedQuantity?: number;
  issueAllocations?: IServiceOrderConsumableIssue[];
}

export interface IServiceOrderTimelineEntry {
  action: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
  createdAt?: Date;
  createdBy?: string;
}

export interface IServiceOrder extends Document {
  orderNumber: string;
  customerId?: string;
  customerCode?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceCatalogId?: string;
  serviceCode?: string;
  serviceName: string;
  serviceCategory?: string;
  quantity: number;
  equipmentName?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  equipmentSerialNumber?: string;
  currentCondition?: string;
  specificationValues: IServiceOrderSpecification[];
  requestedCompletionDate?: Date;
  specialInstructions?: string;
  consumableLines: IServiceOrderConsumableLine[];
  attachments: IServiceOrderAttachment[];
  basePrice: number;
  laborCharge: number;
  discountMode: 'none' | 'amount' | 'percentage';
  discountValue: number;
  discountAmount: number;
  subtotal: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  status: ServiceOrderStatus;
  assignedStaffId?: string;
  assignedStaffName?: string;
  priority: 'low' | 'medium' | 'high';
  internalNotes?: string;
  customerFacingNotes?: string;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  inventoryIssued: boolean;
  saleId?: string;
  saleNumber?: string;
  invoiceNumber?: string;
  completedAt?: Date;
  pickedUpAt?: Date;
  timeline: IServiceOrderTimelineEntry[];
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ServiceOrderAttachmentSchema = new Schema<IServiceOrderAttachment>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    contentType: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ServiceOrderSpecificationSchema = new Schema<IServiceOrderSpecification>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    inputType: {
      type: String,
      enum: ['text', 'number', 'boolean', 'date', 'select'],
      default: 'text',
    },
    value: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ServiceOrderConsumableIssueSchema = new Schema<IServiceOrderConsumableIssue>(
  {
    batchId: { type: String, trim: true, default: '' },
    batchNumber: { type: String, trim: true, default: '' },
    locationId: { type: String, trim: true, default: '' },
    locationCode: { type: String, trim: true, default: '' },
    expiryDate: { type: Date, default: undefined },
    quantity: { type: Number, min: 0, default: 0 },
    unitCost: { type: Number, min: 0, default: 0 },
    valueOut: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const ServiceOrderConsumableLineSchema = new Schema<IServiceOrderConsumableLine>(
  {
    productId: { type: String, trim: true, default: '' },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },
    quantity: { type: Number, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0, default: 0 },
    optional: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
    issuedQuantity: { type: Number, min: 0, default: 0 },
    issueAllocations: { type: [ServiceOrderConsumableIssueSchema], default: [] },
  },
  { _id: false }
);

const ServiceOrderTimelineEntrySchema = new Schema<IServiceOrderTimelineEntry>(
  {
    action: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    fromStatus: { type: String, trim: true, default: '' },
    toStatus: { type: String, trim: true, default: '' },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ServiceOrderSchema = new Schema<IServiceOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    customerId: { type: String, trim: true, default: '', index: true },
    customerCode: { type: String, trim: true, default: '' },
    customerName: { type: String, required: true, trim: true, index: true },
    customerPhone: { type: String, trim: true, default: '', index: true },
    customerEmail: { type: String, trim: true, default: '' },
    serviceCatalogId: { type: String, trim: true, default: '', index: true },
    serviceCode: { type: String, trim: true, default: '' },
    serviceName: { type: String, required: true, trim: true, index: true },
    serviceCategory: { type: String, trim: true, default: '', index: true },
    quantity: { type: Number, min: 1, default: 1 },
    equipmentName: { type: String, trim: true, default: '' },
    equipmentBrand: { type: String, trim: true, default: '' },
    equipmentModel: { type: String, trim: true, default: '' },
    equipmentSerialNumber: { type: String, trim: true, default: '', index: true },
    currentCondition: { type: String, trim: true, default: '' },
    specificationValues: { type: [ServiceOrderSpecificationSchema], default: [] },
    requestedCompletionDate: { type: Date, default: undefined, index: true },
    specialInstructions: { type: String, trim: true, default: '' },
    consumableLines: { type: [ServiceOrderConsumableLineSchema], default: [] },
    attachments: { type: [ServiceOrderAttachmentSchema], default: [] },
    basePrice: { type: Number, min: 0, default: 0 },
    laborCharge: { type: Number, min: 0, default: 0 },
    discountMode: { type: String, enum: ['none', 'amount', 'percentage'], default: 'none' },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    subtotal: { type: Number, min: 0, default: 0 },
    taxableValue: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, enum: [0, 5, 12, 18, 28], default: 18 },
    gstAmount: { type: Number, min: 0, default: 0 },
    cgstAmount: { type: Number, min: 0, default: 0 },
    sgstAmount: { type: Number, min: 0, default: 0 },
    igstAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'open', 'in_progress', 'quality_check', 'completed', 'picked_up', 'cancelled'],
      default: 'draft',
      index: true,
    },
    assignedStaffId: { type: String, trim: true, default: '', index: true },
    assignedStaffName: { type: String, trim: true, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    internalNotes: { type: String, trim: true, default: '' },
    customerFacingNotes: { type: String, trim: true, default: '' },
    paymentStatus: { type: String, enum: ['unpaid', 'partially_paid', 'paid'], default: 'unpaid' },
    inventoryIssued: { type: Boolean, default: false },
    saleId: { type: String, trim: true, default: '', index: true },
    saleNumber: { type: String, trim: true, default: '' },
    invoiceNumber: { type: String, trim: true, default: '' },
    completedAt: { type: Date, default: undefined },
    pickedUpAt: { type: Date, default: undefined },
    timeline: { type: [ServiceOrderTimelineEntrySchema], default: [] },
    createdBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export const ServiceOrder = mongoose.model<IServiceOrder>('ServiceOrder', ServiceOrderSchema);
