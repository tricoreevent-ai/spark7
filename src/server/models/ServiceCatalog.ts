import mongoose, { Document, Schema } from 'mongoose';

export type ServiceCatalogInputType = 'text' | 'number' | 'boolean' | 'date' | 'select';

export interface IServiceCatalogConsumable {
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  optional?: boolean;
  notes?: string;
}

export interface IServiceCatalogSpecification {
  key: string;
  label: string;
  inputType: ServiceCatalogInputType;
  required?: boolean;
  unit?: string;
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
}

export interface IServiceCatalog extends Document {
  serviceCode: string;
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  laborCharge: number;
  estimatedDurationMinutes: number;
  consumables: IServiceCatalogConsumable[];
  gstRate: number;
  defaultTension?: string;
  specificationTemplate: IServiceCatalogSpecification[];
  active: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ServiceCatalogConsumableSchema = new Schema<IServiceCatalogConsumable>(
  {
    productId: { type: String, trim: true, default: '' },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },
    quantity: { type: Number, min: 0, default: 1 },
    unitPrice: { type: Number, min: 0, default: 0 },
    optional: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ServiceCatalogSpecificationSchema = new Schema<IServiceCatalogSpecification>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    inputType: {
      type: String,
      enum: ['text', 'number', 'boolean', 'date', 'select'],
      default: 'text',
    },
    required: { type: Boolean, default: false },
    unit: { type: String, trim: true, default: '' },
    placeholder: { type: String, trim: true, default: '' },
    options: { type: [String], default: [] },
    defaultValue: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ServiceCatalogSchema = new Schema<IServiceCatalog>(
  {
    serviceCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, default: '' },
    basePrice: { type: Number, min: 0, default: 0 },
    laborCharge: { type: Number, min: 0, default: 0 },
    estimatedDurationMinutes: { type: Number, min: 0, default: 60 },
    consumables: { type: [ServiceCatalogConsumableSchema], default: [] },
    gstRate: { type: Number, enum: [0, 5, 12, 18, 28], default: 18 },
    defaultTension: { type: String, trim: true, default: '' },
    specificationTemplate: { type: [ServiceCatalogSpecificationSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export const ServiceCatalog = mongoose.model<IServiceCatalog>('ServiceCatalog', ServiceCatalogSchema);
