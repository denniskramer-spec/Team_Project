import { lazy, Suspense } from 'react';
import Placeholder from './Placeholder.jsx';

// A tab left open across a new release asks for chunk files that are gone:
// the page reloads once to get the new ones.
const RELOADED = 'bm.chunkReload';
const page = (load) => lazy(() => load().then((m) => {
  try { sessionStorage.removeItem(RELOADED); } catch { /* storage blocked */ }
  return m;
}, (err) => {
  let first = true;
  try { first = !sessionStorage.getItem(RELOADED); sessionStorage.setItem(RELOADED, '1'); } catch { /* storage blocked */ }
  if (first) window.location.reload();
  throw err;
}));

// Maps a channel key to the component that renders section 3.
// Each later step registers its channel here. Each channel is its own
// chunk, loaded the first time it is opened, so the first page loads less.
const REGISTRY = {
  instruction: page(() => import('./instruction/InstructionChannel.jsx')),
  member: page(() => import('./member/MemberChannel.jsx')),
  report: page(() => import('./report/ReportChannel.jsx')),
  plan: page(() => import('./plan/PlanChannel.jsx')),
  task: page(() => import('./task/TaskChannel.jsx')),
  finance: page(() => import('./finance/FinanceChannel.jsx')),
  checkout: page(() => import('./checkout/CheckoutChannel.jsx')),
  resident: page(() => import('./resident/ResidentChannel.jsx')),
  chataccount: page(() => import('./chataccount/ChatAccountChannel.jsx')),
  chat: page(() => import('./chat/ChatChannel.jsx')),
  admin: page(() => import('./admin/AdminChannel.jsx')),
  // A member's account and own records in one place.
  settings: page(() => import('./settings/SettingsChannel.jsx')),
};

export default function ChannelContent({ channel, title }) {
  const Component = REGISTRY[channel.key] || Placeholder;
  // key resets the page's state when switching titles.
  return (
    <Suspense fallback={<p className="muted small">Loading...</p>}>
      <Component key={`${channel.key}/${title.key}`} channel={channel} title={title} />
    </Suspense>
  );
}
