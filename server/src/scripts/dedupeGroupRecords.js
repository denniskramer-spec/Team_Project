// One-off migration: a group has one group report and one group plan per
// period. Where several bosses each saved their own, the newest is kept and
// the older ones are removed; then the database indexes are brought in line.
//
//   node src/scripts/dedupeGroupRecords.js           # show what would change
//   node src/scripts/dedupeGroupRecords.js --apply   # change it
//
// Safe to run again: a second run finds nothing to do.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Report from '../models/Report.js';
import Plan from '../models/Plan.js';
import Group from '../models/Group.js';
import User from '../models/User.js';

const apply = process.argv.includes('--apply');

try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  process.exit(1);
}

const groups = new Map((await Group.find().lean()).map((g) => [String(g._id), g.name]));
const users = new Map((await User.find({}, 'name').lean()).map((u) => [String(u._id), u.name]));
let removed = 0;

for (const [Model, field, what] of [[Report, 'author', 'group report'], [Plan, 'owner', 'group plan']]) {
  const copies = await Model.aggregate([
    { $match: { scope: 'group' } },
    { $sort: { updatedAt: -1 } },
    { $group: { _id: { group: '$group', type: '$type', period: '$period' }, docs: { $push: { id: '$_id', who: `$${field}`, income: '$income', updatedAt: '$updatedAt' } } } },
    { $match: { 'docs.1': { $exists: true } } },
    { $sort: { '_id.period': 1 } },
  ]);
  for (const c of copies) {
    const [keep, ...drop] = c.docs;
    const name = (d) => `${users.get(String(d.who)) ?? 'unknown'} (income ${d.income})`;
    console.log(`${what}  ${groups.get(String(c._id.group)) ?? 'no group'}  ${c._id.period}: keep ${name(keep)}, remove ${drop.map(name).join(', ')}`);
    removed += drop.length;
    if (apply) await Model.deleteMany({ _id: { $in: drop.map((d) => d.id) } });
  }
  // Replaces the old "one per author" index with the two current ones.
  if (apply) await Model.syncIndexes();
}

console.log(`\n${removed} older ${removed === 1 ? 'copy' : 'copies'} ${apply ? 'removed' : 'to remove'}.${apply ? ' Indexes updated.' : ''}`);
if (!apply) console.log('Run again with --apply to make these changes and update the indexes.');
await mongoose.disconnect();
