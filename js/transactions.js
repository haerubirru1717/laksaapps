// ══════════════════════════════════════
// transactions.js — Transactions Page
// ══════════════════════════════════════

let chartStartDay = null;
let currentChartMonth = '';
let lastFilteredTxs = [];
let lastActiveTab = 'all';

function shiftChartRange(direction) {
  const selectedMonth = el('txMonth').value || thisMon();
  const [yearStr, monthStr] = selectedMonth.split('-');
  const yyyy = parseInt(yearStr);
  const mm = parseInt(monthStr);
  const daysInMonth = new Date(yyyy, mm, 0).getDate();

  if (direction === -1) {
    chartStartDay = Math.max(1, chartStartDay - 7);
  } else if (direction === 1) {
    chartStartDay = Math.min(Math.max(1, daysInMonth - 6), chartStartDay + 7);
  }

  drawTxChart(lastFilteredTxs);
}

function renderTxPage() {
  populateCatFilter();
  const m = el('txMonth'); if (!m.value) m.value = thisMon();
  filterTx();
}
function populateCatFilter() {
  const sel = el('txCat'), cur = sel.value;
  sel.innerHTML = '<option value="all">Semua Kategori</option>' + getCats().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = cur;
}
function debF() { clearTimeout(fTimer); fTimer = setTimeout(filterTx, 200); }
function filterTx() {
  const mon = el('txMonth').value || thisMon();
  // Reload dari API jika bulan berubah
  if (mon !== curTxMonth) {
    curTxMonth = mon;
    fetchTx(mon).then(() => { _doFilterTx(mon); }).catch(e => toast('Gagal muat: ' + e.message, 'err'));
    return;
  }
  _doFilterTx(mon);
}
function _doFilterTx(mon) {
  let txs = getTx();
  const searchEl = el('txSearch');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  if (q) txs = txs.filter(t => { const c = catBy(t.category_id); return (t.note || '').toLowerCase().includes(q) || (c?.name || '').toLowerCase().includes(q); });
  
  const typeEl = el('txType');
  const type = typeEl ? typeEl.value : 'all';
  if (type !== 'all') txs = txs.filter(t => t.type === type);
  
  const catEl = el('txCat');
  const cat = catEl ? catEl.value : 'all';
  if (cat !== 'all') txs = txs.filter(t => t.category_id === cat);
  
  if (mon) txs = txs.filter(t => mKey(t.date) === mon);
  txs.sort((a, b) => { 
    let va = a[sortF], vb = b[sortF]; 
    if (sortF === 'amount') { va = +va; vb = +vb; } else { va = String(va || ''); vb = String(vb || ''); } 
    if (va === vb) return (b.created_at || b.id).localeCompare(a.created_at || a.id);
    return sortA ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1); 
  });
  
  const subEl = el('txSub');
  if (subEl) subEl.textContent = txs.length + ' transaksi ditemukan';
  
  const tot = Math.max(1, Math.ceil(txs.length / TX_PER)); if (txPg > tot) txPg = tot;
  
  // Draw premium dynamic hermite bezier spline chart
  lastFilteredTxs = txs;
  lastActiveTab = type;
  drawTxChart(txs);

  renderTxTbl(txs.slice((txPg - 1) * TX_PER, txPg * TX_PER), txs.length === 0);
  renderPgn(tot);
}
function renderTxTbl(txs, empty) {
  const wrap = el('txList'), emp = el('txEmpty');
  if (empty) { wrap.innerHTML = ''; emp.style.display = 'flex'; return; }
  emp.style.display = 'none';
  // group by date
  const groups = {};
  txs.forEach(tx => { const dk = tx.date || '?'; if (!groups[dk]) groups[dk] = []; groups[dk].push(tx); });
  const sortedDates = Object.keys(groups).sort((a, b) => sortA ? a.localeCompare(b) : b.localeCompare(a));
  let html = '';
  sortedDates.forEach(dk => {
    const dayTxs = groups[dk];
    const dayInc = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const dayExp = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    
    let totalHtml = '';
    if (dayInc > 0) {
      totalHtml += `<span class="txcl-grp-tot-val inc" style="color:#2ecc71;font-weight:700">+${fCur(dayInc)}</span>`;
    }
    if (dayExp > 0) {
      totalHtml += `<span class="txcl-grp-tot-val exp" style="color:#ff4d4d;font-weight:700;margin-left:8px;">−${fCur(dayExp)}</span>`;
    }
    
    html += `<div class="tx-date-group-card">`;
    html += `<div class="txcl-grp">${fDate(dk)}<div class="txcl-grp-tots">${totalHtml}</div></div>`;
    html += `<ul class="txcl">`;
    
    dayTxs.forEach(tx => {
      const catName = tx.category_name || catBy(tx.category_id).name;
      const accName = tx.account_name || accBy(tx.account_id).name;
      const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '';
      const tc = tx.type === 'income' ? 'inc' : tx.type === 'expense' ? 'exp' : 'trf';
      const srcPip = tx.source === 'telegram' ? `<div class="txcl-pip"><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></div>` : '';
      const timeStr = tx.created_at ? new Date(tx.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
      const dispName = tx.note || catName;
      
      const premiumIcon = getPremiumCategorySvg(catName, tc);
      
      html += `<li class="txcl-item" onclick="openTxDetail('${tx.id}')">
    <div class="txcl-ico-wrap">
      <div class="txcl-ico ${tc}">${premiumIcon}</div>
      ${srcPip}
    </div>
    <div class="txcl-body">
      <div class="txcl-name">${esc(dispName)}</div>
      <div class="txcl-meta">
        ${timeStr ? `<span class="txcl-time">${timeStr}</span><span class="txcl-dot">•</span>` : ''}
        <span class="txcl-cat ${tc}">${esc(catName)}</span>
      </div>
    </div>
    <div class="txcl-right">
      <div class="txcl-amt ${tc}">${sign}${fCur(tx.amount)}</div>
      <div class="txcl-acc-badge">${esc(accName)}</div>
    </div>
  </li>`;
    });
    
    html += `</ul>`;
    html += `</div>`;
  });
  wrap.innerHTML = html;
}
function renderPgn(tot) {
  const p = el('txPgn'); if (tot <= 1) { p.innerHTML = ''; return; }
  let h = `<button class="pgbtn" onclick="goPg(${txPg - 1})" ${txPg === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= tot; i++) {
    if (i === 1 || i === tot || Math.abs(i - txPg) <= 1) h += `<button class="pgbtn ${i === txPg ? 'active' : ''}" onclick="goPg(${i})">${i}</button>`;
    else if (Math.abs(i - txPg) === 2) h += '<span style="color:var(--t3);padding:.2rem .3rem">…</span>';
  }
  h += `<button class="pgbtn" onclick="goPg(${txPg + 1})" ${txPg === tot ? 'disabled' : ''}>›</button>`;
  p.innerHTML = h;
}
function goPg(p) { txPg = p; filterTx(); }
function sortTx(f) { if (sortF === f) sortA = !sortA; else { sortF = f; sortA = false; } ['date', 'amount'].forEach(k => { const ic = el('s' + k[0]); if (ic) ic.textContent = k === f ? (sortA ? '↑' : '↓') : '↕'; }); filterTx(); }

// ── TX CRUD ──
let _addTxLock = false;
async function addTx(data, silent = false) {
  if (_addTxLock && !silent) return;
  _addTxLock = true;
  try {
    // Mapping field lama (categoryId/accountId) ke field baru (category_id/account_id)
    const body = {
      type: data.type,
      amount: data.amount,
      date: data.date || today(),
      account_id: data.account_id || data.accountId,
      category_id: data.category_id || data.categoryId,
      note: data.note || '',
      store: data.store || null,
      source: 'website',
      idempotency_key: data.idempotency_key || genUUID()
    };
    await api('POST', '/transactions', body);
    // Refresh cache
    const m = (data.date || today()).slice(0, 7);
    await Promise.all([fetchTx(m), fetchAccs()]);
    // Bug #13 fix: invalidasi cache tahun agar halaman Laporan tidak stale
    if (typeof _cache !== 'undefined') _cache.txYear = null;
    if (!silent) { closeModal(); toast('Transaksi ditambahkan!', 'ok'); refresh(); }
  } catch (e) {
    toast('Gagal simpan: ' + e.message, 'err');
  } finally {
    _addTxLock = false;
  }
}
function updBal() { }// Tidak diperlukan — D1 yang urus saldo
async function delTx(id, silent = false) {
  if (!silent && !confirm('Hapus transaksi ini?')) return;
  try {
    await api('DELETE', `/transactions/${id}`);
    const m = curTxMonth || thisMon();
    await Promise.all([fetchTx(m), fetchAccs()]);
    // Bug #13 fix: invalidasi cache tahun agar halaman Laporan tidak stale
    if (typeof _cache !== 'undefined') _cache.txYear = null;
    if (!silent) { toast('Dihapus.', 'info'); refresh(); }
  } catch (e) {
    toast('Gagal hapus: ' + e.message, 'err');
  }
}
async function updateTx(id, data) {
  try {
    const body = {
      type: data.type,
      amount: data.amount,
      date: data.date,
      account_id: data.account_id || data.accountId,
      category_id: data.category_id || data.categoryId,
      note: data.note || '',
      store: data.store || null,
    };
    await api('PATCH', `/transactions/${id}`, body);
    const m = (data.date || today()).slice(0, 7);
    await Promise.all([fetchTx(m), fetchAccs()]);
    // Bug #13 fix: invalidasi cache tahun agar halaman Laporan tidak stale
    if (typeof _cache !== 'undefined') _cache.txYear = null;
    closeModal(); toast('Diperbarui!', 'ok'); refresh();
  } catch (e) {
    toast('Gagal update: ' + e.message, 'err');
  }
}
function openTxDetail(id) {
  const tx = getTx().find(t => t.id === id); if (!tx) return;
  // D1 join sudah bawa account_name, category_name, category_emoji
  const catName = tx.category_name || catBy(tx.category_id).name;
  const catType = tx.type === 'transfer' ? 'transfer' : tx.type || 'expense';
  const catSvgFile = getCatSvgFile(catName, catType);
  const catIconHtml = `<img src="/icons/${catSvgFile}.svg" class="cat-icon-sm" width="18" height="18" alt="">`;
  const accName = tx.account_name || accBy(tx.account_id).name;
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '↔';
  const tc = tx.type === 'income' ? 'inc' : tx.type === 'expense' ? 'exp' : 'trf';
  const typeLabel = tx.type === 'income' ? 'Pemasukan' : tx.type === 'expense' ? 'Pengeluaran' : 'Transfer';
  const srcBadge = tx.source === 'telegram'
    ? `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.22rem .62rem;border-radius:99px;background:rgba(37,99,235,.1);border:1.5px solid rgba(37,99,235,.2);font-family:'JetBrains Mono',monospace;font-size:.65rem;font-weight:600;color:var(--accent)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>Telegram</span>`
    : `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.22rem .62rem;border-radius:99px;background:rgba(16,185,129,.08);border:1.5px solid rgba(16,185,129,.2);font-family:'JetBrains Mono',monospace;font-size:.65rem;font-weight:600;color:var(--income)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Website</span>`;
  const timeStr = tx.created_at ? new Date(tx.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
  const dateTimeStr = fDate(tx.date) + (timeStr ? ' · ' + timeStr : '');
  el('txSheet').innerHTML = `
<div class="tx-sheet-handle"></div>
<div class="tx-sheet-body">
  <div style="text-align:center;padding:.6rem 0 1rem">
    <div style="font-family:'JetBrains Mono',monospace;font-size:.68rem;color:var(--ink3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.35rem">${typeLabel}</div>
    <div style="font-size:2rem;font-weight:800;letter-spacing:-.04em;color:var(--${tc === 'inc' ? 'income' : tc === 'exp' ? 'expense' : 'accent2'})">${sign}${fCur(tx.amount)}</div>
    <div style="margin-top:.55rem">${srcBadge}</div>
  </div>
  <div style="background:var(--gs-2);backdrop-filter:blur(12px);border:1.5px solid var(--gs-border);border-radius:16px;padding:.2rem .9rem;margin-bottom:.85rem">
    <div class="tx-detail-row"><span class="tx-detail-lbl">Keterangan</span><span class="tx-detail-val">${esc(tx.note || catName)}</span></div>
    ${tx.store ? `<div class="tx-detail-row"><span class="tx-detail-lbl">Toko</span><span class="tx-detail-val">${esc(tx.store)}</span></div>` : ''}
    <div class="tx-detail-row"><span class="tx-detail-lbl">Kategori</span><span class="tx-detail-val" style="display:flex;align-items:center;gap:.35rem;justify-content:flex-end">${catIconHtml}<span>${esc(catName)}</span></span></div>
    <div class="tx-detail-row"><span class="tx-detail-lbl">Rekening</span><span class="tx-detail-val">${esc(accName)}</span></div>
    <div class="tx-detail-row"><span class="tx-detail-lbl">Tanggal</span><span class="tx-detail-val">${dateTimeStr}</span></div>
  </div>
</div>
<div class="tx-sheet-foot">
  <button onclick="closeTxSheet();openEditTx('${tx.id}')" style="flex:1;padding:.55rem;border-radius:12px;border:1.5px solid rgba(37,99,235,.3);background:var(--gs-3);backdrop-filter:blur(12px);color:var(--accent);font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.38rem;transition:all .15s">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit
  </button>
  <button onclick="closeTxSheet();delTx('${tx.id}')" style="flex:1;padding:.55rem;border-radius:12px;border:1.5px solid rgba(230,60,30,.25);background:rgba(230,60,30,.06);color:var(--expense);font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.38rem;transition:all .15s" onmouseover="this.style.background='rgba(230,60,30,.12)'" onmouseout="this.style.background='rgba(230,60,30,.06)'">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Hapus
  </button>
</div>`;
  el('txSheetOverlay').classList.add('open');
  el('txSheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeTxSheet() {
  el('txSheetOverlay').classList.remove('open');
  el('txSheet').classList.remove('open');
  document.body.style.overflow = '';
}
function openEditTx(id) { const tx = getTx().find(t => t.id === id); if (tx) openModal('addTransaction', tx); }
// updateTx sudah di atas (async, API)

// ── BUDGET (D1) ──

// ── PREMIUM CHART — DUAL LINE (Income + Expense) ──
function drawTxChart(txs) {
  const canvas = el('txChartCanvas');
  const netEl = el('txChartNet');
  const subEl = el('txChartSub');
  if (!canvas || !netEl || !subEl) return;

  if (CH.txChart) {
    try { CH.txChart.destroy(); } catch (e) {}
    delete CH.txChart;
  }

  let placeholder = el('txChartPlaceholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = 'txChartPlaceholder';
    placeholder.className = 'tx-chart-placeholder';
    placeholder.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:0.75rem;';
    canvas.parentNode.appendChild(placeholder);
  }

  if (!txs || !txs.length) {
    canvas.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.textContent = 'Belum ada data tren untuk filter ini';
    subEl.textContent = 'Belum ada transaksi';
    netEl.textContent = 'Rp 0';
    netEl.style.color = 'inherit';
    return;
  }

  canvas.style.display = 'block';
  placeholder.style.display = 'none';

  // Group transactions by date
  const daily = {};
  txs.forEach(t => {
    const d = t.date || today();
    if (!daily[d]) daily[d] = { inc: 0, exp: 0 };
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') daily[d].inc += amt;
    else if (t.type === 'expense') daily[d].exp += amt;
  });

  const selectedMonth = el('txMonth').value || thisMon();
  const [yearStr, monthStr] = selectedMonth.split('-');
  const yyyy = parseInt(yearStr);
  const mm = parseInt(monthStr);
  const daysInMonth = new Date(yyyy, mm, 0).getDate();

  if (currentChartMonth !== selectedMonth) {
    currentChartMonth = selectedMonth;
    if (selectedMonth === thisMon()) {
      const todayD = new Date().getDate();
      chartStartDay = Math.max(1, Math.min(daysInMonth - 6, todayD - 6));
    } else {
      chartStartDay = Math.max(1, daysInMonth - 6);
    }
  }

  // 7-day window
  const chartDates = [];
  for (let i = 0; i < 7; i++) {
    const d = chartStartDay + i;
    chartDates.push(`${yearStr}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  // Daily income & expense (non-cumulative)
  const incPoints = [];
  const expPoints = [];

  chartDates.forEach(d => {
    const val = daily[d] || { inc: 0, exp: 0 };
    incPoints.push(val.inc);
    expPoints.push(val.exp);
  });

  // Labels
  const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const labels = chartDates.map(d => {
    const dateObj = new Date(d + 'T00:00:00');
    return `${dateObj.getDate()} ${monthsList[dateObj.getMonth()]}`;
  });

  // Range label
  const rangeLbl = el('chartRangeLabel');
  if (rangeLbl) rangeLbl.textContent = `${labels[0]} - ${labels[6]}`;

  // Nav button states
  const btnPrev = el('chartBtnPrev');
  const btnNext = el('chartBtnNext');
  if (btnPrev) btnPrev.disabled = (chartStartDay === 1);
  if (btnNext) btnNext.disabled = (chartStartDay === Math.max(1, daysInMonth - 6));

  // 7-day totals for header
  let totalInc = 0, totalExp = 0;
  txs.forEach(t => {
    if (chartDates.includes(t.date)) {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'income') totalInc += amt;
      else if (t.type === 'expense') totalExp += amt;
    }
  });

  const displayNet = totalInc - totalExp;
  subEl.textContent = 'Pemasukan vs Pengeluaran harian';
  netEl.textContent = (displayNet >= 0 ? '+' : '') + fCur(displayNet);
  netEl.style.color = displayNet > 0 ? '#2ecc71' : displayNet < 0 ? '#ff4d4d' : 'inherit';

  // Theme detection
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const isEd = document.documentElement.getAttribute('data-theme') === 'education';
  Chart.defaults.color = isDark ? 'rgba(210,220,240,0.7)' : (isEd ? '#0f172a' : 'rgba(15,23,42,0.55)');
  Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.08)' : (isEd ? 'rgba(15,23,42,0.15)' : 'rgba(15,23,42,0.08)');

  // Gradients
  const ctx = canvas.getContext('2d');
  const gradInc = ctx.createLinearGradient(0, 0, 0, 130);
  gradInc.addColorStop(0, isDark ? 'rgba(46,204,113,0.25)' : 'rgba(46,204,113,0.15)');
  gradInc.addColorStop(1, 'rgba(46,204,113,0)');

  const gradExp = ctx.createLinearGradient(0, 0, 0, 130);
  gradExp.addColorStop(0, isDark ? 'rgba(255,77,77,0.25)' : 'rgba(255,77,77,0.15)');
  gradExp.addColorStop(1, 'rgba(255,77,77,0)');

  const config = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: incPoints,
          borderColor: '#2ecc71',
          borderWidth: 2.5,
          backgroundColor: gradInc,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#2ecc71',
          pointBorderColor: isDark ? '#1e293b' : '#ffffff',
          pointBorderWidth: 1.5,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#2ecc71',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Pengeluaran',
          data: expPoints,
          borderColor: '#ff4d4d',
          borderWidth: 2.5,
          backgroundColor: gradExp,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#ff4d4d',
          pointBorderColor: isDark ? '#1e293b' : '#ffffff',
          pointBorderWidth: 1.5,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ff4d4d',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#ffffff' : '#0f172a',
          bodyColor: isDark ? '#e2e8f0' : '#334155',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.08)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 12,
          titleFont: { family: "'Inter', sans-serif", size: 11, weight: 'bold' },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 11, weight: 'bold' },
          callbacks: {
            title: function(context) { return fDate(chartDates[context[0].dataIndex]); },
            label: function(context) {
              const prefix = context.datasetIndex === 0 ? '↑ Pemasukan: ' : '↓ Pengeluaran: ';
              return prefix + fCur(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxTicksLimit: 6, font: { family: "'JetBrains Mono', monospace", size: 9, weight: '600' } }
        },
        y: {
          grid: { borderDash: [3, 3], color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)' },
          ticks: { callback: function(v) { return fCurS(v); }, maxTicksLimit: 4, font: { family: "'JetBrains Mono', monospace", size: 9, weight: '600' } }
        }
      }
    }
  };

  try {
    CH.txChart = new Chart(canvas, config);
  } catch (e) {
    console.error('Gagal membuat Chart.js transaksi:', e);
  }
}

function getPremiumCategorySvg(catName, tc) {
  const type = tc === 'inc' ? 'income' : tc === 'trf' ? 'transfer' : 'expense';
  const file = getCatSvgFile(catName, type);
  return `<img src="/icons/${file}.svg" class="cat-svg-icon" width="42" height="42" alt="">`;
}

