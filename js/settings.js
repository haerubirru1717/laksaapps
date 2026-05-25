// ══════════════════════════════════════
// settings.js — Settings, Accounts, Categories, Backup
// ══════════════════════════════════════

function renderSettings() {
  const s = getSet();
  el('sName').value = s.name || ''; el('sCurr').value = s.currency || 'Rp';
  applyTheme(s.theme || 'glass', null, false);
  renderAccList(); renderCatList();
}
function saveS() {
  const s = getSet(); s.name = el('sName').value.trim() || 'Pengguna'; s.currency = el('sCurr').value;
  const activeTheme = document.documentElement.getAttribute('data-theme') || 'glass';
  s.theme = activeTheme;
  sv(K.set, s); toast('Disimpan!', 'ok');
}
function renderAccList() {
  el('accList').innerHTML = getAccs().map(a => {
    const b = detBank(a.name); const clr = (b && b.color) ? b.color : (a.color || '#a78bfa');
    return `<li class="acc-item"><span style="display:flex;align-items:center;gap:.42rem;text-transform:uppercase"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${clr}"></span>${esc(a.name)}</span><span style="display:flex;align-items:center;gap:.5rem"><span class="acc-item-bal">${fCur(a.balance)}</span><button class="abtn del" onclick="delAcc('${a.id}')" title="Hapus rekening"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span></li>`;
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
function renderCatList() {
  el('catList').innerHTML = getCats().map(c => `<li class="chip"><span>${esc(c.name)}</span><button class="chip-del" onclick="delCat('${c.id}')"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></li>`).join('');
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

// ── SCAN STRUK ──

// ── Backup & Restore ──
function doBackup() {
  const d = {
    v: 2,
    date: new Date().toISOString(),
    transactions: getTx(),
    accounts: getAccs(),
    categories: getCats(),
    budgets: getBud(),
    goals: getGoals(),
    bills: getBills(),
    settings: getSet(),
    receipts: getRec()
  };
  dlF(JSON.stringify(d, null, 2), 'laksa_backup_' + today() + '.json', 'application/json');
  toast('Backup berhasil!', 'ok');
}
async function doRestore(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.transactions) throw new Error('Format invalid');
      if (!confirm('Restore akan memulihkan semua data ke server. Lanjutkan?')) return;
      // Settings & receipts tetap lokal
      if (d.settings) sv(K.set, d.settings);
      if (d.receipts) sv(K.rec, d.receipts);
      showLoadingOverlay(true);
      let txOk = 0, txFail = 0, billOk = 0, goalOk = 0, budOk = 0;
      // Transaksi → D1
      if (d.transactions?.length) {
        for (const tx of d.transactions) {
          try {
            await api('POST', '/transactions', {
              type: tx.type, amount: tx.amount, date: tx.date,
              account_id: tx.account_id, category_id: tx.category_id,
              note: tx.note || '', store: tx.store || null, source: 'restore'
            });
            txOk++;
          } catch (e) { txFail++; }
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
    } catch (e) { toast('File tidak valid: ' + e.message, 'err'); }
  };
  r.readAsText(file); ev.target.value = '';
}
function expCSV() {
  const year = el('repYear').value;
  const MFULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const txs = getTx().filter(t => t.date.startsWith(year));
  const rows = [['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih', 'Tabungan%']];
  MFULL.forEach((m, i) => { const mk = year + '-' + String(i + 1).padStart(2, '0'); const mTx = txs.filter(t => mKey(t.date) === mk); const mi = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0); const me = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0); const diff = mi - me; rows.push([m, mi, me, diff, mi > 0 ? ((diff / mi) * 100).toFixed(1) + '%' : '0%']); });
  dlF(rows.map(r => r.join(',')).join('\n'), 'laksa_' + year + '.csv', 'text/csv'); toast('CSV diunduh!', 'ok');
}
async function resetAll() {
  const typed = prompt('HAPUS SEMUA DATA?\\nKetik "HAPUS" (tanpa tanda kutip) untuk mengonfirmasi. Ini akan menghapus semua transaksi, rekening, dan kategori dari server.');
  if (typed !== 'HAPUS') {
    if (typed !== null) toast('Batal: Kata yang diketik tidak sesuai.', 'info');
    return;
  }
  showLoadingOverlay(true);
  try {
    // Hapus semua transaksi di D1
    const txs = getTx();
    for (const tx of txs) {
      try { await api('DELETE', `/transactions/${tx.id}`); } catch (e) { }
    }
    // Hapus semua rekening di D1
    const accs = getAccs();
    for (const a of accs) {
      try { await api('DELETE', `/accounts/${a.id}`); } catch (e) { }
    }
    // Hapus semua kategori di D1
    const cats = getCats();
    for (const c of cats) {
      try { await api('DELETE', `/categories/${c.id}`); } catch (e) { }
    }
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
  if (nm2.includes('gopay'))                               ewDarkImg2 = 'ewallet/gopay-dark.jpg';
  else if (nm2.includes('ovo'))                            ewDarkImg2 = 'ewallet/ovo-dark.jpg';
  else if (nm2.includes('dana'))                           ewDarkImg2 = 'ewallet/dana-dark.jpg';
  else if (nm2.includes('linkaja'))                        ewDarkImg2 = 'ewallet/linkaja-dark.jpg';
  else if (nm2.includes('shopee') || nm2.includes('spay')) ewDarkImg2 = 'ewallet/shopeepay-dark.jpg';
  
  const ewSheetImg  = ewDarkImg2;
  const sheetAvaBg  = (isEwalletAcc && ewSheetImg)
    ? `background:linear-gradient(135deg,${c1},${c2})`
    : `background:linear-gradient(135deg,${c1},${c2})`;
  
  const sheetInit = (acc.name.replace(/[^a-zA-Z0-9]/g,'').slice(0,2)||'?').toUpperCase();
  const logoHtml = (isEwalletAcc && ewSheetImg)
    ? `<img src="${ewSheetImg}" style="width:80%;height:80%;object-fit:contain;border-radius:10px;" onerror="this.style.display='none'">
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
      const ico = isTrf ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>` : getCatIcon(tx.category_id);
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
