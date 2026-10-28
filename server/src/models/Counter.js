import mongoose from 'mongoose';

// Atomic sequence numbers, e.g. for member IDs (M0001, M0002, ...).
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

// Two callers asking for a sequence that does not exist yet both try to
// create it; the loser's retry then finds it and counts on.
export async function nextSequence(name) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
      return doc.seq;
    } catch (err) {
      if (err.code !== 11000 || attempt) throw err;
    }
  }
}

export default Counter;
