// ══════════════════════════════════════
// modals.js — Modal System & Form Builders
// ══════════════════════════════════════

function closeModal() {
  const overlay = el('moverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  // Kembalikan AI FAB
  const fab = el('aiFab');
  if (fab) { fab.style.opacity = ''; fab.style.pointerEvents = ''; fab.style.zIndex = ''; }
  setTimeout(() => {
    const body = el('mbody');
    if (body && !overlay.classList.contains('open')) body.innerHTML = '';
  }, 200);
}
function handleOC(e) { if (e.target === el('moverlay')) closeModal(); }

// ── MODAL ──
function openModal(type, data = null) {
  const overlay = el('moverlay'), title = el('mtitle'), body = el('mbody');
  const builders = {
    addTransaction: () => buildTxForm(data), addBudget: () => buildBudForm(),
    addGoal: () => buildGoalForm(), addToGoal: () => buildAddToGoalForm(data),
    addAccount: () => buildAccForm(), addCategory: () => buildCatForm(),
    addBill: () => buildBillForm(data), payBill: () => buildPayBillForm(data),
    billHistory: () => buildBillHistory(data),
    addPiutang: () => buildPiutangForm(data), returnPiutang: () => buildReturnPiutangForm(data)
  };
  const build = builders[type]; if (!build) return;
  const { t, html, onSubmit } = build();
  title.textContent = t; body.innerHTML = html;
  if (onSubmit) {
    const form = body.querySelector('form');
    if (form) {
      let isSubmitting = false;
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (isSubmitting) return;
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          isSubmitting = true;
          btn.disabled = true;
          const origText = btn.innerHTML;
          btn.innerHTML = '⏳ Menyimpan…';
          try {
            await onSubmit();
          } catch (err) {
            console.error(err);
          } finally {
            isSubmitting = false;
            const overlay = el('moverlay');
            if (overlay && overlay.classList.contains('open') && document.body.contains(form)) {
              btn.disabled = false;
              btn.innerHTML = origText;
            }
          }
        } else {
          try {
            await onSubmit();
          } catch (err) {
            console.error(err);
          }
        }
      });
    }
  }
  overlay.classList.add('open');
  // Sembunyikan AI FAB saat modal terbuka
  const fab = el('aiFab');
  if (fab) { fab.style.opacity = '0'; fab.style.pointerEvents = 'none'; fab.style.zIndex = '999'; }
  setTimeout(() => {
    const f = body.querySelector('input:not([type=hidden]),select'); if (f) f.focus();
    ['txAmt', 'bLim', 'gTgt', 'aBal', 'agAmt', 'billAmt', 'ptgAmt', 'ptgReturned', 'ptgReturnAmt'].forEach(id => setupAmtInput(id));
    // Init bill type chips
    document.querySelectorAll('.bill-type-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bill-type-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        el('billTypeVal').value = btn.dataset.val;
      });
    });
  }, 80);
}
function buildBillForm(bill = null) {
  const isEdit = !!bill;
  const defType = bill?.bill_type || 'cc';
  const typeChips = BILL_TYPES.map(t => `<button type="button" class="bill-type-opt${t.id === defType ? ' active' : ''}" data-val="${t.id}">${t.label}</button>`).join('');
  const defDueType = bill?.due_type || 'monthly';
  const defDueDay = bill?.due_day || 1;
  const defDueDate = bill?.due_date || today();
  const html = `<form>
<input type="hidden" id="billTypeVal" value="${defType}"/>
<div class="fg"><label class="flbl">Nama Tagihan *</label>
  <input type="text" class="finp" id="billName" placeholder="Kartu Kredit BCA, Akulaku, Netflix…" value="${esc(bill?.name || '')}" required/>
</div>
<div class="fg"><label class="flbl">Jenis Tagihan</label>
  <div class="bill-type-opts">${typeChips}</div>
</div>
<div class="fg"><label class="flbl">Nominal</label>
  <input type="text" class="finp" id="billAmt" placeholder="0 (kosongkan jika belum tahu)" value="${bill?.amount > 0 ? bill.amount : ''}"/>
</div>
<div class="fg"><label class="flbl">Pengulangan</label>
  <div style="display:flex;gap:.5rem">
    <label style="flex:1;display:flex;align-items:center;gap:.45rem;padding:.55rem .7rem;border-radius:10px;border:1.5px solid var(--gs-border);cursor:pointer;background:var(--gs-2)" id="lblMonthly">
      <input type="radio" name="dueType" value="monthly" ${defDueType === 'monthly' ? 'checked' : ''} onchange="toggleDueType(this.value)" style="accent-color:var(--accent)"/>
      <span style="font-size:.8rem;font-weight:500">Setiap bulan</span>
    </label>
    <label style="flex:1;display:flex;align-items:center;gap:.45rem;padding:.55rem .7rem;border-radius:10px;border:1.5px solid var(--gs-border);cursor:pointer;background:var(--gs-2)" id="lblOnce">
      <input type="radio" name="dueType" value="once" ${defDueType === 'once' ? 'checked' : ''} onchange="toggleDueType(this.value)" style="accent-color:var(--accent)"/>
      <span style="font-size:.8rem;font-weight:500">Sekali saja</span>
    </label>
  </div>
</div>
<div class="fg" id="dueDayWrap" style="${defDueType === 'once' ? 'display:none' : ''}">
  <label class="flbl">Jatuh Tempo Setiap Tanggal</label>
  <div style="display:flex;align-items:center;gap:.6rem">
    <input type="number" class="finp" id="billDueDay" min="1" max="31" value="${defDueDay}" placeholder="4" style="width:90px;text-align:center;font-size:1.1rem;font-weight:700"/>
    <span style="font-size:.82rem;color:var(--ink3);flex:1">setiap bulan <span style="opacity:.7">(1 – 31)</span></span>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.5rem">
    ${[1, 5, 10, 15, 20, 25, 28].map(d => `<button type="button" onclick="el('billDueDay').value=${d}" style="padding:.22rem .55rem;border-radius:7px;border:1.5px solid var(--gs-border);background:var(--gs-2);color:var(--ink2);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .12s" onmouseover="this.style.background='var(--accent)';this.style.color='#fff';this.style.borderColor='var(--accent)'" onmouseout="this.style.background='var(--gs-2)';this.style.color='var(--ink2)';this.style.borderColor='var(--gs-border)'">${d}</button>`).join('')}
  </div>
  <span style="font-size:.72rem;color:var(--ink3);display:block;margin-top:.3rem">Ketik angka atau klik shortcut di atas</span>
</div>
<div class="fg" id="dueDateWrap" style="${defDueType !== 'once' ? 'display:none' : ''}">
  <label class="flbl">Tanggal Jatuh Tempo</label>
  <input type="date" class="finp" id="billDueDate" value="${defDueDate}" style="cursor:pointer"/>
  <span style="font-size:.72rem;color:var(--ink3);display:block;margin-top:.25rem">Pilih tanggal — termasuk bulan &amp; tahun</span>
</div>
<div class="fg"><label class="flbl">Catatan</label>
  <input type="text" class="finp" id="billNotes" placeholder="Minimum payment, cicilan ke-3, dll" value="${esc(bill?.notes || '')}"/>
</div>
<div class="mfoot">
  <button type="button" class="btn2" onclick="closeModal()">Batal</button>
  <button type="submit" class="btn">${isEdit ? 'Simpan' : 'Tambah'}</button>
</div>
  </form>`;
  return {
    t: isEdit ? 'Edit Tagihan' : 'Tambah Tagihan',
    html,
    onSubmit: () => {
      const dueType = document.querySelector('input[name="dueType"]:checked')?.value || 'monthly';
      const payload = {
        name: el('billName').value.trim(),
        bill_type: el('billTypeVal').value,
        amount: getRawAmt('billAmt') || 0,
        due_type: dueType,
        due_day: dueType === 'monthly' ? parseInt(el('billDueDay').value || '1') : null,
        due_date: dueType === 'once' ? el('billDueDate').value : null,
        notes: el('billNotes').value.trim() || null,
        status: 'unpaid'
      };
      if (!payload.name) { toast('Nama tagihan tidak boleh kosong', 'err'); throw new Error('Nama tagihan tidak boleh kosong'); }
      if (isEdit) return saveBill({ ...payload, id: bill.id }, true);
      else return saveBill(payload, false);
    }
  };
}

function toggleDueType(val) {
  el('dueDayWrap').style.display = val === 'monthly' ? '' : 'none';
  el('dueDateWrap').style.display = val === 'once' ? '' : 'none';
}

function buildPayBillForm(bill) {
  if (!bill) return { t: '', html: '', onSubmit: () => { } };
  const accs = getAccs();
  const accOpts = accs.map(a => `<option value="${a.id}">${esc(a.name)} — ${fCur(a.balance)}</option>`).join('');
  const html = `<form>
<div style="padding:.65rem .9rem;border-radius:12px;background:var(--gs-2);border:1.5px solid var(--gs-border);margin-bottom:1rem">
  <div style="font-size:.88rem;font-weight:700;color:var(--ink)">${esc(bill.name)}</div>
  ${bill.amount > 0 ? `<div style="font-size:1.05rem;font-weight:800;color:var(--expense);margin-top:.2rem">${fCur(bill.amount)}</div>` : '<div style="font-size:.76rem;color:var(--ink3);margin-top:.2rem">Nominal belum diset</div>'}
</div>
<div class="fg" style="margin-bottom:.8rem">
  <label style="display:flex;align-items:center;gap:.55rem;cursor:pointer">
    <input type="checkbox" id="billCreateTx" checked style="width:16px;height:16px;accent-color:var(--accent)"/>
    <span style="font-size:.83rem;font-weight:500;color:var(--ink)">Catat sebagai transaksi pengeluaran</span>
  </label>
</div>
<div id="billTxFields">
  <div class="fg"><label class="flbl">Rekening</label>
    <select class="finp" id="billPayAcc">${accOpts}</select>
  </div>
  <div class="fg"><label class="flbl">Tanggal Bayar</label>
    <input type="date" class="finp" id="billPayDate" value="${today()}"/>
  </div>
</div>
<div class="mfoot">
  <button type="button" class="btn2" onclick="closeModal()">Batal</button>
  <button type="submit" class="btn" style="background:linear-gradient(135deg,#2563eb,#0ea5e9)">Tandai Lunas</button>
</div>
  </form>`;
  return {
    t: 'Tandai Lunas',
    html,
    onSubmit: () => {
      const createTx = el('billCreateTx').checked;
      const accId = el('billPayAcc')?.value || null;
      const payDate = el('billPayDate')?.value || today();
      return payBill(bill.id, createTx, accId, payDate);
    }
  };
}

// ── CUSTOM DROPDOWN HELPERS ──
const CHEVRON_SVG = `<svg class="cdd-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

function buildCatDropdown(id, cats, selectedId) {
  const sel = cats.find(c => c.id === selectedId) || cats[0];
  const opts = cats.map(c => {
    const ico = getCatIcon(c.id);
    return `<div class="cdd-opt${c.id === selectedId ? ' selected' : ''}" onclick="cddSelect('${id}','${c.id}',this)" data-val="${c.id}">
  <span class="cdd-opt-ico" style="width:20px;display:flex;align-items:center;opacity:.7">${ico}</span>
  <span class="cdd-opt-lbl">${esc(c.name)}</span>
</div>`;
  }).join('');
  const initIco = sel ? getCatIcon(sel.id) : '';
  return `<div class="cdd" id="cdd-${id}">
<input type="hidden" id="${id}" value="${sel ? sel.id : ''}"/>
<div class="cdd-trigger" tabindex="0" onclick="toggleCdd('${id}')" onkeydown="cddKey(event,'${id}')">
  <span class="cdd-trigger-ico" style="width:20px;display:flex;align-items:center;opacity:.7" id="cdd-ico-${id}">${initIco}</span>
  <span class="cdd-trigger-lbl" id="cdd-lbl-${id}">${sel ? esc(sel.name) : 'Pilih...'}</span>
  ${CHEVRON_SVG}
</div>
<div class="cdd-menu" id="cdd-menu-${id}">${opts}</div>
  </div>`;
}

function buildAccDropdown(id, accs, selectedId) {
  const sel = accs.find(a => a.id === selectedId) || accs[0];
  const opts = accs.map(a => {
    const bk = detBank(a.name);
    const dot = `<span class="bk-dot" style="background:${bk.color}"></span>`;
    return `<div class="cdd-opt${a.id === selectedId ? ' selected' : ''}" onclick="cddSelectAcc('${id}','${a.id}',this)" data-val="${a.id}">
  ${dot}
  <span class="cdd-opt-lbl">${esc(a.name)}</span>
</div>`;
  }).join('');
  const initBk = sel ? detBank(sel.name) : null;
  const initDot = initBk ? `<span class="bk-dot" style="background:${initBk.color}"></span>` : '';
  return `<div class="cdd" id="cdd-${id}">
<input type="hidden" id="${id}" value="${sel ? sel.id : ''}"/>
<div class="cdd-trigger" tabindex="0" onclick="toggleCdd('${id}')" onkeydown="cddKey(event,'${id}')">
  <span class="cdd-trigger-ico" id="cdd-ico-${id}">${initDot}</span>
  <span class="cdd-trigger-lbl" id="cdd-lbl-${id}">${sel ? esc(sel.name) : 'Pilih...'}</span>
  ${CHEVRON_SVG}
</div>
<div class="cdd-menu" id="cdd-menu-${id}">${opts}</div>
  </div>`;
}

function toggleCdd(id) {
  const menu = el('cdd-menu-' + id), trig = menu?.previousElementSibling;
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  // Close all
  document.querySelectorAll('.cdd-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.cdd-trigger.open').forEach(t => t.classList.remove('open'));
  if (!isOpen) { menu.classList.add('open'); if (trig) trig.classList.add('open'); }
}
function closeCdds() {
  document.querySelectorAll('.cdd-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.cdd-trigger.open').forEach(t => t.classList.remove('open'));
}
document.addEventListener('click', e => { if (!e.target.closest('.cdd')) closeCdds(); });

function cddKey(e, id) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCdd(id); } }

function cddSelect(id, val, optEl) {
  const inp = el(id); if (!inp) return;
  inp.value = val;
  const menu = el('cdd-menu-' + id);
  const cats = getCats(), cat = cats.find(c => c.id === val);
  if (cat) {
    const lbl = el('cdd-lbl-' + id), ico = el('cdd-ico-' + id);
    if (lbl) lbl.textContent = cat.name;
    if (ico) ico.innerHTML = getCatIcon(cat.id);
  }
  menu?.querySelectorAll('.cdd-opt').forEach(o => o.classList.remove('selected'));
  optEl?.classList.add('selected');
  closeCdds();
}

function cddSelectAcc(id, val, optEl) {
  const inp = el(id); if (!inp) return;
  inp.value = val;
  const accs = getAccs(), acc = accs.find(a => a.id === val);
  if (acc) {
    const lbl = el('cdd-lbl-' + id), ico = el('cdd-ico-' + id);
    const bk = detBank(acc.name);
    if (lbl) lbl.textContent = acc.name;
    if (ico) ico.innerHTML = `<span class="bk-dot" style="background:${bk.color}"></span>`;
  }
  const menu = el('cdd-menu-' + id);
  menu?.querySelectorAll('.cdd-opt').forEach(o => o.classList.remove('selected'));
  optEl?.classList.add('selected');
  closeCdds();
}

function buildTxForm(data) {
  const cats = getCats(), accs = getAccs(), isEdit = !!data, d = data || { type: 'expense', date: today() };
  const catDD = buildCatDropdown('txC', cats, d.category_id || cats[0]?.id);
  const accDD = buildAccDropdown('txA', accs, d.account_id || accs[0]?.id);
  const accTA = buildAccDropdown('txTA', accs, d.to_acc_id || accs[0]?.id);
  const html = `<form id="txf">
<div class="type-sel">
  <button type="button" class="tbtn ${d.type === 'income' ? 'inc' : ''}" onclick="setTT('income',this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>Pemasukan</button>
  <button type="button" class="tbtn ${d.type === 'expense' ? 'exp' : ''}" onclick="setTT('expense',this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>Pengeluaran</button>
  <button type="button" class="tbtn ${d.type === 'transfer' ? 'trf' : ''}" onclick="setTT('transfer',this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>Transfer</button>
</div>
<input type="hidden" id="txT" value="${d.type || 'expense'}"/>
<input type="hidden" id="txEid" value="${isEdit ? d.id : ''}"/>
<div class="frow">
  <div class="fg"><label class="flbl">Jumlah *</label><input type="number" class="finp" id="txAmt" min="0" step="any" placeholder="0" value="${d.amount || ''}" required/></div>
  <div class="fg"><label class="flbl">Tanggal *</label><input type="date" class="finp" id="txDt" value="${d.date || today()}" required/></div>
</div>
<div class="frow">
  <div class="fg"><label class="flbl">Kategori</label>${catDD}</div>
  <div class="fg"><label class="flbl">Rekening</label>${accDD}</div>
</div>
<div class="fg" id="toAG" style="display:${d.type === 'transfer' ? 'block' : 'none'}"><label class="flbl">Rekening Tujuan</label>${accTA}</div>
<div class="frow">
  <div class="fg"><label class="flbl">Keterangan</label><input type="text" class="finp" id="txN" placeholder="Opsional…" value="${esc(d.note || '')}"/></div>
  <div class="fg"><label class="flbl">Toko / Merchant</label><input type="text" class="finp" id="txS" placeholder="Opsional…" value="${esc(d.store || '')}"/></div>
</div>
<div class="mfoot"><button type="button" class="btn2" onclick="closeModal()">Batal</button><button type="submit" class="btn">${isEdit ? 'Simpan' : 'Tambah'}</button></div>
  </form>`;
  return {
    t: isEdit ? 'Edit Transaksi' : 'Tambah Transaksi', html, onSubmit: () => {
      const payload = { type: el('txT').value, amount: getRawAmt('txAmt'), date: el('txDt').value, category_id: el('txC').value, account_id: el('txA').value, to_acc_id: el('txTA')?.value || '', note: el('txN').value.trim(), store: el('txS').value.trim() || null };
      if (!payload.amount || payload.amount <= 0) { toast('Jumlah harus >0', 'err'); throw new Error('Jumlah harus >0'); }
      const id = el('txEid').value; if (id) return updateTx(id, payload); else return addTx(payload);
    }
  };
}
function setTT(type, btn) {
  el('txT').value = type;
  document.querySelectorAll('.tbtn').forEach(b => b.className = 'tbtn');
  btn.classList.add(type === 'income' ? 'inc' : type === 'expense' ? 'exp' : 'trf');
  const g = el('toAG'); if (g) g.style.display = type === 'transfer' ? 'block' : 'none';
}
function buildBudForm() {
  const cats = getCats().filter(c => c.type === 'expense' || c.type === 'both');
  const catDD = buildCatDropdown('bCat', cats, cats[0]?.id);
  const html = `<form><div class="fg"><label class="flbl">Kategori *</label>${catDD}</div><div class="fg"><label class="flbl">Batas Pengeluaran *</label><input type="number" class="finp" id="bLim" min="0" placeholder="0" required/></div><div class="mfoot"><button type="button" class="btn2" onclick="closeModal()">Batal</button><button type="submit" class="btn">Buat</button></div></form>`;
  return { t: 'Buat Anggaran', html, onSubmit: () => addBud({ catId: el('bCat').value, limit: getRawAmt('bLim') }) };
}
// ── GOAL ICONS ──
const GOAL_ICONS = [
  { id: 'target', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>` },
  { id: 'home', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
  { id: 'car', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>` },
  { id: 'plane', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>` },
  { id: 'graduate', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>` },
  { id: 'ring', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l3-3 3 3"/><path d="M12 6v6"/></svg>` },
  { id: 'laptop', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>` },
  { id: 'heart', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>` },
  { id: 'star', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` },
  { id: 'savings', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 6v6l4 2"/></svg>` },
  { id: 'gift', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>` },
  { id: 'invest', svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>` }
];
const getGoalIconSvg = (iconId, w = 16) => {
  const found = GOAL_ICONS.find(i => i.id === iconId);
  if (!found) return GOAL_ICONS[0].svg;
  return found.svg.replace(/width="16"/g, `width="${w}"`).replace(/height="16"/g, `height="${w}"`);
};

function buildGoalForm() {
  const iconBtns = GOAL_ICONS.map((ico, i) => `<button type="button" class="goal-ico-btn${i === 0 ? ' selected' : ''}" onclick="selGoalIco('${ico.id}',this)" title="${ico.id}">${ico.svg}</button>`).join('');
  const html = `<form>
<div class="fg"><label class="flbl">Nama Target *</label><input type="text" class="finp" id="gName" placeholder="misal: DP Rumah" required/></div>
<div class="fg"><label class="flbl">Icon Target</label><div class="goal-icons" id="goalIconGrid">${iconBtns}</div><input type="hidden" id="gIcon" value="target"/></div>
<div class="frow"><div class="fg"><label class="flbl">Jumlah Target *</label><input type="number" class="finp" id="gTgt" min="0" placeholder="0" required/></div><div class="fg"><label class="flbl">Tenggat</label><input type="date" class="finp" id="gDl"/></div></div>
<div class="mfoot"><button type="button" class="btn2" onclick="closeModal()">Batal</button><button type="submit" class="btn">Buat</button></div>
  </form>`;
  return { t: 'Buat Target Tabungan', html, onSubmit: () => addGoal({ name: el('gName').value.trim(), target: getRawAmt('gTgt'), deadline: el('gDl').value, icon: el('gIcon').value || 'target' }) };
}
function selGoalIco(iconId, btn) {
  el('gIcon').value = iconId;
  document.querySelectorAll('.goal-ico-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function buildAddToGoalForm(goal) {
  const html = `<form><p style="color:var(--t3);font-size:.84rem;margin-bottom:.9rem">Progress: <strong style="color:var(--income)">${fCur(goal.current)}</strong> / ${fCur(goal.target)}</p><div class="fg"><label class="flbl">Tambah Tabungan *</label><input type="number" class="finp" id="agAmt" min="1" placeholder="0" required/></div><div class="mfoot"><button type="button" class="btn2" onclick="closeModal()">Batal</button><button type="submit" class="btn">Tabung</button></div></form>`;
  return { t: 'Tabung — ' + esc(goal.name), html, onSubmit: () => addToGoal(goal.id, getRawAmt('agAmt')) };
}
function buildAccForm() {
  const html = `<form><div class="fg"><label class="flbl">Nama Rekening *</label><input type="text" class="finp" id="aN" placeholder="misal: Bank Mandiri, Neo Bank, Krom Bank" required/></div><p class="hint" style="margin:-.4rem 0 .7rem">Brand color & logo otomatis dari nama bank</p><div class="fg"><label class="flbl">Saldo Awal</label><input type="number" class="finp" id="aBal" min="0" placeholder="0"/></div><div class="mfoot"><button type="button" class="btn2" onclick="closeModal()">Batal</button><button type="submit" class="btn">Tambah</button></div></form>`;
  return { t: 'Tambah Rekening', html, onSubmit: () => addAcc({ name: el('aN').value.trim(), balance: getRawAmt('aBal') || 0 }) };
}
function buildCatForm() {
  const html = `<form><div class="fg"><label class="flbl">Nama Kategori *</label><input type="text" class="finp" id="cN" placeholder="misal: Hobi" required/></div><div class="frow"><div class="fg"><label class="flbl">Emoji</label><input type="text" class="finp" id="cE" placeholder="🏷️" maxlength="2"/></div><div class="fg"><label class="flbl">Berlaku untuk</label><select class="finp" id="cT"><option value="both">Keduanya</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></div></div><div class="mfoot"><button type="button" class="btn2" onclick="closeModal()">Batal</button><button type="submit" class="btn">Tambah</button></div></form>`;
  return { t: 'Tambah Kategori', html, onSubmit: () => addCat({ name: el('cN').value.trim(), emoji: el('cE').value || '🏷️', type: el('cT').value }) };
}

// ── BACKUP ──

// ── Amount Input ──
function setupAmtInput(inputId) {
  const inp = el(inputId); if (!inp) return;
  // Change type to text for display, but keep a hidden numeric value
  inp.type = 'text';
  inp.inputMode = 'numeric';
  const initialRaw = inp.value ? inp.value.replace(/\./g, '').replace(/[^0-9]/g, '') : '';
  inp.setAttribute('data-raw', initialRaw);
  if (initialRaw) inp.value = parseInt(initialRaw, 10).toLocaleString('id-ID');
  function fmt(e) {
    let raw = inp.value.replace(/\./g, '').replace(/[^0-9]/g, '');
    inp.setAttribute('data-raw', raw);
    if (raw === '') { inp.value = ''; return; }
    // Format with dots as thousands separator
    inp.value = parseInt(raw, 10).toLocaleString('id-ID');
    // move cursor to end
  }
  inp.addEventListener('input', fmt);
  inp.addEventListener('focus', function () {
    // on focus, show raw number for easier editing
    const raw = this.getAttribute('data-raw') || this.value.replace(/\./g, '');
    this.value = raw;
  });
  inp.addEventListener('blur', function () {
    const raw = this.getAttribute('data-raw') || this.value.replace(/\./g, '');
    if (raw) this.value = parseInt(raw, 10).toLocaleString('id-ID');
  });
}
function getRawAmt(inputId) {
  const inp = el(inputId); if (!inp) return NaN;
  const raw = inp.getAttribute('data-raw') || inp.value.replace(/\./g, '').replace(/[^0-9]/g, '');
  return parseFloat(raw) || 0;
}

function buildBillHistory(bill) {
  if (!bill) return { t: '', html: '', onSubmit: () => { } };
  const txs = getTx().filter(t => t.type === 'expense' && t.note && t.note.includes(`Bayar ${bill.name}`));
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  
  let listHtml = '';
  if (!sorted.length) {
    listHtml = `<div class="empty" style="padding:2.5rem 1.5rem;text-align:center;">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".25" style="margin-bottom:.5rem;display:inline-block;">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <p style="font-size:.78rem;color:var(--ink3);margin-top:.2rem;">Belum ada riwayat pembayaran yang tercatat untuk tagihan ini.</p>
    </div>`;
  } else {
    listHtml = `<div style="max-height:280px;overflow-y:auto;padding-right:4px;display:flex;flex-direction:column;gap:.6rem;">` + sorted.map(t => {
      const acc = getAccs().find(a => a.id === t.account_id);
      const accName = acc ? acc.name : 'Rekening';
      const bk = acc ? detBank(acc.name) : null;
      const dotColor = (bk && bk.color) ? bk.color : '#a78bfa';
      
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.7rem .85rem;border-radius:12px;background:var(--gs-2);border:1.5px solid var(--gs-border);">
        <div style="text-align:left;">
          <div style="font-size:.82rem;font-weight:700;color:var(--ink);">${fDate(t.date)}</div>
          <div style="font-size:.72rem;color:var(--ink3);display:flex;align-items:center;gap:.3rem;margin-top:.15rem;">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor}"></span>
            ${esc(accName)}
          </div>
        </div>
        <div style="font-size:.9rem;font-weight:800;color:var(--expense);">${fCur(t.amount)}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  const html = `<div>
    <div style="padding:.65rem .9rem;border-radius:12px;background:var(--gs-2);border:1.5px solid var(--gs-border);margin-bottom:1rem;text-align:left;">
      <div style="font-size:.76rem;color:var(--ink3);">Jenis Tagihan</div>
      <div style="font-size:.9rem;font-weight:700;color:var(--ink);margin-top:.15rem;">${esc(bill.name)}</div>
    </div>
    
    <div style="font-size:.76rem;color:var(--ink3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem;text-align:left;">Riwayat Pembayaran</div>
    ${listHtml}
    
    <div class="mfoot" style="margin-top:1.2rem;justify-content:flex-end;">
      <button type="button" class="btn" onclick="closeModal()" style="padding:.55rem 1.4rem;font-size:.82rem;font-weight:700;">Tutup</button>
    </div>
  </div>`;

  return {
    t: 'Riwayat Pembayaran',
    html,
    onSubmit: () => { }
  };
}

function buildPiutangForm(piutang = null) {
  const isEdit = !!piutang;
  const defLendDate = piutang?.lend_date || today();
  const defDueDate = piutang?.due_date || '';
  const html = `<form>
<div class="fg"><label class="flbl">Nama Peminjam *</label>
  <input type="text" class="finp" id="ptgBorrower" placeholder="Andi, Budi, Siska…" value="${esc(piutang?.borrower_name || '')}" required/>
</div>
<div class="fg"><label class="flbl">Nominal Pinjaman *</label>
  <input type="text" class="finp" id="ptgAmt" placeholder="Rp 0" value="${piutang?.amount > 0 ? piutang.amount : ''}" required/>
</div>
<div class="fg"><label class="flbl">Telah Dikembalikan (Opsional)</label>
  <input type="text" class="finp" id="ptgReturned" placeholder="Rp 0" value="${piutang?.returned > 0 ? piutang.returned : ''}"/>
</div>
<div class="fg"><label class="flbl">Tanggal Peminjaman *</label>
  <input type="date" class="finp" id="ptgLendDate" value="${defLendDate}" required/>
</div>
<div class="fg"><label class="flbl">Tanggal Jatuh Tempo (Opsional)</label>
  <input type="date" class="finp" id="ptgDueDate" value="${defDueDate}"/>
</div>
<div class="fg"><label class="flbl">Catatan</label>
  <input type="text" class="finp" id="ptgNote" placeholder="Pinjam buat beli tiket, uang jajan, dll" value="${esc(piutang?.note || '')}"/>
</div>
<div class="mfoot">
  <button type="button" class="btn2" onclick="closeModal()">Batal</button>
  <button type="submit" class="btn">${isEdit ? 'Simpan' : 'Tambah'}</button>
</div>
  </form>`;
  return {
    t: isEdit ? 'Edit Piutang' : 'Tambah Piutang',
    html,
    onSubmit: () => {
      const payload = {
        borrower_name: el('ptgBorrower').value.trim(),
        amount: getRawAmt('ptgAmt') || 0,
        returned: getRawAmt('ptgReturned') || 0,
        lend_date: el('ptgLendDate').value || today(),
        due_date: el('ptgDueDate').value || null,
        note: el('ptgNote').value.trim() || null,
        status: getRawAmt('ptgReturned') >= getRawAmt('ptgAmt') ? 'paid' : 'active'
      };
      if (!payload.borrower_name) { toast('Nama peminjam tidak boleh kosong', 'err'); throw new Error('Nama peminjam tidak boleh kosong'); }
      if (payload.amount <= 0) { toast('Nominal pinjaman harus lebih dari 0', 'err'); throw new Error('Nominal pinjaman harus lebih dari 0'); }
      if (isEdit) return savePiutang({ ...payload, id: piutang.id }, true);
      else return savePiutang(payload, false);
    }
  };
}

function buildReturnPiutangForm(piutang) {
  if (!piutang) return { t: '', html: '', onSubmit: () => {} };
  const sisa = Math.max(0, piutang.amount - piutang.returned);
  const html = `<form>
<div style="padding:.65rem .9rem;border-radius:12px;background:var(--gs-2);border:1.5px solid var(--gs-border);margin-bottom:1rem;text-align:left;">
  <div style="font-size:.76rem;color:var(--ink3);">Peminjam</div>
  <div style="font-size:.88rem;font-weight:700;color:var(--ink);margin-top:.15rem">${esc(piutang.borrower_name)}</div>
  <div style="display:flex;justify-content:space-between;margin-top:.45rem;font-size:.78rem;color:var(--ink2);">
    <span>Total Pinjaman: <strong>${fCur(piutang.amount)}</strong></span>
    <span>Sisa Piutang: <strong style="color:var(--gold)">${fCur(sisa)}</strong></span>
  </div>
</div>
<div class="fg">
  <label class="flbl">Nominal Pengembalian *</label>
  <input type="text" class="finp" id="ptgReturnAmt" placeholder="${sisa}" value="${sisa > 0 ? sisa : ''}" required/>
</div>
<div class="fg" style="margin-bottom:.8rem">
  <label style="display:flex;align-items:center;gap:.55rem;cursor:pointer">
    <input type="checkbox" id="ptgCreateTx" checked style="width:16px;height:16px;accent-color:var(--accent)"/>
    <span style="font-size:.83rem;font-weight:500;color:var(--ink)">Catat sebagai transaksi pemasukan</span>
  </label>
</div>
<div id="ptgTxFields">
  <div class="fg"><label class="flbl">Rekening Tujuan</label>
    <select class="finp" id="ptgPayAcc">${getAccs().map(a => `<option value="${a.id}">${esc(a.name)} — ${fCur(a.balance)}</option>`).join('')}</select>
  </div>
</div>
<div class="mfoot">
  <button type="button" class="btn2" onclick="closeModal()">Batal</button>
  <button type="submit" class="btn" style="background:linear-gradient(135deg,#22c578,#10b981)">Simpan</button>
</div>
  </form>`;
  return {
    t: 'Cicil / Bayar Piutang',
    html,
    onSubmit: () => {
      const returnAmt = getRawAmt('ptgReturnAmt') || 0;
      if (returnAmt <= 0) { toast('Nominal harus lebih dari 0', 'err'); throw new Error('Nominal harus lebih dari 0'); }
      const createTx = el('ptgCreateTx').checked;
      const accId = el('ptgPayAcc')?.value || null;
      return payReturnPiutang(piutang.id, returnAmt, createTx, accId);
    }
  };
}
