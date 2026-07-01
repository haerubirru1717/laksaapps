// ══════════════════════════════════════
// dashboard.js — Dashboard Page
// ══════════════════════════════════════

function getBankLabel(accName) {
  if (!accName || accName === '—') return { desktop: '', mobile: '' };
  let shortName = accName.replace(/bank/i, '').trim();
  if (!shortName) shortName = accName;
  let longName = accName;
  const isWallet = /ovo|gopay|dana|linkaja|shopeepay|spay|wallet/i.test(accName);
  if (!isWallet && !/bank/i.test(accName)) {
    longName = 'Bank ' + accName;
  }
  return {
    desktop: ` (${longName})`,
    mobile: ` (${shortName})`
  };
}

function renderDash() {
  const txs = getTx(), accs = getAccs();
  const now = curTxMonth || thisMon();
  
  const periodEl = el('dashPeriod');
  if (periodEl) {
    try {
      const parts = now.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      periodEl.textContent = new Date(y, m, 2).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } catch {
      periodEl.textContent = now;
    }
  }

  const total = accs.reduce((s, a) => s + (a.balance || 0), 0);
  const balEl = el('totalBal');
  
  // ── Saldo & Visibilitas ──
  const isHidden = localStorage.getItem('laksa_bal_hidden') === 'true';
  const eyeBtn = el('nwEyeBtn');
  if (eyeBtn) {
    const eyeOpen = eyeBtn.querySelector('.eye-open');
    const eyeClosed = eyeBtn.querySelector('.eye-closed');
    if (isHidden) {
      if (eyeOpen) eyeOpen.style.display = 'none';
      if (eyeClosed) eyeClosed.style.display = 'block';
    } else {
      if (eyeOpen) eyeOpen.style.display = 'block';
      if (eyeClosed) eyeClosed.style.display = 'none';
    }
  }

  if (balEl) {
    const prev = parseFloat(balEl.dataset.val);
    balEl.dataset.val = total;
    if (isHidden) {
      balEl.innerHTML = `<span class="bal-curr">${getSet().currency}</span> <span class="bal-masked">••••••</span>`;
    } else {
      if (!isNaN(prev) && prev !== total) {
        animateValue(balEl, prev, total, 1200);
      } else {
        const cfg = getSet();
        const val = total || 0;
        const neg = val < 0;
        const pfx = neg ? '−' : '';
        const abs = Math.abs(val);
        const isRp = cfg.currency === 'Rp';
        const locale = isRp ? 'id-ID' : 'en-US';
        const sep = isRp ? ',' : '.';
        const integerPart = Math.floor(abs).toLocaleString(locale);
        const decimalPart = (abs % 1).toFixed(2).slice(2);
        balEl.innerHTML = `<span class="bal-pfx">${pfx}</span><span class="bal-curr">${cfg.currency}</span> <span class="bal-int">${integerPart}</span><span class="bal-dec">${sep}${decimalPart}</span>`;
      }
    }
  }

  const bCount = accs.filter(a => !(/ovo|gopay|dana|linkaja|shopeepay|spay|wallet/i.test(a.name) || (detBank(a.name) && detBank(a.name).isWallet))).length;
  const eCount = accs.length - bCount;
  el('balSub').textContent = bCount + ' rekening' + (eCount > 0 ? ' • ' + eCount + ' e-wallet' : '');
  const mTx = txs.filter(t => mKey(t.date) === now);
  const inc = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // ── Hero 2×2 stats (Legacy ids - compatibility check) ──
  if (el('mIncomeHero')) el('mIncomeHero').textContent = fCur(inc);
  if (el('mExpenseHero')) el('mExpenseHero').textContent = fCur(exp);

  // Pertumbuhan kekayaan bersih bulanan (Net Worth Growth)
  const netChange = inc - exp;
  const prevTotal = total - netChange;
  let nwGrowthText = '';
  let nwGrowthCls = 'neu';
  
  if (prevTotal > 0 && netChange !== 0) {
    const pct = (netChange / prevTotal) * 100;
    const pctStr = Math.abs(pct) < 1 ? pct.toFixed(2) : pct.toFixed(1);
    nwGrowthText = (pct > 0 ? '+' : '-') + pctStr + '%';
    nwGrowthCls = pct > 0 ? 'pos' : 'neg';
  }

  // Transaksi terbaru masing-masing tipe untuk Hero stats (BUG-03) - disaring hanya bulan berjalan
  const lastIncome = [...mTx]
    .filter(t => t.type === 'income')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || b.id).localeCompare(a.created_at || a.id))[0];
  const lastExpense = [...mTx]
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || b.id).localeCompare(a.created_at || a.id))[0];

  const getBankLabelHtml = (tx) => {
    if (!tx) return '';
    const acc = accBy(tx.account_id);
    const labels = getBankLabel(acc.name);
    return `<span class="bank-lbl-desk">${labels.desktop}</span><span class="bank-lbl-mob">${labels.mobile}</span>`;
  };

  const incGrowthText = lastIncome ? `↑ ${fCur(lastIncome.amount, true)}${getBankLabelHtml(lastIncome)}` : '—';
  const expGrowthText = lastExpense ? `↓ ${fCur(-lastExpense.amount, true)}${getBankLabelHtml(lastExpense)}` : '—';

  const incG = el('incGrowth');
  const expG = el('expGrowth');
  if (incG) {
    if (lastIncome) {
      incG.innerHTML = incGrowthText;
      incG.className = 'nw-item-growth pos';
      incG.style.display = 'inline-flex';
    } else {
      incG.style.display = 'none';
    }
  }
  if (expG) {
    if (lastExpense) {
      expG.innerHTML = expGrowthText;
      expG.className = 'nw-item-growth neg';
      expG.style.display = 'inline-flex';
    } else {
      expG.style.display = 'none';
    }
  }

  // ── Render Growth Badge ──
  const balGrowthBadge = el('balGrowthBadge');
  if (balGrowthBadge) {
    if (!nwGrowthText || nwGrowthText === '0.0%' || nwGrowthText === '0.00%') {
      balGrowthBadge.style.display = 'none';
    } else {
      balGrowthBadge.style.display = 'inline-flex';
      const isPos = nwGrowthCls === 'pos';
      const arrow = isPos ? '↑' : '↓';
      balGrowthBadge.className = 'nw-growth-badge ' + nwGrowthCls;
      balGrowthBadge.innerHTML = `<span>${arrow}</span> <span>${nwGrowthText.replace(/^[+-]/, '')}</span>`;
    }
  }

  // Anggaran % & Sisa Anggaran (Hero Card)
  const buds = getBud().filter(b => b.month === now);
  const budEl = el('budgPctHero');
  const budGrowthEl = el('budgGrowth');
  if (budEl) {
    if (buds.length) {
      const totLim = buds.reduce((s, b) => s + b.limit_amount, 0);
      const totSpent = buds.reduce((s, b) => {
        const sp = mTx.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((ss, t) => ss + t.amount, 0);
        return s + Math.min(sp, b.limit_amount);
      }, 0);
      const pct = totLim > 0 ? Math.round((totSpent / totLim) * 100) : 0;
      budEl.textContent = pct + '%';
      if (budGrowthEl) {
        const sisaBudg = totLim - totSpent;
        if (sisaBudg < 0) {
          budGrowthEl.textContent = `Lebih ${fCur(Math.abs(sisaBudg), false, true)}`;
          budGrowthEl.className = 'nw-item-growth neg';
        } else {
          budGrowthEl.textContent = `Sisa ${fCur(sisaBudg, false, true)}`;
          budGrowthEl.className = 'nw-item-growth pos';
        }
      }
    } else {
      budEl.textContent = '—';
      if (budGrowthEl) {
        budGrowthEl.textContent = 'Belum diatur';
        budGrowthEl.className = 'nw-item-growth neu';
      }
    }
  }

  // Tagihan aktif & terdekat (Hero Card)
  const bills = getBills();
  const billEl = el('heroBillCount');
  const billGrowthEl = el('billGrowth');
  const activeBills = bills.filter(b => b.status !== 'paid');
  
  if (el('bellDot')) {
    el('bellDot').style.display = activeBills.length > 0 ? 'block' : 'none';
  }

  if (billEl) {
    if (activeBills.length === 0) {
      billEl.textContent = 'Nihil';
    } else {
      billEl.textContent = activeBills.length + ' aktif';
    }
  }

  if (billGrowthEl) {
    const ORDER = { overdue: 0, 'due-soon': 1, upcoming: 2 };
    const sortedActiveBills = [...activeBills].sort((a, b) => {
      const sa = billDueStatus(a), sb = billDueStatus(b);
      const oa = ORDER[sa.cls] ?? 3, ob = ORDER[sb.cls] ?? 3;
      if (oa !== ob) return oa - ob;
      if (sa.due && sb.due) return sa.due - sb.due;
      return 0;
    });
    const closestBill = sortedActiveBills[0];
    if (closestBill) {
      const st = billDueStatus(closestBill);
      const shortName = closestBill.name.length > 10 ? closestBill.name.slice(0, 8) + '...' : closestBill.name;
      billGrowthEl.textContent = `${shortName} · ${st.label}`;
      if (st.cls === 'overdue') {
        billGrowthEl.className = 'nw-item-growth neg';
      } else if (st.cls === 'due-soon') {
        billGrowthEl.className = 'nw-item-growth warn';
      } else {
        billGrowthEl.className = 'nw-item-growth pos';
      }
    } else {
      billGrowthEl.textContent = 'Nihil';
      billGrowthEl.className = 'nw-item-growth pos';
    }
  }

  // ── Top bar greeting + avatar ──
  renderDashTopbar();

  // Legacy ids (compat)
  if (el('mIncome')) el('mIncome').textContent = fCur(inc);
  if (el('mExpense')) el('mExpense').textContent = fCur(exp);
  if (el('incCnt')) el('incCnt').textContent = mTx.filter(t => t.type === 'income').length + ' transaksi';
  if (el('expCnt')) el('expCnt').textContent = mTx.filter(t => t.type === 'expense').length + ' transaksi';

  renderDCs(accs, total, txs, now);
  renderRecent(txs);
  renderCatDonut(mTx);
  renderBudgProg(mTx, now);
  renderDashBills();
}

// ── TOP BAR: greeting + avatar ──
function renderDashTopbar() {
  const p = getProfile();
  const name = p?.name || getSet().name || '—';
  const nameEl = el('dashGreetName');
  if (nameEl) nameEl.textContent = name;
  const handleEl = el('dashProfileHandle');
  if (handleEl) {
    const handle = p?.email ? '@' + p.email.split('@')[0] : '@user';
    handleEl.textContent = handle;
  }
  renderDashAvatar();
}

function toggleBalanceVisibility(e) {
  if (e) e.stopPropagation();
  const isHidden = localStorage.getItem('laksa_bal_hidden') === 'true';
  localStorage.setItem('laksa_bal_hidden', isHidden ? 'false' : 'true');
  renderDash();
}

function renderDashAvatar() {
  const avatarEl = el('dashAvatar');
  if (!avatarEl) return;
  const saved = localStorage.getItem('laksa_avatar');
  const p = getProfile();
  const name = p?.name || getSet().name || '?';
  const initial = (name[0] || '?').toUpperCase();
  let hash = 0; for (let i = 0; i < name.length; i++)hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const grad = `linear-gradient(135deg,hsl(${hue},65%,38%),hsl(${(hue + 40) % 360},70%,55%))`;
  const inner = avatarEl.querySelector('.dash-avatar-inner');
  if (!inner) return;
  if (saved) {
    inner.innerHTML = `<img src="${saved}" alt="Foto profil"/>`;
  } else {
    inner.innerHTML = `<div class="dash-avatar-initials" id="dashAvatarInitials" style="background:${grad}">${initial}</div>`;
  }
}

function toggleAvatarDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('avatarDropdown');
  if (!dd) return;
  const isOpen = dd.classList.contains('open');
  closeAvatarDropdown();
  if (!isOpen) dd.classList.add('open');
}
function closeAvatarDropdown() {
  const dd = document.getElementById('avatarDropdown');
  if (dd) dd.classList.remove('open');
}
function triggerAvatarUpload(e) {
  e.stopPropagation();
  closeAvatarDropdown();
  document.getElementById('avatarInput').click();
}
function logoutAkun(e) {
  e.stopPropagation();
  closeAvatarDropdown();
  if (!confirm('Logout? Data keuangan di server tetap aman.')) return;
  clearToken();
  localStorage.removeItem('laksa_profile');
  localStorage.removeItem('laksa_avatar');
  const K_KEYS = ['ft_tx', 'ft_bud', 'ft_goals', 'ft_acc', 'ft_cats', 'ft_set', 'ft_rec'];
  K_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
}
// Tutup dropdown saat klik di luar
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.dash-profile-btn');
  if (!btn) closeAvatarDropdown();
});

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('File harus berupa gambar.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    // Compress to max 200px, ~30KB
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const maxPx = 200;
      let w = img.width, h = img.height;
      if (w > h) { h = Math.round(h * (maxPx / w)); w = maxPx; } else { w = Math.round(w * (maxPx / h)); h = maxPx; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.82);
      try {
        localStorage.setItem('laksa_avatar', compressed);
        renderDashAvatar();
        if (typeof updateSidebarProfile === 'function') updateSidebarProfile();
        if (typeof updateProfilePreview === 'function') updateProfilePreview();
        toast('Foto profil diperbarui!', 'ok');
      } catch (err) {
        toast('Gagal simpan foto — coba ukuran lebih kecil.', 'err');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderDCs(accs, total, txs, now) {
  const wrap = el('accsScroll');
  const eWrap = el('ewalletScroll');
  if (!wrap || !eWrap) return;
  const WALLET_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2v-2"/><rect x="18" y="9" width="4" height="6" rx="1"/><circle cx="20" cy="12" r="1" fill="rgba(255,255,255,0.9)" stroke="none"/></svg>`;
  
  let bHtml = '', eHtml = '';
  
  accs.forEach(acc => {
    const b = detBank(acc.name);
    const lastAccTx = [...txs]
      .filter(t => t.account_id === acc.id && mKey(t.date) === now)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || b.id).localeCompare(a.created_at || a.id))[0];
    
    let dStr = '';
    if (lastAccTx) {
      if (lastAccTx.type === 'income') {
        dStr = `<span style="color:#2ecc71;font-weight:600">↑ ${fCur(lastAccTx.amount, true)}</span>`;
      } else if (lastAccTx.type === 'expense') {
        dStr = `<span style="color:#ff4d4d;font-weight:600">↓ ${fCur(-lastAccTx.amount, true)}</span>`;
      } else {
        dStr = `<span style="color:rgba(255,255,255,0.6)">↔ ${fCur(lastAccTx.amount)}</span>`;
      }
    }
    const isEwallet = b && b.isWallet || /ovo|gopay|dana|linkaja|shopeepay|spay|wallet/i.test(acc.name);
    const isNegBal = acc.balance < 0;
    const pct = total > 0 ? Math.max(0, Math.min((acc.balance / total) * 100, 100)) : 0;
    
    if (isEwallet) {
      const nm = acc.name.toLowerCase();
      let cCls = '', ewDarkImg = null;
      
      if (nm.includes('gopay'))                              { cCls='ec-gopay';  ewDarkImg='ewallet/gopay-dark.jpg'; }
      else if (nm.includes('ovo'))                           { cCls='ec-ovo';    ewDarkImg='ewallet/ovo-dark.jpg'; }
      else if (nm.includes('dana'))                          { cCls='ec-dana';   ewDarkImg='ewallet/dana-dark.jpg'; }
      else if (nm.includes('linkaja'))                       { cCls='ec-linkaja';ewDarkImg='ewallet/linkaja-dark.jpg'; }
      else if (nm.includes('shopee') || nm.includes('spay')) { cCls='ec-spay';   ewDarkImg='ewallet/shopeepay-dark.jpg'; }
      
      // Selalu pakai *-dark.jpg sebagai badge icon — brand-color bg langsung,
      // tanpa mix-blend-mode (menghindari kotak putih/logo invisible di kedua tema)
      const ewImg = ewDarkImg;
      
      const init = (acc.name.replace(/[^a-zA-Z0-9]/g,'').slice(0,3)||'?').toUpperCase();
      // Badge icon: border-radius 8px, tanpa blend mode
      const logoEl = ewImg
        ? `<img src="${ewImg}" alt="${esc(acc.name)}"
             style="max-height:42px;max-width:88px;object-fit:contain;display:block;border-radius:8px;"
             onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
           <span style="display:none;font-size:0.8rem;font-weight:800;color:rgba(255,255,255,0.9);letter-spacing:.06em">${init}</span>`
        : `<span style="font-size:0.8rem;font-weight:800;color:rgba(255,255,255,0.9);letter-spacing:.06em">${init}</span>`;
      
      eHtml += `<div class="ecard ${cCls}" onclick="openAccDetail('${acc.id}')">
        <div class="blob b1"></div><div class="blob b2"></div>
        <div class="ecard-top">
          <div style="display:flex;align-items:center;justify-content:flex-end">${logoEl}</div>
        </div>
        <div class="ecard-bottom">
          <div class="ecard-lbl">${esc(acc.name)}</div>
          <div class="ecard-saldo">${fCur(acc.balance)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
            <span class="ecard-pct" style="margin-top:0;">${pct.toFixed(0)}% dari total</span>
            ${dStr ? `<div class="dc-delta" style="margin-top:0;">${dStr}</div>` : ''}
          </div>
        </div>
      </div>`;
    } else {
      const c1 = (b && b.color) ? b.color : (acc.color || '#7c3aed');
      const c2 = (b && b.c2) ? b.c2 : (acc.color || '#4e1fb5');
      const isWallet = /dompet|tunai|cash|kas/i.test(acc.name);
      const logo = getLogoHtml(acc.name, b, 'dc-logo', 'dc-logo-fb', b && b.isSquare ? 'width:100%;height:100%;object-fit:contain;' : '');
      const topLeft = isWallet ? `<div class="dc-wallet-icon">${WALLET_SVG}</div>` : `<div class="dc-chip"></div>`;
      const balColor = isNegBal ? 'rgba(255,150,150,1)' : 'rgba(255,255,255,1)';
      const logoWrapStyle = b && b.isSquare ? 'background:transparent;box-shadow:none;padding:0;' : '';
      
      bHtml += `<div class="dc" style="background:linear-gradient(135deg,${c1},${c2})" onclick="openAccDetail('${acc.id}')">
        <div class="dc-top">${topLeft}<div class="dc-logo-wrap" style="${logoWrapStyle}">${logo}</div></div>
        <div class="dc-mid"><div class="dc-bal-lbl">Saldo Tersedia</div><div class="dc-bal" style="color:${balColor}">${fCur(acc.balance)}</div><div class="dc-bar-wrap"><div class="dc-bar" style="width:${pct.toFixed(1)}%;${isNegBal ? 'background:rgba(255,120,120,.7)' : ''}"></div></div></div>
        <div class="dc-bot"><div><div class="dc-name" style="text-transform:uppercase">${esc(acc.name)}</div>${dStr ? `<div class="dc-delta">${dStr}</div>` : ''}</div><div class="dc-pct">${isNegBal ? `<span style="color:rgba(255,150,150,1);font-size:.62rem;font-weight:700">MINUS</span>` : pct.toFixed(0) + '%<br><span style="font-size:.55rem">dari total</span>'}</div></div>
      </div>`;
    }
  });
  
  bHtml += `<div class="dc dc-add" onclick="openModal('addAccount')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Tambah Rekening</span></div>`;
  eHtml += `<div class="ecard ec-add" onclick="openModal('addEwallet')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Tambah E-Wallet</span></div>`;
  
  wrap.innerHTML = bHtml;
  eWrap.innerHTML = eHtml;
  setTimeout(updateAccArrows, 50);
}

function renderRecent(txs) {
  const list = el('recentList');
  const r = [...txs].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || b.id).localeCompare(a.created_at || a.id)).slice(0, 5);
  if (!r.length) { list.innerHTML = '<div class="empty" style="padding:1rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".25"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg><p style="font-size:.76rem;margin-top:-.3rem">Belum ada transaksi</p></div>'; return; }
  list.innerHTML = r.map(tx => {
    const cat = catBy(tx.category_id);
    const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '↔';
    const ico = tx.type === 'transfer' ? `<img src="icons/icon-transfer.svg" class="cat-icon-sm" width="20" height="20" alt="">` : getCatIcon(tx.category_id);
    const dispName = tx.store ? `${tx.note || cat.name} • 🏪 ${tx.store}` : (tx.note || cat.name);
    return `<li class="tx-item"><div class="tx-ico ${tx.type === 'income' ? 'inc' : tx.type === 'expense' ? 'exp' : 'trf'}">${ico}</div><div class="tx-info"><div class="tx-name">${esc(dispName)}</div><div class="tx-cat">${fDate(tx.date)} · ${esc(cat.name)}</div></div><div class="tx-amt ${tx.type === 'income' ? 'inc' : tx.type === 'expense' ? 'exp' : 'trf'}">${sign}${fCur(tx.amount)}</div></li>`;
  }).join('');
}

function renderBudgProg(mTx, now) {
  const buds = getBud().filter(b => b.month === now), list = el('budgProg');
  if (!buds.length) { list.innerHTML = '<li style="color:var(--t3);font-size:.8rem;padding:.4rem 0">Belum ada anggaran. <button class="lbtn" onclick="go(\'budget\')">Buat →</button></li>'; return; }
  list.innerHTML = buds.slice(0, 4).map(b => {
    const spent = mTx.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + t.amount, 0);
    const pct = b.limit_amount > 0 ? Math.min((spent / b.limit_amount) * 100, 100) : 0;
    const cat = catBy(b.category_id); const fc = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
    return `<li><div class="prog-hdr"><span style="color:var(--ink2);display:flex;align-items:center;gap:.3rem"><span style="display:flex;align-items:center;opacity:.7">${getCatIcon(b.category_id)}</span>${esc(cat.name)}</span><span style="font-size:.72rem;color:var(--ink3)">${fCur(spent)} / ${fCur(b.limit_amount)}</span></div><div class="ptrack"><div class="pfill ${fc}" style="width:${pct}%"></div></div></li>`;
  }).join('');
}

// ── CHARTS ──
function upsert(id, cfg) {
  if (CH[id]) { try { CH[id].destroy(); } catch (e) { } delete CH[id]; }
  const c = el(id); if (!c) return;
  if (id === 'catChart') { c.width = 140; c.height = 140; c.style.width = '140px'; c.style.height = '140px'; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  Chart.defaults.color = isDark ? 'rgba(210,220,240,0.7)' : 'rgba(15,23,42,0.55)';
  Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  try { CH[id] = new Chart(c, cfg); } catch (e) { console.warn(e); }
}

function renderCatDonut(mTx) {
  const exp = mTx.filter(t => t.type === 'expense');
  const lg = el('catLegend');
  // Always enforce fixed canvas size BEFORE chart creation to prevent resize bugs
  const cv = el('catChart');
  if (cv) { cv.width = 140; cv.height = 140; cv.style.width = '140px'; cv.style.height = '140px'; }
  if (!exp.length) { upsert('catChart', { type: 'doughnut', data: { labels: ['Kosong'], datasets: [{ data: [1], backgroundColor: ['rgba(0,0,0,.06)'] }] }, options: { responsive: false, maintainAspectRatio: false, plugins: { legend: { display: false } }, animation: { duration: 0 } } }); lg.innerHTML = ''; return; }
  const grp = {}; exp.forEach(t => { grp[t.category_id] = (grp[t.category_id] || 0) + t.amount; });
  const sorted = Object.entries(grp).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const tot = sorted.reduce((s, [, v]) => s + v, 0);
  upsert('catChart', { type: 'doughnut', data: { labels: sorted.map(([id]) => { const c = catBy(id); return c.name; }), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: COLORS.slice(0, sorted.length), borderWidth: 2, borderColor: 'rgba(255,255,255,.8)', hoverOffset: 5 }] }, options: { responsive: false, maintainAspectRatio: false, cutout: '66%', animation: { duration: 400 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + fCur(c.raw) + ' (' + ((c.raw / tot) * 100).toFixed(1) + '%)' } } } } });
  lg.innerHTML = sorted.map(([id, v], i) => { const c = catBy(id); return `<li><span class="ldot" style="background:${COLORS[i]}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span><span>${((v / tot) * 100).toFixed(0)}%</span></li>`; }).join('');
}

// ── TRANSACTIONS ──

// ── Dashboard Bills Widget ──
function renderDashBills() {
  const bills = getBills();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Filter: overdue + due ≤ 7 hari, belum lunas
  const urgent = bills.filter(b => {
    if (b.status === 'paid') return false;
    const st = billDueStatus(b);
    return st.cls === 'overdue' || st.cls === 'due-soon';
  });
  const widget = el('dashBillWidget');
  if (!widget) return;
  if (!urgent.length) { widget.style.display = 'none'; return; }
  widget.style.display = '';
  // Sort: overdue dulu, lalu by due date
  const ORDER = { overdue: 0, 'due-soon': 1 };
  urgent.sort((a, b) => {
    const sa = billDueStatus(a), sb = billDueStatus(b);
    const oa = ORDER[sa.cls] ?? 2, ob = ORDER[sb.cls] ?? 2;
    if (oa !== ob) return oa - ob;
    if (sa.due && sb.due) return sa.due - sb.due;
    return 0;
  });
  // Opsi B: semua overdue + due-soon, max 5
  const show = urgent.slice(0, 5);
  const totalUnpaid = bills.filter(b => b.status !== 'paid' && b.amount > 0).reduce((s, b) => s + b.amount, 0);
  const list = el('dashBillList');
  if (list) {
    list.innerHTML = show.map(b => {
      const st = billDueStatus(b);
      const dotColor = st.cls === 'overdue' ? 'var(--expense)' : 'var(--gold)';
      return `<div class="dash-bill-item">
    <span class="dash-bill-dot" style="background:${dotColor}"></span>
    <div class="dash-bill-info">
      <div class="dash-bill-name">${esc(b.name)}</div>
      <div class="dash-bill-sub">${st.label}</div>
    </div>
    ${b.amount > 0 ? `<span class="dash-bill-amt">${fCur(b.amount)}</span>` : ''}
  </div>`;
    }).join('');
  }
  const totalEl = el('dashBillTotal');
  if (totalEl) totalEl.textContent = totalUnpaid > 0 ? fCur(totalUnpaid) : '';
  const moreEl = el('dashBillMore');
  if (moreEl) moreEl.style.display = urgent.length > 5 ? '' : 'none';
}

// ── Account Scroll ──
