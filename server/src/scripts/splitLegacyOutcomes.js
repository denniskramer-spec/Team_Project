// One-off migration: old team costs (outcomes with no member) become one
// share per member, the way new team and group outcomes are recorded.
//
//   node src/scripts/splitLegacyOutcomes.js           # show what would change
//   node src/scripts/splitLegacyOutcomes.js --apply   # change it
//
// A cost with a group is split over that group's active members and bosses;
// one with no group (the whole team) over every active member and boss. The
// shares keep the old record's id as their split id, so each can be traced
// back, and running the script again only finishes what an earlier run left.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Outcome from '../models/Outcome.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { shares } from '../utils/outcomeTarget.js';

const apply = process.argv.includes('--apply');
const money = (n) => n.toFixed(2);
const day = (d) => d.toISOString().slice(0, 10);

try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  process.exit(1);
}

// The collection is read directly: these records no longer pass the model's
// validation (member is required now).
const legacy = await Outcome.collection.find({ member: null }).sort({ date: 1 }).toArray();
console.log(`${legacy.length} old team cost(s) without a member.${apply ? '' : ' Dry run: nothing is changed.'}\n`);

let split = 0;
let skipped = 0;
for (const old of legacy) {
  const group = old.group ? await Group.findById(old.group).lean() : null;
  const what = `${day(old.date)}  ${money(old.amount)}  "${old.reason}"`;

  if (old.group && !group) {
    console.log(`SKIP  ${what}: its group no longer exists`);
    skipped += 1;
    continue;
  }

  const filter = { status: 'active', role: { $in: ['member', 'boss'] } };
  if (group) filter.group = group._id;
  const members = await User.find(filter, 'name group').sort('name').lean();
  const label = group ? `${group.name} team` : 'Whole team';
  if (!members.length) {
    console.log(`SKIP  ${what}: ${label} has no active members`);
    skipped += 1;
    continue;
  }

  const parts = shares(old.amount, members.length);
  console.log(`SPLIT ${what} -> ${label}, ${members.length} × ~${money(parts[0])}`);
  split += 1;
  if (!apply) continue;

  // An earlier run may have created the shares and stopped before deleting.
  if (!(await Outcome.exists({ 'split.id': old._id }))) {
    await Outcome.insertMany(members.map((m, i) => ({
      member: m._id,
      group: m.group ?? null,
      createdBy: old.createdBy,
      date: old.date,
      amount: parts[i],
      reason: old.reason,
      comment: old.comment ?? '',
      images: old.images ?? [],
      split: { id: old._id, total: old.amount, count: members.length, label },
    })));
  }
  await Outcome.collection.deleteOne({ _id: old._id });
}

console.log(`\n${split} ${apply ? 'split' : 'to split'}, ${skipped} skipped.`);
if (!apply && split) console.log('Run again with --apply to make these changes.');
await mongoose.disconnect();
