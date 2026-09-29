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
    customerName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    items: { type: [checkoutItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'cancelled'],
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
    status: { type: String, enum: ['pending', 'paid', 'failed', 'expired'], default: 'pending', index: true },
    provider: { type: String, default: 'xendit' },
    providerReference: { type: String },
    providerInvoiceId: { type: String },
    invoiceUrl: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true, collection: 'payments' },
);

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export const Checkout = mongoose.models.Checkout || mongoose.model('Checkout', checkoutSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

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