// One-off password reset:  node src/scripts/resetPassword.js <username>
//
// Prints a temporary password the account must change at next login.
// To set a chosen password instead, put it in the RESET_PASSWORD environment
// variable (never on the command line, where it would land in shell history
// and the process list); add --no-must-change to let it be kept.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { checkPassword } from '../utils/validate.js';
import { tempPassword } from '../utils/password.js';

const args = process.argv.slice(2);
const [username, extra] = args.filter((a) => !a.startsWith('--'));

if (!username || extra) {
  console.error('Usage: node src/scripts/resetPassword.js <username> [--no-must-change]');
  console.error('The password comes from RESET_PASSWORD, or a temporary one is generated.');
  process.exit(1);
}

const chosen = process.env.RESET_PASSWORD;
const password = chosen ?? tempPassword();
// A generated password is always temporary.
const mustChange = !chosen || !args.includes('--no-must-change');

try {
  if (chosen) checkPassword(chosen); // same rules as the app
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Fail fast instead of retrying forever like the API does.
try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  process.exit(1);
}

const user = await User.findOne({ username: username.toLowerCase() });
if (!user) {
  console.error(`No account called "${username}".`);
  await mongoose.disconnect();
  process.exit(1);
}

await user.setPassword(password);
user.mustChangePassword = mustChange;
if (user.status !== 'active') user.status = 'active';
await user.save();

console.log(`Password updated for "${user.username}" (${user.role}).`);
if (!chosen) console.log(`Temporary password: ${password}`);
console.log(mustChange ? 'They must choose a new one at next login.' : 'They can log in with it straight away.');
console.log('Any other sessions for this account were logged out.');
await mongoose.disconnect();
