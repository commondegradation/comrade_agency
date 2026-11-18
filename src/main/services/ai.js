'use strict';

// Every request the renderer makes is validated against the provider list
// that lives in the main-process store. The renderer never gets to decide
// where an API key is sent.
const store = require('./store');
const mcp = require('./mcp');

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = 100000) => typeof v === 'string' && v.length <= max;

function resolveTarget(cfg) {
  if (!isObj(cfg) || !isStr(cfg.providerId, 100) || !isStr(cfg.modelId, 400)) {
    throw new Error('Invalid request: providerId and modelId are required');
  }
  const data = store.get();
  const provider = data.providers.find((p) => p.id === cfg.providerId);
  if (!provider) throw new Error('Provider not found. Open Providers and add one.');
  const model = (provider.models || []).find((m) => m.id === cfg.modelId);
  if (!model) throw new Error(`Model "${cfg.modelId}" is not registered under "${provider.name}"`);
  const connection = (data.connections || []).find((c) => c.id === cfg.connectionId);
  return { provider, model, connection };
}

function messagesFor(cfg) {
  const latest = (cfg.messages || []).filter(m => m.role === 'user').at(-1)?.content || '';
  const reference = require('./knowledge').context(latest);
  const system = [cfg.systemPrompt, cfg.toolsGuide, reference].filter((s) => typeof s === 'string' && s.trim()).join('\n\n');
  const history = (Array.isArray(cfg.messages) ? cfg.messages : [])
    .filter((m) => isObj(m) && ['user', 'assistant', 'tool'].includes(m.role) && isStr(m.content))
    .map((m) => ({ role: m.role, content: m.content.slice(0, 200000),
      ...(m.role === 'tool' && isStr(m.tool_call_id, 200) ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.role === 'assistant' && Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls } : {}) }));
  if (system) return [{ role: 'system', content: system }, ...history];
  return history;
}

/** Accepts a bare array of function descriptors as well as `{ function: [...] }`. */
function toolList(cfg) {
  const raw = Array.isArray(cfg && cfg.tools)
    ? cfg.tools
    : isObj(cfg && cfg.tools) && Array.isArray(cfg.tools.function)
      ? cfg.tools.function
      : [];
  return raw.map((t) => (isObj(t) && isObj(t.function) ? t.function : t)).filter((t) => isObj(t) && isStr(t.name, 200));
}

function baseUrl(provider) {
  return String(provider.baseUrl || '').replace(/\/+$/, '');
}

function headersFor(provider) {
  const h = { 'Content-Type': 'application/json' };
  if (provider.apiKey) h.Authorization = `Bearer ${provider.apiKey}`;
  for (const [k, v] of Object.entries(provider.headers || {})) {
    if (k && typeof v === 'string' && v) h[k] = v;
  }
  return h;
}

async function bodyText(res) {
  try {
    const text = await res.text();
    return text || res.statusText;
  } catch {
    return res.statusText;
  }
}

function friendlyHttpError(status, text) {
  let detail = text;
  try {
    const j = JSON.parse(text);
    detail = j.error?.message || j.message || j.error || text;
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch { /* keep raw text */ }
  const base =
    status === 401 ? 'Unauthorized (401) — check the API key' :
    status === 403 ? 'Forbidden (403) — the key may lack access to this model' :
    status === 404 ? 'Not found (404) — check the base URL or model id' :
    status === 429 ? 'Rate limited (429) — try again in a moment' :
    status >= 500 ? `Provider error (${status})` :
    `HTTP ${status}`;
  return `${base}${detail ? `\n${String(detail).slice(0, 600)}` : ''}`;
}

/* ------------------------------------------------------------------ *
 * SSE parsing
 * ------------------------------------------------------------------ */
async function readSSE(res, signal, onEvent, onRaw) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    if (signal.aborted) {
      try { reader.cancel(); } catch { /* ignore */ }
      throw new DOMException('Aborted', 'AbortError');
    }
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (onRaw) onRaw(chunk);
    buffer += chunk;
    let idx;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2));
      dispatchSSE(raw, onEvent);
    }
  }
  if (buffer.trim()) dispatchSSE(buffer, onEvent);
}

function dispatchSSE(raw, onEvent) {
  const dataLines = [];
  let event = '';
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  if (!dataLines.length) return;
  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    onEvent({ kind: 'done' });
    return;
  }
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return;
  }
  onEvent({ kind: 'json', event, json });
}

const errorFromJson = (json) => {
  const err = json?.error;
  if (!err) return null;
  if (typeof err === 'string') return err;
  return err.message || JSON.stringify(err);
};

/* ------------------------------------------------------------------ *
 * Chat completions (OpenAI-compatible)
 * ------------------------------------------------------------------ */
async function runStream(cfg, { signal, onEvent }) {
  const { provider, model } = resolveTarget(cfg);
  const messages = messagesFor(cfg);
  const data = store.get();
  const payload = {
    model: model.id,
    messages,
    stream: true,
    temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7
  };
  if (provider.sendMaxTokens !== false) payload.max_tokens = Number(provider.maxTokens) || 4096;

  // Tools are forwarded only if the caller advertised them by name, which
  // makes temporary "tools off" (after a round of tool calls) trivial.
  const advertised = new Set(toolList(cfg).map((t) => t.name));
  const connectionsOn = cfg.enableConnections !== false;
  const mapped = connectionsOn
    ? mcp.toolsForConnections(data.connections, cfg.agentConnectionIds)
    : { tools: [], map: {} };
  const forwarded = mapped.tools
    .filter((t) => advertised.has(t.function.name))
    .map((t) => ({ type: 'function', function: t.function }));
  if (forwarded.length) payload.tools = forwarded;

  const url = `${baseUrl(provider)}/chat/completions`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headersFor(provider),
      body: JSON.stringify(payload),
      signal
    });
  } catch (err) {
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    throw new Error(`Cannot reach ${url}\n${err.message}\nCheck the base URL and your connection.`);
  }
  if (!res.ok) throw new Error(friendlyHttpError(res.status, await bodyText(res)));

  const state = {
    content: '',
    reasoning: '',
    calls: new Map(),
    finish: null,
    usage: null,
    streamed: false
  };

  const flushSplit = (text, field) => {
    // Some providers only stream content into unknown non-standard fields.
    if (!text) return;
    state[field] += text;
    onEvent({ type: 'delta', content: field === 'content' ? text : undefined, reasoning: field === 'reasoning' ? text : undefined });
  };

  // Fallback: some servers ignore stream:true and answer with plain JSON.
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const json = await res.json();
    const err = errorFromJson(json);
    if (err) throw new Error(err);
    const msg = json.choices?.[0]?.message || {};
    if (msg.reasoning_content || msg.reasoning) flushSplit(msg.reasoning_content || msg.reasoning, 'reasoning');
    if (msg.content) flushSplit(msg.content, 'content');
    for (const call of msg.tool_calls || []) {
      state.calls.set(call.id || `call_${state.calls.size}`, {
        id: call.id || `call_${state.calls.size}`,
        name: call.function?.name || '',
        arguments: call.function?.arguments || ''
      });
    }
    state.finish = json.choices?.[0]?.finish_reason || 'stop';
    state.usage = json.usage || null;
    return finalize();
  }

  await readSSE(res, signal, ({ kind, json }) => {
    if (kind === 'done') return;
    const err = errorFromJson(json);
    if (err) throw new Error(err);
    if (json.usage) state.usage = json.usage;
    const choice = json.choices?.[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (typeof delta.reasoning_content === 'string') flushSplit(delta.reasoning_content, 'reasoning');
    else if (typeof delta.reasoning === 'string') flushSplit(delta.reasoning, 'reasoning');
    if (typeof delta.content === 'string') flushSplit(delta.content, 'content');
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const key = tc.index ?? tc.id ?? state.calls.size;
        const existing = state.calls.get(key) || { id: tc.id || `call_${key}`, name: '', arguments: '' };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name && !existing.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        state.calls.set(key, existing);
      }
      onEvent({ type: 'tool_call_delta' });
    }
    if (choice.finish_reason) state.finish = choice.finish_reason;
  });

  return finalize();

  function finalize() {
    const calls = [...state.calls.values()].filter((c) => c.name);
    return {
      content: state.content,
      reasoning: state.reasoning,
      toolCalls: calls,
      finishReason: state.finish || 'stop',
      usage: state.usage,
      toolsEnabled: Array.isArray(payload.tools) && payload.tools.length > 0
    };
  }
}

/* ------------------------------------------------------------------ *
 * MCP tool execution: one LLM round trip with the tool output.
 * ------------------------------------------------------------------ */
async function runWithToolResult(cfg, { signal, onEvent }) {
  const { provider, model } = resolveTarget(cfg);
  const payload = {
    model: model.id,
    messages: messagesFor(cfg),
    stream: true,
    temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7
  };
  if (provider.sendMaxTokens !== false) payload.max_tokens = Number(provider.maxTokens) || 4096;
  const url = `${baseUrl(provider)}/chat/completions`;
  const res = await fetch(url, { method: 'POST', headers: headersFor(provider), body: JSON.stringify(payload), signal });
  if (!res.ok) throw new Error(friendlyHttpError(res.status, await bodyText(res)));
  let content = '';
  let reasoning = '';
  await readSSE(res, signal, ({ kind, json }) => {
    if (kind === 'done') return;
    const err = errorFromJson(json);
    if (err) throw new Error(err);
    const delta = json.choices?.[0]?.delta || {};
    if (typeof delta.reasoning_content === 'string') {
      reasoning += delta.reasoning_content;
      onEvent({ type: 'delta', reasoning: delta.reasoning_content });
    }
    if (typeof delta.content === 'string') {
      content += delta.content;
      onEvent({ type: 'delta', content: delta.content });
    }
  });
  return { content, reasoning, toolCalls: [], finishReason: 'stop', toolsEnabled: false };
}

/* ------------------------------------------------------------------ *
 * Model listing + connection tests
 * ------------------------------------------------------------------ */
async function listModels({ providerId }) {
  const data = store.get();
  const provider = data.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error('Provider not found');
  const res = await fetch(`${baseUrl(provider)}/models`, { headers: headersFor(provider) });
  if (!res.ok) throw new Error(friendlyHttpError(res.status, await bodyText(res)));
  const json = await res.json().catch(() => ({}));
  const list = (json.data || json.models || []).map((m) => ({
    id: m.id || m.name || m.model,
    name: m.display_name || m.name || m.id
  })).filter((m) => m.id);
  return list;
}

async function testProvider({ providerId }) {
  const data = store.get();
  const provider = data.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error('Provider not found');
  const started = Date.now();
  const url = `${baseUrl(provider)}/models`;
  const res = await fetch(url, { headers: headersFor(provider) });
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(friendlyHttpError(res.status, await bodyText(res)));
  const json = await res.json().catch(() => ({}));
  return { ok: true, ms, count: (json.data || json.models || []).length };
}

async function serverRequest(conn, method, params, { timeoutMs = 15000, sessionId } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  for (const [k, v] of Object.entries(conn.server.headers || {})) if (k && v) headers[k] = v;
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(conn.server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(friendlyHttpError(res.status, await bodyText(res)));
    const sid = res.headers.get('mcp-session-id') || sessionId;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        try { json = JSON.parse(line.slice(5).trim()); } catch { /* next */ }
      }
    }
    if (!json) throw new Error('The server answered with an unexpected body (not JSON-RPC)');
    if (json.error) throw new Error(json.error.message || 'MCP error');
    return { result: json.result, sessionId: sid };
  } finally {
    clearTimeout(timer);
  }
}

async function listToolsOnServer(server) {
  const conn = { server };
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  for (const [k, v] of Object.entries(server.headers || {})) if (k && v) headers[k] = v;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const initRes = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 0, method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'comrade-agency', version: '1.0.0' } }
      }),
      signal: controller.signal
    });
    if (!initRes.ok) throw new Error(friendlyHttpError(initRes.status, await bodyText(initRes)));
    await initRes.text().catch(() => '');
    const sessionId = initRes.headers.get('mcp-session-id');
    const { result } = await serverRequest(conn, 'tools/list', {}, { sessionId });
    const tools = (result?.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }));
    return { tools, sessionId };
  } finally {
    clearTimeout(timer);
  }
}

async function callTool(conn, name, args) {
  const { result } = await serverRequest(conn, 'tools/call', { name, arguments: args || {} });
  if (result?.content && Array.isArray(result.content)) {
    const text = result.content
      .map((c) => (c.type === 'text' ? c.text : `[${c.type}]`))
      .join('\n');
    return text || result;
  }
  return result;
}

module.exports = { runStream, runWithToolResult, listModels, testProvider, listToolsOnServer, callTool };
