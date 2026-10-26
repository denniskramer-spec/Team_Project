import mongoose from 'mongoose';
import User from '../models/User.js';
import Resident from '../models/Resident.js';
import Task from '../models/Task.js';
import Report from '../models/Report.js';
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

// Age in whole years from a birthday, for the assets migration below.
function ageFrom(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// Residents replaced the old Assets channel. A database from before the change
// still has an `assets` collection: its profiles become residents once (same
// ids and owners; contact details and English level go into the notes), and
// the old collection is kept aside as `assets_migrated`.
export async function migrateAssets() {
  const { db } = mongoose.connection;
  const exists = await db.listCollections({ name: 'assets' }).hasNext();
  if (!exists || await Resident.exists({})) return;
  const assets = await db.collection('assets').find().toArray();
  if (assets.length) {
    await Resident.insertMany(assets.map((a) => ({
      _id: a._id,
      name: a.name,
      country: a.nationality ?? '',
      citizenship: a.nationality ?? '',
      age: ageFrom(a.birthday),
      notes: [a.note, a.contact ? `Contact: ${a.contact}` : '', a.englishLevel ? `English: ${a.englishLevel}` : '']
        .filter(Boolean).join('\n'),
      owner: a.owner,
      group: a.group ?? null,
      createdBy: a.createdBy ?? a.owner,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })), { ordered: false });
  }
  await db.collection('assets').rename('assets_migrated');
  if (assets.length) console.log(`Moved ${assets.length} assets to residents (old collection kept as assets_migrated)`);
}

// Tasks became projects: the salary is now a price (per hour by default) and
// "not done" / "in progress" both mean the project is active.
export async function migrateTasks() {
  const renamed = await Task.collection.updateMany({ salary: { $exists: true } }, { $rename: { salary: 'price' } });
  const restated = await Task.collection.updateMany({ status: { $in: ['not_done', 'progress'] } }, { $set: { status: 'active' } });
  const n = renamed.modifiedCount + restated.modifiedCount;
  if (n) console.log(`Updated ${n} task record(s) to the project structure`);
}

// Reports written before drafts existed count as sent when they were last saved.
export async function migrateReports() {
  const old = await Report.find({ sentAt: { $exists: false } }, 'updatedAt').lean();
  if (!old.length) return;
  await Promise.all(old.map((r) => Report.updateOne({ _id: r._id }, { $set: { sentAt: r.updatedAt } })));
  console.log(`Marked ${old.length} older report(s) as sent`);
}

export async function seedAll() {
  await seedGroups();
  await seedAdmin();
  await migrateAssets();
  await migrateTasks();
  await migrateReports();
}
