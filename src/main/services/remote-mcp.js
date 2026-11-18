'use strict';
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store');
const vault = require('./credentials');
const sessions = new Map();
const pending = new Map();
let sdk;
function modules() {
  if (!sdk) sdk = {
    Client: require('@modelcontextprotocol/sdk/client/index.js').Client,
    Transport: require('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport
  };
  return sdk;
}
function connection(id) {
  const c = store.get().connections.find(x => x.id === id);
  if (!c || !c.enabled || c.server?.type !== 'http') throw new Error('Подключение недоступно');
  return c;
}
function endpoint(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.hash || !(url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new Error('Для MCP требуется HTTPS (HTTP разрешён только на этом компьютере)');
  }
  return url;
}
const keyFor = c => `${c.id}:${endpoint(c.server.url).href}:${c.server.oauthClientId || ''}`;
// SDK implements discovery, PKCE, resource binding, refresh and the MCP session lifecycle.
function provider(c, login) {
  const key = keyFor(c);
  let saved = vault.get(key);
  const save = () => { if (login?.cancelled) throw new Error('Вход отменён'); vault.set(key, saved); };
  return {
    get redirectUrl() { return login?.redirect || saved.redirect; },
    get clientMetadata() { return {
      client_name: 'Comrade Agency', redirect_uris: [login?.redirect || saved.redirect],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none'
    }; },
    state: () => login?.state,
    clientInformation: () => saved.client || (c.server.oauthClientId ? { client_id: c.server.oauthClientId } : undefined),
    saveClientInformation: info => { saved.client = info; saved.redirect = login?.redirect; save(); },
    tokens: () => saved.tokens,
    saveTokens: tokens => { saved.tokens = tokens; saved.redirect = login?.redirect || saved.redirect; save(); },
    saveCodeVerifier: verifier => { if (!login) throw new Error('Войдите через страницу подключений'); login.verifier = verifier; },
    codeVerifier: () => { if (!login?.verifier) throw new Error('Сеанс входа истёк'); return login.verifier; },
    redirectToAuthorization: async url => {
      if (!login) throw new Error('Требуется вход. Откройте Подключения → Войти в браузере.');
      endpoint(url);
      login.url = url.href;
      login.phase = 'waiting';
      try { await shell.openExternal(url.href); } catch { /* link remains available */ }
    },
    invalidateCredentials: scope => {
      if (scope === 'all') saved = {};
      if (scope === 'client') delete saved.client;
      if (scope === 'tokens') delete saved.tokens;
      if (scope === 'verifier' && login) delete login.verifier;
      save();
    }
  };
}
async function close(id) {
  const session = sessions.get(id);
  sessions.delete(id);
  if (session) await session.client.close().catch(() => {});
}
async function connect(c, login) {
  const { Client, Transport } = modules();
  const client = new Client({ name: 'comrade-agency', version: '1.0.0' }, { capabilities: {} });
  const transport = new Transport(endpoint(c.server.url), {
    authProvider: c.server.authMode === 'oauth' ? provider(c, login) : undefined,
    requestInit: { headers: Object.fromEntries(Object.entries(c.server.headers || {}).filter(([k]) =>
      c.server.authMode !== 'oauth' || k.toLowerCase() !== 'authorization')) }
  });
  try {
    await client.connect(transport);
    if (login?.cancelled) { await client.close(); throw new Error('Вход отменён'); }
    const session = { client, transport, signature: JSON.stringify(c.server) };
    sessions.set(c.id, session);
    return session;
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}
async function session(c) {
  const old = sessions.get(c.id);
  if (old && old.signature === JSON.stringify(c.server)) return old;
  await close(c.id);
  return connect(c);
}
async function list(id) {
  const c = connection(id);
  const s = await session(c);
  const tools = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const result = await s.client.listTools(cursor ? { cursor } : {});
    tools.push(...result.tools);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  c.tools = tools;
  c.lastSync = Date.now();
  c.status = 'connected';
  c.lastError = null;
  store.set(store.get());
  return { tools };
}
async function call(id, name, args) {
  const s = await session(connection(id));
  return s.client.callTool({ name, arguments: args || {} });
}
async function start(id) {
  const c = connection(id);
  if (c.server.authMode !== 'oauth') throw new Error('Выберите вход через браузер в настройках подключения');
  if (pending.has(id) && ['starting','waiting','exchanging'].includes(pending.get(id).phase)) return status(id);
  if (pending.has(id)) { pending.get(id).cancel(); pending.delete(id); }
  await close(id);
  const login = { phase: 'starting', state: crypto.randomBytes(32).toString('base64url'), url: null };
  pending.set(id, login);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, login.redirect);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' || url.pathname !== '/callback' || url.searchParams.get('state') !== login.state) {
      res.writeHead(400); res.end('Неверный запрос авторизации'); return;
    }
    if (login.phase === 'exchanging') { res.writeHead(409); res.end('Запрос уже обрабатывается'); return; }
    if (url.searchParams.has('error') || !url.searchParams.get('code')) {
      login.phase = 'error'; login.error = 'Вход отменён сервисом';
      res.end(login.error); cleanup(); return;
    }
    login.phase = 'exchanging';
    try {
      if (connection(id).server.url !== c.server.url) throw new Error('Подключение изменено. Повторите вход.');
      const { Transport, Client } = modules();
      const transport = new Transport(endpoint(c.server.url), { authProvider: provider(c, login),
        requestInit: { headers: Object.fromEntries(Object.entries(c.server.headers || {}).filter(([k]) => k.toLowerCase() !== 'authorization')) } });
      await transport.finishAuth(url.searchParams.get('code'));
      if (login.cancelled) throw new Error('Вход отменён');
      const client = new Client({ name: 'comrade-agency', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);
      if (login.cancelled) { await client.close(); throw new Error('Вход отменён'); }
      sessions.set(id, { client, transport, signature: JSON.stringify(c.server) });
      login.phase = 'connected';
      res.end('Вход выполнен. Вернитесь в Comrade Agency.');
    } catch { login.phase = 'error'; login.error = 'Не удалось завершить вход. Проверьте настройки OAuth и повторите.'; res.end(login.error); }
    if (login.cancelled) { await close(id); vault.remove(keyFor(c)); }
    cleanup();
  });
  const cleanup = () => { clearTimeout(login.timer); server.close(); delete login.verifier; };
  login.cancel = () => { login.cancelled = true; cleanup(); };
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    login.redirect = `http://127.0.0.1:${server.address().port}/callback`;
    login.timer = setTimeout(() => { login.phase = 'error'; login.error = 'Время входа истекло'; cleanup(); }, 180000);
    // Run asynchronously: return the link/status while the browser handles consent.
    connect(c, login).then(() => { login.phase = 'connected'; cleanup(); }).catch(() => {
      if (!login.url) { login.phase = 'error'; login.error = 'Сервис не поддерживает автоматический вход или требуется OAuth Client ID.'; cleanup(); }
    });
    return status(id);
  } catch (err) { pending.delete(id); cleanup(); throw err; }
}
function status(id) {
  const c = connection(id);
  const login = pending.get(id);
  const saved = vault.get(keyFor(c));
  return { phase: login?.phase || (saved.tokens ? 'authorized' : 'idle'), url: login?.url || null,
    error: login?.error || null };
}
async function disconnect(id) {
  const c = connection(id);
  const p = pending.get(id);
  if (p) p.cancel();
  pending.delete(id);
  await close(id);
  vault.remove(keyFor(c));
  c.tools = []; c.status = 'idle';
  store.set(store.get());
  return { ok: true, note: 'Доступ удалён с этого компьютера. Для отзыва разрешения также откройте настройки подключённых приложений сервиса.' };
}
module.exports = { list, call, start, status, disconnect, close, endpoint };
