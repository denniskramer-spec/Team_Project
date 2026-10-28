// Checking a new income record against what the project's reported work
// expected. The reports price the hours (or tasks) the member wrote down at
// the project's price, minus the resident's share: the member's share of the
// work, before any payment fee. So the income is compared on the same
// footing: the amount received minus the resident's share, fee ignored.
// More than VARIANCE_LIMIT apart, the member has to say why, and the team
// leader and the member's boss are told.

export const VARIANCE_LIMIT = 5; // percent

// Who is told and checks it off: the team leader, and the boss of the
// member's group (the usual scope rules decide which records they see).
export const canCheckVariance = (user) => ['leader', 'boss'].includes(user?.role);

const cents = (n) => Math.round(n * 100) / 100;

// { share, percent, outside }:
//   share     the member's share of `amount` (after the resident's share)
//   percent   how far `share` is from `expected`, signed, one decimal
//   outside   whether that is more than VARIANCE_LIMIT
// Nothing to compare (no expected amount) gives percent null.
export function varianceOf(amount, residentPercent, expected) {
  const share = cents((Number(amount) || 0) * (1 - (Number(residentPercent) || 0) / 100));
  if (!(expected > 0)) return { share, percent: null, outside: false };
  const percent = Math.round(((share - expected) / expected) * 1000) / 10;
  return { share, percent, outside: Math.abs(percent) > VARIANCE_LIMIT };
}

// The full amount to record so that the member's share comes to `expected`
// (what "Use amount" fills in).
export const grossFor = (expected, residentPercent) => {
  const keep = 1 - (Number(residentPercent) || 0) / 100;
  return keep > 0 ? cents(expected / keep) : cents(expected);
};
