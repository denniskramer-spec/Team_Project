// Who may manage whom. Used by the member and admin routes, and sent to the
// client as per-row permissions so the UI only shows allowed actions.
//
//   admin  -> everyone except themselves (for role/status changes)
//   leader -> bosses and members
//   boss   -> members of their own group
//   member -> nobody

const sameGroup = (a, b) => Boolean(a.group && b.group && String(a.group._id ?? a.group) === String(b.group._id ?? b.group));
const isSelf = (a, b) => String(a._id) === String(b._id);

export function canManage(actor, target) {
  if (actor.role === 'admin') return true;
  if (actor.role === 'leader') return ['boss', 'member'].includes(target.role);
  if (actor.role === 'boss') return target.role === 'member' && sameGroup(actor, target);
  return false;
}

export function permissionsFor(actor, target) {
  const manage = canManage(actor, target);
  const self = isSelf(actor, target);
  return {
    edit: manage || self,
    changeGroup: manage && ['admin', 'leader'].includes(actor.role),
    resetPassword: manage && !self,
    disable: manage && !self && ['admin', 'leader'].includes(actor.role),
    changeRole: actor.role === 'admin' && !self,
  };
}

// Pending sign-ups an approver may see: bosses only get their own group's.
export function pendingFilter(actor) {
  if (actor.role === 'admin' || actor.role === 'leader') return { status: 'pending' };
  if (actor.role === 'boss' && actor.group) return { status: 'pending', group: actor.group };
  return null;
}
