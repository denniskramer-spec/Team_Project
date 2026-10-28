import { canManageFor } from './visibility.js';
import { imageUrl } from './fileRefs.js';

// How a resident is shown: the record for the Residents channel and the
// one-line sentence the Member directory lists under each member.

export const LAPTOP_LABELS = { bought: 'Bought for them', own: 'Already had one' };
export const ACCESS_LABELS = { laptop: 'Laptop', vps: 'VPS', proxy: 'Proxy' };

// The whole resident as one sentence.
export const residentSentence = (r) => [
  r.name,
  r.age !== null && r.age !== undefined ? `${r.age} years old` : null,
  r.country || null,
  r.hasLaptop ? (r.laptopSource === 'bought' ? 'laptop bought for them' : 'has a laptop') : null,
  r.accessSetUp ? `access set up${r.accessType ? ` via ${ACCESS_LABELS[r.accessType]}` : ''}` : null,
  r.sharePercent ? `${r.sharePercent}% share` : null,
].filter(Boolean).join(', ');

export const serializeResident = (r, user) => ({
  id: r._id,
  name: r.name,
  photo: imageUrl(r.photo),
  country: r.country,
  citizenship: r.citizenship,
  age: r.age ?? null,
  source: r.source,
  firstContact: r.firstContact,
  firstContactVia: r.firstContactVia,
  hasLaptop: r.hasLaptop,
  laptopSource: r.laptopSource ?? '',
  accessSetUp: r.accessSetUp,
  accessType: r.accessType ?? '',
  sharePercent: r.sharePercent ?? 0,
  notes: r.notes,
  owner: r.owner?._id ? { id: r.owner._id, name: r.owner.name, role: r.owner.role } : null,
  group: r.group?._id ? { id: r.group._id, name: r.group.name, slug: r.group.slug } : null,
  sentence: residentSentence(r),
  createdAt: r.createdAt,
  canEdit: canManageFor(user, { _id: r.owner?._id ?? r.owner, group: r.group?._id ?? r.group }),
});
