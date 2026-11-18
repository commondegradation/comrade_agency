'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./helpers/mock-electron');

const { restore } = install();
const avatar = require('../src/main/services/avatar');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a small valid PNG for testing
function makeTmpPng(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'));
  const file = path.join(dir, 'test.png');
  fs.writeFileSync(file, Buffer.alloc(bytes, 0x89));
  return file;
}

test('fromFile returns data URL for valid image under 8MB', () => {
  const file = makeTmpPng(1024);
  const result = avatar.fromFile(file);
  assert.match(result, /^data:image\/png;base64,/);
});

test('fromFile rejects files over 8MB', () => {
  const file = makeTmpPng(9 * 1024 * 1024);
  assert.throws(() => avatar.fromFile(file), /8 МБ/);
});

test('fromFile rejects empty buffer (unsupported image)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'));
  const file = path.join(dir, 'empty.png');
  fs.writeFileSync(file, '');
  assert.throws(() => avatar.fromFile(file), /изображением/);
});

restore();
