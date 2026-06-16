// ══════════════════════════════════════
// transactions.js — Transactions Page
// ══════════════════════════════════════

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
  const q = (el('txSearch').value || '').toLowerCase().trim();
  if (q) txs = txs.filter(t => { const c = catBy(t.category_id); return (t.note || '').toLowerCase().includes(q) || (c?.name || '').toLowerCase().includes(q); });
  const type = el('txType').value; if (type !== 'all') txs = txs.filter(t => t.type === type);
  const cat = el('txCat').value; if (cat !== 'all') txs = txs.filter(t => t.category_id === cat);
  if (mon) txs = txs.filter(t => mKey(t.date) === mon);
  txs.sort((a, b) => { 
    let va = a[sortF], vb = b[sortF]; 
    if (sortF === 'amount') { va = +va; vb = +vb; } else { va = String(va || ''); vb = String(vb || ''); } 
    if (va === vb) return (b.created_at || b.id).localeCompare(a.created_at || a.id);
    return sortA ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1); 
  });
  el('txSub').textContent = txs.length + ' transaksi ditemukan';
  const tot = Math.max(1, Math.ceil(txs.length / TX_PER)); if (txPg > tot) txPg = tot;
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
  let html = '<ul class="txcl">';
  sortedDates.forEach(dk => {
    const dayTxs = groups[dk];
    const dayNet = dayTxs.reduce((s, t) => t.type === 'income' ? s + t.amount : t.type === 'expense' ? s - t.amount : s, 0);
    const netStr = dayNet === 0 ? '' : fCur(dayNet, true);
    const netC = dayNet > 0 ? 'var(--income)' : dayNet < 0 ? 'var(--expense)' : 'var(--t3)';
    html += `<li class="txcl-grp">${fDate(dk)}<span class="txcl-grp-tot" style="color:${netC}">${netStr}</span></li>`;
    dayTxs.forEach(tx => {
      const catName = tx.category_name || catBy(tx.category_id).name;
      const catEmoji = tx.category_emoji || '';
      const accName = tx.account_name || accBy(tx.account_id).name;
      const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '↔';
      const tc = tx.type === 'income' ? 'inc' : tx.type === 'expense' ? 'exp' : 'trf';
      const srcPip = tx.source === 'telegram' ? `<div class="txcl-pip"><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.29 6.29l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></div>` : '';
      const timeStr = tx.created_at ? new Date(tx.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
      const dispName = tx.store ? `${tx.note || catName} • 🏪 ${tx.store}` : (tx.note || catName);
      html += `<li class="txcl-item" onclick="openTxDetail('${tx.id}')">
    <div class="txcl-ico-wrap">
      <div class="txcl-ico ${tc}">${tc === 'trf' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>` : `<span style="font-size:13px">${catEmoji}</span>`}</div>
      ${srcPip}
    </div>
    <div class="txcl-body">
      <div class="txcl-name">${esc(dispName)}</div>
      <div class="txcl-meta">
        <span class="txcl-cat ${tc}">${esc(catName)}</span>
        <span>${esc(accName)}</span>
      </div>
    </div>
    <div class="txcl-right">
      <div class="txcl-amt ${tc}">${sign}${fCur(tx.amount)}</div>
      ${timeStr ? `<div class="txcl-time">${timeStr}</div>` : ''}
    </div>
  </li>`;
    });
  });
  html += '</ul>';
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
      idempotency_key: data.idempotency_key || crypto.randomUUID()
    };
    await api('POST', '/transactions', body);
    // Refresh cache
    const m = (data.date || today()).slice(0, 7);
    await Promise.all([fetchTx(m), fetchAccs()]);
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
    closeModal(); toast('Diperbarui!', 'ok'); refresh();
  } catch (e) {
    toast('Gagal update: ' + e.message, 'err');
  }
}
function openTxDetail(id) {
  const tx = getTx().find(t => t.id === id); if (!tx) return;
  // D1 join sudah bawa account_name, category_name, category_emoji
  const catName = tx.category_name || catBy(tx.category_id).name;
  const catEmoji = tx.category_emoji || catBy(tx.category_id).emoji || '';
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
    <div class="tx-detail-row"><span class="tx-detail-lbl">Kategori</span><span class="tx-detail-val" style="display:flex;align-items:center;gap:.35rem;justify-content:flex-end"><span>${catEmoji}</span><span>${esc(catName)}</span></span></div>
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
