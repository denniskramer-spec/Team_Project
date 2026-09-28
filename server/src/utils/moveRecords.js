import Task from '../models/Task.js';
import Income from '../models/Income.js';
import Outcome from '../models/Outcome.js';
import Asset from '../models/Asset.js';
import Plan from '../models/Plan.js';
import Report from '../models/Report.js';

// Records carry a copy of their owner's group, which is what bosses' views
// and the group totals are scoped by. When a member moves to another group
// their records follow them, so the new boss sees and manages everything and
// the old boss no longer does.
//
// A boss's group plans and group reports describe the group they were
// written for, so those stay where they are.
export async function moveRecordsToGroup(userId, groupId) {
  const group = groupId ?? null;
  await Promise.all([
    Task.updateMany({ owner: userId }, { group }),
    Asset.updateMany({ owner: userId }, { group }),
    Income.updateMany({ member: userId }, { group }),
    Outcome.updateMany({ member: userId }, { group }),
    Plan.updateMany({ owner: userId, scope: 'personal' }, { group }),
    Report.updateMany({ author: userId, scope: 'personal' }, { group }),
  ]);
}
