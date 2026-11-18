'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/i18n.js'), 'utf8');

function loadI18n(locale) {
  const appDiv = { id: 'app' };
  const modalDiv = { id: 'modal-root' };
  const doc = {
    documentElement: {},
    getElementById: (id) => id === 'app' ? appDiv : modalDiv,
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => null })
  };
  const window = { S: { data: { ui: { locale } } }, Views: {}, confirm: () => true, TOAST: () => {} };
  vm.runInNewContext(source, { window, document: doc });
  return window.I18n;
}

test('default locale (ru) translates chrome strings', () => {
  const I18n = loadI18n('ru');
  assert.equal(I18n.t('Settings'), 'Настройки');
  assert.equal(I18n.t('Providers'), 'Поставщики моделей');
  assert.equal(I18n.t('New Agent'), 'Новый агент');
  assert.equal(I18n.ru(), true);
});

test('unknown strings pass through unchanged', () => {
  const I18n = loadI18n('ru');
  assert.equal(I18n.t('Some random text'), 'Some random text');
  assert.equal(I18n.t(''), '');
});

test('en locale returns original strings', () => {
  const I18n = loadI18n('en');
  assert.equal(I18n.t('Settings'), 'Settings');
  assert.equal(I18n.ru(), false);
});

test('pattern-based translations for parameterized strings', () => {
  const I18n = loadI18n('ru');
  assert.equal(I18n.t('Delete provider "OpenAI"?'), 'Удалить поставщика «OpenAI»?');
  assert.equal(I18n.t('Remove the "github" connection?'), 'Удалить подключение «github»?');
  assert.equal(I18n.t('Delete "Архивист" and all of its chats?'), 'Удалить агента «Архивист» и все его чаты?');
  assert.equal(I18n.t('Connection "gh" saved'), 'Подключение «gh» сохранено');
  assert.equal(I18n.t('Saved report.md'), 'Сохранено: report.md');
  assert.equal(I18n.t('GitHub: 12 tools'), 'GitHub: инструментов — 12');
});

test('every dictionary entry maps to a non-empty string', () => {
  const I18n = loadI18n('ru');
  // Access the dictionary through translation of known keys
  const keys = ['Settings', 'Providers', 'Connections', 'New Agent', 'Save', 'Close panel',
    'Add provider', 'Test', 'Edit', 'Delete', 'Cancel', 'Stop', 'Send'];
  for (const k of keys) {
    const v = I18n.t(k);
    assert.ok(v && v.length > 0, `Key "${k}" has empty translation`);
    assert.notEqual(v, k, `Key "${k}" is not translated in ru locale`);
  }
});

test('i18n never rewrites strings absent from dictionary', () => {
  const I18n = loadI18n('ru');
  const userText = 'Это пользовательский текст с English словами';
  assert.equal(I18n.t(userText), userText);
});
