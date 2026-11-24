/* Translate application chrome only; never conversation text or user-entered values. */
(function () {
  'use strict';
  const dictionary = {
    'Providers':'Поставщики моделей','Connections':'Подключения','Settings':'Настройки','New Agent':'Новый агент',
    'Projects':'Проекты','All chats':'Все чаты','No projects yet.':'Проектов пока нет.','No matching projects.':'Проекты не найдены.',
    'Project options':'Параметры проекта','Create project':'Создать проект','Open project':'Открыть проект','Edit project':'Изменить проект',
    'Save project':'Сохранить проект','Close':'Закрыть',
    'Move to project':'Переместить в проект','Remove from project':'Убрать из проекта','Delete project':'Удалить проект',
    'New project':'Новый проект','Project name':'Название проекта','Project context':'Контекст проекта','Project system prompt':'Системная инструкция проекта',
    'Project files':'Файлы проекта','Add files':'Добавить файлы','Upload icon':'Загрузить иконку','Upload banner':'Загрузить баннер',
    'Banner preview':'Предпросмотр баннера','truncated':'обрезано',
    'TXT, Markdown, code, PDF and DOCX · 8 MB max per file · up to 10 files':'TXT, Markdown, код, PDF и DOCX · до 8 МБ на файл · не более 10 файлов',
    'Remove icon':'Убрать иконку','Remove banner':'Убрать баннер','Choose a chat or create a new one':'Выберите чат или создайте новый',
    'No chats in this project yet.':'В проекте пока нет чатов.','Choose an agent for the new chat':'Выберите агента для нового чата',
    'Create new chat':'Создать новый чат','Chats stay in All chats when a project is deleted.':'При удалении проекта чаты останутся в разделе «Все чаты».',
    'Give the project a name':'Введите название проекта','Project file limit reached':'Достигнут лимит файлов проекта',
    'Project context is limited to 60000 characters.':'Контекст проекта ограничен 60000 символами.',
    'Project instructions are limited to 20000 characters.':'Инструкция проекта ограничена 20000 символами.',
    'This project has no files yet.':'В проекте пока нет файлов.','No agents available.':'Нет доступных агентов.',
    'Create an agent':'Создать агента','Project created':'Проект создан','Project saved':'Проект сохранён','Project deleted':'Проект удалён',
    'Reminder':'Напоминание',
    'Projects':'Проекты','All chats':'Все чаты','No projects yet.':'Проектов пока нет.','No matching projects.':'Проекты не найдены.',
    'Project options':'Параметры проекта','Create project':'Создать проект','Open project':'Открыть проект','Edit project':'Изменить проект',
    'Move to project':'Переместить в проект','Remove from project':'Убрать из проекта',
    'Search agents':'Поиск агентов','Preview':'Просмотр','Source':'Исходный код','Save':'Сохранить','Save file':'Сохранить файл','Close panel':'Закрыть панель',
    'Artifacts':'Артефакты','Artifact library':'Библиотека артефактов','Generated files and saved responses from all chats.':'Созданные файлы и сохранённые ответы из всех чатов.',
    'No artifacts yet.':'Артефактов пока нет.','Code and regular replies are collected here and can be downloaded.':'Здесь собраны код и обычные ответы — их можно скачать.',
    'Download':'Скачать','lines':'строк',
    'Add provider':'Добавить поставщика','+ Add provider':'+ Добавить поставщика','Create an agent':'Создайте агента','Connect tools':'Подключите инструменты',
    'Add a provider':'Добавьте поставщика','No providers yet':'Поставщиков пока нет','Test':'Проверить','Edit':'Изменить','Delete':'Удалить',
    'No connections':'Нет подключений','Browse catalog':'Каталог подключений','+ Custom server':'+ Свой сервер','Sync tools':'Обновить инструменты','Remove':'Убрать',
    'Enabled for agents':'Доступно агентам','Local':'Локальные','Remote':'Удалённые','— not synced —':'— не синхронизировано —',
    'Everything is stored locally on this machine.':'Все данные хранятся на этом компьютере.',
    'Internet search (DuckDuckGo)':'Поиск в интернете (DuckDuckGo)',
    'Only used when needed; the search query is sent to DuckDuckGo.':'Поиск запускается только при необходимости; запрос отправляется в DuckDuckGo.',
    'Search the web':'Поиск в интернете',
    'Control this computer':'Управление компьютером',
    'Enables terminal commands and app settings. You will approve every action in a confirmation dialog.':'Открывает терминал и настройки приложения. Каждое действие нужно отдельно подтвердить в диалоговом окне.',
    'Show reasoning blocks':'Показывать рассуждения','Open the artifact panel automatically':'Автоматически открывать панель файлов','Sidebar width':'Ширина боковой панели',
    'Dark theme':'Тёмная тема','Collapse sidebar':'Свернуть панель','Expand sidebar':'Развернуть панель',
    'Data':'Данные','Show data file':'Открыть файл данных','Export JSON':'Экспортировать JSON','About':'О приложении','Reset':'Сброс','Delete all data':'Удалить все данные',
    'Providers, agents, chats, reminders and connections live in a single JSON file.':'Поставщики, агенты, чаты, напоминания и подключения хранятся в одном JSON-файле.',
    'Deletes every provider, agent, chat, connection and reminder from this machine.':'Удаляет всех поставщиков, агентов, чаты, подключения и напоминания с этого компьютера.',
    'Display name':'Отображаемое имя','Base URL':'Базовый адрес','API key':'Ключ API','Show':'Показать','Hide':'Скрыть',
    'Stored unencrypted in your local app data folder.':'Хранится без шифрования в локальной папке приложения.',
    'Max output tokens':'Максимум токенов ответа','Extra headers (JSON)':'Дополнительные заголовки (JSON)','Models':'Модели','Model ID':'Идентификатор модели',
    'Fetch models':'Загрузить модели','+ Add':'+ Добавить','Edit provider':'Изменить поставщика','Cancel':'Отмена','Save provider':'Сохранить поставщика','Create provider':'Создать поставщика',
    'No models yet — add at least one.':'Добавьте хотя бы одну модель.','Upload…':'Загрузить…','Use initials':'Использовать инициалы','Agent name':'Имя агента',
    'Provider':'Поставщик','Model':'Модель','System prompt':'Системная инструкция','Everything here is prepended to every conversation.':'Эта инструкция добавляется в начало каждого разговора.',
    'Connections (MCP)':'Подключения (MCP)','Manage…':'Управление…','Temperature':'Температура','Edit agent':'Изменить агента','Delete agent':'Удалить агента','Save agent':'Сохранить агента','Create agent':'Создать агента',
    '— no models —':'— нет моделей —','Connections catalog':'Каталог подключений','Name':'Название','Remote URL':'Удалённый адрес','Local command':'Локальная команда',
    'Server URL':'Адрес сервера','Headers (JSON)':'Заголовки (JSON)','Command':'Команда','Arguments':'Аргументы','Environment (JSON)':'Переменные окружения (JSON)',
    'Tools':'Инструменты','Sync now':'Обновить сейчас','Not synced yet.':'Ещё не синхронизировано.','Edit connection':'Изменить подключение','Add connection':'Добавить подключение',
    'Save script':'Сохранить скрипт','No provider':'Нет поставщика','No messages':'Нет сообщений','Unknown agent':'Неизвестный агент','Chat options':'Параметры чата',
    'Copy':'Копировать','Retry':'Повторить','Regenerate':'Повторить ответ','No agents yet':'Агентов пока нет','+ New Agent':'+ Новый агент','+ Chat':'+ Чат','New chat':'Новый чат','More':'Ещё',
    'No system prompt.':'Нет системной инструкции.','Stop':'Остановить','Send':'Отправить','Send (Enter)':'Отправить (Enter)',
    'Enter to send · Shift+Enter for a new line · code replies become one artifact':'Enter — отправить · Shift+Enter — новая строка · код сохраняется в один файл',
    'REASONING':'РАССУЖДЕНИЯ','live':'сейчас','running':'выполняется','args':'параметры','result':'результат','(waiting)':'(ожидание)','Open':'Открыть',
    'Nothing matches.':'Ничего не найдено.','No agents yet.':'Агентов пока нет.','Hit “+ New Agent”.':'Нажмите «+ Новый агент».',
    'Create your first agent, give it a name, an avatar and a system prompt.':'Создайте первого агента: задайте имя, аватарку и системную инструкцию.',
    'Any OpenAI-compatible endpoint: a display name, an API key and one or more models.':'Любой совместимый с OpenAI сервер: название, ключ API и модели.',
    'Name, avatar from the cat pack, a system prompt, and the model it thinks with.':'Имя, своя аватарка или кот из набора, инструкция и модель.',
    'MCP connections for GitHub, Gmail, Notion and more — shared by the agents you allow.':'Подключения MCP к GitHub, Gmail, Notion и другим сервисам — только для выбранных агентов.',
    'Agents that ship code. Bring your own models, hand out connections, and every reply that contains code becomes one runnable artifact.':'Агенты для работы с кодом. Подключайте свои модели и сервисы; код из ответа собирается в один запускаемый файл.',
    'Start with a preset or point at your own OpenAI-compatible server.':'Выберите готовый вариант или укажите свой совместимый с OpenAI сервер.',
    'Model endpoints your agents can use. Each provider keeps its own key and model list.':'Серверы моделей для агентов. У каждого поставщика свой ключ и список моделей.',
    'Model Context Protocol servers. Each agent picks the connections it may use.':'Серверы MCP. Для каждого агента задайте разрешённые подключения.',
    'Remote servers need an access token (Headers on the next screen). Local servers run on this machine.':'Удалённые серверы поддерживают вход через браузер или токен. Локальные запускаются на этом компьютере.',
    'No connections yet. Add GitHub, Google Mail and others from the Connections page.':'Подключений пока нет. Добавьте их на странице «Подключения».',
    'Rename…':'Переименовать…','Chat title':'Название чата','Delete chat':'Удалить чат','Copied':'Скопировано','Reply copied':'Ответ скопирован',
    'Attach files':'Прикрепить файлы','Remove attachment':'Убрать вложение','You can attach up to 10 files.':'Можно прикрепить не более 10 файлов.',
    'Give the agent a name':'Введите имя агента','Pick a provider and a model':'Выберите поставщика и модель','Agent saved':'Агент сохранён','Agent deleted':'Агент удалён',
    'Provider deleted':'Поставщик удалён','Provider updated':'Поставщик обновлён','Provider added':'Поставщик добавлен','Base URL is required':'Укажите базовый адрес','Add at least one model':'Добавьте хотя бы одну модель',
    'Fetching…':'Загрузка…','Testing…':'Проверка…','Syncing…':'Синхронизация…','Connecting…':'Подключение…','Server URL is required':'Укажите адрес сервера','Launch command is required':'Укажите команду запуска',
    'Fonts: LINE Seed JP (UI buttons) · Climate Crisis (text). Bundled locally.':'Шрифты: LINE Seed JP (кнопки) · Climate Crisis (текст). Встроены в приложение.'
  };
  Object.assign(dictionary, {
    'your keys stay on this machine':'ключи остаются на этом компьютере','Agents':'Агенты','New Chat':'Новый чат','New agent':'Новый агент','No model':'Нет модели','no model':'нет модели','Working…':'Работаю…',
    'Start a conversation':'Начните разговор','You':'Вы','Working directory':'Рабочая папка','A short name':'Короткое имя',
    'Single-file code artifacts. Local data. No lock-in.':'Код в одном файле. Данные на устройстве. Без привязки к поставщику.',
    'Step 1':'Шаг 1','Step 2':'Шаг 2','Step 3':'Шаг 3','No model selected':'Модель не выбрана',
    'Connected, but the server exposes no tools.':'Подключено, но сервер не предоставляет инструментов.',
    'Remove all connections':'Удалить все подключения','This agent has no model. Open its settings and pick one.':'У агента нет модели. Выберите её в настройках агента.',
    'OpenAI-compatible: requests go to':'Совместимость с OpenAI: запросы отправляются на',
    'e.g. OpenAI — main':'Например, OpenAI — основной','display name':'Название модели','model id, e.g. gpt-4o':'Идентификатор модели, например gpt-4o',
    'What do they do? How do they think?':'Какова его задача и как он должен отвечать?',
    'Choose the tools this agent may use.':'Выберите доступные агенту инструменты.',
    'For local tools: the executable and arguments.':'Для локальных инструментов: программа и аргументы.',
    'Reasoning':'Рассуждения','Output':'Результат','Input':'Входные данные','Artifact':'Файл','Open artifact':'Открыть файл',
    'Delete every provider, agent, chat, connection and reminder?':'Удалить всех поставщиков, агентов, чаты, подключения и напоминания?',
    'e.g. Archivist':'Например, Архивист','You are… You do… Tone, rules, what to refuse, how to format code.':'Роль, задачи, стиль, ограничения и формат ответа.',
    'Streamable HTTP (JSON-RPC over POST).':'Streamable HTTP (JSON-RPC через POST).','e.g. {"Authorization":"Bearer …"}':'Например, {"Authorization":"Bearer …"}',
    'Custom / self-hosted':'Свой сервер','Ollama (local)':'Ollama (локально)','All data deleted':'Все данные удалены','Connection':'Подключение','Filesystem':'Файловая система','Memory':'Память'
  });
  const ru = () => window.S?.data.ui.locale !== 'en';
  function t(value) {
    if (!ru()) return value;
    if (dictionary[value]) return dictionary[value];
    const patterns = [
      [/^Add connection — (.*)$/, 'Добавить подключение — $1'],
      [/^Edit connection — (.*)$/, 'Изменить подключение — $1'],
      [/^Delete provider "(.*)"\?$/, 'Удалить поставщика «$1»?'],
      [/^Delete provider "(.*)"\? Agents using it will move to another provider or lose their model\.$/, 'Удалить поставщика «$1»? Его агенты переключатся на другого поставщика или останутся без модели.'],
      [/^Delete project "(.*)"\? Chats will remain in All chats\.$/, 'Удалить проект «$1»? Чаты останутся в разделе «Все чаты».'],
      [/^Delete every provider, agent, chat, connection and reminder\?$/, 'Удалить всех поставщиков, агентов, чаты, подключения и напоминания?'],
      [/^Delete "(.*)" and all of its chats\?$/, 'Удалить агента «$1» и все его чаты?'],
      [/^Remove the "(.*)" connection\?$/, 'Удалить подключение «$1»?'],
      [/^Connection "(.*)" saved$/, 'Подключение «$1» сохранено'],
      [/^Saved (.*)$/, 'Сохранено: $1'],
      [/^(.*): (\d+) tools$/, '$1: инструментов — $2']
    ];
    for (const [pattern,replacement] of patterns) if (pattern.test(value)) return value.replace(pattern,replacement);
    return value;
  }
  function translate(root) {
    if (!ru() || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (const n of nodes) {
      if (n.parentElement?.closest('.msg-text,.bubble,.reasoning-body,.tool-body,.chat-item-name,.chat-item-snip,.chat-head-name,.prompt-preview,.list-title,.model-chips,.conn-title,.conn-url,.conn-tools,.cn-tools,.artifact-body,.artifact-meta,.brand,input,textarea,script,style')) continue;
      const original = n.textContent; const trimmed = original.trim();
      const translated = t(trimmed);
      if (translated !== trimmed) n.textContent = original.replace(trimmed, translated);
    }
    for (const el of root.querySelectorAll('[title],[placeholder]')) {
      for (const attr of ['title','placeholder']) {
        const value = el.getAttribute(attr); if (value && dictionary[value]) el.setAttribute(attr, t(value));
      }
    }
  }
  function init() {
    document.documentElement.lang = ru() ? 'ru' : 'en';
    // Translate only immediately after application view functions produce UI,
    // not a global observer that might rewrite user or model content.
    for (const name of ['renderSetup','renderProviders','renderConnections','renderSettings','renderSidebar','renderChat','renderArtifactPane','openProviderEditor','openAgentEditor','openConnectionEditor','openConnectionsCatalog','modal']) {
      const original = window.Views[name];
      if (!original) continue;
      window.Views[name] = function (...args) { const result = original.apply(this,args); translate(document.getElementById('app')); translate(document.getElementById('modal-root')); return result; };
    }
    const originalConfirm = window.confirm.bind(window);
    window.confirm = message => originalConfirm(t(message));
    const toast = window.TOAST;
    window.TOAST = (message,kind) => toast(t(message),kind);
    translate(document.getElementById('app'));
  }
  function apply() {
    document.documentElement.lang = ru() ? 'ru' : 'en';
    if (ru()) { translate(document.getElementById('app')); return; }
    const inverse = Object.fromEntries(Object.entries(dictionary).map(([en,ru]) => [ru,en]));
    for (const root of document.querySelectorAll('.top-nav,#btn-new-agent,#btn-sidebar-providers,#btn-sidebar-connections,#artifact-pane')) {
      const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n;
      while ((n=walker.nextNode())) { const key=n.textContent.trim(); if(inverse[key]) n.textContent=n.textContent.replace(key,inverse[key]); }
    }
    const search=document.getElementById('chat-search'); if(search) search.placeholder='Search agents';
  }
  window.I18n = { t, ru, init, translate, apply };
})();
