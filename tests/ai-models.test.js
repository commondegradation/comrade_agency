'use strict';

const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { install } = require('./helpers/mock-electron');

const electronMock = install();
const store = require('../src/main/services/store');
const ai = require('../src/main/services/ai');
const originalFetch = global.fetch;

after(() => {
  global.fetch = originalFetch;
  fs.rmSync(electronMock.tmp, { recursive: true, force: true });
  electronMock.restore();
});

test('discovers locally installed Ollama models through the native tags API', async () => {
  store.set({
    providers: [{
      id: 'ollama',
      name: 'Ollama (local)',
      apiType: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      models: []
    }],
    agents: [],
    chats: [],
    projects: [],
    connections: []
  });

  let requestUrl;
  global.fetch = async (url) => {
    requestUrl = url;
    return {
      ok: true,
      json: async () => ({
        models: [
          { name: 'qwen2.5:latest', model: 'qwen2.5:latest', size: 100 },
          { name: 'llama3.2:latest', model: 'llama3.2:latest', size: 200 }
        ]
      })
    };
  };

  const models = await ai.listModels({ providerId: 'ollama' });
  assert.equal(requestUrl, 'http://localhost:11434/api/tags');
  assert.deepEqual(models, [
    { id: 'llama3.2:latest', name: 'llama3.2:latest' },
    { id: 'qwen2.5:latest', name: 'qwen2.5:latest' }
  ]);
});

test('fetches models for an unsaved provider draft using its configured headers', async () => {
  let requestUrl;
  let requestHeaders;
  global.fetch = async (url, options) => {
    requestUrl = url;
    requestHeaders = options.headers;
    return {
      ok: true,
      json: async () => ({ data: [{ id: 'model-id', name: 'Model display name' }] })
    };
  };

  const models = await ai.listModels({
    provider: {
      name: 'Custom',
      baseUrl: 'https://models.example/v1',
      apiKey: 'test-key',
      headers: { 'X-Provider': 'test' }
    }
  });
  assert.equal(requestUrl, 'https://models.example/v1/models');
  assert.equal(requestHeaders.Authorization, 'Bearer test-key');
  assert.equal(requestHeaders['X-Provider'], 'test');
  assert.deepEqual(models, [{ id: 'model-id', name: 'Model display name' }]);
});
