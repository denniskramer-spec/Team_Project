import mongoose from 'mongoose';

const readSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// An instruction from the team leader (to everyone or a group) or a boss (to their group).
const instructionSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target: { type: String, enum: ['all', 'group', 'member'], required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    // Set when the instruction goes to one person.
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
    // Recipients who acknowledged the instruction ("Got it").
    readBy: { type: [readSchema], default: [] },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

instructionSchema.index({ target: 1, group: 1, createdAt: -1 });
instructionSchema.index({ recipient: 1, createdAt: -1 });
instructionSchema.index({ 'readBy.user': 1 });

export default mongoose.model('Instruction', instructionSchema);
