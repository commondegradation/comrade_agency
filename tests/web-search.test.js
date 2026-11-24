'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const webSearch = require('../src/main/services/web-search');

const html = `
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example%2Fguide">Guide &amp; <b>reference</b></a>
    <a class="result__snippet">Use <b>the guide</b> for current details.</a>
  </div>
  <div class="result">
    <a class="result__a" href="javascript:alert(1)">Unsafe result</a>
    <a class="result__snippet">This must be discarded.</a>
  </div>`;

test('parseResults extracts safe links and plain-text snippets', () => {
  assert.deepEqual(webSearch.parseResults(html), [{
    title: 'Guide & reference',
    url: 'https://docs.example/guide',
    snippet: 'Use the guide for current details.'
  }]);
});

test('search sends a bounded query to DuckDuckGo and returns citations', async (t) => {
  let requested;
  t.mock.method(global, 'fetch', async (url, options) => {
    requested = { url: new URL(url), options };
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  });

  const result = await webSearch.search('  product documentation  ');
  assert.equal(requested.url.origin, 'https://html.duckduckgo.com');
  assert.equal(requested.url.searchParams.get('q'), 'product documentation');
  assert.equal(requested.options.redirect, undefined);
  assert.match(result, /Guide & reference/);
  assert.match(result, /Source: https:\/\/docs\.example\/guide/);
});

test('search rejects invalid queries before making a request', async () => {
  await assert.rejects(webSearch.search('  '), /cannot be empty/);
  await assert.rejects(webSearch.search('x'.repeat(401)), /400 characters or fewer/);
});

test('search reports remote HTTP errors', async (t) => {
  t.mock.method(global, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(webSearch.search('reference'), /HTTP 503/);
});
