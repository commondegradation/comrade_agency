/* ------------------------------------------------------------------ *
 * Views: welcome, providers, agent editor, connections, settings
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const U = window.U;
  const S = window.S;
  const V = window.Views;

  V.PRESET_AVATARS = Array.from({ length: 8 }, (_, i) => `cat${i + 1}.jpg`);

  V.PROVIDER_PRESETS = [
    { id: 'anthropic', name: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', keyHint: 'sk-ant-…', models: [['claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5'], ['claude-opus-4-1-20250805', 'Claude Opus 4.1'], ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5']], note: 'Use the Anthropic-compatible endpoint (/v1) with a standard API key.' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyHint: 'sk-…', models: [['gpt-4o', 'GPT-4o'], ['gpt-4o-mini', 'GPT-4o mini'], ['o3-mini', 'o3-mini']] },
    { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyHint: 'sk-or-…', models: [['anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5'], ['openai/gpt-4.1', 'GPT-4.1'], ['x-ai/grok-4', 'Grok 4']] },
    { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyHint: 'gsk_…', models: [['llama-3.3-70b-versatile', 'Llama 3.3 70B'], ['qwen/qwen3-32b', 'Qwen3 32B']] },
    { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', keyHint: '…', models: [['mistral-large-latest', 'Mistral Large'], ['codestral-latest', 'Codestral']] },
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyHint: 'sk-…', models: [['deepseek-chat', 'DeepSeek Chat'], ['deepseek-reasoner', 'DeepSeek Reasoner']] },
    { id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', keyHint: 'xai-…', models: [['grok-4', 'Grok 4'], ['grok-3-mini', 'Grok 3 mini']] },
    { id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', keyHint: 'not required', models: [['llama3.1', 'Llama 3.1'], ['qwen2.5-coder', 'Qwen 2.5 Coder']] },
    { id: 'custom', name: 'Custom / self-hosted', baseUrl: '', keyHint: '…', models: [] }
  ];

  V.CONNECTION_CATALOG = [
    {
      id: 'github',
      title: 'GitHub',
      group: 'Code',
      blurb: 'Repos, issues, pull requests, code search.',
      docs: 'https://github.com/github/github-mcp-server',
      remote: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer YOUR_GITHUB_TOKEN' },
      tools: [
        ['search_repositories', 'Search GitHub repositories', { query: { type: 'string' }, limit: { type: 'number' } }],
        ['get_file_contents', 'Read a file from a repository', { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' } }],
        ['create_issue', 'Open an issue', { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }],
        ['list_pull_requests', 'List pull requests', { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' } }]
      ],
      note: 'Official hosted MCP endpoint. Replace the placeholder with a GitHub personal access token in Headers.'
    },
    {
      id: 'gmail',
      title: 'Google Mail',
      group: 'Google',
      blurb: 'Read, search and draft email.',
      docs: 'https://developers.google.com/gmail/api',
      remote: 'https://gmailmcp.googleapis.com/mcp/v1',
      headers: { Authorization: 'Bearer YOUR_GOOGLE_OAUTH_TOKEN' },
      tools: [
        ['search_messages', 'Full-text search in the mailbox', { query: { type: 'string' } }],
        ['get_message', 'Fetch a message by id', { id: { type: 'string' } }],
        ['create_draft', 'Create a draft reply', { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }]
      ],
      note: 'Google Workspace MCP endpoint — install it from Cloud Console, then point this entry at your deployment URL.'
    },
    {
      id: 'gcalendar',
      title: 'Google Calendar',
      group: 'Google',
      blurb: 'Events, availability, scheduling.',
      docs: 'https://developers.google.com/calendar/api',
      remote: 'https://calendarmcp.googleapis.com/mcp/v1',
      headers: { Authorization: 'Bearer YOUR_GOOGLE_OAUTH_TOKEN' },
      tools: [
        ['list_events', 'List events in a range', { calendarId: { type: 'string' }, timeMin: { type: 'string' }, timeMax: { type: 'string' } }],
        ['create_event', 'Create an event', { summary: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }]
      ],
      note: 'Requires a Google Workspace deployment with MCP enabled.'
    },
    {
      id: 'gdrive',
      title: 'Google Drive',
      group: 'Google',
      blurb: 'Find and read files in Drive.',
      docs: 'https://developers.google.com/drive/api',
      remote: 'https://drivemcp.googleapis.com/mcp/v1',
      headers: { Authorization: 'Bearer YOUR_GOOGLE_OAUTH_TOKEN' },
      tools: [
        ['search_files', 'Search files', { query: { type: 'string' } }],
        ['read_file', 'Read a file', { fileId: { type: 'string' } }]
      ],
      note: 'Requires a Google Workspace deployment with MCP enabled.'
    },
    {
      id: 'notion',
      title: 'Notion',
      group: 'Docs',
      blurb: 'Pages, databases, blocks.',
      docs: 'https://developers.notion.com',
      remote: 'https://mcp.notion.com/mcp',
      headers: { Authorization: 'Bearer YOUR_NOTION_TOKEN' },
      tools: [
        ['search', 'Search pages and databases', { query: { type: 'string' } }],
        ['fetch', 'Fetch a page as markdown', { id: { type: 'string' } }],
        ['create_page', 'Create a page', { parent: { type: 'string' }, title: { type: 'string' } }]
      ],
      note: 'Notion hosted MCP.'
    },
    {
      id: 'linear',
      title: 'Linear',
      group: 'Work',
      blurb: 'Issues, projects, cycles.',
      docs: 'https://linear.app/docs',
      remote: 'https://mcp.linear.app/mcp',
      headers: { Authorization: 'Bearer YOUR_LINEAR_TOKEN' },
      tools: [
        ['list_issues', 'List issues', { team: { type: 'string' }, state: { type: 'string' } }],
        ['create_issue', 'Create an issue', { team: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } }]
      ],
      note: 'Linear hosted MCP.'
    },
    {
      id: 'slack',
      title: 'Slack',
      group: 'Work',
      blurb: 'Channels, messages, threads.',
      docs: 'https://api.slack.com',
      remote: 'https://mcp.slack.com/mcp',
      headers: { Authorization: 'Bearer YOUR_SLACK_TOKEN' },
      tools: [
        ['search_messages', 'Search messages', { query: { type: 'string' } }],
        ['post_message', 'Post a message', { channel: { type: 'string' }, text: { type: 'string' } }]
      ],
      note: 'Slack hosted MCP. Configure once, then enable per agent.'
    },
    {
      id: 'filesystem',
      title: 'Local Files',
      group: 'Local',
      blurb: 'Sandboxed folder on this computer (bundled server).',
      docs: '',
      local: true,
      server: { type: 'stdio', command: 'node', args: ['HOME/Comrade-MCP/filesystem-server.js'] },
      script: 'filesystem-server.js',
      tools: [
        ['list_directory', 'List files in the sandbox folder', { path: { type: 'string' } }],
        ['read_file', 'Read a text file', { path: { type: 'string' } }],
        ['write_file', 'Write a text file', { path: { type: 'string' }, content: { type: 'string' } }]
      ],
      note: 'Export the script with “Save script”, then a local process — launched by Comrade Agency — serves it.'
    },
    {
      id: 'memory',
      title: 'Memory',
      group: 'Local',
      blurb: 'Tiny key/value notebook (bundled Python server).',
      docs: '',
      local: true,
      server: { type: 'stdio', command: 'python3', args: ['HOME/Comrade-MCP/memory-server.py'] },
      script: 'memory-server.py',
      tools: [
        ['remember', 'Store a note under a key', { key: { type: 'string' }, value: { type: 'string' } }],
        ['recall', 'Read a note by key', { key: { type: 'string' } }],
        ['list_memories', 'List stored keys', {}]
      ],
      note: 'Stdlib-only Python server launched on demand.'
    }
  ];

  /* ================================================================== *
   * Welcome / first-run
   * ================================================================== */
  V.renderSetup = () => {
    const el = U.qs('#view-setup');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="setup-inner">
      <div class="setup-hero">
        <img class="setup-logo" src="assets/logo.png" alt="Comrade Agency" />
        <h1>Comrade Agency</h1>
        <p class="tagline">Agents that ship code. Bring your own models, hand out connections, and every reply that contains code becomes one runnable artifact.</p>
      </div>
      <div class="setup-steps">
        <div class="step-card">
          <span class="step-num">01</span>
          <h3>Add a provider</h3>
          <p>Any OpenAI-compatible endpoint: a display name, an API key and one or more models.</p>
          <button class="btn primary" data-action="setup-providers">Add provider</button>
        </div>
        <div class="step-card">
          <span class="step-num">02</span>
          <h3>Create an agent</h3>
          <p>Name, avatar from the cat pack, a system prompt, and the model it thinks with.</p>
          <button class="btn ghost" data-action="setup-agent" ${S.data.providers.length ? '' : 'disabled'}>New Agent</button>
        </div>
        <div class="step-card">
          <span class="step-num">03</span>
          <h3>Connect tools</h3>
          <p>MCP connections for GitHub, Gmail, Notion and more — shared by the agents you allow.</p>
          <button class="btn ghost" data-action="setup-connections">Connections</button>
        </div>
      </div>
      <p class="setup-foot">v${U.esc(window.APP_VERSION || '1.0.0')} · your keys stay on this machine</p>
    </div>`;
    el.querySelector('[data-action="setup-providers"]').onclick = () => window.App.openProviderEditor(null);
    el.querySelector('[data-action="setup-agent"]').onclick = () => window.App.openAgentEditor(null);
    el.querySelector('[data-action="setup-connections"]').onclick = () => window.App.openConnectionsCatalog();
  };

  /* ================================================================== *
   * Providers
   * ================================================================== */
  V.renderProviders = () => {
    const el = U.qs('#chat-view');
    const rows = S.data.providers.map((p) => `
      <div class="list-row" data-provider="${p.id}">
        <div class="list-main">
          <div class="list-title">${U.esc(p.name)}</div>
          <div class="list-sub">${U.esc(p.baseUrl || 'no base URL')} · ${(p.models || []).length} model${(p.models || []).length === 1 ? '' : 's'} · key ${p.apiKey ? `••••${U.esc(p.apiKey.slice(-4))}` : '<span class="warn">missing</span>'}</div>
          <div class="model-chips">${(p.models || []).map((m) => `<span class="chip mono">${U.esc(m.name)} <span class="muted">${U.esc(m.id)}</span></span>`).join('') || '<span class="muted">no models yet</span>'}</div>
        </div>
        <div class="list-actions">
          <button class="btn ghost small" data-action="test-provider" data-id="${p.id}">Test</button>
          <button class="btn ghost small" data-action="edit-provider" data-id="${p.id}">Edit</button>
          <button class="btn ghost small danger-text" data-action="delete-provider" data-id="${p.id}">Delete</button>
        </div>
      </div>`).join('');

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div>
          <h2>Providers</h2>
          <p class="page-sub">Model endpoints your agents can use. Each provider keeps its own key and model list.</p>
        </div>
        <div class="page-actions">
          <button class="btn primary" data-action="add-provider">+ Add provider</button>
        </div>
      </div>
      ${S.data.providers.length ? `<div class="list">${rows}</div>` : `<div class="blank-state">
        <h3>No providers yet</h3>
        <p>Start with a preset or point at your own OpenAI-compatible server.</p>
        <button class="btn primary" data-action="add-provider">+ Add provider</button>
      </div>`}
    </div>`;
  };

  /* ================================================================== *
   * Connections
   * ================================================================== */
  V.renderConnections = () => {
    const el = U.qs('#chat-view');
    const groups = {};
    for (const c of S.data.connections) {
      const key = c.server && c.server.type === 'stdio' ? 'Local' : 'Remote';
      (groups[key] = groups[key] || []).push(c);
    }
    const card = (c) => `
      <div class="conn-card ${c.enabled ? '' : 'off'}">
        <div class="conn-head">
          <div class="conn-title">${U.esc(c.title)} <span class="status-dot ${c.status || 'idle'}"></span></div>
          <label class="switch" title="Enabled for agents">
            <input type="checkbox" data-conn-toggle="${c.id}" ${c.enabled ? 'checked' : ''} />
            <span></span>
          </label>
        </div>
        <div class="conn-url mono">${U.esc(c.server?.type === 'stdio' ? [c.server.command, ...(c.server.args || [])].join(' ') : c.server?.url || '')}</div>
        <div class="conn-meta">${(c.tools || []).length} tool${(c.tools || []).length === 1 ? '' : 's'}${c.lastSync ? ` · synced ${U.relTime(c.lastSync)}` : ''}${c.lastError ? ` · <span class="danger-text">${U.esc(U.truncate(c.lastError, 80))}</span>` : ''}</div>
        <pre class="conn-tools">${U.esc((c.tools || []).map((t) => t.name).join('\n') || '— not synced —')}</pre>
        <div class="conn-actions">
          <button class="btn ghost small" data-conn-sync="${c.id}">Sync tools</button>
          <button class="btn ghost small" data-conn-edit="${c.id}">Edit</button>
          <button class="btn ghost small danger-text" data-conn-delete="${c.id}">Remove</button>
        </div>
      </div>`;

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div>
          <h2>Connections <span class="muted">MCP</span></h2>
          <p class="page-sub">Model Context Protocol servers. Each agent picks the connections it may use.</p>
        </div>
        <div class="page-actions">
          <button class="btn ghost" data-action="remote-connection">+ Custom server</button>
          <button class="btn primary" data-action="catalog">Browse catalog</button>
        </div>
      </div>
      ${S.data.connections.length
        ? Object.entries(groups).map(([g, list]) => `<h4 class="group-title">${g}</h4><div class="conn-grid">${list.map(card).join('')}</div>`).join('')
        : `<div class="blank-state">
            <h3>No connections</h3>
            <p>GitHub, Google Mail, Calendar, Drive, Notion, Linear, Slack — or a local sandboxed filesystem.</p>
            <button class="btn primary" data-action="catalog">Browse catalog</button>
          </div>`}
    </div>`;
  };

  /* ================================================================== *
   * Settings
   * ================================================================== */
  V.renderSettings = () => {
    const el = U.qs('#chat-view');
    const s = S.data.ui;
    el.innerHTML = `<div class="page narrow">
      <div class="page-head"><div><h2>Settings</h2><p class="page-sub">Everything is stored locally on this machine.</p></div></div>
      <div class="settings-block">
        <label class="row-toggle"><span>Show reasoning blocks</span>
          <label class="switch"><input type="checkbox" id="set-thinking" ${s.showThinking ? 'checked' : ''}/><span></span></label></label>
        <label class="row-toggle"><span>Open the artifact panel automatically</span>
          <label class="switch"><input type="checkbox" id="set-artifact" ${s.autoOpenArtifact ? 'checked' : ''}/><span></span></label></label>
        <label class="row-toggle"><span>Sidebar width</span>
          <input type="range" id="set-sidebar" min="240" max="420" value="${s.sidebarWidth}" /></label>
      </div>
      <div class="settings-block">
        <h4>Data</h4>
        <p class="muted small">Providers, agents, chats and connections live in a single JSON file.</p>
        <div class="row-actions">
          <button class="btn ghost" data-action="reveal-store">Show data file</button>
          <button class="btn ghost" data-action="export-store">Export JSON</button>
        </div>
        <p class="muted small mono" id="data-dir"></p>
      </div>
      <div class="settings-block">
        <h4>About</h4>
        <p class="muted small">Comrade Agency v${U.esc(window.APP_VERSION || '1.0.0')} · Electron ${U.esc(window.ELECTRON_VERSIONS?.electron || '')} · ${U.esc(window.ELECTRON_VERSIONS?.chrome ? `Chromium ${window.ELECTRON_VERSIONS.chrome}` : '')}</p>
        <p class="muted small">Fonts: LINE Seed JP (UI buttons) · Climate Crisis (text). Bundled locally.</p>
      </div>
      <div class="settings-block danger-zone">
        <h4>Reset</h4>
        <p class="muted small">Deletes every provider, agent, chat and connection from this machine.</p>
        <button class="btn danger" data-action="reset-all">Delete all data</button>
      </div>
    </div>`;
    window.comrade.info().then((i) => {
      const p = U.qs('#data-dir');
      if (p) p.textContent = i.dataDir;
    });
    const set = (key, value) => {
      S.data.ui[key] = value;
      S.persist();
    };
    U.qs('#set-thinking').onchange = (e) => {
      set('showThinking', e.target.checked);
      V.renderChat();
    };
    U.qs('#set-artifact').onchange = (e) => set('autoOpenArtifact', e.target.checked);
    U.qs('#set-sidebar').oninput = (e) => {
      set('sidebarWidth', Number(e.target.value));
      window.App.applySidebarWidth();
    };
  };

  window.ViewSetup = V;
})();
