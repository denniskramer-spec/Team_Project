import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';

// Where a daily report stands, and how its status pill reads.
export const stateOf = (report) => (report?.sentAt ? 'sent' : report ? 'draft' : 'missing');
export const STATE_PILL = { sent: ['active', 'Sent'], draft: ['pending', 'Draft'], missing: ['disabled', 'Missing'] };

// Today's plan: the report's own, or (before it has one) what the previous
// report planned for today.
export const planOf = (report, previousPlan) => (report?.todayPlan?.length
  ? report.todayPlan
  : (previousPlan?.items ?? []).map((text) => ({ text, done: false })));

// Ticking today's plan, from the Dashboard or the side panel. The list on
// screen changes at once and each tick is saved from it, so a second quick
// tick builds on the first instead of on the server's older copy; a failed
// save puts the list back. A newer copy from the server replaces it.
//   serverPlan  the plan as last loaded
//   period      the day's key ('' = today on the server)
export function useTodayPlan(serverPlan, period = '') {
  const toast = useToast();
  const [plan, setPlan] = useState(serverPlan);
  const current = useRef(serverPlan);
  const pending = useRef(0);
  useEffect(() => {
    // A reload landing while ticks are on their way would undo them on screen.
    if (pending.current) return;
    current.current = serverPlan;
    setPlan(serverPlan);
  }, [serverPlan]);

  const toggle = async (i) => {
    const before = current.current;
    const next = before.map((p, n) => (n === i ? { ...p, done: !p.done } : p));
    current.current = next;
    setPlan(next);
    pending.current += 1;
    try {
      await api('/reports', { method: 'PUT', body: { type: 'daily', scope: 'personal', ...(period ? { period } : {}), todayPlan: next } });
    } catch (err) {
      // Only this tick is undone; later ones stay.
      current.current = current.current.map((p, n) => (n === i ? { ...p, done: before[i].done } : p));
      setPlan(current.current);
      toast.error(err.message);
    } finally {
      pending.current -= 1;
    }
  };
  return [plan, toggle];
}
