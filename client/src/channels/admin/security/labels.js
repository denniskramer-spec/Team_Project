// Words for the security pages: what each log entry means, in plain English.

export const KIND_LABELS = {
  all: 'Everything', view: 'Views', change: 'Changes', delete: 'Deletions', restore: 'Restores', login: 'Logins', failed: 'Failed & refused', admin: 'Admin actions', flagged: 'Flagged',
};
const VERBS = {
  create: 'Added', update: 'Edited', delete: 'Deleted', approve: 'Approved', reject: 'Rejected', upload: 'Uploaded to',
  refresh: 'Refreshed', role: 'Changed role via', group: 'Moved group via', disable: 'Disabled via', enable: 'Enabled via',
  'reset-password': 'Reset password via', read: 'Read', send: 'Sent', nudge: 'Reminded via', 'sign-out': 'Ended sessions via',
  export: 'Exported', view: 'Viewed', restate: 'Re-stated', status: 'Set status via',
};
const FIXED = {
  'auth.login': 'Logged in', 'auth.login.failed': 'Login failed', 'auth.logout': 'Logged out', 'auth.password': 'Changed password',
  'auth.signup': 'Signed up', 'auth.profile': 'Edited profile', 'security.export': 'Exported the security log',
  'security.deleted.view': 'Opened a deleted record', 'security.sign-out': 'Ended sessions of', 'finance.rates.refresh': 'Refreshed exchange rates',
  'security.restore': 'Restored a deleted record', 'security.view': 'Viewed the security log', 'checkout.view': 'Viewed checkout', 'finance.view': 'Viewed finance totals',
};
const RESOURCES = {
  incomes: 'income', outcomes: 'outcome', tasks: 'project', residents: 'resident', 'chat-accounts': 'chat account', members: 'member',
  groups: 'group', reports: 'report', plans: 'plan', instructions: 'instruction', chat: 'message', payments: 'payment fee', users: 'user',
};
const PLURAL = {
  incomes: 'incomes', outcomes: 'outcomes', tasks: 'projects', residents: 'residents', 'chat-accounts': 'chat accounts', members: 'members',
  groups: 'groups', reports: 'reports', plans: 'plans', instructions: 'instructions', chat: 'messages', payments: 'payment fees', users: 'users',
};
export const OPS = { create: 'Added', update: 'Edited', delete: 'Deleted' };

export function actionLabel(action = '') {
  if (FIXED[action]) return FIXED[action];
  const failed = action.endsWith('.failed');
  const [resource, verb] = (failed ? action.slice(0, -7) : action).split('.');
  const what = (verb === 'view' ? PLURAL[resource] : RESOURCES[resource]) ?? resource;
  const label = `${VERBS[verb] ?? verb} ${what}`;
  return failed ? `${label} (refused)` : label;
}

// "Chrome · Linux" from a browser's user-agent string.
export function device(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Other' : '—';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export const when = (value) => new Date(value).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// A field value in a diff, as text.
export const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export const whoOf = (user, username) => user?.name ?? username ?? null;
