// ══════════════════════════════════════
// keuangan.js — Keuangan (Budget, Goals, Bills)
// ══════════════════════════════════════

function renderBudg() {
  const buds = getBud(), grid = el('budgGrid'), emp = el('budgEmpty');
  const strip = el('budgSummaryStrip');
  if (!buds.length) { grid.innerHTML = ''; if (strip) strip.style.display = 'none'; emp.style.display = 'flex'; return; }
  emp.style.display = 'none';
  if (strip) strip.style.display = 'grid';
  const mTx = getTx().filter(t => mKey(t.date) === thisMon() && t.type === 'expense');
  const totalLim   = buds.reduce((s, b) => s + (b.limit_amount || 0), 0);
  const totalSpent = buds.reduce((s, b) => {
    return s + mTx.filter(t => t.category_id === b.category_id).reduce((ss, t) => ss + t.amount, 0);
  }, 0);
  const totalSisa = Math.max(0, totalLim - totalSpent);
  if (el('budgTotalLim'))   el('budgTotalLim').textContent   = fCur(totalLim);
  if (el('budgTotalSpent')) el('budgTotalSpent').textContent = fCur(totalSpent);
  if (el('budgTotalSisa'))  {
    el('budgTotalSisa').textContent = fCur(totalSisa);
    el('budgTotalSisa').className = 'keu-summary-value ' + (totalSisa <= 0 ? 'red' : totalSpent / totalLim >= 0.7 ? 'amber' : 'green');
  }
  grid.innerHTML = buds.map(b => {
    const cat = catBy(b.category_id);
    const spent = mTx.filter(t => t.category_id === b.category_id).reduce((s, t) => s + t.amount, 0);
    const rawPct = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0;
    const isOver = rawPct > 100;
    const pct = Math.min(rawPct, 100);
    const level = isOver ? 'danger' : pct >= 80 ? 'danger' : pct >= 50 ? 'warn' : 'ok';
    const sisa = b.limit_amount - spent;
    const accentMap = { 'ok': '#22c578', 'warn': '#f59e0b', 'danger': '#ef4444' };
    const accent = accentMap[level];
    const catName = esc(cat?.name || 'Kategori');
    const catIcon = getCatIcon(b.category_id);
    const pctDisplay = rawPct.toFixed(0) + '%';
    const sisaVal = isOver
      ? `<span class="bcard-glass-sisa-val danger">−${fCur(Math.abs(sisa))} lebih</span>`
      : `<span class="bcard-glass-sisa-val ${level}">${fCur(sisa)}</span>`;
    return `<div class="bcard-glass" style="--bcard-accent:${accent}">
      <div class="bcard-glass-hdr">
        <div class="bcard-glass-identity">
          <div class="bcard-glass-icon">${catIcon}</div>
          <div><div class="bcard-glass-name">${catName}</div></div>
        </div>
        <button class="bcard-glass-close" onclick="delBud('${b.id}')" title="Hapus">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="bcard-pct-row">
        <span class="bcard-glass-pct ${level}">${pctDisplay}</span>
        <div class="bcard-glass-amounts">
          <div class="bcard-glass-used">${fCur(spent)} terpakai</div>
          <div class="bcard-glass-limit">dari ${fCur(b.limit_amount)}</div>
        </div>
      </div>
      <div class="ptrack"><div class="pfill ${level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : 'bad'}" style="width:${pct}%"></div></div>
      <div class="bcard-glass-footer">
        <span class="bcard-glass-sisa-lbl">Sisa anggaran</span>
        ${sisaVal}
      </div>
    </div>`;
  }).join('');
}
async function addBud(d) {
  try {
    await api('POST', '/budgets', { category_id: d.catId, limit_amount: d.limit, month: thisMon() });
    await fetchBuds();
    closeModal(); toast('Anggaran dibuat!', 'ok'); renderBudg();
    if (curPage === 'dashboard') renderDash();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}
async function delBud(id) {
  if (!confirm('Hapus anggaran?')) return;
  try {
    await api('DELETE', `/budgets/${id}`);
    await fetchBuds();
    toast('Dihapus.', 'info'); renderBudg();
    if (curPage === 'dashboard') renderDash();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

// ── GOALS ──
function renderGoals() {
  const goals = getGoals(), grid = el('goalsGrid'), emp = el('goalsEmpty');
  const strip = el('goalsSummaryStrip');
  if (!goals.length) { grid.innerHTML = ''; if (strip) strip.style.display = 'none'; emp.style.display = 'flex'; return; }
  emp.style.display = 'none';
  if (strip) strip.style.display = 'grid';
  const totalTarget  = goals.reduce((s, g) => s + (g.target  || 0), 0);
  const totalCurrent = goals.reduce((s, g) => s + (g.current || 0), 0);
  const incomplete = goals.filter(g => g.deadline && g.current < g.target);
  let nearestLabel = '—';
  if (incomplete.length) {
    incomplete.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    const diff = Math.ceil((new Date(incomplete[0].deadline) - new Date()) / 86400000);
    nearestLabel = diff > 0 ? diff + ' hari' : diff === 0 ? 'Hari ini!' : 'Lewat';
  }
  if (el('goalsTotalTarget'))  el('goalsTotalTarget').textContent  = fCur(totalTarget);
  if (el('goalsTotalCurrent')) el('goalsTotalCurrent').textContent = fCur(totalCurrent);
  if (el('goalsNearest'))      el('goalsNearest').textContent      = nearestLabel;
  grid.innerHTML = goals.map(g => {
    const rawPct = g.target > 0 ? (g.current / g.target) * 100 : 0;
    const isAchieved = rawPct >= 100;
    const pct = Math.min(rawPct, 100);
    const level = isAchieved ? 'ok' : pct >= 61 ? 'ok' : pct >= 31 ? 'warn' : 'bad';
    const kurang = g.target - g.current;
    const months = g.deadline ? Math.max(1, Math.ceil((new Date(g.deadline) - new Date()) / (30 * 86400000))) : null;
    const savingsPerMonth = months && kurang > 0 ? Math.ceil(kurang / months) : null;
    let dlHtml = '';
    if (g.deadline) {
      const diff = Math.ceil((new Date(g.deadline) - new Date()) / 86400000);
      dlHtml = `<div class="gcard-glass-deadline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ${diff > 0 ? diff + ' hari lagi' : diff === 0 ? 'Hari ini!' : 'Sudah lewat'} — ${fDate(g.deadline)}</div>`;
    }
    const gj = JSON.stringify(g).replace(/"/g, '&quot;');
    const iconSvg = getGoalIconSvg(g.icon || 'target', 18);
    const pctBadgeClass = isAchieved ? 'green' : '';
    const pctLabel = isAchieved ? '100% ✓' : rawPct.toFixed(0) + '%';
    const shortageText = !isAchieved && kurang > 0 ? 'Kurang ' + fCur(kurang) : isAchieved ? 'Tercapai! 🎉' : '';
    const hintHtml = savingsPerMonth
      ? `<div class="gcard-glass-hint">Nabung <strong>${fCur(savingsPerMonth)}/bln</strong> untuk mencapai target</div>`
      : `<div class="gcard-glass-hint" style="color:var(--income);font-weight:600">Target tercapai! 🎉</div>`;
    return `<div class="gcard-glass">
      <div class="gcard-glass-hdr">
        <div class="gcard-glass-identity">
          <div class="gcard-glass-icon">${iconSvg}</div>
          <div><div class="gcard-glass-name">${esc(g.name)}</div></div>
        </div>
        <button class="gcard-glass-close" onclick="delGoal('${g.id}')" title="Hapus">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="gcard-glass-amounts">
        <span class="gcard-glass-cur">${fCur(g.current)}</span>
        <span class="gcard-glass-divider">/</span>
        <span class="gcard-glass-tgt">${fCur(g.target)}</span>
      </div>
      <div class="gcard-glass-progress-meta">
        <span class="gcard-glass-pct-badge ${pctBadgeClass}">${pctLabel}</span>
        <span class="gcard-glass-shortage">${shortageText}</span>
      </div>
      <div class="ptrack" style="margin-bottom:6px"><div class="pfill ${level}" style="width:${pct}%"></div></div>
      ${dlHtml}
      <div class="gcard-glass-footer">
        ${hintHtml}
        <button class="btn-add-glass" onclick='openModal("addToGoal",${gj})'>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> Tabung
        </button>
      </div>
    </div>`;
  }).join('');
}
    async function addGoal(d) {
  try {
    await api('POST', '/goals', { name: d.name, target: d.target, current: 0, deadline: d.deadline || null, icon: d.icon || 'target' });
    await fetchGoals();
    closeModal(); toast('Target dibuat!', 'ok'); renderGoals();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}
async function delGoal(id) {
  if (!confirm('Hapus target?')) return;
  try {
    await api('DELETE', `/goals/${id}`);
    await fetchGoals();
    toast('Dihapus.', 'info'); renderGoals();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}
async function addToGoal(id, amt) {
  try {
    const g = getGoals().find(g => g.id === id);
    if (!g) return;
    const newCur = g.current + amt;
    await api('PATCH', `/goals/${id}`, { current: newCur });
    await fetchGoals();
    const updated = getGoals().find(g => g.id === id);
    if (updated) {
      const surplus = updated.current - updated.target;
      if (surplus > 0) toast('Target tercapai! Surplus ' + fCur(surplus), 'ok');
      else if (updated.current >= updated.target) toast('Target tepat tercapai!', 'ok');
      else toast('Tabungan ditambahkan!', 'ok');
    }
    closeModal(); renderGoals();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

// ── BILLS (Tagihan) ──
const BILL_TYPES = [
  { id: 'cc', label: 'Kartu Kredit' },
  { id: 'paylater', label: 'Paylater' },
  { id: 'cicilan', label: 'Cicilan' },
  { id: 'langganan', label: 'Langganan' },
  { id: 'lainnya', label: 'Lainnya' }
];

function billDueStatus(bill) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = today.getFullYear(), m = today.getMonth();
  const currentMonthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
  
  const isPaidThisMonth = bill.status === 'paid' && 
    (bill.due_type !== 'monthly' || (bill.paid_date && bill.paid_date.startsWith(currentMonthStr)));

  if (isPaidThisMonth) return { cls: 'paid', label: 'Lunas', dotCls: 'paid' };

  const dueDay = bill.due_day || 1;
  let due = new Date(y, m, dueDay);
  if (bill.due_type === 'once' && bill.due_date) {
    const [y2, m2, d2] = bill.due_date.split('-').map(Number);
    due = new Date(y2, m2 - 1, d2);
  }
  const diffMs = due - today;
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffDays < 0) return { cls: 'overdue', label: `Lewat ${Math.abs(diffDays)} hari`, dotCls: 'overdue', due };
  if (diffDays === 0) return { cls: 'overdue', label: 'Hari ini!', dotCls: 'overdue', due };
  if (diffDays <= 3) return { cls: 'overdue', label: `${diffDays} hari lagi`, dotCls: 'overdue', due };
  if (diffDays <= 7) return { cls: 'due-soon', label: `${diffDays} hari lagi`, dotCls: 'due-soon', due };
  return { cls: 'upcoming', label: `${diffDays} hari lagi`, dotCls: 'upcoming', due };
}


function renderBillsHero(bills) {
  const hero = el('billsHero');
  if (!bills.length) { if (hero) hero.style.display = 'none'; return; }
  if (hero) hero.style.display = 'block';

  const activeBills = bills.filter(b => b.status !== 'paid');
  const paidBills   = bills.filter(b => b.status === 'paid');
  const total = activeBills.reduce((s, b) => s + (b.amount || 0), 0);
  const paidTotal = paidBills.reduce((s, b) => s + (b.amount || 0), 0);

  const criticalBills = activeBills.filter(b => { const st = billDueStatus(b); return st.cls === 'overdue'; });
  const warnBills    = activeBills.filter(b => { const st = billDueStatus(b); return st.cls === 'due-soon'; });
  const safeBills    = activeBills.filter(b => { const st = billDueStatus(b); return st.cls === 'upcoming'; });

  if (el('heroTotalAmt')) el('heroTotalAmt').textContent = fCur(total);
  if (el('heroTotalPaid')) el('heroTotalPaid').textContent = fCur(paidTotal);
  if (el('heroSubText')) el('heroSubText').textContent = activeBills.length + ' tagihan aktif · ' + new Date().toLocaleDateString('id-ID', {month:'long', year:'numeric'});
  if (el('heroStatCritical')) el('heroStatCritical').textContent = criticalBills.length;
  if (el('heroStatWarn')) el('heroStatWarn').textContent = warnBills.length;
  if (el('heroStatSafe')) el('heroStatSafe').textContent = safeBills.length;

  // Segmented bar
  const bar = el('heroSegBar');
  if (bar && total > 0) {
    const critAmt = criticalBills.reduce((s,b) => s + (b.amount||0), 0);
    const warnAmt = warnBills.reduce((s,b) => s + (b.amount||0), 0);
    const safeAmt = safeBills.reduce((s,b) => s + (b.amount||0), 0);
    bar.innerHTML = [
      critAmt > 0 ? `<div class="bills-hero-segbar-seg" style="width:${(critAmt/total*100).toFixed(1)}%;background:rgba(239,68,68,0.85);"></div>` : '',
      warnAmt > 0 ? `<div class="bills-hero-segbar-seg" style="width:${(warnAmt/total*100).toFixed(1)}%;background:rgba(245,158,11,0.85);"></div>` : '',
      safeAmt > 0 ? `<div class="bills-hero-segbar-seg" style="width:${(safeAmt/total*100).toFixed(1)}%;background:rgba(34,197,120,0.85);"></div>` : '',
    ].join('');
  } else if (bar) bar.innerHTML = `<div class="bills-hero-segbar-seg" style="width:100%;background:var(--gs-border);"></div>`;
}

function renderBills() {
  const bills = getBills(), grid = el('billGrid'), emp = el('billEmpty');
  renderBillsHero(bills);
  if (!bills.length) { grid.innerHTML = ''; emp.style.display = 'flex'; return; }
  emp.style.display = 'none';
  const ORDER = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
  const sorted = [...bills].sort((a, b) => {
    const sa = billDueStatus(a), sb = billDueStatus(b);
    const oa = ORDER[sa.cls] ?? 3, ob = ORDER[sb.cls] ?? 3;
    if (oa !== ob) return oa - ob;
    if (sa.due && sb.due) return sa.due - sb.due;
    return 0;
  });
  grid.innerHTML = sorted.map(b => {
    const st = billDueStatus(b);
    const typeLbl = BILL_TYPES.find(t => t.id === b.bill_type)?.label || 'Lainnya';
    const dueLabel = b.due_type === 'once' && b.due_date
      ? `Jatuh tempo ${fDate(b.due_date)}`
      : `Tgl ${b.due_day || 1} tiap bulan`;
    const amtHtml = b.amount > 0
      ? `<span class="bill-amount">${fCur(b.amount)}</span>`
      : `<span class="bill-amount" style="font-size:0.8rem;color:var(--ink3);">--</span>`;
    const isPaid = b.status === 'paid';

    const actionBtns = `<div style="display:flex;gap:6px;align-items:center;">
      <button class="bill-btn-hist-new" onclick="openBillHistory('${b.id}')" title="Riwayat Pembayaran"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
      <button class="bill-btn-edit-new" onclick="openEditBill('${b.id}')" title="Edit"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="bill-btn-del-new" onclick="delBill('${b.id}')" title="Hapus"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 3.5l.5 8M9 3.5l-.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>`;

    if (isPaid) {
      return `<div class="card-wrap"><div class="bill-card paid">
        <div class="card-top"><div class="card-left"><div class="bill-dot paid"></div><div><div class="bill-name">${esc(b.name)}</div><div class="bill-meta">${dueLabel} · ${typeLbl}</div></div></div>${actionBtns}</div>
        <div class="bill-divider"></div>
        <div class="card-bottom" style="justify-content:space-between;"><div class="bill-badge paid">Lunas</div>${amtHtml}</div>
      </div></div>`;
    }

    return `<div class="card-wrap">
  <div class="action-bg"><div class="check-label"><div class="check-circle">✓</div> Tandai Lunas</div></div>
  <div class="bill-card ${st.cls}" data-id="${b.id}">
    <div class="card-top"><div class="card-left"><div class="bill-dot ${st.cls}"></div><div><div class="bill-name">${esc(b.name)}</div><div class="bill-meta">${dueLabel} · ${typeLbl}</div></div></div>${actionBtns}</div>
    <div class="bill-divider"></div>
    <div class="card-bottom"><div style="display:flex;align-items:center;gap:8px;"><div class="bill-badge ${st.cls}">${st.label}</div><div class="swipe-hint"><div class="arrows"><span></span><span></span></div> geser untuk lunas</div></div>${amtHtml}</div>
  </div>
</div>`;
  }).join('');
  setTimeout(bindSwipeBills, 100);
}

function showSwipeConfirm(bill, card) {
  // Remove existing overlay if any
  const old = document.getElementById('swipeConfirmOverlay');
  if (old) old.remove();
  const bg = card.parentElement ? card.parentElement.querySelector('.action-bg') : null;
  const lbl = card.parentElement ? card.parentElement.querySelector('.check-label') : null;

  const accs = getAccs();
  const accOpts = accs.map(a => `<option value="${a.id}">${esc(a.name)} (${fCur(a.balance)})</option>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'swipe-confirm-overlay';
  overlay.id = 'swipeConfirmOverlay';
  overlay.innerHTML = `
    <div class="swipe-confirm-sheet">
      <div class="swipe-confirm-title">Konfirmasi Pelunasan</div>
      <div class="swipe-confirm-name">${esc(bill.name)}</div>
      <div class="swipe-confirm-amt">${bill.amount > 0 ? fCur(bill.amount) : 'Nominal tidak diset'}</div>
      
      <div class="swipe-confirm-inputs" style="margin: 1.2rem 0; text-align: left;">
        <label class="flbl" style="display:block;margin-bottom:.42rem;font-size:.76rem;color:var(--ink2);font-weight:600;">Sumber Rekening Pembayaran</label>
        <select class="finp" id="swipePayAccId" style="width:100%;font-size:.82rem;padding:.52rem .72rem;border-radius:10px;background:var(--gs-4);border:1.5px solid var(--gs-border);color:var(--ink);margin-bottom:.85rem;">
          ${accOpts}
        </select>
        <div style="display:flex;align-items:center;gap:.5rem;user-select:none;">
          <input type="checkbox" id="swipeCreateTx" checked style="width:15px;height:15px;cursor:pointer;" />
          <label for="swipeCreateTx" style="font-size:.76rem;color:var(--ink2);font-weight:500;cursor:pointer;">Catat pengeluaran di rekening ini</label>
        </div>
      </div>

      <div class="swipe-confirm-btns">
        <button class="swipe-confirm-cancel" id="swipeConfirmCancel">Batal</button>
        <button class="swipe-confirm-ok" id="swipeConfirmOk">✓ Ya, Sudah Lunas</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function closeOverlay() {
    // Reset card position
    card.style.transition = 'transform 0.3s cubic-bezier(.34,1.1,.64,1)';
    card.style.transform = 'translateX(0)';
    if (bg) { bg.style.transition = 'opacity 0.3s'; bg.style.opacity = 0; }
    if (lbl) lbl.style.opacity = 0;
    overlay.remove();
  }

  document.getElementById('swipeConfirmCancel').onclick = closeOverlay;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });

  document.getElementById('swipeConfirmOk').onclick = async () => {
    const okBtn = document.getElementById('swipeConfirmOk');
    const cancelBtn = document.getElementById('swipeConfirmCancel');
    const accId = document.getElementById('swipePayAccId')?.value;
    const createTx = document.getElementById('swipeCreateTx')?.checked;
    
    if (okBtn) { okBtn.disabled = true; okBtn.textContent = 'Memproses...'; }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      const payDate = today();
      // 1. Tandai lunas di D1
      await api('PATCH', `/bills/${bill.id}`, { status: 'paid', paid_date: new Date().toISOString() });
      
      // 2. Buat transaksi jika dicentang & nominal > 0 & rekening valid
      if (createTx && bill.amount > 0 && accId) {
        const cats = getCats();
        const tagCat = cats.find(c => c.name.toLowerCase().includes('tagihan') || c.name.toLowerCase().includes('utilitas')) || cats[cats.length - 1];
        await api('POST', '/transactions', {
          type: 'expense',
          amount: bill.amount,
          date: payDate,
          account_id: accId,
          category_id: tagCat?.id || cats[0]?.id,
          note: `Bayar ${bill.name}`,
          source: 'website'
        });
        const m = payDate.slice(0, 7);
        await Promise.all([fetchTx(m), fetchAccs()]);
      }
      
      overlay.remove();
      card.style.transform = `translateX(${card.parentElement ? card.parentElement.offsetWidth : 400}px)`;
      if (bg) bg.style.opacity = 1;
      
      setTimeout(() => {
        const w = card.parentElement;
        if (w) {
          w.style.transition = 'all 0.35s ease';
          w.style.maxHeight = w.offsetHeight + 'px';
          w.offsetHeight;
          w.style.maxHeight = '0';
          w.style.opacity = '0';
          w.style.marginBottom = '0';
        }
      }, 200);
      
      toast('Tagihan ditandai lunas ✓', 'ok');
      await fetchBills();
      renderBills();
      renderDashBills();
      if (typeof refresh === 'function') refresh();
    } catch(err) {
      toast('Gagal: ' + err.message, 'err');
      if (okBtn) { okBtn.disabled = false; okBtn.textContent = '✓ Ya, Sudah Lunas'; }
      if (cancelBtn) cancelBtn.disabled = false;
      card.style.transition = 'transform 0.3s';
      card.style.transform = 'translateX(0)';
      if (bg) bg.style.opacity = 0;
      if (lbl) lbl.style.opacity = 0;
    }
  };
}

function bindSwipeBills() {
  const cards = document.querySelectorAll('#billGrid .bill-card:not(.paid)');
  cards.forEach(card => {
    if (card._swipeBound) return;
    card._swipeBound = true;
    const wrap = card.parentElement;
    const bg = wrap ? wrap.querySelector('.action-bg') : null;
    const lbl = wrap ? wrap.querySelector('.check-label') : null;
    let startX = 0, startY = 0, curX = 0, dragging = false, directionLocked = false, isHoriz = false;
    const threshold = 110;

    function onStart(e) {
      if (e.target.closest('button')) return;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      dragging = true;
      directionLocked = false;
      isHoriz = false;
      card.style.transition = 'none';
      if (bg) bg.style.transition = 'none';
      card.style.cursor = 'grabbing';
    }
    function onMove(e) {
      if (!dragging) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = cx - startX;
      const dy = cy - startY;
      // Diagonal guard: lock direction after 10px movement
      if (!directionLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        directionLocked = true;
        isHoriz = Math.abs(dx) > Math.abs(dy);
      }
      if (!isHoriz) return; // Vertical scroll - do nothing
      curX = Math.max(0, dx);
      const pct = Math.min(curX / threshold, 1);
      card.style.transform = `translateX(${curX}px)`;
      if (bg) bg.style.opacity = pct;
      if (lbl) lbl.style.opacity = pct;
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      card.style.cursor = 'grab';
      if (!isHoriz) return; // Was a scroll, ignore
      if (curX >= threshold) {
        // Show confirmation modal instead of immediately saving
        const id = card.getAttribute('data-id');
        const bill = getBills().find(b => b.id === id);
        if (bill) showSwipeConfirm(bill, card);
      } else {
        card.style.transition = 'transform 0.3s cubic-bezier(.34,1.1,.64,1)';
        if (bg) bg.style.transition = 'opacity 0.3s';
        card.style.transform = 'translateX(0)';
        if (bg) bg.style.opacity = 0;
        if (lbl) lbl.style.opacity = 0;
      }
      curX = 0;
    }
    card.addEventListener('touchstart', onStart, {passive: true});
    card.addEventListener('touchmove', onMove, {passive: true});
    card.addEventListener('touchend', onEnd);
    card.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  });
}

function openPayBill(id) {
  const bill = getBills().find(b => b.id === id);
  if (!bill || bill.status === 'paid') return;
  openModal('payBill', bill);
}

function openEditBill(id) {
  const bill = getBills().find(b => b.id === id);
  if (bill) openModal('addBill', bill);
}

function openBillHistory(id) {
  const bill = getBills().find(b => b.id === id);
  if (bill) openModal('billHistory', bill);
}

async function delBill(id) {
  if (!confirm('Hapus tagihan ini?')) return;
  try {
    await api('DELETE', `/bills/${id}`);
    await fetchBills();
    toast('Tagihan dihapus.', 'info'); renderBills();
    renderDashBills();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

async function saveBill(data, isEdit = false) {
  try {
    if (isEdit) {
      await api('PATCH', `/bills/${data.id}`, data);
    } else {
      await api('POST', '/bills', data);
    }
    await fetchBills();
    closeModal();
    toast(isEdit ? 'Tagihan diperbarui!' : 'Tagihan ditambahkan!', 'ok');
    renderBills(); renderDashBills();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

async function payBill(billId, createTx, accId, payDate) {
  try {
    // Tandai lunas di D1
    await api('PATCH', `/bills/${billId}`, { status: 'paid', paid_date: payDate });
    // Buat transaksi jika diminta
    if (createTx) {
      const bill = getBills().find(b => b.id === billId);
      if (bill && bill.amount > 0 && accId) {
        const cats = getCats();
        const tagCat = cats.find(c => c.name.toLowerCase().includes('tagihan')) || cats[cats.length - 1];
        await api('POST', '/transactions', {
          type: 'expense', amount: bill.amount, date: payDate,
          account_id: accId, category_id: tagCat?.id || cats[0]?.id,
          note: `Bayar ${bill.name}`, source: 'website'
        });
        const m = payDate.slice(0, 7);
        await Promise.all([fetchTx(m), fetchAccs()]);
      }
    }
    await fetchBills();
    closeModal();
    toast('Tagihan ditandai lunas!', 'ok');
    renderBills(); renderDashBills(); refresh();
  } catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

// Widget di Dashboard — hanya tampil jika ada tagihan relevan
