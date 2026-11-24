'use strict';

const crypto = require('crypto');

const MAX_TITLE_LENGTH = 200;
const MAX_REMINDERS = 1000;
const MAX_FUTURE_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const STATUSES = new Set(['pending', 'fired', 'cancelled']);

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: 'Create a one-time reminder when the user explicitly asks for one. dueAt must be an ISO 8601 date-time with a timezone offset. Ask a clarifying question instead of guessing an ambiguous time.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short text shown in the notification.' },
          dueAt: { type: 'string', description: 'Future ISO 8601 date-time with timezone, e.g. 2026-11-21T18:30:00+03:00.' }
        },
        required: ['title', 'dueAt'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: 'List the user’s pending one-time reminders.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_reminder',
      description: 'Cancel one of the user’s pending reminders by its id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Reminder id returned by list_reminders.' } },
        required: ['id'],
        additionalProperties: false
      }
    }
  }
];

function parseDueAt(value, now = Date.now()) {
  const match = typeof value === 'string' && value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/
  );
  if (!match) throw new Error('Reminder time must be an ISO 8601 date-time with a timezone offset.');

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText || 0);
  const offsetHour = Number(offsetHourText || 0);
  const offsetMinute = Number(offsetMinuteText || 0);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || hour > 23 || minute > 59 || second > 59 || offsetHour > 14
    || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
    throw new Error('Reminder time is not a valid date-time.');
  }

  const dueAt = Date.parse(value);
  if (!Number.isFinite(dueAt)) throw new Error('Reminder time is not a valid date-time.');
  const offset = zone === 'Z' ? 0 : (sign === '+' ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  const local = new Date(dueAt + offset * 60 * 1000);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() + 1 !== month
    || local.getUTCDate() !== day || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second) {
    throw new Error('Reminder time is not a valid date-time.');
  }
  if (dueAt <= now) throw new Error('Reminder time must be in the future.');
  if (dueAt - now > MAX_FUTURE_MS) throw new Error('Reminder time must be within five years.');
  return dueAt;
}

function create({ title, dueAt, chatId, agentId } = {}, now = Date.now(), reminders = []) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || cleanTitle.length > MAX_TITLE_LENGTH) {
    throw new Error(`Reminder title must contain 1-${MAX_TITLE_LENGTH} characters.`);
  }
  if (typeof chatId !== 'string' || !chatId || typeof agentId !== 'string' || !agentId) {
    throw new Error('A reminder must be linked to an existing chat and agent.');
  }
  if (normalize(reminders).filter((reminder) => reminder.status === 'pending').length >= MAX_REMINDERS) {
    throw new Error('The reminder limit has been reached.');
  }
  return {
    id: crypto.randomBytes(16).toString('hex'),
    title: cleanTitle,
    dueAt: parseDueAt(dueAt, now),
    chatId,
    agentId,
    createdAt: now,
    status: 'pending'
  };
}

function normalize(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((reminder) => reminder && typeof reminder.id === 'string'
      && typeof reminder.title === 'string' && Number.isFinite(reminder.dueAt)
      && Number.isFinite(reminder.createdAt) && typeof reminder.chatId === 'string'
      && typeof reminder.agentId === 'string' && STATUSES.has(reminder.status))
    .slice(-MAX_REMINDERS)
    .map((reminder) => ({
      ...reminder,
      title: reminder.title.trim().slice(0, MAX_TITLE_LENGTH)
    }));
}

function toPublic(reminder) {
  return { ...reminder, dueAt: new Date(reminder.dueAt).toISOString() };
}

function list(reminders) {
  return normalize(reminders)
    .filter((reminder) => reminder.status === 'pending')
    .sort((a, b) => a.dueAt - b.dueAt)
    .map(toPublic);
}

function cancel(reminders, id, now = Date.now()) {
  let cancelled = null;
  const updated = normalize(reminders).map((reminder) => {
    if (reminder.id !== id || reminder.status !== 'pending') return reminder;
    cancelled = { ...reminder, status: 'cancelled', cancelledAt: now };
    return cancelled;
  });
  if (!cancelled) throw new Error('No pending reminder found with that id.');
  return { reminders: updated, reminder: toPublic(cancelled) };
}

function markDue(reminders, now = Date.now()) {
  const due = [];
  const updated = normalize(reminders).map((reminder) => {
    if (reminder.status !== 'pending' || reminder.dueAt > now) return reminder;
    const fired = { ...reminder, status: 'fired', firedAt: now };
    due.push(fired);
    return fired;
  });
  return { reminders: updated, due };
}

module.exports = {
  MAX_FUTURE_MS,
  MAX_REMINDERS,
  MAX_TITLE_LENGTH,
  TOOLS,
  cancel,
  create,
  list,
  markDue,
  normalize,
  toPublic
};
