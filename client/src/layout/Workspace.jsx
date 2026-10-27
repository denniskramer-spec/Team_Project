import { useCallback, useEffect, useRef, useState } from 'react';
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
  // The direct message open in the side panel, if any.
  const [thread, setThread] = useState(null);
  const { user } = useAuth();
  const { setCounts, setPanelApi } = useChatAlerts() ?? {};

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
  // A message from someone else changes the Chat badge in the rail.
  useSocketEvent('chat:new', ({ message, dm }) => {
    if (dm || String(message?.author?.id) === String(user?.id)) return;
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(loadNav, 300 + Math.random() * 700);
  });
  // The tab title counts unread chat messages.
  useEffect(() => {
    setCounts?.({ channels: channels?.find((c) => c.key === 'chat')?.badge ?? 0 });
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

  // A message popup opens its conversation in the panel's Messages tab.
  useEffect(() => {
    setPanelApi?.({
      openThread: (peer) => { setThread(peer); setPanelTab('messages'); setPanelOpen(true); save(PANEL_KEY, true); },
    });
  }, [setPanelApi]);

  const channel = channels?.find((c) => c.key === channelKey);
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
          <ChannelRail channels={channels} current={channel.key} compact={user?.role === 'member'} />
          <TitleList channel={channel} current={title.key} />
        </nav>
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
        <ContentArea channel={channel} title={title} panelOpen={panelOpen} onTogglePanel={togglePanel} />
        <SidePanel open={panelOpen} onToggle={togglePanel} tab={panelTab} setTab={setPanelTab} thread={thread} setThread={setThread} />
      </div>
      <Footer onPanel={openPanelTab} panelOpen={panelOpen} panelTab={panelTab} />
      <ReportDue />
    </div>
  );
}
