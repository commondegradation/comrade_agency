'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mcp = require('../src/main/services/mcp');

// ─── safeName ────────────────────────────────────────────────────────────────

test('safeName keeps only allowed characters', () => {
  assert.equal(mcp.safeName('get_user-info_1'), 'get_user-info_1');
  assert.equal(mcp.safeName('tool name'), 'tool_name');
  assert.equal(mcp.safeName('a/b:c'), 'a_b_c');
});

test('safeName truncates to 48 chars', () => {
  const long = 'a'.repeat(60);
  assert.equal(mcp.safeName(long).length, 48);
});

test('safeName returns "tool" for empty/null input', () => {
  assert.equal(mcp.safeName(''), 'tool');
  assert.equal(mcp.safeName(null), 'tool');
  assert.equal(mcp.safeName(undefined), 'tool');
});

// ─── shortHash ───────────────────────────────────────────────────────────────

test('shortHash is stable and base36', () => {
  const h = mcp.shortHash('conn-1');
  assert.equal(h, mcp.shortHash('conn-1'));
  assert.match(h, /^[0-9a-z]+$/);
});

test('shortHash differs for different ids', () => {
  assert.notEqual(mcp.shortHash('a'), mcp.shortHash('b'));
});

// ─── flattenInputSchema ──────────────────────────────────────────────────────

test('flattenInputSchema returns valid schema for null/undefined', () => {
  const r = mcp.flattenInputSchema(null);
  assert.equal(r.type, 'object');
  assert.deepEqual(r.properties, {});
});

test('flattenInputSchema preserves required and additionalProperties', () => {
  const r = mcp.flattenInputSchema({ type: 'object', properties: { x: { type: 'string' } }, required: ['x'], additionalProperties: false });
  assert.deepEqual(r.required, ['x']);
  assert.equal(r.additionalProperties, false);
});

// ─── toolsForConnections ─────────────────────────────────────────────────────

test('toolsForConnections returns empty for null/undefined args', () => {
  assert.equal(mcp.toolsForConnections(null, null).tools.length, 0);
  assert.equal(mcp.toolsForConnections(undefined, undefined).tools.length, 0);
});

test('toolsForConnections skips disabled connections', () => {
  const conns = [{ id: 'x', enabled: false, tools: [{ name: 'a', description: 'A', inputSchema: {} }] }];
  assert.equal(mcp.toolsForConnections(conns, ['x']).tools.length, 0);
});

test('toolsForConnections skips connections not in agent list', () => {
  const conns = [{ id: 'x', enabled: true, tools: [{ name: 'a', description: 'A', inputSchema: {} }] }];
  assert.equal(mcp.toolsForConnections(conns, ['other']).tools.length, 0);
});

test('toolsForConnections returns correct OpenAI function format', () => {
  const conn = { id: 'c1', title: 'GitHub', enabled: true, tools: [{ name: 'search', description: 'Search repos', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }] };
  const { tools, map } = mcp.toolsForConnections([conn], ['c1']);
  assert.equal(tools.length, 1);
  const fn = tools[0].function;
  assert.match(fn.name, /^mcp_search_/);
  assert.match(fn.description, /GitHub: Search repos/);
  assert.equal(fn.parameters.required[0], 'q');
  // map routes exposed name back to connection+tool
  assert.equal(map[fn.name].connectionId, 'c1');
  assert.equal(map[fn.name].toolName, 'search');
});

test('toolsForConnections caps at 40 tools per connection', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ name: `t${i}`, description: '', inputSchema: {} }));
  const conn = { id: 'c1', title: 'Big', enabled: true, tools: many };
  const { tools } = mcp.toolsForConnections([conn], ['c1']);
  assert.equal(tools.length, 40);
});

test('toolsForConnections truncates description to 900 chars', () => {
  const longDesc = 'x'.repeat(1000);
  const conn = { id: 'c1', title: 'T', enabled: true, tools: [{ name: 'a', description: longDesc, inputSchema: {} }] };
  const { tools } = mcp.toolsForConnections([conn], ['c1']);
  assert.equal(tools[0].function.description.length, 900);
});

// ─── parseArguments ──────────────────────────────────────────────────────────

test('parseArguments returns {} for null/undefined/empty', () => {
  assert.deepEqual(mcp.parseArguments(null), {});
  assert.deepEqual(mcp.parseArguments(undefined), {});
  assert.deepEqual(mcp.parseArguments(''), {});
});

test('parseArguments passes through objects unchanged', () => {
  const obj = { key: 'val' };
  assert.equal(mcp.parseArguments(obj), obj);
});

test('parseArguments parses valid JSON string', () => {
  assert.deepEqual(mcp.parseArguments('{"a":1}'), { a: 1 });
});

test('parseArguments wraps non-object JSON in {value}', () => {
  assert.deepEqual(mcp.parseArguments('42'), { value: 42 });
  assert.deepEqual(mcp.parseArguments('"str"'), { value: 'str' });
});

test('parseArguments wraps invalid JSON in {raw}', () => {
  assert.deepEqual(mcp.parseArguments('not json'), { raw: 'not json' });
});

// ─── stringifyResult ─────────────────────────────────────────────────────────

test('stringifyResult handles null/undefined', () => {
  assert.equal(mcp.stringifyResult(null), '(empty result)');
  assert.equal(mcp.stringifyResult(undefined), '(empty result)');
});

test('stringifyResult passes strings through', () => {
  assert.equal(mcp.stringifyResult('hello'), 'hello');
});

test('stringifyResult truncates to 24000 chars', () => {
  const long = 'a'.repeat(30000);
  assert.equal(mcp.stringifyResult(long).length, 24000);
});

test('stringifyResult serializes objects', () => {
  const r = mcp.stringifyResult({ x: 1 });
  assert.match(r, /"x": 1/);
});
