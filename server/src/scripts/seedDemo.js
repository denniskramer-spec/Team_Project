// Fills the database with a realistic team so every channel has something to show.
//
//   npm run seed:demo            — only if there are no members yet
//   npm run seed:demo -- --force --confirm=<database name>
//                                — DELETE every account except admins and all
//                                  their data first, then seed
//
// --force never runs with NODE_ENV=production, and only when --confirm names
// the database it is about to empty.
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
import Resident from '../models/Resident.js';
import ChatAccount from '../models/ChatAccount.js';
import { periodKey, parsePeriod, shiftPeriod } from '../utils/period.js';
import { seedGroups } from '../utils/seed.js';
import { computeSplit, methodOf, workEarnings } from '../utils/payments.js';
import { dmKey } from '../utils/chatPolicy.js';

const PASSWORD = 'demo1234';
const force = process.argv.includes('--force');
const confirmed = process.argv.find((a) => a.startsWith('--confirm='))?.slice('--confirm='.length);

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
  'LinkedIn AOR/FMS', 'Proton Robotics Project', 'React dashboard for a logistics startup', 'Data labelling — medical images',
  'CRM migration', 'Brand refresh', 'Supplier review', 'Security assessment',
];
const SOURCES = ['Anyone AI', 'Micro1', 'Upwork', 'LinkedIn', 'Referral', 'Toptal'];
// Day-by-day work written in the daily reports, newest day first.
const WORK = [
  'Pending', 'Still Pending, not start work', 'Complete Background Check and Pending',
  'Make Criminal Check Certificate\nRedo Checkr', 'Onboarding call with the client\nSigned the NDA',
  'Set up the dev environment\nFirst pull request opened', 'Fixed the login bug\nWrote tests for the API',
];

async function wipe() {
  await Promise.all([
    Instruction.deleteMany({}), Message.deleteMany({}), ChatRead.deleteMany({}),
    Report.deleteMany({}), Plan.deleteMany({}), Task.deleteMany({}), Income.deleteMany({}), Outcome.deleteMany({}),
    Resident.deleteMany({}), ChatAccount.deleteMany({}),
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
      // Tess's birthday is always three days away, so "Coming up" has something to show.
      birthday: person.username === 'tess' ? new Date(Date.UTC(1998, day(3).getUTCMonth(), day(3).getUTCDate())) : new Date(`${person.birthday}T00:00:00.000Z`),
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

  // A few direct messages, and when people were last around.
  const dms = [
    ['lena', 'mina', 'Hi Mina, how is the LinkedIn onboarding going?', -3],
    ['mina', 'lena', 'Still pending on their side. I chased them today.', -2],
    ['lena', 'mina', 'Thanks. Put it in the report so the group sees it.', -1],
    ['bruno', 'omar', 'Omar, can you cover the Proton call tomorrow?', -5],
    ['omar', 'bruno', 'Sure, 19:00 works for me.', -4],
  ];
  for (const [from, to, content, hoursAgo] of dms) {
    const a = people[from]; const b = people[to];
    await new Message({ channelKey: dmKey(a._id, b._id), author: a._id, peers: [a._id, b._id], content, createdAt: new Date(Date.now() + hoursAgo * 3600000) }).save();
  }
  for (const [i, u] of Object.values(people).entries()) {
    await User.updateOne({ _id: u._id }, { lastSeenAt: new Date(Date.now() - (i + 1) * 47 * 60000) });
  }
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
          resumes: rnd(10, 30), forms: rnd(5, 15), biddingHours: rnd(15, 30),
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
          income: 0,
          upcomingAmount: 0,
          // Due soon for recent reports (this week), later in the month for older ones.
          upcomingDate: back < 2 ? day(rnd(1, 5)) : day(rnd(8, 25)),
          upcomingNote: pick(upcoming, index + back),
          note: pick(notes, index + back),
          resumes: rnd(0, 6), forms: rnd(0, 4), biddingHours: rnd(1, 5),
          todayPlan: back === 1 ? [{ text: 'Bid 150', done: true }, { text: 'Find citizen with BlueOrbit & Discord', done: false }] : [],
          planTomorrow: back === 1 ? 'Making Accounts with AI Training Platforms & Bot Call\nFind citizen with BlueOrbit & Discord\nBid 150' : '',
          calls: back === 1 ? [{ time: '19:00', title: '1st Intro call · Raydar (Site Reliability Engineer)', profile: 'Dennis Kramer', caller: 'Warren', result: 'well', note: 'AI bot call, duplicate questions.' }] : [],
          sentAt: day(-back),
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      reports += 1;
    }
  }

  // Group plans from the two bosses (group reports add themselves up).
  for (const boss of [people.bruno, people.bianca]) {
    const week = periodKey('weekly');
    const period = parsePeriod('weekly', week);
    await Plan.findOneAndUpdate(
      { owner: boss._id, type: 'weekly', period: week, scope: 'group' },
      { group: boss.group, periodStart: period.start, periodEnd: period.end, jobBid: 30, aiBid: 12, resumes: 60, forms: 30, biddingHours: 80, income: 16000, note: 'Group target for the week.', status: 'progress' },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`Seeded ${reports} reports and ${plans} plans (plus group plans)`);
}

async function createTasksAndIncome(people, residents) {
  const members = Object.values(people).filter((u) => u.role === 'member' && u.status === 'active');
  const statuses = ['active', 'active', 'paused', 'done'];
  let incomes = 0;

  for (const [index, name] of TASK_NAMES.entries()) {
    const owner = pick(members, index);
    const start = day(-rnd(3, 20));
    // Every third project is open-ended; the others expire months ahead.
    // One expires within two weeks, so "Coming up" has something to show.
    const end = index % 3 === 2 ? null : index === 1 ? day(9) : day(rnd(30, 400));
    const own = residents.filter((r) => String(r.owner) === String(owner._id));
    const task = await new Task({
      name,
      owner: owner._id,
      group: owner.group ?? null,
      createdBy: people.lena._id,
      source: pick(SOURCES, index),
      resident: own.length ? pick(own, index)._id : null,
      startDate: start,
      endDate: end,
      price: pick([65, 90, 40, 1200, 55, 3000, 75, 30], index),
      currency: 'USD',
      priceUnit: pick(['hour', 'hour', 'hour', 'month', 'hour', 'fixed', 'hour', 'task'], index),
      method: pick(['paypal', 'wise', 'payoneer', 'usdt', 'upwork', 'paypal', 'wise', 'bank'], index),
      status: pick(statuses, index),
      note: index % 3 === 0 ? 'Now process of Onboarding' : '',
    }).save();

    // Income for the finished ones.
    if (task.status === 'done') {
      await new Income({
        member: owner._id,
        group: owner.group ?? null,
        createdBy: people.lena._id,
        date: day(-rnd(0, 5)),
        ...paid(rnd(400, 2600), pick(['paypal', 'wise', 'payoneer', 'usdt'], index), 0),
        from: task.name,
        task: task._id,
        note: 'Paid on completion.',
      }).save();
      incomes += 1;
    }
  }

  // Each member's daily reports carry the day's work on their running
  // projects (one entry per project), with the upcoming income due when the
  // newest one ends. One project is left without today's entry.
  for (const [i, member] of members.entries()) {
    const running = await Task.find({ owner: member._id, status: { $ne: 'done' } }).sort({ startDate: -1 });
    if (!running.length) continue;
    const reports = await Report.find({ author: member._id, scope: 'personal', type: 'daily' }).sort({ periodStart: -1 });
    for (const [back, report] of reports.entries()) {
      report.work = running
        .filter((t, n) => !(back === 0 && n === 1 && i % 2 === 0))
        .map((t, n) => { const hours = rnd(1, 6); return { task: t._id, text: pick(WORK, back + n * 2), hours, amount: workEarnings({ price: t.price, priceUnit: t.priceUnit }, { hours }) }; });
      report.task = running[0]._id;
      // The hours reported are what the day is worth: the upcoming amount.
      const earned = report.work.reduce((sum, w) => sum + (w.amount || 0), 0);
      if (earned > 0) { report.upcomingAmount = earned; report.upcomingDate = report.periodStart; }
      await report.save();
    }
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
      ...paid(rnd(300, 3500), pick(['paypal', 'wise', 'payoneer', 'usdt', 'upwork'], i), i % 2 ? 20 : 0),
      from: pick(CLIENTS, i + 2),  // a client paid directly, no project
    }).save();
    incomes += 1;
  }
  console.log(`Seeded ${TASK_NAMES.length} projects and ${incomes} income records`);
}

// An income amount with its payment method, fee and resident share filled in.
function paid(amount, method, residentPercent) {
  const m = methodOf(method);
  const payment = { method, feePercent: m.feePercent, feeFixed: m.feeFixed, residentPercent };
  return { amount, ...payment, ...computeSplit({ amount, ...payment }) };
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

const RESIDENTS = [
  { owner: 'mina', name: 'Dyonatas Menegatti', country: 'Brazil', citizenship: 'Brazil', age: 31, source: 'Telegram group', via: 'Telegram', laptop: true, access: true, first: -3 },
  { owner: 'mina', name: 'Anderson Santos do Nascimento', country: 'Brazil', citizenship: 'Brazil', age: 27, source: 'Referral from Dyonatas', via: 'WhatsApp', laptop: true, access: true, first: -61 },
  { owner: 'omar', name: 'Lucía Fernández', country: 'Argentina', citizenship: 'Argentina', age: 24, source: 'Instagram outreach', via: 'Instagram', laptop: false, access: false, first: -12 },
  { owner: 'kai', name: 'Mateus Oliveira', country: 'Portugal', citizenship: 'Brazil', age: 35, source: 'Discord server', via: 'Discord', laptop: true, access: false, first: -20 },
  { owner: 'rita', name: 'Priya Nair', country: 'India', citizenship: 'India', age: 29, source: 'Job board reply', via: 'Email', laptop: true, access: true, first: -8 },
];

const ACCOUNTS = [
  { owner: 'mina', platform: 'discord', name: '_demeteralin0725', joined: -57, contacts: [] },
  { owner: 'mina', platform: 'whatsapp', name: '+1 (809) 292-4098', joined: -40, contacts: ['Anderson Santos do Nascimento', 'Dyonatas Menegatti'] },
  { owner: 'omar', platform: 'telegram', name: '@daniel_ryan314', phone: '+14307321270', joined: -33, contacts: ['Lucía Fernández'] },
  { owner: 'kai', platform: 'discord', name: '_dennis10004', joined: -57, contacts: ['Mateus Oliveira'] },
  { owner: 'rita', platform: 'discord', name: '_denniskramer_75788', joined: -81, contacts: [], status: 'suspended' },
];

// Residents: who each member is in touch with, and the chat accounts they
// use to talk to them.
async function createResidentsAndAccounts(people) {
  const byName = {};
  for (const [i, r] of RESIDENTS.entries()) {
    const owner = people[r.owner];
    byName[r.name] = await new Resident({
      name: r.name, country: r.country, citizenship: r.citizenship, age: r.age, source: r.source,
      firstContact: day(r.first), firstContactVia: r.via, hasLaptop: r.laptop, laptopSource: r.laptop ? pick(['own', 'bought'], i) : '', accessSetUp: r.access, accessType: r.access ? pick(['laptop', 'vps', 'proxy'], i) : '', sharePercent: r.access ? 30 : 0,
      notes: r.access ? 'Remote access tested, works.' : '',
      owner: owner._id, group: owner.group ?? null, createdBy: owner._id,
    }).save();
  }
  for (const a of ACCOUNTS) {
    const owner = people[a.owner];
    await new ChatAccount({
      platform: a.platform, name: a.name, phone: a.phone ?? '', joinedAt: day(a.joined),
      contacts: a.contacts.map((n) => byName[n]._id), status: a.status ?? 'active',
      owner: owner._id, group: owner.group ?? null, createdBy: owner._id,
    }).save();
  }
  console.log(`Seeded ${RESIDENTS.length} residents and ${ACCOUNTS.length} chat accounts`);
  return Object.values(byName);
}

async function main() {
  await connectDB(env.mongoUri);

  const existing = await User.countDocuments({ role: { $ne: 'admin' } });
  const database = mongoose.connection.db.databaseName;
  const stop = async (message) => {
    console.error(message);
    await mongoose.disconnect();
    process.exit(1);
  };
  if (existing && !force) {
    await stop(`There are already ${existing} non-admin accounts in "${database}". Nothing was changed.\n`
      + `To DELETE them and all their data and seed the demo team, re-run with: --force --confirm=${database}`);
  }
  if (existing && env.isProd) await stop('Refusing to wipe a production database (NODE_ENV=production).');
  if (existing && confirmed !== database) {
    await stop(`--force would delete ${existing} accounts and all reports, plans, tasks, income, outcome, residents, chat accounts, chat and instructions in "${database}".\n`
      + `Nothing was changed. If that is what you want, add: --confirm=${database}`);
  }
  if (existing) await wipe();

  await seedGroups();
  const groupList = await Group.find().lean();
  const groups = Object.fromEntries(groupList.map((g) => [g.name, g]));

  const people = await createPeople(groups);
  await createInstructions(people, groups);
  await createChat(people, groups);
  await createReportsAndPlans(people);
  const residents = await createResidentsAndAccounts(people);
  await createTasksAndIncome(people, residents);
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
