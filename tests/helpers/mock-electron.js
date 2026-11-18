'use strict';
const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Returns the original loader so each test file can restore it cleanly.
function install(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comrade-mock-'));
  const fake = {
    app: {
      getPath: (name) => name === 'userData' ? tmp : tmp,
      getVersion: () => '0.0.0-test',
      isPackaged: false,
      name: 'comrade-agency',
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      setAboutPanelOptions: () => {},
      on: () => {},
      quit: () => {},
      commandLine: { appendSwitch: () => {} },
      disableHardwareAcceleration: () => {}
    },
    BrowserWindow: class {
      constructor() {}
      loadFile() { return Promise.resolve(); }
      once() {}
      show() {}
      on() {}
      get webContents() { return { setWindowOpenHandler() {}, on() {}, send() {}, isDestroyed: () => false }; }
      static getAllWindows() { return []; }
      isMinimized() { return false; }
      restore() {}
      focus() {}
    },
    ipcMain: { handle: () => {} },
    shell: { openExternal: () => Promise.resolve(), showItemInFolder: () => {}, openPath: () => Promise.resolve() },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
      showMessageBox: async () => ({ response: 0 })
    },
    nativeTheme: { themeSource: 'light' },
    Menu: { setApplicationMenu: () => {}, buildFromTemplate: (t) => ({ items: t }) },
    systemPreferences: {},
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
      decryptString: (b) => b.toString('utf8').replace(/^enc:/, '')
    },
    nativeImage: {
      createFromBuffer: (buf) => ({
        isEmpty: () => buf.length === 0,
        getSize: () => ({ width: 200, height: 100 }),
        crop: () => ({ resize: () => ({ toDataURL: () => 'data:image/png;base64,MOCK' }) })
      })
    },
    ...overrides
  };
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return fake;
    return original.call(this, request, ...rest);
  };
  return { tmp, restore: () => { Module._load = original; } };
}

module.exports = { install };
