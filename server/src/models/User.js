import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/roles.js';
import { nextSequence } from './Counter.js';

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_.]{3,30}$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    memberId: { type: String, unique: true },
    birthday: { type: Date, default: null },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    role: { type: String, enum: ROLES, default: 'member' },
    // pending: signed up, waiting for approval. disabled: blocked by an admin.
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'pending' },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.pre('save', async function assignMemberId() {
  if (!this.memberId) {
    const seq = await nextSequence('memberId');
    this.memberId = `M${String(seq).padStart(4, '0')}`;
  }
});

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  this.passwordChangedAt = new Date();
};

userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Shape sent to the client. Never includes the password hash.
// The group is always { id, name, slug } when it has been populated.
userSchema.methods.toPublic = function toPublic() {
  const group = this.group?._id
    ? { id: this.group._id, name: this.group.name, slug: this.group.slug }
    : null;
  return {
    id: this._id,
    username: this.username,
    name: this.name,
    memberId: this.memberId,
    birthday: this.birthday,
    group,
    role: this.role,
    status: this.status,
    mustChangePassword: this.mustChangePassword,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
