import mongoose from 'mongoose';
import { imageSchema } from './image.js';

// A chat message: text, up to five images (uploaded through
// POST /api/chat/:titleKey/upload), or both. `channelKey` is 'general', 'finance', 'group:<groupId>'
// or 'dm:<idA>:<idB>' (a direct message; `peers` holds the two people).
const messageSchema = new mongoose.Schema(
  {
    channelKey: { type: String, required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    peers: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
    content: { type: String, default: '', trim: true, maxlength: 2000 },
    images: { type: [imageSchema], default: [] },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

messageSchema.index({ channelKey: 1, createdAt: -1 });
messageSchema.index({ peers: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
