'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listeners = (channel) => (cb) => {
  const fn = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('comrade', {
  info: () => ipcRenderer.invoke('app:info'),

  store: {
    get: () => ipcRenderer.invoke('store:get'),
    set: (value) => ipcRenderer.invoke('store:set', value),
    reveal: () => ipcRenderer.invoke('store:reveal')
  },

  dialog: {
    image: () => ipcRenderer.invoke('dialog:image')
  },

  files: {
    save: (opts) => ipcRenderer.invoke('file:save', opts),
    openPath: (p) => ipcRenderer.invoke('file:openPath', p),
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file) || (file && file.path) || '';
      } catch {
        return (file && file.path) || '';
      }
    }
  },

  ai: {
    start: (payload) => ipcRenderer.invoke('ai:start', payload),
    cancel: (id) => ipcRenderer.invoke('ai:cancel', id),
    onChunk: listeners('ai:chunk')
  },

  mcp: {
    listTools: (server) => ipcRenderer.invoke('mcp:listTools', { server }),
    callTool: (server, name, args) => ipcRenderer.invoke('mcp:callTool', { server, name, args }),
    stdio: (id, spec, requests) => ipcRenderer.invoke('mcp:stdio', { id, spec, requests })
  },

  onMenu: listeners('menu')
});
