// ══════════════════════════════════════
// settings.js — Settings, Accounts, Categories, Backup
// ══════════════════════════════════════

function renderSettings() {
  const s = getSet();
  const nameEl = el('sName');
  if (nameEl) nameEl.value = s.name || '';
  const currEl = el('sCurr');
  if (currEl) currEl.value = s.currency || 'Rp';
  let theme = s.theme || 'glass';
  if (theme !== 'glass' && theme !== 'dark' && theme !== 'education') {
    theme = 'glass';
  }
  applyTheme(theme, null, false);
  updateProfilePreview();
  renderAccList(); renderCatList();

  if (typeof applyDemoModeRestrictions === 'function') {
    applyDemoModeRestrictions();
  }
}

function updateProfilePreview() {
  const nameEl = el('sName');
  const circleEl = el('profileAvatarCircle');
  const nameDisplayEl = el('profileAvatarName');
  if (!nameEl || !circleEl || !nameDisplayEl) return;
  const name = nameEl.value.trim() || 'Pengguna';
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  
  const savedAvatar = localStorage.getItem('laksa_avatar');
  if (savedAvatar) {
    circleEl.innerHTML = `<img src="${savedAvatar}" alt="Foto profil" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
  } else {
    circleEl.textContent = initials;
  }
  nameDisplayEl.textContent = name;

  // Update profile info
  const p = getProfile();
  const tgEl = el('profileAvatarTg');
  if (tgEl && p) {
    tgEl.textContent = p.email || ('Telegram ID: ' + (p.tgId || '—'));
    const connTgEl = el('connectedTgId');
    if (connTgEl) connTgEl.textContent = p.tgId || '—';
  }

  // Update Theme Display Value
  const activeTheme = document.documentElement.getAttribute('data-theme') || 'glass';
  const themeLabels = {
    'glass': 'Glass Terang',
    'dark': 'Glass Gelap (OLED)',
    'education': 'Educational Platform'
  };
  const themeValEl = el('activeThemeVal');
  if (themeValEl) themeValEl.textContent = themeLabels[activeTheme] || activeTheme;

  // Update plan badge + expiry detail
  const planBadge = el('planBadge');
  if (planBadge) {
    const usage = getUsageStatus();
    if (usage && usage.plan === 'premium') {
      planBadge.textContent = 'Premium';
      planBadge.className = 'plan-badge plan-premium';
      // Show expiry detail
      let expiryEl = document.getElementById('plan-expiry');
      if (!expiryEl) {
        expiryEl = document.createElement('div');
        expiryEl.id = 'plan-expiry';
        expiryEl.className = 'plan-expiry';
        planBadge.parentNode.insertBefore(expiryEl, planBadge.nextSibling);
      }
      if (usage.plan_expired_at) {
        const expDate = new Date(usage.plan_expired_at);
        const now = new Date();
        const daysLeft = Math.ceil((expDate - now) / (1000*60*60*24));
        const expStr = expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        expiryEl.innerHTML = `Aktif sampai <strong>${expStr}</strong> (${daysLeft} hari lagi)`;
      } else {
        expiryEl.innerHTML = `<strong>Lifetime</strong> — tidak pernah expired`;
      }
    } else {
      planBadge.textContent = 'Free';
      planBadge.className = 'plan-badge plan-free';
      planBadge.onclick = () => showUpgradeModal();
      // Remove expiry if exists
      const expiryEl = document.getElementById('plan-expiry');
      if (expiryEl) expiryEl.remove();
    }
  }
}

function saveS() {
  const s = getSet();
  s.name = el('sName').value.trim() || 'Pengguna';
  s.currency = el('sCurr').value;
  const activeTheme = document.documentElement.getAttribute('data-theme') || 'glass';
  s.theme = activeTheme;
  sv(K.set, s);
  
  // Sync to laksa_profile
  const p = getProfile();
  if (p) {
    p.name = s.name;
    p.theme = s.theme;
    saveProfile(p);
  }
  
  updateProfilePreview();
  if (typeof updateProfileUI === 'function') updateProfileUI();
  if (typeof updateSidebarProfile === 'function') updateSidebarProfile();
  if (typeof renderDashTopbar === 'function') renderDashTopbar();
  
  toast('Disimpan!', 'ok');
}

function renderAccList() {
  const listEl = el('accList');
  if (!listEl) return;
  listEl.innerHTML = getAccs().map(a => {
    const b = detBank(a.name);
    const logo = getLogoHtml(a.name, b, 'acc-logo', 'acc-logo-fb', 'width:100%;height:100%;object-fit:cover;border-radius:50%;', true);
    
    // Logo bg
    const c1 = (b && b.color) ? b.color : (a.color || '#7c3aed');
    const c2 = (b && b.c2) ? b.c2 : (a.color || '#4e1fb5');
    const logoBg = `background:linear-gradient(135deg,${c1},${c2})`;
    
    return `
      <div class="sett-list-item" onclick="openAccDetail('${a.id}')">
        <div class="sett-acc-logo" style="${logoBg}">
          ${logo}
        </div>
        <div class="sett-item-info">
          <div class="sett-item-title" style="text-transform:uppercase">${esc(a.name)}</div>
          <div class="sett-item-sub">
            Saldo: ${fCur(a.balance)}
          </div>
        </div>
        <div class="sett-item-action" onclick="event.stopPropagation()">
          <button class="abtn del" onclick="delAcc('${a.id}')" title="Hapus rekening" style="color:var(--expense);margin-right:0.3rem;background:transparent;border:none;cursor:pointer;padding:4px;display:flex;align-items:center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--ink3);opacity:0.6"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `;
  }).join('');
}
async function addAcc(data) {
  try {
    const b = detBank(data.name);
    if (b && !data.color) data.color = b.color;
    await api('POST', '/accounts', { name: data.name, balance: parseFloat(data.balance) || 0, color: data.color || null });
    await fetchAccs();
    closeModal(); toast('Rekening ditambahkan!', 'ok'); renderAccList(); if (curPage === 'dashboard') refresh();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}
async function delAcc(id) {
  const accs = getAccs();
  if (accs.length <= 1) { toast('Minimal 1 rekening harus ada.', 'err'); return; }
  if (!confirm('Hapus rekening ini? Transaksi terkait tidak ikut terhapus.')) return;
  try {
    await api('DELETE', `/accounts/${id}`);
    await fetchAccs();
    toast('Rekening dihapus.', 'info'); renderAccList(); if (curPage === 'dashboard') refresh();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}
let catListExpanded = false;
const CAT_VISIBLE_COUNT = 10;
function renderCatList() {
  const cats = getCats();
  const chipHtml = (c) => `<li class="chip"><img src="/icons/${getCatSvgFile(c.name, c.type)}.svg" class="cat-icon-sm" width="16" height="16" alt="" style="margin-right:4px">${esc(c.name)}<button class="chip-del" onclick="delCat('${c.id}')"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></li>`;
  const visible = catListExpanded ? cats : cats.slice(0, CAT_VISIBLE_COUNT);
  let html = visible.map(chipHtml).join('');
  if (cats.length > CAT_VISIBLE_COUNT) {
    const label = catListExpanded ? 'Sembunyikan' : `Lihat Lainnya (${cats.length - CAT_VISIBLE_COUNT})`;
    html += `<li class="chip cat-toggle-chip" onclick="catListExpanded=!catListExpanded;renderCatList()" style="cursor:pointer;color:var(--accent);border-color:var(--accent);font-weight:600">${label}</li>`;
  }
  el('catList').innerHTML = html;
}
async function addCat(data) {
  try {
    await api('POST', '/categories', { name: data.name, emoji: data.emoji || '📌', type: data.type || 'both' });
    await fetchCats();
    closeModal(); toast('Kategori ditambahkan!', 'ok'); renderCatList();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}
async function delCat(id) {
  try {
    await api('DELETE', `/categories/${id}`);
    await fetchCats();
    renderCatList();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

// ── LINK TELEGRAM ──
function showLinkTelegramForm() {
  const btn = el('linkTgBtn');
  const form = el('linkTgForm');
  if (btn) btn.style.display = 'none';
  if (form) form.style.display = '';
  const p = getProfile();
  if (p && p.tgId) {
    const input = el('linkTgInput');
    if (input) input.value = p.tgId;
  }
}
function hideLinkTelegramForm() {
  const btn = el('linkTgBtn');
  const form = el('linkTgForm');
  if (btn) btn.style.display = '';
  if (form) form.style.display = 'none';
}
async function submitLinkTelegram() {
  const tgId = (el('linkTgInput')?.value || '').trim().replace(/\D/g, '');
  if (!tgId) { toast('Telegram ID wajib diisi (angka)', 'err'); return; }
  const btn = el('linkTgSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    await api('POST', '/auth/link-telegram', { telegram_id: tgId });
    const p = getProfile();
    if (p) { p.tgId = tgId; saveProfile(p); }
    hideLinkTelegramForm();
    updateProfilePreview();
    toast('Telegram berhasil dihubungkan!', 'ok');
  } catch (e) {
    toast('Gagal: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Hubungkan'; }
  }
}

// ── SCAN STRUK ──

// ── Backup & Restore ──
// Bug #7 fix: doBackup kini async dan menggunakan getTxYear() agar backup mencakup seluruh transaksi tahun ini, bukan hanya bulan aktif
async function doBackup() {
  try {
    // Paksa fetch tahun penuh agar backup tidak berhenti di bulan ini saja
    const year = new Date().getFullYear().toString();
    await fetchTxYear(year);
  } catch(_) {}
  const txBackup = getTxYear().length > getTx().length ? getTxYear() : getTx();
  const d = {
    v: 2,
    date: new Date().toISOString(),
    transactions: txBackup,
    accounts: getAccs(),
    categories: getCats(),
    budgets: getBud(),
    goals: getGoals(),
    bills: getBills(),
    settings: getSet(),
    receipts: getRec()
  };
  dlF(JSON.stringify(d, null, 2), 'laksa_backup_' + today() + '.json', 'application/json');
  toast('Backup berhasil! (' + txBackup.length + ' transaksi)', 'ok');
}
async function doRestore(ev) {
  const file = ev.target.files[0]; if (!file) return;
  ev.target.value = '';
  let text;
  try {
    // Prefer Blob.text() — avoids FileReader truncation issues on some mobile browsers
    if (typeof file.text === 'function') {
      text = await file.text();
    } else {
      text = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('Gagal membaca file'));
        r.readAsText(file);
      });
    }
  } catch (readErr) {
    toast('Gagal membaca file: ' + readErr.message, 'err'); return;
  }
  let d;
  try {
    d = JSON.parse(text);
  } catch (parseErr) {
    const sizeKB = Math.round(file.size / 1024);
    toast(`File JSON tidak valid (${sizeKB}KB). Pastikan file tidak rusak atau terpotong.`, 'err'); return;
  }
  if (!d.transactions) { toast('Format backup tidak valid: property "transactions" tidak ditemukan.', 'err'); return; }
  if (!confirm('Restore akan memulihkan semua data ke server. Lanjutkan?')) return;
  if (d.settings) sv(K.set, d.settings);
  if (d.receipts) sv(K.rec, d.receipts);
  showLoadingOverlay(true);
  let txOk = 0, txFail = 0, billOk = 0, goalOk = 0, budOk = 0;
  // Transaksi → D1 (batch 5 concurrent)
  if (d.transactions?.length) {
    const batch = 5;
    for (let i = 0; i < d.transactions.length; i += batch) {
      const chunk = d.transactions.slice(i, i + batch);
      const results = await Promise.allSettled(chunk.map(tx =>
        api('POST', '/transactions', {
          type: tx.type, amount: tx.amount, date: tx.date,
          account_id: tx.account_id, category_id: tx.category_id,
          note: tx.note || '', store: tx.store || null, source: 'restore',
          idempotency_key: tx.id || genUUID()
        })
      ));
      results.forEach(r => r.status === 'fulfilled' ? txOk++ : txFail++);
    }
  }
  // Bills → D1
  if (d.bills?.length) {
    for (const b of d.bills) {
      try {
        await api('POST', '/bills', {
          name: b.name, bill_type: b.bill_type || 'lainnya',
          amount: b.amount || 0, due_type: b.due_type || 'monthly',
          due_day: b.due_day || null, due_date: b.due_date || null,
          notes: b.notes || null, status: 'unpaid'
        });
        billOk++;
      } catch (e) { }
    }
  }
  // Goals → D1
  if (d.goals?.length) {
    for (const g of d.goals) {
      try {
        await api('POST', '/goals', {
          name: g.name, target: g.target, current: g.current || 0,
          deadline: g.deadline || null, icon: g.icon || 'target'
        });
        goalOk++;
      } catch (e) { }
    }
  }
  // Budgets → D1
  if (d.budgets?.length) {
    for (const b of d.budgets) {
      try {
        await api('POST', '/budgets', {
          category_id: b.category_id, limit_amount: b.limit_amount || b.limit || 0,
          month: b.month || thisMon()
        });
        budOk++;
      } catch (e) { }
    }
  }
  showLoadingOverlay(false);
  const parts = [`${txOk} transaksi`];
  if (billOk) parts.push(`${billOk} tagihan`);
  if (goalOk) parts.push(`${goalOk} target`);
  if (budOk) parts.push(`${budOk} anggaran`);
  toast(`Direstore! ${parts.join(', ')} berhasil dipulihkan.` + (txFail > 0 ? ` ${txFail} transaksi gagal.` : ''), 'ok');
  setTimeout(() => location.reload(), 1200);
}

async function resetAll() {
  const typed = prompt('HAPUS SEMUA DATA?\\nKetik "HAPUS" (tanpa tanda kutip) untuk mengonfirmasi. Ini akan menghapus semua transaksi, rekening, dan kategori dari server.');
  if (typed !== 'HAPUS') {
    if (typed !== null) toast('Batal: Kata yang diketik tidak sesuai.', 'info');
    return;
  }
  showLoadingOverlay(true);
  try {
    // Bulk delete semua data di D1 (server-side) — termasuk bulan lama
    await api('DELETE', '/transactions');
    await api('DELETE', '/accounts');
    await api('DELETE', '/categories');
    // Hapus semua data lokal
    Object.values(K).forEach(k => localStorage.removeItem(k));
    toast('Semua data dihapus.', 'info');
  } catch (e) {
    toast('Gagal hapus sebagian data: ' + e.message, 'err');
  } finally {
    showLoadingOverlay(false);
    setTimeout(() => location.reload(), 800);
  }
}
function dlF(content, name, mime) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], { type: mime })), download: name }); document.body.appendChild(a); a.click(); document.body.removeChild(a); }

// ── HERO STAT PILL POPUP ──
// toggleStatPop removed — diganti nw-grid teks langsung


// ── Account Detail Sheet ──

function openAccDetail(id) {
  accSheetId = id; accSheetTab = 'all'; accSheetMon = thisMon();
  renderAccSheet();
  el('accSheetOverlay').classList.add('open');
  el('accSheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeAccSheet() {
  el('accSheetOverlay').classList.remove('open');
  el('accSheet').classList.remove('open');
  document.body.style.overflow = '';
  accSheetId = null;
}
function setAccTab(tab, btn) {
  accSheetTab = tab;
  document.querySelectorAll('.acc-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAccSheetBody();
}
function renderAccSheet() {
  const acc = getAccs().find(a => a.id === accSheetId);
  if (!acc) return;
  const b = detBank(acc.name);
  const c1 = (b && b.color) ? b.color : (acc.color || '#7c3aed');
  const c2 = (b && b.c2) ? b.c2 : (acc.color || '#4e1fb5');
  const isNeg = acc.balance < 0;
  const allTx = getTx();
  const accTx = allTx.filter(t => t.account_id === accSheetId || t.to_acc_id === accSheetId);
  const months = [...new Set(accTx.map(t => mKey(t.date)))].sort((a, b) => b.localeCompare(a));
  if (!months.includes(accSheetMon) && months.length) accSheetMon = months[0];
  const monTx = accTx.filter(t => mKey(t.date) === accSheetMon);
  const monIn = monTx.filter(t => (t.type === 'income' && t.account_id === accSheetId) || (t.type === 'transfer' && t.to_acc_id === accSheetId)).reduce((s, t) => s + t.amount, 0);
  const monOut = monTx.filter(t => (t.type === 'expense' && t.account_id === accSheetId) || (t.type === 'transfer' && t.account_id === accSheetId && t.to_acc_id !== accSheetId)).reduce((s, t) => s + t.amount, 0);
  const monOpts = months.length ? months.map(m => `<option value="${m}"${m === accSheetMon ? ' selected' : ''}>${m}</option>`).join('') : `<option value="${thisMon()}">${thisMon()}</option>`;
  const isEwalletAcc = b && b.isWallet || /ovo|gopay|dana|linkaja|shopeepay|spay|wallet/i.test(acc.name);
  const nm2 = acc.name.toLowerCase();
  let ewDarkImg2 = null;
  if (nm2.includes('gopay'))                               ewDarkImg2 = '/ewallet/gopay.svg';
  else if (nm2.includes('ovo'))                            ewDarkImg2 = '/ewallet/ovo.svg';
  else if (nm2.includes('dana'))                           ewDarkImg2 = '/ewallet/dana.svg';
  else if (nm2.includes('linkaja'))                        ewDarkImg2 = '/ewallet/linkaja.png';
  else if (nm2.includes('shopee') || nm2.includes('spay')) ewDarkImg2 = '/ewallet/shopeepay.svg';
  
  const ewSheetImg  = ewDarkImg2;
  // Bug #8 fix: kedua cabang ternary identik — sederhanakan jadi satu nilai
  const sheetAvaBg  = `background:linear-gradient(135deg,${c1},${c2})`;
  
  const sheetInit = (acc.name.replace(/[^a-zA-Z0-9]/g,'').slice(0,2)||'?').toUpperCase();
  const logoHtml = (isEwalletAcc && ewSheetImg)
    ? `<img src="${ewSheetImg}" style="width:80%;height:80%;object-fit:contain;" onerror="this.style.display='none'">
       <div class="acc-sheet-ava-fb" style="display:none">${sheetInit}</div>`
    : getLogoHtml(acc.name, b, '', 'acc-sheet-ava-fb', 'width:100%;height:100%;object-fit:cover;border-radius:14px;', true);
  
  el('accSheet').innerHTML = `
<div class="acc-sheet-handle"></div>
<div class="acc-sheet-banner">
  <div class="acc-sheet-top">
    <div class="acc-sheet-ava" style="${sheetAvaBg}">${logoHtml}</div>
    <div style="flex:1;min-width:0">
      <div class="acc-sheet-name" style="text-transform:uppercase">${esc(acc.name)}</div>
      <div class="acc-sheet-bal${isNeg ? ' neg' : ''}">${fCur(acc.balance)}</div>
    </div>
    <button class="acc-sheet-close" onclick="closeAccSheet()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div class="acc-group-card">
    <div class="acc-sheet-stats" style="margin-bottom:0">
      <div class="acc-stat">
        <div class="acc-stat-lbl">Masuk bulan ini</div>
        <div class="acc-stat-val t-inc">+${fCur(monIn)}</div>
      </div>
      <div class="acc-stat">
        <div class="acc-stat-lbl">Keluar bulan ini</div>
        <div class="acc-stat-val t-exp">${fCur(monOut)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem">
      <div class="acc-seg">
        <button class="acc-tab${accSheetTab === 'all' ? ' active' : ''}" onclick="setAccTab('all',this)">Semua</button>
        <button class="acc-tab${accSheetTab === 'in' ? ' active' : ''}" onclick="setAccTab('in',this)">Masuk</button>
        <button class="acc-tab${accSheetTab === 'out' ? ' active' : ''}" onclick="setAccTab('out',this)">Keluar</button>
      </div>
      <select class="acc-mon-sel" onchange="accSheetMon=this.value;renderAccSheet()">${monOpts}</select>
    </div>
  </div>
</div>
<div class="acc-sheet-body" id="accSheetBody"></div>
<div class="acc-sheet-foot">
  <button onclick="closeAccSheet();go('transactions')" style="width:100%;padding:.55rem;border-radius:12px;border:none;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.4rem;box-shadow:0 4px 14px rgba(37,99,235,.32);transition:all .18s" onmouseover="this.style.boxShadow='0 6px 20px rgba(37,99,235,.48)';this.style.transform='translateY(-1px)'" onmouseout="this.style.boxShadow='0 4px 14px rgba(37,99,235,.32)';this.style.transform=''">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
    Lihat di Halaman Transaksi
  </button>
</div>`;
  renderAccSheetBody();
}
function renderAccSheetBody() {
  const body = el('accSheetBody'); if (!body) return;
  // Bug #12 fix: guard jika sheet sudah ditutup (accSheetId null)
  if (!accSheetId) return;

  // Bug #12 fix: jika bulan yang dipilih bukan bulan cache, fetch dulu dari API
  const cachedTxForMon = getTx().filter(t => mKey(t.date) === accSheetMon);
  if (cachedTxForMon.length === 0 && accSheetMon !== thisMon()) {
    // Fetch bulan yang dipilih, lalu render ulang
    fetchTx(accSheetMon).then(() => renderAccSheetBody()).catch(() => {});
    body.innerHTML = `<div class="empty" style="padding:2rem"><p>Memuat data...</p></div>`;
    return;
  }

  const allTx = getTx().filter(t => mKey(t.date) === accSheetMon);
  let txs = allTx.filter(t => t.account_id === accSheetId || t.to_acc_id === accSheetId);
  if (accSheetTab === 'in') txs = txs.filter(t => (t.type === 'income' && t.account_id === accSheetId) || (t.type === 'transfer' && t.to_acc_id === accSheetId));
  if (accSheetTab === 'out') txs = txs.filter(t => (t.type === 'expense' && t.account_id === accSheetId) || (t.type === 'transfer' && t.account_id === accSheetId && t.to_acc_id !== accSheetId));
  txs = [...txs].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || b.id).localeCompare(a.created_at || a.id));
  if (!txs.length) { body.innerHTML = `<div class="empty" style="padding:2rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg><p>Tidak ada transaksi</p></div>`; return; }
  const groups = {};
  txs.forEach(t => { if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
  body.innerHTML = Object.entries(groups).map(([date, list]) => {
    const items = list.map(tx => {
      const cat = catBy(tx.category_id);
      const isIn = (tx.type === 'income' && tx.account_id === accSheetId) || (tx.type === 'transfer' && tx.to_acc_id === accSheetId);
      const isTrf = tx.type === 'transfer';
      const cls = isTrf ? 'trf' : isIn ? 'inc' : 'exp';
      const sign = isTrf ? '↔' : isIn ? '+' : '−';
      const ico = isTrf ? `<img src="/icons/icon-transfer.svg" class="cat-icon-sm" width="20" height="20" alt="">` : getCatIcon(tx.category_id);
      const toAcc = tx.to_acc_id ? getAccs().find(a => a.id === tx.to_acc_id) : null;
      const subLabel = isTrf ? (isIn ? `dari ${accBy(tx.account_id).name}` : `ke ${toAcc ? toAcc.name : '-'}`) : `${esc(cat.name)}`;
      return `<div class="acc-tx-item">
    <div class="acc-tx-ico ${cls}">${ico}</div>
    <div class="acc-tx-info">
      <div class="acc-tx-name">${esc(tx.note || cat.name)}</div>
      <div class="acc-tx-cat">${subLabel}</div>
    </div>
    <div class="acc-tx-amt ${cls}">${sign}${fCur(tx.amount)}</div>
  </div>`;
    }).join('');
    return `<div class="acc-tx-group"><div class="acc-tx-date">${fDate(date)}</div>${items}</div>`;
  }).join('');
}

function toggleThemeSection() {
  const elCollapse = el('settThemeCollapse');
  const chev = el('themeChevron');
  if (!elCollapse || !chev) return;
  const isHidden = elCollapse.style.display === 'none';
  elCollapse.style.display = isHidden ? 'block' : 'none';
  chev.style.transform = isHidden ? 'rotate(90deg)' : '';
}

function toggleProfileEdit() {
  const elCollapse = el('settProfileCollapse');
  const chev = el('profileChevron');
  if (!elCollapse || !chev) return;
  const isHidden = elCollapse.style.display === 'none';
  elCollapse.style.display = isHidden ? 'block' : 'none';
  chev.style.transform = isHidden ? 'rotate(90deg)' : '';
}

function showDeleteAccountConfirm() {
  const pw = prompt('⚠️ HAPUS AKUN PERMANEN\n\nSemua data (transaksi, rekening, kategori, dll) akan dihapus dan tidak bisa dikembalikan.\n\nMasukkan password kamu untuk konfirmasi:');
  if (!pw) return;
  if (!confirm('Yakin ingin menghapus akun? Tindakan ini TIDAK BISA dibatalkan.')) return;
  deleteAccountPermanent(pw);
}

async function deleteAccountPermanent(password) {
  try {
    toast('Menghapus akun...', 'info');
    await api('POST', '/auth/delete-account', { password });
    toast('Akun berhasil dihapus.', 'ok');
    localStorage.clear();
    setTimeout(() => { window.location.reload(); }, 1500);
  } catch (e) {
    toast(e.message || 'Gagal menghapus akun', 'err');
  }
}
