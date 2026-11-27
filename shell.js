const B = window.botnix;
const $ = id => document.getElementById(id);
const main = $('main');

const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
const show = (...kids) => { main.replaceChildren(...kids); };
let toastT = null;
const toast = (text, kind = '') => {
  const t = $('toast');
  t.textContent = text;
  t.className = `toast on ${kind}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = 'toast'; }, kind === 'err' ? 8000 : 4000);
};
const fmt = n => Number(n || 0).toLocaleString('de-DE');
const fmtDate = d => { try { return new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
const gicon = (g, cls = 'gic') => h('div', { class: cls }, g.icon ? h('img', { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96`, alt: '' }) : String(g.name || '?').slice(0, 2).toUpperCase());
const crumb = (...parts) => $('crumb').replaceChildren(...parts.filter(Boolean).flatMap((p, i) => i ? [h('span', null, '›'), p] : [p]));

const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const tabOn = t => (t.on != null ? !!t.on : !!(t.sw && G.values[t.sw]));
const hasSw = t => t.on != null || !!t.sw;
let me = null;
let G = null;
let dirty = false;
let curTab;

const confirmLeave = () => !dirty || confirm('Du hast ungespeicherte Änderungen. Trotzdem verlassen?');

const loading = text => show(h('div', { class: 'center' }, h('div', null, h('div', { class: 'spin' }), h('p', { style: 'margin-top:16px' }, text))));
const failed = (text, retry) => show(h('div', { class: 'center' }, h('div', null, h('div', { class: 'biglogo' }), h('h1', null, 'Keine Verbindung'), h('p', null, text), h('button', { class: 'btn p', onclick: retry }, 'Nochmal versuchen'))));

const request = async (method, p, body) => {
  const r = method === 'GET' ? await B.get(p) : await B.post(p, body);
  if (r.status === 401) { me = null; renderMe(); loginView(); throw Object.assign(new Error('login'), { silent: true }); }
  if (r.status < 200 || r.status >= 300) throw new Error((r.data && r.data.error) || `Fehler ${r.status}`);
  return r.data;
};

const renderMe = () => {
  const box = $('me');
  if (!me) return box.replaceChildren();
  const menu = h('div', { class: 'menu' },
    h('button', { onclick: () => { menu.classList.remove('on'); if (confirmLeave()) { dirty = false; servers(true); } } }, '🗂️ Meine Server'),
    h('button', { onclick: () => { menu.classList.remove('on'); B.openWeb('/'); } }, '🌐 Website öffnen'),
    h('button', { onclick: e => { const v = !LS.get('reopen', true); LS.set('reopen', v); e.currentTarget.textContent = `${v ? '✅' : '⬜'} Letzten Server beim Start öffnen`; } }, `${LS.get('reopen', true) ? '✅' : '⬜'} Letzten Server beim Start öffnen`),
    h('button', { onclick: async () => { menu.classList.remove('on'); await B.logout(); me = null; renderMe(); loginView(); } }, '🚪 Abmelden'));
  box.replaceChildren(
    me.user.avatar ? h('img', { src: `https://cdn.discordapp.com/avatars/${me.user.id}/${me.user.avatar}.png?size=64`, alt: '' }) : h('div', { class: 'av' }, me.user.name.slice(0, 1)),
    h('span', null, me.user.name), menu);
  box.onclick = e => { if (!menu.contains(e.target)) menu.classList.toggle('on'); };
};
document.addEventListener('click', e => { const m = document.querySelector('.menu.on'); if (m && !$('me').contains(e.target)) m.classList.remove('on'); });

const loginView = () => {
  hideAssistant();
  crumb();
  show(h('div', { class: 'center' }, h('div', null,
    h('div', { class: 'biglogo' }),
    h('h1', null, 'Willkommen bei botnixcore'),
    h('p', null, 'Melde dich mit Discord an, um deine Server zu verwalten.'),
    h('button', { class: 'btn dc', onclick: async e => {
      e.currentTarget.disabled = true;
      const ok = await B.login();
      if (ok) start(); else { e.currentTarget.disabled = false; }
    } }, 'Mit Discord anmelden'))));
};

const start = async () => {
  loading('Verbinde mit botnixcore … (kann beim ersten Start bis zu einer Minute dauern)');
  try {
    me = await request('GET', '/api/me');
    renderMe();
    const last = LS.get('last', null);
    if (last && LS.get('reopen', true) && me.guilds.some(g => g.id === last.g && g.lvl !== 'invite')) return guild(last.g, last.t || undefined);
    servers();
  } catch (e) { if (!e.silent) failed(e.message, start); }
};

const servers = async refresh => {
  hideAssistant();
  G = null;
  LS.set('last', null);
  crumb(h('b', null, 'Meine Server'));
  if (refresh) { loading('Lade Server …'); try { me = await request('GET', '/api/me?neu=1'); } catch (e) { if (!e.silent) failed(e.message, () => servers(true)); return; } }
  const LV = { admin: 'Admin', manage: 'Verwalter', role: 'Team-Zugang' };
  const fav = new Set(LS.get('fav', []));
  const sorted = [...me.guilds].sort((a, b) => (fav.has(b.id) - fav.has(a.id)) || ((b.lvl !== 'invite') - (a.lvl !== 'invite')));
  const list = h('div', { class: 'servers' }, sorted.map(g => {
    const has = g.lvl !== 'invite';
    const star = has ? h('button', { class: `star${fav.has(g.id) ? ' on' : ''}`, title: 'Als Favorit oben anheften', onclick: e => { e.stopPropagation(); fav.has(g.id) ? fav.delete(g.id) : fav.add(g.id); LS.set('fav', [...fav]); servers(); } }, fav.has(g.id) ? '★' : '☆') : null;
    return h('div', { class: `srv${has ? '' : ' off'}${fav.has(g.id) ? ' fav' : ''}`, 'data-n': g.name.toLowerCase(), onclick: () => has ? guild(g.id) : B.openExternal(g.invite) },
      h('div', { class: 'h' }, gicon(g), h('span', null, g.name), star, has ? h('em', { class: `pill${g.lvl === 'admin' ? ' on' : ''}` }, LV[g.lvl]) : null),
      has ? h('button', { class: 'btn p s' }, 'Verwalten') : h('button', { class: 'btn s' }, '➕ Bot hinzufügen'));
  }));
  const active = me.guilds.filter(g => g.lvl !== 'invite').length;
  show(h('div', { class: 'scroll' }, h('div', { class: 'wrap' },
    h('div', { class: 'h1' }, `Hallo ${me.user.name} 👋`),
    h('p', { class: 'sub' }, active ? `Du kannst ${active} Server verwalten.` : 'Füge den Bot zu einem Server hinzu.', ' ', h('a', { class: 'hint-a', style: 'color:var(--a2);cursor:pointer', onclick: () => servers(true) }, 'Aktualisieren')),
    me.guilds.length > 6 ? h('input', { class: 'x find', type: 'search', placeholder: 'Server suchen …', oninput: e => { const v = e.target.value.toLowerCase(); list.querySelectorAll('.srv').forEach(s => { s.style.display = s.dataset.n.includes(v) ? '' : 'none'; }); } }) : null,
    me.guilds.length ? list : h('p', { class: 'empty' }, 'Du verwaltest noch keinen Server. Dafür brauchst du das Recht „Server verwalten“.'))));
};

const guild = async (id, tabId) => {
  loading('Lade Server …');
  try { G = await request('GET', `/api/guild/${id}`); } catch (e) { if (!e.silent) failed(e.message, () => guild(id, tabId)); return; }
  renderGuild(tabId);
};

const tabById = id => G.tabs.find(t => t.id === id);


let asGid = null;
const assistant = gid => {
  let box = $('aspanel');
  if (box && asGid === gid) return;
  asGid = gid;
  if (box) box.remove();
  const old = $('asbtn'); if (old) old.remove();
  const K = `as:${gid}`;
  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(K) || '[]'); } catch {}
  const save = () => { try { sessionStorage.setItem(K, JSON.stringify(hist.slice(-20))); } catch {} };
  const last = () => [...hist].reverse().find(m => m.role === 'assistant');
  const md = t => { const d = h('div'); String(t).split(/(\*\*.+?\*\*)/).forEach(part => { if (/^\*\*.+\*\*$/.test(part)) d.append(h('b', null, part.slice(2, -2))); else part.split('\n').forEach((line, i) => { if (i) d.append(h('br')); d.append(line); }); }); return d; };
  const msgs = h('div', { class: 'asmsgs' });
  const add = (role, node, cls = '') => { const d = h('div', { class: `asm ${role === 'user' ? 'u' : 'a'} ${cls}` }, node); msgs.append(d); msgs.scrollTop = msgs.scrollHeight; return d; };
  const ta = h('textarea', { rows: 2, maxlength: 1500, placeholder: 'Frag mich etwas …' });
  const send = h('button', { class: 'btn p', type: 'submit' }, '➤');
  const prop = pr => {
    const act = h('div', { class: 'asact' });
    const ok = h('button', { class: 'btn p', type: 'button' }, '✅ Übernehmen');
    const no = h('button', { class: 'btn', type: 'button' }, 'Verwerfen');
    act.append(ok, no);
    add('a', h('div', null, h('b', null, 'Vorschlag'), h('ul', null, pr.items.map(i => h('li', null, `${i.ic} ${i.tab}: ${i.label}`, h('br'), h('span', { class: 'asfrom' }, i.from), ' → ', h('b', null, i.to)))), act), 'asprop');
    ok.onclick = async () => {
      ok.disabled = no.disabled = true; ok.textContent = '⏳ Speichere …';
      try {
        const j = await request('POST', `/api/guild/${gid}/assistant/apply`, { pid: pr.pid });
        act.replaceChildren(h('span', { class: j.ok ? 'asok' : 'aserr' }, j.msg || j.error));
        const l = last(); if (l) l.n = `${l.n || ''}${j.ok ? ' (übernommen)' : ' (nicht übernommen)'}`; save();
        if (j.ok) { G = await request('GET', `/api/guild/${gid}`); setTimeout(() => renderGuild(curTab), 900); }
      } catch (e) { if (!e.silent) { act.replaceChildren(h('span', { class: 'aserr' }, e.message)); } }
    };
    no.onclick = () => { act.replaceChildren(h('span', { class: 'asmut' }, 'Verworfen')); const l = last(); if (l) { l.n = `${l.n || ''} (verworfen)`; save(); } };
  };
  add('a', h('div', null, 'Hi! Ich helfe dir beim Einrichten. Sag mir einfach, was du brauchst, z. B. „Richte Tickets für meinen RP-Server ein“. Ich ändere nichts ohne deine Bestätigung.'));
  const chips = h('div', { class: 'aschips' }, ['❓ Was fehlt noch?', '🎭 Server für Roleplay einrichten', '🛡️ Wie schütze ich meinen Server?', '🎫 Tickets einrichten'].map(t => h('button', { type: 'button', onclick: () => { ta.value = t.replace(/^\S+\s/, ''); form.requestSubmit(); } }, t)));
  msgs.append(chips);
  hist.forEach(m => add(m.role, md(m.content)));
  const form = h('form', { class: 'asin', onsubmit: async e => {
    e.preventDefault();
    const q = ta.value.trim();
    if (!q || send.disabled) return;
    ta.value = '';
    add('user', md(q)); hist.push({ role: 'user', content: q }); save();
    send.disabled = true;
    const t0 = Date.now();
    const lbl = h('span', { class: 'asw' }, 'denkt nach …');
    const w = add('a', h('div', null, h('span', { class: 'asdots' }, h('i'), h('i'), h('i')), ' ', lbl), 'aswait');
    const iv = setInterval(() => { const n = Math.round((Date.now() - t0) / 1000); lbl.textContent = n < 20 ? `denkt nach … ${n} s` : `dauert etwas länger … ${n} s`; }, 1000);
    try {
      const j = await request('POST', `/api/guild/${gid}/assistant`, { messages: hist.map(m => ({ role: m.role, content: m.content + (m.n ? `\n${m.n}` : '') })) });
      w.remove();
      if (j.error) { add('a', h('div', null, j.error), 'aserr'); hist.pop(); save(); return; }
      add('a', md(j.reply));
      hist.push({ role: 'assistant', content: j.reply, n: j.proposal ? `(Vorschlag: ${j.proposal.items.map(i => `${i.label} → ${i.to}`).join(', ')})` : '' }); save();
      if (j.proposal) prop(j.proposal);
      if (j.skipped && j.skipped.length) add('a', h('span', { class: 'asmut' }, `Nicht übernommen, weil ungültig: ${j.skipped.join(', ')}`));
    } catch (err) { w.remove(); if (!err.silent) add('a', h('div', null, err.message), 'aserr'); hist.pop(); save(); }
    finally { clearInterval(iv); send.disabled = false; ta.focus(); }
  } }, ta, send);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  const btn = h('button', { class: 'asbtn', id: 'asbtn', type: 'button' }, '🤖', h('span', null, 'Assistent'));
  box = h('aside', { class: 'aspanel', id: 'aspanel', hidden: true }, h('div', { class: 'ash' }, h('b', null, '🤖 botnix Assistent'), h('span', { class: 'asbeta' }, 'Beta'), h('button', { class: 'asx', type: 'button', onclick: () => toggle(false) }, '✕')), msgs, form, h('p', { class: 'asnote' }, 'Antworten können bis zu 30 Sekunden dauern. Die KI kann Fehler machen, prüf die Vorschläge.'));
  const toggle = on => { box.hidden = !on; btn.classList.toggle('on', on); try { on ? localStorage.setItem('asopen', '1') : localStorage.removeItem('asopen'); } catch {} if (on) { ta.focus(); msgs.scrollTop = msgs.scrollHeight; } };
  btn.onclick = () => toggle(box.hidden);
  document.body.append(btn, box);
  try { if (localStorage.getItem('asopen')) toggle(true); } catch {}
};
const hideAssistant = () => { ['asbtn', 'aspanel'].forEach(x => { const e = $(x); if (e) e.remove(); }); asGid = null; };
const renderGuild = tabId => {
  dirty = false;
  curTab = tabId;
  const tab = tabId ? tabById(tabId) : null;
  LS.set('last', { g: G.guild.id, t: tab ? tab.id : null });
  crumb(h('a', { onclick: () => { if (confirmLeave()) servers(); } }, 'Meine Server'), tab ? h('a', { onclick: () => { if (confirmLeave()) renderGuild(); } }, G.guild.name) : h('b', null, G.guild.name), tab ? h('b', null, tab.name) : null);
  const go = t => () => { if (confirmLeave()) renderGuild(t); };
  let mode = 'simple';
  try { mode = localStorage.getItem('dmode') || 'simple'; } catch {}
  const setMode = m => { mode = m; side.classList.toggle('simple', m === 'simple'); side.querySelectorAll('.modesw button').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); const ov = document.querySelector('.content'); if (ov) ov.classList.toggle('simple-ov', m === 'simple'); try { localStorage.setItem('dmode', m); } catch {} };
  const vis = t => t.simple || (tab && tab.id === t.id);
  const side = h('div', { class: `side${mode === 'simple' ? ' simple' : ''}` },
    h('div', { class: 'modesw' }, h('button', { type: 'button', 'data-mode': 'simple', class: mode === 'simple' ? 'on' : '', onclick: () => setMode('simple') }, '👶 Einfach'), h('button', { type: 'button', 'data-mode': 'all', class: mode === 'all' ? 'on' : '', onclick: () => setMode('all') }, '🧩 Alle Module')),
    h('input', { class: 'x', type: 'search', placeholder: 'Modul suchen …', oninput: e => { const v = e.target.value.toLowerCase(); side.classList.toggle('searching', !!v); side.querySelectorAll('a[data-n]').forEach(a => { a.style.display = a.dataset.n.includes(v) ? '' : 'none'; }); side.querySelectorAll('.sgt').forEach(s => { s.style.display = v ? 'none' : ''; }); } }),
    h('a', { class: tab ? '' : 'on', onclick: go() }, h('span', { class: 'e' }, '🏠'), 'Übersicht'),
    G.groups.map(([name, ids]) => {
      const ts = ids.map(tabById).filter(Boolean);
      const closed = new Set(LS.get('sgClosed', []));
      const cur = tab && ts.some(t => t.id === tab.id);
      const sw = ts.filter(hasSw);
      const grp = h('div', { class: `sg${closed.has(name) && !cur ? ' shut' : ''}` });
      const head = h('div', { class: 'sgt', 'data-x': ts.some(vis) ? null : '1', onclick: () => { grp.classList.toggle('shut'); const c = new Set(LS.get('sgClosed', [])); grp.classList.contains('shut') ? c.add(name) : c.delete(name); LS.set('sgClosed', [...c]); } }, h('span', null, name), sw.length ? h('em', null, `${sw.filter(tabOn).length}/${sw.length}`) : null, h('b', null, '▾'));
      grp.append(head, h('div', { class: 'sgl' }, ts.map(t => h('a', { class: tab && tab.id === t.id ? 'on' : '', 'data-x': vis(t) ? null : '1', 'data-n': t.name.toLowerCase(), onclick: go(t.id) }, h('span', { class: 'e' }, t.ic), h('span', { class: 'n' }, t.name), hasSw(t) ? h('i', { class: `d${tabOn(t) ? ' on' : ''}` }) : null))));
      return grp;
    }));
  const content = h('div', { class: 'content' }, h('div', { class: 'wrap' },
    h('div', { class: 'ghead' }, gicon(G.guild), h('div', null, h('h1', null, G.guild.name), h('span', null, `${fmt(G.guild.members)} Mitglieder | ${fmt(G.guild.online)} online`))),
    tab ? tabView(tab) : overview()));
  show(h('div', { class: 'dash' }, side, content));
  assistant(G.guild.id);
  setMode(mode);
};

const toggle = async (t, btn) => {
  btn.disabled = true;
  try {
    const r = await request('POST', `/api/guild/${G.guild.id}/toggle`, { key: t.sw });
    G.values[t.sw] = r.value;
    if (t.on != null) t.on = r.value;
    btn.classList.toggle('on', r.value);
    const dot = document.querySelector(`.side a[data-n="${CSS.escape(t.name.toLowerCase())}"] .d`);
    if (dot) dot.classList.toggle('on', r.value);
    toast(r.msg, 'ok');
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
  btn.disabled = false;
};

const overview = () => {
  const s = G.stats;
  const stat = (v, l, ic) => h('div', { class: 'stat' }, h('span', { class: 'si' }, ic), h('b', null, v), h('span', null, l));
  const done = G.checks.filter(c => c.ok).length;
  const todo = G.checks.filter(c => !c.ok);
  const MED = ['🥇', '🥈', '🥉'];
  const row = c => h('a', { class: c.ok ? 'ok' : '', onclick: () => renderGuild(c.tab) }, h('i', null, c.ok ? '✓' : ''), h('span', null, c.label), c.ok ? null : h('em', null, 'Einrichten →'));
  const rest = [...todo.slice(4), ...G.checks.filter(c => c.ok)];
  const all = G.groups.flatMap(([, ids]) => ids.map(tabById).filter(Boolean));
  const active = all.filter(t => hasSw(t) && tabOn(t));
  const allOpen = LS.get('ovAll', false);
  return [
    h('div', { class: 'stats' }, stat(fmt(G.guild.members), 'Mitglieder', '👥'), stat(s.modules, 'Module aktiv', '🧩'), stat(fmt(s.tracked), 'Mit Aktivität', '📈'), stat(fmt(s.warns), 'Verwarnungen', '⚠️'), stat(s.rating ? `${s.rating.avg.toFixed(1).replace('.', ',')} ★` : '–', `Ticket-Bewertung${s.rating ? ` (${s.rating.n})` : ''}`, '⭐'), stat(s.giveaways, 'Giveaways', '🎁')),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel', style: 'margin:0' }, h('h2', null, todo.length ? '🚀 Nächste Schritte' : '✅ Alles eingerichtet'), h('p', null, `${done} von ${G.checks.length} Schritten erledigt`),
        h('div', { class: 'pg' }, h('i', { style: `width:${Math.round((done / (G.checks.length || 1)) * 100)}%` })),
        h('div', { class: 'check' }, todo.slice(0, 4).map(row), rest.length ? h('details', { class: 'more' }, h('summary', null, [todo.length > 4 ? `+ ${todo.length - 4} weitere offen` : '', todo.length > 4 && done ? ', ' : '', done ? `${done} erledigt` : ''].join('') + ' anzeigen'), rest.map(row)) : null)),
      h('section', { class: 'panel', style: 'margin:0' }, h('h2', null, '🏆 Top 5'), h('p', null, 'Die aktivsten Mitglieder nach Level.'),
        s.top.length ? h('div', { class: 'lb' }, s.top.map((m, i) => h('div', null, h('b', null, MED[i] || `#${i + 1}`), h('span', null, m.name), h('em', null, `Level ${m.level}`)))) : h('p', { class: 'empty' }, 'Noch keine Aktivität.'))),
    h('section', { class: 'panel' }, h('h2', null, `🟢 Deine aktiven Module (${active.length})`), active.length ? h('div', { class: 'act' }, active.map(t => h('a', { onclick: () => renderGuild(t.id) }, h('i'), `${t.ic} ${t.name}`))) : h('p', { class: 'empty' }, 'Noch keine Module aktiv. Schau bei „Alle Module“ unten oder nutze eine Server-Vorlage.')),
    h('details', { class: 'allmods', open: allOpen || null, ontoggle: e => LS.set('ovAll', e.target.open) }, h('summary', null, '🧩 Alle Module ein- und ausschalten'),
      G.groups.map(([name, ids]) => h('section', { class: 'ovg', 'data-x': ids.map(tabById).filter(Boolean).some(t => t.simple) ? null : '1' }, h('h2', null, name), h('div', { class: 'mods' }, ids.map(tabById).filter(Boolean).map(t => {
        const tg = t.sw && t.on == null ? h('button', { class: `tgl${G.values[t.sw] ? ' on' : ''}`, title: 'Ein/Aus', onclick: e => { e.stopPropagation(); toggle(t, e.currentTarget); } }) : t.on != null ? h('span', { class: `pill${t.on ? ' on' : ''}`, style: 'margin:0' }, t.on ? 'an' : 'aus') : null;
        return h('div', { class: 'mod', 'data-x': t.simple ? null : '1', onclick: () => renderGuild(t.id) }, h('span', { class: 'e' }, t.ic), h('div', null, h('b', null, t.name), h('small', null, t.desc)), tg);
      }))))),
  ];
};

const chipBox = (key, items, cur) => {
  const set = new Set((cur || []).map(String));
  const box = h('div', { class: 'chips', 'data-k': key, 'data-t': 'multi' }, items.map(o => h('span', { class: `chip${set.has(o.id) ? ' on' : ''}`, 'data-id': o.id, 'data-n': o.name.toLowerCase(), onclick: e => { e.currentTarget.classList.toggle('on'); markDirty(); } }, o.name)));
  if (!items.length) return h('p', { class: 'empty' }, 'Keine vorhanden.');
  return items.length > 14 ? h('div', null, h('input', { class: 'x chipf', type: 'search', placeholder: 'Filtern …', oninput: e => { const v = e.target.value.toLowerCase(); box.querySelectorAll('.chip').forEach(c => { c.style.display = c.dataset.n.includes(v) ? '' : 'none'; }); } }), box) : box;
};
const select = (key, items, cur) => h('select', { class: 'x', 'data-k': key }, h('option', { value: '' }, 'Keine Auswahl'), items.map(o => h('option', { value: o.id, selected: String(cur || '') === o.id ? true : null }, o.name)));
const fld = (label, el, full) => h('div', { class: `fld${full ? ' full' : ''}` }, h('label', { class: 'f' }, label), el);
const num = (key, val, min, max, ph) => h('input', { class: 'x', type: 'number', 'data-k': key, min, max, value: val ?? '', placeholder: ph || '' });
const txt = (key, val, ph, max) => h('input', { class: 'x', 'data-k': key, value: val ?? '', placeholder: ph || '', maxlength: max || null });
const area = (key, val, ph, style) => h('textarea', { class: 'x', 'data-k': key, placeholder: ph || '', style: style || null }, val ?? '');

const repK = () => Math.random().toString(36).slice(2, 8);
const repHead = title => h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px' }, h('b', { style: 'margin:0' }, title), h('button', { class: 'btn s rep-del', type: 'button' }, '🗑️ Entfernen'));
const rep = (items, card, max, addLabel) => {
  const list = h('div', { class: 'cards' }, items.map((v, i) => card(v, i)));
  const cnt = h('span', { style: 'color:var(--m)' });
  const add = h('button', { class: 'btn s', type: 'button' }, `➕ ${addLabel}`);
  const upd = () => { cnt.textContent = `${list.children.length}/${max}`; add.disabled = list.children.length >= max; };
  add.onclick = () => { if (list.children.length >= max) return; list.append(card({}, list.children.length, repK())); upd(); markDirty(); };
  list.addEventListener('click', e => { const b = e.target.closest('.rep-del'); if (!b) return; b.closest('.card').remove(); upd(); markDirty(); });
  upd();
  return h('div', { class: 'full' }, list, h('div', { style: 'display:flex;gap:12px;align-items:center;margin-top:10px' }, add, cnt));
};
const more = (els, show) => [h('div', { class: 'cards full' }, els.slice(0, show)), els.length > show ? h('details', { class: 'more full' }, h('summary', null, `➕ Weitere anzeigen (${els.length - show})`), h('div', { class: 'cards' }, els.slice(show))) : null];
const renderField = f => {
  const [t, k, label, a] = f;
  const v = G.values;
  const L = G.lists;
  switch (t) {
    case 'hint': return h('div', { class: 'hint full' }, k);
    case 'link': { const url = `/${k}/${G.guild.id}`; return h('div', { class: 'hint full' }, `${label}: `, h('a', { onclick: () => B.openWeb(url) }, me.base + url)); }
    case 'preview': return null;
    case 'sw': return h('div', { class: 'row full' }, h('div', null, h('b', null, label), h('span', null, a)), h('button', { class: `tgl${v[k] ? ' on' : ''}`, 'data-k': k, 'data-t': 'sw', onclick: e => { e.currentTarget.classList.toggle('on'); markDirty(); } }));
    case 'sel': return fld(label, select(k, L[a] || [], v[k]));
    case 'num': return fld(label, num(k, v[k], a, f[4]));
    case 'txt': return fld(label, txt(k, v[k], a), true);
    case 'area': return fld(label, area(k, v[k], a), true);
    case 'color': return fld(label, h('input', { class: 'x', type: 'color', 'data-k': k, value: /^#[0-9a-f]{6}$/i.test(v[k] || '') ? v[k] : '#5b8cff' }));
    case 'opt': return fld(label, h('select', { class: 'x', 'data-k': k }, a.map(([val, l]) => h('option', { value: val, selected: v[k] === val ? true : null }, l))));
    case 'roles': return fld(label, chipBox(k, L.role, v[k]), true);
    case 'chans': return fld(label, chipBox(k, a === 'news' ? L.news : a === 'textcat' ? L.text.concat(L.cat.map(o => ({ id: o.id, name: '📁 ' + o.name }))) : L.text, v[k]), true);
    case 'ids': return fld(label, area(k, (v[k] || []).join('\n'), '123456789012345678', 'min-height:70px'), true);
    case 'cmds': return fld(label, chipBox(k, G.cmds.map(n => ({ id: n, name: '/' + n })), v[k]), true);
    case 'tickets': return rep(v.ticketTypes || [], (tv, i, key) => { const k = key || tv.key; return h('div', { class: 'card' }, repHead(`${tv.emoji || '🎫'} ${tv.label || 'Neue Ticket-Art'}`), h('div', { class: 'fields' },
      fld('Anzeigename', txt(`tkLabel__${k}`, tv.label, 'z. B. Allgemeiner Support', 80)), fld('Emoji', txt(`tkEmoji__${k}`, tv.emoji, '🎫', 8)),
      fld('Discord-Kategorie', select(`tkCat__${k}`, L.cat, tv.category)), fld('Eigene Team-Rolle (optional)', select(`tkRole__${k}`, L.role, tv.role)),
      fld('Beschreibung im Menü', txt(`tkDesc__${k}`, tv.desc, 'z. B. Fragen rund um den Server', 100), true),
      [0, 1, 2].map(q => fld(`Frage ${q + 1} im Formular (optional)`, txt(`tkQ__${k}__${q}`, (tv.qs || [])[q], 'z. B. Worum geht es?', 45))))); }, 25, 'Ticket-Art hinzufügen');
    case 'lvl': return [0, 1, 2].map(i => { const l = (v.levelRoles || [])[i] || {}; return [fld(`Belohnung ${i + 1}: ab Level`, num('lv' + i, l.level, 1, 500)), fld('Rolle', select('lr' + i, L.role, l.role))]; });
    case 'timers': return h('div', { class: 'cards full' }, [0, 1, 2, 3, 4].map(i => { const tv = (v.timers || [])[i] || {}; return h('div', { class: 'card' }, h('b', null, `⏲️ Nachricht ${i + 1}`), h('div', { class: 'fields' }, fld('Kanal', select('tmCh' + i, L.text, tv.ch)), fld('Alle wie viele Minuten (mind. 10)', num('tmEvery' + i, tv.every || 60, 10, 10080)), fld('Text', area('tmText' + i, tv.text, 'z. B. Vergesst nicht, unsere Regeln zu lesen!', 'min-height:70px'), true))); }));
    case 'links': {
      const MODES = [['sync', '🔄 Geben und wieder entfernen'], ['add', '➕ Nur geben'], ['remove', '➖ Rolle B entfernen']];
      return rep(v.linkRoles || [], (lv, i, key) => { const k = key || `r${i}`; return h('div', { class: 'card' }, repHead('🔗 Regel'), h('div', { class: 'fields' },
        fld('Wenn jemand Rolle A hat', select(`lkSrc__${k}`, L.role, lv.src)), fld('Rolle B', select(`lkDst__${k}`, L.role, lv.dst)),
        fld('Was passiert mit Rolle B?', h('select', { class: 'x', 'data-k': `lkMode__${k}` }, MODES.map(([m, l]) => h('option', { value: m, selected: (lv.mode || 'sync') === m ? true : null }, l))), true))); }, 100, 'Regel hinzufügen');
    }
    case 'rnicks': return rep(v.roleNicks || [], (nv, i, key) => { const k = key || `n${i}`; return h('div', { class: 'card' }, repHead('🏷️ Name'), h('div', { class: 'fields' }, fld('Rolle', select(`rnRole__${k}`, L.role, nv.role)), fld('Name', txt(`rnFmt__${k}`, nv.fmt, '👑 Owner {name}', 40)))); }, 50, 'Name hinzufügen');
    case 'sitems': {
      const EFFS = [['', 'Kein Effekt'], ['coins2', '💰 Doppelte Coins (Stunden)'], ['xp2', '⚡ Doppelte XP (Stunden)'], ['shield', '🛡️ Raub-Schutz (Stunden)'], ['coins', '🪙 Gibt Coins (Anzahl)'], ['lootbox', '🎁 Lootbox (Coins-Wert)']];
      const RARS = [['c', '⚪ Gewöhnlich'], ['r', '🔵 Selten'], ['e', '🟣 Episch'], ['l', '🟡 Legendär']];
      const opt = (k, list, cur) => h('select', { class: 'x', 'data-k': k }, list.map(([m, l]) => h('option', { value: m, selected: (cur || list[0][0]) === m ? true : null }, l)));
      return rep(v.shopItems || [], (it, i, key) => { const k = key || `s${i}`; return h('div', { class: 'card' }, repHead(`${it.e || '📦'} ${it.name || 'Neues Item'}`), h('input', { type: 'hidden', 'data-k': `siKey__${k}`, value: it.key || '' }), h('div', { class: 'fields' },
        fld('Emoji', txt(`siE__${k}`, it.e, '🍕', 8)), fld('Name', txt(`siName__${k}`, it.name, 'Pizza', 40)), fld('Preis (Coins)', num(`siPrice__${k}`, it.price, 0, 1000000000, '50')), fld('Seltenheit', opt(`siRar__${k}`, RARS, it.rar)),
        fld('Beschreibung', txt(`siDesc__${k}`, it.desc, 'Lecker und warm', 120), true), fld('Effekt beim Benutzen', opt(`siEff__${k}`, EFFS, it.eff || '')), fld('Effekt-Wert', num(`siVal__${k}`, it.val, 0, 1000000000, 'Stunden oder Coins')),
        fld('Vorrat (0 = unbegrenzt)', num(`siStock__${k}`, it.stock || 0, 0, 1000000, '0')), fld('Rolle beim Benutzen (optional)', select(`siRole__${k}`, L.role, it.role)))); }, 40, 'Item hinzufügen');
    }
    case 'tgroups': return rep(v.teamGroups || [], (gv, i, key) => { const k = key || `g${i}`; return h('div', { class: 'card' }, repHead(`${gv.emoji || '👥'} ${gv.name || 'Neue Gruppe'}`), h('input', { type: 'hidden', 'data-k': `tgKey__${k}`, value: gv.key || '' }), h('div', { class: 'fields' },
      fld('Name', txt(`tgName__${k}`, gv.name, 'z. B. Support-Team', 40)), fld('Emoji', txt(`tgEmoji__${k}`, gv.emoji, '🎧', 8)),
      fld('Leitungsrolle (verwaltet diese Gruppe)', select(`tgLead__${k}`, L.role, gv.lead)), fld('Farbe', h('input', { class: 'x', type: 'color', 'data-k': `tgColor__${k}`, value: /^#[0-9a-f]{6}$/i.test(gv.color || '') ? gv.color : '#5b8cff' })),
      fld('Ränge dieser Gruppe (bis zu 10)', chipBox(`tgRanks__${k}`, L.role, gv.ranks), true))); }, 8, 'Gruppe hinzufügen');
    case 'tachs': {
      const KINDS = [['closed', '🎫 Tickets geschlossen'], ['claims', '🙋 Tickets übernommen'], ['duty', '⏱️ Stunden im Dienst'], ['days', '📅 Tage im Team'], ['ups', '⬆️ Beförderungen']];
      return rep(v.teamAchs || [], (av, i, key) => { const k = key || `a${i}`; return h('div', { class: 'card' }, repHead(`${av.emoji || '🏅'} ${av.name || 'Neues Achievement'}`), h('input', { type: 'hidden', 'data-k': `taKey__${k}`, value: av.key || '' }), h('div', { class: 'fields' },
        fld('Name', txt(`taName__${k}`, av.name, 'z. B. Ticket-Profi', 40)), fld('Emoji', txt(`taEmoji__${k}`, av.emoji, '🏅', 8)),
        fld('Wenn', h('select', { class: 'x', 'data-k': `taKind__${k}` }, KINDS.map(([m, l]) => h('option', { value: m, selected: (av.kind || 'closed') === m ? true : null }, l)))),
        fld('mindestens', num(`taN__${k}`, av.n, 1, 100000, '100')),
        fld('Nachricht (Erinnerung, optional)', txt(`taMsg__${k}`, av.msg, 'Danke {user}, du hast {n} Tickets geschafft!', 300), true),
        fld('Rolle als Belohnung (optional)', select(`taRole__${k}`, L.role, av.role)))); }, 15, 'Achievement hinzufügen');
    }
    case 'ccmds': {
      const MODES = [['toggle', '🔄 Geben / nehmen'], ['add', '➕ Nur geben'], ['remove', '➖ Nur entfernen']];
      const sw = (key, on, label) => h('div', { class: 'row full' }, h('div', null, h('b', null, label)), h('button', { class: `tgl${on ? ' on' : ''}`, 'data-k': key, 'data-t': 'sw', type: 'button', onclick: e => { e.currentTarget.classList.toggle('on'); markDirty(); } }));
      return rep(v.customCmds || [], (cv, i, key) => { const k = key || `c${i}`; return h('div', { class: 'card' }, repHead(`⚡ /${cv.name || 'neuer-befehl'}`), h('div', { class: 'fields' },
        fld('Name (ohne /)', txt(`ccName__${k}`, cv.name, 'regeln-kurz', 32)), fld('Beschreibung', txt(`ccDesc__${k}`, cv.desc, 'Zeigt die wichtigsten Regeln', 100)),
        fld('Antwort', area(`ccReply__${k}`, cv.reply, 'Hey {user}, willkommen auf {server}!', 'min-height:80px'), true),
        fld('Rolle (optional)', select(`ccRole__${k}`, L.role, cv.role)),
        fld('Was passiert mit der Rolle?', h('select', { class: 'x', 'data-k': `ccMode__${k}` }, MODES.map(([m, l]) => h('option', { value: m, selected: (cv.roleMode || 'toggle') === m ? true : null }, l)))),
        sw(`ccEmbed__${k}`, cv.embed, 'Als Embed senden'), sw(`ccEph__${k}`, cv.eph, 'Nur für den Nutzer sichtbar'))); }, 50, 'Befehl hinzufügen');
    }
    case 'wsteps': {
      const ACTS = [['timeout', '🔇 Timeout'], ['kick', '👢 Kick'], ['ban', '🔨 Bann']];
      return rep(v.warnSteps || [], (wv, i, key) => { const k = key || `w${i}`; return h('div', { class: 'card' }, repHead('⚠️ Warn-Stufe'), h('div', { class: 'fields' },
        fld('Bei so vielen Warns', num(`wsN__${k}`, wv.n, 1, 50, '3')),
        fld('Aktion', h('select', { class: 'x', 'data-k': `wsAct__${k}` }, ACTS.map(([m, l]) => h('option', { value: m, selected: (wv.act || 'timeout') === m ? true : null }, l)))),
        fld('Timeout-Dauer in Minuten', num(`wsMin__${k}`, wv.min ?? 60, 1, 40320)))); }, 10, 'Stufe hinzufügen');
    }
    case 'feeds': return h('div', { class: 'cards full' }, [0, 1, 2, 3, 4].map(i => { const fv = (v.feeds || [])[i] || {}; return h('div', { class: 'card' }, h('b', null, `📡 Feed ${i + 1}`), h('div', { class: 'fields' }, fld('Feed-Link (RSS)', txt('feedUrl' + i, fv.url, 'https://rsshub.app/tiktok/user/@name', 400), true), fld('Discord-Kanal', select('feedCh' + i, L.text, fv.ch)), fld('Rolle pingen', select('feedPing' + i, L.role, fv.ping)), fld('Nachricht', txt('feedMsg' + i, fv.msg, '🎵 Neues TikTok von {quelle}: {titel} {link}', 500), true))); }));
    case 'days': return fld(label, chipBox(k, [['1', 'Mo'], ['2', 'Di'], ['3', 'Mi'], ['4', 'Do'], ['5', 'Fr'], ['6', 'Sa'], ['0', 'So']].map(([id, name]) => ({ id, name })), (v[k] || []).map(String)), true);
    case 'apps': {
      const list = v.appPositions || [];
      return more(Array.from({ length: 6 }, (_, i) => { const p = list[i] || {}; return h('div', { class: 'card' }, h('b', null, `${p.emoji || '📝'} Stelle ${i + 1}`), h('div', { class: 'fields' },
        fld('Name', txt('apName' + i, p.name, 'z. B. Moderator', 40)), fld('Emoji', txt('apEmoji' + i, p.emoji, '🛡️', 8)), fld('Rolle beim Annehmen', select('apRole' + i, L.role, p.role)), fld('Kurzbeschreibung', txt('apDesc' + i, p.desc, 'z. B. Hilft bei Fragen', 100)),
        fld('Fragen (eine pro Zeile, max. 5)', area('apQ' + i, (p.questions || []).join('\n'), 'Wie alt bist du?', 'min-height:90px'), true),
        h('div', { class: 'row full' }, h('div', null, h('b', null, 'Bewerbungen offen')), h('button', { class: `tgl${p.open !== false ? ' on' : ''}`, 'data-k': 'apOpen' + i, 'data-t': 'sw', onclick: e => { e.currentTarget.classList.toggle('on'); markDirty(); } })))); }), Math.max(2, list.length + 1));
    }
    case 'shop': return h('div', { class: 'full' }, h('h3', { class: 'sec' }, '🛒 Rollen-Shop'), h('p', { class: 'sub', style: 'font-size:13px;margin:0 0 10px' }, 'Mitglieder kaufen Rollen mit /buy. Die Bot-Rolle muss über diesen Rollen stehen.'),
      h('div', { class: 'cards' }, [0, 1, 2, 3, 4, 5].map(i => { const sv = (v.shop || [])[i] || {}; return h('div', { class: 'card' }, h('b', null, `Artikel ${i + 1}`), h('div', { class: 'fields' }, fld('Rolle', select('shopRole' + i, L.role, sv.role)), fld('Preis in Coins', num('shopPrice' + i, sv.price, 1, null, '5000')))); })));
    default: return null;
  }
};

let saveBar = null;
const markDirty = () => { dirty = true; if (saveBar) saveBar.classList.add('on'); };

const collect = root => {
  const body = {};
  root.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.dataset.t === 'sw') body[k] = el.classList.contains('on');
    else if (el.dataset.t === 'multi') body[k] = [...el.querySelectorAll('.chip.on')].map(c => c.dataset.id);
    else body[k] = el.value;
  });
  return body;
};

let siteCss = null;
const getCss = async () => {
  if (siteCss != null) return siteCss;
  const r = await B.get('/api/css');
  siteCss = r.status === 200 && r.data && r.data.css ? r.data.css : '';
  return siteCss;
};
const XFIX = ':host{display:block}.xw{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:var(--t)}.xw .panel{margin-bottom:16px}.xmsg{padding:14px;color:var(--m)}';
const loadExtras = async (tab, preHost, exHost, q = '') => {
  const gid = G.guild.id;
  const roots = [preHost, exHost].map(hh => hh.shadowRoot || hh.attachShadow({ mode: 'open' }));
  roots[1].innerHTML = '<div class="xmsg">Lade Aktionen & Listen …</div>';
  let d;
  try { d = await request('GET', `/api/guild/${gid}/extra/${tab.id}${q ? `?q=${encodeURIComponent(q)}` : ''}`); }
  catch (e) { if (!e.silent) roots[1].innerHTML = `<div class="xmsg">⚠️ ${String(e.message).replace(/[<>&]/g, '')}</div>`; return; }
  if (!G || G.guild.id !== gid) return;
  const css = await getCss();
  const fill = (root, html) => {
    root.innerHTML = html ? `<style>${css}${XFIX}</style><div class="xw">${html}</div>` : '';
    if (root._wired) return;
    root._wired = true;
    root.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const sub = e.submitter;
      const conf = (sub && sub.dataset.confirm) || form.dataset.confirm;
      if (conf && !confirm(conf)) return;
      const fd = new FormData(form);
      if (sub && sub.name) fd.append(sub.name, sub.value);
      const body = {};
      for (const [k, v] of fd) { if (typeof v !== 'string') continue; body[k] = k in body ? [].concat(body[k], v) : v; }
      for (const inp of form.querySelectorAll('input[type=file]')) {
        const f = inp.files && inp.files[0];
        if (f) body[inp.name] = await f.text();
      }
      const m = (form.getAttribute('action') || '').match(/\/guild\/\d+\/do\/([\w-]+)/);
      if ((form.getAttribute('method') || 'get').toLowerCase() !== 'post' || !m) return loadExtras(tab, preHost, exHost, body.q || '');
      form.querySelectorAll('button').forEach(b => { b.disabled = true; });
      const r = await B.post(`/api/guild/${gid}/do/${m[1]}`, body);
      if (r.status === 401) { me = null; renderMe(); return loginView(); }
      const msg = (r.data && (r.data.msg || r.data.error)) || `Fehler ${r.status}`;
      toast(r.status === 200 ? `✓ ${msg}` : msg, r.status === 200 ? 'ok' : 'err');
      loadExtras(tab, preHost, exHost, q);
    });
    root.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      const t = href.match(/^\/guild\/(\d+)\?tab=([\w-]+)/);
      if (t && t[1] === gid && tabById(t[2])) { if (confirmLeave()) renderGuild(t[2]); return; }
      if (href.startsWith('/')) B.openWeb(href); else if (/^https?:/i.test(href)) B.openExternal(href);
    });
  };
  fill(roots[0], d.pre);
  fill(roots[1], d.extra);
};

const tabView = tab => {
  if (tab.adminOnly && !G.isAdmin) return h('section', { class: 'panel' }, h('h2', null, `${tab.ic} ${tab.name}`), h('p', null, 'Nur der Besitzer und Administratoren können das sehen und ändern.'));
  if (tab.betaLock) return h('section', { class: 'panel', style: 'border:2px dashed var(--a)' }, h('h2', null, `${tab.ic} ${tab.name}`), h('p', null, tab.betaLock));
  const out = [];
  if (tab.fields.length) {
    const panel = h('section', { class: 'panel' }, h('h2', null, `${tab.ic} ${tab.name}`), h('p', null, tab.desc));
    const parts = [];
    for (const f of tab.fields) { const sec = tab.sections[f[1]]; if (sec || !parts.length) parts.push({ h: sec, f: [] }); parts[parts.length - 1].f.push(f); }
    const many = parts.length > 2;
    const KO = `sec:${G.guild.id}:${tab.id}`;
    let openSet = new Set();
    try { openSet = new Set(JSON.parse(sessionStorage.getItem(KO) || '[]')); } catch {}
    parts.forEach((p, i) => {
      const grid = h('div', { class: 'fields' });
      for (const f of p.f) { const el = renderField(f); if (el) grid.append(...[el].flat(3).filter(Boolean)); }
      if (!p.h) return panel.append(grid);
      if (!many || i === 0) return panel.append(h('h3', { class: 'sec' }, p.h), grid);
      const n = p.f.filter(f => f[0] !== 'hint').length;
      const sw = p.f[0][0] === 'sw' ? !!G.values[p.f[0][1]] : null;
      const d = h('details', { class: 'fsec', open: openSet.has(i) || null, ontoggle: e => { e.target.open ? openSet.add(i) : openSet.delete(i); try { sessionStorage.setItem(KO, JSON.stringify([...openSet])); } catch {} } },
        h('summary', null, h('b', null, p.h), sw == null ? null : h('em', { class: `pill${sw ? ' on' : ''}`, style: 'margin:0' }, sw ? 'an' : 'aus'), h('small', null, `${n} ${n === 1 ? 'Einstellung' : 'Einstellungen'}`)), grid);
      panel.append(d);
    });
    panel.addEventListener('input', markDirty);
    panel.addEventListener('change', markDirty);
    const btn = h('button', { class: 'btn p' }, 'Änderungen speichern');
    saveBar = h('div', { class: 'savebar' }, h('span', null, '● Ungespeicherte Änderungen'), h('button', { class: 'btn', onclick: () => { dirty = false; renderGuild(tab.id); } }, 'Verwerfen'), btn);
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await request('POST', `/api/guild/${G.guild.id}/save/${tab.id}`, collect(panel));
        dirty = false;
        saveBar.classList.remove('on');
        toast(`✓ ${r.msg}`, 'ok');
        G = await request('GET', `/api/guild/${G.guild.id}`);
        renderGuild(tab.id);
      } catch (e) { if (!e.silent) toast(e.message, 'err'); }
      btn.disabled = false;
    };
    out.push(panel, saveBar);
  } else {
    saveBar = null;
    out.push(h('p', { class: 'sub' }, tab.desc));
  }
  if (tab.extra) {
    const preHost = h('div', { class: 'xhost' });
    const exHost = h('div', { class: 'xhost' });
    out.unshift(preHost);
    out.push(exHost);
    loadExtras(tab, preHost, exHost);
  }
  return out;
};

const applyTheme = t => { document.documentElement.dataset.theme = t; $('themeBtn').textContent = t === 'light' ? '☀️' : '🌙'; LS.set('theme', t); };
applyTheme(LS.get('theme', 'dark'));
$('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
let zoom = LS.get('zoom', 1);
const applyZoom = z => { zoom = Math.max(0.7, Math.min(1.5, Math.round(z * 10) / 10)); document.body.style.zoom = zoom; LS.set('zoom', zoom); };
applyZoom(zoom);
const netState = () => $('offline').classList.toggle('on', !navigator.onLine);
window.addEventListener('online', () => { netState(); toast('✅ Wieder online.', 'ok'); });
window.addEventListener('offline', netState);
netState();
let palItems = [], palSel = 0;
const palEntries = () => {
  const out = [];
  if (G) {
    out.push({ ic: '🏠', t: 'Übersicht', s: G.guild.name, go: () => renderGuild() });
    G.groups.forEach(([grp, ids]) => ids.map(tabById).filter(Boolean).forEach(t => out.push({ ic: t.ic, t: t.name, s: grp, k: `${t.name} ${t.desc || ''} ${grp}`, on: hasSw(t) ? tabOn(t) : null, go: () => renderGuild(t.id) })));
  }
  (me ? me.guilds : []).filter(g => g.lvl !== 'invite').forEach(g => out.push({ ic: '🗂️', t: g.name, s: 'Server wechseln', go: () => guild(g.id) }));
  if (me) out.push({ ic: '🗂️', t: 'Meine Server', s: 'Serverliste', go: () => servers() }, { ic: '🔄', t: 'Neu laden', s: 'F5', go: () => G ? guild(G.guild.id, curTab) : start() }, { ic: '🌐', t: 'Website öffnen', s: 'Im Browser', go: () => B.openWeb('/') }, { ic: '🌗', t: 'Hell / Dunkel umschalten', s: 'Design', go: () => $('themeBtn').click() }, { ic: '⬆️', t: 'Nach Updates suchen', s: 'App', go: () => $('checkBtn').click() }, { ic: '⌨️', t: 'Tastenkürzel anzeigen', s: 'Hilfe', go: () => toast('Strg+K Suche | Strg+S Speichern | F5 Neu laden | Strg + / Strg - Zoom | Strg+0 Zoom zurücksetzen | Esc Schließen') });
  return out;
};
const palRender = () => {
  const q = $('palIn').value.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  palItems = palEntries().map(e => { const hay = `${e.t} ${e.k || ''} ${e.s}`.toLowerCase(); const sc = !words.length ? 1 : words.every(w => hay.includes(w)) ? (e.t.toLowerCase().startsWith(words[0]) ? 3 : e.t.toLowerCase().includes(words[0]) ? 2 : 1) : 0; return { ...e, sc }; }).filter(e => e.sc).sort((a, b) => b.sc - a.sc).slice(0, 40);
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $('palList').replaceChildren(...(palItems.length ? palItems.map((e, i) => h('div', { class: `pi${i === palSel ? ' on' : ''}`, onmousemove: () => { if (palSel !== i) { palSel = i; palRender(); } }, onclick: () => palGo(i) }, h('span', { class: 'e' }, e.ic), h('b', null, e.t), e.on == null ? null : h('i', { class: `d${e.on ? ' on' : ''}` }), h('small', null, e.s))) : [h('div', { class: 'empty', style: 'padding:14px' }, 'Nichts gefunden.')]));
  const el = $('palList').querySelector('.pi.on'); if (el) el.scrollIntoView({ block: 'nearest' });
};
const palOpen = () => { if (!me) return; $('palOv').classList.add('on'); $('palIn').value = ''; palSel = 0; palRender(); setTimeout(() => $('palIn').focus(), 20); };
const palClose = () => $('palOv').classList.remove('on');
const palGo = i => { const e = palItems[i]; if (!e) return; palClose(); if (confirmLeave()) { dirty = false; e.go(); } };
$('palIn').addEventListener('input', () => { palSel = 0; palRender(); });
$('palIn').addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); } else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); } else if (e.key === 'Enter') { e.preventDefault(); palGo(palSel); } else if (e.key === 'Escape') palClose(); });
$('palOv').addEventListener('click', e => { if (e.target === $('palOv')) palClose(); });
$('palBtn').onclick = palOpen;
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('palOv').classList.contains('on') ? palClose() : palOpen(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); applyZoom(zoom + 0.1); toast(`🔍 Zoom ${Math.round(zoom * 100)} %`); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); applyZoom(zoom - 0.1); toast(`🔍 Zoom ${Math.round(zoom * 100)} %`); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); applyZoom(1); toast('🔍 Zoom 100 %'); return; }
  if (e.key === 'Escape') { if ($('palOv').classList.contains('on')) palClose(); const m = document.querySelector('.menu.on'); if (m) m.classList.remove('on'); }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && saveBar && saveBar.classList.contains('on')) { e.preventDefault(); saveBar.querySelector('.btn.p').click(); }
  if (e.key === 'F5') { e.preventDefault(); if (!confirmLeave()) return; dirty = false; if (G) guild(G.guild.id, curTab); else start(); }
});

let pending = null;
const ICON = { added: '+', removed: '−', modified: '~', renamed: '→' };
const showUpdate = u => {
  pending = u;
  $('updBtn').classList.add('show');
  $('updCount').textContent = u.commits > 1 ? `${u.commits} Änderungen` : '';
  $('updMeta').textContent = [u.author && `von ${u.author}`, u.date && fmtDate(u.date), u.latestSha && `#${u.latestSha.slice(0, 7)}`].filter(Boolean).join(' | ');
  $('updMsg').textContent = u.message || 'Neues Update';
  $('updFiles').replaceChildren(...(u.files || []).slice(0, 60).map(f => h('li', { class: `st-${f.status}` }, h('b', null, ICON[f.status] || '•'), ` ${f.name}`)));
  $('updProg').classList.remove('on');
  $('updActs').style.display = '';
  $('installBtn').disabled = false;
};
const openUpdateModal = () => { if (pending) $('updOv').classList.add('on'); };
B.onAvailable(u => { showUpdate(u); if (!u.later || u.manual) openUpdateModal(); });
B.onNone(d => { $('updBtn').classList.remove('show'); pending = null; if (d.manual) toast('✅ Du hast die neueste Version.', 'ok'); });
B.onError(d => { if (d.manual) toast(d.message, 'err'); $('updProg').classList.remove('on'); $('updActs').style.display = ''; $('installBtn').disabled = false; });
B.onProgress(p => {
  $('updProg').classList.add('on');
  $('updStep').textContent = p.step;
  if (p.done) { $('updOv').classList.remove('on'); $('updBtn').classList.remove('show'); toast(`📁 ${p.step} Der Ordner wurde geöffnet.`, 'ok'); }
});
$('updBtn').onclick = openUpdateModal;
$('laterBtn').onclick = async () => { await B.later(); $('updOv').classList.remove('on'); toast('Okay! Du kannst das Update jederzeit oben über „⬆ Update verfügbar“ machen.'); };
$('installBtn').onclick = async () => {
  $('installBtn').disabled = true;
  $('updActs').style.display = 'none';
  $('updProg').classList.add('on');
  $('updStep').textContent = 'Lade Update herunter …';
  const r = await B.install();
  if (!r.ok) { $('updActs').style.display = ''; $('installBtn').disabled = false; }
};
$('checkBtn').onclick = async () => { toast('Suche nach Updates …'); await B.check(); };

const showChanges = i => {
  const items = i.changes && i.changes.length ? i.changes : String((i.lastNotes && i.lastNotes.message) || '').split('\n').map(x => x.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  if (!items.length) return B.seen();
  $('newVer').textContent = i.version;
  $('newList').replaceChildren(...items.map(t => h('li', null, t)));
  $('newOv').classList.add('on');
  $('newOk').onclick = () => { $('newOv').classList.remove('on'); B.seen(); };
};

(async () => {
  const i = await B.info();
  if (!i.seenVersion) B.seen();
  else if (i.seenVersion !== i.version) showChanges(i);
  if (i.pending) showUpdate({ ...i.pending, later: i.laterSha === i.pending.latestSha });
  start();
})();

(() => {
  const d = new Date();
  if (!(d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6))) return;
  const c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60';
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = '❄️'; b.title = 'Schnee an oder aus';
  b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:61;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(20,22,30,.8);font-size:18px;cursor:pointer';
  document.body.append(c, b);
  const x = c.getContext('2d');
  const f = Array.from({ length: 80 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 1 + Math.random() * 3, s: .4 + Math.random() * 1.1, w: Math.random() * 6 }));
  let raf = 0, on = localStorage.getItem('snow') !== '0' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const size = () => { c.width = innerWidth; c.height = innerHeight; };
  size(); addEventListener('resize', size);
  const tick = () => {
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = document.documentElement.dataset.theme === 'light' ? 'rgba(150,170,200,.7)' : 'rgba(255,255,255,.85)';
    for (const p of f) { p.y += p.s; p.w += .01; p.x += Math.sin(p.w) * .4; if (p.y > c.height) { p.y = -5; p.x = Math.random() * c.width; } x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); }
    raf = requestAnimationFrame(tick);
  };
  const set = v => { on = v; localStorage.setItem('snow', v ? '1' : '0'); b.style.opacity = v ? 1 : .55; cancelAnimationFrame(raf); x.clearRect(0, 0, c.width, c.height); if (v) tick(); };
  b.addEventListener('click', () => set(!on));
  set(on);
})();
