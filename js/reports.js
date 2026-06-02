// ══════════════════════════════════════
// reports.js — Reports Page
// ══════════════════════════════════════

let repChartType = localStorage.getItem('laksa_rep_chart') || 'bar';
let _repInc = [], _repExp = [];

function buildRepChartCfg(type, labels, inc, exp) {
  const isLine = type === 'line' || type === 'area';
  const fill = type === 'area';
  const datasets = isLine ? [
    { label: 'Pemasukan', data: inc, borderColor: '#34d399', backgroundColor: fill ? 'rgba(52,211,153,.15)' : 'transparent', tension: .4, fill, pointRadius: 3, pointBackgroundColor: '#34d399', borderWidth: 2 },
    { label: 'Pengeluaran', data: exp, borderColor: '#f87171', backgroundColor: fill ? 'rgba(248,113,113,.15)' : 'transparent', tension: .4, fill, pointRadius: 3, pointBackgroundColor: '#f87171', borderWidth: 2 }
  ] : [
    { label: 'Pemasukan', data: inc, backgroundColor: 'rgba(52,211,153,.6)', borderRadius: 5, borderSkipped: false },
    { label: 'Pengeluaran', data: exp, backgroundColor: 'rgba(248,113,113,.6)', borderRadius: 5, borderSkipped: false }
  ];
  return {
    type: isLine ? 'line' : 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 7, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fCur(c.raw) } } },
      scales: { y: { ticks: { callback: v => fCur(v), maxTicksLimit: 5 }, grid: { color: 'rgba(0,0,0,.04)' } }, x: { grid: { display: false } } }
    }
  };
}

function setRepChartType(type, btn) {
  repChartType = type;
  localStorage.setItem('laksa_rep_chart', type);
  document.querySelectorAll('#page-reports .tgl-grp .tgl').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  upsert('mChart', buildRepChartCfg(type, MONTHS, _repInc, _repExp));
}

function toggleRepDetail() {
  const wrap = el('repDetailWrap');
  const arrow = el('repDetailArrow');
  const visible = wrap.style.display !== 'none';
  wrap.style.display = visible ? 'none' : 'block';
  arrow.style.transform = visible ? '' : 'rotate(180deg)';
}

async function renderReports() {
  const sel = el('repYear');
  const cy = String(new Date().getFullYear());
  const cur = sel.value || cy;
  try { await fetchTxYear(cur); } catch (e) { console.error('fetchTxYear error:', e); }
  const allTx = getTxYear();
  const years = [...new Set(allTx.map(t => t.date.slice(0, 4)))].sort((a, b) => b - a);
  if (!years.includes(cy)) years.unshift(cy);
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join(''); sel.value = cur;
  const txs = allTx.filter(t => t.date.startsWith(cur));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const MFULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  _repInc = Array(12).fill(0); _repExp = Array(12).fill(0);
  txs.forEach(t => { const m = parseInt(t.date.slice(5, 7)) - 1; if (t.type === 'income') _repInc[m] += t.amount; if (t.type === 'expense') _repExp[m] += t.amount; });

  // Restore saved chart type toggle state
  const toggleBtns = document.querySelectorAll('#page-reports .tgl-grp .tgl');
  toggleBtns.forEach(b => b.classList.remove('active'));
  const typeIdx = repChartType === 'line' ? 1 : repChartType === 'area' ? 2 : 0;
  if (toggleBtns[typeIdx]) toggleBtns[typeIdx].classList.add('active');

  upsert('mChart', buildRepChartCfg(repChartType, MONTHS, _repInc, _repExp));

  // Summary card
  const totalInc = _repInc.reduce((s, v) => s + v, 0);
  const totalExp = _repExp.reduce((s, v) => s + v, 0);
  const diff = totalInc - totalExp;
  const rate = totalInc > 0 ? ((diff / totalInc) * 100).toFixed(1) : '0.0';
  const sumEl = el('repSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="rep-sum-grid">
        <div class="rep-sum-item"><span class="rep-sum-lbl">Total Pemasukan</span><span class="rep-sum-val t-inc">${fCur(totalInc)}</span></div>
        <div class="rep-sum-item"><span class="rep-sum-lbl">Total Pengeluaran</span><span class="rep-sum-val t-exp">${fCur(totalExp)}</span></div>
        <div class="rep-sum-item"><span class="rep-sum-lbl">Selisih</span><span class="rep-sum-val ${diff >= 0 ? 't-inc' : 't-exp'}">${fCur(diff, true)}</span></div>
        <div class="rep-sum-item"><span class="rep-sum-lbl">Rasio Tabungan</span><span class="rep-sum-val">${rate}%</span></div>
      </div>`;
  }

  // Detail table (hidden by default)
  el('mRepBody').innerHTML = MFULL.map((m, i) => {
    const mk = cur + '-' + String(i + 1).padStart(2, '0');
    const mTx = txs.filter(t => mKey(t.date) === mk);
    const mi = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const me = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const d = mi - me; const r = mi > 0 ? ((d / mi) * 100).toFixed(1) : '0.0';
    return `<tr><td>${m}</td><td class="t-inc">${fCur(mi)}</td><td class="t-exp">${fCur(me)}</td><td class="${d >= 0 ? 't-inc' : 't-exp'}">${fCur(d, true)}</td><td>${r}%</td></tr>`;
  }).join('');
}

// ── SETTINGS ──
