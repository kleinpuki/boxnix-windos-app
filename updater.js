const fs = require('fs');
const path = require('path');
const need = name => {
  try { return require(name); } catch {
    const extra = global.BOTNIX ? [path.join(global.BOTNIX.bundledDir, '..')] : [];
    return require(require.resolve(name, { paths: [path.join(__dirname, '..'), ...extra] }));
  }
};
const AdmZip = need('adm-zip');

const api = async (settings, p, raw = false) => {
  const headers = { 'User-Agent': 'botnixcore-dashboard', Accept: raw ? 'application/octet-stream' : 'application/vnd.github+json' };
  if (settings.githubToken) headers.Authorization = `Bearer ${settings.githubToken}`;
  const r = await fetch(`https://api.github.com${p}`, { headers, redirect: 'follow', signal: AbortSignal.timeout(raw ? 120000 : 15000) });
  if (r.status === 404) throw new Error('Repository nicht gefunden. Ist es privat? Dann in den Einstellungen einen GitHub-Token eintragen.');
  if (r.status === 401) throw new Error('Der GitHub-Token ist ungültig.');
  if (r.status === 403) throw new Error('GitHub-Limit erreicht. In einer Stunde geht es wieder (mit Token öfter).');
  if (!r.ok) throw new Error(`GitHub antwortet mit Fehler ${r.status}.`);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
};

const checkForUpdate = async (settings, installedSha) => {
  const repo = settings.repo;
  const branch = settings.branch ? `&sha=${encodeURIComponent(settings.branch)}` : '';
  const commits = await api(settings, `/repos/${repo}/commits?per_page=1${branch}`);
  const latest = Array.isArray(commits) ? commits[0] : null;
  if (!latest) return { latestSha: null, available: false };
  if (!installedSha) return { latestSha: latest.sha, available: false, baseline: true };
  if (latest.sha === installedSha) return { latestSha: latest.sha, available: false };
  let files = [];
  let total = 0;
  try {
    const cmp = await api(settings, `/repos/${repo}/compare/${installedSha}...${latest.sha}`);
    files = (cmp.files || []).map(f => ({ name: f.filename, status: f.status }));
    total = cmp.total_commits || 0;
  } catch {
    const one = await api(settings, `/repos/${repo}/commits/${latest.sha}`).catch(() => ({}));
    files = (one.files || []).map(f => ({ name: f.filename, status: f.status }));
    total = 1;
  }
  return {
    available: true,
    latestSha: latest.sha,
    message: String(latest.commit?.message || 'Neues Update'),
    author: latest.commit?.author?.name || latest.author?.login || '',
    date: latest.commit?.author?.date || latest.commit?.committer?.date || '',
    url: latest.html_url || `https://github.com/${repo}/commit/${latest.sha}`,
    files: files.slice(0, 100),
    commits: total,
  };
};

const rmrf = p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} };
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
};

const applyZip = (zipBuffer, dirs) => {
  const tmp = path.join(dirs.userData, `update-tmp-${Date.now()}`);
  rmrf(tmp);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const zip = new AdmZip(zipBuffer);
    for (const entry of zip.getEntries()) {
      const target = path.resolve(tmp, entry.entryName);
      if (!target.startsWith(path.resolve(tmp) + path.sep)) throw new Error('Unsichere Datei im Update gefunden, Update abgebrochen.');
    }
    zip.extractAllTo(tmp, true);
    const top = fs.readdirSync(tmp, { withFileTypes: true });
    const root = top.length === 1 && top[0].isDirectory() ? path.join(tmp, top[0].name) : tmp;
    const appSrc = fs.existsSync(path.join(root, 'app', 'main.js')) ? path.join(root, 'app') : fs.existsSync(path.join(root, 'main.js')) ? root : null;
    if (appSrc) {
      for (const need of ['main.js', 'preload.js', 'shell.html', 'shell.js', 'app.css', 'updater.js']) if (!fs.existsSync(path.join(appSrc, need))) { throw new Error(`Das Update ist unvollständig: ${need} fehlt.`); }
      const next = `${dirs.installedDir}-neu`;
      rmrf(next);
      copyDir(appSrc, next);
      rmrf(`${dirs.installedDir}-alt`);
      if (fs.existsSync(dirs.installedDir)) fs.renameSync(dirs.installedDir, `${dirs.installedDir}-alt`);
      fs.renameSync(next, dirs.installedDir);
      return { type: 'app', restart: true };
    }
    fs.mkdirSync(dirs.filesDir, { recursive: true });
    copyDir(root, dirs.filesDir);
    return { type: 'files', folder: dirs.filesDir, restart: false };
  } finally { rmrf(tmp); }
};

const downloadAndApply = async (settings, sha, dirs) => {
  const zip = await api(settings, `/repos/${settings.repo}/zipball/${sha}`, true);
  return applyZip(zip, dirs);
};

module.exports = { checkForUpdate, downloadAndApply, applyZip };
