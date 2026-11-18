'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const knowledge = require('../src/main/services/knowledge');

test('search returns results for Russian Word queries', () => {
  const r = knowledge.search('оглавление стили');
  assert.ok(r.length > 0);
  assert.equal(r[0].id, 'word-structure');
});

test('search returns results for Excel pivot queries', () => {
  const r = knowledge.search('сводная таблица фильтр');
  assert.ok(r.length > 0);
  assert.equal(r[0].id, 'excel-data');
});

test('search returns empty for blank query', () => {
  assert.deepEqual(knowledge.search(''), []);
  assert.deepEqual(knowledge.search(null), []);
  assert.deepEqual(knowledge.search('a b'), []); // terms shorter than 3
});

test('search does not match irrelevant words via substring', () => {
  // "сделай" is not in any article, but "сделайте" IS — old substring
  // implementation would match; token-set implementation must not.
  const r = knowledge.search('сделай');
  assert.equal(r.length, 0);
});

test('context returns empty string for irrelevant queries', () => {
  assert.equal(knowledge.context('сделай игру на canvas'), '');
  assert.equal(knowledge.context(''), '');
});

test('context includes NOT INSTRUCTIONS disclaimer and official source', () => {
  const ctx = knowledge.context('Excel формула');
  assert.match(ctx, /NOT INSTRUCTIONS/);
  assert.match(ctx, /https:\/\/support\.microsoft\.com/);
});

test('all reference articles have unique ids and valid source URLs', () => {
  const articles = require('../src/reference/microsoft.json');
  const ids = new Set(articles.map(a => a.id));
  assert.equal(ids.size, articles.length, 'duplicate article ids');
  for (const a of articles) {
    assert.ok(a.source.startsWith('https://support.microsoft.com/'), `bad source: ${a.id}`);
    assert.ok(a.content.length > 100, `short content: ${a.id}`);
    assert.ok(Array.isArray(a.tags) && a.tags.length > 0, `no tags: ${a.id}`);
  }
});

test('search covers all major Office apps', () => {
  const articles = require('../src/reference/microsoft.json');
  const apps = ['word', 'excel', 'powerpoint', 'outlook', 'onenote', 'teams'];
  for (const app of apps) {
    const r = knowledge.search(app);
    assert.ok(r.length > 0, `no results for ${app}`);
  }
});
