/* ------------------------------------------------------------------ *
 * State + persistence (renderer side)
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const api = window.comrade;
  const U = window.U;

  const defaults = () => ({
    schemaVersion: 1,
    providers: [],
    agents: [],
    chats: [],
    projects: [],
    reminders: [],
    connections: [],
    activeAgentId: null,
    activeChatId: null,
    ui: {
      locale: 'ru',
      showThinking: true,
      autoOpenArtifact: true,
      artifactTab: 'preview',
      sidebarWidth: 300,
      sidebarCollapsed: false,
      theme: 'light'
    }
  });

  const S = {
    data: defaults(),
    route: 'setup', // setup | providers | connections | settings | chat
    backRoute: 'chat',
    modal: null,
    artifact: { open: false, key: null, tab: 'preview', live: true },
    streaming: false,
    toolRuns: [],
    approvals: [],
    draftArtifacts: [],
    draftRev: 0
  };

  const save = U.debounce(async () => {
    try {
      await api.store.set(S.data);
    } catch (err) {
      console.error('save failed', err);
    }
  }, 250);

  S.persist = () => save();
  S.persistNow = () => api.store.set(S.data);

  S.load = async () => {
    const raw = await api.store.get();
    S.data = Object.assign(defaults(), raw || {});
    S.data.ui = Object.assign(defaults().ui, S.data.ui || {});
    // Chats in memory hold transient stream bookkeeping; never persisted.
    S.data.chats.forEach((c) => {
      c.messages.forEach((m) => {
        if (m.status === 'streaming') m.status = 'done';
      });
    });
    return S.data;
  };

  S.emit = (name, detail) => document.dispatchEvent(new CustomEvent(`state:${name}`, { detail }));
  S.on = (name, fn) => document.addEventListener(`state:${name}`, fn);

  /* ---------------- lookups ---------------- */
  S.provider = (id) => S.data.providers.find((p) => p.id === id) || null;
  S.agent = (id) => S.data.agents.find((a) => a.id === id) || null;
  S.chat = (id) => S.data.chats.find((c) => c.id === id) || null;
  S.project = (id) => S.data.projects.find((project) => project.id === id) || null;
  S.connection = (id) => S.data.connections.find((c) => c.id === id) || null;
  S.activeAgent = () => S.agent(S.data.activeAgentId);
  S.activeChat = () => S.chat(S.data.activeChatId);

  S.agentChats = (agentId) => S.data.chats.filter((c) => c.agentId === agentId);
  S.projectChats = (projectId) => S.data.chats.filter((c) => c.projectId === projectId);

  S.agentConnections = (agent) => {
    if (!agent) return [];
    const ids = agent.connectionIds || [];
    return S.data.connections.filter((c) => c.enabled && ids.includes(c.id));
  };

  S.toolsForAgent = (agent) => {
    const conns = S.agentConnections(agent);
    const result = window.Mcp.toolsForConnections(conns, null);
    for (const tool of window.Mcp.REMINDER_TOOLS) {
      const name = tool.function.name;
      const label = {
        create_reminder: S.data.ui.locale === 'en' ? 'Set a reminder' : 'Поставить напоминание',
        list_reminders: S.data.ui.locale === 'en' ? 'List reminders' : 'Список напоминаний',
        cancel_reminder: S.data.ui.locale === 'en' ? 'Cancel a reminder' : 'Отменить напоминание'
      }[name];
      result.tools.push(tool);
      result.map[name] = {
        reminder: true,
        operation: name,
        connection: { title: S.data.ui.locale === 'en' ? 'Reminders' : 'Напоминания' },
        tool: { name: label }
      };
    }
    if (agent?.webSearch === true) {
      const tool = window.Mcp.WEB_SEARCH_TOOL;
      result.tools.push(tool);
      result.map[tool.function.name] = {
        webSearch: true,
        connection: { title: 'DuckDuckGo' },
        tool: { name: S.data.ui.locale === 'en' ? 'Search the web' : 'Поиск в интернете' }
      };
    }
    if (agent?.computerControl === true) {
      for (const tool of window.Mcp.COMPUTER_CONTROL_TOOLS) {
        const name = tool.function.name;
        result.tools.push(tool);
        result.map[name] = {
          computerControl: true,
          operation: name,
          connection: { title: S.data.ui.locale === 'en' ? 'This computer' : 'Этот компьютер' },
          tool: { name: name.replaceAll('_', ' ') }
        };
      }
    }
    return result;
  };

  S.modelLabel = (agent) => {
    if (!agent) return 'no model';
    const p = S.provider(agent.providerId);
    const m = p && (p.models || []).find((x) => x.id === agent.modelId);
    return m ? m.name : agent.modelId || 'no model';
  };

  /* ---------------- mutations ---------------- */
  S.set = (mutator) => {
    mutator(S.data);
    S.persist();
    S.emit('change');
  };

  S.touchChat = (chat) => {
    chat.updatedAt = Date.now();
    const i = S.data.chats.indexOf(chat);
    if (i > 0) {
      S.data.chats.splice(i, 1);
      S.data.chats.unshift(chat);
    }
  };

  S.newChat = (agentId, { silent = false, projectId = null } = {}) => {
    const chat = {
      id: U.uid('chat'),
      agentId,
      projectId: S.project(projectId)?.id || null,
      title: 'New chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    S.data.chats.unshift(chat);
    if (!silent) {
      S.data.activeAgentId = agentId;
      S.data.activeChatId = chat.id;
      S.route = 'chat';
      S.persist();
      S.emit('change');
    }
    return chat;
  };

  S.moveChatToProject = (chatId, projectId) => {
    const chat = S.chat(chatId);
    if (!chat || (projectId && !S.project(projectId))) return;
    chat.projectId = projectId || null;
    S.persist();
    S.emit('change');
  };

  S.deleteProject = (projectId) => {
    if (!S.project(projectId)) return;
    S.data.projects = S.data.projects.filter((project) => project.id !== projectId);
    S.data.chats.forEach((chat) => {
      if (chat.projectId === projectId) chat.projectId = null;
    });
    S.persist();
    S.emit('change');
  };

  S.ensureChat = (agentId) => {
    const existing = S.agentChats(agentId)[0];
    if (existing) return existing;
    return S.newChat(agentId, { silent: true });
  };

  S.openAgent = (agentId) => {
    const chat = S.ensureChat(agentId);
    S.data.activeAgentId = agentId;
    S.data.activeChatId = chat.id;
    S.route = 'chat';
    S.backRoute = 'chat';
    S.artifact.open = false;
    S.persist();
    S.emit('change');
  };

  S.openChat = (chatId) => {
    const chat = S.chat(chatId);
    if (!chat) return;
    S.data.activeChatId = chatId;
    S.data.activeAgentId = chat.agentId;
    S.route = 'chat';
    S.artifact.open = false;
    S.persist();
    S.emit('change');
  };

  S.openRoute = (route) => {
    if (route !== 'chat') S.backRoute = 'chat';
    S.route = route;
    S.emit('change');
  };

  S.deleteChat = (chatId) => {
    const i = S.data.chats.findIndex((c) => c.id === chatId);
    if (i < 0) return;
    S.data.chats.splice(i, 1);
    if (S.data.activeChatId === chatId) {
      const next = S.data.chats.find((c) => c.agentId === S.data.activeAgentId);
      S.data.activeChatId = next ? next.id : null;
    }
    S.persist();
    S.emit('change');
  };

  S.deleteAgent = (agentId) => {
    S.data.agents = S.data.agents.filter((a) => a.id !== agentId);
    S.data.chats = S.data.chats.filter((c) => c.agentId !== agentId);
    if (S.data.activeAgentId === agentId) {
      S.data.activeAgentId = S.data.agents[0]?.id || null;
      S.data.activeChatId = null;
      if (S.data.activeAgentId) S.ensureChat(S.data.activeAgentId);
    }
    S.persist();
    S.emit('change');
  };

  S.deleteProvider = (providerId) => {
    S.data.providers = S.data.providers.filter((p) => p.id !== providerId);
    const fallback = S.data.providers[0];
    S.data.agents.forEach((a) => {
      if (a.providerId !== providerId) return;
      a.providerId = fallback ? fallback.id : null;
      a.modelId = fallback && fallback.models && fallback.models[0] ? fallback.models[0].id : null;
    });
    S.persist();
    S.emit('change');
  };

  S.moveChatToAgent = (chatId, agentId) => {
    const chat = S.chat(chatId);
    const agent = S.agent(agentId);
    if (!chat || !agent) return;
    chat.agentId = agentId;
    chat.messages
      .filter((m) => m.role === 'assistant')
      .forEach((m) => {
        m.authorId = agentId;
      });
    S.touchChat(chat);
    S.emit('change');
  };

  S.renameChat = (chatId, title) => {
    const chat = S.chat(chatId);
    if (!chat) return;
    chat.title = title.trim() || 'Untitled';
    S.emit('change');
  };

  S.artifactForChat = (chatId) => {
    const chat = S.chat(chatId);
    if (!chat) return null;
    let best = null;
    for (const m of chat.messages) {
      for (const a of m.artifacts || []) if (!best || a.version >= best.version) best = a;
    }
    return best;
  };

  S.artifactById = (chatId, artifactId) => {
    const chat = S.chat(chatId);
    if (!chat) return null;
    for (const m of chat.messages) {
      for (const a of m.artifacts || []) if (a.id === artifactId) return a;
    }
    return null;
  };

  window.S = S;
})();
