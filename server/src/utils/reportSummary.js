import Task from '../models/Task.js';
import Resident from '../models/Resident.js';
import Report from '../models/Report.js';
import Plan from '../models/Plan.js';
import { parsePeriod } from './period.js';
import { formatPrice } from './project.js';
import { earnedOf } from './reportWork.js';
import { goalsOf } from './dailyGoal.js';

// The numbers behind the Dashboard (routes/reports.js): what a set of daily
// reports adds up to, a group's day, and what the report form needs.

// "Plan for tomorrow" is written one item per line.
export const planLines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const SUMMED = ['aiBid', 'resumes', 'forms', 'biddingHours', 'contacted', 'replies', 'agreed', 'income', 'upcomingAmount'];

// Item by item, what these reports add up to (older reports counted every
// bid as a job bid; `earned` is what the reported hours and tasks are worth).
export const sumOf = (rows) => rows.reduce((acc, r) => {
  acc.jobBid += r.jobBid || r.bid || 0;
  for (const key of SUMMED) acc[key] += r[key] || 0;
  acc.earned = Math.round((acc.earned + earnedOf(r.work)) * 100) / 100;
  return acc;
}, Object.fromEntries(['jobBid', ...SUMMED, 'earned'].map((k) => [k, 0])));

const inGroup = (group) => (doc) => String(doc.group?._id ?? doc.group) === String(group._id);

// A group's report is not written by anyone: it is its members' reports of
// the day added up, and how many of them are in. `expected` are the members
// who should have written one.
export function groupSummary(group, personalReports, expected) {
  const ofGroup = inGroup(group);
  const reports = personalReports.filter(ofGroup);
  const sent = reports.filter((r) => r.sentAt);
  return {
    group: { id: group._id, name: group.name, slug: group.slug },
    expected: expected.filter(ofGroup).length,
    sent: sent.length,
    drafts: reports.length - sent.length,
    totals: sumOf(reports),
    projectsWritten: reports.reduce((n, r) => n + (r.work ?? []).filter((w) => w.text?.trim()).length, 0),
    hours: reports.reduce((n, r) => n + (r.work ?? []).reduce((h, w) => h + (w.hours || 0), 0), 0),
    calls: reports.reduce((n, r) => n + (r.calls ?? []).length, 0),
    issues: reports.filter((r) => r.issues).map((r) => ({ member: r.author?.name ?? '?', text: r.issues })),
  };
}

// The day's bid goals: the member's weekly plan for that day (or the
// monthly one) shared out per day, plus what the days before fell short by.
async function dailyGoals(user, day) {
  const covering = { owner: user._id, scope: 'personal', periodStart: { $lte: day }, periodEnd: { $gt: day } };
  const plan = await Plan.findOne({ ...covering, type: 'weekly' }).lean() ?? await Plan.findOne({ ...covering, type: 'monthly' }).lean();
  if (!plan) return null;
  const reports = await Report.find(
    { author: user._id, scope: 'personal', type: 'daily', periodStart: { $gte: plan.periodStart, $lt: day } },
    'period jobBid bid aiBid resumes forms biddingHours',
  ).lean();
  return goalsOf(plan, day, reports);
}

// What the report form needs besides the report: the author's active
// projects (one box each), their residents (for #tags), the previous
// report's plan for tomorrow, which becomes today's plan, and the day's
// bid goals.
export async function writerContext(user, type, periodKey_) {
  const day = parsePeriod(type, periodKey_).start;
  const [projects, residents, previous, goals] = await Promise.all([
    Task.find({ owner: user._id, status: 'active' }, 'name source price currency priceUnit resident').populate('resident', 'name sharePercent').sort('name').lean(),
    Resident.find({ owner: user._id }, 'name').sort('name').lean(),
    Report.findOne({ author: user._id, scope: 'personal', type, periodStart: { $lt: day } }, 'period planTomorrow').sort({ periodStart: -1 }).lean(),
    dailyGoals(user, day),
  ]);
  return {
    goals,
    projects: projects.map((t) => ({
      id: t._id, name: t.name, source: t.source, priceLabel: formatPrice(t), resident: t.resident?.name ?? null,
      price: t.price, priceUnit: t.priceUnit, currency: t.currency, residentPercent: t.resident?.sharePercent ?? 0,
    })),
    residents: residents.map((r) => ({ id: r._id, name: r.name })),
    previousPlan: previous ? { period: previous.period, items: planLines(previous.planTomorrow) } : null,
  };
}
