import test from 'node:test';
import assert from 'node:assert/strict';
import { canBuzzChannel, canFlagOffTopic, checkEmoji } from '../src/utils/chatPolicy.js';

const admin = { _id: 'admin1', role: 'admin' };
const leader = { _id: 'lead1', role: 'leader' };
const boss = { _id: 'boss1', role: 'boss' };
const member = { _id: 'mem1', role: 'member' };

test('a whole channel is shaken by the leader, bosses and admins only', () => {
  assert.ok(canBuzzChannel(leader));
  assert.ok(canBuzzChannel(boss));
  assert.ok(canBuzzChannel(admin));
  assert.ok(!canBuzzChannel(member));
});

test('flagging a message as not work', () => {
  const inGroup = { channelKey: 'group:g1', author: 'mem1', deletedAt: null };
  assert.ok(canFlagOffTopic(boss, inGroup));
  assert.ok(canFlagOffTopic(leader, inGroup));
  assert.ok(canFlagOffTopic(admin, inGroup));
  assert.ok(!canFlagOffTopic(member, inGroup), 'members cannot flag');
  assert.ok(!canFlagOffTopic(boss, { ...inGroup, author: 'boss1' }), 'nor anyone their own message');
  assert.ok(!canFlagOffTopic(boss, { ...inGroup, author: { _id: 'boss1' } }), 'populated author');
  assert.ok(!canFlagOffTopic(leader, { ...inGroup, channelKey: 'dm:a:b' }), 'direct messages are private');
  assert.ok(!canFlagOffTopic(leader, { ...inGroup, deletedAt: new Date() }), 'deleted messages are left alone');
});

test('a reaction is one emoji', () => {
  for (const e of ['👍', '👍🏽', '❤️', '👨‍👩‍👧', '🇧🇷', '1️⃣', '#️⃣', ' 🎉 ']) {
    assert.equal(checkEmoji(e), e.trim(), e);
  }
});

test('text is not a reaction', () => {
  for (const e of ['', ' ', 'abc', '1', '#', '<b>', '👍 hi', 'ok👍', '👍'.repeat(9), null, undefined, 5, {}]) {
    assert.throws(() => checkEmoji(e), /Pick an emoji/, JSON.stringify(e));
  }
});
