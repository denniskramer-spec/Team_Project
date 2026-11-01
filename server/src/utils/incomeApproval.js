// Income a member records for themselves is a claim until the team leader
// approves it: it is listed (marked pending) but counts nowhere, not in
// totals, charts, plans, checkout or a project's paid amount, and it does
// not settle the reported work. Income a boss or the leader records is real
// at once. A rejected record stays as history and never counts.
// Records from before approvals existed have no status and count.

export const INCOME_STATUSES = ['pending', 'approved', 'rejected'];

// The filter every sum of income uses.
export const REAL_INCOME = { status: { $nin: ['pending', 'rejected'] } };

export const isRealIncome = (i) => !['pending', 'rejected'].includes(i?.status);

// Who records income that waits for approval.
export const needsApproval = (user) => user?.role === 'member';

// Only the team leader approves or rejects.
export const canApproveIncome = (user) => user?.role === 'leader';
