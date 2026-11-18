'use strict';
// OAuth secrets never enter the renderer store or its exports.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
function file() { return path.join(app.getPath('userData'), 'mcp-credentials.enc'); }
function read() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранилище macOS недоступно. Вход не выполнен.');
  if (!fs.existsSync(file())) return {};
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(file())));
}
function write(data) {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.tmp', safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
  fs.renameSync(target + '.tmp', target);
}
function get(key) { return read()[key] || {}; }
function set(key, value) { const data = read(); data[key] = value; write(data); }
function remove(key) { const data = read(); delete data[key]; write(data); }
module.exports = { get, set, remove };
