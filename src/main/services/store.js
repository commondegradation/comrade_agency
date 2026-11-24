'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const reminders = require('./reminders');

const SCHEMA_VERSION = 1;

const PRESET_AVATARS = Array.from({ length: 8 }, (_, i) => `cat${i + 1}.jpg`);

let cache = null;

const defaults = () => ({
  schemaVersion: SCHEMA_VERSION,
  providers: [],
  agents: [],
  chats: [],
  projects: [],
  reminders: [],
  connections: [],
  activeAgentId: null,
  activeChatId: null,
  settings: {
    density: 'cozy',
    showThinking: true,
    autoOpenArtifact: true,
    artifactTab: 'preview',
    sidebarWidth: 300
  }
});

function normalize(raw) {
  const d = defaults();
  const data = Object.assign(d, raw && typeof raw === 'object' ? raw : {});
  data.schemaVersion = SCHEMA_VERSION;
  data.providers = Array.isArray(data.providers) ? data.providers : [];
  data.agents = Array.isArray(data.agents) ? data.agents : [];
  data.chats = Array.isArray(data.chats) ? data.chats : [];
  data.projects = Array.isArray(data.projects) ? data.projects.map((project) => ({
    ...project,
    icon: typeof project.icon === 'string' ? project.icon : '',
    banner: typeof project.banner === 'string' ? project.banner : '',
    context: typeof project.context === 'string' ? project.context : '',
    systemPrompt: typeof project.systemPrompt === 'string' ? project.systemPrompt : '',
    files: Array.isArray(project.files) ? project.files : []
  })) : [];
  data.reminders = reminders.normalize(data.reminders);
  data.connections = Array.isArray(data.connections) ? data.connections : [];
  data.settings = Object.assign(defaults().settings, data.settings || {});

  // Drop references to entities that no longer exist.
  const agentIds = new Set(data.agents.map((a) => a.id));
  const providerIds = new Set(data.providers.map((p) => p.id));
  const projectIds = new Set(data.projects.map((project) => project.id));
  for (const agent of data.agents) {
    if (!providerIds.has(agent.providerId)) {
      const p = data.providers[0];
      agent.providerId = p ? p.id : null;
      agent.modelId = p && p.models && p.models[0] ? p.models[0].id : null;
    }
    agent.connectionIds = Array.isArray(agent.connectionIds)
      ? agent.connectionIds.filter((id) => data.connections.some((c) => c.id === id))
      : [];
  }
  data.chats = data.chats.filter((c) => agentIds.has(c.agentId));
  data.chats.forEach((chat) => {
    if (chat.projectId && !projectIds.has(chat.projectId)) chat.projectId = null;
  });
  data.connections = data.connections.map((c) => ({
    enabled: true,
    tools: [],
    ...c,
    server: c.server || (c.url ? { type: 'http', url: c.url } : { type: 'stdio', command: '', args: [], env: {} })
  }));
  if (!agentIds.has(data.activeAgentId)) data.activeAgentId = data.agents[0]?.id || null;
  if (!data.chats.some((c) => c.id === data.activeChatId)) {
    const first = data.chats.filter((c) => c.agentId === data.activeAgentId)[0];
    data.activeChatId = first ? first.id : null;
  }
  return data;
}

function filePath() {
  return path.join(app.getPath('userData'), 'comrade-agency.json');
}

function backupPath() {
  return path.join(app.getPath('userData'), 'comrade-agency.backup.json');
}

function atomicWrite(target, value) {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function load() {
  if (cache) return cache;
  const file = filePath();
  let raw = null;
  try {
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('[store] could not read store, falling back to backup:', err.message);
    try {
      if (fs.existsSync(backupPath())) raw = JSON.parse(fs.readFileSync(backupPath(), 'utf8'));
    } catch { /* ignore */ }
  }
  cache = normalize(raw);
  return cache;
}

function get() {
  return load();
}

function set(value) {
  const next = normalize(value);
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, backupPath());
  } catch { /* best effort */ }
  atomicWrite(file, next);
  cache = next;
  return { ok: true };
}

module.exports = { get, set, normalize, filePath, PRESET_AVATARS };
