/* ------------------------------------------------------------------ *
 * Views: sidebar, chat, thinking, artifact panel
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const U = window.U;
  const S = window.S;

  const V = {};

  /* ================================================================== *
   * Shared bits
   * ================================================================== */
  V.avatarHTML = (agent, size = 'md') => {
    if (!agent) return `<span class="avatar ${size}">?</span>`;
    if (/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(agent.avatar || '')) {
      return `<img class="avatar ${size}" src="${U.esc(agent.avatar)}" alt="" />`;
    }
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(agent.avatar || '')) {
      return `<img class="avatar ${size}" src="assets/avatars/${U.esc(agent.avatar)}" alt="" />`;
    }
    return `<span class="avatar ${size}">${U.esc(U.initials(agent.name))}</span>`;
  };

  V.providerName = (id) => S.provider(id)?.name || 'No provider';

  /* ================================================================== *
   * Sidebar
   * ================================================================== */
  V.renderSidebar = () => {
    const q = (U.qs('#chat-search')?.value || '').toLowerCase().trim();
    const chat = S.activeChat();
    const visible = S.data.chats.filter((c) => {
      if (S.streaming && window.ChatRT.Live.chatId === c.id) return true;
      const agent = S.agent(c.agentId);
      const hay = `${c.title} ${agent ? agent.name : ''} ${U.truncate(c.messages[c.messages.length - 1]?.text, 120)}`.toLowerCase();
      return !q || hay.includes(q);
    });

    const list = U.qs('#chat-list');
    if (!visible.length) {
      list.innerHTML = `<div class="empty-note">${S.data.chats.length ? 'Nothing matches.' : 'No agents yet.<br/>Hit “+ New Agent”.'}</div>`;
    } else {
      list.innerHTML = visible
        .map((c) => {
          const agent = S.agent(c.agentId);
          const last = c.messages[c.messages.length - 1];
          const unreadDot = window.ChatRT.Live.chatId === c.id && S.streaming;
          const snippet = unreadDot
            ? `<span class="thinking-mini">${U.esc(window.ChatRT.Live.thought)}</span>`
            : U.esc(U.truncate(last ? last.text : window.I18n.t('No messages'), 46)) || window.I18n.t('No messages');
          return `<button class="chat-item ${c.id === chat?.id ? 'active' : ''}" data-chat="${c.id}">
            <span class="avatar-wrap">${V.avatarHTML(agent, 'sm')}<span class="presence ${agent ? 'on' : 'off'}"></span></span>
            <span class="chat-item-body">
              <span class="chat-item-top">
                <span class="chat-item-name">${U.esc(agent ? agent.name : 'Unknown agent')}</span>
                <span class="chat-item-time">${U.relTime(c.updatedAt || c.createdAt)}</span>
              </span>
              <span class="chat-item-snip">${snippet}</span>
            </span>
            <span class="chat-item-menu" data-chat-menu="${c.id}" title="Chat options">⋯</span>
          </button>`;
        })
        .join('');
    }
    U.qs('#providers-count').textContent = S.data.providers.length ? `${S.data.providers.length}` : '';
    U.qs('#connections-count').textContent = S.data.connections.length ? `${S.data.connections.length}` : '';
    U.qs('#btn-sidebar-providers').classList.toggle('has-badge', !S.data.providers.length);
    U.qs('#btn-sidebar-connections').classList.toggle('has-badge', false);
  };

  V.bindSidebar = () => {
    const list = U.qs('#chat-list');
    list.addEventListener('click', (e) => {
      const menu = e.target.closest('[data-chat-menu]');
      if (menu) {
        e.stopPropagation();
        window.App.chatMenu(menu.dataset.chatMenu, menu);
        return;
      }
      const item = e.target.closest('[data-chat]');
      if (item) {
        S.openChat(item.dataset.chat);
      }
    });
    list.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('[data-chat]');
      if (!item) return;
      e.preventDefault();
      window.App.chatMenu(item.dataset.chat, e);
    });
    U.qs('#chat-search').addEventListener('input', () => V.renderSidebar());
  };

  /* ================================================================== *
   * Chat pane
   * ================================================================== */
  const statusLabel = (m) => {
    if (m.status === 'error') return 'ERROR';
    if (m.status === 'stopped') return 'STOPPED';
    return m.finishReason ? String(m.finishReason).toUpperCase() : 'REPLY';
  };

  function toolRunHTML(run) {
    const statusIcon = run.status === 'running' ? '<span class="spinner"></span>' : run.status === 'error' ? '!' : '✓';
    const args = run.args
      ? U.esc(U.truncate((() => { try { return JSON.stringify(JSON.parse(run.args)); } catch { return run.args; } })(), 140))
      : '{}';
    return `<details class="tool-run ${run.status}">
      <summary>
        <span class="tool-status">${statusIcon}</span>
        <span class="tool-title"><b>${U.esc(run.connectionTitle)}</b> · ${U.esc(run.label)}</span>
        <span class="tool-ms">${run.ms ? `${run.ms} ms` : run.status === 'running' ? 'running' : ''}</span>
      </summary>
      <div class="tool-body">
        <div class="tool-row"><span class="tag">args</span><code>${args}</code></div>
        <div class="tool-row"><span class="tag">result</span><pre>${U.esc(run.output || '(waiting)')}</pre></div>
      </div>
    </details>`;
  }

  function reasoningHTML(m, live) {
    if (!S.data.ui.showThinking) return '';
    const reasoning = live ? window.ChatRT.Live.reasoning : m.reasoning;
    if (!reasoning || !reasoning.trim()) return '';
    return `<details class="reasoning ${live ? 'live' : ''}" ${live ? 'open' : ''}>
      <summary><span class="reasoning-label">REASONING</span><span class="reasoning-hint">${live ? 'live' : `${reasoning.split(/\s+/).length} words`}</span></summary>
      <div class="reasoning-body">${U.esc(reasoning)}</div>
    </details>`;
  }

  function artifactCardHTML(a) {
    const open = S.artifact.open && S.artifact.key && S.artifact.key.id === a.id;
    return `<button class="artifact-card ${open ? 'active' : ''}" data-open-artifact="${a.id}">
      <span class="artifact-card-icon">{ }</span>
      <span class="artifact-card-body">
        <span class="artifact-card-name">${U.esc(a.name)}</span>
        <span class="artifact-card-meta">Artifact v${a.version} · ${a.label} · ${a.sizes.lines} lines · ${U.bytes(a.sizes.bytes)}</span>
      </span>
      <span class="artifact-card-cta">${open ? 'Open' : 'Open'}</span>
    </button>`;
  }

  function assistantHTML(m, chat, live) {
    const agent = S.agent(m.authorId) || S.agent(chat.agentId);
    const streaming = m.status === 'streaming';
    const text = live ? window.ChatRT.Live.text : m.text;
    const isError = m.status === 'error' || m.status === 'stopped';
    const cls = `msg assistant ${live ? 'live' : ''} ${isError ? 'error' : ''}`;
    return `<div class="${cls}" data-msg="${m.id}">
      ${V.avatarHTML(agent, 'md')}
      <div class="msg-col">
        <div class="msg-meta">
          <span class="msg-author">${U.esc(agent ? agent.name : 'Agent')}</span>
          <span class="msg-model">${U.esc(S.modelLabel(agent))}</span>
          <span class="msg-time">${U.time(m.createdAt)}</span>
        </div>
        ${reasoningHTML(m, live)}
        ${live ? V.liveToolRuns() : (m.toolRuns || []).map(toolRunHTML).join('')}
        ${text ? `<div class="msg-text ${streaming ? 'streaming' : ''}">${U.md(stripFencesWhileStreaming(text, streaming))}${streaming ? '<span class="caret"></span>' : ''}</div>` : ''}
        ${live && !text ? V.thinkingHTML() : ''}
        ${!live && (m.artifacts || []).length ? `<div class="artifact-cards">${m.artifacts.map(artifactCardHTML).join('')}</div>` : ''}
        ${!live && !isError ? `<div class="msg-actions">
            <button class="mini-btn" data-copy-msg="${m.id}" title="Copy">Copy</button>
            <button class="mini-btn" data-regen title="Regenerate">Retry</button>
          </div>` : ''}
      </div>
    </div>`;
  }

  function stripFencesWhileStreaming(text, streaming) {
    if (!streaming) return text;
    // Keep an unterminated fence visible but neutralised (the artifact panel
    // shows the assembled file once the reply is complete).
    const parts = text.split('```');
    if (parts.length % 2 === 0) return `${parts.slice(0, -1).join('```')}\n`;
    return text;
  }

  function userHTML(m) {
    return `<div class="msg user" data-msg="${m.id}">
      <div class="msg-col">
        <div class="bubble">${U.md(m.text)}</div>
        <div class="msg-meta right"><span class="msg-time">${U.time(m.createdAt)}</span></div>
      </div>
    </div>`;
  }

  V.thinkingHTML = () => {
    const L = window.ChatRT.Live;
    const label =
      L.phase === 'tools' || L.phase === 'reading' ? L.thought || Thoughts.next('chat') : L.thought || Thoughts.next('chat');
    return `<div class="thinking" id="thinking">
      <span class="thinking-agent">${U.esc(S.agent(S.data.activeAgentId)?.name || 'Agent')}</span>
      <span class="thinking-label" id="thinking-label">${U.esc(label)}</span>
      <span class="thinking-dots"><i></i><i></i><i></i></span>
    </div>`;
  };

  V.liveToolRuns = () => window.ChatRT.Live.toolRuns.map(toolRunHTML).join('');

  V.renderChat = () => {
    const view = U.qs('#chat-view');
    const host = U.qs('#chat-composer-host');
    const agent = S.agent(S.data.activeAgentId);
    const chat = S.chat(S.data.activeChatId);

    if (!agent) {
      view.innerHTML = `<div class="chat-empty">
        <img class="empty-logo" src="assets/logo.png" alt="" />
        <h2>No agents yet</h2>
        <p>Create your first agent, give it a name, an avatar and a system prompt.</p>
        <button class="btn primary" data-action="new-agent">+ New Agent</button>
      </div>`;
      host.innerHTML = '';
      window.App.syncArtifactPane();
      return;
    }

    const head = `<div class="chat-head">
      <div class="chat-head-left">
        ${V.avatarHTML(agent, 'md')}
        <div class="chat-head-titles">
          <div class="chat-head-name">${U.esc(agent.name)}</div>
          <div class="chat-head-sub">${U.esc(S.modelLabel(agent))} · <span class="muted">${U.esc(V.providerName(agent.providerId))}</span>${S.agentConnections(agent).length ? ` · <span class="conn-badge">${S.agentConnections(agent).length} connection${S.agentConnections(agent).length > 1 ? 's' : ''}</span>` : ''}</div>
        </div>
      </div>
      <div class="chat-head-actions">
        <button class="btn ghost small" data-action="edit-agent">Edit</button>
        <button class="btn ghost small" data-action="new-chat-for-agent" title="New chat">+ Chat</button>
        <button class="btn ghost small icon" data-action="agent-menu" title="More">⋯</button>
      </div>
    </div>`;

    const messages = chat ? chat.messages : [];
    const body = messages.length
      ? messages
          .map((m) => {
            if (m.role === 'user') return userHTML(m);
            const live = m.status === 'streaming' && window.ChatRT.Live.messageId === m.id;
            return assistantHTML(m, chat, live);
          })
          .join('')
      : `<div class="chat-intro">
          ${V.avatarHTML(agent, 'xl')}
          <h2>${U.esc(agent.name)}</h2>
          <p class="prompt-preview">${U.esc(U.truncate(agent.systemPrompt || window.I18n.t('No system prompt.'), 220))}</p>
          ${S.agentConnections(agent).length ? `<div class="intro-conn">Toolbelt: ${S.agentConnections(agent).map((c) => `<span class="pill">${U.esc(c.title)}</span>`).join(' ')}</div>` : ''}
        </div>`;

    view.innerHTML = `${head}<div class="messages" id="messages">${body}</div>`;

    const canSend = !S.streaming;
    host.innerHTML = `<div class="composer">
        ${S.agentConnections(agent).length ? `<div class="composer-tools">${S.agentConnections(agent).map((c) => `<span class="pill">${U.esc(c.title)}</span>`).join('')}</div>` : ''}
        <div class="composer-box">
          <textarea id="composer-input" rows="1" placeholder="${window.I18n.ru() ? 'Сообщение для' : 'Message'} ${U.esc(agent.name)}…" ${canSend ? '' : 'disabled'}></textarea>
          <div class="composer-side">
            ${S.streaming ? '<button class="btn danger small" data-action="stop">Stop</button>' : '<button class="btn primary small send" data-action="send" title="Send (Enter)">Send</button>'}
          </div>
        </div>
        <div class="composer-hint">Enter to send · Shift+Enter for a new line · code replies become one artifact</div>
      </div>`;
    const ta = U.qs('#composer-input');
    if (ta) {
      autosize(ta);
      ta.addEventListener('input', () => autosize(ta));
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          window.App.sendFromComposer();
        }
      });
    }
    scrollToBottom(chat);
    window.App.afterRender();
  };

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }

  function scrollToBottom(chat) {
    const box = U.qs('#messages');
    if (!box) return;
    const lastUser = [...box.querySelectorAll('.msg.user')].pop();
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 220;
    if (nearBottom || (window.ChatRT.Live.messageId && box.dataset.lastMsg !== window.ChatRT.Live.messageId)) {
      box.scrollTop = box.scrollHeight;
      box.dataset.lastMsg = window.ChatRT.Live.messageId || '';
    }
    if (lastUser && box.scrollTop === 0) box.scrollTop = box.scrollHeight;
  }

  /** Cheap per-token update: patch the live message only. */
  V.streamTick = U.throttle(({ contentChanged } = {}) => {
    const L = window.ChatRT.Live;
    const liveEl = U.qs('#messages .msg.live');
    if (!liveEl) {
      V.renderChat();
      return;
    }
    const textEl = liveEl.querySelector('.msg-text') || null;
    const thinking = U.qs('#thinking');
    if (L.text) {
      if (!textEl) {
        V.renderChat();
        return;
      }
      textEl.innerHTML = `${U.md(stripFencesWhileStreaming(L.text, true))}<span class="caret"></span>`;
      if (thinking) thinking.remove();
    }
    if (!L.text && !liveEl.querySelector('#thinking')) {
      V.renderChat();
      return;
    }
    const reasoning = liveEl.querySelector('.reasoning-body');
    if (reasoning && L.reasoning) reasoning.textContent = L.reasoning;
    else if (L.reasoning && !reasoning) V.renderChat();
    const label = U.qs('#thinking-label');
    if (label && Date.now() - L.lastTick < 2600) {
      // still "fresh": keep the current caption
    } else if (label) {
      L.thought = Thoughts.next(L.codeSeen ? 'code' : L.phase === 'tools' ? 'chat' : 'chat');
      label.textContent = L.thought;
      L.lastTick = Date.now();
    }
    const msgs = U.qs('#messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 80);

  // Rotate captions on a timer so long tool waits still feel alive.
  setInterval(() => {
    if (!document.body.contains(U.qs('#thinking-label'))) return;
    const L = window.ChatRT.Live;
    if (Date.now() - (L.lastTick || 0) < 2600) return;
    L.thought = Thoughts.next(L.codeSeen ? 'code' : 'chat');
    L.lastTick = Date.now();
    U.qs('#thinking-label').textContent = L.thought;
  }, 1200);

  V.bindChat = () => {
    U.qs('#chat-view').addEventListener('click', (e) => {
      const art = e.target.closest('[data-open-artifact]');
      if (art) {
        window.App.openArtifact(art.dataset.openArtifact);
        return;
      }
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        const block = copy.closest('.code-block').querySelector('code');
        U.clipboard(block.textContent).then(() => window.TOAST('Copied'));
        return;
      }
      const copyMsg = e.target.closest('[data-copy-msg]');
      if (copyMsg) {
        const chat = S.chat(S.data.activeChatId);
        const m = chat && chat.messages.find((x) => x.id === copyMsg.dataset.copyMsg);
        if (m) U.clipboard(m.text).then(() => window.TOAST('Reply copied'));
        return;
      }
      if (e.target.closest('[data-regen]')) {
        window.ChatRT.regenerate();
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'send') window.App.sendFromComposer();
      else if (action === 'stop') window.ChatRT.stop();
      else if (action === 'new-agent') window.App.openAgentEditor(null);
      else if (action === 'edit-agent') window.App.openAgentEditor(S.data.activeAgentId);
      else if (action === 'new-chat-for-agent') {
        S.newChat(S.data.activeAgentId);
      } else if (action === 'agent-menu') {
        window.App.agentMenu(e.target.closest('[data-action="agent-menu"]'));
      }
    });
    U.qs('#chat-composer-host').addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'send') window.App.sendFromComposer();
      else if (action === 'stop') window.ChatRT.stop();
    });
  };

  /* ================================================================== *
   * Artifact panel
   * ================================================================== */
  V.currentArtifact = () => {
    if (!S.artifact.key) return null;
    return S.artifactById(S.artifact.key.chatId, S.artifact.key.id);
  };

  V.renderArtifactPane = () => {
    const pane = U.qs('#artifact-pane');
    const art = V.currentArtifact();
    if (!S.artifact.open || !art) {
      pane.classList.add('hidden');
      return;
    }
    pane.classList.remove('hidden');
    U.qsa('.tab', pane).forEach((t) => t.classList.toggle('active', t.dataset.artifactTab === S.artifact.tab));
    const agent = S.agent(art.agentId);
    U.qs('#artifact-meta').innerHTML = `
      <div class="am-title">${U.esc(art.name)}</div>
      <div class="am-sub"><span class="chip">v${art.version}</span><span class="chip">${art.label}</span>
        <span class="chip">${art.sizes.lines} lines</span><span class="chip">${U.bytes(art.sizes.bytes)}</span>
        ${agent ? `<span class="chip">by ${U.esc(agent.name)}</span>` : ''}</div>`;

    const body = U.qs('#artifact-body');
    if (S.artifact.tab === 'preview' && art.mode === 'html') {
      const key = `${art.id}`;
      if (body.dataset.previewKey === key) return;
      body.dataset.previewKey = key;
      const existingFrame = body.querySelector('iframe');
      const doc = art.code;
      if (existingFrame) {
        existingFrame.srcdoc = doc;
      } else {
        body.innerHTML = '<iframe class="artifact-frame" sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"></iframe>';
        const frame = body.querySelector('iframe');
        frame.addEventListener('load', () => {
          const w = frame.contentWindow;
          if (!w) return;
          w.addEventListener('keydown', (e2) => {
            if (e2.key === 'Enter' || e2.key === ' ') {
              const el = w.document.activeElement;
              if (el && el.tagName === 'BUTTON') el.click();
            }
          });
        });
        frame.srcdoc = doc;
      }
      return;
    }
    body.dataset.previewKey = '';
    body.innerHTML = S.artifact.tab === 'preview'
      ? `<div class="artifact-plain"><div class="plain-note">This artifact is ${art.label}, not a web document — showing the source.</div>${codeView(art)}</div>`
      : `<div class="artifact-code">${codeView(art)}</div>`;
  };

  function codeView(art) {
    const lines = art.code.split('\n');
    return `<div class="code-view"><div class="gutter">${lines
      .map((_, i) => `<span>${i + 1}</span>`)
      .join('')}</div><pre class="code-source"><code>${U.esc(art.code)}</code></pre></div>`;
  }

  V.bindArtifact = () => {
    U.qs('#artifact-pane').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-artifact-tab]');
      if (tab) {
        S.artifact.tab = tab.dataset.artifactTab;
        V.renderArtifactPane();
        return;
      }
      if (e.target.closest('#artifact-close')) {
        S.artifact.open = false;
        V.renderArtifactPane();
        V.renderChat();
        return;
      }
      if (e.target.closest('#artifact-save')) {
        window.App.saveArtifact();
      }
    });
  };

  window.Views = V;
})();
