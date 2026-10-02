'use strict';

// Keep in step with CACHE in sw.js; shown in Settings so you can tell which version is running.
const APP_VERSION = 6;
const STORAGE_KEY = 'twintrack.v1';
const ML_PER_OZ = 29.5735;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const SCHEMA_VERSION = 2;

const DEFAULT_STATE = {
  version: SCHEMA_VERSION,
  babies: [
    { id: 'a', name: 'RCG', color: '#d9734e', icon: 'girl' },
    { id: 'b', name: 'HDG', color: '#3f7fbf', icon: 'boy' },
  ],
  events: [],
  settings: { unit: 'ml' },
};

// Small inline baby faces: a bow for the girl, a beanie for the boy.
const FACE = `
  <circle cx="16" cy="18.5" r="10.5" fill="#f6d2b4"/>
  <circle cx="12.2" cy="19" r="1.3" fill="#3b2a20"/>
  <circle cx="19.8" cy="19" r="1.3" fill="#3b2a20"/>
  <circle cx="10.4" cy="22.4" r="1.6" fill="#f2a6a0" opacity="0.7"/>
  <circle cx="21.6" cy="22.4" r="1.6" fill="#f2a6a0" opacity="0.7"/>
  <path d="M13.4 23.2q2.6 2.2 5.2 0" fill="none" stroke="#3b2a20" stroke-width="1.2" stroke-linecap="round"/>`;
const BABY_ICONS = {
  girl: `<svg class="baby-icon" viewBox="0 0 32 32" aria-hidden="true">${FACE}
    <path d="M16 8.5 9.5 4.5v8z M16 8.5l6.5-4v8z" fill="#e8679a"/>
    <circle cx="16" cy="8.5" r="2.2" fill="#d14d84"/></svg>`,
  boy: `<svg class="baby-icon" viewBox="0 0 32 32" aria-hidden="true">${FACE}
    <path d="M5.6 16.5a10.4 10.4 0 0 1 20.8 0z" fill="#4a8fd8"/>
    <rect x="5" y="15" width="22" height="3" rx="1.5" fill="#2f6fb8"/>
    <circle cx="16" cy="5.6" r="2.6" fill="#2f6fb8"/></svg>`,
};

let state = load();
let filter = 'all';
let view = 'today';
let expandedDay = null; // `${babyId}|${dayStartMs}` row opened in the 7-day table
let editingId = null;
let form = {};
let initialTime = null; // { input, iso } so an untouched time field keeps full precision

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- storage ----------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.error('Could not load saved data', err);
  }
  return structuredClone(DEFAULT_STATE);
}

function normalize(data) {
  const base = structuredClone(DEFAULT_STATE);
  if (!data || !Array.isArray(data.events)) throw new Error('Not a Twin Track backup');
  let babies = data.babies || [];
  let settings = data.settings || {};
  if ((data.version || 1) < 2) {
    // v2: twins renamed from the placeholder names, and amounts shown in ml.
    babies = babies.map((b, i) => (/^Baby [AB]$/.test(b?.name) ? { ...b, name: base.babies[i].name } : b));
    settings = { ...settings, unit: 'ml' };
  }
  return {
    version: SCHEMA_VERSION,
    babies: base.babies.map((b, i) => ({ ...b, ...(babies[i] || {}), id: b.id })),
    events: data.events.filter((e) => e && e.id && e.babyId && e.type && e.time),
    settings: { ...base.settings, ...settings },
  };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function baby(id) {
  return state.babies.find((b) => b.id === id);
}

function babyLabel(b) {
  return `${BABY_ICONS[b.icon] || ''}${escapeHtml(b.name)}`;
}

function formatAmount(ml) {
  if (ml == null || ml === '') return '';
  if (state.settings.unit === 'ml') return `${Math.round(ml)} ml`;
  const oz = Math.round((ml / ML_PER_OZ) * 10) / 10;
  return `${oz} oz`;
}

function toMl(value) {
  const n = parseFloat(value);
  if (!isFinite(n) || n <= 0) return null;
  return state.settings.unit === 'ml' ? n : n * ML_PER_OZ;
}

function fromMl(ml) {
  if (ml == null) return '';
  return state.settings.unit === 'ml' ? Math.round(ml) : Math.round((ml / ML_PER_OZ) * 10) / 10;
}

function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Clock time, with the day added when it wasn't today (e.g. "Yesterday 11:40 PM").
function formatWhen(date) {
  const label = dayLabel(date, true);
  return label === 'Today' ? formatTime(date) : `${label} ${formatTime(date)}`;
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(date, short = false) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  if (short) return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function sideLabel(side) {
  return { L: 'left', R: 'right', LR: 'both sides' }[side] || '';
}

function describe(e) {
  if (e.type === 'diaper') {
    const kind = e.wet && e.dirty ? 'Pee + poop' : e.dirty ? 'Poop' : 'Pee';
    return { icon: e.dirty ? '💩' : '💧', text: kind };
  }
  if (e.method === 'breast' || e.method === 'combo') {
    const parts = [e.method === 'combo' ? 'Breast + bottle' : 'Breastfed'];
    if (e.side) parts.push(sideLabel(e.side));
    if (e.minutes) parts.push(`${e.minutes} min`);
    if (e.method === 'combo' && e.amountMl) parts.push(formatAmount(e.amountMl));
    return { icon: '🤱', text: parts.join(' · ') };
  }
  const parts = ['Bottle'];
  if (e.amountMl) parts.push(formatAmount(e.amountMl));
  if (e.milk) parts.push(e.milk === 'formula' ? 'formula' : 'breast milk');
  return { icon: '🍼', text: parts.join(' · ') };
}

function usesBreast(e) {
  return e.method === 'breast' || e.method === 'combo';
}

function sortedEvents() {
  return [...state.events].sort((a, b) => new Date(b.time) - new Date(a.time));
}

function toast(message, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.onclick = () => { action.run(); el.classList.remove('show'); };
    el.append(btn);
  }
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
}

// ---------- rendering ----------

function render() {
  renderCards();
  renderFilter();
  renderView();
}

function renderCards() {
  const events = sortedEvents();
  const since = Date.now() - DAY_MS;
  $('#cards').innerHTML = state.babies.map((b) => {
    const mine = events.filter((e) => e.babyId === b.id);
    const lastFeed = mine.find((e) => e.type === 'feed');
    const lastDiaper = mine.find((e) => e.type === 'diaper');
    const t = totals(mine.filter((e) => new Date(e.time) >= since));

    let feedDetail = '';
    if (lastFeed) {
      feedDetail = describe(lastFeed).text;
      const lastBreast = mine.find((e) => e.type === 'feed' && usesBreast(e) && (e.side === 'L' || e.side === 'R'));
      if (lastBreast) feedDetail += ` · next: ${lastBreast.side === 'L' ? 'right' : 'left'}`;
    }

    return `
      <article class="card" style="--baby-color:${escapeHtml(b.color)}">
        <h2>${babyLabel(b)}</h2>
        <div class="since">
          Last fed
          <strong>${lastFeed ? formatWhen(lastFeed.time) : '—'}</strong>
          <span class="detail">${escapeHtml(feedDetail)}</span>
        </div>
        <div class="since">
          Last diaper
          <strong>${lastDiaper ? formatWhen(lastDiaper.time) : '—'}</strong>
        </div>
        <div class="stats">
          <div><b>${t.feeds}</b><span>feeds</span></div>
          <div><b>${t.poops}</b><span>poops</span></div>
          <div><b>${t.pees}</b><span>pees</span></div>
        </div>
        <div class="stats-label">last 24h${t.ml ? ` · ${formatAmount(t.ml)} eaten` : ''}</div>
        <button class="btn log-btn" data-log="${b.id}" aria-label="Log for ${escapeHtml(b.name)}">＋ Log</button>
      </article>`;
  }).join('');
}

function renderFilter() {
  const opts = [{ id: 'all', name: 'All' }, ...state.babies];
  $('#filter').innerHTML = opts.map((o) =>
    `<button type="button" data-filter="${o.id}" aria-pressed="${filter === o.id}">${o.icon ? babyLabel(o) : escapeHtml(o.name)}</button>`
  ).join('');
}

function renderView() {
  $$('#view button').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.view === view));
  $('#history-content').innerHTML = view === 'today' ? todayHtml() : weekHtml();
}

function visibleBabies() {
  return state.babies.filter((b) => filter === 'all' || b.id === filter);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function eventsIn(babyId, start, end) {
  return state.events.filter((e) => {
    const t = new Date(e.time);
    return e.babyId === babyId && t >= start && t < end;
  });
}

function totals(events) {
  const bottles = events.filter((e) => e.type === 'feed' && e.amountMl);
  return {
    ml: bottles.reduce((sum, e) => sum + e.amountMl, 0),
    bottles: bottles.length,
    feeds: events.filter((e) => e.type === 'feed').length,
    pees: events.filter((e) => e.type === 'diaper' && e.wet).length,
    poops: events.filter((e) => e.type === 'diaper' && e.dirty).length,
  };
}

function entryListHtml(events) {
  if (!events.length) return '<p class="empty">No entries.</p>';
  return `<ul class="entries">${events.map((e) => {
    const b = baby(e.babyId) || { name: '?', color: '#999' };
    const d = describe(e);
    return `<li><button class="entry" data-edit="${e.id}" style="--baby-color:${escapeHtml(b.color)}">
      <time>${formatTime(e.time)}</time>
      <span class="dot" aria-hidden="true"></span>
      <span class="desc">${d.icon} ${escapeHtml(d.text)}
        <small>${escapeHtml(b.name)}${e.note ? ' · ' + escapeHtml(e.note) : ''}</small>
      </span>
    </button></li>`;
  }).join('')}</ul>`;
}

function todayHtml() {
  const start = startOfDay(new Date());
  const end = addDays(start, 1);
  const babies = visibleBabies();

  const summaries = babies.map((b) => {
    const t = totals(eventsIn(b.id, start, end));
    return `
      <div class="summary" style="--baby-color:${escapeHtml(b.color)}">
        <h3>${babyLabel(b)}</h3>
        <div class="tiles">
          <div><b>${t.ml ? formatAmount(t.ml) : '—'}</b><span>total</span></div>
          <div><b>${t.bottles ? formatAmount(t.ml / t.bottles) : '—'}</b><span>avg / feed</span></div>
          <div><b>${t.poops}</b><span>💩 poops</span></div>
          <div><b>${t.pees}</b><span>💧 pees</span></div>
        </div>
      </div>`;
  }).join('');

  const ids = babies.map((b) => b.id);
  const today = sortedEvents().filter((e) => ids.includes(e.babyId) && new Date(e.time) >= start && new Date(e.time) < end);
  const list = today.length
    ? entryListHtml(today)
    : '<p class="empty">Nothing logged today yet. Tap ＋ Log above to start.</p>';
  return `<div class="summaries">${summaries}</div><h3 class="list-head">Today's entries</h3>${list}`;
}

function weekHtml() {
  const today = startOfDay(new Date());
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const start = addDays(today, -i);
    return { start, end: addDays(start, 1) };
  });
  const amount = (ml) => (ml ? formatAmount(ml) : '—');
  const count = (n) => (n ? Math.round(n * 10) / 10 : '—');

  return visibleBabies().map((b) => {
    const rows = days.map((d) => {
      const events = eventsIn(b.id, d.start, d.end);
      return { ...d, events, t: totals(events), key: `${b.id}|${d.start.getTime()}` };
    });

    // Average completed days since tracking began, so a partial today or days before
    // the first entry don't drag it down. Fall back to today if that's all there is.
    const first = state.events.filter((e) => e.babyId === b.id).reduce((min, e) => Math.min(min, new Date(e.time)), Infinity);
    const tracked = rows.filter((r) => r.end > first);
    const counted = tracked.length > 1 ? tracked.slice(1) : tracked;
    const sum = (key) => counted.reduce((s, r) => s + r.t[key], 0);
    const perDay = (key) => (counted.length ? sum(key) / counted.length : 0);

    const body = rows.map((r) => {
      const open = expandedDay === r.key;
      const row = `
        <tr class="day-row" data-day="${r.key}" aria-expanded="${open}">
          <th><span class="chev" aria-hidden="true">›</span>${dayLabel(r.start, true)}</th>
          <td>${amount(r.t.ml)}</td>
          <td>${r.t.bottles ? formatAmount(r.t.ml / r.t.bottles) : '—'}</td>
          <td>${count(r.t.poops)}</td>
          <td>${count(r.t.pees)}</td>
        </tr>`;
      if (!open) return row;
      const events = [...r.events].sort((x, y) => new Date(y.time) - new Date(x.time));
      return row + `<tr class="day-detail"><td colspan="5">${entryListHtml(events)}</td></tr>`;
    }).join('');

    return `
      <div class="week-baby" style="--baby-color:${escapeHtml(b.color)}">
        <h3>${babyLabel(b)}</h3>
        <table class="week-table">
          <thead><tr><th>Day</th><th>Total</th><th>Avg/feed</th><th>Poops</th><th>Pees</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr>
            <th>Daily avg</th>
            <td>${amount(perDay('ml'))}</td>
            <td>${sum('bottles') ? formatAmount(sum('ml') / sum('bottles')) : '—'}</td>
            <td>${count(perDay('poops'))}</td>
            <td>${count(perDay('pees'))}</td>
          </tr></tfoot>
        </table>
      </div>`;
  }).join('') + '<p class="hint">Tap a day to see or edit its entries. Volume counts bottle feeds. Daily avg covers full days only.</p>';
}

// ---------- entry dialog ----------

function setSeg(container, value) {
  $$('button', container).forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.value === value));
}

function syncEntryForm() {
  const dlg = $('#entry-dialog');
  $$('.seg[data-field]', dlg).forEach((seg) => setSeg(seg, form[seg.dataset.field]));
  $$('[data-show]', dlg).forEach((el) => {
    const [key, vals] = el.dataset.show.split('=');
    el.hidden = !vals.split('|').includes(form[key]);
  });
  $$('.chip', dlg).forEach((chip) => chip.setAttribute('aria-pressed', form.who.includes(chip.dataset.baby)));
  $('#who-hint').hidden = !(form.who.length > 1 && (form.method === 'bottle' || form.method === 'combo'));
}

function lastValue(key, babyId) {
  const e = sortedEvents().find((ev) => ev.type === 'feed' && (!babyId || ev.babyId === babyId) && ev[key] != null && ev[key] !== '');
  return e ? e[key] : undefined;
}

function openEntry({ babyId, event } = {}) {
  editingId = event ? event.id : null;
  const unit = state.settings.unit;
  const dlg = $('#entry-dialog');

  if (event) {
    form = {
      who: [event.babyId],
      method: event.type === 'feed' ? event.method || 'bottle' : 'none',
      milk: event.milk || 'formula',
      side: event.side || 'L',
      diaper: event.type !== 'diaper' ? 'none' : event.wet && event.dirty ? 'both' : event.dirty ? 'dirty' : 'wet',
    };
  } else {
    form = {
      who: [babyId],
      method: 'none',
      milk: lastValue('milk', babyId) || lastValue('milk') || 'formula',
      side: 'L',
      diaper: 'none',
    };
    // Suggest the opposite side from this baby's last single-side breastfeed.
    const lastBreast = sortedEvents().find((e) => e.babyId === babyId && usesBreast(e) && (e.side === 'L' || e.side === 'R'));
    if (lastBreast) form.side = lastBreast.side === 'L' ? 'R' : 'L';
  }

  // Editing changes one saved entry, so show only its section and drop the "None" choice.
  $('#feed-section').hidden = !!event && event.type !== 'feed';
  $('#diaper-section').hidden = !!event && event.type !== 'diaper';
  $$('.sheet-section [data-value="none"]', dlg).forEach((btn) => (btn.hidden = !!event));

  $('#entry-title').textContent = event ? 'Edit entry' : 'Log';
  $('#who').innerHTML = state.babies.map((b) =>
    `<button type="button" class="chip" data-baby="${b.id}" style="--baby-color:${escapeHtml(b.color)}">${babyLabel(b)}</button>`
  ).join('');

  $$('.unit-label').forEach((el) => (el.textContent = unit));
  const amount = $('#amount');
  amount.step = unit === 'ml' ? '5' : '0.5';
  amount.value = event ? fromMl(event.amountMl) : fromMl(lastValue('amountMl', babyId) ?? lastValue('amountMl')) || '';
  const presets = unit === 'ml' ? [30, 45, 60, 75, 90, 120] : [1, 2, 3, 4, 5, 6];
  $('#amount-presets').innerHTML = presets.map((p) => `<button type="button" data-preset="${p}">${p} ${unit}</button>`).join('');

  $('#minutes').value = event?.minutes ?? '';
  const iso = event ? event.time : new Date().toISOString();
  initialTime = { input: toLocalInput(iso), iso, isNew: !event };
  $('#time').value = initialTime.input;
  $('#note').value = event?.note || '';
  $('#delete-btn').hidden = !event;

  syncEntryForm();
  dlg.showModal();
  dlg.querySelector('form').scrollTop = 0;
}

function saveEntry() {
  if (!form.who.length) {
    toast('Pick at least one baby');
    return false;
  }
  if (form.method === 'none' && form.diaper === 'none') {
    toast('Choose a feeding or a diaper');
    return false;
  }
  const input = $('#time').value;
  let time;
  if (!input) time = new Date().toISOString();
  else if (input === initialTime.input) time = initialTime.isNew ? new Date().toISOString() : initialTime.iso;
  else time = new Date(input).toISOString();

  const records = [];
  if (form.method !== 'none') {
    const feed = { type: 'feed', method: form.method };
    if (form.method !== 'breast') {
      feed.amountMl = toMl($('#amount').value) ?? undefined;
      feed.milk = form.milk;
    }
    if (form.method !== 'bottle') {
      feed.side = form.side;
      const mins = parseInt($('#minutes').value, 10);
      feed.minutes = mins > 0 ? mins : undefined;
    }
    records.push(feed);
  }
  if (form.diaper !== 'none') {
    records.push({
      type: 'diaper',
      wet: form.diaper === 'wet' || form.diaper === 'both',
      dirty: form.diaper === 'dirty' || form.diaper === 'both',
    });
  }
  const note = $('#note').value.trim();
  if (note) records[0].note = note;

  if (editingId) {
    writeEvents([{ id: editingId, babyId: form.who[0], time, ...records[0] }]);
  } else {
    writeEvents(form.who.flatMap((babyId) => records.map((r) => ({ id: uid(), babyId, time, ...r }))));
  }
  toast(editingId ? 'Entry updated' : 'Saved');
  return true;
}

function deleteEntry(id) {
  const removed = state.events.find((e) => e.id === id);
  if (!removed) return;
  removeEvent(id);
  toast('Entry deleted', { label: 'Undo', run: () => writeEvents([removed]) });
}

// ---------- settings ----------

function openSettings() {
  $('#baby-settings').innerHTML = state.babies.map((b) => `
    <div class="baby-row">
      <input type="color" data-color="${b.id}" value="${escapeHtml(b.color)}" aria-label="Color for ${escapeHtml(b.name)}">
      <input type="text" data-name="${b.id}" value="${escapeHtml(b.name)}" maxlength="24" aria-label="Name">
    </div>`).join('');
  setSeg($('#settings-dialog .seg[data-field="unit"]'), state.settings.unit);
  $('#app-version').textContent = APP_VERSION;
  renderAccount();
  $('#settings-dialog').showModal();
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return toLocalInput(new Date()).slice(0, 10);
}

function exportCsv(events) {
  const rows = [['date', 'time', 'baby', 'type', 'method', 'amount_ml', 'amount_oz', 'contents', 'side', 'minutes', 'wet', 'dirty', 'note']];
  const oldestFirst = [...events].sort((a, b) => new Date(a.time) - new Date(b.time));
  for (const e of oldestFirst) {
    const d = new Date(e.time);
    rows.push([
      toLocalInput(d).slice(0, 10),
      toLocalInput(d).slice(11),
      baby(e.babyId)?.name || e.babyId,
      e.type,
      e.method || '',
      e.amountMl ? Math.round(e.amountMl) : '',
      e.amountMl ? (e.amountMl / ML_PER_OZ).toFixed(1) : '',
      e.milk || '',
      e.side || '',
      e.minutes || '',
      e.type === 'diaper' ? (e.wet ? 'yes' : 'no') : '',
      e.type === 'diaper' ? (e.dirty ? 'yes' : 'no') : '',
      e.note || '',
    ]);
  }
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  download(`twin-track-${stamp()}.csv`, csv, 'text/csv');
}

// ---------- cloud sync ----------
// With a Firebase config (firebase-config.js), entries live in Firestore and every signed-in
// family member sees the same log live. Without one, everything stays in this browser.
// Either way the in-memory state is mirrored to localStorage so the app opens instantly.

const CLOUD_WINDOW_DAYS = 60; // how far back the live log loads; exports fetch everything
const UPLOADED_KEY = 'twintrack.uploaded';
const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch

const cloud = { config: window.FIREBASE_CONFIG || null, fb: null, auth: null, db: null, user: null, unsubs: [] };

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function writeEvents(events) {
  for (const e of events) {
    const i = state.events.findIndex((x) => x.id === e.id);
    if (i === -1) state.events.push(e);
    else state.events[i] = e;
  }
  save();
  render();
  if (!cloud.db) return;
  const { writeBatch, doc } = cloud.fb;
  for (const part of chunks(events, BATCH_LIMIT)) {
    const batch = writeBatch(cloud.db);
    for (const e of part) batch.set(doc(cloud.db, 'events', e.id), e);
    // Resolves once the server has it; offline writes wait in the local queue.
    batch.commit().catch(syncError);
  }
}

function removeEvent(id) {
  state.events = state.events.filter((e) => e.id !== id);
  save();
  render();
  if (cloud.db) cloud.fb.deleteDoc(cloud.fb.doc(cloud.db, 'events', id)).catch(syncError);
}

let babiesTimer;
function writeBabies() {
  save();
  render();
  if (!cloud.db) return;
  clearTimeout(babiesTimer);
  babiesTimer = setTimeout(() => {
    cloud.fb.setDoc(cloud.fb.doc(cloud.db, 'config', 'babies'), { babies: state.babies }).catch(syncError);
  }, 400);
}

// Every entry, not just the live window. Used for backups, CSV and erase.
async function allEvents() {
  if (!cloud.db) return state.events;
  const snap = await cloud.fb.getDocs(cloud.fb.collection(cloud.db, 'events'));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

function syncError(err) {
  console.error('Sync error', err);
  if (err?.code === 'permission-denied') showGate('denied');
  else toast(`Sync problem: ${err?.code || err?.message || err}`);
}

function showGate(kind, detail) {
  const email = detail || cloud.user?.email || 'This account';
  const messages = {
    signin: 'Sign in with your Google account to see and add to the family log.',
    denied: `${email} isn't on the family list. Ask whoever set up Twin Track to add it, or use a different account.`,
    error: `Sign-in didn't work: ${detail}`,
  };
  $('#gate-msg').textContent = messages[kind];
  $('#signin-btn').hidden = kind === 'denied';
  $('#switch-btn').hidden = kind !== 'denied';
  $('#gate').hidden = false;
}

function renderAccount() {
  const signedIn = !!(cloud.db && cloud.user);
  $('#account').hidden = !signedIn;
  if (signedIn) $('#account-email').textContent = `Signed in as ${cloud.user.email}`;
  $('#storage-hint').textContent = signedIn
    ? 'Entries sync to everyone signed in to the family log.'
    : 'Entries are saved only on this device. Export a backup now and then.';
  $('#clear-data').textContent = signedIn ? 'Erase all (everyone)' : 'Erase all';
}

function renderOnline() {
  $('#offline').hidden = !cloud.db || navigator.onLine;
}

async function signIn() {
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = cloud.fb;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(cloud.auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(cloud.auth, provider);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showGate('error', err.code || err.message);
    }
  }
}

function stopListening() {
  cloud.unsubs.forEach((unsub) => unsub());
  cloud.unsubs = [];
}

function listen() {
  stopListening();
  const { onSnapshot, query, collection, where, doc } = cloud.fb;
  const since = addDays(startOfDay(new Date()), -CLOUD_WINDOW_DAYS).toISOString();
  cloud.unsubs = [
    onSnapshot(query(collection(cloud.db, 'events'), where('time', '>=', since)), (snap) => {
      state.events = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      save();
      render();
    }, syncError),
    onSnapshot(doc(cloud.db, 'config', 'babies'), (snap) => {
      const babies = snap.data()?.babies;
      if (!Array.isArray(babies)) return;
      state.babies = state.babies.map((b, i) => ({ ...b, ...(babies[i] || {}), id: b.id }));
      save();
      render();
    }, syncError),
  ];
}

// The first time this phone signs in, send up whatever it logged while it was offline-only.
function uploadLocalEntries() {
  if (localStorage.getItem(UPLOADED_KEY)) return;
  localStorage.setItem(UPLOADED_KEY, new Date().toISOString());
  if (!state.events.length) return;
  writeEvents([...state.events]);
  toast(`Uploaded ${state.events.length} entries from this phone`);
}

async function onSignedIn(user, db) {
  cloud.user = user;
  const babiesRef = cloud.fb.doc(db, 'config', 'babies');
  let snap = null;
  try {
    snap = await cloud.fb.getDoc(babiesRef); // also confirms this account is on the family list
  } catch (err) {
    if (err.code === 'permission-denied') return showGate('denied', user.email);
    // Offline with nothing cached yet: carry on, the listeners catch up when back online.
  }
  cloud.db = db;
  $('#gate').hidden = true;
  if (snap && !snap.exists()) cloud.fb.setDoc(babiesRef, { babies: state.babies }).catch(syncError);
  uploadLocalEntries();
  listen();
  renderAccount();
  renderOnline();
}

function onSignedOut() {
  stopListening();
  cloud.user = null;
  cloud.db = null;
  renderAccount();
  renderOnline();
  showGate('signin');
}

async function startCloud() {
  const fb = (cloud.fb = await import('./vendor/firebase.js'));
  const app = fb.initializeApp(cloud.config);
  cloud.auth = fb.getAuth(app);
  const db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (window.TWIN_TRACK_EMULATOR) {
    // Local testing against the Firebase emulators.
    fb.connectAuthEmulator(cloud.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    window.__twinTrack = { fb, auth: cloud.auth };
  }
  fb.getRedirectResult(cloud.auth).catch((err) => showGate('error', err.code || err.message));
  fb.onAuthStateChanged(cloud.auth, (user) => (user ? onSignedIn(user, db) : onSignedOut()));
}

// ---------- events ----------

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  const row = !t && ev.target.closest('tr[data-day]');
  if (row) {
    expandedDay = expandedDay === row.dataset.day ? null : row.dataset.day;
    renderView();
    return;
  }
  if (!t) return;

  if (t.dataset.log) return openEntry({ babyId: t.dataset.log });
  if (t.dataset.edit) {
    const e = state.events.find((x) => x.id === t.dataset.edit);
    if (e) openEntry({ event: e });
    return;
  }
  if (t.dataset.filter) {
    filter = t.dataset.filter;
    renderFilter();
    renderView();
    return;
  }
  if (t.dataset.view) {
    view = t.dataset.view;
    renderView();
    return;
  }
  if (t.hasAttribute('data-close')) return t.closest('dialog').close();

  const entryDlg = t.closest('#entry-dialog');
  if (entryDlg) {
    if (t.classList.contains('chip')) {
      const id = t.dataset.baby;
      if (editingId) form.who = [id];
      else form.who = form.who.includes(id) ? form.who.filter((x) => x !== id) : [...form.who, id];
      syncEntryForm();
      return;
    }
    if (t.dataset.preset) {
      $('#amount').value = t.dataset.preset;
      return;
    }
    if (t.dataset.step) {
      const amount = $('#amount');
      const step = parseFloat(amount.step);
      const next = (parseFloat(amount.value) || 0) + step * Number(t.dataset.step);
      amount.value = Math.max(0, Math.round(next / step) * step);
      return;
    }
    const seg = t.closest('.seg[data-field]');
    if (seg && t.dataset.value) {
      form[seg.dataset.field] = t.dataset.value;
      syncEntryForm();
      return;
    }
  }

  const settingsSeg = t.closest('#settings-dialog .seg[data-field="unit"]');
  if (settingsSeg && t.dataset.value) {
    state.settings.unit = t.dataset.value;
    setSeg(settingsSeg, t.dataset.value);
    save();
    render();
  }
});

$('#entry-form').addEventListener('submit', (ev) => {
  if (!saveEntry()) ev.preventDefault();
});

$('#delete-btn').addEventListener('click', () => {
  const id = editingId;
  $('#entry-dialog').close();
  deleteEntry(id);
});

$('#settings-btn').addEventListener('click', openSettings);

$('#settings-form').addEventListener('input', (ev) => {
  const t = ev.target;
  const b = baby(t.dataset.name || t.dataset.color);
  if (!b) return;
  if (t.dataset.name !== undefined) b.name = t.value.trim() || b.name;
  if (t.dataset.color !== undefined) b.color = t.value;
  writeBabies();
});

$('#export-json').addEventListener('click', async () => {
  try {
    const data = { ...state, events: await allEvents() };
    download(`twin-track-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  } catch (err) {
    syncError(err);
  }
});

$('#export-csv').addEventListener('click', async () => {
  try {
    exportCsv(await allEvents());
  } catch (err) {
    syncError(err);
  }
});

$('#import-json').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`Add the ${data.events.length} entries from this backup? Entries already here are kept.`)) return;
    state.babies = data.babies;
    writeBabies();
    writeEvents(data.events);
    openSettings();
    toast('Backup restored');
  } catch (err) {
    alert(`Couldn't read that file: ${err.message}`);
  }
});

$('#clear-data').addEventListener('click', async () => {
  const msg = cloud.db
    ? 'Erase every entry for everyone in the family log? This cannot be undone.'
    : 'Erase every entry on this device? This cannot be undone.';
  if (!confirm(msg)) return;
  try {
    const events = await allEvents();
    if (cloud.db) {
      for (const part of chunks(events, BATCH_LIMIT)) {
        const batch = cloud.fb.writeBatch(cloud.db);
        for (const e of part) batch.delete(cloud.fb.doc(cloud.db, 'events', e.id));
        batch.commit().catch(syncError);
      }
    }
    state.events = [];
    save();
    render();
    toast('All entries erased');
  } catch (err) {
    syncError(err);
  }
});

$('#signin-btn').addEventListener('click', signIn);
$('#switch-btn').addEventListener('click', () => cloud.fb.signOut(cloud.auth).then(signIn));
$('#signout-btn').addEventListener('click', () => {
  if (!confirm('Sign out? You will need to sign in again to see the family log.')) return;
  $('#settings-dialog').close();
  cloud.fb.signOut(cloud.auth);
});
window.addEventListener('online', renderOnline);
window.addEventListener('offline', renderOnline);

// Close dialogs when tapping the backdrop.
$$('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg) dlg.close();
  });
});

// Keep in sync if the app is open in another tab (cloud mode syncs through Firestore instead).
window.addEventListener('storage', (ev) => {
  if (ev.key === STORAGE_KEY && !cloud.db) {
    state = load();
    render();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  render();
  // Home-screen apps resume rather than reload, so look for an update each time we come back.
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
});

// Re-render each minute so "Today" rolls over to "Yesterday" after midnight.
setInterval(render, 60 * 1000);

render();

if (cloud.config) {
  startCloud().catch((err) => {
    console.error('Could not start sync', err);
    showGate('error', err.message);
  });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .catch((err) => console.warn('Service worker failed', err));
  // A new version took over: reload once so the new files are in use. Skip on first install.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}
