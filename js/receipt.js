// ══════════════════════════════════════
// receipt.js — Receipt Scan Page
// ══════════════════════════════════════

function renderRecPage() {
  renderRHist(); populateRAcc();
}
function populateRAcc() { const sel = el('rAcc'); if (!sel) return; sel.innerHTML = getAccs().map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join(''); }
function onDO(e) { e.preventDefault(); el('dzone').classList.add('over'); }
function onDL() { el('dzone').classList.remove('over'); }
function onDD(e) { e.preventDefault(); el('dzone').classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) procRFile(f); }
function onRF(ev) { const f = ev.target.files[0]; if (f) procRFile(f); ev.target.value = ''; }
function procRFile(file) {
  if (!file.type.startsWith('image/')) { toast('File harus gambar.', 'err'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('Maks 10MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    rB64 = e.target.result.split(',')[1];
    el('rprev').src = e.target.result;
    el('rprevWrap').style.display = 'flex'; el('dzone').style.display = 'none'; setStat('', '');
  };
  reader.readAsDataURL(file);
}
function clrR() {
  rB64 = null; rData = null;
  stopCamera();
  el('rprevWrap').style.display = 'none'; el('dzone').style.display = 'flex';
  el('rres').style.display = 'none'; el('rph').style.display = 'flex';
  el('savePanel').style.display = 'none'; el('ocrprog').style.display = 'none'; setStat('', '');
}
function setStat(type, msg) {
  const s = el('sstat'); if (!msg) { s.style.display = 'none'; return; }
  s.className = 'sstat ' + type; s.style.display = 'flex';
  s.innerHTML = type === 'loading' ? `<div class="spinner"></div><span>${esc(msg)}</span>` : `<span>${type === 'success' ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}</span><span>${esc(msg)}</span>`;
}

// ── RECEIPT RESULT HELPERS (transplant dari index.html) ──
function showRRes(data) {
  el('rph').style.display = 'none'; el('rres').style.display = 'block';
  el('rStore').textContent = data.store_name || '—';
  el('rMeta').textContent = data.date ? fDate(data.date) : 'Tanggal tidak terdeteksi';
  const cMap = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
  const cEl = el('rConf');
  cEl.textContent = 'Akurasi: ' + (cMap[data.confidence] || '?');
  cEl.style.color = data.confidence === 'high' ? 'var(--income)' : data.confidence === 'medium' ? 'var(--gold)' : 'var(--expense)';
  el('rSumGrid').innerHTML = [
    ...(data.discount > 0 ? [{ l: 'Diskon', v: '− ' + fCur(data.discount) }] : []),
    ...(data.change > 0 ? [{ l: 'Kembalian', v: fCur(data.change) }] : []),
    { l: 'Total Pembayaran', v: fCur(data.total || 0), full: true }
  ].map(i => `<div class="sbox ${i.full ? 'total' : ''}"><div class="sbox-lbl">${i.l}</div><div class="sbox-val">${i.v}</div></div>`).join('');
  const items = data.items || [];
  el('rItemsTbl').innerHTML = items.length
    ? `<table class="itbl"><thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Kategori</th></tr></thead><tbody>${items.map((it, i) => `<tr>
    <td><input class="iinput" value="${esc(it.name)}" onchange="rData.items[${i}].name=this.value"/></td>
    <td><input class="iinput" type="number" value="${it.qty || 1}" style="width:40px" onchange="rData.items[${i}].qty=+this.value"/></td>
    <td>${fCur(it.total_price || 0)}</td>
    <td><span class="icat">${esc(it.category || 'Lainnya')}</span></td>
  </tr>`).join('')
    }</tbody></table>`
    : '<div class="empty" style="padding:1rem"><p style="font-size:.8rem">Item tidak terdeteksi</p></div>';
  el('rRaw').textContent = data.raw_text || '';
}
function updSP() {
  if (!rData) return;
  const mode = document.querySelector('input[name="smode"]:checked')?.value || 'single';
  const items = rData.items || []; const pv = el('sprev'); if (!pv) return;
  if (mode === 'single') pv.textContent = '→ 1 transaksi: ' + fCur(rData.total || 0);
  else if (mode === 'peritem') pv.textContent = '→ ' + items.length + ' transaksi terpisah';
  else pv.textContent = '→ ' + new Set(items.map(i => i.category || 'Lainnya')).size + ' transaksi per kategori';
}
function saveR() {
  if (!rData) { toast('Tidak ada data struk.', 'err'); return; }
  const mode = document.querySelector('input[name="smode"]:checked')?.value || 'single';
  const accId = el('rAcc')?.value, date = el('rDate')?.value || today(), note = el('rNote')?.value.trim() || '';
  const store = rData.store_name || 'Struk', rId = uid(), items = rData.items || [], cats = getCats();
  const fCat = n => { const f = cats.find(c => c.name.toLowerCase().includes((n || '').toLowerCase())); return f ? f.id : 'c12'; };
  if (mode === 'single') {
    addTx({ type: 'expense', amount: Number(rData.total) || 0, date, category_id: fCat(items[0]?.category), account_id: accId, note: store + (note ? ' — ' + note : ''), receiptId: rId }, true);
    toast('Tersimpan!', 'ok');
  } else if (mode === 'peritem') {
    items.forEach(it => { 
      const price = Number(it.total_price) || 0;
      if (price < 0 || isNaN(price)) return; 
      addTx({ type: 'expense', amount: price, date, category_id: fCat(it.category), account_id: accId, note: it.name, receiptId: rId }, true); 
    });
    toast(items.length + ' transaksi tersimpan!', 'ok');
  } else {
    const grp = {}; 
    items.forEach(it => { 
      const k = it.category || 'Lainnya'; 
      grp[k] = (grp[k] || 0) + (Number(it.total_price) || 0); 
    });
    Object.entries(grp).forEach(([cn, t]) => { 
      if (t < 0 || isNaN(t)) return; 
      addTx({ type: 'expense', amount: t, date, category_id: fCat(cn), account_id: accId, note: store + ' — ' + cn, receiptId: rId }, true); 
    });
    toast('Tersimpan per kategori!', 'ok');
  }
  const txMon = el('txMonth'); if (txMon) txMon.value = date.slice(0, 7);
  clrR();
  if (curPage === 'transactions') filterTx(); else refresh();
}
function svRHist(data) { const r = getRec(); r.unshift({ id: uid(), store: data.store_name, date: data.date || today(), total: data.total || 0, itemCount: (data.items || []).length }); sv(K.rec, r.slice(0, 50)); }
function renderRHist() {
  const r = getRec(), list = el('rHistList'), emp = el('rHistEmpty'), cnt = el('rHistCnt');
  if (!list) return; cnt.textContent = r.length + ' struk';
  if (!r.length) { list.innerHTML = ''; emp.style.display = 'flex'; return; }
  emp.style.display = 'none';
  list.innerHTML = r.slice(0, 20).map(rx => `<li class="rhist-item"><div><div class="rhist-store">${esc(rx.store)}</div><div class="rhist-meta">${fDate(rx.date)} · ${rx.itemCount} item</div></div><div class="rhist-total">−${fCur(rx.total)}</div></li>`).join('');
}
function rTab(tab, btn) { document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active')); document.querySelectorAll('.rtab-c').forEach(c => c.classList.remove('active')); btn.classList.add('active'); const c = el('tab-' + tab); if (c) c.classList.add('active'); }

// ── GROQ VISION ENGINE (via Worker proxy) ──
async function doScan() {
  if (!rB64) { toast('Upload atau foto struk dulu.', 'err'); return; }

  const btn = el('scanBtn'); btn.disabled = true;
  const fill = el('ocrfill'), lbl = el('ocrlbl');
  el('ocrprog').style.display = 'block';
  fill.style.width = '15%'; lbl.textContent = 'Mengirim ke AI…';
  setStat('loading', 'Menganalisis struk dengan AI…');

  try {
    // Compress gambar: max 800px, quality 0.82
    const compressed = await compressImg(rB64, 800);
    fill.style.width = '35%'; lbl.textContent = 'Menunggu respons AI…';

    // Kirim ke Worker proxy — Worker yang panggil Groq Vision
    const uid = getUserId();
    const resp = await fetch(`${CLOUD_URL}/scan-receipt?user_id=${uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: compressed, mime: 'image/jpeg' })
    });

    fill.style.width = '80%'; lbl.textContent = 'Memproses hasil…';

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error || 'Scan error ' + resp.status);
    }

    const parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    const hasTotal = parsed.total !== undefined && parsed.total !== null && parsed.total !== '' && !isNaN(parsed.total);
    const hasAmount = parsed.amount !== undefined && parsed.amount !== null && parsed.amount !== '' && !isNaN(parsed.amount);
    if (!hasTotal && !hasAmount) throw new Error('Total tidak terdeteksi. Pastikan foto struk jelas.');

    fill.style.width = '100%'; lbl.textContent = 'Selesai!';

    // Normalisasi field dari Worker (store/note/date/total)
    rData = {
      store_name: parsed.store || 'Toko tidak terdeteksi',
      date: parsed.date || null,
      items: parsed.items || [],
      discount: parsed.discount || 0,
      tax: parsed.tax || 0,
      total: parsed.total || parsed.amount || 0,
      change: parsed.change || 0,
      confidence: parsed.confidence || 'medium',
      raw_text: JSON.stringify(parsed, null, 2)
    };

    showRRes(rData);
    setStat('success', 'Analisis selesai! Cek hasil lalu klik Simpan.');
    svRHist(rData); renderRHist();
    el('savePanel').style.display = 'block';
    el('rDate').value = rData.date || today();
    populateRAcc(); updSP();
    setTimeout(() => el('savePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);

  } catch (err) {
    setStat('error', err.message);
    el('ocrprog').style.display = 'none';
  } finally {
    btn.disabled = false;
  }
}

async function compressImg(b64, maxPx = 800) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) { const r = Math.min(maxPx / w, maxPx / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.filter = 'contrast(1.2) brightness(1.05)';
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.src = 'data:image/jpeg;base64,' + b64;
  });
}

// ── CAMERA ──
let camStream = null;

function openCamera() {
  // On mobile, using capture="environment" on file input triggers camera directly
  // On desktop, use getUserMedia for live preview
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    el('rfileCamera').click(); // mobile: triggers camera app via capture="environment"
    return;
  }
  // Desktop: use getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Browser tidak mendukung akses kamera langsung. Gunakan tombol Galeri.', 'err');
    return;
  }
  el('dzone').style.display = 'none';
  el('camWrap').style.display = 'flex';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(stream => {
      camStream = stream;
      const vid = el('camVideo');
      vid.srcObject = stream;
      vid.play();
    })
    .catch(err => {
      el('camWrap').style.display = 'none';
      el('dzone').style.display = 'flex';
      if (err.name === 'NotAllowedError') toast('Izin kamera ditolak. Cek pengaturan browser.', 'err');
      else toast('Kamera tidak tersedia: ' + err.message, 'err');
    });
}

function stopCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  el('camWrap').style.display = 'none';
  if (!rB64) el('dzone').style.display = 'flex';
}

function capturePhoto() {
  const vid = el('camVideo'), canvas = el('snapCanvas');
  if (!vid.videoWidth) { toast('Kamera belum siap.', 'err'); return; }
  canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(vid, 0, 0);
  // Snapshot URL untuk preview — set rB64 dulu agar procRFile punya data yang benar
  const url = canvas.toDataURL('image/jpeg', 0.92);
  rB64 = url.split(',')[1];
  el('rprev').src = url;
  el('rprevWrap').style.display = 'flex';
  setStat('', '');
  stopCamera();
  // procRFile dipanggil terakhir — async FileReader tidak akan timpa rB64 yang sudah benar
  canvas.toBlob(blob => { procRFile(blob); }, 'image/jpeg', 0.92);
}

function openGallery() {
  el('rfileGallery').click();
}

// ── MODAL CLOSE ──
