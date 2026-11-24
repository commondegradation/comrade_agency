/* ------------------------------------------------------------------ *
 * Comrade Agency — app shell
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const U = window.U;
  const S = window.S;

  const App = {};
  let lastScreenKey = null;
  let screenEnterFrame = 0;

  window.TOAST = (message, kind = 'info') => {
    const root = U.qs('#toast-root');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, kind === 'error' ? 5200 : 2800);
  };

  /* ================================================================== *
   * Routing / render
   * ================================================================== */
  App.refresh = () => {
    const { data } = S;
    const hasSetup = data.providers.length > 0 && data.agents.length > 0;
    const screenKey = `${S.route}:${S.route === 'chat' ? data.activeChatId || '' : ''}`;
    const initialScreen = lastScreenKey === null && hasSetup;
    const animateScreen = lastScreenKey !== null && screenKey !== lastScreenKey;
    lastScreenKey = hasSetup ? screenKey : null;
    const setup = U.qs('#view-setup');
    const main = U.qs('#view-main');

    if (!hasSetup && (S.route === 'setup' || S.route === 'chat')) {
      setup.classList.remove('hidden');
      main.classList.add('hidden');
      window.Views.renderSetup();
      return;
    }
    setup.classList.add('hidden');
    main.classList.remove('hidden');

    U.qsa('.top-nav [data-route]').forEach((b) => b.classList.toggle('active', b.dataset.route === S.route));

    const chatPane = U.qs('.chat-pane');
    const chatView = U.qs('#chat-view');
    const composerHost = U.qs('#chat-composer-host');
    const artifactPane = U.qs('#artifact-pane');

    if (screenEnterFrame) {
      cancelAnimationFrame(screenEnterFrame);
      screenEnterFrame = 0;
    }
    if (S.route === 'chat') {
      chatPane.classList.remove('page-mode');
      window.Views.renderChat();
      window.Views.renderSidebar();
      window.Views.renderArtifactPane();
      document.body.classList.toggle('artifact-open', S.artifact.open);
    } else {
      chatPane.classList.add('page-mode');
      composerHost.innerHTML = '';
      artifactPane.classList.add('hidden');
      document.body.classList.remove('artifact-open');
      if (S.route === 'providers') window.Views.renderProviders();
      else if (S.route === 'connections') window.Views.renderConnections();
      else if (S.route === 'artifacts') window.Views.renderArtifactLibrary();
      else if (S.route === 'settings') window.Views.renderSettings();
      window.Views.renderSidebar();
    }

    if (animateScreen || initialScreen) {
      const animationClass = animateScreen ? 'screen-enter' : 'initial-enter';
      const animationName = animateScreen ? 'screen-enter' : 'pane-in';
      chatPane.classList.remove('screen-enter', 'initial-enter');
      chatPane.onanimationend = (event) => {
        if (event.target === chatPane && event.animationName === animationName) {
          chatPane.classList.remove(animationClass);
        }
      };
      screenEnterFrame = requestAnimationFrame(() => {
        screenEnterFrame = 0;
        chatPane.classList.add(animationClass);
      });
    }
  };

  App.afterRender = () => {
    const ta = U.qs('#composer-input');
    if (ta && document.activeElement !== ta && !S.streaming) {
      // focus only when the chat pane is active
      if (S.route === 'chat' && !U.qs('#modal-root')?.classList.contains('hidden') === false) ta.focus();
    }
    App.applySidebarWidth();
  };

  App.syncArtifactPane = () => window.Views.renderArtifactPane();

  App.applySidebarWidth = () => {
    const w = Number(S.data.ui.sidebarWidth) || 300;
    const collapsed = Boolean(S.data.ui.sidebarCollapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    U.qs('#sidebar').style.width = `${collapsed ? 68 : w}px`;
    const toggle = U.qs('#btn-sidebar-toggle');
    toggle.textContent = collapsed ? '›' : '‹';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', window.I18n.t(collapsed ? 'Expand sidebar' : 'Collapse sidebar'));
    toggle.title = window.I18n.t(collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  };

  App.applyTheme = () => {
    document.documentElement.dataset.theme = S.data.ui.theme === 'dark' ? 'dark' : 'light';
  };

  /* ================================================================== *
   * Actions
   * ================================================================== */
  App.sendFromComposer = async () => {
    const ta = U.qs('#composer-input');
    if (!ta) return;
    const text = ta.value;
    const sent = await window.ChatRT.send(text, window.Views.composerFiles());
    if (!sent) return;
    const currentInput = U.qs('#composer-input');
    if (currentInput) {
      currentInput.value = '';
      currentInput.style.height = 'auto';
    }
    window.Views.clearComposerFiles();
  };

  App.openAgentEditor = (id) => window.Views.openAgentEditor(id);
  App.openProviderEditor = (id) => window.Views.openProviderEditor(id);
  App.openConnectionsCatalog = () => window.Views.openConnectionsCatalog();

  App.openArtifact = (artifactId) => {
    const chat = S.chat(S.data.activeChatId);
    if (!chat) return;
    const art = S.artifactById(chat.id, artifactId);
    if (!art) return;
    S.artifact = {
      open: true,
      key: { chatId: chat.id, id: art.id },
      tab: art.mode === 'html' || art.mode === 'markdown' ? 'preview' : 'code',
      live: true
    };
    window.Views.renderArtifactPane();
    window.Views.renderChat();
    document.body.classList.add('artifact-open');
  };

  App.openLibraryArtifact = (chatId, artifactId) => {
    if (!S.artifactById(chatId, artifactId)) return;
    S.openChat(chatId);
    App.openArtifact(artifactId);
  };

  App.downloadArtifact = async (art, name = art?.name) => {
    if (!art) return;
    try {
      const res = await window.comrade.files.save({
        name,
        content: art.code,
        filterName: art.label,
        ext: art.ext
      });
      if (res.ok) window.TOAST(`Saved ${name}`);
    } catch (error) {
      window.TOAST(error.message || String(error), 'error');
    }
  };

  App.saveArtifact = async () => {
    await App.downloadArtifact(window.Views.currentArtifact());
  };

  App.chatMenu = (chatId, anchor) => {
    const chat = S.chat(chatId);
    if (!chat) return;
    const items = [
      { label: 'New chat', run: () => S.newChat(chat.agentId, { projectId: chat.projectId }) },
      ...S.data.projects.map((project) => ({
        label: `${window.I18n.t(chat.projectId === project.id ? 'Remove from project' : 'Move to project')}: ${project.name}`,
        run: () => S.moveChatToProject(chatId, chat.projectId === project.id ? null : project.id)
      })),
      {
        label: 'Rename…',
        run: () => {
          const name = prompt(window.I18n.t('Chat title'), chat.title);
          if (name) S.renameChat(chatId, name);
        }
      },
      { label: 'Edit agent', run: () => App.openAgentEditor(chat.agentId) },
      { label: 'Delete chat', run: () => S.deleteChat(chatId), danger: true }
    ];
    showMenu(anchor, items);
  };

  App.projectMenu = (projectId, anchor) => {
    const project = S.project(projectId);
    if (!project) return;
    showMenu(anchor, [
      { label: 'Open project', run: () => window.Views.openProjectWorkspace(projectId) },
      { label: 'Edit project', run: () => window.Views.openProjectEditor(projectId) },
      {
        label: 'Delete project',
        danger: true,
        run: () => {
          if (!confirm(`Delete project "${project.name}"? Chats will remain in All chats.`)) return;
          S.deleteProject(projectId);
          window.TOAST('Project deleted');
        }
      }
    ]);
  };

  App.agentMenu = (anchor) => {
    const agent = S.activeAgent();
    if (!agent) return;
    showMenu(anchor, [
      { label: 'New chat', run: () => S.newChat(agent.id, { projectId: S.activeChat()?.projectId }) },
      { label: 'Edit agent', run: () => App.openAgentEditor(agent.id) },
      { label: 'Providers', run: () => S.openRoute('providers') },
      { label: 'Delete agent', run: () => S.deleteAgent(agent.id), danger: true }
    ]);
  };

  function showMenu(anchor, items) {
    document.querySelectorAll('.popmenu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'popmenu';
    menu.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger-text' : ''}">${U.esc(window.I18n.t(it.label))}</button>`).join('');
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 12)}px`;
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      menu.remove();
      items[Number(b.dataset.i)].run();
    });
    setTimeout(() => {
      document.addEventListener('click', function close(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 0);
  }

  /* ================================================================== *
   * Global events
   * ================================================================== */
  function bindGlobal() {
    window.comrade.reminders.onDue((reminder) => {
      window.TOAST(`${window.I18n.t('Reminder')}: ${reminder.title}`);
    });
    window.comrade.reminders.onOpen((chatId) => {
      if (S.chat(chatId)) S.openChat(chatId);
    });

    document.addEventListener('click', (e) => {
      const libraryOpen = e.target.closest('[data-library-artifact-open]');
      if (libraryOpen) {
        App.openLibraryArtifact(libraryOpen.dataset.chatId, libraryOpen.dataset.libraryArtifactOpen);
        return;
      }
      const libraryDownload = e.target.closest('[data-library-artifact-download]');
      if (libraryDownload) {
        const chatId = libraryDownload.dataset.chatId;
        const artifactId = libraryDownload.dataset.libraryArtifactDownload;
        const art = S.artifactById(chatId, artifactId);
        if (!art) return;
        const dot = art.name.lastIndexOf('.');
        const name = dot > 0
          ? `${art.name.slice(0, dot)}-v${art.version}${art.name.slice(dot)}`
          : `${art.name}-v${art.version}.${art.ext}`;
        App.downloadArtifact(art, name);
        return;
      }
      const route = e.target.closest('[data-route]');
      if (route) {
        S.openRoute(route.dataset.route);
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      switch (action) {
        case 'add-provider':
          App.openProviderEditor(null);
          break;
        case 'edit-provider':
          App.openProviderEditor(e.target.closest('[data-id]').dataset.id);
          break;
        case 'delete-provider': {
          const id = e.target.closest('[data-id]').dataset.id;
          const p = S.provider(id);
          if (confirm(`Delete provider "${p?.name}"?`)) {
            S.deleteProvider(id);
            App.refresh();
            App.persistCurrentRoute();
          }
          break;
        }
        case 'test-provider': {
          const id = e.target.closest('[data-id]').dataset.id;
          const btn = e.target.closest('button');
          btn.textContent = 'Testing…';
          testProvider(id).then((msg) => {
            btn.textContent = 'Test';
            window.TOAST(msg, msg.startsWith('OK') ? 'info' : 'error');
          });
          break;
        }
        case 'catalog':
          App.openConnectionsCatalog();
          break;
        case 'remote-connection':
          window.Views.openConnectionEditor({});
          break;
        case 'reveal-store':
          window.comrade.store.reveal();
          break;
        case 'export-store':
          U.download('comrade-agency-export.json', JSON.stringify(S.data, null, 2), 'application/json');
          break;
        case 'reset-all':
          if (confirm('Delete every provider, agent, chat, connection and reminder?')) {
            localStorage.clear();
            window.comrade.store.set({ providers: [], agents: [], chats: [], reminders: [], connections: [], ui: S.data.ui }).then(() => location.reload());
          }
          break;
        default:
          break;
      }

      const syncBtn = e.target.closest('[data-conn-sync]');
      if (syncBtn) syncConnection(syncBtn.dataset.connSync, syncBtn);
      const editBtn = e.target.closest('[data-conn-edit]');
      if (editBtn) window.Views.openConnectionEditor({ connectionId: editBtn.dataset.connEdit });
      const delBtn = e.target.closest('[data-conn-delete]');
      if (delBtn) {
        const c = S.connection(delBtn.dataset.connDelete);
        if (confirm(`Remove the "${c?.title}" connection?`)) {
          S.set((data) => {
            data.connections = data.connections.filter((x) => x.id !== c.id);
            data.agents.forEach((a) => (a.connectionIds = (a.connectionIds || []).filter((id) => id !== c.id)));
          });
          App.refresh();
        }
      }
    });

    document.addEventListener('change', (e) => {
      const toggle = e.target.closest('[data-conn-toggle]');
      if (toggle) {
        const c = S.connection(toggle.dataset.connToggle);
        c.enabled = toggle.checked;
        S.persist();
        App.refresh();
      }
    });

    U.qs('#btn-new-agent').onclick = () => App.openAgentEditor(null);
    U.qs('#btn-sidebar-toggle').onclick = () => {
      S.data.ui.sidebarCollapsed = !S.data.ui.sidebarCollapsed;
      S.persist();
      App.applySidebarWidth();
      window.Views.renderSidebar();
    };
    U.qs('#btn-sidebar-providers').onclick = () => S.openRoute('providers');
    U.qs('#btn-sidebar-connections').onclick = () => S.openRoute('connections');

    // Sidebar resize
    const resizer = U.qs('#sidebar-resizer');
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => {
      dragging = true;
      e.preventDefault();
      document.body.classList.add('resizing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = Math.max(240, Math.min(460, e.clientX));
      S.data.ui.sidebarWidth = w;
      App.applySidebarWidth();
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing');
      S.persist();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!U.qs('#modal-root').classList.contains('hidden')) window.Views.closeModal();
        document.querySelectorAll('.popmenu').forEach((m) => m.remove());
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'n' && e.shiftKey) {
        e.preventDefault();
        if (S.data.activeAgentId) S.newChat(S.data.activeAgentId);
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        App.openAgentEditor(null);
      } else if (mod && e.key === ',') {
        e.preventDefault();
        S.openRoute('settings');
      }
    });

    window.comrade.onMenu((ev) => {
      if (ev === 'new-agent') App.openAgentEditor(null);
      else if (ev === 'new-chat' && S.data.activeAgentId) S.newChat(S.data.activeAgentId);
      else if (ev === 'settings') S.openRoute('settings');
      else if (ev === 'toggle-artifact') {
        const art = S.artifactForChat(S.data.activeChatId);
        if (art) App.openArtifact(art.id);
        else if (S.artifact.open) {
          S.artifact.open = false;
          App.refresh();
        }
      }
    });

    S.on('change', () => App.refresh());
  }

  async function testProvider(id) {
    const p = S.provider(id);
    if (!p) return 'Provider missing';
    try {
      const models = await window.comrade.ai.listModels({ providerId: id });
      return `OK — reachable, ${models.length} models available`;
    } catch (err) {
      return `Failed: ${err.message}`;
    }
  }

  async function syncConnection(id, btn) {
    const c = S.connection(id);
    if (!c) return;
    const label = btn.textContent;
    btn.textContent = 'Syncing…';
    try {
      const tools = await Mcp.connect(c);
      S.persist();
      window.TOAST(`${c.title}: ${tools.length} tools`);
    } catch (err) {
      c.status = 'error';
      c.lastError = err.message;
      S.persist();
      window.TOAST(`${c.title}: ${err.message}`, 'error');
    }
    btn.textContent = label;
    App.refresh();
  }

  App.persistCurrentRoute = () => App.refresh();

  /* ================================================================== *
   * Boot
   * ================================================================== */
  async function boot() {
    const info = await window.comrade.info();
    window.APP_VERSION = info.version;
    window.ELECTRON_VERSIONS = { electron: info.electron, chrome: info.chrome, node: info.node };
    window.DATA_DIR = info.dataDir;
    document.documentElement.classList.add(`platform-${info.platform}`);

    await S.load();
    App.applyTheme();
    window.I18n.init();

    // pick an existing conversation on launch
    if (S.data.chats.length) {
      const chat = S.data.chats.find((c) => c.id === S.data.activeChatId) || S.data.chats[0];
      S.data.activeChatId = chat.id;
      S.data.activeAgentId = chat.agentId;
      S.route = 'chat';
    } else if (S.data.agents.length) {
      S.data.activeAgentId = S.data.agents[0].id;
      const chat = S.ensureChat(S.data.activeAgentId);
      S.data.activeChatId = chat.id;
      S.route = 'chat';
    }

    window.Views.bindSidebar();
    window.Views.bindChat();
    window.Views.bindArtifact();
    bindGlobal();
    App.applySidebarWidth();
    App.refresh();

    const artifacts = S.artifactForChat(S.data.activeChatId);
    if (artifacts && artifacts.mode !== 'markdown' && S.data.ui.autoOpenArtifact) {
      S.artifact = {
        open: true,
        key: { chatId: S.data.activeChatId, id: artifacts.id },
        tab: artifacts.mode === 'html' ? 'preview' : 'code',
        live: true
      };
      App.refresh();
    }
  }

  window.App = App;
  window.addEventListener('DOMContentLoaded', () => {
    boot().catch((err) => {
      console.error(err);
      document.body.innerHTML = `<pre class="boot-error">Comrade Agency failed to start:\n\n${U.esc(err.stack || err.message)}</pre>`;
    });
  });
})();
