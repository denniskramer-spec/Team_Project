import mongoose from 'mongoose';

export const ENGLISH_LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Fluent', 'Native'];

// An asset is a profile a member works with: name, birthday, nationality,
// contact details and English level. It always belongs to one member.
const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    birthday: { type: Date, default: null },
    nationality: { type: String, default: '', trim: true, maxlength: 60 },
    contact: { type: String, default: '', trim: true, maxlength: 160 },
    englishLevel: { type: String, enum: ENGLISH_LEVELS, default: 'Intermediate' },
    note: { type: String, default: '', trim: true, maxlength: 2000 },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the owner so group scoping stays cheap.
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

assetSchema.index({ owner: 1, name: 1 });
assetSchema.index({ group: 1, name: 1 });

export default mongoose.model('Asset', assetSchema);
