import mongoose from 'mongoose';

// App-wide settings an admin changes from the app, one document per key
// (today only `timeZone`, see utils/teamTime.js).
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export default mongoose.model('Setting', settingSchema);
