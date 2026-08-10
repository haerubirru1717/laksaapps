const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8787'
  : 'https://laksana.haerubirru17.workers.dev';

// Sesi / State Aplikasi
const state = {
  token: sessionStorage.getItem('admin_token') || null,
  telegramId: null,
  stateToken: null, // Token sementara saat menunggu OTP
  otpCountdown: 180, // 3 Menit
  otpTimerInterval: null,
  activeTab: 'dashboard',
  users: {
    data: [],
    page: 1,
    limit: 15,
    total: 0,
    search: '',
    plan: '',
    status: ''
  },
  logs: {
    data: [],
    page: 1,
    limit: 20,
    total: 0
  }
};

// ─────────────────────────────────────────────────────
// SECURITY HELPERS
// ─────────────────────────────────────────────────────

/**
 * Escape nilai apa pun agar aman disisipkan ke dalam HTML,
 * baik sebagai text node maupun di dalam atribut ber-tanda-kutip ganda/tunggal.
 * WAJIB dipakai untuk SEMUA data yang berasal dari API/user.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Format angka dengan aman meski nilainya null/undefined. */
function formatNumber(value) {
  return Number(value ?? 0).toLocaleString('id-ID');
}

// ─────────────────────────────────────────────────────
// INITIALIZATION / RESPONSIVE SHELL
// ─────────────────────────────────────────────────────
const ADMIN_THEME_KEY = 'laksa_admin_theme';
let sessionExpiryInFlight = false;

function applyAdminTheme(theme, save = true) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', normalized);
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    const icon = button.querySelector('span[aria-hidden]');
    if (icon) icon.textContent = normalized === 'dark' ? '☀' : '☾';
    const label = button.querySelector('.theme-toggle-label');
    if (label) label.textContent = normalized === 'dark' ? 'Glass Gelap' : 'Glass Terang';
    button.setAttribute('aria-label', normalized === 'dark' ? 'Gunakan tema terang' : 'Gunakan tema gelap');
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalized === 'dark' ? '#070b14' : '#eaf4ff');
  if (save) localStorage.setItem(ADMIN_THEME_KEY, normalized);
}

function setActiveTab(tab, { load = true } = {}) {
  if (!['dashboard', 'users', 'pricing', 'coupons', 'logs'].includes(tab)) return;
  state.activeTab = tab;
  updateTabUI();
  document.querySelectorAll('[data-tab]').forEach(item => {
    const current = item.dataset.tab === tab;
    item.classList.toggle('active', current);
    const button = item.matches('button') ? item : item.querySelector('button');
    if (button) current ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
  });
  if (load) loadActiveTab();
}

function handleSessionExpired() {
  if (sessionExpiryInFlight) return;
  sessionExpiryInFlight = true;
  alert('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
  logout();
}

document.addEventListener('DOMContentLoaded', () => {
  applyAdminTheme(localStorage.getItem(ADMIN_THEME_KEY) || 'light', false);
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
    applyAdminTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }));
  setupEventListeners();
  setActiveTab(state.activeTab, { load: false });
  checkAuth();
});

// Periksa autentikasi saat aplikasi dimuat
async function checkAuth() {
  if (!state.token) {
    showLoginScreen();
    return;
  }

  try {
    // silent: jangan tampilkan alert error saat pengecekan awal
    const data = await apiCall('/admin/auth/me', 'GET', null, { silent: true });
    if (data && data.telegram_id) {
      state.telegramId = data.telegram_id;
      showMainApp();
      loadActiveTab();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Auth check error:', err);
    logout();
  }
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-app').classList.remove('active');
  document.getElementById('admin-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('admin-app').classList.add('active');
  }, 50);
  document.getElementById('sidebar-admin-tg-id').textContent = state.telegramId;
}

function logout() {
  state.token = null;
  state.telegramId = null;
  sessionStorage.removeItem('admin_token');
  showLoginScreen();
}

// ─────────────────────────────────────────────────────
// CORE API CALL WRAPPER
// ─────────────────────────────────────────────────────
async function apiCall(path, method = 'GET', body = null, { silent = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const opts = {
    method,
    headers,
    cache: 'no-store',
    referrerPolicy: 'no-referrer'
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, opts);
  } catch (networkErr) {
    if (!silent) alert('Gagal terhubung ke server. Periksa koneksi internet Anda.');
    throw networkErr;
  }

  // Autentikasi kedaluwarsa
  if (resp.status === 401 && path.startsWith('/admin/') && path !== '/admin/auth/me') {
    handleSessionExpired();
    return null;
  }

  // Parse body hanya jika memang JSON (hindari "Unexpected token <" saat server balas HTML/502)
  let data = null;
  const contentType = resp.headers.get('content-type') || '';
  if (resp.status !== 204 && contentType.includes('application/json')) {
    try {
      data = await resp.json();
    } catch (_) {
      data = null;
    }
  }

  if (!resp.ok) {
    const message = (data && data.error) ? data.error : `Server error (HTTP ${resp.status})`;
    if (!silent) alert(`Error: ${message}`);
    throw new Error(message);
  }

  return data ?? {};
}

// ─────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────
function setupEventListeners() {
  // Login: Kirim OTP
  document.getElementById('form-otp-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tgId = document.getElementById('input-telegram-id').value.trim();
    if (!tgId) return;

    const btn = document.getElementById('btn-request-otp');
    btn.disabled = true;
    btn.textContent = 'Mengirim OTP...';

    try {
      const res = await apiCall('/admin/auth/otp-request', 'POST', { telegram_id: tgId });
      if (res && res.ok) {
        state.stateToken = res.state_token;
        document.getElementById('form-otp-request').style.display = 'none';
        document.getElementById('form-otp-verify').style.display = 'block';
        startOtpTimer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Kirim Kode OTP`;
    }
  });

  // Login: Verifikasi OTP
  document.getElementById('form-otp-verify').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('input-otp-code').value.trim();
    if (!otp || !state.stateToken) return;

    const btn = document.getElementById('btn-verify-otp');
    btn.disabled = true;
    btn.textContent = 'Memverifikasi...';

    try {
      const res = await apiCall('/admin/auth/otp-verify', 'POST', {
        otp,
        state_token: state.stateToken
      });
      if (res && res.token) {
        sessionExpiryInFlight = false;
        state.token = res.token;
        state.telegramId = res.admin.telegram_id;
        sessionStorage.setItem('admin_token', res.token);

        // Bersihkan state OTP
        clearInterval(state.otpTimerInterval);
        state.stateToken = null;
        document.getElementById('input-otp-code').value = '';

        showMainApp();
        state.activeTab = 'dashboard';
        updateTabUI();
        loadActiveTab();
      }
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Verifikasi & Masuk`;
    }
  });

  // Login: Kirim Ulang OTP (sebelumnya tidak punya handler sama sekali)
  document.getElementById('link-resend-otp').addEventListener('click', async (e) => {
    e.preventDefault();
    const tgId = document.getElementById('input-telegram-id').value.trim();
    if (!tgId) return;

    const link = e.currentTarget;
    link.style.pointerEvents = 'none';
    link.textContent = 'Mengirim...';

    try {
      const res = await apiCall('/admin/auth/otp-request', 'POST', { telegram_id: tgId });
      if (res && res.ok) {
        state.stateToken = res.state_token;
        document.getElementById('input-otp-code').value = '';
        startOtpTimer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      link.style.pointerEvents = '';
      link.textContent = 'Kirim Ulang';
    }
  });

  // Tombol Kembali dari verifikasi OTP
  document.getElementById('btn-back-to-step1').addEventListener('click', () => {
    clearInterval(state.otpTimerInterval);
    state.stateToken = null;
    document.getElementById('input-otp-code').value = '';
    document.getElementById('form-otp-verify').style.display = 'none';
    document.getElementById('form-otp-request').style.display = 'block';
  });

  // Tombol Logout
  document.getElementById('btn-logout-action').addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin logout?')) {
      logout();
    }
  });

  // Menu Sidebar SPA Navigation
  document.querySelectorAll('.sidebar-menu .menu-item, .admin-bottom-nav button[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab !== state.activeTab) setActiveTab(tab);
    });
  });

  // Dashboard: Refresh
  document.getElementById('btn-refresh-dashboard').addEventListener('click', loadDashboardStats);

  // Users: Cari
  document.getElementById('btn-search-users').addEventListener('click', () => {
    state.users.page = 1;
    state.users.search = document.getElementById('user-search-query').value.trim();
    state.users.plan = document.getElementById('user-filter-plan').value;
    state.users.status = document.getElementById('user-filter-status').value;
    loadUsersList();
  });

  // Users: Enter di kolom pencarian = klik tombol Cari
  document.getElementById('user-search-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-search-users').click();
    }
  });

  // Users: Pagination
  document.getElementById('btn-users-prev').addEventListener('click', () => {
    if (state.users.page > 1) {
      state.users.page--;
      loadUsersList();
    }
  });
  document.getElementById('btn-users-next').addEventListener('click', () => {
    const totalPages = Math.ceil(state.users.total / state.users.limit);
    if (state.users.page < totalPages) {
      state.users.page++;
      loadUsersList();
    }
  });

  // ── EVENT DELEGATION untuk tombol dinamis ──
  // Menggantikan atribut onclick="..." inline yang rentan injeksi.

  // Users: Detail / Reset PW / Ban / Unban / Hapus
  document.getElementById('table-users-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, userId, email } = btn.dataset;
    if (action === 'detail') viewUserDetail(userId);
    else if (action === 'reset-pw') promptResetPassword(userId, email);
    else if (action === 'ban' || action === 'unban') toggleBanUser(userId, action);
    else if (action === 'delete') deleteUser(userId, email);
  });

  // Pricing: submit form kartu paket (event submit ikut bubbling)
  document.getElementById('pricing-list-container').addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-pricing-id]');
    if (form) savePricingCard(e, form.dataset.pricingId);
  });

  // Coupons: tombol hapus kupon
  document.getElementById('coupons-container').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-coupon"]');
    if (btn) deleteCoupon(btn.dataset.code);
  });

  // Modals: semua tombol tutup (menggantikan onclick inline di HTML)
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) overlay.classList.remove('active');
    });
  });

  // Modals: tombol Escape menutup modal aktif
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });

  // Coupons: Buka modal kupon baru
  document.getElementById('btn-open-create-coupon').addEventListener('click', () => {
    showModal('modal-create-coupon');
  });

  // Coupons: Simpan kupon baru
  document.getElementById('form-create-coupon').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('coupon-input-code').value.trim().toUpperCase();
    const type = document.getElementById('coupon-input-type').value;
    const value = parseInt(document.getElementById('coupon-input-value').value, 10);
    const description = document.getElementById('coupon-input-description').value.trim();
    const max_uses = parseInt(document.getElementById('coupon-input-max-uses').value, 10) || 0;
    const expired_at = document.getElementById('coupon-input-expired').value || null;

    // Validasi sisi klien
    if (!/^[A-Z0-9]{3,32}$/.test(code)) {
      alert('Kode kupon harus 3–32 karakter huruf/angka (tanpa spasi/simbol).');
      return;
    }
    if (Number.isNaN(value) || value < 1) {
      alert('Nilai potongan harus berupa angka minimal 1.');
      return;
    }
    if (type === 'percent' && value > 100) {
      alert('Diskon persentase tidak boleh lebih dari 100%.');
      return;
    }
    if (!Number.isSafeInteger(max_uses) || max_uses < 0 || max_uses > 1000000) {
      alert('Batas penggunaan harus 0–1.000.000.');
      return;
    }
    if (description.length > 240) {
      alert('Deskripsi kupon maksimal 240 karakter.');
      return;
    }

    try {
      const res = await apiCall('/admin/coupons', 'POST', {
        code, type, value, description, max_uses, expired_at
      });
      if (res && res.ok) {
        alert('Kupon berhasil dibuat!');
        closeModal('modal-create-coupon');
        document.getElementById('form-create-coupon').reset();
        loadCouponsList();
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Logs: Refresh & Pagination
  document.getElementById('btn-refresh-logs').addEventListener('click', loadLogsList);
  document.getElementById('btn-logs-prev').addEventListener('click', () => {
    if (state.logs.page > 1) {
      state.logs.page--;
      loadLogsList();
    }
  });
  document.getElementById('btn-logs-next').addEventListener('click', () => {
    const totalPages = Math.ceil(state.logs.total / state.logs.limit);
    if (state.logs.page < totalPages) {
      state.logs.page++;
      loadLogsList();
    }
  });
}

// ─────────────────────────────────────────────────────
// OTP COUNTDOWN TIMER
// ─────────────────────────────────────────────────────
function startOtpTimer() {
  state.otpCountdown = 180; // 3 menit
  document.getElementById('otp-timer').textContent = '03:00';
  document.getElementById('otp-timer-label').style.display = 'block';
  document.getElementById('link-resend-otp').style.display = 'none';

  clearInterval(state.otpTimerInterval);
  state.otpTimerInterval = setInterval(() => {
    state.otpCountdown--;

    if (state.otpCountdown <= 0) {
      clearInterval(state.otpTimerInterval);
      document.getElementById('otp-timer').textContent = '00:00';
      document.getElementById('otp-timer-label').style.display = 'none';
      document.getElementById('link-resend-otp').style.display = 'inline-block';
      return;
    }

    const min = Math.floor(state.otpCountdown / 60).toString().padStart(2, '0');
    const sec = (state.otpCountdown % 60).toString().padStart(2, '0');
    document.getElementById('otp-timer').textContent = `${min}:${sec}`;
  }, 1000);
}

// ─────────────────────────────────────────────────────
// SPA TAB NAVIGATION UI & DATA LOAD
// ─────────────────────────────────────────────────────
function updateTabUI() {
  // Update sidebar active menu
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
    if (item.getAttribute('data-tab') === state.activeTab) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update main content visible tab
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab.id === `tab-${state.activeTab}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update page heading
  const heading = {
    'dashboard': 'Dashboard Overview',
    'users': 'Manajemen Pengguna',
    'pricing': 'Paket Premium',
    'coupons': 'Kupon Diskon',
    'logs': 'Log Audit Aktivitas'
  }[state.activeTab] || 'Dashboard';
  document.getElementById('page-heading').textContent = heading;
}

function loadActiveTab() {
  switch (state.activeTab) {
    case 'dashboard':
      loadDashboardStats();
      break;
    case 'users':
      loadUsersList();
      break;
    case 'pricing':
      loadPricingAndSettings();
      break;
    case 'coupons':
      loadCouponsList();
      break;
    case 'logs':
      loadLogsList();
      break;
  }
}

// ─────────────────────────────────────────────────────
// TAB 1: DASHBOARD ANALYTICS
// ─────────────────────────────────────────────────────
async function loadDashboardStats() {
  try {
    const data = await apiCall('/admin/stats');
    if (!data) return;

    // Render Stats (dengan guard null agar tidak crash jika field kosong)
    const stats = data.stats || {};
    document.getElementById('stat-total-users').textContent = formatNumber(stats.total_users);
    document.getElementById('stat-premium-users').textContent = formatNumber(stats.premium_users);
    document.getElementById('stat-new-users-30d').textContent = '+' + formatNumber(stats.new_users_30d);
    document.getElementById('stat-total-revenue').textContent = 'Rp ' + formatNumber(stats.total_revenue);

    // Render Recent Payments
    const tbody = document.getElementById('table-recent-payments');
    tbody.innerHTML = '';

    const payments = data.recent_payments || [];
    if (!payments.length) {
      tbody.innerHTML = '<tr class="responsive-empty-row"><td colspan="6" style="text-align: center; color: var(--text-dim);">Belum ada riwayat transaksi upgrade.</td></tr>';
      return;
    }

    payments.forEach(tx => {
      const date = formatDate(tx.created_at);
      const amount = 'Rp ' + formatNumber(tx.provider_total ?? tx.amount);

      let statusBadge = '';
      let actionBtn = '';

      if (tx.status === 'approved') {
        statusBadge = '<span class="badge badge-success">Approved</span>';
        actionBtn = `<span style="color: var(--text-dim); font-size: 0.8rem;">Diterima</span>`;
      } else if (tx.status === 'pending') {
        statusBadge = '<span class="badge badge-warning">Pending</span>';
        actionBtn = '<span style="color: var(--text-dim); font-size: 0.8rem;">Menunggu gateway</span>';
      } else {
        statusBadge = `<span class="badge badge-danger">${escapeHtml(tx.status)}</span>`;
        actionBtn = '-';
      }

      const tr = document.createElement('tr');
      tr.className = 'responsive-data-row payment-data-row';
      tr.innerHTML = `
        <td data-label="Tanggal">${escapeHtml(date)}</td>
        <td data-label="Email" style="font-weight: 600;">${escapeHtml(tx.email)}</td>
        <td data-label="Paket"><span class="badge badge-primary">${escapeHtml(tx.pricing_id)}</span></td>
        <td data-label="Jumlah" style="font-weight: 600;">${escapeHtml(amount)}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Aksi"><div class="btn-action-group">${actionBtn}</div></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ─────────────────────────────────────────────────────
// TAB 2: USER MANAGEMENT
// ─────────────────────────────────────────────────────
async function loadUsersList() {
  try {
    const { search, plan, status, page, limit } = state.users;
    let url = `/admin/users?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (plan) url += `&plan=${encodeURIComponent(plan)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    const data = await apiCall(url);
    if (!data) return;

    state.users.total = data.total ?? 0;

    // Render Pagination Info
    const totalPages = Math.ceil(state.users.total / limit) || 1;
    document.getElementById('users-pagination-info').textContent = `Halaman ${page} dari ${totalPages} (Total: ${state.users.total} user)`;
    document.getElementById('btn-users-prev').disabled = page <= 1;
    document.getElementById('btn-users-next').disabled = page >= totalPages;

    // Render Users Table
    const tbody = document.getElementById('table-users-list');
    tbody.innerHTML = '';

    const users = data.users || [];
    if (!users.length) {
      tbody.innerHTML = '<tr class="responsive-empty-row"><td colspan="6" style="text-align: center; color: var(--text-dim);">Tidak ada user ditemukan.</td></tr>';
      return;
    }

    users.forEach(u => {
      const isPremium = u.plan === 'premium';
      const statusBadge = u.is_banned
        ? '<span class="badge badge-danger">Banned</span>'
        : '<span class="badge badge-success">Aktif</span>';

      const planBadge = isPremium
        ? '<span class="badge badge-success">Premium</span>'
        : '<span class="badge badge-primary">Free</span>';

      const expDate = u.plan_expired_at ? formatDate(u.plan_expired_at).slice(0, 10) : (isPremium ? 'Lifetime' : '-');

      // Semua data user di-escape; identitas tombol dibawa lewat data-attribute,
      // bukan onclick inline, sehingga tanda kutip di nama/email tidak bisa injeksi.
      const uid = escapeHtml(u.id);
      const uemail = escapeHtml(u.email);
      const actionBtn = `
        <button class="btn-small btn-small-primary" data-action="detail" data-user-id="${uid}">Detail</button>
        <button class="btn-small" data-action="reset-pw" data-user-id="${uid}" data-email="${uemail}">Reset PW</button>
        ${u.is_banned
          ? `<button class="btn-small btn-small-success" data-action="unban" data-user-id="${uid}">Unban</button>`
          : `<button class="btn-small btn-small-danger" data-action="ban" data-user-id="${uid}">Ban</button>`
        }
        <button class="btn-small btn-small-danger" style="color: var(--danger);" data-action="delete" data-user-id="${uid}" data-email="${uemail}">Hapus</button>
      `;

      const tr = document.createElement('tr');
      tr.className = 'responsive-data-row user-data-row';
      tr.innerHTML = `
        <td data-label="Nama" style="font-weight: 600;">${escapeHtml(u.name)}</td>
        <td data-label="Email">${uemail}</td>
        <td data-label="Paket">${planBadge}</td>
        <td data-label="Berlaku Hingga">${escapeHtml(expDate)}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Aksi"><div class="btn-action-group">${actionBtn}</div></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Users error:', err);
  }
}

async function viewUserDetail(userId) {
  try {
    const data = await apiCall(`/admin/users/${encodeURIComponent(userId)}`);
    if (!data) return;

    const u = data.user || {};
    document.getElementById('detail-user-id').textContent = u.id ?? '-';
    document.getElementById('detail-user-name').textContent = u.name ?? '-';
    document.getElementById('detail-user-email').textContent = u.email ?? '-';
    document.getElementById('detail-user-tg-id').textContent = u.telegram_id || '-';
    document.getElementById('detail-user-plan').innerHTML = u.plan === 'premium'
      ? '<span class="badge badge-success">Premium</span>'
      : '<span class="badge badge-primary">Free</span>';
    document.getElementById('detail-user-expired').textContent = u.plan_expired_at ? formatDate(u.plan_expired_at) : (u.plan === 'premium' ? 'Lifetime' : '-');
    document.getElementById('detail-user-status').innerHTML = u.is_banned
      ? '<span class="badge badge-danger">Banned</span>'
      : '<span class="badge badge-success">Aktif</span>';
    document.getElementById('detail-user-tx-count').textContent = formatNumber(data.stats?.transactions_count);

    // Payments history
    const list = document.getElementById('detail-user-payments-list');
    list.innerHTML = '';
    const payments = data.payments || [];
    if (!payments.length) {
      list.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">Belum ada riwayat transaksi.</td></tr>';
    } else {
      payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(formatDate(p.created_at))}</td>
          <td><span class="badge badge-primary">${escapeHtml(p.pricing_id)}</span></td>
          <td style="font-weight:600;">Rp ${escapeHtml(formatNumber(p.provider_total ?? p.amount))}</td>
          <td><span class="badge ${p.status === 'approved' ? 'badge-success' : 'badge-warning'}">${escapeHtml(p.status)}</span></td>
        `;
        list.appendChild(tr);
      });
    }

    showModal('modal-user-detail');
  } catch (err) {
    console.error(err);
  }
}

async function promptResetPassword(userId, email) {
  const newPass = prompt(`Masukkan password baru untuk user ${email} (10–256 karakter):`);
  if (newPass === null) return;

  if (newPass.length < 10 || newPass.length > 256) {
    alert('Password harus 10–256 karakter.');
    return;
  }

  try {
    const res = await apiCall(`/admin/users/${encodeURIComponent(userId)}/reset-password`, 'POST', { password: newPass });
    if (res && res.ok) {
      alert(`Password untuk user ${email} berhasil diubah.`);
    }
  } catch (e) {
    console.error(e);
  }
}

async function toggleBanUser(userId, action) {
  const confirmMsg = action === 'ban'
    ? 'Apakah Anda yakin ingin memblokir (ban) user ini?'
    : 'Apakah Anda yakin ingin membuka blokir (unban) user ini?';
  if (!confirm(confirmMsg)) return;

  try {
    const res = await apiCall(`/admin/users/${encodeURIComponent(userId)}/${action}`, 'POST');
    if (res && res.ok) {
      alert(res.message);
      loadUsersList();
    }
  } catch (e) {
    console.error(e);
  }
}

async function deleteUser(userId, email) {
  if (!confirm(`⚠️ PERINGATAN KERAS! ⚠️\n\nApakah Anda yakin ingin menghapus akun ${email} secara PERMANEN?\n\nSemua data transaksi, kategori, rekening, hutang, budgeting, dan data lainnya milik user ini akan dihilangkan 100% dari database.`)) {
    return;
  }

  // Konfirmasi kedua: aksi destruktif permanen butuh niat eksplisit
  const typed = prompt(`Untuk konfirmasi akhir, ketik HAPUS lalu tekan OK:`);
  if (typed === null || typed.trim().toUpperCase() !== 'HAPUS') {
    alert('Penghapusan dibatalkan.');
    return;
  }

  try {
    const res = await apiCall(`/admin/users/${encodeURIComponent(userId)}`, 'DELETE');
    if (res && res.ok) {
      alert('Akun pengguna berhasil dihapus secara permanen.');
      loadUsersList();
    }
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────
// TAB 3: PACKAGE SETTINGS
// ─────────────────────────────────────────────────────
async function loadPricingAndSettings() {
  try {
    // 1. Load Pricing Packages
    const pricing = await apiCall('/admin/pricing');
    const container = document.getElementById('pricing-list-container');
    container.innerHTML = '';

    if (!pricing || !Array.isArray(pricing) || !pricing.length) {
      container.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; color: var(--text-dim); padding: 2rem;">Tidak ada data paket.</div>';
    } else {
      pricing.forEach(p => {
        const div = document.createElement('div');
        div.className = 'pricing-card responsive-data-card';
        // Input memakai atribut name + form.elements (bukan id global),
        // sehingga id paket tidak perlu disisipkan ke id elemen.
        div.innerHTML = `
          <h3 class="responsive-card-heading" style="border-bottom: 1px solid var(--panel-border); padding-bottom: 0.5rem; margin-bottom: 1rem; color: #818cf8;">
            Paket ${escapeHtml(p.label)} (${escapeHtml(p.id)})
          </h3>
          <form class="responsive-card-body" data-pricing-id="${escapeHtml(p.id)}">
            <div class="form-group">
              <label>Nama Label Paket</label>
              <input type="text" name="label" class="input-control" value="${escapeHtml(p.label)}" required maxlength="80">
            </div>
            <div class="form-group">
              <label>Harga Paket (Rupiah)</label>
              <input type="number" name="price" class="input-control" value="${escapeHtml(p.price)}" required min="0" max="1000000000">
            </div>
            <div class="form-group">
              <label>Harga Coret (Rupiah, Opsional)</label>
              <input type="number" name="original_price" class="input-control" value="${escapeHtml(p.original_price ?? '')}" min="0" max="1000000000">
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
              <label style="margin-bottom:0; cursor:pointer; display:flex; align-items:center; gap:0.5rem;">
                <input type="checkbox" name="active" ${p.active ? 'checked' : ''} style="width:16px; height:16px;">
                Paket Aktif
              </label>
            </div>
            <button type="submit" class="btn-primary" style="margin-top: 1rem; padding: 0.5rem;">Update Paket</button>
          </form>
        `;
        container.appendChild(div);
      });
    }

  } catch (err) {
    console.error('Pricing/Settings error:', err);
  }
}

async function savePricingCard(e, pricingId) {
  e.preventDefault();
  const form = e.target;
  const label = form.elements.label.value.trim();
  const price = parseInt(form.elements.price.value, 10);
  const origVal = form.elements.original_price.value;
  const original_price = origVal ? parseInt(origVal, 10) : null;
  const active = form.elements.active.checked ? 1 : 0;

  if (!label || label.length > 80) {
    alert('Nama label paket harus 1–80 karakter.');
    return;
  }
  if (!Number.isSafeInteger(price) || price < 0 || price > 1000000000) {
    alert('Harga paket harus berupa bilangan bulat Rp0–Rp1.000.000.000.');
    return;
  }
  if (active && price < 1) {
    alert('Paket aktif harus memiliki harga minimal Rp1.');
    return;
  }
  if (original_price !== null && (!Number.isSafeInteger(original_price) || original_price < 0 || original_price > 1000000000)) {
    alert('Harga coret harus berupa bilangan bulat Rp0–Rp1.000.000.000.');
    return;
  }

  try {
    const res = await apiCall('/admin/pricing', 'POST', {
      id: pricingId,
      price,
      original_price,
      label,
      active
    });
    if (res && res.ok) {
      alert(`Paket ${pricingId} berhasil diupdate!`);
      loadPricingAndSettings();
    }
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────
// TAB 4: COUPON MANAGEMENT
// ─────────────────────────────────────────────────────
async function loadCouponsList() {
  try {
    const coupons = await apiCall('/admin/coupons');
    const container = document.getElementById('coupons-container');
    container.innerHTML = '';

    if (!coupons || !Array.isArray(coupons) || !coupons.length) {
      container.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; color: var(--text-dim); padding: 2rem;">Tidak ada kupon diskon aktif saat ini.</div>';
      return;
    }

    coupons.forEach(c => {
      const discVal = c.type === 'percent' ? `${c.value ?? 0}%` : `Rp ${formatNumber(c.value)}`;
      const uses = c.max_uses === 0 ? 'Unlimited' : `${c.used_count ?? 0} / ${c.max_uses ?? 0}`;
      const expiry = c.expired_at ? formatDate(c.expired_at).slice(0, 10) : 'Lifetime';

      const div = document.createElement('div');
      div.className = 'coupon-card responsive-data-card';
      div.innerHTML = `
        <div class="coupon-code responsive-card-heading">${escapeHtml(c.code)}</div>
        <div class="coupon-desc">${escapeHtml(c.description || '-')}</div>
        <div class="coupon-meta responsive-card-meta">
          <strong>Potongan:</strong> ${escapeHtml(discVal)}<br>
          <strong>Digunakan:</strong> ${escapeHtml(uses)}<br>
          <strong>Kadaluarsa:</strong> ${escapeHtml(expiry)}
        </div>
        <div class="responsive-card-actions">
          <button class="btn-small btn-small-danger" style="margin-top: 1rem; width: 100%; border-color: transparent;" data-action="delete-coupon" data-code="${escapeHtml(c.code)}">
            Hapus Kupon
          </button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Coupons error:', err);
  }
}

async function deleteCoupon(code) {
  if (!confirm(`Apakah Anda yakin ingin menghapus kupon "${code}"?`)) return;

  try {
    const res = await apiCall(`/admin/coupons/${encodeURIComponent(code)}`, 'DELETE');
    if (res && res.ok) {
      alert('Kupon berhasil dihapus.');
      loadCouponsList();
    }
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────
// TAB 5: AUDIT LOGS
// ─────────────────────────────────────────────────────
async function loadLogsList() {
  try {
    const { page, limit } = state.logs;
    const data = await apiCall(`/admin/audit-logs?page=${page}&limit=${limit}`);
    if (!data) return;

    state.logs.total = data.total ?? 0;

    // Pagination info
    const totalPages = Math.ceil(state.logs.total / limit) || 1;
    document.getElementById('logs-pagination-info').textContent = `Halaman ${page} dari ${totalPages} (Total: ${state.logs.total} log)`;
    document.getElementById('btn-logs-prev').disabled = page <= 1;
    document.getElementById('btn-logs-next').disabled = page >= totalPages;

    const tbody = document.getElementById('table-logs-list');
    tbody.innerHTML = '';

    const logs = data.logs || [];
    if (!logs.length) {
      tbody.innerHTML = '<tr class="responsive-empty-row"><td colspan="5" style="text-align: center; color: var(--text-dim);">Belum ada log audit tercatat.</td></tr>';
      return;
    }

    logs.forEach(l => {
      const date = formatDate(l.created_at);
      const actionBadge = `<span class="badge badge-primary">${escapeHtml(l.action)}</span>`;

      // Metadata log bisa berisi input user (nama, email, dsb) —
      // WAJIB di-escape, termasuk hasil JSON.stringify.
      let detailsStr = '';
      if (l.details) {
        try {
          const parsed = JSON.parse(l.details);
          detailsStr = `<pre style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace; background: rgba(0,0,0,0.2); padding: 0.4rem; border-radius: 4px; overflow-x:auto; max-width: 250px;">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
        } catch (_) {
          detailsStr = escapeHtml(l.details);
        }
      }

      const tr = document.createElement('tr');
      tr.className = 'responsive-data-row audit-data-row';
      tr.innerHTML = `
        <td data-label="Tanggal" style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(date)}</td>
        <td data-label="Admin"><code>${escapeHtml(l.admin_id)}</code></td>
        <td data-label="Aktivitas">${actionBadge}</td>
        <td data-label="Target"><code>${escapeHtml(l.target || '-')}</code></td>
        <td data-label="Detail">${detailsStr}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Logs error:', err);
  }
}

// ─────────────────────────────────────────────────────
// GLOBAL UTILITIES & MODAL HELPERS
// ─────────────────────────────────────────────────────
function showModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Tutup modal jika user klik overlay luar
window.addEventListener('click', (event) => {
  if (event.target.classList && event.target.classList.contains('modal-overlay')) {
    event.target.classList.remove('active');
  }
});

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const date = d.getDate().toString().padStart(2, '0');
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const sec = d.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${date} ${hour}:${min}:${sec}`;
  } catch (_) {
    return dateStr;
  }
}
