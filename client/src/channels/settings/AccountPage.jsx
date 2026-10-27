import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useAlerts } from '../../alerts/AlertsContext.jsx';
import { useTheme } from '../../theme.js';
import Avatar from '../../components/Avatar.jsx';
import RoleBadge, { ROLE_LABELS } from '../../components/RoleBadge.jsx';
import DateTag from '../../components/DateTag.jsx';
import Icon from '../../components/Icon.jsx';
import ProfileForm from '../../components/ProfileForm.jsx';

// Settings → Account: who you are, your password, the look of the app and
// how it gets your attention. The same things the header menu and the
// Alerts tab offer, gathered in one place.
export default function AccountPage() {
  const { user, logout } = useAuth();
  const { settings, updateSettings, desktopSupported, testSound } = useAlerts();
  const [theme, toggleTheme] = useTheme();
  const [editing, setEditing] = useState(false);

  return (
    <div className="page account-page">
      <section className="card">
        <div className="account-head">
          <Avatar name={user.name} role={user.role} size={56} />
          <div className="account-who">
            <h2>{user.name}</h2>
            <div className="muted small">@{user.username}</div>
            <RoleBadge role={user.role} group={user.group} />
          </div>
          <button className="btn small-btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Edit profile</button>
        </div>
        <dl className="fact-grid">
          <div><dt>Member ID</dt><dd><code>{user.memberId}</code></dd></div>
          <div><dt>Role</dt><dd>{ROLE_LABELS[user.role] ?? user.role}</dd></div>
          <div><dt>Group</dt><dd>{user.group?.name ?? 'None'}</dd></div>
          <div><dt>Birthday</dt><dd>{user.birthday ? <DateTag value={user.birthday} utc muted={false} icon="cake" /> : 'Not set'}</dd></div>
        </dl>
        <p className="muted small">Your group and role are managed by your team leader or admin.</p>
      </section>

      <section className="card">
        <div className="report-section-head"><h3>Security</h3></div>
        <div className="account-row">
          <div>
            <div className="strong">Password</div>
            <div className="muted small">Changing it logs out your other devices.</div>
          </div>
          <Link className="btn small-btn" to="/change-password"><Icon name="key" size={14} /> Change password</Link>
        </div>
      </section>

      <section className="card">
        <div className="report-section-head"><h3>Appearance</h3></div>
        <div className="account-row">
          <div>
            <div className="strong">Theme</div>
            <div className="muted small">{theme === 'dark' ? 'Dark' : 'Light'} is on.</div>
          </div>
          <button className="btn small-btn" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} /> Switch to {theme === 'dark' ? 'light' : 'dark'}</button>
        </div>
      </section>

      <section className="card">
        <div className="report-section-head"><h3>Alerts</h3></div>
        <div className="alert-settings">
          <label className="check">
            <input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} />
            Alarm sound
            {settings.sound && <button className="link small" type="button" onClick={(e) => { e.preventDefault(); testSound(); }}>test</button>}
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.chat} onChange={(e) => updateSettings({ chat: e.target.checked })} />
            Message popups
          </label>
          {desktopSupported && (
            <label className="check">
              <input type="checkbox" checked={settings.desktop} onChange={(e) => updateSettings({ desktop: e.target.checked })} />
              Desktop notifications
            </label>
          )}
          <p className="muted small">Instructions pop up at the top, chat messages in the corner; desktop notifications show both while this window isn't focused.</p>
        </div>
      </section>

      <section className="card">
        <div className="account-row">
          <div>
            <div className="strong">Log out</div>
            <div className="muted small">Ends this session on this device.</div>
          </div>
          <button className="btn danger small-btn" onClick={logout}><Icon name="logout" size={14} /> Log out</button>
        </div>
      </section>

      {editing && <ProfileForm onClose={() => setEditing(false)} />}
    </div>
  );
}
