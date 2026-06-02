// ══════════════════════════════════════
// reports.js — Reports Page
// ══════════════════════════════════════

async function renderReports() {
  const sel = el('repYear');
  const cy = String(new Date().getFullYear());
  const cur = sel.value || cy;
  // Fetch year-wide data from server (not just current month)
  try { await fetchTxYear(cur); } catch (e) { console.error('fetchTxYear error:', e); }
  const allTx = getTxYear();
  const years = [...new Set(allTx.map(t => t.date.slice(0, 4)))].sort((a, b) => b - a);
  if (!years.includes(cy)) years.unshift(cy);
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join(''); sel.value = cur;
  const txs = allTx.filter(t => t.date.startsWith(cur));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const MFULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const inc = Array(12).fill(0), exp = Array(12).fill(0);
  txs.forEach(t => { const m = parseInt(t.date.slice(5, 7)) - 1; if (t.type === 'income') inc[m] += t.amount; if (t.type === 'expense') exp[m] += t.amount; });
  upsert('mChart', { type: 'bar', data: { labels: MONTHS, datasets: [{ label: 'Pemasukan', data: inc, backgroundColor: 'rgba(52,211,153,.6)', borderRadius: 5, borderSkipped: false }, { label: 'Pengeluaran', data: exp, backgroundColor: 'rgba(248,113,113,.6)', borderRadius: 5, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true, boxWidth: 7, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fCur(c.raw) } } }, scales: { y: { ticks: { callback: v => fCur(v), maxTicksLimit: 5 }, grid: { color: 'rgba(0,0,0,.04)' } }, x: { grid: { display: false } } } } });
  el('mRepBody').innerHTML = MFULL.map((m, i) => {
    const mk = cur + '-' + String(i + 1).padStart(2, '0');
    const mTx = txs.filter(t => mKey(t.date) === mk);
    const mi = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const me = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const diff = mi - me; const rate = mi > 0 ? ((diff / mi) * 100).toFixed(1) : '0.0';
    return `<tr><td>${m}</td><td class="t-inc">${fCur(mi)}</td><td class="t-exp">${fCur(me)}</td><td class="${diff >= 0 ? 't-inc' : 't-exp'}">${fCur(diff, true)}</td><td>${rate}%</td></tr>`;
  }).join('');
  const grp = {}; txs.filter(t => t.type === 'expense').forEach(t => { grp[t.category_id] = (grp[t.category_id] || 0) + t.amount; });
  const sorted = Object.entries(grp).sort((a, b) => b[1] - a[1]).slice(0, 7);
  upsert('topCat', { type: 'bar', data: { labels: sorted.map(([id]) => { const c = catBy(id); return c.name; }), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: COLORS.slice(0, sorted.length), borderRadius: 5 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fCur(c.raw) } } }, scales: { x: { ticks: { callback: v => fCur(v), maxTicksLimit: 4 }, grid: { color: 'rgba(0,0,0,.04)' } }, y: { grid: { display: false } } } } });
}

// ── SETTINGS ──
