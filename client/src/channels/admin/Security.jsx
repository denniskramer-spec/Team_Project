import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Overview from './security/Overview.jsx';
import ActivityLog from './security/ActivityLog.jsx';
import DeletedRecords from './security/DeletedRecords.jsx';
import Sessions from './security/Sessions.jsx';

// Admin → Security: who did what, when and from where. Three parts: the
// numbers for the last day and week, the security log itself (every login,
// every look at the data and every change with the fields that changed,
// filterable and exportable), and the records people deleted, kept whole
// and restorable. Plus the means to end an account's sessions.

const TABS = [['log', 'Security log'], ['deleted', 'Deleted records'], ['sessions', 'Sessions']];

export default function Security() {
  const [tab, setTab] = useState('log');
  return (
    <div className="page">
      <div className="toolbar">
        <div className="page-title">
          <h2>Security</h2>
          <span className="muted small">Who accessed the team's data, when, from where, and what changed. Admins and the team leader only.</span>
        </div>
        <div className="segmented toolbar-right" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </div>
      <Overview />
      <div className="note">
        <Icon name="shield" size={16} />
        <span>
          The log and the deleted records are <strong>append-only</strong>: nothing in the app can change or remove an entry, and the data layer refuses any attempt. Every record that is deleted is copied here first, whichever screen did it, and can be <strong>restored</strong>. Anyone working on the database directly, outside the app (MongoChef, a shell...), is recorded with their address and program and marked <strong>outside app</strong>; records they delete are kept too. Edits are kept field by field, old value and new. Passwords are never written down. Logins from an address an account has never used are marked <strong>new address</strong>.
        </span>
      </div>
      {/* All three stay mounted: switching tabs keeps filters, search and loaded pages. */}
      <div hidden={tab !== 'log'}><ActivityLog /></div>
      <div hidden={tab !== 'deleted'}><DeletedRecords /></div>
      <div hidden={tab !== 'sessions'}><Sessions /></div>
    </div>
  );
}
