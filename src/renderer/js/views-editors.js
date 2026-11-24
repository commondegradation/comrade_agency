/* ------------------------------------------------------------------ *
 * Views: editor modals (provider, agent, connection)
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const U = window.U;
  const S = window.S;
  const V = window.Views;

  /* ================================================================== *
   * Modal shell
   * ================================================================== */
  V.modal = (title, bodyHTML, { wide = false, onMount, footHTML } = {}) => {
    const root = U.qs('#modal-root');
    root.classList.remove('hidden');
    root.innerHTML = `<div class="modal-backdrop"></div>
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${U.esc(title)}</h3><button class="btn ghost small icon" data-modal-close>✕</button></div>
        <div class="modal-body">${bodyHTML}</div>
        ${footHTML ? `<div class="modal-foot">${footHTML}</div>` : ''}
      </div>`;
    const scrim = root.querySelector('.modal-backdrop');
    scrim.onclick = () => V.closeModal();
    root.querySelectorAll('[data-modal-close]').forEach((button) => {
      button.onclick = () => V.closeModal();
    });
    if (onMount) onMount(root.querySelector('.modal'));
    return root;
  };

  V.closeModal = () => {
    const root = U.qs('#modal-root');
    root.classList.add('hidden');
    root.innerHTML = '';
    S.modal = null;
  };

  const fieldRow = (label, inner, hint) =>
    `<label class="field"><span class="field-label">${label}</span>${inner}${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;

  /* ================================================================== *
   * Provider editor
   * ================================================================== */
  V.openProviderEditor = (providerId) => {
    const editing = providerId ? S.provider(providerId) : null;
    const p = editing
      ? JSON.parse(JSON.stringify(editing))
      : { id: U.uid('prov'), name: '', baseUrl: '', apiKey: '', models: [], maxTokens: 4096, headers: {}, sendMaxTokens: true };

    const body = `
      <div class="presets">${V.PROVIDER_PRESETS.map((x) => `<button class="preset" data-preset="${x.id}">${U.esc(x.name)}</button>`).join('')}</div>
      ${fieldRow('Display name', `<input class="input" id="pv-name" value="${U.esc(p.name)}" placeholder="e.g. OpenAI — main" />`)}
      ${fieldRow('Base URL', `<input class="input mono" id="pv-url" value="${U.esc(p.baseUrl)}" placeholder="https://api.openai.com/v1" spellcheck="false" />`, 'OpenAI-compatible: requests go to <code>/chat/completions</code>.')}
      ${fieldRow('API key', `<div class="input-row"><input class="input mono" id="pv-key" type="password" value="${U.esc(p.apiKey)}" placeholder="${U.esc(V.PROVIDER_PRESETS[0].keyHint)}" spellcheck="false" /><button class="btn ghost small" id="pv-reveal" type="button">Show</button></div>`, 'Stored unencrypted in your local app data folder.')}
      <div class="field-row-2">
        ${fieldRow('Max output tokens', `<input class="input mono" id="pv-max" type="number" min="256" step="256" value="${Number(p.maxTokens) || 4096}" />`)}
        ${fieldRow('Extra headers (JSON)', `<input class="input mono" id="pv-headers" value="${U.esc(JSON.stringify(p.headers || {}))}" placeholder='{"HTTP-Referer":"https://…"}' spellcheck="false" />`)}
      </div>
      <div class="modal-section">
        <div class="modal-section-head">
          <span>Models</span>
          <div>
            <button class="btn ghost small" id="pv-discover" type="button">Fetch models</button>
          </div>
        </div>
        <div class="model-editor model-head"><span>Model ID</span><span>Display name</span><span></span></div>
        <div id="pv-models"></div>
        <div class="model-add">
          <input class="input mono" id="pv-new-id" placeholder="model id, e.g. gpt-4o" spellcheck="false" />
          <input class="input" id="pv-new-name" placeholder="display name" />
          <button class="btn ghost small" id="pv-add-model" type="button">+ Add</button>
        </div>
        <div class="field-hint" id="pv-status"></div>
      </div>`;

    S.modal = { kind: 'provider', draft: p };
    const root = V.modal(editing ? 'Edit provider' : 'Add provider', body, {
      wide: true,
      footHTML: `${editing ? '<button class="btn ghost danger-text" id="pv-delete">Delete</button>' : ''}
        <div class="spacer"></div>
        <button class="btn ghost" data-modal-close>Cancel</button>
        <button class="btn primary" id="pv-save">${editing ? 'Save provider' : 'Create provider'}</button>`
    });

    const drawModels = () => {
      const container = U.qs('#pv-models', root);
      container.innerHTML = p.models.length
        ? p.models
            .map(
              (m, i) => `<div class="model-editor" data-i="${i}">
                <input class="input mono" data-model-id="${i}" value="${U.esc(m.id)}" spellcheck="false" />
                <input class="input" data-model-name="${i}" value="${U.esc(m.name)}" />
                <button class="mini-btn danger-text" data-model-remove="${i}" type="button">Remove</button>
              </div>`
            )
            .join('')
        : `<div class="muted small pad">No models yet — add at least one.</div>`;
      U.qsa('[data-model-id]', root).forEach((inp) => {
        inp.oninput = () => {
          p.models[Number(inp.dataset.modelId)].id = inp.value.trim();
        };
      });
      U.qsa('[data-model-name]', root).forEach((inp) => {
        inp.oninput = () => {
          p.models[Number(inp.dataset.modelName)].name = inp.value;
        };
      });
      U.qsa('[data-model-remove]', root).forEach((b) => {
        b.onclick = () => {
          p.models.splice(Number(b.dataset.modelRemove), 1);
          drawModels();
        };
      });
    };
    drawModels();

    const addModel = () => {
      const id = U.qs('#pv-new-id', root).value.trim();
      const name = U.qs('#pv-new-name', root).value.trim();
      if (!id) return;
      if (p.models.some((m) => m.id === id)) return;
      p.models.push({ id, name: name || id });
      U.qs('#pv-new-id', root).value = '';
      U.qs('#pv-new-name', root).value = '';
      drawModels();
      U.qs('#pv-new-id', root).focus();
    };
    U.qs('#pv-add-model', root).onclick = addModel;
    U.qs('#pv-new-name', root).onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addModel();
      }
    };

    U.qs('#pv-reveal', root).onclick = (e) => {
      const input = U.qs('#pv-key', root);
      input.type = input.type === 'password' ? 'text' : 'password';
      e.target.textContent = input.type === 'password' ? 'Show' : 'Hide';
    };

    U.qsa('[data-preset]', root).forEach((b) => {
      b.onclick = () => {
        const preset = V.PROVIDER_PRESETS.find((x) => x.id === b.dataset.preset);
        if (!preset) return;
        if (!U.qs('#pv-name', root).value.trim() || !p.name) U.qs('#pv-name', root).value = preset.name;
        U.qs('#pv-url', root).value = preset.baseUrl;
        U.qs('#pv-key', root).placeholder = preset.keyHint;
        p.name = U.qs('#pv-name', root).value;
        p.baseUrl = preset.baseUrl;
        if (preset.apiType) p.apiType = preset.apiType;
        else delete p.apiType;
        p.models = (preset.models || []).map(([id, name]) => ({ id, name }));
        if (preset.id === 'anthropic') U.qs('#pv-url', root).value = preset.baseUrl;
        drawModels();
        U.qs('#pv-status', root).textContent = preset.note || '';
        U.qsa('[data-preset]', root).forEach((x) => x.classList.toggle('active', x === b));
      };
    });

    U.qs('#pv-discover', root).onclick = async () => {
      const status = U.qs('#pv-status', root);
      status.textContent = window.I18n.t('Fetching…');
      const temp = {
        ...p,
        name: U.qs('#pv-name', root).value,
        baseUrl: U.qs('#pv-url', root).value.trim(),
        apiKey: U.qs('#pv-key', root).value.trim()
      };
      try {
        const headers = JSON.parse(U.qs('#pv-headers', root).value || '{}');
        const list = await fetchModels({ ...temp, headers });
        let added = 0;
        for (const model of list) {
          if (!p.models.some((x) => x.id === model.id)) {
            p.models.push(model);
            added++;
          }
        }
        drawModels();
        status.textContent = S.data.ui.locale === 'en' ? `${list.length} models found, ${added} new` : `Найдено моделей: ${list.length}, новых: ${added}`;
      } catch (err) {
        status.textContent = `${S.data.ui.locale === 'en' ? 'Could not fetch models' : 'Не удалось получить модели'}: ${err.message}`;
        status.classList.add('danger-text');
      }
    };

    if (editing) {
      U.qs('#pv-delete', root).onclick = () => {
        if (!confirm(`Delete provider "${editing.name}"? Agents using it will move to another provider or lose their model.`)) return;
        S.deleteProvider(editing.id);
        V.closeModal();
        window.TOAST('Provider deleted');
      };
    }

    U.qs('#pv-save', root).onclick = () => {
      p.name = U.qs('#pv-name', root).value.trim() || 'Untitled provider';
      p.baseUrl = U.qs('#pv-url', root).value.trim();
      p.apiKey = U.qs('#pv-key', root).value.trim();
      p.maxTokens = Number(U.qs('#pv-max', root).value) || 4096;
      try {
        p.headers = JSON.parse(U.qs('#pv-headers', root).value || '{}');
      } catch {
        p.headers = {};
      }
      p.models = p.models.filter((m) => m.id);
      if (!p.baseUrl) return window.TOAST('Base URL is required', 'error');
      if (!p.models.length) return window.TOAST('Add at least one model', 'error');
      S.set((data) => {
        const i = data.providers.findIndex((x) => x.id === p.id);
        if (i >= 0) data.providers[i] = p;
        else data.providers.push(p);
      });
      V.closeModal();
      window.TOAST(editing ? 'Provider updated' : 'Provider added');
      window.App.refresh();
    };
  };

  async function fetchModels(provider) {
    return window.comrade.ai.listModels({ provider });
  }

  /* ================================================================== *
   * Agent editor
   * ================================================================== */
  V.openAgentEditor = (agentId) => {
    const editing = agentId ? S.agent(agentId) : null;
    if (!S.data.providers.length) {
      window.TOAST('Add a provider first — an agent needs a model.', 'error');
      window.App.openProviderEditor(null);
      return;
    }
    const firstProvider = S.data.providers[0];
    const a = editing
      ? JSON.parse(JSON.stringify(editing))
      : {
          id: U.uid('agent'),
          name: '',
          avatar: V.PRESET_AVATARS[Math.floor(Math.random() * 8)],
          systemPrompt: '',
          providerId: firstProvider.id,
          modelId: firstProvider.models[0]?.id || '',
          connectionIds: [],
          webSearch: false,
          computerControl: false,
          temperature: 0.7
        };
    if (!a.connectionIds) a.connectionIds = [];
    S.modal = { kind: 'agent', draft: a };

    const body = `
      <div class="agent-editor">
        <div class="avatar-col">
          <div class="avatar-big" id="ag-preview"></div>
          <div class="avatar-grid">${V.PRESET_AVATARS.map((f) => `<button class="avatar-pick" data-avatar="${f}" aria-label="${S.data.ui.locale === 'en' ? 'Choose avatar' : 'Выбрать аватарку'} ${U.esc(f)}"><img src="assets/avatars/${f}" alt="" /></button>`).join('')}</div>
          <button class="btn ghost small block" id="ag-upload">Upload…</button>
          <button class="btn ghost small block" id="ag-remove-avatar">Use initials</button>
        </div>
        <div class="agent-fields">
          ${fieldRow('Agent name', `<input class="input big" id="ag-name" value="${U.esc(a.name)}" placeholder="e.g. Archivist" maxlength="48" />`)}
          <div class="field-row-2">
            ${fieldRow('Provider', `<select class="input" id="ag-provider">${S.data.providers.map((p) => `<option value="${p.id}" ${p.id === a.providerId ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select>`)}
            ${fieldRow('Model', `<select class="input" id="ag-model"></select>`)}
          </div>
          ${fieldRow('System prompt', `<textarea class="input mono" id="ag-prompt" rows="9" placeholder="You are… You do… Tone, rules, what to refuse, how to format code.">${U.esc(a.systemPrompt)}</textarea>`, 'Everything here is prepended to every conversation.')}
          <label class="row-toggle" for="ag-web-search">
            <span><span class="field-label">Internet search (DuckDuckGo)</span><br/><span class="field-hint">Only used when needed; the search query is sent to DuckDuckGo.</span></span>
            <span class="switch"><input type="checkbox" id="ag-web-search" ${a.webSearch === true ? 'checked' : ''}/><span></span></span>
          </label>
          <label class="row-toggle" for="ag-computer-control">
            <span><span class="field-label">Control this computer</span><br/><span class="field-hint">Enables terminal commands and app settings. You will approve every action in a confirmation dialog.</span></span>
            <span class="switch"><input type="checkbox" id="ag-computer-control" ${a.computerControl === true ? 'checked' : ''}/><span></span></span>
          </label>
          <div class="modal-section">
            <div class="modal-section-head"><span>Connections (MCP)</span><button class="btn ghost small" id="ag-add-conn" type="button">Manage…</button></div>
            <div class="conn-pick">
              ${S.data.connections.length
                ? S.data.connections.map((c) => `<label class="conn-pick-row ${c.enabled ? '' : 'disabled'}">
                    <input type="checkbox" data-conn-pick="${c.id}" ${a.connectionIds.includes(c.id) ? 'checked' : ''} ${c.enabled ? '' : 'disabled'} />
                    <span class="conn-pick-title">${U.esc(c.title)}</span>
                    <span class="muted small">${(c.tools || []).length} tools${c.enabled ? '' : ' · disabled'}</span>
                  </label>`).join('')
                : '<div class="muted small pad">No connections yet. Add GitHub, Google Mail and others from the Connections page.</div>'}
            </div>
          </div>
          ${fieldRow('Temperature', `<input type="range" class="range" id="ag-temp" min="0" max="1.5" step="0.05" value="${a.temperature}" /><span class="range-val" id="ag-temp-val">${a.temperature.toFixed(2)}</span>`)}
        </div>
      </div>`;

    const root = V.modal(editing ? 'Edit agent' : 'New Agent', body, {
      wide: true,
      footHTML: `${editing ? '<button class="btn ghost danger-text" id="ag-delete">Delete agent</button>' : ''}
        <div class="spacer"></div>
        <button class="btn ghost" data-modal-close>Cancel</button>
        <button class="btn primary" id="ag-save">${editing ? 'Save agent' : 'Create agent'}</button>`
    });

    const drawPreview = () => {
      const el = U.qs('#ag-preview', root);
      el.innerHTML = a.avatar && !/^cat\d+\.jpg$/.test(a.avatar)
        ? /^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(a.avatar)
          ? `<img src="${U.esc(a.avatar)}" alt="" />`
          : U.esc(U.initials(a.name || 'Agent'))
        : /^cat\d+\.jpg$/.test(a.avatar || '')
          ? `<img src="assets/avatars/${a.avatar}" alt="" />`
          : U.esc(U.initials(a.name || 'Agent'));
      U.qsa('[data-avatar]', root).forEach((b) => b.classList.toggle('active', b.dataset.avatar === a.avatar));
    };
    const drawModels = () => {
      const p = S.provider(U.qs('#ag-provider', root).value);
      const sel = U.qs('#ag-model', root);
      sel.innerHTML = (p ? p.models : []).map((m) => `<option value="${U.esc(m.id)}" ${m.id === a.modelId ? 'selected' : ''}>${U.esc(m.name)}</option>`).join('') || '<option value="">— no models —</option>';
      if (!a.modelId && p && p.models[0]) {
        a.modelId = p.models[0].id;
        sel.value = p.models[0].id;
      }
    };
    drawPreview();
    drawModels();

    U.qs('#ag-name', root).oninput = (e) => {
      a.name = e.target.value;
      drawPreview();
    };
    U.qs('#ag-prompt', root).oninput = (e) => {
      a.systemPrompt = e.target.value;
    };
    U.qs('#ag-provider', root).onchange = (e) => {
      a.providerId = e.target.value;
      const p = S.provider(a.providerId);
      a.modelId = p && p.models[0] ? p.models[0].id : '';
      drawModels();
    };
    U.qs('#ag-model', root).onchange = (e) => {
      a.modelId = e.target.value;
    };
    U.qs('#ag-temp', root).oninput = (e) => {
      a.temperature = Number(e.target.value);
      U.qs('#ag-temp-val', root).textContent = a.temperature.toFixed(2);
    };
    U.qsa('[data-avatar]', root).forEach((b) => {
      b.onclick = () => {
        a.avatar = b.dataset.avatar;
        drawPreview();
      };
    });
    U.qs('#ag-upload', root).onclick = async () => {
      try {
        const dataUrl = await window.comrade.dialog.image();
        if (dataUrl) { a.avatar = dataUrl; drawPreview(); }
      } catch (err) { window.TOAST(err.message, 'error'); }
    };
    U.qs('#ag-remove-avatar', root).onclick = () => {
      a.avatar = '';
      drawPreview();
    };
    U.qsa('[data-conn-pick]', root).forEach((cb) => {
      cb.onchange = () => {
        const id = cb.dataset.connPick;
        a.connectionIds = a.connectionIds.filter((x) => x !== id);
        if (cb.checked) a.connectionIds.push(id);
      };
    });
    U.qs('#ag-add-conn', root).onclick = () => {
      window.App.openConnectionsCatalog();
    };
    if (editing) {
      U.qs('#ag-delete', root).onclick = () => {
        if (!confirm(`Delete "${editing.name}" and all of its chats?`)) return;
        S.deleteAgent(editing.id);
        V.closeModal();
        window.TOAST('Agent deleted');
        window.App.refresh();
      };
    }
    U.qs('#ag-save', root).onclick = () => {
      a.name = U.qs('#ag-name', root).value.trim();
      a.systemPrompt = U.qs('#ag-prompt', root).value;
      a.webSearch = U.qs('#ag-web-search', root).checked;
      a.computerControl = U.qs('#ag-computer-control', root).checked;
      if (!a.name) return window.TOAST('Give the agent a name', 'error');
      if (!a.providerId || !a.modelId) return window.TOAST('Pick a provider and a model', 'error');
      const isNew = !editing;
      S.set((data) => {
        const i = data.agents.findIndex((x) => x.id === a.id);
        if (i >= 0) data.agents[i] = a;
        else data.agents.push(a);
      });
      if (isNew) {
        S.data.activeAgentId = a.id;
        const chat = S.newChat(a.id, { silent: true });
        S.data.activeChatId = chat.id;
        S.route = 'chat';
        S.persist();
      }
      V.closeModal();
      window.TOAST(isNew ? S.data.ui.locale === 'en' ? `${a.name} joined the agency` : `Агент ${a.name} создан` : 'Agent saved');
      window.App.refresh();
    };
  };

  V.openProjectEditor = (projectId) => {
    const editing = projectId ? S.project(projectId) : null;
    const project = editing
      ? JSON.parse(JSON.stringify(editing))
      : { id: U.uid('project'), name: '', icon: '', banner: '', context: '', systemPrompt: '', files: [] };
    const body = `
      <div class="project-editor">
        <div class="project-artwork">
          <div class="project-icon-preview" id="project-icon-preview"></div>
          <button class="btn ghost small block" id="project-upload-icon" type="button">Upload icon</button>
          <button class="btn ghost small block" id="project-remove-icon" type="button">Remove icon</button>
          <div class="project-banner-preview" id="project-banner-preview"></div>
          <button class="btn ghost small block" id="project-upload-banner" type="button">Upload banner</button>
          <button class="btn ghost small block" id="project-remove-banner" type="button">Remove banner</button>
        </div>
        <div class="project-fields">
          ${fieldRow('Project name', `<input class="input big" id="project-name" value="${U.esc(project.name)}" maxlength="64" placeholder="Research" />`)}
          ${fieldRow('Project context', `<textarea class="input mono" id="project-context" rows="5" maxlength="60000" placeholder="Background and reference notes for this project">${U.esc(project.context)}</textarea>`)}
          ${fieldRow('Project system prompt', `<textarea class="input mono" id="project-prompt" rows="6" maxlength="20000" placeholder="Instructions specific to this project">${U.esc(project.systemPrompt)}</textarea>`)}
          <div class="modal-section">
            <div class="modal-section-head"><span>Project files</span><button class="btn ghost small" id="project-add-files" type="button">Add files</button></div>
            <div class="field-hint">TXT, Markdown, code, PDF and DOCX · 8 MB max per file · up to 10 files</div>
            <div class="project-file-list" id="project-file-list"></div>
            <div class="field-hint" id="project-file-status" role="status"></div>
          </div>
        </div>
      </div>`;
    const root = V.modal(editing ? 'Edit project' : 'New project', body, {
      wide: true,
      footHTML: `${editing ? '<button class="btn ghost danger-text" id="project-delete" type="button">Delete project</button>' : ''}
        <div class="spacer"></div>
        <button class="btn ghost" data-modal-close>Cancel</button>
        <button class="btn primary" id="project-save" type="button">${editing ? 'Save project' : 'Create project'}</button>`
    });

    const drawArtwork = () => {
      U.qs('#project-icon-preview', root).innerHTML = V.projectIconHTML(project, 'lg');
      U.qs('#project-banner-preview', root).innerHTML = /^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(project.banner || '')
        ? `<img src="${U.esc(project.banner)}" alt="" />`
        : `<span>${window.I18n.t('Banner preview')}</span>`;
    };
    const setFileStatus = (message, isError = false) => {
      const status = U.qs('#project-file-status', root);
      status.textContent = message;
      status.classList.toggle('danger-text', isError);
    };
    const drawFiles = () => {
      const container = U.qs('#project-file-list', root);
      container.innerHTML = project.files.length
        ? project.files.map((file, index) => `<div class="project-file-row">
            <span class="project-file-name" title="${U.esc(file.name)}">${U.esc(file.name)}${file.truncated ? ` · ${window.I18n.t('truncated')}` : ''}</span>
            <span class="project-file-size">${U.bytes(file.size || 0)} · ${(file.text || '').length} chars</span>
            <button class="mini-btn" data-project-file-remove="${index}" type="button" aria-label="Remove ${U.esc(file.name)}">×</button>
          </div>`).join('')
        : `<div class="muted small pad">${window.I18n.t('This project has no files yet.')}</div>`;
      U.qsa('[data-project-file-remove]', root).forEach((button) => {
        button.onclick = () => {
          project.files.splice(Number(button.dataset.projectFileRemove), 1);
          drawFiles();
        };
      });
    };

    drawArtwork();
    drawFiles();
    U.qs('#project-upload-icon', root).onclick = async () => {
      try {
        const icon = await window.comrade.dialog.image();
        if (icon) { project.icon = icon; drawArtwork(); }
      } catch (error) {
        window.TOAST(error.message, 'error');
      }
    };
    U.qs('#project-remove-icon', root).onclick = () => { project.icon = ''; drawArtwork(); };
    U.qs('#project-upload-banner', root).onclick = async () => {
      try {
        const banner = await window.comrade.dialog.projectBanner();
        if (banner) { project.banner = banner; drawArtwork(); }
      } catch (error) {
        window.TOAST(error.message, 'error');
      }
    };
    U.qs('#project-remove-banner', root).onclick = () => { project.banner = ''; drawArtwork(); };
    U.qs('#project-add-files', root).onclick = async () => {
      try {
        const selected = await window.comrade.projects.pickFiles();
        if (!selected.length) return;
        const files = selected.filter((file) => !project.files.some((existing) => existing.id === file.id));
        if (project.files.length + files.length > 10) {
          setFileStatus(window.I18n.t('Project file limit reached'), true);
          return;
        }
        const contextLength = U.qs('#project-context', root).value.length
          + project.files.reduce((sum, file) => sum + (file.text || '').length, 0)
          + files.reduce((sum, file) => sum + (file.text || '').length, 0);
        if (contextLength > 60000) {
          setFileStatus(window.I18n.t('Project context is limited to 60000 characters.'), true);
          return;
        }
        project.files.push(...files);
        setFileStatus('');
        drawFiles();
      } catch (error) {
        setFileStatus(error.message, true);
      }
    };
    if (editing) {
      U.qs('#project-delete', root).onclick = () => {
        if (!confirm(`Delete project "${editing.name}"? Chats will remain in All chats.`)) return;
        S.deleteProject(editing.id);
        V.closeModal();
        window.TOAST('Project deleted');
        window.App.refresh();
      };
    }
    U.qs('#project-save', root).onclick = () => {
      project.name = U.qs('#project-name', root).value.trim();
      project.context = U.qs('#project-context', root).value;
      project.systemPrompt = U.qs('#project-prompt', root).value;
      const contextLength = project.context.length + project.files.reduce((sum, file) => sum + (file.text || '').length, 0);
      if (!project.name) return window.TOAST('Give the project a name', 'error');
      if (project.systemPrompt.length > 20000) return window.TOAST('Project instructions are limited to 20000 characters.', 'error');
      if (contextLength > 60000) return window.TOAST('Project context is limited to 60000 characters.', 'error');
      const isNew = !editing;
      S.set((data) => {
        const index = data.projects.findIndex((entry) => entry.id === project.id);
        if (index >= 0) data.projects[index] = project;
        else data.projects.push(project);
      });
      V.closeModal();
      window.TOAST(isNew ? 'Project created' : 'Project saved');
      window.App.refresh();
    };
  };

  V.openProjectWorkspace = (projectId) => {
    const project = S.project(projectId);
    if (!project) return;
    const banner = /^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(project.banner || '')
      ? `<img class="project-workspace-banner" src="${U.esc(project.banner)}" alt="" />`
      : '';
    const chats = S.projectChats(projectId);
    const body = `
      ${banner}
      <div class="project-workspace-title">${V.projectIconHTML(project, 'md')}<h4>${U.esc(project.name)}</h4></div>
      <p class="muted">${window.I18n.t('Choose a chat or create a new one')}</p>
      <div class="project-workspace-chats" id="project-workspace-chats">${chats.length
        ? chats.map((chat) => {
            const agent = S.agent(chat.agentId);
            return `<button class="project-chat-choice" data-project-chat="${U.esc(chat.id)}">
              ${V.avatarHTML(agent, 'sm')}<span><b>${U.esc(chat.title || 'New chat')}</b><small>${U.esc(agent?.name || 'Unknown agent')}</small></span>
            </button>`;
          }).join('')
        : `<div class="empty-note">${window.I18n.t('No chats in this project yet.')}</div>`}
      </div>`;
    const root = V.modal(project.name, body, {
      wide: true,
      footHTML: `<button class="btn ghost" id="project-workspace-edit" type="button">Edit project</button>
        <div class="spacer"></div><button class="btn ghost" data-modal-close>Close</button>
        <button class="btn primary" id="project-new-chat" type="button">Create new chat</button>`
    });
    U.qs('#project-workspace-edit', root).onclick = () => V.openProjectEditor(projectId);
    U.qs('#project-new-chat', root).onclick = () => V.openProjectAgentPicker(projectId);
    U.qsa('[data-project-chat]', root).forEach((button) => {
      button.onclick = () => {
        V.closeModal();
        S.openChat(button.dataset.projectChat);
      };
    });
  };

  V.openProjectAgentPicker = (projectId) => {
    const project = S.project(projectId);
    if (!project) return;
    const body = S.data.agents.length
      ? `<p class="muted">${window.I18n.t('Choose an agent for the new chat')}</p><div class="project-agent-list">
          ${S.data.agents.map((agent) => `<button class="project-agent-choice" data-project-agent="${U.esc(agent.id)}">
            ${V.avatarHTML(agent, 'md')}<span><b>${U.esc(agent.name)}</b><small>${U.esc(S.modelLabel(agent))}</small></span>
          </button>`).join('')}
        </div>`
      : `<div class="empty-note">${window.I18n.t('No agents available.')}</div>`;
    const root = V.modal('Create new chat', body, {
      footHTML: `${S.data.agents.length ? '' : '<button class="btn primary" id="project-create-agent" type="button">Create an agent</button>'}
        <div class="spacer"></div><button class="btn ghost" data-modal-close>Cancel</button>`
    });
    U.qsa('[data-project-agent]', root).forEach((button) => {
      button.onclick = () => {
        const chat = S.newChat(button.dataset.projectAgent, { silent: true, projectId });
        V.closeModal();
        S.openChat(chat.id);
      };
    });
    U.qs('#project-create-agent', root)?.addEventListener('click', () => {
      V.closeModal();
      window.App.openAgentEditor(null);
    });
  };

  /* ================================================================== *
   * Connection editor / catalog / custom server
   * ================================================================== */
  V.openConnectionsCatalog = () => {
    const cats = V.CONNECTION_CATALOG;
    const body = `<div class="catalog">${cats
      .map(
        (c) => `<button class="catalog-card" data-cat="${c.id}">
          <span class="catalog-group">${U.esc(c.group)}</span>
          <span class="catalog-title">${U.esc(c.title)}</span>
          <span class="catalog-blurb">${U.esc(c.blurb)}</span>
        </button>`
      )
      .join('')}</div>
      <div class="muted small">Remote servers need an access token (Headers on the next screen). Local servers run on this machine.</div>`;
    const root = V.modal('Connections catalog', body, { wide: true });
    U.qsa('[data-cat]', root).forEach((b) => {
      b.onclick = () => {
        const cat = cats.find((c) => c.id === b.dataset.cat);
        V.closeModal();
        V.openConnectionEditor({ catalog: cat });
      };
    });
  };

  V.openConnectionEditor = ({ connectionId, catalog } = {}) => {
    const existing = connectionId ? S.connection(connectionId) : null;
    const isLocal = catalog ? Boolean(catalog.local) : existing ? Mcp.pickTransport(existing) === 'stdio' : false;
    const c = existing
      ? JSON.parse(JSON.stringify(existing))
      : catalog
        ? {
            id: U.uid('conn'),
            title: catalog.title,
            enabled: true,
            server: catalog.local
              ? { ...catalog.server }
              : { type: 'http', url: catalog.remote || '', headers: { ...(catalog.headers || {}) } },
            tools: (catalog.tools || []).map(([name, description, props]) => ({
              name,
              description,
              inputSchema: { type: 'object', properties: props || {} }
            })),
            docs: catalog.docs,
            script: catalog.script
          }
        : {
            id: U.uid('conn'),
            title: 'Custom server',
            enabled: true,
            server: { type: 'http', url: '', headers: {} },
            tools: []
          };

    const transport = Mcp.pickTransport(c);
    const body = `
      ${fieldRow('Name', `<input class="input" id="cn-title" value="${U.esc(c.title)}" />`)}
      <div class="segmented" id="cn-type">
        <button data-type="http" class="${transport === 'http' ? 'active' : ''}">Remote URL</button>
        <button data-type="stdio" class="${transport === 'stdio' ? 'active' : ''}">Local command</button>
      </div>
      <div id="cn-http" class="${transport === 'http' ? '' : 'hidden'}">
        ${fieldRow('Server URL', `<input class="input mono" id="cn-url" value="${U.esc(c.server.url || '')}" placeholder="https://mcp.example.com/mcp" spellcheck="false" />`, 'Streamable HTTP (JSON-RPC over POST).')}
        ${fieldRow('Headers (JSON)', `<textarea class="input mono" id="cn-headers" rows="4" spellcheck="false">${U.esc(JSON.stringify(c.server.headers || {}, null, 2))}</textarea>`, 'e.g. {"Authorization":"Bearer …"}')}
      </div>
      <div id="cn-stdio" class="${transport === 'stdio' ? '' : 'hidden'}">
        <div class="field-row-3">
          ${fieldRow('Command', `<input class="input mono" id="cn-cmd" value="${U.esc(c.server.command || '')}" placeholder="node" spellcheck="false" />`)}
          ${fieldRow('Arguments', `<input class="input mono" id="cn-args" value="${U.esc((c.server.args || []).join(' '))}" placeholder="HOME/Comrade-MCP/filesystem-server.js" spellcheck="false" />`)}
        </div>
        ${fieldRow('Environment (JSON)', `<textarea class="input mono" id="cn-env" rows="3" spellcheck="false">${U.esc(JSON.stringify(c.server.env || {}, null, 2))}</textarea>`)}
        ${catalog && catalog.script ? `<div class="script-box"><div class="small">Bundled server script (saved via “Save script”):</div><button class="btn ghost small" id="cn-save-script">Save script</button></div>` : ''}
      </div>
      <div class="modal-section">
        <div class="modal-section-head"><span>Tools</span><button class="btn ghost small" id="cn-sync" type="button">Sync now</button></div>
        <div id="cn-tools" class="cn-tools">${(c.tools || []).map((t) => `<span class="chip mono">${U.esc(t.name)}</span>`).join('') || `<span class="muted small">${window.I18n.t('Not synced yet.')}</span>`}</div>
        <div class="field-hint" id="cn-status"></div>
      </div>
      ${c.docs ? `<div class="field-hint">Docs: <a href="${U.esc(c.docs)}" target="_blank" rel="noreferrer">${U.esc(c.docs)}</a></div>` : ''}`;

    S.modal = { kind: 'connection', draft: c };
    const root = V.modal(existing ? 'Edit connection' : `Add connection — ${c.title}`, body, {
      wide: true,
      footHTML: `${existing ? '<button class="btn ghost danger-text" id="cn-delete">Remove</button>' : ''}
        <div class="spacer"></div>
        <button class="btn ghost" data-modal-close>Cancel</button>
        <button class="btn primary" id="cn-save">${existing ? 'Save' : 'Add connection'}</button>`
    });

    const readForm = () => {
      c.title = U.qs('#cn-title', root).value.trim() || 'Connection';
      const type = U.qs('#cn-type .active', root)?.dataset.type || 'http';
      if (type === 'http') {
        c.server = {
          authMode: c.server.authMode,
          oauthClientId: c.server.oauthClientId,
          type: 'http',
          url: U.qs('#cn-url', root).value.trim(),
          headers: parseJson(U.qs('#cn-headers', root).value, {})
        };
      } else {
        let args = U.qs('#cn-args', root).value.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        args = args.map((a) => a.replace(/^"|"$/g, ''));
        c.server = {
          type: 'stdio',
          command: U.qs('#cn-cmd', root).value.trim(),
          args,
          env: parseJson(U.qs('#cn-env', root)?.value || '{}', {})
        };
      }
    };

    U.qsa('#cn-type button', root).forEach((b) => {
      b.onclick = () => {
        readForm();
        U.qsa('#cn-type button', root).forEach((x) => x.classList.toggle('active', x === b));
        U.qs('#cn-http', root).classList.toggle('hidden', b.dataset.type !== 'http');
        U.qs('#cn-stdio', root).classList.toggle('hidden', b.dataset.type !== 'stdio');
      };
    });

    U.qs('#cn-sync', root).onclick = async () => {
      readForm();
      const status = U.qs('#cn-status', root);
      status.textContent = window.I18n.t('Connecting…');
      status.classList.remove('danger-text');
      try {
        const res = existing && c.server.type === 'http'
          ? { transport: 'http', tools: (await window.comrade.mcp.listTools({ connectionId: c.id })).tools }
          : await Mcp.test(c.server);
        c.tools = res.tools;
        c.lastSync = Date.now();
        U.qs('#cn-tools', root).innerHTML = res.tools.length
          ? res.tools.map((t) => `<span class="chip mono" title="${U.esc(t.description)}">${U.esc(t.name)}</span>`).join('')
          : '<span class="muted small">Connected, but the server exposes no tools.</span>';
        status.textContent = S.data.ui.locale === 'en' ? `Connected (${res.transport}) · ${res.tools.length} tools` : `Подключено (${res.transport}) · инструментов: ${res.tools.length}`;
      } catch (err) {
        status.textContent = `${S.data.ui.locale === 'en' ? 'Failed' : 'Ошибка'}: ${err.message}`;
        status.classList.add('danger-text');
      }
    };

    const saveScriptBtn = U.qs('#cn-save-script', root);
    if (saveScriptBtn) {
      saveScriptBtn.onclick = () => {
        const script = Mcp.SCRIPTS[catalog.script];
        window.comrade.files.save({ name: catalog.script, content: script, filterName: 'MCP server', ext: catalog.script.split('.').pop() })
          .then((r) => r.ok && window.TOAST(`Saved to ${r.path}. Update the Arguments path if needed.`));
      };
    }

    if (existing) {
      U.qs('#cn-delete', root).onclick = () => {
        if (!confirm(`Remove the "${existing.title}" connection?`)) return;
        S.set((data) => {
          data.connections = data.connections.filter((x) => x.id !== existing.id);
          data.agents.forEach((a) => {
            a.connectionIds = (a.connectionIds || []).filter((id) => id !== existing.id);
          });
        });
        V.closeModal();
        window.App.refresh();
      };
    }

    U.qs('#cn-save', root).onclick = () => {
      readForm();
      if (c.server.type === 'http' && !c.server.url) return window.TOAST('Server URL is required', 'error');
      if (c.server.type === 'http' && c.server.url) {
        try { const u = new URL(c.server.url); if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname))) throw Error(); }
        catch { return window.TOAST('Для удалённого MCP требуется HTTPS', 'error'); }
      }
      if (c.server.type === 'stdio' && !c.server.command) return window.TOAST('Launch command is required', 'error');
      S.set((data) => {
        const i = data.connections.findIndex((x) => x.id === c.id);
        if (i >= 0) data.connections[i] = { ...data.connections[i], ...c };
        else data.connections.push(c);
      });
      V.closeModal();
      window.TOAST(`Connection "${c.title}" saved`);
      window.App.refresh();
    };
  };

  function parseJson(text, fallback) {
    try {
      const v = JSON.parse(text || '{}');
      return v && typeof v === 'object' ? v : fallback;
    } catch {
      return fallback;
    }
  }

  window.ViewEditors = V;
})();
