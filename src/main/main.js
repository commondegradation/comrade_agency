'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Menu, Notification, Tray, nativeImage, systemPreferences } = require('electron');
const path = require('path');

// The sandboxed environment used for automated checks needs these switches.
if (process.env.COMRADE_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox');
  app.disableHardwareAcceleration();
}

const store = require('./services/store');
const ai = require('./services/ai');
const mcp = require('./services/mcp');
const webSearch = require('./services/web-search');
const reminderService = require('./services/reminders');
const computerControl = require('./services/computer-control');
require('./services/stdio');

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let reminderTimer = null;
const streams = new Map(); // streamId -> AbortController
let streamSeq = 0;

function createWindow() {
  nativeTheme.themeSource = 'light';
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 20 },
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (isDev && process.env.COMRADE_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  mainWindow = win;
  return win;
}

function showMainWindow(chatId) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  const win = mainWindow;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (chatId) {
    const openChat = () => {
      if (!win.isDestroyed()) win.webContents.send('reminder:open', chatId);
    };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', openChat);
    else openChat();
  }
}

function buildTrayMenu() {
  if (!tray) return;
  const isEnglish = store.get().ui?.locale === 'en';
  tray.setToolTip(isEnglish ? 'Comrade Agency — reminders run in the background' : 'Comrade Agency — напоминания работают в фоне');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isEnglish ? 'Open Comrade Agency' : 'Открыть Comrade Agency', click: () => showMainWindow() },
    { type: 'separator' },
    { label: isEnglish ? 'Quit' : 'Выйти', click: () => app.quit() }
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, '../renderer/assets/logo.svg');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) throw new Error(`Could not load tray icon: ${iconPath}`);
  icon = icon.resize({ width: 16, height: 16 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.on('click', () => showMainWindow());
  buildTrayMenu();
}

function notifyReminder(reminder) {
  const isEnglish = store.get().ui?.locale === 'en';
  const locale = isEnglish ? 'en-US' : 'ru-RU';
  const overdue = reminder.dueAt < Date.now() - 60_000;
  const title = isEnglish ? (overdue ? 'Overdue reminder' : 'Reminder') : (overdue ? 'Просроченное напоминание' : 'Напоминание');
  const dueText = new Date(reminder.dueAt).toLocaleString(locale);
  const body = `${reminder.title}\n${dueText}`;
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.on('click', () => showMainWindow(reminder.chatId));
    notification.show();
  } else if (process.platform === 'win32' && tray) {
    tray.displayBalloon({ title, content: body });
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder:due', { ...reminder, dueAt: new Date(reminder.dueAt).toISOString() });
  }
}

function scheduleReminderTimer(delayOverride) {
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = null;
  if (isQuitting) return;
  const next = reminderService.normalize(store.get().reminders)
    .filter((reminder) => reminder.status === 'pending')
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  if (!next) return;
  const delay = delayOverride ?? Math.max(0, next.dueAt - Date.now());
  reminderTimer = setTimeout(deliverDueReminders, Math.min(delay, 2_147_483_647));
}

function deliverDueReminders() {
  reminderTimer = null;
  const data = store.get();
  const { reminders: updated, due } = reminderService.markDue(data.reminders, Date.now());
  if (!due.length) {
    scheduleReminderTimer();
    return;
  }
  try {
    store.set({ ...data, reminders: updated });
  } catch (error) {
    console.error('[reminders] could not save fired reminders; retrying shortly:', error.message);
    scheduleReminderTimer(60_000);
    return;
  }
  due.forEach(notifyReminder);
  scheduleReminderTimer();
}

/* ------------------------------------------------------------------ *
 * IPC: storage
 * ------------------------------------------------------------------ */
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  dataDir: app.getPath('userData'),
  isPackaged: app.isPackaged
}));

ipcMain.handle('store:get', () => store.get());
ipcMain.handle('store:set', (_e, value) => {
  const result = store.set(value);
  buildMenu();
  scheduleReminderTimer();
  return result;
});
ipcMain.handle('store:reveal', () => shell.showItemInFolder(store.filePath()));

ipcMain.handle('reminder:create', (_e, input = {}) => {
  const data = store.get();
  const chat = data.chats.find((entry) => entry.id === input.chatId);
  if (!chat || chat.agentId !== input.agentId) throw new Error('The active chat for this reminder no longer exists.');
  const reminder = reminderService.create({
    title: input.title,
    dueAt: input.dueAt,
    chatId: chat.id,
    agentId: chat.agentId
  }, Date.now(), data.reminders);
  store.set({ ...data, reminders: data.reminders.concat(reminder) });
  scheduleReminderTimer();
  return reminderService.toPublic(reminder);
});

ipcMain.handle('reminder:list', () => reminderService.list(store.get().reminders));

ipcMain.handle('reminder:cancel', (_e, id) => {
  const data = store.get();
  const result = reminderService.cancel(data.reminders, id);
  store.set({ ...data, reminders: result.reminders });
  scheduleReminderTimer();
  return result.reminder;
});

/* ------------------------------------------------------------------ *
 * IPC: dialogs / files
 * ------------------------------------------------------------------ */
ipcMain.handle('dialog:image', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: store.get().ui?.locale === 'en' ? 'Choose an avatar' : 'Выберите аватарку',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return require('./services/avatar').fromFile(res.filePaths[0]);
});

ipcMain.handle('dialog:project-banner', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: store.get().ui?.locale === 'en' ? 'Choose a project banner' : 'Выберите баннер проекта',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return require('./services/avatar').bannerFromFile(res.filePaths[0]);
});

ipcMain.handle('project:files:pick', async () => {
  const projectFiles = require('./services/project-files');
  const isEnglish = store.get().ui?.locale === 'en';
  const res = await dialog.showOpenDialog(mainWindow, {
    title: isEnglish ? 'Add project files' : 'Добавьте файлы проекта',
    properties: ['openFile', 'multiSelections'],
    filters: [{
      name: isEnglish ? 'Text, PDF, and Word documents' : 'Текст, PDF и документы Word',
      extensions: projectFiles.TEXT_EXTENSIONS.concat(['pdf', 'docx'])
    }]
  });
  if (res.canceled || !res.filePaths.length) return [];
  return projectFiles.readFiles(res.filePaths);
});

ipcMain.handle('chat:files:pick', async () => {
  const projectFiles = require('./services/project-files');
  const isEnglish = store.get().ui?.locale === 'en';
  const res = await dialog.showOpenDialog(mainWindow, {
    title: isEnglish ? 'Attach files to message' : 'Прикрепить файлы к сообщению',
    properties: ['openFile', 'multiSelections'],
    filters: [{
      name: isEnglish ? 'Text, PDF, and Word documents' : 'Текст, PDF и документы Word',
      extensions: projectFiles.TEXT_EXTENSIONS.concat(['pdf', 'docx'])
    }]
  });
  if (res.canceled || !res.filePaths.length) return [];
  return projectFiles.readFiles(res.filePaths);
});

ipcMain.handle('file:save', async (_e, { name, content, filterName, ext }) => {
  const safe = String(name || 'artifact.txt').replace(/[\\/:*?"<>|]+/g, '-');
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('downloads'), safe),
    filters: [{ name: filterName || 'File', extensions: [ext || 'txt'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false };
  require('fs').writeFileSync(res.filePath, content ?? '', 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.handle('file:openPath', (_e, p) => shell.openPath(p));

/* ------------------------------------------------------------------ *
 * IPC: AI streaming
 * ------------------------------------------------------------------ */
ipcMain.handle('ai:listModels', (_e, options) => ai.listModels(options));

ipcMain.handle('ai:start', (e, payload) => {
  const id = `s${++streamSeq}`;
  const controller = new AbortController();
  streams.set(id, controller);
  const sender = e.sender;
  const send = (chunk) => {
    if (sender.isDestroyed()) return;
    sender.send('ai:chunk', { id, ...chunk });
  };
  // Remote MCP connections are executed in the renderer, so the set of
  // tools that actually exists is asserted here before anything is sent.
  const agent = store.get().agents.find(a => a.id === payload.agentId);
  payload.agentConnectionIds = agent?.connectionIds || [];
  const requested = new Set((payload.tools || []).map(t => (t.function || t).name));
  payload.tools = mcp.toolsForConnections(store.get().connections, payload.agentConnectionIds)
    .tools.map((t) => t.function).filter(t => requested.has(t.name));
  if (agent?.webSearch === true && requested.has(webSearch.TOOL.function.name)) {
    payload.tools.push(webSearch.TOOL.function);
  }
  for (const tool of reminderService.TOOLS) {
    if (requested.has(tool.function.name)) payload.tools.push(tool.function);
  }
  if (agent?.computerControl === true) {
    for (const tool of computerControl.TOOLS) {
      if (requested.has(tool.function.name)) payload.tools.push(tool.function);
    }
  }
  ai.runStream(payload, {
    signal: controller.signal,
    onEvent: send
  })
    .then((final) => send({ type: 'done', final }))
    .catch((err) => {
      if (controller.signal.aborted) send({ type: 'aborted' });
      else send({ type: 'error', message: err.message || String(err) });
    })
    .finally(() => streams.delete(id));
  return { id };
});

ipcMain.handle('ai:cancel', (_e, id) => {
  const c = streams.get(id);
  if (!c) return false;
  c.abort();
  return true;
});

/* ------------------------------------------------------------------ *
 * IPC: MCP connections (remote HTTP servers)
 * ------------------------------------------------------------------ */
const remoteMcp = require('./services/remote-mcp');
const knowledge = require('./services/knowledge');
ipcMain.handle('mcp:listTools', async (_e, { server }) => {
  if (server.connectionId) return remoteMcp.list(server.connectionId);
  return ai.listToolsOnServer(server);
});
ipcMain.handle('mcp:auth', async (_e, { id, action }) => {
  if (!['start', 'status', 'disconnect'].includes(action)) throw new Error('Недопустимое действие');
  return remoteMcp[action](id);
});
ipcMain.handle('mcp:execute', async (_e, { agentId, connectionId, name, args }) => {
  const data = store.get();
  const agent = data.agents.find(a => a.id === agentId);
  const c = data.connections.find(c => c.id === connectionId && c.enabled);
  if (!agent || !c || !(agent.connectionIds || []).includes(c.id)) throw new Error('Агенту не разрешено это подключение');
  const tool = (c.tools || []).find(t => t.name === name);
  if (!tool) throw new Error('Инструмент не найден. Синхронизируйте подключение.');
  // Annotations are server claims, not authorization. Confirm every external call
  // conservatively: even a tool called "read" may have side effects.
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'question', title: 'Действие агента',
    message: `${agent.name} → ${c.title}: ${name}`,
    detail: `Проверьте параметры перед выполнением:\n${JSON.stringify(args || {}, null, 2).slice(0, 6000)}`,
    buttons: ['Отменить', 'Разрешить один раз'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (choice.response !== 1) return { isError: true, content: [{ type: 'text', text: 'Пользователь отклонил действие' }] };
  if (c.server.type === 'stdio') return require('./services/stdio').request(c.server, [
    { method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'comrade-agency', version: '1.0.0' } } },
    { method: 'tools/call', params: { name, arguments: args || {} } }
  ]);
  return remoteMcp.call(c.id, name, args);
});
function computerControlAgent(agentId) {
  const agent = store.get().agents.find(a => a.id === agentId);
  if (!agent || agent.computerControl !== true) throw new Error('Для агента не включено управление компьютером.');
  return agent;
}

function computerControlDialog(agent, { title, message, detail }) {
  return dialog.showMessageBox(mainWindow, {
    type: 'question',
    title,
    message,
    detail,
    buttons: store.get().ui?.locale === 'en' ? ['Cancel', 'Allow once'] : ['Отмена', 'Разрешить один раз'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
}

ipcMain.handle('computer:getSettings', (_e, { agentId }) => {
  computerControlAgent(agentId);
  return computerControl.currentSettings(store.get().ui);
});

ipcMain.handle('computer:runTerminal', async (_e, { agentId, command, cwd }) => {
  const agent = computerControlAgent(agentId);
  const request = computerControl.validateTerminalRequest(command, cwd);
  const isEnglish = store.get().ui?.locale === 'en';
  const choice = await computerControlDialog(agent, {
    title: isEnglish ? 'Approve terminal command' : 'Подтверждение команды терминала',
    message: isEnglish
      ? `${agent.name} wants to run a command on this computer.`
      : `${agent.name} запрашивает запуск команды на этом компьютере.`,
    detail: `${isEnglish ? 'Working directory' : 'Рабочая папка'}:\n${request.cwd}\n\n${isEnglish ? 'Exact command' : 'Команда'}:\n${JSON.stringify(request.command)}`
  });
  if (choice.response !== 1) return { ok: false, canceled: true, output: isEnglish ? 'User declined the command.' : 'Пользователь отклонил команду.' };
  const result = await computerControl.runTerminal(request.command, request.cwd);
  return { ok: true, ...result };
});

ipcMain.handle('computer:updateSettings', async (_e, { agentId, settings }) => {
  const agent = computerControlAgent(agentId);
  const patch = computerControl.validateSettingsPatch(settings);
  const isEnglish = store.get().ui?.locale === 'en';
  const choice = await computerControlDialog(agent, {
    title: isEnglish ? 'Approve app settings change' : 'Подтверждение изменения настроек',
    message: isEnglish
      ? `${agent.name} wants to change Comrade Agency settings.`
      : `${agent.name} запрашивает изменение настроек Comrade Agency.`,
    detail: JSON.stringify(patch, null, 2)
  });
  if (choice.response !== 1) return { ok: false, canceled: true, output: isEnglish ? 'User declined the settings change.' : 'Пользователь отклонил изменение настроек.' };
  const data = store.get();
  const ui = { ...(data.ui || {}), ...patch };
  store.set({ ...data, ui });
  buildMenu();
  scheduleReminderTimer();
  return { ok: true, settings: computerControl.currentSettings(ui) };
});

ipcMain.handle('knowledge:search', (_e, query) => knowledge.search(query));
ipcMain.handle('web:search', (_e, { agentId, query } = {}) => {
  const agent = store.get().agents.find(a => a.id === agentId);
  if (!agent || agent.webSearch !== true) throw new Error('Internet search is disabled for this agent.');
  return webSearch.search(query);
});

/* ------------------------------------------------------------------ *
 * Menu
 * ------------------------------------------------------------------ */
function buildMenu() {
  const send = (event) => mainWindow && mainWindow.webContents.send('menu', event);
  const nativeLabels = { 'Settings…':'Настройки…', 'File':'Файл', 'New Agent':'Новый агент', 'New Chat':'Новый чат', 'Edit':'Правка', 'View':'Вид', 'Toggle Artifact Panel':'Панель файлов' };
  const localize = items => items.forEach(item => { if (store.get().ui?.locale !== 'en' && nativeLabels[item.label]) item.label = nativeLabels[item.label]; if (item.submenu) localize(item.submenu); });
  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('settings') },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' }, { role: 'quit' }
          ]
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Agent', accelerator: 'CmdOrCtrl+N', click: () => send('new-agent') },
        { label: 'New Chat', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new-chat') },
        { type: 'separator' },
        ...(process.platform === 'darwin' ? [] : [{ label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') }]),
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Artifact Panel', accelerator: 'CmdOrCtrl+Shift+A', click: () => send('toggle-artifact') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Comrade Agency — README', click: () => shell.openPath(path.join(app.getAppPath(), 'README.md')) }
      ]
    }
  ];
  localize(template);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  buildTrayMenu();
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'Comrade Agency',
      applicationVersion: app.getVersion(),
      copyright: 'Agents that ship code. Black & white, one artifact at a time.'
    });
    buildMenu();
    createWindow();
    createTray();
    scheduleReminderTimer();
    app.on('activate', () => {
      showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = null;
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
