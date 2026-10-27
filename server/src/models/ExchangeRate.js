import mongoose from 'mongoose';

// The exchange rates the Finance pages convert with: how much of each
// currency one unit of the base buys. One document, refreshed every day
// from a public source (see utils/exchange.js).
const exchangeRateSchema = new mongoose.Schema(
  {
    base: { type: String, required: true, unique: true },
    rates: { type: Map, of: Number, default: {} },
    // Where the numbers came from, and the day they are for.
    source: { type: String, default: '', maxlength: 120 },
    rateDate: { type: String, default: '' },
    fetchedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('ExchangeRate', exchangeRateSchema);
