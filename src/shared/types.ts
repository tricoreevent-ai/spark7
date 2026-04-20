import { PermissionMatrix, RoleName } from './rbac';

export type ThemeMode = 'dark' | 'light';

export interface UiPreferences {
  themeMode?: ThemeMode;
  fontScale?: number;
}

export interface ITenantInfo {
  _id?: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

export interface IUser {
  _id?: string;
  tenantId?: string;
  employeeId?: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: RoleName;
  permissions?: PermissionMatrix;
  businessName?: string;
  gstin?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  uiPreferences?: UiPreferences;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProductVariantMatrixRow {
  size?: string;
  color?: string;
  skuSuffix?: string;
  barcode?: string;
  price?: number;
  isActive?: boolean;
}

export interface IProduct {
  _id?: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  category: string;
  subcategory?: string;
  itemType?: 'inventory' | 'service' | 'non_inventory';
  price: number;
  wholesalePrice?: number;
  promotionalPrice?: number;
  promotionStartDate?: Date | string;
  promotionEndDate?: Date | string;
  priceTiers?: Array<{
    tierName: string;
    minQuantity: number;
    unitPrice: number;
  }>;
  cost: number;
  taxType?: 'gst' | 'vat';
  gstRate: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  hsnCode?: string;
  stock: number;
  openingStockValue?: number;
  stockLedgerAccountId?: string;
  returnStock?: number;
  damagedStock?: number;
  allowNegativeStock?: boolean;
  minStock: number;
  autoReorder?: boolean;
  reorderQuantity?: number;
  unit: string;
  imageUrl?: string;
  batchTracking?: boolean;
  expiryRequired?: boolean;
  serialNumberTracking?: boolean;
  variantSize?: string;
  variantColor?: string;
  variantMatrix?: IProductVariantMatrixRow[];
  isActive?: boolean;
  deletedAt?: Date | string;
  deletedBy?: string;
  deletionReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICustomerContact {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  visibility?: 'billing' | 'operational' | 'c_level' | 'general';
  notes?: string;
}

export interface ICustomerActivity {
  activityType: 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute';
  summary: string;
  details?: string;
  nextFollowUpDate?: Date | string;
  createdAt?: Date | string;
  createdBy?: string;
}

export interface IOrder {
  _id?: string;
  orderNumber: string;
  userId: string | IUser;
  items: {
    productId: string | IProduct;
    productName?: string;
    sku?: string;
    quantity: number;
    price: number;
    gstAmount: number;
    gstRate?: number;
    reservedQuantity?: number;
    deliveredQuantity?: number;
    invoicedQuantity?: number;
    backOrderQuantity?: number;
    reservationAllocations?: Array<{
      batchId?: string;
      batchNumber?: string;
      locationId?: string;
      locationCode?: string;
      expiryDate?: Date | string;
      quantity: number;
      unitCost?: number;
    }>;
    deliveryAllocations?: Array<{
      batchId?: string;
      batchNumber?: string;
      locationId?: string;
      locationCode?: string;
      quantity: number;
      unitCost?: number;
    }>;
  }[];
  totalAmount: number;
  gstAmount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'check';
  paymentStatus: 'pending' | 'completed' | 'failed';
  orderStatus:
    | 'pending'
    | 'confirmed'
    | 'partially_reserved'
    | 'reserved'
    | 'back_order'
    | 'partially_dispatched'
    | 'dispatched'
    | 'invoiced'
    | 'processing'
    | 'completed'
    | 'cancelled';
  reservationStatus?: 'not_reserved' | 'partial' | 'reserved' | 'back_order';
  deliveryStatus?: 'not_dispatched' | 'partial' | 'dispatched';
  invoiceSaleId?: string;
  deliveryChallanIds?: string[];
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IInventory {
  _id?: string;
  productId: string | IProduct;
  warehouseLocation?: string;
  storeLocation?: string;
  rackLocation?: string;
  shelfLocation?: string;
  quantity: number;
  reservedQuantity: number;
  lastRestockDate?: Date;
  expiryDate?: Date;
  batchNumber?: string;
  adjustmentReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: Partial<IUser>;
  tenant?: ITenantInfo;
  otpRequired?: boolean;
  otpChallengeId?: string;
  otpEmail?: string;
}

export interface ErrorResponse {
  success: boolean;
  error: string;
}
