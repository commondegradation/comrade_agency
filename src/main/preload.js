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
    image: () => ipcRenderer.invoke('dialog:image'),
    projectBanner: () => ipcRenderer.invoke('dialog:project-banner')
  },

  projects: {
    pickFiles: () => ipcRenderer.invoke('project:files:pick')
  },

  files: {
    pickForChat: () => ipcRenderer.invoke('chat:files:pick'),
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
    listModels: (options) => ipcRenderer.invoke('ai:listModels', options),
    start: (payload) => ipcRenderer.invoke('ai:start', payload),
    cancel: (id) => ipcRenderer.invoke('ai:cancel', id),
    onChunk: listeners('ai:chunk')
  },

  mcp: {
    auth: (id, action) => ipcRenderer.invoke('mcp:auth', { id, action }),
    execute: (agentId, connectionId, name, args) => ipcRenderer.invoke('mcp:execute', { agentId, connectionId, name, args }),
    listTools: (server) => ipcRenderer.invoke('mcp:listTools', { server }),
    stdio: (id, spec, requests) => ipcRenderer.invoke('mcp:stdio', { id, spec, requests })
  },

  computerControl: {
    getSettings: (agentId) => ipcRenderer.invoke('computer:getSettings', { agentId }),
    runTerminal: (agentId, command, cwd) => ipcRenderer.invoke('computer:runTerminal', { agentId, command, cwd }),
    updateSettings: (agentId, settings) => ipcRenderer.invoke('computer:updateSettings', { agentId, settings })
  },

  knowledge: { search: (query) => ipcRenderer.invoke('knowledge:search', query) },
  web: { search: (agentId, query) => ipcRenderer.invoke('web:search', { agentId, query }) },
  reminders: {
    create: (reminder) => ipcRenderer.invoke('reminder:create', reminder),
    list: () => ipcRenderer.invoke('reminder:list'),
    cancel: (id) => ipcRenderer.invoke('reminder:cancel', id),
    onDue: listeners('reminder:due'),
    onOpen: listeners('reminder:open')
  },
  onMenu: listeners('menu')
});
