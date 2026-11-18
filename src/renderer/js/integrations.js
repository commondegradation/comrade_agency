(function () {
  'use strict';
  const U = window.U, S = window.S, V = window.Views;
  const tr = (ru, en) => window.I18n.ru() ? ru : en;
  const render = V.renderConnections;
  V.renderConnections = function () {
    render();
    document.querySelectorAll('[data-conn-sync]').forEach(button => {
      const c = S.connection(button.dataset.connSync);
      if (c.server.type !== 'http') return;
      const login = document.createElement('button');
      login.className = 'btn ghost small';
      login.textContent = tr('Войти в браузере', 'Sign in with browser');
      login.onclick = () => openAuth(c);
      button.parentElement.appendChild(login);
    });
  };
  let poll;
  async function openAuth(c) {
    await S.persistNow();
    const root = V.modal(tr('Вход в сервис', 'Service sign-in'), `
      <p>${tr('Вход открывается в браузере по умолчанию. Пароль вводится только на сайте сервиса.', 'Sign in using your default browser. Enter your password only on the service website.')}</p>
      <p>${tr('Нужен сервер MCP с поддержкой OAuth. Если автоматическая регистрация недоступна, укажите Client ID, полученный у сервиса.', 'An OAuth-enabled MCP server is required. If dynamic registration is unavailable, enter the Client ID provided by the service.')}</p>
      <label class="field">OAuth Client ID <input class="input" id="oauth-client" value="${U.esc(c.server.oauthClientId || '')}"></label>
      <div class="row-actions"><button class="btn primary" id="oauth-start">${tr('Войти', 'Sign in')}</button><button class="btn ghost" id="oauth-out">${tr('Отключить доступ', 'Disconnect')}</button></div>
      <p id="oauth-status" role="status"></p><a id="oauth-link" target="_blank" rel="noreferrer" hidden>${tr('Открыть ссылку входа', 'Open sign-in link')}</a>`);
    const status = U.qs('#oauth-status', root);
    const show = async () => {
      if (!root.contains(status)) { clearInterval(poll); return; }
      try {
        const result = await window.comrade.mcp.auth(c.id, 'status');
        const labels = { idle: tr('Вход не выполнен','Not signed in'), starting: tr('Подготовка входа…','Preparing sign-in…'), waiting: tr('Завершите вход в браузере','Complete sign-in in browser'), exchanging: tr('Завершение входа…','Completing sign-in…'), connected: tr('Вход выполнен','Signed in'), authorized: tr('Доступ сохранён','Access saved'), error: tr('Ошибка входа','Sign-in failed') };
        status.textContent = result.error || labels[result.phase] || result.phase;
        const link = U.qs('#oauth-link', root);
        link.hidden = !result.url;
        if (result.url) link.href = result.url;
        if (result.phase === 'connected') {
          clearInterval(poll);
          await window.Mcp.connect(c); S.persist();
        }
      } catch (e) { status.textContent = e.message; }
    };
    U.qs('#oauth-start',root).onclick = async () => {
      try {
        c.server.authMode = 'oauth';
        c.server.oauthClientId = U.qs('#oauth-client',root).value.trim();
        await S.persistNow();
        await window.comrade.mcp.auth(c.id,'disconnect');
        await window.comrade.mcp.auth(c.id,'start');
        clearInterval(poll); poll = setInterval(show,1000); await show();
      } catch(e) { status.textContent = e.message; }
    };
    U.qs('#oauth-out',root).onclick = async () => {
      try {
        clearInterval(poll);
        const result = await window.comrade.mcp.auth(c.id,'disconnect');
        c.tools = []; c.status = 'idle'; S.persist(); status.textContent = result.note;
      } catch(e) { status.textContent = e.message; }
    };
    await show();
  }
  // Only list discovered tools: catalog entries are descriptions, not working integrations.
  for (const c of V.CONNECTION_CATALOG) {
    if (!c.local) {
      c.tools = []; c.headers = {};
      if (['gmail','gcalendar','gdrive','slack'].includes(c.id)) {
        c.remote = '';
        c.note = 'Укажите адрес вашего MCP-сервера. Для этого сервиса готовое подключение не настроено.';
      }
    }
  }
  const settings = V.renderSettings;
  V.renderSettings = function () {
    settings();
    const host = U.qs('#chat-view .page');
    const section = document.createElement('section'); section.className = 'settings-block';
    section.innerHTML = `<h4>${tr('Справка Microsoft','Microsoft reference')}</h4><p>${tr('Локальная краткая справка: Word, Excel, PowerPoint, Outlook, OneNote, Teams и OneDrive. Это авторский конспект со ссылками, а не полная копия документации. Подходящие материалы автоматически добавляются к вопросу агента.','Local editorial guide with official links, not a complete documentation mirror. Relevant material is automatically included with agent questions.')}</p><input class="input" id="reference-search" placeholder="${tr('Например: Excel формулы','For example: Excel formulas')}"><div id="reference-results"></div>`;
    host.appendChild(section);
    U.qs('#reference-search',section).oninput = async e => {
      const query = e.target.value;
      let rows;
      try { rows = await window.comrade.knowledge.search(query); }
      catch (err) { U.qs('#reference-results',section).textContent = err.message; return; }
      if (U.qs('#reference-search',section).value !== query) return;
      U.qs('#reference-results',section).innerHTML = rows.map(a => `<details><summary>${U.esc(a.title)}</summary><p>${U.esc(a.content)}</p><a href="${U.esc(a.source)}" target="_blank" rel="noreferrer" aria-label="Microsoft Support: ${U.esc(a.title)}">Microsoft Support</a></details>`).join('') || tr('Ничего не найдено','No results');
    };
  };
})();
