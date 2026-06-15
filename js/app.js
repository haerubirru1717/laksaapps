// ══════════════════════════════════════
// app.js — Laksa Core Application
// Constants, State, API, Helpers, Theme, Navigation, Init
// ══════════════════════════════════════

// ── CONSTANTS ──
const PROFILE_KEY = 'laksa_profile';
const K = { tx: 'ft_tx', bud: 'ft_bud', goals: 'ft_goals', accs: 'ft_acc', cats: 'ft_cats', set: 'ft_set', rec: 'ft_rec' };
const COLORS = ['#ff4d1c', '#00a878', '#1c3fff', '#d4920a', '#6b4fff', '#e63c1e', '#00c4a0', '#e8a020', '#2dd4bf'];
const DEF_CATS = [
  { id: 'c1', name: 'Makanan & Minuman', emoji: '🍜', type: 'expense' },
  { id: 'c2', name: 'Transportasi', emoji: '🚗', type: 'expense' },
  { id: 'c3', name: 'Belanja', emoji: '🛍️', type: 'expense' },
  { id: 'c4', name: 'Tagihan & Utilitas', emoji: '💡', type: 'expense' },
  { id: 'c5', name: 'Hiburan', emoji: '🎮', type: 'expense' },
  { id: 'c6', name: 'Kesehatan', emoji: '🏥', type: 'expense' },
  { id: 'c7', name: 'Pendidikan', emoji: '📚', type: 'expense' },
  { id: 'c8', name: 'Gaji', emoji: '💼', type: 'income' },
  { id: 'c9', name: 'Freelance', emoji: '💻', type: 'income' },
  { id: 'c10', name: 'Investasi', emoji: '📈', type: 'income' },
  { id: 'c11', name: 'Hadiah', emoji: '🎁', type: 'income' },
  { id: 'c12', name: 'Lainnya', emoji: '📌', type: 'both' }
];
const DEF_ACCS = [{ id: 'a1', name: 'Dompet Tunai', balance: 0, color: '#fbbf24' }, { id: 'a2', name: 'Bank Mandiri', balance: 0, color: '#E6B800' }];
const DEF_SET = { name: 'Pengguna', currency: 'Rp', theme: 'warm' };
// BANKS, SVG_FILES, detBank, getLogoHtml → dipindahkan ke banks.js

const CAT_ICONS = {
  'c1': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`,
  'c2': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  'c3': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
  'c4': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  'c5': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  'c6': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'c7': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`,
  'c8': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  'c9': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  'c10': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  'c11': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>`,
  'c12': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  'default': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};
const getCatIcon = (id) => {
  const c = typeof getCats === 'function' ? getCats().find(x => x.id === id) : null;
  if (c && c.emoji) return `<span style="font-size:1.1em;line-height:1;display:inline-flex;align-items:center;">${c.emoji}</span>`;
  return CAT_ICONS[id] || CAT_ICONS['default'];
};
// ── STATE ──
let curPage = 'dashboard', txPg = 1, TX_PER = 15, sortF = 'date', sortA = false, cfDays = 7, curTxMonth = '';
let fTimer = null, rData = null, rB64 = null;
const CH = {};

// ── STORAGE (localStorage — hanya untuk settings & receipt history) ──
const ld = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
const sv = (k, d) => { try { localStorage.setItem(k, JSON.stringify(d)); return true; } catch { return false; } };
const getRec = () => ld(K.rec, []);
const getSet = () => {
  const s = ld(K.set, null);
  const p = getProfile();
  const defaultName = p?.name || 'Pengguna';
  const defaultTheme = p?.theme || 'glass';
  if (!s) {
    return { name: defaultName, currency: 'Rp', theme: defaultTheme };
  }
  if (!s.name || s.name === 'Pengguna') {
    s.name = defaultName;
  }
  if (!s.theme) {
    s.theme = defaultTheme;
  }
  return s;
};

// ── API LAYER — D1 sebagai master ──
const CLOUD_URL = 'https://laksana.haerubirru17.workers.dev';

// In-memory cache — di-refresh setiap load halaman
let _cache = { tx: null, accs: null, cats: null, buds: null, goals: null, bills: null, piutang: null, loading: false };

// ── AUTH TOKEN MANAGEMENT ──
const TOKEN_KEY = 'laksa_token';
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }
function isLoggedIn() { return !!getToken(); }

function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch { return null; } }
function getUserId() {
  // For backward compat: if token exists, user_id is in JWT (server extracts it)
  // If no token but profile has tgId, use that as fallback
  return getProfile()?.id || getProfile()?.tgId || null;
}

async function api(method, path, body) {
  const token = getToken();
  const url = `${CLOUD_URL}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) {
    opts.headers['Authorization'] = `Bearer ${token}`;
  }
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (r.status === 401) {
    clearToken();
    localStorage.removeItem(PROFILE_KEY);
    showAuthPage();
    throw new Error('Sesi expired, silakan login kembali');
  }
  if (r.status === 429) {
    const e = await r.json().catch(() => ({}));
    if (e.upgrade) { showUpgradeModal(e.error); }
    throw new Error(e.error || 'Batas harian tercapai');
  }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
  return r.json();
}

// ── AUTH API CALLS ──
async function apiAuth(method, path, body) {
  const url = `${CLOUD_URL}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// ── Usage Status (Premium) ──
let _usageCache = null;
async function fetchUsageStatus() {
  try {
    const data = await api('GET', '/usage/status');
    _usageCache = data;
    updateUsageBadges(data);
    return data;
  } catch (e) { return null; }
}
function getUsageStatus() { return _usageCache; }

function updateUsageBadges(data) {
  if (!data || data.plan === 'premium') {
    document.querySelectorAll('.usage-badge').forEach(el => el.remove());
    return;
  }
  const features = data.features || {};
  Object.keys(features).forEach(key => {
    const badge = document.getElementById(`usage-${key}`);
    if (badge) {
      const f = features[key];
      const remaining = Math.max(0, f.limit - f.used);
      badge.textContent = `${remaining}/${f.limit}`;
      badge.classList.toggle('usage-exhausted', remaining === 0);
    }
  });
}

function showUpgradeModal(message) {
  if (document.getElementById('upgrade-modal')) return;
  const profile = getProfile();
  const emailText = profile?.email || '-';
  const overlay = document.createElement('div');
  overlay.id = 'upgrade-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box upgrade-box">
      <div class="upgrade-icon">&#9889;</div>
      <h3>Batas Harian Tercapai</h3>
      <p class="upgrade-msg">${message || 'Kamu sudah mencapai batas penggunaan gratis hari ini.'}</p>
      <div class="upgrade-info">
        <p>Upgrade ke <strong>Premium</strong> untuk akses <strong>unlimited</strong> semua fitur.</p>
      </div>
      <div class="upgrade-qris">
        <p class="qris-placeholder">QRIS akan tersedia segera</p>
      </div>
      <div class="upgrade-contact">
        <p>Silakan hubungi admin untuk konfirmasi pembayaran.</p>
        <p>Sebutkan email akun kamu:</p>
        <div class="upgrade-email">${emailText}</div>
      </div>
      <div class="upgrade-actions">
        <button class="btn-upgrade-contact" onclick="window.open('https://t.me/haerubirru','_blank')">Hubungi Admin</button>
        <button class="btn-upgrade-close" onclick="closeUpgradeModal()">Nanti Saja</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
}

function closeUpgradeModal() {
  const m = document.getElementById('upgrade-modal');
  if (m) { m.classList.remove('show'); setTimeout(() => m.remove(), 300); }
}

// ── Transactions ──
async function fetchTx(month) {
  const m = month || thisMon();
  const data = await api('GET', `/transactions?month=${m}&limit=500`);
  _cache.tx = data;
  return data;
}
function getTx() { return _cache.tx || []; }

// ── Transactions (year-wide for reports) ──
async function fetchTxYear(year) {
  const y = year || String(new Date().getFullYear());
  const data = await api('GET', `/transactions?month=${y}&limit=10000`);
  _cache.txYear = data;
  return data;
}
function getTxYear() { return _cache.txYear || []; }

// ── Accounts ──
async function fetchAccs() {
  const data = await api('GET', '/accounts');
  _cache.accs = data;
  return data;
}
function getAccs() { return _cache.accs || []; }

// ── Categories ──
async function fetchCats() {
  const data = await api('GET', '/categories');
  _cache.cats = data;
  return data;
}
function getCats() { return _cache.cats || []; }

// ── Budgets (D1) ──
async function fetchBuds() {
  const data = await api('GET', '/budgets');
  _cache.buds = Array.isArray(data) ? data : [];
  return _cache.buds;
}
function getBud() { return _cache.buds || []; }

// ── Goals (D1) ──
async function fetchGoals() {
  const data = await api('GET', '/goals');
  _cache.goals = Array.isArray(data) ? data : [];
  return _cache.goals;
}
function getGoals() { return _cache.goals || []; }

// ── Bills (D1) ──
async function fetchBills() {
  const data = await api('GET', '/bills');
  _cache.bills = Array.isArray(data) ? data : [];
  return _cache.bills;
}
function getBills() { return _cache.bills || []; }

// ── Piutang (D1) ──
async function fetchPiutang() {
  const data = await api('GET', '/piutang');
  _cache.piutang = Array.isArray(data) ? data : [];
  return _cache.piutang;
}
function getPiutang() { return _cache.piutang || []; }

// ── Load all ──
async function loadAll(month) {
  if (_cache.loading) return;
  _cache.loading = true;
  showSkeletons();
  try {
    const uid = getUserId();
    if (!uid) return;
    await Promise.all([fetchTx(month), fetchAccs(), fetchCats(), fetchBuds(), fetchGoals(), fetchBills(), fetchPiutang(), fetchUsageStatus()]);
  } catch (e) {
    console.error('loadAll error:', e);
    toast('Gagal memuat data: ' + e.message, 'err');
  } finally {
    _cache.loading = false;
  }
}

// ── Skeletons & Animations ──
function showSkeletons() {
  if (curPage === 'dashboard') {
    const rl = el('recentList'); if (rl) rl.innerHTML = Array(3).fill('<li class="tx-item skeleton" style="height:45px;border-radius:9px"></li>').join('');
    const ac = el('accsScroll'); if (ac) ac.innerHTML = Array(2).fill('<div class="dc skeleton" style="border:none"></div>').join('');
  } else if (curPage === 'transactions') {
    const tl = el('txList'); if (tl) tl.innerHTML = Array(5).fill('<div class="skeleton" style="height:60px;margin-bottom:.5rem;border-radius:11px"></div>').join('');
  }
}
// getLogoHtml → dipindahkan ke banks.js
function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * easeOut;
    obj.textContent = fCur(current);
    if (progress < 1) window.requestAnimationFrame(step);
    else obj.textContent = fCur(end);
  };
  window.requestAnimationFrame(step);
}

// ── Helpers (sinkron, dari cache) ──
const catBy = (id) => getCats().find(c => c.id === id) || { name: 'Lainnya', emoji: '📌', id: '?' };
const accBy = (id) => getAccs().find(a => a.id === id) || { name: '-', id: '?' };

// ── HELPERS ──
const fCur = (a, sign = false, short = false) => {
  const cfg = getSet(), val = a || 0, abs = Math.abs(val);
  const neg = val < 0;
  const pfx = (sign && val > 0 ? '+' : neg ? '−' : '');
  if (short) {
    if (abs >= 1e12) return (neg && !sign ? '−' : '') + pfx + cfg.currency + ' ' + (abs / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (abs >= 1e9) return (neg && !sign ? '−' : '') + pfx + cfg.currency + ' ' + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e6) return (neg && !sign ? '−' : '') + pfx + cfg.currency + ' ' + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'jt';
    if (abs >= 1e3) return (neg && !sign ? '−' : '') + pfx + cfg.currency + ' ' + (abs / 1e3).toFixed(0) + 'rb';
    return (neg && !sign ? '−' : '') + pfx + cfg.currency + ' ' + abs.toLocaleString('id-ID');
  }
  return (neg && !sign ? '−' : '') + pfx + cfg.currency + ' ' + abs.toLocaleString('id-ID');
};
// Short version — dipakai di hero card & kartu rekening
const fCurS = (a, sign = false) => fCur(a, sign, true);
const fDate = (d) => { if (!d) return '-'; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };
const fTime = (t) => { if (!t) return ''; try { return t.slice(0, 5); } catch { return ''; } };
const fDateTime = (d, t) => { const ds = fDate(d); return t ? ds + ' · ' + fTime(t) : ds; };
const mKey = (d) => (d || '').slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const thisMon = () => today().slice(0, 7);
// catBy & accBy sudah didefinisikan di API layer di atas
const esc = (s) => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = (id) => document.getElementById(id);
const uid = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

// SVG_FILES, detBank → dipindahkan ke banks.js

// ── THEME ──
function applyTheme(theme, btn, save = true) {
  if (theme !== 'glass' && theme !== 'dark' && theme !== 'education') {
    theme = 'glass';
  }
  document.documentElement.setAttribute('data-theme', theme);
  // support old .theme-opt (backward compat) + new .theme-card-premium
  document.querySelectorAll('.theme-opt,.theme-card-premium').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else { const o = el('topt-' + theme); if (o) o.classList.add('active'); }
  if (save) {
    const s = getSet(); s.theme = theme; sv(K.set, s);
    const p = getProfile(); if (p) { p.theme = theme; saveProfile(p); }
  }
  const isDark = theme === 'dark';
  Chart.defaults.color = isDark ? 'rgba(210,220,240,0.7)' : (theme === 'education' ? '#0f172a' : 'rgba(15,23,42,0.55)');
  Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.08)' : (theme === 'education' ? 'rgba(15,23,42,0.15)' : 'rgba(15,23,42,0.08)');
  if (curPage === 'dashboard') renderDash();
  if (curPage === 'reports') renderReports();
}


// ── NAVIGATION ──
function go(page) {
  if (curPage === page) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item,.bnav-item').forEach(n => n.classList.remove('active'));
  const pg = el('page-' + page); if (pg) pg.classList.add('active');
  document.querySelectorAll('[data-page="' + page + '"]').forEach(n => n.classList.add('active'));
  curPage = page;
  requestAnimationFrame(() => {
    if (page === 'dashboard') renderDash();
    else if (page === 'transactions') renderTxPage();
    else if (page === 'receipt') renderRecPage();
    else if (page === 'keuangan') renderKeuangan();
    else if (page === 'budget') { go('keuangan'); setKeuTab('budget', null); return; }
    else if (page === 'goals') { go('keuangan'); setKeuTab('goals', null); return; }
    else if (page === 'bills') { go('keuangan'); setKeuTab('bills', null); return; }
    else if (page === 'piutang') { go('keuangan'); setKeuTab('piutang', null); return; }
    else if (page === 'reports') renderReports();
    else if (page === 'settings') renderSettings();
  });
}
let keuActiveTab = 'budget';
function setKeuTab(tab, btn) {
  keuActiveTab = tab;
  document.querySelectorAll('.keu-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const tabs = document.querySelectorAll('.keu-tab');
    if (tab === 'budget' && tabs[0]) tabs[0].classList.add('active');
    else if (tab === 'goals' && tabs[1]) tabs[1].classList.add('active');
    else if (tab === 'bills' && tabs[2]) tabs[2].classList.add('active');
    else if (tab === 'piutang' && tabs[3]) tabs[3].classList.add('active');
  }
  el('keuPanelBudget').style.display = tab === 'budget' ? '' : 'none';
  el('keuPanelGoals').style.display = tab === 'goals' ? '' : 'none';
  el('keuPanelBills').style.display = tab === 'bills' ? '' : 'none';
  const ptgPanel = el('keuPanelPiutang'); if (ptgPanel) ptgPanel.style.display = tab === 'piutang' ? '' : 'none';
  if (tab === 'budget') renderBudg();
  else if (tab === 'goals') renderGoals();
  else if (tab === 'piutang') { if (typeof renderPiutang === 'function') renderPiutang(); }
  else renderBills();
}
function renderKeuangan() {
  el('keuPanelBudget').style.display = keuActiveTab === 'budget' ? '' : 'none';
  el('keuPanelGoals').style.display = keuActiveTab === 'goals' ? '' : 'none';
  el('keuPanelBills').style.display = keuActiveTab === 'bills' ? '' : 'none';
  const ptgPanel = el('keuPanelPiutang'); if (ptgPanel) ptgPanel.style.display = keuActiveTab === 'piutang' ? '' : 'none';
  document.querySelectorAll('.keu-tab').forEach((b, i) => {
    b.classList.toggle('active',
      (i === 0 && keuActiveTab === 'budget') || (i === 1 && keuActiveTab === 'goals') ||
      (i === 2 && keuActiveTab === 'bills') || (i === 3 && keuActiveTab === 'piutang')
    );
  });
  if (keuActiveTab === 'budget') renderBudg();
  else if (keuActiveTab === 'goals') renderGoals();
  else if (keuActiveTab === 'piutang') { if (typeof renderPiutang === 'function') renderPiutang(); }
  else renderBills();
}
function refresh() { const p = curPage; curPage = ''; go(p); }
async function refreshData(month) { await loadAll(month); refresh(); }

// ── DASHBOARD ──

// ── Toast ──
function toast(msg, type = 'info', dur = 3000) {
  const c = el('toasts');
  const icons = {
    ok: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    err: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };
  const t = document.createElement('div'); t.className = 'toast ' + type;
  t.innerHTML = `<span>${icons[type] || icons.info}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .28s ease forwards'; setTimeout(() => t.parentNode && t.parentNode.removeChild(t), 290); }, dur);
}

// ── FAB BOTTOM SHEET ──
function toggleFab() {
  const menu = el('fabMenu'), btn = el('fabBtn'), bg = el('fabBackdrop');
  if (!menu || !btn) return;
  const isOpen = menu.classList.contains('open');
  if (isOpen) { closeFab(); } else { menu.classList.add('open'); btn.classList.add('open'); if (bg) bg.classList.add('open'); }
}
function closeFab() {
  const menu = el('fabMenu'), btn = el('fabBtn'), bg = el('fabBackdrop');
  if (menu) menu.classList.remove('open');
  if (btn) btn.classList.remove('open');
  if (bg) bg.classList.remove('open');
}

// ── ACCOUNT DETAIL BOTTOM SHEET ──
let accSheetId = null, accSheetTab = 'all', accSheetMon = thisMon();


// ── Profile & Setup ──
function saveProfile(p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }

let setupThemeChoice = 'glass';
function setupPickTheme(theme, btn) {
  setupThemeChoice = theme;
  document.querySelectorAll('.setup-theme-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyTheme(theme, null, false);
}
function showSetupPage() {
  const o = el('setupOverlay'); if (o) o.style.display = 'flex';
  applyTheme('glass', null, false);
}
function hideSetupPage() {
  const o = el('setupOverlay'); if (o) o.style.display = 'none';
}

// ── AUTH PAGE ──
function showAuthPage() {
  const o = el('authOverlay'); if (o) o.style.display = 'flex';
  hideSetupPage();
  switchAuthTab('login');
}
function hideAuthPage() {
  const o = el('authOverlay'); if (o) o.style.display = 'none';
}
function switchAuthTab(tab) {
  const loginForm = el('authLoginForm');
  const registerForm = el('authRegisterForm');
  const loginTab = el('authTabLogin');
  const registerTab = el('authTabRegister');
  if (tab === 'login') {
    if (loginForm) loginForm.style.display = '';
    if (registerForm) registerForm.style.display = 'none';
    if (loginTab) loginTab.classList.add('active');
    if (registerTab) registerTab.classList.remove('active');
  } else {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = '';
    if (loginTab) loginTab.classList.remove('active');
    if (registerTab) registerTab.classList.add('active');
  }
}

async function handleAuthLogin() {
  const email = (el('authLoginEmail')?.value || '').trim();
  const password = el('authLoginPassword')?.value || '';
  if (!email || !password) { toast('Email dan password wajib diisi', 'err'); return; }
  const btn = el('authLoginBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    const data = await apiAuth('POST', '/auth/login', { email, password });
    setToken(data.token);
    const p = { id: data.user.id, name: data.user.name, email: data.user.email, tgId: data.user.telegram_id || '', theme: 'glass' };
    saveProfile(p);
    const s = getSet(); s.name = p.name; sv(K.set, s);
    hideAuthPage();
    updateProfileUI();
    updateSidebarProfile();
    showLoadingOverlay(true);
    try { await loadAll(thisMon()); } finally { showLoadingOverlay(false); }
    go('dashboard');
    refresh();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}

async function handleAuthRegister() {
  const name = (el('authRegisterName')?.value || '').trim();
  const email = (el('authRegisterEmail')?.value || '').trim();
  const password = el('authRegisterPassword')?.value || '';
  const password2 = el('authRegisterPassword2')?.value || '';
  if (!name || !email || !password) { toast('Semua field wajib diisi', 'err'); return; }
  if (password.length < 6) { toast('Password minimal 6 karakter', 'err'); return; }
  if (password !== password2) { toast('Password tidak cocok', 'err'); return; }
  const btn = el('authRegisterBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    const data = await apiAuth('POST', '/auth/register', { email, password, name });
    setToken(data.token);
    const p = { id: data.user.id, name: data.user.name, email: data.user.email, tgId: '', theme: setupThemeChoice || 'glass' };
    saveProfile(p);
    const s = getSet(); s.name = p.name; s.theme = p.theme; sv(K.set, s);
    hideAuthPage();
    applyTheme(p.theme, null, true);
    updateProfileUI();
    updateSidebarProfile();
    showLoadingOverlay(true);
    try { await loadAll(thisMon()); } finally { showLoadingOverlay(false); }
    go('dashboard');
    refresh();
    toast('Akun berhasil dibuat! Selamat datang ' + p.name, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Daftar'; }
  }
}

// Legacy setup (kept for backward compat with existing users without auth)
async function saveSetupProfile() {
  const name = (el('setupName')?.value || '').trim();
  const tgId = (el('setupTgId')?.value || '').trim().replace(/\D/g, '');
  if (!name) { toast('Nama tidak boleh kosong.', 'err'); return; }
  if (!tgId) { toast('Telegram ID tidak boleh kosong.', 'err'); return; }
  const p = { name, tgId, theme: setupThemeChoice || 'glass' };
  saveProfile(p);
  const s = getSet();
  s.name = name;
  s.theme = p.theme;
  sv(K.set, s);
  hideSetupPage();
  applyTheme(p.theme, null, false);
  updateProfileUI();
  updateSidebarProfile();
  showLoadingOverlay(true);
  try {
    await loadAll(thisMon());
  } finally {
    showLoadingOverlay(false);
  }
  go('dashboard');
  refresh();
}
function updateProfileUI() {
  const p = getProfile();
  const noProfile = el('sidebarNoProfile');
  const profileEl = el('sidebarProfile');
  const nameEl = el('sidebarName');
  const avatarEl = el('sidebarAvatar');
  if (!p || (!p.tgId && !p.id && !p.email)) {
    if (noProfile) noProfile.style.display = '';
    if (profileEl) profileEl.style.display = 'none';
  } else {
    if (noProfile) noProfile.style.display = 'none';
    if (profileEl) profileEl.style.display = '';
    if (nameEl) nameEl.textContent = p.name || 'Pengguna';
    if (avatarEl) avatarEl.textContent = (p.name || '?')[0].toUpperCase();
  }
}

// ══════════════════════════════════════════
// LOADING OVERLAY
// ══════════════════════════════════════════
function showLoadingOverlay(show) {
  let el2 = document.getElementById('globalLoadingOverlay');
  if (!el2 && show) {
    el2 = document.createElement('div');
    el2.id = 'globalLoadingOverlay';
    el2.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg,#fff);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:.75rem;transition:opacity .3s';
    el2.innerHTML = `
  <div style="width:36px;height:36px;border:3px solid var(--gs-border,#e2e8f0);border-top-color:var(--accent,#2563eb);border-radius:50%;animation:spin .7s linear infinite"></div>
  <div style="font-size:.8rem;color:var(--ink3,#94a3b8);font-weight:500">Memuat data...</div>`;
    document.body.appendChild(el2);
  }
  if (el2) { el2.style.display = show ? 'flex' : 'none'; }
}

// ── DESKTOP COMPOSE MENU ──
function toggleDeskCompose() {
  const m = document.getElementById('deskComposeMenu');
  if (!m) return;
  const isOpen = m.classList.contains('open');
  if (isOpen) { m.classList.remove('open'); }
  else { m.classList.add('open'); setTimeout(() => document.addEventListener('click', _closeDeskOnce, { once: true }), 10); }
}
function closeDeskCompose() { document.getElementById('deskComposeMenu')?.classList.remove('open'); }
function _closeDeskOnce(e) { if (!e.target.closest('.desk-compose-wrap')) closeDeskCompose(); }

// ── ACCOUNT SCROLL ARROWS ──
function scrollAccs(dir) {
  const el = document.getElementById('accsScroll');
  if (!el) return;
  const cards = el.querySelectorAll('.dc');
  if (!cards.length) return;
  const cw = cards[0].offsetWidth + 16;
  el.scrollBy({ left: dir * cw, behavior: 'smooth' });
}
function scrollEwallets(dir) {
  const el = document.getElementById('ewalletScroll');
  if (!el) return;
  const cards = el.querySelectorAll('.ecard');
  if (!cards.length) return;
  const cw = cards[0].offsetWidth + 12;
  el.scrollBy({ left: dir * cw, behavior: 'smooth' });
}
function updateAccArrows() {
  const el = document.getElementById('accsScroll');
  const l = document.getElementById('accsArrL');
  const r = document.getElementById('accsArrR');
  if (el && l && r) {
    l.disabled = el.scrollLeft <= 4;
    r.disabled = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  }
  const elE = document.getElementById('ewalletScroll');
  const lE = document.getElementById('ewalletArrL');
  const rE = document.getElementById('ewalletArrR');
  if (elE && lE && rE) {
    lE.disabled = elE.scrollLeft <= 4;
    rE.disabled = elE.scrollLeft + elE.clientWidth >= elE.scrollWidth - 4;
  }
}
document.getElementById('accsScroll')?.addEventListener('scroll', updateAccArrows);
document.getElementById('ewalletScroll')?.addEventListener('scroll', updateAccArrows);

// ── SIDEBAR PROFILE CHIP ──
function updateSidebarProfile() {
  const profile = getProfile();
  const el = document.getElementById('sidebarProfile');
  const ava = document.getElementById('sidebarProfileAva');
  const name = document.getElementById('sidebarProfileName');
  if (!el) return;
  if (profile && profile.name) {
    el.style.display = 'flex';
    const savedAvatar = localStorage.getItem('laksa_avatar');
    if (ava) {
      if (savedAvatar) {
        ava.innerHTML = `<img src="${savedAvatar}" alt="Foto profil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
      } else {
        ava.textContent = profile.name.charAt(0).toUpperCase();
      }
    }
    if (name) name.textContent = profile.name;
  } else {
    el.style.display = 'none';
  }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeFab(); closeDeskCompose(); if (aiOpen) toggleAiChat(); if (accSheetId) closeAccSheet(); closeTxSheet(); } });

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  // Tema dari localStorage
  const s = getSet();
  let theme = s.theme || 'glass';
  if (theme !== 'glass' && theme !== 'dark' && theme !== 'education') {
    theme = 'glass';
  }
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  Chart.defaults.color = isDark ? 'rgba(210,220,240,0.7)' : (theme === 'education' ? '#0f172a' : 'rgba(15,23,42,0.55)');
  Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.08)' : (theme === 'education' ? 'rgba(15,23,42,0.15)' : 'rgba(15,23,42,0.08)');

  // Account scroll arrows listener
  const accsEl = document.getElementById('accsScroll');
  if (accsEl) { accsEl.addEventListener('scroll', updateAccArrows, { passive: true }); }

  // Cek auth: token exists = logged in, otherwise show auth page
  const profile = getProfile();
  if (!isLoggedIn()) {
    // No token — show auth page (new users) or legacy setup (existing users without auth)
    if (profile && profile.tgId && !profile.id) {
      // Legacy user: has Telegram ID but no auth — show setup page for backward compat
      showSetupPage();
    } else {
      showAuthPage();
    }
    go('dashboard');
    return;
  }

  // Terapkan tema dari profil
  applyTheme(profile.theme || theme, null, false);
  updateProfileUI();
  updateSidebarProfile();

  // Load data dari D1 — tampilkan skeleton dulu
  go('dashboard');
  showLoadingOverlay(true);
  try {
    await loadAll(thisMon());
  } catch (e) {
    console.error('Init load failed:', e);
  } finally {
    showLoadingOverlay(false);
  }
  refresh();
  // Update arrows after accounts render
  setTimeout(updateAccArrows, 300);
});
