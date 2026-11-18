'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./helpers/mock-electron');

// Install mock before requiring store (store requires electron)
const { restore } = install();
const store = require('../src/main/services/store');

test('normalize fills defaults for empty input', () => {
  const d = store.normalize(null);
  assert.equal(d.schemaVersion, 1);
  assert.deepEqual(d.providers, []);
  assert.deepEqual(d.agents, []);
  assert.deepEqual(d.chats, []);
  assert.deepEqual(d.connections, []);
  assert.equal(d.settings.density, 'cozy');
  assert.equal(d.settings.showThinking, true);
  assert.equal(d.settings.sidebarWidth, 300);
});

test('normalize preserves existing values', () => {
  const raw = {
    providers: [{ id: 'p1', name: 'Test', baseUrl: 'http://x', models: [{ id: 'm1', name: 'M1' }] }],
    agents: [{ id: 'a1', name: 'Agent', providerId: 'p1', modelId: 'm1', connectionIds: [] }],
    chats: [{ id: 'c1', agentId: 'a1', title: 'Chat', messages: [] }],
    connections: [],
    activeAgentId: 'a1',
    activeChatId: 'c1',
    settings: { density: 'compact', showThinking: false, autoOpenArtifact: false, artifactTab: 'source', sidebarWidth: 250 }
  };
  const d = store.normalize(raw);
  assert.equal(d.providers[0].id, 'p1');
  assert.equal(d.agents[0].providerId, 'p1');
  assert.equal(d.activeChatId, 'c1');
  assert.equal(d.settings.density, 'compact');
  assert.equal(d.settings.sidebarWidth, 250);
});

test('normalize fixes dangling activeAgentId and activeChatId', () => {
  const raw = {
    agents: [{ id: 'a1', providerId: null, modelId: null, connectionIds: [] }],
    providers: [],
    chats: [],
    connections: [],
    activeAgentId: 'ghost',
    activeChatId: 'ghost'
  };
  const d = store.normalize(raw);
  assert.equal(d.activeAgentId, 'a1');
  assert.equal(d.activeChatId, null);
});

test('normalize reassigns agents from deleted providers', () => {
  const raw = {
    providers: [{ id: 'p2', name: 'B', baseUrl: 'http://b', models: [{ id: 'm2', name: 'M2' }] }],
    agents: [{ id: 'a1', providerId: 'deleted', modelId: 'old', connectionIds: [] }],
    chats: [],
    connections: [],
    activeAgentId: 'a1',
    activeChatId: null
  };
  const d = store.normalize(raw);
  assert.equal(d.agents[0].providerId, 'p2');
  assert.equal(d.agents[0].modelId, 'm2');
});

test('normalize removes chats of deleted agents', () => {
  const raw = {
    providers: [],
    agents: [],
    chats: [{ id: 'c1', agentId: 'gone', title: 'x', messages: [] }],
    connections: [],
    activeAgentId: null,
    activeChatId: null
  };
  const d = store.normalize(raw);
  assert.equal(d.chats.length, 0);
});

test('normalize migrates legacy connection url field to server object', () => {
  const raw = {
    providers: [], agents: [], chats: [],
    connections: [{ id: 'x', title: 'X', url: 'https://mcp.example.com/sse' }],
    activeAgentId: null, activeChatId: null
  };
  const d = store.normalize(raw);
  assert.equal(d.connections[0].server.type, 'http');
  assert.equal(d.connections[0].server.url, 'https://mcp.example.com/sse');
  assert.equal(d.connections[0].enabled, true);
});

test('PRESET_AVATARS has 8 cat images', () => {
  assert.equal(store.PRESET_AVATARS.length, 8);
  assert.equal(store.PRESET_AVATARS[0], 'cat1.jpg');
  assert.equal(store.PRESET_AVATARS[7], 'cat8.jpg');
});

test('normalize handles provider without models array', () => {
  const raw = {
    providers: [{ id: 'p1', name: 'X' }],
    agents: [{ id: 'a1', providerId: 'gone', modelId: null, connectionIds: [] }],
    chats: [], connections: [], activeAgentId: 'a1', activeChatId: null
  };
  const d = store.normalize(raw);
  assert.equal(d.agents[0].providerId, 'p1');
  assert.equal(d.agents[0].modelId, null);
});

restore();