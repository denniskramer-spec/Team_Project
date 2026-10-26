import mongoose from 'mongoose';
import { imageSchema } from './image.js';

// A resident is a person a member is in touch with: name, photo, where they
// are from, how the contact started, and whether they have a laptop and
// remote access set up. It always belongs to one member.
const residentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    photo: { type: imageSchema, default: null },
    country: { type: String, default: '', trim: true, maxlength: 60 },
    citizenship: { type: String, default: '', trim: true, maxlength: 60 },
    age: { type: Number, default: null, min: 0, max: 130 },
    // Where / how the contact was found: a referral, a Telegram group...
    source: { type: String, default: '', trim: true, maxlength: 160 },
    firstContact: { type: Date, default: null },
    // The platform used the first time: Telegram, Instagram, in person...
    firstContactVia: { type: String, default: '', trim: true, maxlength: 60 },
    hasLaptop: { type: Boolean, default: false },
    // Remote access to their device.
    accessSetUp: { type: Boolean, default: false },
    // The share of the income earned with this resident that is paid to them.
    sharePercent: { type: Number, default: 0, min: 0, max: 100 },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the owner so group scoping stays cheap.
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

residentSchema.index({ owner: 1, name: 1 });
residentSchema.index({ group: 1, name: 1 });

export default mongoose.model('Resident', residentSchema);
