import mongoose from 'mongoose';

// Sessions ended by logging out. Tokens are otherwise valid until they
// expire, so a logged-out token is listed here (by its id) until then;
// MongoDB removes each entry once `expiresAt` has passed.
const revokedTokenSchema = new mongoose.Schema({
  _id: String, // the token's jti
  expiresAt: { type: Date, required: true },
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RevokedToken', revokedTokenSchema);
