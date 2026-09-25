import Icon from '../components/Icon.jsx';

// What each channel will contain, shown until that channel is built.
const PLANNED = {
  instruction: { step: 5, text: 'Instructions from the team leader and bosses, with read receipts and live alerts.' },
  report: { step: 7, text: 'Report forms (bid, task, income, upcoming, note) and past reports.' },
  plan: { step: 8, text: 'Daily, weekly and monthly plans, each marked done, in progress or not done.' },
  checkout: { step: 10, text: 'Weekly, monthly and yearly results as bar charts, from plans, reports, tasks and finance.' },
  task: { step: 9, text: 'Task sign-up: owner, name, period and salary.' },
  member: { step: 4, text: 'Member directory with name, ID, birthday and group, plus adding members.' },
  finance: { step: 9, text: 'Income records: date, amount and source, with totals.' },
  chat: { step: 6, text: 'Real-time chat, like Discord.' },
  admin: { step: 4, text: 'Approve sign-ups, manage roles and groups.' },
};

export default function Placeholder({ channel, title }) {
  const plan = PLANNED[channel.key];
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={channel.icon} size={36} /></span>
      <h3>{channel.name} · {title.name}</h3>
      <p className="muted">{plan?.text}</p>
      {plan && <span className="step-chip">Coming in Step {plan.step}</span>}
    </div>
  );
}
