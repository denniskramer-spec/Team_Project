import { formatAmount } from '../../format.js';

// The bid items that can have a daily goal, in the order of the bid report.
export const GOAL_LABELS = {
  jobBid: 'Applied', aiBid: 'AI training bids', resumes: 'Résumés tailored', forms: 'Forms filled', biddingHours: 'Time bidding (h)',
};

// Where a day stands against its goal.
export function goalState(goal, done) {
  const n = Number(done) || 0;
  const left = Math.round((goal.goal - n) * 100) / 100;
  return { done: n, left, met: left <= 0 };
}

// One line under a bid input: the goal, what was carried over, and what is
// still to do (which moves to tomorrow).
export function GoalHint({ goal, value }) {
  if (!goal) return null;
  const { left, met } = goalState(goal, value);
  return (
    <span className={`goal-hint ${met ? 'is-met' : ''}`}>
      goal {formatAmount(goal.goal)}
      {goal.carry > 0 && <span className="muted"> · {formatAmount(goal.carry)} carried over</span>}
      {met ? ' · met' : ` · ${formatAmount(left)} to tomorrow`}
    </span>
  );
}

// Today's goals at a glance: one bar per planned item.
export default function BidGoals({ goals, report }) {
  if (!goals) return null;
  const keys = Object.keys(GOAL_LABELS).filter((k) => goals.items[k]);
  return (
    <ul className="goal-list" aria-label="Today's goals">
      {keys.map((key) => {
        const goal = goals.items[key];
        const { done, left, met } = goalState(goal, report?.[key]);
        return (
          <li key={key} className={met ? 'is-met' : ''}>
            <div className="goal-row">
              <span className="goal-name">{GOAL_LABELS[key]}</span>
              <span className="goal-nums"><strong>{formatAmount(done)}</strong> <span className="muted">/ {formatAmount(goal.goal)}</span></span>
            </div>
            <div className="goal-bar" role="img" aria-label={`${formatAmount(done)} of ${formatAmount(goal.goal)}`}>
              <span style={{ width: `${Math.min(100, (done / goal.goal) * 100)}%` }} />
            </div>
            <div className="muted small goal-note">
              {goal.carry > 0 ? `${formatAmount(goal.base)} planned + ${formatAmount(goal.carry)} left from before` : `${formatAmount(goal.base)} planned per day`}
              {met ? ' · met' : ` · ${formatAmount(left)} goes to tomorrow`}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
