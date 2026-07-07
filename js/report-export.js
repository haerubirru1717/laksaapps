// ═══════════════════════════════════════════
//  LAKSA — LAPORAN KEUANGAN (PDF + CSV)
//  Standalone module for financial report
//  generation. Data sourced from app cache.
// ═══════════════════════════════════════════

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ── Helpers ──
const _fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

function _categoryBreakdown(txs, type) {
  const map = {};
  txs.filter(t => t.type === type).forEach(t => {
    const key = t.category_name || 'Tanpa Kategori';
    if (!map[key]) map[key] = { name: key, total: 0, count: 0 };
    map[key].total += t.amount;
    map[key].count += 1;
  });
  const arr = Object.values(map).sort((a, b) => b.total - a.total);
  const grand = arr.reduce((s, x) => s + x.total, 0);
  arr.forEach(x => x.pct = grand ? (x.total / grand * 100) : 0);
  return arr;
}

function _weeklyCashflow(txs) {
  const weeks = [
    { label: 'Minggu 1 (1-7)', from: 1, to: 7 },
    { label: 'Minggu 2 (8-14)', from: 8, to: 14 },
    { label: 'Minggu 3 (15-21)', from: 15, to: 21 },
    { label: 'Minggu 4 (22-akhir)', from: 22, to: 31 },
  ];
  return weeks.map(w => {
    const inWeek = txs.filter(t => {
      const day = parseInt(t.date.split('-')[2], 10);
      return day >= w.from && day <= w.to;
    });
    const income = inWeek.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = inWeek.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { label: w.label, income, expense, selisih: income - expense };
  });
}

// ── Build Monthly Report ──
function _buildMonthly(period) {
  const [year, month] = period.split('-').map(Number);
  const allTx = typeof getTxYear === 'function' ? getTxYear() : getTx();
  const txs = allTx.filter(t => t.date.slice(0, 7) === period);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const prevDate = new Date(year, month - 2, 1);
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevTxs = allTx.filter(t => t.date.slice(0, 7) === prevPeriod);
  const prevExpenseByCat = {};
  prevTxs.filter(t => t.type === 'expense').forEach(t => {
    prevExpenseByCat[t.category_name] = (prevExpenseByCat[t.category_name] || 0) + t.amount;
  });

  const expenseCat = _categoryBreakdown(txs, 'expense');
  const incomeCat = _categoryBreakdown(txs, 'income');
  const weekly = _weeklyCashflow(txs);

  const budgetRows = (getBud() || []).filter(b => b.month === period).map(b => {
    const realisasi = expenseCat.find(c => c.name === b.category_name)?.total || 0;
    return {
      category: b.category_name || b.category_id,
      limit: b.limit_amount,
      realisasi,
      pct: b.limit_amount ? (realisasi / b.limit_amount * 100) : 0,
    };
  });

  const billRows = (getBills() || []).filter(b => (b.due_date || '').slice(0, 7) === period);
  const piutangRows = (getPiutang() || []).filter(p => p.status === 'active');

  const insights = [];
  if (expenseCat.length) {
    const top = expenseCat[0];
    insights.push(`Pengeluaran terbesar bulan ini ada di kategori ${top.name} sebesar ${_fmtRp(top.total)} (${top.pct.toFixed(1)}% dari total pengeluaran).`);
  }
  expenseCat.forEach(c => {
    const prev = prevExpenseByCat[c.name];
    if (prev && prev > 0) {
      const change = ((c.total - prev) / prev) * 100;
      if (Math.abs(change) >= 20) {
        const dir = change > 0 ? 'naik' : 'turun';
        insights.push(`Pengeluaran ${c.name} ${dir} ${Math.abs(change).toFixed(0)}% dibanding bulan lalu (${_fmtRp(prev)} -> ${_fmtRp(c.total)}).`);
      }
    }
  });
  budgetRows.forEach(b => {
    if (b.pct >= 100) {
      insights.push(`Anggaran ${b.category} sudah terlampaui ${b.pct.toFixed(0)}% (${_fmtRp(b.realisasi)} dari batas ${_fmtRp(b.limit)}).`);
    } else if (b.pct >= 80) {
      insights.push(`Anggaran ${b.category} sudah terpakai ${b.pct.toFixed(0)}%, mendekati batas ${_fmtRp(b.limit)}.`);
    }
  });
  if (income > 0) {
    const savingRate = ((income - expense) / income * 100);
    insights.push(`Rasio tabungan bulan ini ${savingRate.toFixed(1)}% dari total pemasukan (${_fmtRp(income - expense)} sisa dari ${_fmtRp(income)}).`);
  }
  const unpaidBills = billRows.filter(b => b.status === 'unpaid');
  if (unpaidBills.length) {
    insights.push(`Ada ${unpaidBills.length} tagihan belum dibayar bulan ini senilai ${_fmtRp(unpaidBills.reduce((s, b) => s + b.amount, 0))}.`);
  }
  if (insights.length < 3) {
    insights.push(`Total ${txs.length} transaksi tercatat sepanjang bulan ini.`);
  }

  return {
    type: 'monthly', period, year, month,
    income, expense, selisih: income - expense, count: txs.length,
    weekly, expenseCat, incomeCat, budgetRows, billRows, piutangRows,
    goals: getGoals() || [], accounts: getAccs() || [],
    insights: insights.slice(0, 5),
  };
}

// ── Build Yearly Report ──
function _buildYearly(yearStr) {
  const year = parseInt(yearStr, 10);
  const allTx = typeof getTxYear === 'function' ? getTxYear() : getTx();
  const txs = allTx.filter(t => t.date.slice(0, 4) === yearStr);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const mStr = `${yearStr}-${String(m).padStart(2, '0')}`;
    const mTxs = txs.filter(t => t.date.slice(0, 7) === mStr);
    const inc = mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = mTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    monthly.push({ month: MONTH_NAMES[m - 1], inc, exp, selisih: inc - exp, count: mTxs.length });
  }

  const expenseCat = _categoryBreakdown(txs, 'expense');
  const incomeCat = _categoryBreakdown(txs, 'income');

  const expenseByDay = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    expenseByDay[t.date] = (expenseByDay[t.date] || 0) + t.amount;
  });
  let mostExpensiveDay = null, mostExpensiveDayAmt = 0;
  Object.entries(expenseByDay).forEach(([d, a]) => { if (a > mostExpensiveDayAmt) { mostExpensiveDayAmt = a; mostExpensiveDay = d; } });

  const merchantCount = {};
  txs.forEach(t => { if (t.store) { merchantCount[t.store] = (merchantCount[t.store] || 0) + 1; } });
  let topMerchant = null, topMerchantCount = 0;
  Object.entries(merchantCount).forEach(([s, c]) => { if (c > topMerchantCount) { topMerchantCount = c; topMerchant = s; } });

  let biggestTx = null;
  txs.forEach(t => { if (!biggestTx || t.amount > biggestTx.amount) biggestTx = t; });

  const savingsRatio = income > 0 ? Math.max(0, (income - expense) / income) : 0;
  const savingsScore = Math.min(40, savingsRatio * 40 / 0.3);
  const surplusMonths = monthly.filter(m => m.count > 0 && m.selisih >= 0).length;
  const activeMonths = monthly.filter(m => m.count > 0).length || 1;
  const consistencyScore = (surplusMonths / activeMonths) * 30;
  const budgets = getBud() || [];
  const budgetRowsYear = budgets.filter(b => b.month && b.month.startsWith(yearStr));
  let budgetScore = 30;
  if (budgetRowsYear.length) {
    const compliant = budgetRowsYear.filter(b => {
      const realisasi = expenseCat.find(c => c.name === b.category_name)?.total || 0;
      return realisasi <= b.limit_amount;
    }).length;
    budgetScore = (compliant / budgetRowsYear.length) * 30;
  }
  const healthScore = Math.round(savingsScore + consistencyScore + budgetScore);

  const insights = [];
  insights.push(`Total pemasukan tahun ini ${_fmtRp(income)}, pengeluaran ${_fmtRp(expense)}, dengan selisih ${_fmtRp(income - expense)}.`);
  if (mostExpensiveDay) insights.push(`Hari paling boros adalah ${mostExpensiveDay} dengan total pengeluaran ${_fmtRp(mostExpensiveDayAmt)}.`);
  if (topMerchant) insights.push(`Merchant paling sering dikunjungi: ${topMerchant} (${topMerchantCount}x transaksi).`);
  if (biggestTx) insights.push(`Transaksi terbesar: ${biggestTx.type === 'income' ? 'pemasukan' : 'pengeluaran'} ${_fmtRp(biggestTx.amount)} (${biggestTx.note || biggestTx.category_name || '-'}) pada ${biggestTx.date}.`);
  insights.push(`Skor kesehatan keuangan tahun ini: ${healthScore}/100.`);

  return {
    type: 'yearly', period: yearStr, year,
    income, expense, selisih: income - expense, count: txs.length,
    monthly, expenseCat, incomeCat,
    mostExpensiveDay, mostExpensiveDayAmt, topMerchant, topMerchantCount, biggestTx,
    healthScore, insights,
    accounts: getAccs() || [],
  };
}

// ── Available periods from transaction data ──
function _getAvailableMonths() {
  const allTx = typeof getTxYear === 'function' ? getTxYear() : getTx();
  const set = new Set(allTx.map(t => t.date.slice(0, 7)));
  return [...set].sort().reverse();
}
function _getAvailableYears() {
  const allTx = typeof getTxYear === 'function' ? getTxYear() : getTx();
  const set = new Set(allTx.map(t => t.date.slice(0, 4)));
  return [...set].sort().reverse();
}

// ═══════════════════════════════════════════
//  MODAL UI — "Laporan Keuangan"
// ═══════════════════════════════════════════

function openReportExport() {
  let existing = document.getElementById('reportExportModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'reportExportModal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--card,#fff);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:420px;animation:slideUp .25s ease;';

  sheet.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <h3 style="margin:0;font-size:1.05rem;font-weight:700;color:var(--ink,#1a1a1a);">Laporan Keuangan</h3>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--ink3,#999);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div id="repExpStep1">
      <p style="font-size:.82rem;color:var(--ink3,#777);margin:0 0 14px;">Pilih format ekspor:</p>
      <div style="display:flex;gap:10px;">
        <button class="rep-exp-btn" onclick="_repExpSelectFormat('pdf')" style="flex:1;padding:16px 12px;border-radius:14px;border:1.5px solid var(--gs-border,#e5e7eb);background:var(--gs-1,#f9fafb);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:all .15s;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span style="font-size:.82rem;font-weight:600;color:var(--ink,#1a1a1a);">PDF</span>
          <span style="font-size:.68rem;color:var(--ink3,#999);">Laporan lengkap</span>
        </button>
        <button class="rep-exp-btn" onclick="_repExpSelectFormat('csv')" style="flex:1;padding:16px 12px;border-radius:14px;border:1.5px solid var(--gs-border,#e5e7eb);background:var(--gs-1,#f9fafb);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:all .15s;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          <span style="font-size:.82rem;font-weight:600;color:var(--ink,#1a1a1a);">CSV</span>
          <span style="font-size:.68rem;color:var(--ink3,#999);">Spreadsheet</span>
        </button>
      </div>
    </div>

    <div id="repExpStep2" style="display:none;">
      <button onclick="_repExpBack()" style="background:none;border:none;cursor:pointer;padding:0;color:var(--accent,#6366f1);font-size:.78rem;font-weight:600;display:flex;align-items:center;gap:4px;margin-bottom:14px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Kembali
      </button>
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <div style="flex:1;">
          <label style="font-size:.72rem;font-weight:600;color:var(--ink3,#999);display:block;margin-bottom:5px;">Jenis Laporan</label>
          <select id="repExpType" onchange="_repExpPopulatePeriods()" style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--gs-border,#e5e7eb);background:var(--card,#fff);font-size:.82rem;color:var(--ink,#1a1a1a);">
            <option value="monthly">Bulanan</option>
            <option value="yearly">Tahunan</option>
          </select>
        </div>
        <div style="flex:1;">
          <label style="font-size:.72rem;font-weight:600;color:var(--ink3,#999);display:block;margin-bottom:5px;">Periode</label>
          <select id="repExpPeriod" style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--gs-border,#e5e7eb);background:var(--card,#fff);font-size:.82rem;color:var(--ink,#1a1a1a);"></select>
        </div>
      </div>
      <button id="repExpDownload" onclick="_repExpDownload()" style="width:100%;padding:13px;border-radius:12px;border:none;background:var(--accent,#6366f1);color:#fff;font-size:.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
    </div>
  `;

  modal.appendChild(sheet);
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .rep-exp-btn:hover { border-color: var(--accent,#6366f1) !important; background: rgba(99,102,241,0.06) !important; }
  `;
  sheet.appendChild(style);
}

let _repExpFormat = 'pdf';

function _repExpSelectFormat(fmt) {
  _repExpFormat = fmt;
  document.getElementById('repExpStep1').style.display = 'none';
  document.getElementById('repExpStep2').style.display = '';
  _repExpPopulatePeriods();
}

function _repExpBack() {
  document.getElementById('repExpStep1').style.display = '';
  document.getElementById('repExpStep2').style.display = 'none';
}

function _repExpPopulatePeriods() {
  const type = document.getElementById('repExpType').value;
  const sel = document.getElementById('repExpPeriod');
  sel.innerHTML = '';
  if (type === 'monthly') {
    const months = _getAvailableMonths();
    months.forEach(m => {
      const [y, mm] = m.split('-');
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${MONTH_NAMES[parseInt(mm, 10) - 1]} ${y}`;
      sel.appendChild(opt);
    });
  } else {
    const years = _getAvailableYears();
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `Tahun ${y}`;
      sel.appendChild(opt);
    });
  }
}

function _repExpDownload() {
  const type = document.getElementById('repExpType').value;
  const period = document.getElementById('repExpPeriod').value;
  if (!period) { toast('Pilih periode dulu.', 'info'); return; }

  const report = type === 'monthly' ? _buildMonthly(period) : _buildYearly(period);

  if (_repExpFormat === 'pdf') {
    _exportPdf(report);
  } else {
    _exportCsv(report);
  }

  const modal = document.getElementById('reportExportModal');
  if (modal) modal.remove();
  toast(`Laporan ${_repExpFormat.toUpperCase()} diunduh!`, 'ok');
}

// ═══════════════════════════════════════════
//  PDF EXPORT — jsPDF + autoTable
// ═══════════════════════════════════════════

function _stripEmoji(s) {
  return String(s)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _exportPdf(r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const navy = [12, 35, 64];
  const teal = [15, 110, 86];
  const rule = [210, 216, 213];
  const userName = (typeof getSet === 'function' ? getSet().name : null) || 'Pengguna Laksa';
  const title = r.type === 'monthly' ? `${MONTH_NAMES[r.month - 1]} ${r.year}` : `Tahun ${r.year}`;

  // Header band
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setFillColor(...teal);
  doc.rect(0, 30, pageW, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('LAKSA', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Laporan Keuangan Pribadi', 14, 19.5);
  doc.setFontSize(9);
  doc.text(`${userName}`, pageW - 14, 13, { align: 'right' });
  doc.text(`Laporan ${r.type === 'monthly' ? 'Bulanan' : 'Tahunan'} \u2014 ${title}`, pageW - 14, 19.5, { align: 'right' });

  let y = 42;
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Ringkasan', 14, y);
  doc.setDrawColor(...rule);
  doc.setLineWidth(0.2);
  doc.line(14, y + 2, pageW - 14, y + 2);
  y += 6;

  doc.autoTable({
    startY: y,
    theme: 'grid',
    head: [['Pemasukan', 'Pengeluaran', 'Selisih', 'Transaksi']],
    body: [[_fmtRp(r.income), _fmtRp(r.expense), _fmtRp(r.selisih), String(r.count)]],
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 9.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: rule, lineWidth: 0.15 },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 9;

  function sectionTitle(txt) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5); doc.setTextColor(...navy);
    doc.text(_stripEmoji(txt), 14, y);
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.2);
    doc.line(14, y + 1.8, pageW - 14, y + 1.8);
    y += 6;
  }
  function table(head, body) {
    doc.autoTable({
      startY: y, theme: 'striped',
      head: [head], body,
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 247, 246] },
      styles: { fontSize: 8.5, font: 'helvetica', textColor: [35, 35, 35], lineColor: rule, lineWidth: 0.1, cellPadding: 2.2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 9;
  }

  if (r.type === 'monthly') {
    sectionTitle('Insight & Rekomendasi');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9); doc.setTextColor(40, 40, 40);
    r.insights.forEach(i => {
      const lines = doc.splitTextToSize('\u2022 ' + i, pageW - 28);
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(lines, 14, y); y += lines.length * 4.2 + 2;
    });
    y += 4;

    sectionTitle('Arus Kas Mingguan');
    table(['Minggu', 'Pemasukan', 'Pengeluaran', 'Selisih'],
      r.weekly.map(w => [w.label, _fmtRp(w.income), _fmtRp(w.expense), _fmtRp(w.selisih)]));

    sectionTitle('Breakdown Pengeluaran per Kategori');
    table(['Kategori', 'Total', '%'],
      r.expenseCat.length ? r.expenseCat.map(c => [c.name, _fmtRp(c.total), c.pct.toFixed(1) + '%']) : [['-', '-', '-']]);

    sectionTitle('Breakdown Pemasukan per Kategori');
    table(['Kategori', 'Total', '%'],
      r.incomeCat.length ? r.incomeCat.map(c => [c.name, _fmtRp(c.total), c.pct.toFixed(1) + '%']) : [['-', '-', '-']]);

    sectionTitle('Saldo Semua Rekening');
    table(['Rekening', 'Saldo'], r.accounts.map(a => [a.name, _fmtRp(a.balance)]));

    sectionTitle('Evaluasi Anggaran vs Realisasi');
    table(['Kategori', 'Batas', 'Realisasi', '%'],
      r.budgetRows.length ? r.budgetRows.map(b => [b.category, _fmtRp(b.limit), _fmtRp(b.realisasi), b.pct.toFixed(0) + '%']) : [['Tidak ada anggaran', '-', '-', '-']]);

    sectionTitle('Status Tagihan');
    table(['Nama', 'Jumlah', 'Jatuh Tempo', 'Status'],
      r.billRows.length ? r.billRows.map(b => [b.name, _fmtRp(b.amount), b.due_date || '-', b.status === 'paid' ? 'Lunas' : 'Belum Bayar']) : [['Tidak ada tagihan', '-', '-', '-']]);

    sectionTitle('Piutang Aktif');
    table(['Peminjam', 'Jumlah', 'Dikembalikan', 'Sisa'],
      r.piutangRows.length ? r.piutangRows.map(p => [p.borrower_name, _fmtRp(p.amount), _fmtRp(p.returned || 0), _fmtRp(p.amount - (p.returned || 0))]) : [['Tidak ada piutang', '-', '-', '-']]);

    sectionTitle('Progress Target Menabung');
    table(['Target', 'Saat Ini', 'Tujuan', '%'],
      r.goals.length ? r.goals.map(g => [g.name, _fmtRp(g.current), _fmtRp(g.target), g.target ? ((g.current / g.target * 100).toFixed(0) + '%') : '-']) : [['Belum ada target', '-', '-', '-']]);

  } else {
    sectionTitle(`Financial Health Score: ${r.healthScore}/100`);
    y += 2;
    sectionTitle('Insight & Statistik');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9); doc.setTextColor(40, 40, 40);
    r.insights.forEach(i => {
      const lines = doc.splitTextToSize('\u2022 ' + i, pageW - 28);
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(lines, 14, y); y += lines.length * 4.2 + 2;
    });
    y += 4;

    sectionTitle('Tren Bulanan');
    table(['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih'],
      r.monthly.map(m => [m.month, _fmtRp(m.inc), _fmtRp(m.exp), _fmtRp(m.selisih)]));

    sectionTitle('Distribusi Pengeluaran Tahunan');
    table(['Kategori', 'Total', '%'],
      r.expenseCat.length ? r.expenseCat.map(c => [c.name, _fmtRp(c.total), c.pct.toFixed(1) + '%']) : [['-', '-', '-']]);

    sectionTitle('Distribusi Pemasukan Tahunan');
    table(['Kategori', 'Total', '%'],
      r.incomeCat.length ? r.incomeCat.map(c => [c.name, _fmtRp(c.total), c.pct.toFixed(1) + '%']) : [['-', '-', '-']]);

    sectionTitle('Saldo Semua Rekening');
    table(['Rekening', 'Saldo'], r.accounts.map(a => [a.name, _fmtRp(a.balance)]));

    sectionTitle('Rekomendasi Alokasi 50/30/20');
    table(['Kategori', '% Ideal', 'Nominal Ideal'], [
      ['Kebutuhan', '50%', _fmtRp(r.income * 0.5)],
      ['Keinginan', '30%', _fmtRp(r.income * 0.3)],
      ['Tabungan', '20%', _fmtRp(r.income * 0.2)],
    ]);
  }

  // Footer: page numbers + timestamp
  const pageCount = doc.internal.getNumberOfPages();
  const generatedOn = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.2);
    doc.line(14, pageH - 14, pageW - 14, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 128, 124);
    doc.text(`Dibuat ${generatedOn} \u2014 Laksa`, 14, pageH - 9);
    doc.text(`Halaman ${p} dari ${pageCount}`, pageW - 14, pageH - 9, { align: 'right' });
  }

  const fname = `Laksa-Laporan-${r.type === 'monthly' ? 'Bulanan' : 'Tahunan'}-${r.period}.pdf`;
  doc.save(fname);
}

// ═══════════════════════════════════════════
//  CSV EXPORT — same data, spreadsheet format
// ═══════════════════════════════════════════

function _exportCsv(r) {
  const rows = [];
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  if (r.type === 'monthly') {
    const title = `Laporan Bulanan - ${MONTH_NAMES[r.month - 1]} ${r.year}`;
    rows.push([title]);
    rows.push([]);

    rows.push(['RINGKASAN']);
    rows.push(['Pemasukan', 'Pengeluaran', 'Selisih', 'Jumlah Transaksi']);
    rows.push([r.income, r.expense, r.selisih, r.count]);
    rows.push([]);

    rows.push(['ARUS KAS MINGGUAN']);
    rows.push(['Minggu', 'Pemasukan', 'Pengeluaran', 'Selisih']);
    r.weekly.forEach(w => rows.push([w.label, w.income, w.expense, w.selisih]));
    rows.push([]);

    rows.push(['BREAKDOWN PENGELUARAN PER KATEGORI']);
    rows.push(['Kategori', 'Total', '%']);
    r.expenseCat.forEach(c => rows.push([c.name, c.total, c.pct.toFixed(1) + '%']));
    rows.push([]);

    rows.push(['BREAKDOWN PEMASUKAN PER KATEGORI']);
    rows.push(['Kategori', 'Total', '%']);
    r.incomeCat.forEach(c => rows.push([c.name, c.total, c.pct.toFixed(1) + '%']));
    rows.push([]);

    rows.push(['SALDO SEMUA REKENING']);
    rows.push(['Rekening', 'Saldo']);
    r.accounts.forEach(a => rows.push([a.name, a.balance]));
    rows.push([]);

    rows.push(['EVALUASI ANGGARAN VS REALISASI']);
    rows.push(['Kategori', 'Batas', 'Realisasi', '%']);
    if (r.budgetRows.length) {
      r.budgetRows.forEach(b => rows.push([b.category, b.limit, b.realisasi, b.pct.toFixed(0) + '%']));
    } else {
      rows.push(['Tidak ada anggaran', '', '', '']);
    }
    rows.push([]);

    rows.push(['STATUS TAGIHAN']);
    rows.push(['Nama', 'Jumlah', 'Jatuh Tempo', 'Status']);
    if (r.billRows.length) {
      r.billRows.forEach(b => rows.push([b.name, b.amount, b.due_date || '-', b.status === 'paid' ? 'Lunas' : 'Belum Bayar']));
    } else {
      rows.push(['Tidak ada tagihan', '', '', '']);
    }
    rows.push([]);

    rows.push(['PIUTANG AKTIF']);
    rows.push(['Peminjam', 'Jumlah', 'Dikembalikan', 'Sisa']);
    if (r.piutangRows.length) {
      r.piutangRows.forEach(p => rows.push([p.borrower_name, p.amount, p.returned || 0, p.amount - (p.returned || 0)]));
    } else {
      rows.push(['Tidak ada piutang', '', '', '']);
    }
    rows.push([]);

    rows.push(['PROGRESS TARGET MENABUNG']);
    rows.push(['Target', 'Saat Ini', 'Tujuan', '%']);
    if (r.goals.length) {
      r.goals.forEach(g => rows.push([g.name, g.current, g.target, g.target ? ((g.current / g.target * 100).toFixed(0) + '%') : '-']));
    } else {
      rows.push(['Belum ada target', '', '', '']);
    }

  } else {
    const title = `Laporan Tahunan - ${r.year}`;
    rows.push([title]);
    rows.push([]);

    rows.push(['RINGKASAN']);
    rows.push(['Pemasukan', 'Pengeluaran', 'Selisih', 'Jumlah Transaksi', 'Health Score']);
    rows.push([r.income, r.expense, r.selisih, r.count, r.healthScore]);
    rows.push([]);

    rows.push(['TREN BULANAN']);
    rows.push(['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih']);
    r.monthly.forEach(m => rows.push([m.month, m.inc, m.exp, m.selisih]));
    rows.push([]);

    rows.push(['DISTRIBUSI PENGELUARAN TAHUNAN']);
    rows.push(['Kategori', 'Total', '%']);
    r.expenseCat.forEach(c => rows.push([c.name, c.total, c.pct.toFixed(1) + '%']));
    rows.push([]);

    rows.push(['DISTRIBUSI PEMASUKAN TAHUNAN']);
    rows.push(['Kategori', 'Total', '%']);
    r.incomeCat.forEach(c => rows.push([c.name, c.total, c.pct.toFixed(1) + '%']));
    rows.push([]);

    rows.push(['SALDO SEMUA REKENING']);
    rows.push(['Rekening', 'Saldo']);
    r.accounts.forEach(a => rows.push([a.name, a.balance]));
    rows.push([]);

    rows.push(['REKOMENDASI ALOKASI 50/30/20']);
    rows.push(['Kategori', '% Ideal', 'Nominal Ideal']);
    rows.push(['Kebutuhan', '50%', r.income * 0.5]);
    rows.push(['Keinginan', '30%', r.income * 0.3]);
    rows.push(['Tabungan', '20%', r.income * 0.2]);
  }

  const csvStr = rows.map(r => r.map(esc).join(',')).join('\n');
  const fname = `Laksa-Laporan-${r.type === 'monthly' ? 'Bulanan' : 'Tahunan'}-${r.period}.csv`;
  dlF(csvStr, fname, 'text/csv');
}
