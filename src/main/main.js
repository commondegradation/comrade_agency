'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Menu, systemPreferences } = require('electron');
const path = require('path');

// The sandboxed environment used for automated checks needs these switches.
if (process.env.COMRADE_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox');
  app.disableHardwareAcceleration();
}

const store = require('./services/store');
const ai = require('./services/ai');
const mcp = require('./services/mcp');
require('./services/stdio');

const isDev = !app.isPackaged;

let mainWindow = null;
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
  mainWindow = win;
  return win;
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
ipcMain.handle('store:set', (_e, value) => { const result = store.set(value); buildMenu(); return result; });
ipcMain.handle('store:reveal', () => shell.showItemInFolder(store.filePath()));

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
ipcMain.handle('knowledge:search', (_e, query) => knowledge.search(query));

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
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'Comrade Agency',
      applicationVersion: app.getVersion(),
      copyright: 'Agents that ship code. Black & white, one artifact at a time.'
    });
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
