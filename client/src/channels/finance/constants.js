// Limits and sizes the Finance pages share. The first three mirror the
// server (server/src/utils/finance.js and utils/validate.js); /finance/rates
// also sends them as `limits`, which wins when it is there.
export const MAX_RANGE_DAYS = 5 * 366; // a Duration is at most five years
export const REASON_MAX = 120;         // an outcome's reason
export const NOTE_MAX = 2000;          // an income note, an outcome comment
// More items than this and a hover card only summarises; a click opens the full list.
export const TOOLTIP_LIMIT = 8;
