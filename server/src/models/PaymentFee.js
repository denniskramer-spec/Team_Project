import mongoose from 'mongoose';

// The current fee of one payment method: a percent of the amount plus a
// fixed part. `auto` methods are refreshed from public sources every day;
// the others are set by an admin from the provider's published pricing.
const paymentFeeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    feePercent: { type: Number, default: 0, min: 0, max: 100 },
    feeFixed: { type: Number, default: 0, min: 0 },
    source: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    // Where the current numbers came from, in words.
    detail: { type: String, default: '', maxlength: 300 },
    // When an automatic refresh last ran for it (whether or not it changed).
    checkedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('PaymentFee', paymentFeeSchema);
