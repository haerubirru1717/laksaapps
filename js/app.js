// ══════════════════════════════════════
// app.js — Laksa Core Application
// Constants, State, API, Helpers, Theme, Navigation, Init
// ══════════════════════════════════════

// ── UUID POLYFILL (older browsers / non-HTTPS) ──
function genUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── CONSTANTS ──
const PROFILE_KEY = 'laksa_profile';
const K = { tx: 'ft_tx', bud: 'ft_bud', goals: 'ft_goals', accs: 'ft_acc', cats: 'ft_cats', set: 'ft_set', rec: 'ft_rec' };
const COLORS = ['#ff4d1c', '#00a878', '#1c3fff', '#d4920a', '#6b4fff', '#e63c1e', '#00c4a0', '#e8a020', '#2dd4bf'];
const DEF_CATS = [
  // Expense
  { id: 'c1',  name: 'Makanan & Minuman', type: 'expense' },
  { id: 'c2',  name: 'Transportasi',      type: 'expense' },
  { id: 'c3',  name: 'Belanja',           type: 'expense' },
  { id: 'c4',  name: 'Tagihan',           type: 'expense' },
  { id: 'c5',  name: 'Hiburan',           type: 'expense' },
  { id: 'c6',  name: 'Kesehatan',         type: 'expense' },
  { id: 'c7',  name: 'Pendidikan',        type: 'expense' },
  { id: 'c13', name: 'Rumah Tangga',      type: 'expense' },
  { id: 'c14', name: 'Perawatan Diri',    type: 'expense' },
  { id: 'c15', name: 'Pajak',             type: 'expense' },
  { id: 'c16', name: 'Cicilan',           type: 'expense' },
  { id: 'c17', name: 'Sosial',            type: 'expense' },
  // Income
  { id: 'c8',  name: 'Gaji',              type: 'income' },
  { id: 'c9',  name: 'Freelance',         type: 'income' },
  { id: 'c10', name: 'Investasi',         type: 'income' },
  { id: 'c11', name: 'Hadiah',            type: 'income' },
  { id: 'c18', name: 'Bonus',             type: 'income' },
  { id: 'c19', name: 'Penjualan',         type: 'income' },
  { id: 'c20', name: 'Refund',            type: 'income' },
  // Both
  { id: 'c21', name: 'Tabungan',          type: 'both' },
  { id: 'c22', name: 'Pemasukan Lainnya', type: 'income' },
  { id: 'c23', name: 'Pengeluaran Lainnya', type: 'expense' },
];
const DEF_ACCS = [{ id: 'a1', name: 'Dompet Tunai', balance: 0, color: '#fbbf24' }, { id: 'a2', name: 'Bank Mandiri', balance: 0, color: '#E6B800' }];
const DEF_SET = { name: 'Pengguna', currency: 'Rp', theme: 'warm' };
// BANKS, SVG_FILES, detBank, getLogoHtml → dipindahkan ke banks.js

function getCatSvgFile(catName, catType) {
  const n = (catName || '').toLowerCase();
  if (n.includes('makan') || n.includes('minum') || n.includes('kopi') || n.includes('cafe') || n.includes('restoran') || n.includes('kuliner') || n.includes('warung') || n.includes('bakso')) return 'icon-makanan';
  if (n.includes('belanja') || n.includes('mall') || n.includes('shopee') || n.includes('tokopedia') || n.includes('pasar') || n.includes('supermarket') || n.includes('indomaret') || n.includes('alfamart')) return 'icon-belanja';
  if (n.includes('transport') || n.includes('ojek') || n.includes('grab') || n.includes('gojek') || n.includes('mobil') || n.includes('motor') || n.includes('bensin') || n.includes('parkir') || n.includes('tol') || n.includes('tiket')) return 'icon-transportasi';
  if (n.includes('listrik') || n.includes('tagihan') || n.includes('utilitas') || n.includes('air') || n.includes('internet') || n.includes('pulsa') || n.includes('token') || n.includes('wifi')) return 'icon-tagihan';
  if (n.includes('hiburan') || n.includes('game') || n.includes('nonton') || n.includes('bioskop') || n.includes('liburan') || n.includes('wisata') || n.includes('travel')) return 'icon-hiburan';
  if (n.includes('sehat') || n.includes('obat') || n.includes('klinik') || n.includes('sakit') || n.includes('dokter') || n.includes('apotek') || n.includes('medis')) return 'icon-kesehatan';
  if (n.includes('pendidikan') || n.includes('buku') || n.includes('kuliah') || n.includes('sekolah') || n.includes('kursus')) return 'icon-pendidikan';
  if (n.includes('perawatan') || n.includes('kecantikan') || n.includes('salon') || n.includes('spa') || n.includes('skincare')) return 'icon-perawatan-diri';
  if (n.includes('rumah') || n.includes('tangga') || n.includes('renovasi') || n.includes('furniture') || n.includes('peralatan')) return 'icon-rumah-tangga';
  if (n.includes('pajak') || n.includes('denda')) return 'icon-pajak';
  if (n.includes('cicilan') || n.includes('kredit') || n.includes('hutang') || n.includes('angsuran')) return 'icon-cicilan';
  if (n.includes('sosial') || n.includes('donasi') || n.includes('zakat') || n.includes('sedekah') || n.includes('infaq') || n.includes('amal')) return 'icon-sosial';
  if (n.includes('tabungan') || n.includes('menabung') || n.includes('saving')) return 'icon-tabungan';
  if (n.includes('gaji') || n.includes('salary')) return 'icon-gaji';
  if (n.includes('freelance')) return 'icon-freelance';
  if (n.includes('bonus')) return 'icon-bonus';
  if (n.includes('investasi') || n.includes('saham') || n.includes('dividen') || n.includes('reksadana')) return 'icon-investasi';
  if (n.includes('hadiah') || n.includes('gift')) return 'icon-hadiah';
  if (n.includes('penjualan') || n.includes('jual')) return 'icon-penjualan';
  if (n.includes('refund') || n.includes('pengembalian') || n.includes('cashback')) return 'icon-refund';
  if (catType === 'transfer' || n.includes('transfer') || n.includes('kirim') || n.includes('pindah')) return 'icon-transfer';
  return catType === 'income' ? 'icon-pemasukan-lain' : 'icon-pengeluaran-lain';
}
const getCatIcon = (id) => {
  const c = typeof getCats === 'function' ? getCats().find(x => x.id === id) : null;
  const name = c ? c.name : '';
  const type = c ? c.type : 'expense';
  const file = getCatSvgFile(name, type);
  return `<img src="/icons/${file}.svg" class="cat-icon-sm" width="20" height="20" alt="">`;
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
// CLOUD_URL & GOOGLE_CLIENT_ID didefinisikan secara global di js/config.js

// In-memory cache — di-refresh setiap load halaman
let _cache = { tx: null, accs: null, cats: null, buds: null, goals: null, bills: null, piutang: null, loading: false };

// ── AUTH TOKEN MANAGEMENT ──
const TOKEN_KEY = 'laksa_token';
let isDemoMode = false;
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }
function isLoggedIn() { return isDemoMode || !!getToken(); }

function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch { return null; } }
function getUserId() {
  // For backward compat: if token exists, user_id is in JWT (server extracts it)
  // If no token but profile has tgId, use that as fallback
  return getProfile()?.id || getProfile()?.tgId || null;
}

// Helper to generate mock transactions dynamically based on month/year param
function getMockTransactions(monthParam) {
  let targetYear = 2026;
  let targetMonth = 7;
  let isYearOnly = false;
  
  const today = new Date();
  targetYear = today.getFullYear();
  targetMonth = today.getMonth() + 1;

  if (monthParam) {
    const parts = monthParam.split('-');
    if (parts.length === 2) {
      targetYear = parseInt(parts[0]);
      targetMonth = parseInt(parts[1]);
    } else if (parts.length === 1 && parts[0].length === 4) {
      targetYear = parseInt(parts[0]);
      isYearOnly = true;
    }
  }

  const pad = (n) => String(n).padStart(2, '0');

  if (isYearOnly) {
    const list = [];
    for (let m = 1; m <= 12; m++) {
      list.push({
        id: `tx_gaji_${targetYear}_${m}`,
        date: `${targetYear}-${pad(m)}-01`,
        type: "income",
        amount: 15000000,
        note: "Gaji Bulanan",
        account_id: "id_vnxvbfvkem",
        account_name: "Mandiri",
        category_id: "c8",
        category_name: "Gaji",
        category_emoji: "💼"
      });
      list.push({
        id: `tx_food1_${targetYear}_${m}`,
        date: `${targetYear}-${pad(m)}-05`,
        type: "expense",
        amount: 1200000 + (m * 50000),
        note: "Makan bulanan",
        account_id: "id_0u46oo61br6",
        account_name: "Dana",
        category_id: "c1",
        category_name: "Makanan & Minuman",
        category_emoji: "🍜"
      });
      list.push({
        id: `tx_bill_${targetYear}_${m}`,
        date: `${targetYear}-${pad(m)}-10`,
        type: "expense",
        amount: 500000 + (m * 10000),
        note: "Listrik & Internet",
        account_id: "id_vnxvbfvkem",
        account_name: "Mandiri",
        category_id: "c6",
        category_name: "Tagihan",
        category_emoji: "💡"
      });
      list.push({
        id: `tx_shop_${targetYear}_${m}`,
        date: `${targetYear}-${pad(m)}-15`,
        type: "expense",
        amount: 800000 + (m * 20000),
        note: "Belanja bulanan",
        account_id: "id_fb80ye2m8uc",
        account_name: "Bca",
        category_id: "c3",
        category_name: "Belanja",
        category_emoji: "🛍️"
      });
    }
    return list;
  } else {
    return [
      {
        id: "tx_1",
        date: `${targetYear}-${pad(targetMonth)}-01`,
        type: "income",
        amount: 15000000,
        note: "Gaji Bulanan",
        account_id: "id_vnxvbfvkem",
        account_name: "Mandiri",
        category_id: "c8",
        category_name: "Gaji",
        category_emoji: "💼"
      },
      {
        id: "tx_2",
        date: `${targetYear}-${pad(targetMonth)}-02`,
        type: "expense",
        amount: 500000,
        note: "Biaya Kuliah (UKT)",
        account_id: "id_vnxvbfvkem",
        account_name: "Mandiri",
        category_id: "c7",
        category_name: "Pendidikan",
        category_emoji: "📚"
      },
      {
        id: "tx_3",
        date: `${targetYear}-${pad(targetMonth)}-03`,
        type: "expense",
        amount: 496512,
        note: "Tagihan Air PDAM",
        account_id: "id_aimdbhrjt7m",
        account_name: "Jago",
        category_id: "c6",
        category_name: "Tagihan",
        category_emoji: "💡"
      },
      {
        id: "tx_4",
        date: `${targetYear}-${pad(targetMonth)}-04`,
        type: "income",
        amount: 5088447,
        note: "Freelance Desain Logo",
        account_id: "id_ox3woi16iw",
        account_name: "mnc bank",
        category_id: "id_ghvsj3p69s5",
        category_name: "Freelance",
        category_emoji: "🏷️"
      },
      {
        id: "tx_5",
        date: `${targetYear}-${pad(targetMonth)}-05`,
        type: "expense",
        amount: 109135,
        note: "Jajan Bubble Tea",
        account_id: "id_ckm90i7olb",
        account_name: "Shopeepay",
        category_id: "c1",
        category_name: "Makanan & Minuman",
        category_emoji: "🍜"
      },
      {
        id: "tx_6",
        date: `${targetYear}-${pad(targetMonth)}-06`,
        type: "expense",
        amount: 50000,
        note: "Pembelian Obat Apotek",
        account_id: "id_ox3woi16iw",
        account_name: "mnc bank",
        category_id: "c4",
        category_name: "Kesehatan",
        category_emoji: "🏥"
      },
      {
        id: "tx_7",
        date: `${targetYear}-${pad(targetMonth)}-06`,
        type: "income",
        amount: 50000,
        note: "Pelunasan Piutang Andi",
        account_id: "id_0u46oo61br6",
        account_name: "Dana",
        category_id: "c8",
        category_name: "Gaji",
        category_emoji: "💼"
      },
      {
        id: "tx_8",
        date: `${targetYear}-${pad(targetMonth)}-07`,
        type: "income",
        amount: 10035019,
        note: "Hasil Jual Barang Bekas",
        account_id: "id_0u46oo61br6",
        account_name: "Dana",
        category_id: "c8",
        category_name: "Gaji",
        category_emoji: "💼"
      }
    ];
  }
}

async function api(method, path, body) {
  if (isDemoMode) {
    if (path.startsWith('/transactions')) {
      const urlParams = new URLSearchParams(path.split('?')[1] || '');
      const monthParam = urlParams.get('month');
      return getMockTransactions(monthParam);
    }
    if (path === '/accounts') {
      return [
        { id: "id_ox3woi16iw", name: "mnc bank", balance: 33734513, color: "#003087", created_at: "2026-06-24 00:18:53" },
        { id: "id_vnxvbfvkem", name: "Mandiri", balance: 51154734, color: "#003d77", created_at: "2026-06-24 00:19:01" },
        { id: "id_fb80ye2m8uc", name: "Bca", balance: 36036724, color: "#0060af", created_at: "2026-06-24 00:44:59" },
        { id: "id_0u46oo61br6", name: "Dana", balance: 55835210, color: "#118EEA", created_at: "2026-06-24 00:56:00" },
        { id: "id_ckm90i7olb", name: "Shopeepay", balance: 45256365, color: "#EE4D2D", created_at: "2026-06-24 00:57:21" },
        { id: "id_j0qxok60y7r", name: "Ovo", balance: 48532209, color: "#6231A0", created_at: "2026-06-24 01:01:54" },
        { id: "id_aimdbhrjt7m", name: "Jago", balance: 37853427, color: "#F05A28", created_at: "2026-06-24 01:07:45" },
        { id: "id_ss36cq7jdu8", name: "Tunai", balance: 43791637, color: "#7c5a43", created_at: "2026-06-24 01:26:41" }
      ];
    }
    if (path === '/categories') {
      return [
        { id: "c1", name: "Makanan & Minuman", emoji: "🍜", type: "expense" },
        { id: "c2", name: "Transportasi", emoji: "🚗", type: "expense" },
        { id: "c3", name: "Belanja", emoji: "🛍️", type: "expense" },
        { id: "c4", name: "Kesehatan", emoji: "🏥", type: "expense" },
        { id: "c5", name: "Hiburan", emoji: "🎮", type: "expense" },
        { id: "c6", name: "Tagihan", emoji: "💡", type: "expense" },
        { id: "c7", name: "Pendidikan", emoji: "📚", type: "expense" },
        { id: "c8", name: "Gaji", emoji: "💼", type: "income" },
        { id: "c9", name: "Investasi", emoji: "📈", type: "income" },
        { id: "id_ghvsj3p69s5", name: "Freelance", emoji: "🏷️", type: "income" }
      ];
    }
    if (path === '/budgets') {
      return [
        { id: "id_ffaonmousgg", category_id: "c1", limit_amount: 5000000, category_name: "Makanan & Minuman", category_emoji: "🍜" },
        { id: "id_90ute8u7wof", category_id: "c2", limit_amount: 1000000, category_name: "Transportasi", category_emoji: "🚗" }
      ];
    }
    if (path === '/goals') {
      return [
        { id: "id_nt17n2uzod", name: "DP RUMAH", target: 100000000, current: 45000000, deadline: "2026-12-31", icon: "target" }
      ];
    }
    if (path === '/bills') {
      return [
        { id: "id_f2q3nlf74ju", name: "MNC Bank", amount: 481167, due_date: "2026-07-04", status: "unpaid" },
        { id: "id_tj82cv3yhpk", name: "Jenius", amount: 712336, due_date: "2026-07-08", status: "unpaid" },
        { id: "id_aumwty7b86s", name: "BNI", amount: 1234496, due_date: "2026-07-11", status: "unpaid" }
      ];
    }
    if (path === '/piutang') {
      return [
        { id: "p1", name: "Andi", amount: 250000, returned: 50000, status: "active", due_date: "2026-07-10" },
        { id: "p2", name: "Budi", amount: 100000, returned: 100000, status: "paid", due_date: "2026-06-25" }
      ];
    }
    if (path === '/usage/status') {
      return { plan: "premium", features: {} };
    }
    return { success: true, message: "Aksi disimulasikan dalam Mode Demo" };
  }

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

async function showUpgradeModal(message) {
  if (document.getElementById('upgrade-modal')) return;
  const profile = getProfile();
  const emailText = profile?.email || '-';

  // Fetch pricing data
  let pricingData = { pricing: [], qris_url: null };
  try {
    const resp = await fetch(`${CLOUD_URL}/pricing/public`);
    if (resp.ok) pricingData = await resp.json();
  } catch (_) {}

  const pricing = pricingData.pricing.filter(p => p.price > 0);
  const qrisUrl = pricingData.qris_url;

  // Build pricing options with strikethrough
  let pricingHtml = '';
  if (pricing.length > 0) {
    pricingHtml = `<div class="upgrade-pricing">
      <p class="pricing-label">Pilih paket:</p>
      ${pricing.map((p, i) => {
        const hasOriginal = p.original_price && p.original_price > p.price;
        const priceDisplay = hasOriginal
          ? `<span class="pricing-original">Rp ${p.original_price.toLocaleString('id-ID')}</span> <span class="pricing-discounted">Rp ${p.price.toLocaleString('id-ID')}</span>`
          : `Rp ${p.price.toLocaleString('id-ID')}`;
        return `
        <label class="pricing-option${i === 0 ? ' selected' : ''}">
          <input type="radio" name="upgrade-plan" value="${p.id}" data-label="${p.label}" data-price="${p.price}" data-days="${p.duration_days}" data-original="${p.original_price || ''}" ${i === 0 ? 'checked' : ''}>
          <span class="pricing-name">${p.label}</span>
          <span class="pricing-price">${priceDisplay}</span>
        </label>`;
      }).join('')}
    </div>
    <div class="coupon-section">
      <div class="coupon-input-row">
        <input type="text" id="couponInput" class="coupon-input" placeholder="Kode kupon (opsional)" maxlength="20" autocapitalize="characters">
        <button class="coupon-btn" id="couponApplyBtn" onclick="applyCoupon()">Pakai</button>
      </div>
      <div id="couponStatus" class="coupon-status" style="display:none"></div>
    </div>`;
  } else {
    pricingHtml = `<div class="upgrade-pricing"><p class="pricing-label" style="text-align:center;opacity:0.7">Harga belum diatur oleh admin.</p></div>`;
  }

  // Build QRIS section
  let qrisHtml = '';
  if (qrisUrl) {
    qrisHtml = `<div class="upgrade-qris"><img src="${qrisUrl}" alt="QRIS" class="qris-image"></div>`;
  } else {
    qrisHtml = `<div class="upgrade-qris"><p class="qris-placeholder">QRIS belum tersedia</p></div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'upgrade-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box upgrade-box">
      <div class="upgrade-icon">&#9889;</div>
      <h3>Upgrade ke Premium</h3>
      <p class="upgrade-msg">${esc(message) || 'Upgrade untuk akses unlimited semua fitur.'}</p>
      ${pricingHtml}
      ${qrisHtml}
      <div class="upgrade-contact">
        <p>Silakan hubungi admin jika sudah melakukan pembayaran.</p>
        <p>Sebutkan email akun kamu:</p>
        <div class="upgrade-email">${emailText}</div>
      </div>
      <div class="upgrade-actions">
        <button class="btn-upgrade-contact" id="btnUpgradeWA">Hubungi Admin</button>
        <button class="btn-upgrade-close" onclick="closeUpgradeModal()">Nanti Saja</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  // Pricing option selection
  overlay.querySelectorAll('.pricing-option').forEach(opt => {
    opt.addEventListener('click', () => {
      overlay.querySelectorAll('.pricing-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
    });
  });

  // Hubungi Admin button with pre-filled WA message
  const btnWA = overlay.querySelector('#btnUpgradeWA');
  btnWA.addEventListener('click', async () => {
    const selected = overlay.querySelector('input[name="upgrade-plan"]:checked');
    let paketText = 'Premium';
    let pricingId = null;
    if (selected) {
      paketText = `${selected.dataset.label} (Rp ${parseInt(selected.dataset.price).toLocaleString('id-ID')})`;
      pricingId = selected.value;
    }
    const couponCode = window._appliedCoupon?.code || '';
    const couponDiscount = window._appliedCoupon?.discount_amount || 0;
    // Record payment request
    if (pricingId) {
      try { await api('POST', '/payment/request', { pricing_id: pricingId, coupon_code: couponCode }); } catch (_) {}
    }
    let waLines = `Halo Admin, saya ingin upgrade Laksa Premium.\n\nEmail: ${emailText}\nPaket: ${paketText}`;
    if (couponCode) waLines += `\nKupon: ${couponCode} (potongan Rp ${couponDiscount.toLocaleString('id-ID')})`;
    waLines += `\n\nSudah melakukan pembayaran via QRIS.`;
    const waMsg = encodeURIComponent(waLines);
    window.open(`https://wa.me/6287785067348?text=${waMsg}`, '_blank');
  });
}

function updatePricingPrices() {
  const options = document.querySelectorAll('#upgrade-modal .pricing-option');
  options.forEach(opt => {
    const input = opt.querySelector('input[name="upgrade-plan"]');
    if (!input) return;
    const basePrice = parseFloat(input.dataset.price) || 0;
    const priceSpan = opt.querySelector('.pricing-price');
    if (!priceSpan) return;

    if (window._appliedCoupon) {
      let discount = 0;
      if (window._appliedCoupon.type === 'percent') {
        discount = basePrice * (parseFloat(window._appliedCoupon.value) / 100);
      } else if (window._appliedCoupon.type === 'fixed') {
        discount = parseFloat(window._appliedCoupon.value);
      }
      const finalPrice = Math.max(0, basePrice - discount);
      priceSpan.innerHTML = `
        <span class="pricing-original" style="text-decoration: line-through; color: #ef4444; font-size: 0.8rem; margin-right: 0.4rem; font-weight: normal;">Rp ${basePrice.toLocaleString('id-ID')}</span>
        <span class="pricing-discounted" style="font-weight: 700; color: var(--accent);">Rp ${finalPrice.toLocaleString('id-ID')}</span>
      `;
    } else {
      // Restore default price display
      const hasOriginal = input.dataset.original && parseFloat(input.dataset.original) > basePrice;
      if (hasOriginal) {
        const orig = parseFloat(input.dataset.original);
        priceSpan.innerHTML = `
          <span class="pricing-original">Rp ${orig.toLocaleString('id-ID')}</span>
          <span class="pricing-discounted">Rp ${basePrice.toLocaleString('id-ID')}</span>
        `;
      } else {
        priceSpan.innerHTML = `Rp ${basePrice.toLocaleString('id-ID')}`;
      }
    }
  });
}

// Bug #1 fix: _appliedCoupon dikelola via window._appliedCoupon di seluruh fungsi (applyCoupon, updatePricingPrices, closeUpgradeModal)
async function applyCoupon() {
  const input = document.getElementById('couponInput');
  const status = document.getElementById('couponStatus');
  const code = (input?.value || '').trim().toUpperCase();
  if (!code) { if (status) { status.textContent = 'Masukkan kode kupon'; status.className = 'coupon-status error'; status.style.display = 'block'; } return; }
  const selected = document.querySelector('input[name="upgrade-plan"]:checked');
  const pricingId = selected?.value || '';
  const btn = document.getElementById('couponApplyBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const resp = await api('POST', '/coupon/validate', { code, pricing_id: pricingId });
    window._appliedCoupon = { code: resp.code, type: resp.type, value: resp.value, discount_amount: resp.discount_amount };
    if (status) {
      const discText = resp.type === 'percent' ? `${resp.value}%` : `Rp ${resp.value.toLocaleString('id-ID')}`;
      status.innerHTML = `<span class="coupon-ok">✓ Kupon <b>${resp.code}</b> aktif — diskon ${discText}${resp.discount_amount ? ` (hemat Rp ${resp.discount_amount.toLocaleString('id-ID')})` : ''}</span>`;
      status.className = 'coupon-status success';
      status.style.display = 'block';
    }
    updatePricingPrices();
  } catch (e) {
    window._appliedCoupon = null;
    if (status) { status.textContent = e.message || 'Kupon tidak valid'; status.className = 'coupon-status error'; status.style.display = 'block'; }
    updatePricingPrices();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Pakai'; }
  }
}

function closeUpgradeModal() {
  window._appliedCoupon = null;
  const m = document.getElementById('upgrade-modal');
  if (m) { m.classList.remove('show'); setTimeout(() => m.remove(), 300); }
}

// ── Transactions ──
async function fetchTx(month) {
  const url = (month && month !== 'all') ? `/transactions?month=${month}&limit=500` : `/transactions?limit=500`;
  const data = await api('GET', url);
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
    if (!uid) { _cache.loading = false; return; } // Bug #6 fix: reset flag agar loadAll bisa dipanggil ulang
    const targetMonth = month === thisMon() ? 'all' : month;
    await Promise.all([fetchTx(targetMonth), fetchAccs(), fetchCats(), fetchBuds(), fetchGoals(), fetchBills(), fetchPiutang(), fetchUsageStatus()]);
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
  const isHidden = localStorage.getItem('laksa_bal_hidden') === 'true';
  if (isHidden && obj.id === 'totalBal') {
    const cfg = getSet();
    obj.innerHTML = `<span class="bal-curr">${cfg.currency}</span> <span class="bal-masked">••••••</span>`;
    return;
  }

  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * easeOut;
    
    if (obj.id === 'totalBal') {
      const cfg = getSet();
      const val = current || 0;
      const neg = val < 0;
      const pfx = neg ? '−' : '';
      const abs = Math.abs(val);
      const isRp = cfg.currency === 'Rp';
      const locale = isRp ? 'id-ID' : 'en-US';
      const sep = isRp ? ',' : '.';
      const integerPart = Math.floor(abs).toLocaleString(locale);
      const decimalPart = (abs % 1).toFixed(2).slice(2);
      obj.innerHTML = `<span class="bal-pfx">${pfx}</span><span class="bal-curr">${cfg.currency}</span> <span class="bal-int">${integerPart}</span><span class="bal-dec">${sep}${decimalPart}</span>`;
    } else {
      obj.textContent = fCur(current);
    }

    if (progress < 1) window.requestAnimationFrame(step);
    else {
      if (obj.id === 'totalBal') {
        const cfg = getSet();
        const val = end || 0;
        const neg = val < 0;
        const pfx = neg ? '−' : '';
        const abs = Math.abs(val);
        const isRp = cfg.currency === 'Rp';
        const locale = isRp ? 'id-ID' : 'en-US';
        const sep = isRp ? ',' : '.';
        const integerPart = Math.floor(abs).toLocaleString(locale);
        const decimalPart = (abs % 1).toFixed(2).slice(2);
        obj.innerHTML = `<span class="bal-pfx">${pfx}</span><span class="bal-curr">${cfg.currency}</span> <span class="bal-int">${integerPart}</span><span class="bal-dec">${sep}${decimalPart}</span>`;
      } else {
        obj.textContent = fCur(end);
      }
    }
  };
  window.requestAnimationFrame(step);
}

// ── Helpers (sinkron, dari cache) ──
const catBy = (id) => getCats().find(c => c.id === id) || { name: 'Pengeluaran Lainnya', id: '?' };
const accBy = (id) => getAccs().find(a => a.id === id) || { name: '-', id: '?' };

// ── HELPERS ──
const fCur = (a, sign = false, short = false) => {
  const cfg = getSet(), val = a || 0, abs = Math.abs(val);
  const neg = val < 0;
  const signStr = neg ? '−' : (sign && val > 0 ? '+' : '');
  if (short) {
    if (abs >= 1e12) return signStr + cfg.currency + ' ' + (abs / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (abs >= 1e9) return signStr + cfg.currency + ' ' + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e6) return signStr + cfg.currency + ' ' + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'jt';
    if (abs >= 1e3) return signStr + cfg.currency + ' ' + (abs / 1e3).toFixed(0) + 'rb';
    return signStr + cfg.currency + ' ' + abs.toLocaleString('id-ID');
  }
  return signStr + cfg.currency + ' ' + abs.toLocaleString('id-ID');
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
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = isDark ? 'rgba(210,220,240,0.7)' : (theme === 'education' ? '#0f172a' : 'rgba(15,23,42,0.55)');
    Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.08)' : (theme === 'education' ? 'rgba(15,23,42,0.15)' : 'rgba(15,23,42,0.08)');
  }
  if (curPage === 'dashboard') renderDash();
  if (curPage === 'reports') renderReports();
  if (curPage === 'transactions') filterTx();
}

// ── DEMO MODE RESTRICTIONS ──
function applyDemoModeRestrictions() {
  if (!isDemoMode) return;

  // 1. Override global actions to prevent execution and show friendly toast
  window.logoutAkun = (e) => {
    if (e) e.stopPropagation();
    toast('Aksi dibatasi: Silakan daftar akun baru gratis untuk mulai menggunakan fitur secara penuh!', 'info');
  };
  window.resetAll = () => {
    toast('Aksi dibatasi: Silakan daftar akun baru gratis untuk mulai menggunakan fitur secara penuh!', 'info');
  };
  window.showDeleteAccountConfirm = () => {
    toast('Aksi dibatasi: Silakan daftar akun baru gratis untuk mulai menggunakan fitur secara penuh!', 'info');
  };
  window.expCSV = () => {
    toast('Fitur dinonaktifkan: Silakan daftar akun baru gratis untuk mulai menggunakan fitur secara penuh!', 'info');
  };
  window.doBackup = () => {
    toast('Fitur dinonaktifkan: Silakan daftar akun baru gratis untuk mulai menggunakan fitur secara penuh!', 'info');
  };
  window.doRestore = () => {
    toast('Fitur dinonaktifkan: Silakan daftar akun baru gratis untuk mulai menggunakan fitur secara penuh!', 'info');
  };

  // 2. Add visual styling to look disabled
  const selectorsToDisable = [
    '.sett-btn-logout',
    'button[onclick*="resetAll"]',
    'button[onclick*="showDeleteAccountConfirm"]',
    'div[onclick*="expCSV"]',
    'div[onclick*="doBackup"]',
    'div[onclick*="restoreF"]',
    '.sidebar-profile'
  ];

  selectorsToDisable.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
      el.style.pointerEvents = 'none';
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
        el.disabled = true;
      }
    });
  });
}


// ── NAVIGATION (Hash-Based Routing) ──
function updateUrlAndTitle(page, tab = null, push = true) {
  let hash = '#/dashboard';
  let title = 'Dashboard — Laksa';

  if (page === '404') {
    hash = window.location.hash || '#/404';
    title = 'Halaman Tidak Ditemukan — Laksa';
  } else if (page === 'login') {
    hash = '#/login';
    title = 'Masuk — Laksa';
  } else if (page === 'register') {
    hash = '#/register';
    title = 'Daftar Akun Baru — Laksa';
  } else if (page === 'keuangan') {
    const activeTab = tab || keuActiveTab || 'budget';
    if (activeTab === 'budget') {
      hash = '#/keuangan/budget';
      title = 'Anggaran — Laksa';
    } else if (activeTab === 'goals') {
      hash = '#/keuangan/goals';
      title = 'Target — Laksa';
    } else if (activeTab === 'bills') {
      hash = '#/keuangan/bills';
      title = 'Tagihan — Laksa';
    } else if (activeTab === 'piutang') {
      hash = '#/keuangan/piutang';
      title = 'Piutang — Laksa';
    }
  } else {
    if (page === 'dashboard') {
      hash = '#/dashboard';
      title = 'Dashboard — Laksa';
    } else if (page === 'transactions') {
      hash = '#/transactions';
      title = 'Transaksi — Laksa';
    } else if (page === 'receipt') {
      hash = '#/receipt';
      title = 'Scan Struk — Laksa';
    } else if (page === 'reports') {
      hash = '#/reports';
      title = 'Laporan — Laksa';
    } else if (page === 'settings') {
      hash = '#/settings';
      title = 'Pengaturan — Laksa';
    }
  }

  document.title = title;

  if (push && window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

function parseUrlAndRoute() {
  // Read the current hash, stripping the leading '#'
  const hash = (window.location.hash || '').replace(/^#/, '') || '/';

  // 1. Handle public routes first
  if (hash === '/' || hash === '') {
    if (isLoggedIn()) {
      go('dashboard');
    } else {
      go('login');
    }
  } else if (hash === '/login') {
    go('login');
  } else if (hash === '/register') {
    go('register');
  } else {
    // 2. Handle private routes (login required)
    if (!isLoggedIn()) {
      const profile = getProfile();
      if (profile && profile.tgId && !profile.id) {
        showSetupPage();
      } else {
        go('login');
      }
      return;
    }

    if (hash === '/dashboard') {
      go('dashboard');
    } else if (hash === '/transactions') {
      go('transactions');
    } else if (hash === '/receipt') {
      go('receipt');
    } else if (hash === '/reports') {
      go('reports');
    } else if (hash === '/settings') {
      go('settings');
    } else if (hash === '/keuangan' || hash === '/keuangan/') {
      go('keuangan');
    } else if (hash === '/keuangan/budget') {
      go('keuangan');
      setKeuTab('budget', null, false);
    } else if (hash === '/keuangan/goals') {
      go('keuangan');
      setKeuTab('goals', null, false);
    } else if (hash === '/keuangan/bills') {
      go('keuangan');
      setKeuTab('bills', null, false);
    } else if (hash === '/keuangan/piutang') {
      go('keuangan');
      setKeuTab('piutang', null, false);
    } else {
      go('404');
    }
  }
}

// Listen for hash changes (browser Back/Forward buttons or direct hash edits)
window.addEventListener('hashchange', () => {
  parseUrlAndRoute();
});

function go(page, push = true) {
  // 1. Handle landing redirect — go back to the landing page (index.html)
  if (page === 'landing') {
    window.location.href = '/';
    return;
  }

  // 2. Handle auth routing specifically
  if (page === 'login' || page === 'register') {
    if (isLoggedIn()) {
      go('dashboard', push);
      return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.body.classList.add('is-landing-page');
    curPage = page;
    
    showAuthPage();
    switchAuthTab(page);
    updateUrlAndTitle(page, null, push);
    return;
  }

  // 3. Auth guard for all private pages
  if (!isLoggedIn() && page !== '404') {
    const profile = getProfile();
    if (profile && profile.tgId && !profile.id) {
      showSetupPage();
    } else {
      go('login', push);
    }
    return;
  }

  // 4. Reset landing page body classes and modal states for normal routing
  if (page !== 'login' && page !== 'register') {
    hideAuthPage();
  }

  document.body.classList.remove('is-landing-page');

  // Bug #3 fix: handle alias pages SEBELUM DOM manipulation agar tidak ada flash blank screen
  if (page === 'budget')  { if (curPage !== 'keuangan') go('keuangan', false); setKeuTab('budget', null, push);  return; }
  if (page === 'goals')   { if (curPage !== 'keuangan') go('keuangan', false); setKeuTab('goals', null, push);   return; }
  if (page === 'bills')   { if (curPage !== 'keuangan') go('keuangan', false); setKeuTab('bills', null, push);   return; }
  if (page === 'piutang') { if (curPage !== 'keuangan') go('keuangan', false); setKeuTab('piutang', null, push); return; }

  if (page === '404') {
    document.body.classList.add('is-404-page');
  } else {
    document.body.classList.remove('is-404-page');
  }

  if (curPage === page) {
    updateUrlAndTitle(page, null, push);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item,.bnav-item').forEach(n => n.classList.remove('active'));
  const pg = el('page-' + page); if (pg) pg.classList.add('active');
  document.querySelectorAll('[data-page="' + page + '"]').forEach(n => n.classList.add('active'));
  curPage = page;
  
  window.scrollTo(0, 0);
  updateUrlAndTitle(page, null, push);

  requestAnimationFrame(() => {
    if (page === 'dashboard') renderDash();
    else if (page === 'transactions') renderTxPage();
    else if (page === 'receipt') renderRecPage();
    else if (page === 'keuangan') renderKeuangan();
    else if (page === 'reports') renderReports();
    else if (page === 'settings') renderSettings();

    if (isDemoMode) {
      setTimeout(applyDemoModeRestrictions, 50);
    }
  });
}
let keuActiveTab = 'budget';
function setKeuTab(tab, btn, push = true) {
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
  
  updateUrlAndTitle('keuangan', tab, push);
  
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
  // Translate authentication errors to registration invitation
  if (msg && (msg.includes('Autentikasi diperlukan') || msg.includes('Sesi expired') || msg.includes('login kembali'))) {
    msg = 'Silakan daftar akun baru gratis untuk mulai mencatat keuangan secara personal & sinkronisasi Cloud!';
    type = 'info';
  }
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
  document.body.classList.add('is-auth-page');
  const o = el('setupOverlay'); if (o) o.style.display = 'flex';
  applyTheme('glass', null, false);
}
function hideSetupPage() {
  const authVis = el('authOverlay') && el('authOverlay').style.display === 'flex';
  if (!authVis) {
    document.body.classList.remove('is-auth-page');
  }
  const o = el('setupOverlay'); if (o) o.style.display = 'none';
}

// ── AUTH PAGE ──
function showAuthPage() {
  document.body.classList.add('is-auth-page');
  const o = el('authOverlay'); if (o) o.style.display = 'flex';
  hideSetupPage();
  switchAuthTab('login');
  authPitchStart();
}
function hideAuthPage() {
  document.body.classList.remove('is-auth-page');
  const o = el('authOverlay'); if (o) o.style.display = 'none';
  authPitchStop();
}

// ── AUTH PITCH SLIDER ──
let _authPitchIdx = 0;
let _authPitchTimer = null;
const AUTH_PITCH_COUNT = 5;
const AUTH_PITCH_INTERVAL = 5000;

function authPitchGo(idx) {
  const slides = document.querySelectorAll('.auth-pitch-slide');
  const dots = document.querySelectorAll('.auth-pitch-dot');
  if (!slides.length) return;
  const prev = _authPitchIdx;
  _authPitchIdx = ((idx % AUTH_PITCH_COUNT) + AUTH_PITCH_COUNT) % AUTH_PITCH_COUNT;
  slides.forEach(s => { s.classList.remove('active', 'exit-left'); });
  dots.forEach(d => d.classList.remove('active'));
  // Animate previous slide out
  if (slides[prev]) slides[prev].classList.add('exit-left');
  // Animate new slide in
  if (slides[_authPitchIdx]) slides[_authPitchIdx].classList.add('active');
  if (dots[_authPitchIdx]) dots[_authPitchIdx].classList.add('active');
  // Reset auto-rotation timer
  authPitchResetTimer();
}

function authPitchNext() { authPitchGo(_authPitchIdx + 1); }
function authPitchPrev() { authPitchGo(_authPitchIdx - 1); }

function authPitchResetTimer() {
  if (_authPitchTimer) clearInterval(_authPitchTimer);
  _authPitchTimer = setInterval(() => authPitchGo(_authPitchIdx + 1), AUTH_PITCH_INTERVAL);
}

function authPitchStart() {
  _authPitchIdx = 0;
  authPitchGo(0);
  authPitchResetTimer();
}

function authPitchStop() {
  if (_authPitchTimer) { clearInterval(_authPitchTimer); _authPitchTimer = null; }
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
    if (curPage !== 'login') {
      curPage = 'login';
      updateUrlAndTitle('login', null, true);
    }
  } else {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = '';
    if (loginTab) loginTab.classList.remove('active');
    if (registerTab) registerTab.classList.add('active');
    if (curPage !== 'register') {
      curPage = 'register';
      updateUrlAndTitle('register', null, true);
    }
  }
}

async function handleAuthLogin() {
  const email = (el('authLoginEmail')?.value || '').trim();
  const password = el('authLoginPassword')?.value || '';
  const errEl = el('authLoginError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Email dan password wajib diisi'; errEl.style.display = 'block'; }
    return;
  }
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
    if (errEl) { errEl.textContent = e.message || 'Email atau password salah'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}

let googleTokenClient = null;

function handleGoogleLogin() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    alert('Google API belum selesai dimuat. Silakan coba beberapa saat lagi.');
    return;
  }
  
  if (!googleTokenClient) {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'email profile',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          try {
            showLoadingOverlay(true);
            const data = await apiAuth('POST', '/auth/google', { access_token: tokenResponse.access_token });
            
            // Simpan token dan profil
            setToken(data.token);
            const p = { id: data.user.id, name: data.user.name, email: data.user.email, tgId: data.user.telegram_id || '', theme: 'glass' };
            saveProfile(p);
            
            const s = getSet(); 
            s.name = p.name; 
            sv(K.set, s);
            
            hideAuthPage();
            updateProfileUI();
            updateSidebarProfile();
            
            showLoadingOverlay(true);
            try { await loadAll(thisMon()); } finally { showLoadingOverlay(false); }
            go('dashboard');
            refresh();
          } catch (e) {
            console.error('Google login error:', e);
            alert('Login Google gagal: ' + (e.message || 'Error tidak diketahui'));
          } finally {
            showLoadingOverlay(false);
          }
        }
      }
    });
  }
  googleTokenClient.requestAccessToken({ prompt: 'consent' });
}

function toggleForgotForm(show) {
  const loginFieldsGroup = el('authLoginFieldsGroup');
  const forgotForm = el('forgotPasswordForm');
  if (!forgotForm || !loginFieldsGroup) return;
  if (show) {
    loginFieldsGroup.style.display = 'none';
    forgotForm.style.display = 'block';
    
    // Show step 1, hide step 2
    el('forgotStepEmail').style.display = 'block';
    el('forgotStepOTP').style.display = 'none';
    
    el('authForgotEmail').value = (el('authLoginEmail')?.value || '');
    el('authForgotOTP').value = '';
    el('authForgotNewPassword').value = '';
    el('authForgotNewPassword2').value = '';
    
    el('authForgotError').style.display = 'none';
    el('authForgotSuccess').style.display = 'none';
  } else {
    loginFieldsGroup.style.display = 'block';
    forgotForm.style.display = 'none';
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = el(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  // Toggle SVG icon
  if (isPassword) {
    btn.innerHTML = `<svg class="eye-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    btn.title = 'Sembunyikan sandi';
  } else {
    btn.innerHTML = `<svg class="eye-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    btn.title = 'Tampilkan sandi';
  }
}

function showForgotPassword() {
  toggleForgotForm(true);
}

async function handleForgotPasswordSubmit() {
  const email = (el('authForgotEmail')?.value || '').trim();
  const errEl = el('authForgotError');
  const succEl = el('authForgotSuccess');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (succEl) { succEl.style.display = 'none'; succEl.textContent = ''; }
  
  if (!email) {
    if (errEl) { errEl.textContent = 'Email wajib diisi'; errEl.style.display = 'block'; }
    return;
  }
  
  const btn = el('authForgotBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  
  try {
    const data = await apiAuth('POST', '/auth/forgot-password', { email });
    // Save temporary reset token
    el('forgotPasswordForm').dataset.token = data.token;
    
    // Switch to step 2 (OTP)
    el('forgotStepEmail').style.display = 'none';
    el('forgotStepOTP').style.display = 'block';
    
    if (succEl) {
      succEl.textContent = data.message || 'Kode OTP telah dikirim ke email Anda.';
      succEl.style.display = 'block';
    }
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Gagal mengirim email reset'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Kirim Kode OTP'; }
  }
}

async function handleForgotPasswordResetSubmit() {
  const otp = (el('authForgotOTP')?.value || '').trim();
  const password = el('authForgotNewPassword')?.value || '';
  const password2 = el('authForgotNewPassword2')?.value || '';
  const errEl = el('authForgotError');
  const succEl = el('authForgotSuccess');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (succEl) { succEl.style.display = 'none'; succEl.textContent = ''; }
  
  if (!otp || otp.length !== 6) {
    if (errEl) { errEl.textContent = 'Kode OTP harus 6 digit'; errEl.style.display = 'block'; }
    return;
  }
  if (!password) {
    if (errEl) { errEl.textContent = 'Password baru wajib diisi'; errEl.style.display = 'block'; }
    return;
  }
  if (password.length < 6) {
    if (errEl) { errEl.textContent = 'Password minimal 6 karakter'; errEl.style.display = 'block'; }
    return;
  }
  if (password !== password2) {
    if (errEl) { errEl.textContent = 'Password tidak cocok'; errEl.style.display = 'block'; }
    return;
  }
  
  const token = el('forgotPasswordForm').dataset.token;
  const btn = el('authForgotResetBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  
  try {
    const data = await apiAuth('POST', '/auth/reset-password', { token, otp, password });
    toast(data.message || 'Password berhasil diperbarui!', 'ok');
    toggleForgotForm(false);
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Gagal mereset password'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Perbarui Password'; }
  }
}

async function handleResetPasswordSubmit() {
  const password = el('authResetPassword')?.value || '';
  const password2 = el('authResetPassword2')?.value || '';
  const errEl = el('authResetError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  
  if (!password) {
    if (errEl) { errEl.textContent = 'Password baru wajib diisi'; errEl.style.display = 'block'; }
    return;
  }
  if (password.length < 6) {
    if (errEl) { errEl.textContent = 'Password minimal 6 karakter'; errEl.style.display = 'block'; }
    return;
  }
  if (password !== password2) {
    if (errEl) { errEl.textContent = 'Password tidak cocok'; errEl.style.display = 'block'; }
    return;
  }
  
  const token = el('resetPasswordOverlay').dataset.token;
  const btn = el('authResetBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  
  try {
    const data = await apiAuth('POST', '/auth/reset-password', { token, password });
    toast(data.message || 'Password berhasil diperbarui!', 'ok');
    el('resetPasswordOverlay').style.display = 'none';
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: newUrl }, '', newUrl);
    showAuthPage();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Gagal mereset password'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Perbarui Password'; }
  }
}


async function handleAuthRegister() {
  const name = (el('authRegisterName')?.value || '').trim();
  const email = (el('authRegisterEmail')?.value || '').trim();
  const password = el('authRegisterPassword')?.value || '';
  const password2 = el('authRegisterPassword2')?.value || '';
  if (!name || !email || !password) { toast('Semua field wajib diisi', 'err'); return; }
  // Bug #5 fix: validasi format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) { toast('Format email tidak valid (contoh: nama@email.com)', 'err'); return; }
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
  const profileEl = el('sidebarProfile');
  const nameEl = el('sidebarProfileName');
  const avatarEl = el('sidebarProfileAva');
  if (!p || (!p.tgId && !p.id && !p.email)) {
    if (profileEl) profileEl.style.display = 'none';
  } else {
    if (profileEl) profileEl.style.display = '';
    if (nameEl) nameEl.textContent = p.name || 'Pengguna';
    if (avatarEl) {
      const savedAvatar = localStorage.getItem('laksa_avatar');
      if (savedAvatar) {
        avatarEl.innerHTML = `<img src="${savedAvatar}" alt="Foto profil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
      } else {
        avatarEl.textContent = (p.name || '?')[0].toUpperCase();
      }
    }
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
// Bug #9 fix: listener scroll hanya didaftarkan di DOMContentLoaded (baris ~997) — hapus duplikat di scope global ini

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

let _googleLoadAttempts = 0;
function checkAndEnableGoogleLogin() {
  const btnLogin = document.getElementById('authGoogleLoginBtn');
  const btnRegister = document.getElementById('authGoogleRegisterBtn');
  
  if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    if (btnLogin) {
      btnLogin.removeAttribute('disabled');
      btnLogin.style.display = '';
      const span = btnLogin.querySelector('span');
      if (span) span.textContent = 'Lanjutkan dengan Google';
      btnLogin.title = '';
    }
    if (btnRegister) {
      btnRegister.removeAttribute('disabled');
      btnRegister.style.display = '';
      const span = btnRegister.querySelector('span');
      if (span) span.textContent = 'Daftar dengan Google';
      btnRegister.title = '';
    }
  } else {
    _googleLoadAttempts++;
    if (_googleLoadAttempts < 15) {
      // Retry with backoff — first 5 attempts every 500ms, then every 1s
      const delay = _googleLoadAttempts < 5 ? 500 : 1000;
      setTimeout(checkAndEnableGoogleLogin, delay);
    } else {
      // Google API truly unavailable — hide the entire section (button + divider)
      const sectionLogin = document.getElementById('authGoogleLoginSection');
      const sectionRegister = document.getElementById('authGoogleRegisterSection');
      if (sectionLogin) sectionLogin.style.display = 'none';
      if (sectionRegister) sectionRegister.style.display = 'none';
    }
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  const demoParams = new URLSearchParams(window.location.search);
  const currentHash = (window.location.hash || '').replace(/^#/, '');
  // If user is accessing login/register directly, always clear demo session so
  // they land on the real auth page, not the demo dashboard.
  if (currentHash === '/login' || currentHash === '/register' || currentHash === '') {
    sessionStorage.removeItem('laksa_demo');
  }
  if (window.self !== window.top) {
    document.body.classList.add('in-iframe');
  }
  if (demoParams.get('demo') === 'true' || sessionStorage.getItem('laksa_demo') === 'true') {
    isDemoMode = true;
    document.body.classList.add('is-demo-mode');
    // Only persist demo session if NOT inside an iframe.
    // The landing page demo preview runs in an iframe — if we store laksa_demo there,
    // it pollutes the parent tab's sessionStorage and causes "Masuk" to open the demo
    // instead of the login page.
    if (window === window.top) {
      sessionStorage.setItem('laksa_demo', 'true');
    }
    const demoProfile = { id: "usr_demo", name: "Haeru", email: "demo@laksaapp.my.id", tgId: "123456789", theme: "glass" };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(demoProfile));
  }
  checkAndEnableGoogleLogin();
  // Tema dari localStorage
  const s = getSet();
  let theme = s.theme || 'glass';
  if (theme !== 'glass' && theme !== 'dark' && theme !== 'education') {
    theme = 'glass';
  }
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = isDark ? 'rgba(210,220,240,0.7)' : (theme === 'education' ? '#0f172a' : 'rgba(15,23,42,0.55)');
    Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.08)' : (theme === 'education' ? 'rgba(15,23,42,0.15)' : 'rgba(15,23,42,0.08)');
  }

  // Account scroll arrows listener
  const accsEl = document.getElementById('accsScroll');
  if (accsEl) { accsEl.addEventListener('scroll', updateAccArrows, { passive: true }); }

  // Check for reset token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset_token');
  if (resetToken) {
    hideAuthPage();
    hideSetupPage();
    const resetOverlay = el('resetPasswordOverlay');
    if (resetOverlay) {
      resetOverlay.style.display = 'flex';
      resetOverlay.dataset.token = resetToken;
    }
    go('dashboard');
    return;
  }

  // Cek auth: token exists = logged in, otherwise show auth page
  const profile = getProfile();
  if (!isLoggedIn()) {
    parseUrlAndRoute();
    return;
  }

  // Terapkan tema dari profil
  applyTheme((profile && profile.theme) || theme, null, false);
  updateProfileUI();
  updateSidebarProfile();

  // Load data dari D1 — tampilkan skeleton dulu
  parseUrlAndRoute();
  showLoadingOverlay(true);
  try {
    await loadAll(thisMon());
  } catch (e) {
    console.error('Init load failed:', e);
  } finally {
    showLoadingOverlay(false);
  }
  refresh();
  if (isDemoMode) {
    setTimeout(applyDemoModeRestrictions, 300);
  }
  // Update arrows after accounts render
  setTimeout(updateAccArrows, 300);
});
