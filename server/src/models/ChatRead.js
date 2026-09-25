import mongoose from 'mongoose';

// How far a user has read in one chat, used for unread badges.
const chatReadSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channelKey: { type: String, required: true },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

chatReadSchema.index({ user: 1, channelKey: 1 }, { unique: true });

export default mongoose.model('ChatRead', chatReadSchema);
