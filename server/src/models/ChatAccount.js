import mongoose from 'mongoose';
import { imageSchema } from './image.js';

export const PLATFORMS = ['discord', 'telegram', 'whatsapp'];
export const STATUSES = ['active', 'suspended'];

// A Discord, Telegram or WhatsApp account a member uses, and the residents
// they talk to from it. A suspended account can carry a screenshot of the
// suspension screen. It always belongs to one member.
const chatAccountSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: PLATFORMS, required: true },
    // The username (Discord), handle (Telegram) or phone number (WhatsApp).
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Telegram accounts also have a phone number.
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    joinedAt: { type: Date, default: null },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Resident' }],
    status: { type: String, enum: STATUSES, default: 'active' },
    screenshot: { type: imageSchema, default: null },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the owner so group scoping stays cheap.
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

chatAccountSchema.index({ owner: 1, platform: 1, name: 1 });
chatAccountSchema.index({ group: 1, platform: 1, name: 1 });
chatAccountSchema.index({ contacts: 1 });

export default mongoose.model('ChatAccount', chatAccountSchema);
