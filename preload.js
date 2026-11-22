const { contextBridge, ipcRenderer } = require('electron');

const on = (ch, cb) => { const f = (_e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };

contextBridge.exposeInMainWorld('botnix', {
  info: () => ipcRenderer.invoke('app:info'),
  get: p => ipcRenderer.invoke('api', 'GET', p),
  post: (p, body) => ipcRenderer.invoke('api', 'POST', p, body || {}),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  openWeb: p => ipcRenderer.invoke('open:web', p),
  check: () => ipcRenderer.invoke('update:check'),
  later: () => ipcRenderer.invoke('update:later'),
  install: () => ipcRenderer.invoke('update:install'),
  reset: () => ipcRenderer.invoke('app:reset'),
  openExternal: url => ipcRenderer.invoke('open:external', url),
  onAvailable: cb => on('update:available', cb),
  onNone: cb => on('update:none', cb),
  onError: cb => on('update:error', cb),
  onProgress: cb => on('update:progress', cb),
});
