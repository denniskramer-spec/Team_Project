// Names and limits the client shares with the server. Each has a twin there
// (server/src/socket/events.js, utils/uploads.js, routes/chat.js,
// routes/instructions.js, socket/index.js): change both sides together.

// Socket events the screens listen for.
export const EVENTS = {
  CHAT_NEW: 'chat:new',
  CHAT_CHANGED: 'chat:changed',
  CHAT_DELETED: 'chat:deleted',
  CHAT_TYPING: 'chat:typing',
  INSTRUCTION_NEW: 'instruction:new',
  INSTRUCTION_CHANGED: 'instruction:changed',
  INSTRUCTION_DELETED: 'instruction:deleted',
  NAV_CHANGED: 'nav:changed',
  REPORT_CHANGED: 'report:changed',
  PLAN_CHANGED: 'plan:changed',
  INCOME_CHANGED: 'income:changed',
  TASK_CHANGED: 'task:changed',
  DIRECTORY_CHANGED: 'directory:changed',
  PRESENCE_OFFLINE: 'presence:offline',
  SETTINGS_CHANGED: 'settings:changed',
  SECURITY_ALERT: 'security:alert',
};

// Text lengths (routes/chat.js checkContent, routes/instructions.js checkBody).
export const MESSAGE_MAX_CHARS = 2000;
export const INSTRUCTION_MAX_CHARS = 5000;
export const INSTRUCTION_SUBJECT_MAX = 120;

// Image attachments (utils/uploads.js).
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 5;

// "Typing" is sent this often; the server relays at most one every 1500 ms.
export const TYPING_THROTTLE_MS = 2000;

// A direct message's title key names the other person: dm-<userId>.
export const DM_PREFIX = 'dm-';
export const dmTitleKey = (userId) => `${DM_PREFIX}${userId}`;
export const dmPeerId = (titleKey) => titleKey.slice(DM_PREFIX.length);
export const isDmTitleKey = (key) => Boolean(key?.startsWith(DM_PREFIX));
// The name a brand-new DM shows until the server says who it is with.
export const DM_PLACEHOLDER_NAME = 'Direct message';

// Opens the Dashboard with the daily report ready to write.
export const WRITE_REPORT_PATH = '/report?write=1';
