import mongoose, { Schema, Types } from 'mongoose';

const productSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, required: true },
    badge: { type: String },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'products' },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'merchant', 'admin'], required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'users' },
);

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, collection: 'sessions' },
);

const voucherSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 1 },
    maxDiscount: { type: Number, min: 1 },
    minimumSpend: { type: Number, required: true, min: 0 },
    quota: { type: Number, required: true, min: 1 },
    usedCount: { type: Number, required: true, default: 0, min: 0 },
    perUserLimit: { type: Number, required: true, min: 1 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'vouchers' },
);

const voucherUsageSchema = new Schema(
  {
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    usedCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'voucherUsages' },
);
voucherUsageSchema.index({ voucherId: 1, userId: 1 }, { unique: true });

const checkoutItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    image: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const checkoutSchema = new Schema(
  {
    customerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    customerName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    items: { type: [checkoutItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    voucherCode: { type: String, uppercase: true, trim: true },
    discountAmount: { type: Number, required: true, default: 0, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    riskScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    riskReasons: { type: [String], default: [] },
    reviewStatus: {
      type: String,
      enum: ['clear', 'pending', 'approved', 'rejected'],
      required: true,
      default: 'clear',
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, maxlength: 500 },
    fulfillmentStatus: {
      type: String,
      enum: ['new', 'preparing', 'ready', 'completed', 'cancelled'],
      default: 'new',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'cancelled', 'refunded'],
      default: 'pending_payment',
      index: true,
    },
  },
  { timestamps: true, collection: 'checkouts' },
);

const paymentSchema = new Schema(
  {
    checkoutId: { type: Schema.Types.ObjectId, ref: 'Checkout', required: true, index: true },
    method: { type: String, enum: ['QRIS', 'Transfer bank', 'Kartu debit / kredit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'expired', 'refunded'],
      default: 'pending',
      index: true,
    },
    provider: { type: String, enum: ['xendit', 'simulator'], default: 'xendit' },
    providerReference: { type: String },
    providerInvoiceId: { type: String },
    invoiceUrl: { type: String },
    serviceFee: { type: Number, required: true, min: 0, default: 0 },
    merchantNet: { type: Number, required: true, default: 0 },
    feeIsEstimate: { type: Boolean, required: true, default: true },
    paidAt: { type: Date },
    refundedAt: { type: Date },
  },
  { timestamps: true, collection: 'payments' },
);

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'auditLogs' },
);

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);
export const VoucherUsage =
  mongoose.models.VoucherUsage || mongoose.model('VoucherUsage', voucherUsageSchema);
export const Checkout = mongoose.models.Checkout || mongoose.model('Checkout', checkoutSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

export type UserRole = 'customer' | 'merchant' | 'admin';
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type ProductDocument = {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string;
  badge?: string;
  isActive: boolean;
};

export type CheckoutItemInput = { productId: string; quantity: number };