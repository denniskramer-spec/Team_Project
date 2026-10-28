import { getIO } from './index.js';
import { roomsFor } from '../utils/chatPolicy.js';

// Real-time notifications that keep every open screen in sync.

// Member list / right panel should reload.
export const directoryChanged = () => getIO()?.emit('directory:changed');

// Channel tree (groups, badges, ...) should reload, for everyone or one user.
export const navChanged = () => getIO()?.emit('nav:changed');
export const navChangedFor = (userId) => getIO()?.to(`user:${userId}`).emit('nav:changed');
// Only the people who approve sign-ups show a pending count.
// An income far from what the reported work expected: the badge of the team
// leader and of the boss of the member's group changes.
export const varianceRaised = (groupId) => getIO()?.to(['role:leader', ...(groupId ? [`group:${groupId}`] : [])]).emit('nav:changed');
export const approvalsChanged = () => getIO()?.to(['role:admin', 'role:leader', 'role:boss']).emit('nav:changed');
// A payment fee changed, by hand or by the daily refresh: fee tables reload.
export const feesChanged = () => getIO()?.emit('fees:changed');
// The team time zone changed: "today" may be another day for everyone.
export const settingsChanged = () => getIO()?.emit('settings:changed');

// A specific user's role, group or status changed: their client reloads
// its session, and their sockets reconnect so they join the right rooms.
export function sessionChanged(userId, { disconnect = false } = {}) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit('session:changed');
  if (disconnect) io.in(`user:${userId}`).disconnectSockets(true);
}

// A direct-message event for one side of the conversation.
export const dmEvent = (event, userId, payload) => getIO()?.to(`user:${userId}`).emit(event, payload);

// Sends a chat event to everyone who can open that chat.
export function chatEvent(event, channel, payload) {
  getIO()?.to(roomsFor(channel)).emit(event, payload);
}

// A report was saved or removed: readers (the leader, admins and the author's
// group) reload their lists.
export function reportChanged(author, report) {
  const io = getIO();
  if (!io) return;
  const rooms = ['role:leader', 'role:admin', `user:${author._id}`];
  const groupId = report.group?._id ?? report.group;
  if (groupId) rooms.push(`group:${groupId}`);
  io.to(rooms).emit('report:changed', { type: report.type, period: report.period });
}

// A plan was saved, re-stated or removed.
export function planChanged(owner, plan) {
  const io = getIO();
  if (!io) return;
  const rooms = ['role:leader', 'role:admin', `user:${owner._id}`];
  const groupId = plan.group?._id ?? plan.group;
  if (groupId) rooms.push(`group:${groupId}`);
  io.to(rooms).emit('plan:changed', { type: plan.type, period: plan.period });
}

// A task or income record changed: the owner, their group, the leader and
// admins reload. Task changes also refresh the channel tree, where task
// names are titles.
function ownerRooms(record, ownerField) {
  const rooms = ['role:leader', 'role:admin', `user:${record[ownerField]?._id ?? record[ownerField]}`];
  const groupId = record.group?._id ?? record.group;
  if (groupId) rooms.push(`group:${groupId}`);
  return rooms;
}

export function taskChanged(task) {
  const io = getIO();
  if (!io) return;
  io.to(ownerRooms(task, 'owner')).emit('task:changed', { id: task._id });
  io.to(ownerRooms(task, 'owner')).emit('nav:changed');
}

// A member's daily work changed (a report was saved, a resident removed):
// their projects reload, but the channel tree is unchanged.
export function taskWorkChanged(owner, group) {
  getIO()?.to(ownerRooms({ owner, group }, 'owner')).emit('task:changed', { owner });
}

export function residentChanged(resident) {
  const io = getIO();
  if (!io) return;
  const rooms = ownerRooms(resident, 'owner');
  io.to(rooms).emit('resident:changed', { id: resident._id });
  // The member directory shows each member's residents in one line, and
  // chat accounts list the residents they talk to by name.
  io.to(rooms).emit('directory:changed');
  io.to(rooms).emit('chatAccount:changed', { resident: resident._id });
}

export function chatAccountChanged(account) {
  getIO()?.to(ownerRooms(account, 'owner')).emit('chatAccount:changed', { id: account._id });
}

export function incomeChanged(income) {
  getIO()?.to(ownerRooms(income, 'member')).emit('income:changed', { id: income._id });
}

// Sends an instruction event to everyone who can see it: its audience,
// plus the leader and admins (who see every group), plus the author.
// Badge counts change too, so their channel tree reloads.
export function instructionEvent(event, instruction, payload) {
  const io = getIO();
  if (!io) return;
  const authorId = String(instruction.author._id ?? instruction.author);
  const rooms = instruction.target === 'all'
    ? ['all']
    : instruction.target === 'member'
      ? [`user:${instruction.recipient._id ?? instruction.recipient}`, 'role:leader', 'role:admin', `user:${authorId}`]
      : [`group:${instruction.group._id ?? instruction.group}`, 'role:leader', 'role:admin', `user:${authorId}`];
  io.to(rooms).emit(event, payload);
  if (event !== 'instruction:changed') io.to(rooms).emit('nav:changed');
}

// An outcome record changed. A team cost has no member, so only its group
// (or, for the whole team, the leader and admins) is told.
export function outcomeChanged(outcome) {
  const rooms = ownerRooms(outcome, 'member').filter((r) => r !== 'user:null' && r !== 'user:undefined');
  getIO()?.to(rooms).emit('outcome:changed', { id: outcome._id });
}
