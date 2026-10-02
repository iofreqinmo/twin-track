'use strict';

const STORAGE_KEY = 'twintrack.v1';
const ML_PER_OZ = 29.5735;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_PAGE = 3;
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
let view = 'log';
let daysShown = DAYS_PER_PAGE;
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

function formatAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m ago` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function sideLabel(side) {
  return { L: 'left', R: 'right', LR: 'both sides' }[side] || '';
}

function describe(e) {
  if (e.type === 'diaper') {
    const kind = e.wet && e.dirty ? 'Pee + poo' : e.dirty ? 'Poo' : 'Pee';
    return { icon: e.dirty ? '💩' : '💧', text: kind };
  }
  if (e.method === 'breast') {
    const parts = ['Breastfed'];
    if (e.side) parts.push(sideLabel(e.side));
    if (e.minutes) parts.push(`${e.minutes} min`);
    return { icon: '🤱', text: parts.join(' · ') };
  }
  const parts = ['Bottle'];
  if (e.amountMl) parts.push(formatAmount(e.amountMl));
  if (e.milk) parts.push(e.milk === 'formula' ? 'formula' : 'breast milk');
  return { icon: '🍼', text: parts.join(' · ') };
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

function renderView() {
  $$('#view button').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.view === view));
  $('#history-list').hidden = view !== 'log';
  $('#week').hidden = view !== 'week';
  if (view === 'log') renderHistory();
  else {
    $('#more-btn').hidden = true;
    renderWeek();
  }
}

function renderCards() {
  const events = sortedEvents();
  const since = Date.now() - DAY_MS;
  $('#cards').innerHTML = state.babies.map((b) => {
    const mine = events.filter((e) => e.babyId === b.id);
    const lastFeed = mine.find((e) => e.type === 'feed');
    const lastDiaper = mine.find((e) => e.type === 'diaper');
    const recent = mine.filter((e) => new Date(e.time) >= since);
    const feeds = recent.filter((e) => e.type === 'feed');
    const bottleMl = feeds.reduce((sum, e) => sum + (e.amountMl || 0), 0);
    const wet = recent.filter((e) => e.type === 'diaper' && e.wet).length;
    const dirty = recent.filter((e) => e.type === 'diaper' && e.dirty).length;

    let feedDetail = '';
    if (lastFeed) {
      feedDetail = describe(lastFeed).text;
      const lastBreast = mine.find((e) => e.type === 'feed' && e.method === 'breast' && (e.side === 'L' || e.side === 'R'));
      if (lastBreast) feedDetail += ` · next: ${lastBreast.side === 'L' ? 'right' : 'left'}`;
    }

    return `
      <article class="card" style="--baby-color:${escapeHtml(b.color)}">
        <h2>${babyLabel(b)}</h2>
        <div class="since">
          Last fed
          <strong data-ago="${lastFeed ? lastFeed.time : ''}">${lastFeed ? formatAgo(lastFeed.time) : '—'}</strong>
          <span class="detail">${escapeHtml(feedDetail)}</span>
        </div>
        <div class="since">
          Last diaper
          <strong data-ago="${lastDiaper ? lastDiaper.time : ''}">${lastDiaper ? formatAgo(lastDiaper.time) : '—'}</strong>
        </div>
        <div class="stats">
          <div><b>${feeds.length}</b><span>feeds</span></div>
          <div><b>${wet}</b><span>pees</span></div>
          <div><b>${dirty}</b><span>poos</span></div>
        </div>
        <div class="stats-label">last 24h${bottleMl ? ` · ${formatAmount(bottleMl)} eaten` : ''}</div>
        <div class="card-btns">
          <button class="btn" data-quick="feed" data-baby="${b.id}" aria-label="Log feed for ${escapeHtml(b.name)}">🍼</button>
          <button class="btn" data-quick="diaper" data-baby="${b.id}" aria-label="Log diaper for ${escapeHtml(b.name)}">💧</button>
        </div>
      </article>`;
  }).join('');
}

function refreshAgo() {
  $$('[data-ago]').forEach((el) => {
    if (el.dataset.ago) el.textContent = formatAgo(el.dataset.ago);
  });
}

function renderFilter() {
  const opts = [{ id: 'all', name: 'All' }, ...state.babies];
  $('#filter').innerHTML = opts.map((o) =>
    `<button type="button" data-filter="${o.id}" aria-pressed="${filter === o.id}">${o.icon ? babyLabel(o) : escapeHtml(o.name)}</button>`
  ).join('');
}

function renderHistory() {
  const events = sortedEvents().filter((e) => filter === 'all' || e.babyId === filter);
  const list = $('#history-list');
  if (!events.length) {
    list.innerHTML = '<p class="empty">Nothing logged yet. Tap 🍼 or 💧 above to start.</p>';
    $('#more-btn').hidden = true;
    return;
  }

  const groups = [];
  for (const e of events) {
    const key = dayKey(e.time);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, time: e.time, items: [] });
    groups[groups.length - 1].items.push(e);
  }

  list.innerHTML = groups.slice(0, daysShown).map((g) => {
    const feeds = g.items.filter((e) => e.type === 'feed').length;
    const diapers = g.items.length - feeds;
    return `
      <div class="day">
        <h3><span>${dayLabel(g.time)}</span><span>${plural(feeds, 'feed')} · ${plural(diapers, 'diaper')}</span></h3>
        <ul>${g.items.map((e) => {
          const b = baby(e.babyId) || { name: '?', color: '#999' };
          const d = describe(e);
          return `<li><button class="entry" data-edit="${e.id}" style="--baby-color:${escapeHtml(b.color)}">
            <time>${formatTime(e.time)}</time>
            <span class="dot" aria-hidden="true"></span>
            <span class="desc">${d.icon} ${escapeHtml(d.text)}
              <small>${escapeHtml(b.name)}${e.note ? ' · ' + escapeHtml(e.note) : ''}</small>
            </span>
          </button></li>`;
        }).join('')}</ul>
      </div>`;
  }).join('');

  $('#more-btn').hidden = groups.length <= daysShown;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayTotals(events) {
  return {
    ml: events.reduce((sum, e) => sum + (e.type === 'feed' && e.amountMl ? e.amountMl : 0), 0),
    feeds: events.filter((e) => e.type === 'feed').length,
    pees: events.filter((e) => e.type === 'diaper' && e.wet).length,
    poos: events.filter((e) => e.type === 'diaper' && e.dirty).length,
  };
}

function renderWeek() {
  const days = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    const start = startOfDay(new Date());
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    days.push({ start, end });
  }
  const babies = state.babies.filter((b) => filter === 'all' || b.id === filter);

  $('#week').innerHTML = babies.map((b) => {
    const mine = state.events.filter((e) => e.babyId === b.id);
    const rows = days.map((d) => ({
      ...d,
      totals: dayTotals(mine.filter((e) => { const t = new Date(e.time); return t >= d.start && t < d.end; })),
    }));
    // Average completed days since tracking began, so a partial today or days before
    // the first entry don't drag it down. Fall back to today if that's all there is.
    const first = mine.reduce((min, e) => Math.min(min, new Date(e.time)), Infinity);
    const tracked = rows.filter((r) => r.end > first);
    const counted = tracked.length > 1 ? tracked.slice(1) : tracked;
    const avg = (key) => counted.length ? counted.reduce((s, r) => s + r.totals[key], 0) / counted.length : 0;
    const num = (n) => (n ? Math.round(n * 10) / 10 : '—');

    return `
      <div class="week-baby" style="--baby-color:${escapeHtml(b.color)}">
        <h3>${babyLabel(b)}</h3>
        <table class="week-table">
          <thead><tr><th>Day</th><th>Eaten</th><th>Feeds</th><th>💧 Pees</th><th>💩 Poos</th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr>
              <th>${dayLabel(r.start)}</th>
              <td>${r.totals.ml ? formatAmount(r.totals.ml) : '—'}</td>
              <td>${num(r.totals.feeds)}</td>
              <td>${num(r.totals.pees)}</td>
              <td>${num(r.totals.poos)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <th>Daily avg</th>
            <td>${avg('ml') ? formatAmount(avg('ml')) : '—'}</td>
            <td>${num(avg('feeds'))}</td>
            <td>${num(avg('pees'))}</td>
            <td>${num(avg('poos'))}</td>
          </tr></tfoot>
        </table>
      </div>`;
  }).join('') + '<p class="hint">Eaten counts bottle feeds; breastfeeds count toward Feeds. Daily avg covers full days only.</p>';
}

// ---------- entry dialog ----------

function setSeg(container, value) {
  $$('button', container).forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.value === value));
}

function syncEntryForm() {
  const dlg = $('#entry-dialog');
  $$('.seg[data-field]', dlg).forEach((seg) => setSeg(seg, form[seg.dataset.field]));
  $$('[data-show]', dlg).forEach((el) => {
    const [key, val] = el.dataset.show.split('=');
    el.hidden = form[key] !== val;
  });
  $$('.chip', dlg).forEach((chip) => chip.setAttribute('aria-pressed', form.who.includes(chip.dataset.baby)));
  $('#who-hint').hidden = !(form.who.length > 1 && form.type === 'feed' && form.method === 'bottle');
}

function lastValue(type, key) {
  const e = sortedEvents().find((ev) => ev.type === type && ev[key] != null && ev[key] !== '');
  return e ? e[key] : undefined;
}

function openEntry({ type = 'feed', babyId, event } = {}) {
  editingId = event ? event.id : null;
  const unit = state.settings.unit;

  if (event) {
    form = {
      who: [event.babyId],
      type: event.type,
      method: event.method || 'bottle',
      milk: event.milk || 'formula',
      side: event.side || 'L',
      diaper: event.wet && event.dirty ? 'both' : event.dirty ? 'dirty' : 'wet',
    };
  } else {
    const lastFeed = sortedEvents().find((e) => e.type === 'feed');
    form = {
      who: babyId === 'both' ? state.babies.map((b) => b.id) : [babyId],
      type,
      method: lastFeed?.method || 'bottle',
      milk: lastValue('feed', 'milk') || 'formula',
      side: 'L',
      diaper: 'wet',
    };
    // Suggest the opposite side from this baby's last single-side breastfeed.
    const lastBreast = sortedEvents().find((e) => e.babyId === form.who[0] && e.method === 'breast' && (e.side === 'L' || e.side === 'R'));
    if (lastBreast) form.side = lastBreast.side === 'L' ? 'R' : 'L';
  }

  $('#entry-title').textContent = event ? 'Edit entry' : 'New entry';
  $('#who').innerHTML = state.babies.map((b) =>
    `<button type="button" class="chip" data-baby="${b.id}" style="--baby-color:${escapeHtml(b.color)}">${babyLabel(b)}</button>`
  ).join('');

  $$('.unit-label').forEach((el) => (el.textContent = unit));
  const amount = $('#amount');
  amount.step = unit === 'ml' ? '5' : '0.5';
  amount.value = event ? fromMl(event.amountMl) : fromMl(lastValue('feed', 'amountMl')) || '';
  const presets = unit === 'ml' ? [30, 45, 60, 75, 90, 120] : [1, 2, 3, 4, 5, 6];
  $('#amount-presets').innerHTML = presets.map((p) => `<button type="button" data-preset="${p}">${p} ${unit}</button>`).join('');

  $('#minutes').value = event?.minutes ?? '';
  const iso = event ? event.time : new Date().toISOString();
  initialTime = { input: toLocalInput(iso), iso, isNew: !event };
  $('#time').value = initialTime.input;
  $('#note').value = event?.note || '';
  $('#delete-btn').hidden = !event;

  syncEntryForm();
  $('#entry-dialog').showModal();
}

function saveEntry() {
  if (!form.who.length) {
    toast('Pick at least one baby');
    return false;
  }
  const input = $('#time').value;
  let time;
  if (!input) time = new Date().toISOString();
  else if (input === initialTime.input) time = initialTime.isNew ? new Date().toISOString() : initialTime.iso;
  else time = new Date(input).toISOString();
  const details = { type: form.type, time, note: $('#note').value.trim() || undefined };

  if (form.type === 'feed') {
    details.method = form.method;
    if (form.method === 'bottle') {
      details.amountMl = toMl($('#amount').value) ?? undefined;
      details.milk = form.milk;
    } else {
      details.side = form.side;
      const mins = parseInt($('#minutes').value, 10);
      details.minutes = mins > 0 ? mins : undefined;
    }
  } else {
    details.wet = form.diaper === 'wet' || form.diaper === 'both';
    details.dirty = form.diaper === 'dirty' || form.diaper === 'both';
  }

  if (editingId) {
    const idx = state.events.findIndex((e) => e.id === editingId);
    if (idx !== -1) state.events[idx] = { id: editingId, babyId: form.who[0], ...details };
  } else {
    for (const babyId of form.who) state.events.push({ id: uid(), babyId, ...details });
  }
  save();
  render();
  toast(editingId ? 'Entry updated' : 'Saved');
  return true;
}

function deleteEntry(id) {
  const idx = state.events.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const [removed] = state.events.splice(idx, 1);
  save();
  render();
  toast('Entry deleted', {
    label: 'Undo',
    run: () => { state.events.push(removed); save(); render(); },
  });
}

// ---------- settings ----------

function openSettings() {
  $('#baby-settings').innerHTML = state.babies.map((b) => `
    <div class="baby-row">
      <input type="color" data-color="${b.id}" value="${escapeHtml(b.color)}" aria-label="Color for ${escapeHtml(b.name)}">
      <input type="text" data-name="${b.id}" value="${escapeHtml(b.name)}" maxlength="24" aria-label="Name">
    </div>`).join('');
  setSeg($('#settings-dialog .seg[data-field="unit"]'), state.settings.unit);
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

function exportCsv() {
  const rows = [['date', 'time', 'baby', 'type', 'method', 'amount_ml', 'amount_oz', 'contents', 'side', 'minutes', 'wet', 'dirty', 'note']];
  for (const e of sortedEvents().reverse()) {
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

// ---------- events ----------

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;

  if (t.dataset.quick) return openEntry({ type: t.dataset.quick, babyId: t.dataset.baby });
  if (t.dataset.edit) {
    const e = state.events.find((x) => x.id === t.dataset.edit);
    if (e) openEntry({ event: e });
    return;
  }
  if (t.dataset.filter) {
    filter = t.dataset.filter;
    daysShown = DAYS_PER_PAGE;
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

$('#more-btn').addEventListener('click', () => {
  daysShown += DAYS_PER_PAGE;
  renderHistory();
});

$('#settings-btn').addEventListener('click', openSettings);

$('#settings-form').addEventListener('input', (ev) => {
  const t = ev.target;
  const b = baby(t.dataset.name || t.dataset.color);
  if (!b) return;
  if (t.dataset.name !== undefined) b.name = t.value.trim() || b.name;
  if (t.dataset.color !== undefined) b.color = t.value;
  save();
  render();
});

$('#export-json').addEventListener('click', () => {
  download(`twin-track-backup-${stamp()}.json`, JSON.stringify(state, null, 2), 'application/json');
});

$('#export-csv').addEventListener('click', exportCsv);

$('#import-json').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`Replace current data with this backup (${data.events.length} entries)?`)) return;
    state = data;
    save();
    render();
    openSettings();
    toast('Backup restored');
  } catch (err) {
    alert(`Couldn't read that file: ${err.message}`);
  }
});

$('#clear-data').addEventListener('click', () => {
  if (!confirm('Erase every entry on this device? This cannot be undone.')) return;
  state.events = [];
  save();
  render();
  toast('All entries erased');
});

// Close dialogs when tapping the backdrop.
$$('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg) dlg.close();
  });
});

// Keep in sync if the app is open in another tab.
window.addEventListener('storage', (ev) => {
  if (ev.key === STORAGE_KEY) {
    state = load();
    render();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

setInterval(refreshAgo, 30 * 1000);

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
}
