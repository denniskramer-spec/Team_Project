// Fills the database with a realistic team so every channel has something to show.
//
//   npm run seed:demo            — only if there are no members yet
//   npm run seed:demo -- --force — wipe the demo collections first
//
// Everyone's password is demo1234 (the admin keeps its own password).

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Instruction from '../models/Instruction.js';
import Message from '../models/Message.js';
import ChatRead from '../models/ChatRead.js';
import Report from '../models/Report.js';
import Plan from '../models/Plan.js';
import Task from '../models/Task.js';
import Income from '../models/Income.js';
import Outcome from '../models/Outcome.js';
import { periodKey, parsePeriod, shiftPeriod } from '../utils/period.js';
import { seedGroups } from '../utils/seed.js';

const PASSWORD = 'demo1234';
const force = process.argv.includes('--force');

const day = (offset) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const pick = (list, i) => list[i % list.length];
const rnd = (min, max) => Math.round(min + Math.random() * (max - min));

const PEOPLE = [
  { username: 'lena', name: 'Lena Fischer', role: 'leader', group: null, birthday: '1987-03-14' },
  { username: 'bruno', name: 'Bruno Alves', role: 'boss', group: 'Group1', birthday: '1990-07-02' },
  { username: 'bianca', name: 'Bianca Rossi', role: 'boss', group: 'Group2', birthday: '1989-11-23' },
  { username: 'mina', name: 'Mina Park', role: 'member', group: 'Group1', birthday: '1995-01-09' },
  { username: 'omar', name: 'Omar Haddad', role: 'member', group: 'Group1', birthday: '1993-05-30' },
  { username: 'tess', name: 'Tess Novak', role: 'member', group: 'Group1', birthday: '1998-09-22' },
  { username: 'kai', name: 'Kai Sorensen', role: 'member', group: 'Group2', birthday: '1992-12-11' },
  { username: 'rita', name: 'Rita Moreau', role: 'member', group: 'Group2', birthday: '1996-04-18' },
  { username: 'sam', name: 'Sam Okafor', role: 'member', group: 'Group2', birthday: '1994-08-05', status: 'pending' },
];

const CLIENTS = ['Acme Ltd', 'Globex', 'Initech', 'Umbrella Co', 'Stark Industries', 'Wayne Group'];
const TASK_NAMES = [
  'Website redesign', 'Tender pack — city council', 'Quarterly audit', 'Trade show booth',
  'CRM migration', 'Brand refresh', 'Supplier review', 'Security assessment',
];

async function wipe() {
  await Promise.all([
    Instruction.deleteMany({}), Message.deleteMany({}), ChatRead.deleteMany({}),
    Report.deleteMany({}), Plan.deleteMany({}), Task.deleteMany({}), Income.deleteMany({}), Outcome.deleteMany({}),
    User.deleteMany({ role: { $ne: 'admin' } }),
  ]);
  console.log('Cleared demo data (the admin account was kept).');
}

async function createPeople(groups) {
  const byUsername = {};
  for (const person of PEOPLE) {
    const user = new User({
      username: person.username,
      name: person.name,
      role: person.status === 'pending' ? 'member' : person.role,
      group: person.group ? groups[person.group]._id : null,
      birthday: new Date(`${person.birthday}T00:00:00.000Z`),
      status: person.status ?? 'active',
      mustChangePassword: false,
      // The team existed before the seeded instructions and messages, so read
      // receipts and unread counts line up.
      createdAt: person.status === 'pending' ? day(-1) : day(-45),
    });
    await user.setPassword(PASSWORD);
    await user.save();
    byUsername[person.username] = user;
  }
  return byUsername;
}

async function createInstructions(people, groups) {
  const rows = [
    { author: 'lena', target: 'all', title: 'Quarter kickoff', content: 'We start the new quarter on Monday. Please have your weekly plans in by Friday evening.', priority: 'normal', daysAgo: 4 },
    { author: 'lena', target: 'all', title: 'Client visit on Thursday', content: 'Umbrella Co is visiting on Thursday at 10:00. Meeting room 2 is booked all morning.', priority: 'normal', daysAgo: 2 },
    { author: 'bruno', target: 'group', group: 'Group1', content: 'Group1: send me your bid list before the standup tomorrow.', priority: 'normal', daysAgo: 1 },
    { author: 'bianca', target: 'group', group: 'Group2', title: 'Pause on Initech quotes', content: 'Hold all Initech quotes until the new price list lands.', priority: 'urgent', daysAgo: 0 },
    { author: 'lena', target: 'all', title: 'Expense sheets', content: 'Expense sheets for this month close on the 28th.', priority: 'normal', daysAgo: 0 },
  ];

  for (const row of rows) {
    const instruction = await new Instruction({
      author: people[row.author]._id,
      target: row.target,
      group: row.group ? groups[row.group]._id : null,
      title: row.title ?? '',
      content: row.content,
      priority: row.priority,
      createdAt: day(-row.daysAgo),
    }).save();
    // The older ones have been read by most people.
    if (row.daysAgo >= 2) {
      const readers = Object.values(people).filter((u) => String(u._id) !== String(instruction.author) && u.status === 'active');
      instruction.readBy = readers.slice(0, readers.length - 1).map((u) => ({ user: u._id, at: day(-row.daysAgo + 1) }));
      await instruction.save();
    }
  }
  console.log(`Seeded ${rows.length} instructions`);
}

async function createChat(people, groups) {
  const lines = [
    ['general', 'lena', 'Morning everyone — good week so far, keep it up.', 3],
    ['general', 'mina', 'The Acme deck is ready for review 🙂', 3],
    ['general', 'kai', 'Nice work Mina, that was quick.', 3],
    ['general', 'omar', 'Anyone got the new price list?', 1],
    ['general', 'bianca', 'Coming tomorrow, I will post it here.', 1],
    ['finance', 'bruno', 'Globex invoice went out this morning.', 2],
    ['finance', 'lena', 'Thanks — received figures look healthy this month.', 1],
    ['finance', 'rita', 'Initech paid the first instalment today.', 0],
    ['Group1', 'bruno', 'Standup at 10:00 tomorrow, short one.', 1],
    ['Group1', 'tess', 'Works for me.', 1],
    ['Group1', 'mina', 'I will be five minutes late, dentist.', 0],
    ['Group2', 'bianca', 'Trade show booth plan is in the Task channel now.', 1],
    ['Group2', 'kai', 'Looks good. I will take the Thursday shift.', 0],
  ];

  for (const [channel, author, content, daysAgo] of lines) {
    const group = groups[channel];
    await new Message({
      channelKey: group ? `group:${group._id}` : channel,
      group: group?._id ?? null,
      author: people[author]._id,
      content,
      createdAt: day(-daysAgo),
    }).save();
  }
  console.log(`Seeded ${lines.length} chat messages`);
}

async function createReportsAndPlans(people) {
  const members = Object.values(people).filter((u) => ['member', 'boss'].includes(u.role) && u.status === 'active');
  const notes = ['Good week overall.', 'Two deals slipped to next week.', 'Waiting on client feedback.', 'Steady progress.'];
  const upcoming = ['Client call on Monday', 'Two demos booked', 'Site visit mid-week', 'Contract review'];
  let reports = 0;
  let plans = 0;

  for (const [index, user] of members.entries()) {
    // This week and the two before it.
    for (let back = 0; back < 3; back += 1) {
      const week = back === 0 ? periodKey('weekly') : shiftPeriod('weekly', periodKey('weekly'), -back);
      const period = parsePeriod('weekly', week);
      const jobBid = rnd(4, 14);
      const aiBid = rnd(1, 8);
      const income = rnd(1500, 7000);

      await Plan.findOneAndUpdate(
        { owner: user._id, type: 'weekly', period: week, scope: 'personal' },
        {
          group: user.group ?? null,
          periodStart: period.start,
          periodEnd: period.end,
          jobBid: jobBid + 2,
          aiBid: aiBid + 1,
          income: income + 500,
          note: pick(upcoming, index + back),
          status: back === 0 ? pick(['not_done', 'progress'], index) : 'done',
          statusUpdatedAt: day(-back * 7),
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      plans += 1;

    }

    // Daily reports for the last few days. A couple of people have not filed
    // today's yet, so "missing" shows up in the team table.
    for (let back = 0; back < 5; back += 1) {
      if (back === 0 && index % 3 === 0) continue;
      const key = periodKey('daily', day(-back));
      const dayPeriod = parsePeriod('daily', key);
      await Report.findOneAndUpdate(
        { author: user._id, type: 'daily', period: key, scope: 'personal' },
        {
          group: user.group ?? null,
          periodStart: dayPeriod.start,
          periodEnd: dayPeriod.end,
          jobBid: rnd(1, 5),
          aiBid: rnd(0, 4),
          income: rnd(200, 1600),
          upcomingAmount: rnd(0, 2500),
          upcomingNote: pick(upcoming, index + back),
          note: pick(notes, index + back),
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      reports += 1;
    }
  }

  // Group reports and group plans from the two bosses.
  for (const boss of [people.bruno, people.bianca]) {
    const week = periodKey('weekly');
    const period = parsePeriod('weekly', week);
    const today = periodKey('daily');
    const dayPeriod = parsePeriod('daily', today);
    await Report.findOneAndUpdate(
      { author: boss._id, type: 'daily', period: today, scope: 'group' },
      {
        group: boss.group,
        periodStart: dayPeriod.start,
        periodEnd: dayPeriod.end,
        jobBid: rnd(6, 14),
        aiBid: rnd(2, 9),
        income: rnd(2000, 5000),
        upcomingAmount: rnd(1000, 4000),
        upcomingNote: 'Two tenders land this week.',
        note: 'Group summary for the day.',
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    await Plan.findOneAndUpdate(
      { owner: boss._id, type: 'weekly', period: week, scope: 'group' },
      { group: boss.group, periodStart: period.start, periodEnd: period.end, jobBid: 30, aiBid: 12, income: 16000, note: 'Group target for the week.', status: 'progress' },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`Seeded ${reports} reports and ${plans} plans (plus group reports and plans)`);
}

async function createTasksAndIncome(people) {
  const members = Object.values(people).filter((u) => u.role === 'member' && u.status === 'active');
  const statuses = ['done', 'progress', 'not_done'];
  let incomes = 0;

  for (const [index, name] of TASK_NAMES.entries()) {
    const owner = pick(members, index);
    const start = day(-rnd(3, 20));
    const end = day(rnd(1, 20));
    const task = await new Task({
      name,
      owner: owner._id,
      group: owner.group ?? null,
      createdBy: people.lena._id,
      startDate: start,
      endDate: end,
      salary: rnd(400, 2600),
      status: pick(statuses, index),
      note: index % 3 === 0 ? 'Agreed with the client at the kickoff call.' : '',
    }).save();

    // Income for the finished ones.
    if (task.status === 'done') {
      await new Income({
        member: owner._id,
        group: owner.group ?? null,
        createdBy: people.lena._id,
        date: day(-rnd(0, 5)),
        amount: task.salary,
        from: pick(CLIENTS, index),
        task: task._id,
        note: 'Paid on completion.',
      }).save();
      incomes += 1;
    }
  }

  // Each member's daily reports point at their newest task, with the upcoming
  // income due when that task ends.
  for (const member of members) {
    const task = await Task.findOne({ owner: member._id }).sort({ startDate: -1 });
    if (!task) continue;
    await Report.updateMany(
      { author: member._id, scope: 'personal' },
      { task: task._id, upcomingDate: task.endDate },
    );
  }

  // A few more income records spread over this month.
  for (let i = 0; i < 10; i += 1) {
    const member = pick(members, i);
    await new Income({
      member: member._id,
      group: member.group ?? null,
      createdBy: people.lena._id,
      // Spread over the month, but weighted to this week so weekly views fill up.
      date: day(-(i % 3 === 0 ? rnd(8, 25) : rnd(0, 5))),
      amount: rnd(300, 3500),
      from: pick(CLIENTS, i + 2),
    }).save();
    incomes += 1;
  }
  console.log(`Seeded ${TASK_NAMES.length} tasks and ${incomes} income records`);
}

const REASONS = ['Software licence', 'Travel to client', 'Equipment', 'Training course', 'Subcontractor', 'Office supplies'];

// Outcome: what was spent per member, recorded by the leader or the group's boss.
async function createOutcomes(people) {
  const members = Object.values(people).filter((u) => u.role === 'member' && u.status === 'active');
  const bosses = Object.values(people).filter((u) => u.role === 'boss');
  for (let i = 0; i < 8; i += 1) {
    const member = pick(members, i);
    const boss = bosses.find((b) => String(b.group) === String(member.group)) ?? people.lena;
    await new Outcome({
      member: member._id,
      group: member.group ?? null,
      createdBy: i % 2 ? boss._id : people.lena._id,
      date: day(-(i % 3 === 0 ? rnd(8, 25) : rnd(0, 5))),
      amount: rnd(80, 1200),
      reason: pick(REASONS, i),
      comment: i % 3 === 0 ? 'Approved in the weekly meeting.' : '',
    }).save();
  }
  console.log('Seeded 8 outcome records');

}

async function main() {
  await connectDB(env.mongoUri);

  const existing = await User.countDocuments({ role: { $ne: 'admin' } });
  if (existing && !force) {
    console.error(`There are already ${existing} non-admin accounts. Re-run with --force to replace the demo data.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (existing) await wipe();

  await seedGroups();
  const groupList = await Group.find().lean();
  const groups = Object.fromEntries(groupList.map((g) => [g.name, g]));

  const people = await createPeople(groups);
  await createInstructions(people, groups);
  await createChat(people, groups);
  await createReportsAndPlans(people);
  await createTasksAndIncome(people);
  await createOutcomes(people);

  console.log('\nDemo accounts (password: demo1234)');
  console.log('  lena   — team leader, sees everything');
  console.log('  bruno  — boss of Group1     bianca — boss of Group2');
  console.log('  mina, omar, tess — Group1   kai, rita — Group2');
  console.log('  sam    — waiting for approval (try Admin -> Approvals)');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
