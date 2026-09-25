// One-off password reset:  node src/scripts/resetPassword.js <username> <new password>
// The account is asked to change it at next login only if you pass --must-change.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import { checkPassword } from '../utils/validate.js';

const [username, password] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mustChange = process.argv.includes('--must-change');

if (!username || !password) {
  console.error('Usage: node src/scripts/resetPassword.js <username> <new password> [--must-change]');
  process.exit(1);
}

await connectDB(env.mongoUri);
const user = await User.findOne({ username: username.toLowerCase() });
if (!user) {
  console.error(`No account called "${username}".`);
  await mongoose.disconnect();
  process.exit(1);
}

checkPassword(password);            // same rules as the app
await user.setPassword(password);
user.mustChangePassword = mustChange;
if (user.status !== 'active') user.status = 'active';
await user.save();

console.log(`Password updated for "${user.username}" (${user.role}).`);
console.log(mustChange ? 'They must choose a new one at next login.' : 'They can log in with it straight away.');
console.log('Any other sessions for this account were logged out.');
await mongoose.disconnect();
