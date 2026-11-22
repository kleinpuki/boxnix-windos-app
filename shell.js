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
    h('button', { onclick: async () => { menu.classList.remove('on'); await B.logout(); me = null; renderMe(); loginView(); } }, '🚪 Abmelden'));
  box.replaceChildren(
    me.user.avatar ? h('img', { src: `https://cdn.discordapp.com/avatars/${me.user.id}/${me.user.avatar}.png?size=64`, alt: '' }) : h('div', { class: 'av' }, me.user.name.slice(0, 1)),
    h('span', null, me.user.name), menu);
  box.onclick = e => { if (!menu.contains(e.target)) menu.classList.toggle('on'); };
};
document.addEventListener('click', e => { const m = document.querySelector('.menu.on'); if (m && !$('me').contains(e.target)) m.classList.remove('on'); });

const loginView = () => {
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
    servers();
  } catch (e) { if (!e.silent) failed(e.message, start); }
};

const servers = async refresh => {
  G = null;
  crumb(h('b', null, 'Meine Server'));
  if (refresh) { loading('Lade Server …'); try { me = await request('GET', '/api/me?neu=1'); } catch (e) { if (!e.silent) failed(e.message, () => servers(true)); return; } }
  const LV = { admin: 'Admin', manage: 'Verwalter', role: 'Team-Zugang' };
  const list = h('div', { class: 'servers' }, me.guilds.map(g => {
    const has = g.lvl !== 'invite';
    return h('div', { class: `srv${has ? '' : ' off'}`, 'data-n': g.name.toLowerCase(), onclick: () => has ? guild(g.id) : B.openExternal(g.invite) },
      h('div', { class: 'h' }, gicon(g), h('span', null, g.name), has ? h('em', { class: `pill${g.lvl === 'admin' ? ' on' : ''}` }, LV[g.lvl]) : null),
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

const renderGuild = tabId => {
  dirty = false;
  curTab = tabId;
  const tab = tabId ? tabById(tabId) : null;
  crumb(h('a', { onclick: () => { if (confirmLeave()) servers(); } }, 'Meine Server'), tab ? h('a', { onclick: () => { if (confirmLeave()) renderGuild(); } }, G.guild.name) : h('b', null, G.guild.name), tab ? h('b', null, tab.name) : null);
  const go = t => () => { if (confirmLeave()) renderGuild(t); };
  const side = h('div', { class: 'side' },
    h('input', { class: 'x', type: 'search', placeholder: 'Modul suchen …', oninput: e => { const v = e.target.value.toLowerCase(); side.querySelectorAll('a[data-n]').forEach(a => { a.style.display = a.dataset.n.includes(v) ? '' : 'none'; }); side.querySelectorAll('.sgt').forEach(s => { s.style.display = v ? 'none' : ''; }); } }),
    h('a', { class: tab ? '' : 'on', onclick: go() }, h('span', { class: 'e' }, '🏠'), 'Übersicht'),
    G.groups.map(([name, ids]) => [h('div', { class: 'sgt' }, name), ids.map(tabById).filter(Boolean).map(t =>
      h('a', { class: tab && tab.id === t.id ? 'on' : '', 'data-n': t.name.toLowerCase(), onclick: go(t.id) }, h('span', { class: 'e' }, t.ic), t.name, t.sw ? h('i', { class: `d${G.values[t.sw] ? ' on' : ''}` }) : null))]));
  const content = h('div', { class: 'content' }, h('div', { class: 'wrap' },
    h('div', { class: 'ghead' }, gicon(G.guild), h('div', null, h('h1', null, G.guild.name), h('span', null, `${fmt(G.guild.members)} Mitglieder · ${fmt(G.guild.online)} online`))),
    tab ? tabView(tab) : overview()));
  show(h('div', { class: 'dash' }, side, content));
};

const toggle = async (t, btn) => {
  btn.disabled = true;
  try {
    const r = await request('POST', `/api/guild/${G.guild.id}/toggle`, { key: t.sw });
    G.values[t.sw] = r.value;
    btn.classList.toggle('on', r.value);
    const dot = document.querySelector(`.side a[data-n="${CSS.escape(t.name.toLowerCase())}"] .d`);
    if (dot) dot.classList.toggle('on', r.value);
    toast(r.msg, 'ok');
  } catch (e) { if (!e.silent) toast(e.message, 'err'); }
  btn.disabled = false;
};

const overview = () => {
  const s = G.stats;
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));
  const done = G.checks.filter(c => c.ok).length;
  const MED = ['🥇', '🥈', '🥉'];
  return [
    h('div', { class: 'stats' }, stat(fmt(G.guild.members), 'Mitglieder'), stat(s.modules, 'Module aktiv'), stat(fmt(s.tracked), 'Mit Aktivität'), stat(fmt(s.warns), 'Verwarnungen'), stat(s.rating ? `${s.rating.avg.toFixed(1).replace('.', ',')} ★` : '–', `Ticket-Bewertung${s.rating ? ` (${s.rating.n})` : ''}`), stat(s.giveaways, 'Laufende Giveaways')),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel', style: 'margin:0' }, h('h2', null, 'Einrichtung'), h('p', null, `${done} von ${G.checks.length} Schritten erledigt`),
        h('div', { class: 'pg' }, h('i', { style: `width:${Math.round((done / (G.checks.length || 1)) * 100)}%` })),
        h('div', { class: 'check' }, G.checks.map(c => h('a', { class: c.ok ? 'ok' : '', onclick: () => renderGuild(c.tab) }, h('i', null, c.ok ? '✓' : ''), h('span', null, c.label))))),
      h('section', { class: 'panel', style: 'margin:0' }, h('h2', null, 'Top 5'), h('p', null, 'Die aktivsten Mitglieder nach Level.'),
        s.top.length ? h('div', { class: 'lb' }, s.top.map((m, i) => h('div', null, h('b', null, MED[i] || `#${i + 1}`), h('span', null, m.name), h('em', null, `Level ${m.level}`)))) : h('p', { class: 'empty' }, 'Noch keine Aktivität.'))),
    G.groups.map(([name, ids]) => h('section', { class: 'ovg' }, h('h2', null, name), h('div', { class: 'mods' }, ids.map(tabById).filter(Boolean).map(t => {
      const tg = t.sw ? h('button', { class: `tgl${G.values[t.sw] ? ' on' : ''}`, title: 'Ein/Aus', onclick: e => { e.stopPropagation(); toggle(t, e.currentTarget); } }) : null;
      return h('div', { class: 'mod', onclick: () => renderGuild(t.id) }, h('span', { class: 'e' }, t.ic), h('div', null, h('b', null, t.name), h('small', null, t.desc)), tg);
    })))),
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
    case 'tickets': {
      const EMO = ['🎫', '🐛', '🤝', '💬'];
      const KEYS = ['support', 'bug', 'partnership', 'other'];
      return h('div', { class: 'cards full' }, KEYS.map((key, i) => {
        const tv = (v.ticketTypes || []).find(z => z.key === key) || {};
        return h('div', { class: 'card' }, h('b', null, `${EMO[i]} Ticket-Art ${i + 1}`), h('div', { class: 'fields' },
          fld('Anzeigename', txt('ticketLabel' + i, tv.label, 'z. B. Allgemeiner Support', 80)),
          fld('Discord-Kategorie', select('ticketCat' + i, L.cat, tv.category)),
          fld('Beschreibung im Menü', txt('ticketDesc' + i, tv.desc, 'z. B. Fragen rund um den Server', 100)),
          fld('Eigene Team-Rolle (optional)', select('ticketRole' + i, L.role, tv.role)),
          [0, 1, 2].map(q => fld(`Frage ${q + 1} im Formular (optional)`, txt(`ticketQ${i}_${q}`, (tv.qs || [])[q], 'z. B. Worum geht es?', 45)))));
      }));
    }
    case 'lvl': return [0, 1, 2].map(i => { const l = (v.levelRoles || [])[i] || {}; return [fld(`Belohnung ${i + 1}: ab Level`, num('lv' + i, l.level, 1, 500)), fld('Rolle', select('lr' + i, L.role, l.role))]; });
    case 'timers': return h('div', { class: 'cards full' }, [0, 1, 2, 3, 4].map(i => { const tv = (v.timers || [])[i] || {}; return h('div', { class: 'card' }, h('b', null, `⏲️ Nachricht ${i + 1}`), h('div', { class: 'fields' }, fld('Kanal', select('tmCh' + i, L.text, tv.ch)), fld('Alle wie viele Minuten (mind. 10)', num('tmEvery' + i, tv.every || 60, 10, 10080)), fld('Text', area('tmText' + i, tv.text, 'z. B. Vergesst nicht, unsere Regeln zu lesen!', 'min-height:70px'), true))); }));
    case 'links': return h('div', { class: 'cards full' }, [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const lv = (v.linkRoles || [])[i] || {}; return h('div', { class: 'card' }, h('b', null, `🔗 Verbindung ${i + 1}`), h('div', { class: 'fields' }, fld('Wenn Rolle', select('linkSrc' + i, L.role, lv.src)), fld('dann gib Rolle', select('linkDst' + i, L.role, lv.dst)))); }));
    case 'rnicks': return h('div', { class: 'cards full' }, [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const nv = (v.roleNicks || [])[i] || {}; return h('div', { class: 'card' }, h('b', null, `🏷️ Name ${i + 1}`), h('div', { class: 'fields' }, fld('Rolle', select('rnRole' + i, L.role, nv.role)), fld('Name', txt('rnFmt' + i, nv.fmt, '👑 Owner {name}', 40)))); }));
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

const tabView = tab => {
  if (tab.adminOnly && !G.isAdmin) return h('section', { class: 'panel' }, h('h2', null, `${tab.ic} ${tab.name}`), h('p', null, 'Nur der Besitzer und Administratoren können das sehen und ändern.'));
  const out = [];
  if (tab.fields.length) {
    const panel = h('section', { class: 'panel' }, h('h2', null, `${tab.ic} ${tab.name}`), h('p', null, tab.desc));
    let grid = null;
    for (const f of tab.fields) {
      const sec = tab.sections[f[1]];
      if (sec || !grid) { if (sec) panel.append(h('h3', { class: 'sec' }, sec)); grid = h('div', { class: 'fields' }); panel.append(grid); }
      const el = renderField(f);
      if (el) grid.append(...[el].flat(3).filter(Boolean));
    }
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
  if (tab.extra) out.unshift(h('section', { class: 'panel extra' }, h('div', null, h('h2', null, '🧰 Aktionen & Listen'), h('p', { style: 'margin:0;color:var(--m)' }, 'Aktionen wie Nachrichten senden, Mitglieder moderieren oder Listen verwalten öffnest du im Web-Dashboard.')), h('button', { class: 'btn s', onclick: () => B.openWeb(`/guild/${G.guild.id}?tab=${tab.id}`) }, 'Öffnen ↗')));
  return out;
};

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
  $('updMeta').textContent = [u.author && `von ${u.author}`, u.date && fmtDate(u.date), u.latestSha && `#${u.latestSha.slice(0, 7)}`].filter(Boolean).join(' · ');
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

(async () => {
  const i = await B.info();
  if (i.pending) showUpdate({ ...i.pending, later: i.laterSha === i.pending.latestSha });
  start();
})();
