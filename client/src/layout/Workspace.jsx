import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { load, save } from '../storage.js';
import { useReconnect, useSocketEvent } from '../socket/SocketContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useChatAlerts } from '../alerts/ChatAlertsContext.jsx';
import { useLatestRequest } from '../useLiveData.js';
import Header from './Header.jsx';
import ChannelRail from './ChannelRail.jsx';
import TitleList from './TitleList.jsx';
import ContentArea from './ContentArea.jsx';
import SidePanel from './SidePanel.jsx';
import Footer from './Footer.jsx';
import ReportDue from './ReportDue.jsx';

const LAST_TITLES_KEY = 'bm.lastTitles';
// For members these channels live under Settings; older links still land.
const SETTINGS_ALIASES = { task: 'projects', resident: 'residents', chataccount: 'chataccounts' };
const PANEL_KEY = 'bm.panelOpen';

// The main screen: header + section 1 (channels) + section 2 (titles)
// + section 3 (content) + section 4 (hidden right panel).
// The URL is the source of truth: /:channel/:title
export default function Workspace() {
  const { channel: channelKey, title: titleKey } = useParams();
  const location = useLocation();
  const [channels, setChannels] = useState(null);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => load(PANEL_KEY, false));
  const [navOpen, setNavOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('members');
  const { user } = useAuth();
  const { setCounts } = useChatAlerts() ?? {};

  const track = useLatestRequest();
  const loadNav = useCallback(() => {
    const isLatest = track();
    api('/nav')
      .then((d) => { if (isLatest()) { setChannels(d.channels); setError(''); } })
      .catch((err) => { if (isLatest()) setError(err.message); });
  }, [track]);

  useEffect(() => { loadNav(); }, [loadNav]);
  useReconnect(loadNav);

  // The server emits this when groups, roles or pending sign-ups change.
  // Bursts (a task change sends several) become one reload, spread out a
  // little so every open client doesn't hit the server in the same instant.
  const navTimer = useRef(null);
  useSocketEvent('nav:changed', () => {
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(loadNav, 300 + Math.random() * 700);
  });
  useEffect(() => () => clearTimeout(navTimer.current), []);
  // A message from someone else changes the Chat badge in the rail; a direct
  // message (either way) changes the Direct messages list under Chat.
  useSocketEvent('chat:new', ({ message, dm }) => {
    if (!dm && String(message?.author?.id) === String(user?.id)) return;
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(loadNav, 300 + Math.random() * 700);
  });
  // The tab title and the footer count unread chat messages: channels and
  // direct messages apart.
  useEffect(() => {
    const titles = channels?.find((c) => c.key === 'chat')?.titles ?? [];
    const count = (pick) => titles.filter(pick).reduce((n, t) => n + (t.badge ?? 0), 0);
    setCounts?.({ channels: count((t) => !t.dm), dms: count((t) => t.dm) });
  }, [channels, setCounts]);

  // Close the mobile drawer after navigating.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const togglePanel = () => setPanelOpen((open) => { save(PANEL_KEY, !open); return !open; });

  // The header bell and the footer links open the panel on a tab (and close
  // it again when that tab is already showing).
  const openPanelTab = (tab) => {
    if (panelOpen && panelTab === tab) { setPanelOpen(false); save(PANEL_KEY, false); return; }
    setPanelTab(tab);
    setPanelOpen(true);
    save(PANEL_KEY, true);
  };
  const toggleAlerts = () => openPanelTab('alerts');

  // A direct message that has no messages yet is not in the nav: the
  // conversation is listed from the person it was opened with (sent along in
  // the navigation state), until the first message puts it there for good.
  const channel = useMemo(() => {
    const found = channels?.find((c) => c.key === channelKey);
    if (!found || found.key !== 'chat' || !titleKey?.startsWith('dm-') || found.titles.some((t) => t.key === titleKey)) return found;
    const peer = location.state?.peer;
    const id = titleKey.slice(3);
    if (!/^[0-9a-f]{24}$/.test(id) || (peer && String(peer.id) !== id) || id === String(user?.id)) return found;
    const dm = peer ?? { id, name: 'Direct message', role: 'member', group: null };
    return { ...found, titles: [...found.titles, { key: titleKey, name: dm.name, section: 'Direct messages', dm }] };
  }, [channels, channelKey, titleKey, location.state, user?.id]);
  const title = channel?.titles.find((t) => t.key === titleKey);

  useEffect(() => {
    if (channel && title) save(LAST_TITLES_KEY, { ...load(LAST_TITLES_KEY, {}), [channel.key]: title.key });
  }, [channel, title]);

  if (error && !channels) {
    return (
      <div className="center-screen">
        <div className="auth-card">
          <div className="alert error">{error}</div>
          <button className="btn primary" onClick={loadNav}>Try again</button>
        </div>
      </div>
    );
  }
  if (!channels) return <div className="center-screen muted">Loading workspace...</div>;

  if (!channels.length) return <div className="center-screen muted">No channels are available for your account.</div>;

  // Unknown or missing channel/title: fall back to the last visited or the first one.
  if (!channel && SETTINGS_ALIASES[channelKey] && channels.some((c) => c.key === 'settings')) {
    return <Navigate to={{ pathname: `/settings/${SETTINGS_ALIASES[channelKey]}`, search: location.search }} replace />;
  }
  if (!channel) return <Navigate to={{ pathname: `/${channels[0].key}`, search: location.search }} replace />;
  if (!title) {
    const last = load(LAST_TITLES_KEY, {})[channel.key];
    const fallback = channel.titles.find((t) => t.key === last) || channel.titles[0];
    if (!fallback) return <div className="center-screen muted">{channel.name} has nothing to show yet.</div>;
    return <Navigate to={{ pathname: `/${channel.key}/${fallback.key}`, search: location.search }} replace />;
  }

  return (
    <div className="app">
      <Header channel={channel} title={title} onMenu={() => setNavOpen((o) => !o)} onBell={toggleAlerts} />
      <div className="workspace">
        <nav className={`nav-drawer ${navOpen ? 'open' : ''}`} aria-label="Channels">
          <ChannelRail channels={channels} current={channel.key} />
          <TitleList channel={channel} current={title.key} />
        </nav>
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
        <ContentArea channel={channel} title={title} panelOpen={panelOpen} onTogglePanel={togglePanel} />
        <SidePanel open={panelOpen} onToggle={togglePanel} tab={panelTab} setTab={setPanelTab} />
      </div>
      <Footer onPanel={openPanelTab} panelOpen={panelOpen} panelTab={panelTab} />
      <ReportDue />
    </div>
  );
}
