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

// Records that `user` has read `channelKey` up to `at`. Two tabs doing this
// at the same moment both try to insert the row; the loser retries as an update.
chatReadSchema.statics.touch = async function touch(user, channelKey, at = new Date()) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await this.findOneAndUpdate({ user, channelKey }, { lastReadAt: at }, { upsert: true, new: true });
    } catch (err) {
      if (err.code !== 11000 || attempt) throw err;
    }
  }
};

export default mongoose.model('ChatRead', chatReadSchema);
