'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const reminders = require('../src/main/services/reminders');

const now = Date.parse('2025-01-01T00:00:00.000Z');

function create(dueAt = '2025-01-02T09:30:00+03:00', options = {}) {
  return reminders.create({
    title: '  Call the dentist  ',
    dueAt,
    chatId: 'chat-1',
    agentId: 'agent-1',
    ...options
  }, now);
}

test('create requires a valid future ISO timestamp with an explicit timezone', () => {
  const reminder = create();
  assert.equal(reminder.title, 'Call the dentist');
  assert.equal(reminder.dueAt, Date.parse('2025-01-02T06:30:00.000Z'));
  assert.throws(() => create('2025-01-02T09:30:00'), /timezone offset/);
  assert.throws(() => create('2025-02-30T09:30:00+00:00'), /valid date-time/);
  assert.throws(() => create('2024-12-31T23:59:00Z'), /in the future/);
});

test('create validates reminder title and chat ownership fields', () => {
  assert.throws(() => create(undefined, { title: ' ' }), /title/);
  assert.throws(() => create(undefined, { title: 'x'.repeat(201) }), /title/);
  assert.throws(() => create(undefined, { chatId: '' }), /existing chat and agent/);
});

test('list returns pending reminders in time order; cancel and due transitions are one-time', () => {
  const later = create('2025-01-03T09:30:00Z');
  const earlier = create('2025-01-02T09:30:00Z');
  const listed = reminders.list([later, earlier]);
  assert.deepEqual(listed.map((entry) => entry.id), [earlier.id, later.id]);
  assert.equal(listed[0].dueAt, '2025-01-02T09:30:00.000Z');

  const cancelled = reminders.cancel([later, earlier], earlier.id, now);
  assert.equal(cancelled.reminder.status, 'cancelled');
  assert.deepEqual(reminders.list(cancelled.reminders).map((entry) => entry.id), [later.id]);
  assert.throws(() => reminders.cancel(cancelled.reminders, earlier.id), /No pending reminder/);

  const firstDelivery = reminders.markDue([later, earlier], Date.parse('2025-01-02T10:00:00Z'));
  assert.equal(firstDelivery.due.length, 1);
  assert.equal(firstDelivery.due[0].id, earlier.id);
  const secondDelivery = reminders.markDue(firstDelivery.reminders, Date.parse('2025-01-04T00:00:00Z'));
  assert.equal(secondDelivery.due.length, 1);
  assert.equal(secondDelivery.due[0].id, later.id);
  assert.equal(reminders.markDue(secondDelivery.reminders, Date.parse('2025-01-05T00:00:00Z')).due.length, 0);
});
