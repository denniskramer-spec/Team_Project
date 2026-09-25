import User from '../models/User.js';
import Group from '../models/Group.js';
import { env } from '../config/env.js';

const DEFAULT_GROUPS = ['Group1', 'Group2'];

// Creates the starting groups from the project guide if there are none yet.
export async function seedGroups() {
  if (await Group.exists({})) return;
  for (const name of DEFAULT_GROUPS) await new Group({ name }).save();
  console.log(`Seeded groups: ${DEFAULT_GROUPS.join(', ')}`);
}

// Creates the first admin account if none exists yet.
// The admin must change the seeded password on first login.
export async function seedAdmin() {
  if (await User.exists({ role: 'admin' })) return;

  const { username, password } = env.seedAdmin;
  if (!username || !password) {
    console.warn('No admin account exists. Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD in .env to create one.');
    return;
  }
  if (await User.exists({ username: username.toLowerCase() })) {
    console.warn(`Cannot seed admin: username "${username}" is already taken.`);
    return;
  }

  const admin = new User({
    username,
    name: 'Administrator',
    role: 'admin',
    status: 'active',
    mustChangePassword: true,
  });
  await admin.setPassword(password);
  await admin.save();
  console.log(`Seeded admin account "${admin.username}" (password must be changed at first login)`);
}

export async function seedAll() {
  await seedGroups();
  await seedAdmin();
}
