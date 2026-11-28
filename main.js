const { app, BrowserWindow, ipcMain, shell, Notification, nativeTheme, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { checkForUpdate, downloadAndApply } = require('./updater');

const ENV = global.BOTNIX || { appDir: __dirname, bundledDir: __dirname, installedDir: path.join(app.getPath('userData'), 'app'), fromUpdate: false };
const USER = app.getPath('userData');
const STATE_FILE = path.join(USER, 'update-stand.json');
const FIXED = { dashboardUrl: process.env.BOTNIX_URL || 'https://botnixcore2.onrender.com', repo: 'kleinpuki/boxnix-windos-app', branch: '', githubToken: '', intervalMin: 10 };

const readJson = (f, d) => { try { return { ...d, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return { ...d }; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
const settings = { ...FIXED };
let state = readJson(STATE_FILE, { installedSha: null, laterSha: null, lastCheck: 0, lastError: '' });
if (state.repo !== settings.repo) state = { installedSha: null, laterSha: null, lastCheck: 0, lastError: '', repo: settings.repo };
let pending = null;
let win = null;
let timer = null;
let busy = false;

const versionInfo = () => { try { return JSON.parse(fs.readFileSync(path.join(ENV.appDir, 'version.json'), 'utf8')); } catch { return { version: '1.0.0' }; } };
const version = () => versionInfo().version || '1.0.0';
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const saveState = () => writeJson(STATE_FILE, state);

const check = async (manual = false) => {
  if (!settings.repo) return { ok: false, error: 'Kein Repository eingestellt.' };
  try {
    const r = await checkForUpdate(settings, state.installedSha);
    state.lastCheck = Date.now();
    state.lastError = '';
    if (r.baseline) { state.installedSha = r.latestSha; saveState(); return { ok: true, upToDate: true, baseline: true }; }
    saveState();
    if (!r.available) { pending = null; send('update:none', { manual }); return { ok: true, upToDate: true }; }
    const isNew = !pending || pending.latestSha !== r.latestSha;
    pending = r;
    const later = state.laterSha === r.latestSha;
    send('update:available', { ...r, later, manual });
    if (isNew && !later && Notification.isSupported() && (!win || !win.isFocused())) new Notification({ title: 'botnixcore Dashboard', body: 'Ein neues Update ist verfügbar.' }).show();
    return { ok: true, upToDate: false };
  } catch (e) {
    state.lastError = e.message;
    saveState();
    send('update:error', { message: e.message, manual });
    return { ok: false, error: e.message };
  }
};

const schedule = () => {
  clearInterval(timer);
  timer = setInterval(() => check(false), Math.max(2, Number(settings.intervalMin) || 10) * 60000);
};

const BASE = settings.dashboardUrl;
const PART = 'persist:botnix';
const ses = () => session.fromPartition(PART);

const createWindow = () => {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 980, minHeight: 640,
    title: 'botnixcore Dashboard', backgroundColor: '#0e0d16', autoHideMenuBar: true,
    icon: path.join(ENV.bundledDir, 'icon.png'),
    webPreferences: { preload: path.join(ENV.appDir, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(ENV.appDir, 'shell.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('did-finish-load', () => {
    if (ENV.brokenUpdate) send('update:error', { message: `Das letzte Update hatte einen Fehler und wurde zurückgesetzt: ${ENV.brokenUpdate}`, manual: true });
    setTimeout(() => check(false), 1500);
  });
};

const callApi = async (method, p, body) => {
  if (!/^\/api\//.test(String(p))) return { status: 400, data: { error: 'Ungültige Anfrage.' } };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), /\/assistant$/.test(String(p)) ? 180000 : 90000);
  try {
    const r = await ses().fetch(BASE + p, {
      method, credentials: 'include', signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    const txt = await r.text();
    try { data = JSON.parse(txt); } catch { data = { error: r.status >= 500 ? 'Der Server hat einen Fehler gemeldet.' : 'Die Website ist noch nicht aktualisiert (API fehlt).' }; }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: { error: e.name === 'AbortError' ? 'Zeitüberschreitung. Der Server startet vielleicht gerade, versuch es gleich nochmal.' : 'Keine Verbindung zum Server.' } };
  } finally { clearTimeout(t); }
};

let loginWin = null;
const login = () => new Promise(resolve => {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return resolve(false); }
  let done = false;
  loginWin = new BrowserWindow({
    width: 520, height: 780, parent: win, modal: true, title: 'Mit Discord anmelden', backgroundColor: '#0e0d16', autoHideMenuBar: true,
    icon: path.join(ENV.bundledDir, 'icon.png'),
    webPreferences: { partition: PART, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const watch = url => {
    try {
      const u = new URL(url);
      if (u.origin === new URL(BASE).origin && (u.pathname === '/dashboard' || u.pathname === '/')) {
        done = true;
        resolve(true);
        if (!loginWin.isDestroyed()) loginWin.close();
      }
    } catch {}
  };
  loginWin.webContents.on('did-navigate', (_e, url) => watch(url));
  loginWin.webContents.on('will-redirect', (_e, url) => watch(url));
  loginWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  loginWin.on('closed', () => { loginWin = null; if (!done) resolve(false); });
  loginWin.loadURL(`${BASE}/login`);
});

ipcMain.handle('api', (_e, method, p, body) => callApi(['GET', 'POST'].includes(method) ? method : 'GET', p, body));
ipcMain.handle('auth:login', () => login());
ipcMain.handle('auth:logout', async () => { await callApi('GET', '/api/logout'); await ses().clearStorageData({ storages: ['cookies'] }); return true; });
ipcMain.handle('open:web', (_e, p) => { const u = String(p || '/'); shell.openExternal(BASE + (u.startsWith('/') ? u : '/')); });
ipcMain.handle('app:seen', () => { state.seenVersion = version(); saveState(); return true; });
ipcMain.handle('app:info', () => ({ version: version(), changes: Array.isArray(versionInfo().changes) ? versionInfo().changes.slice(0, 40) : [], seenVersion: state.seenVersion || null, lastNotes: state.lastNotes || null, fromUpdate: ENV.fromUpdate, installedSha: state.installedSha, lastCheck: state.lastCheck, lastError: state.lastError, pending, laterSha: state.laterSha, base: BASE }));
ipcMain.handle('update:check', () => check(true));
ipcMain.handle('update:later', () => { if (pending) { state.laterSha = pending.latestSha; saveState(); } return true; });
ipcMain.handle('update:install', async () => {
  if (!pending || busy) return { ok: false, error: busy ? 'Update läuft schon.' : 'Kein Update verfügbar.' };
  busy = true;
  send('update:progress', { step: 'Lade Update herunter …' });
  try {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const res = await downloadAndApply(settings, pending.latestSha, { userData: USER, installedDir: ENV.installedDir, filesDir: path.join(app.getPath('documents'), 'botnixcore-updates', `${stamp}-${pending.latestSha.slice(0, 7)}`) });
    state.installedSha = pending.latestSha;
    state.lastNotes = { message: pending.message || '', date: pending.date || '', commits: pending.commits || 1 };
    state.laterSha = null;
    saveState();
    pending = null;
    if (res.restart) {
      send('update:progress', { step: 'Fertig! Die App startet neu …' });
      setTimeout(() => { app.relaunch(); app.exit(0); }, 1200);
      return { ok: true, restart: true };
    }
    send('update:progress', { step: 'Dateien heruntergeladen.', done: true, folder: res.folder });
    shell.openPath(res.folder);
    return { ok: true, folder: res.folder };
  } catch (e) {
    send('update:error', { message: `Update fehlgeschlagen: ${e.message}`, manual: true });
    return { ok: false, error: e.message };
  } finally { busy = false; }
});
ipcMain.handle('app:reset', () => { app.relaunch({ args: process.argv.slice(1).concat(['--werkseinstellung']) }); app.exit(0); });
ipcMain.handle('open:external', (_e, url) => { if (/^https?:\/\//i.test(String(url))) shell.openExternal(url); });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { createWindow(); schedule(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
