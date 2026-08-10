(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const shell = document.querySelector('.checkout-shell');
  const orderId = new URL(location.href).searchParams.get('order');
  const receiptMode = new URL(location.href).searchParams.get('view') === 'receipt';
  let order = null, pollTimer = null, countdownTimer = null, startedAt = Date.now(), refreshInFlight = false, authRedirecting = false;
  const token = localStorage.getItem('laksa_token');
  const states = ['loading','pending','verifying','success','expired','error'];
  const money = n => `Rp ${Math.max(0, Number(n) || 0).toLocaleString('id-ID')}`;
  function setState(state, message) {
    shell.dataset.state = states.includes(state) ? state : 'error';
    $('checkoutStatus').textContent = message || state;
    document.querySelector('.checkout-skeleton').hidden = state !== 'loading';
  }
  function validateOrder() { return typeof orderId === 'string' && /^LAKSA-\d{10,}-[a-f0-9-]{8}$/i.test(orderId); }
  function validateQr(qrisUrl) {
    const url = new URL(qrisUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'klikqris.com') throw new Error('URL QRIS tidak valid');
    return url;
  }
  async function request(path, options = {}) {
    if (!token) { location.assign(`/app.html#/login`); throw new Error('Silakan masuk kembali'); }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${CLOUD_URL}${path}`, { ...options, signal: controller.signal, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(options.headers || {}) } });
      if (response.status === 401) {
        authRedirecting = true;
        localStorage.removeItem('laksa_token');
        localStorage.setItem('laksa_return_to', location.pathname + location.search);
        location.assign('/app.html#/login');
        throw new Error('Sesi berakhir. Silakan masuk kembali.');
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } finally { clearTimeout(timeout); }
  }
  function render(data) {
    order = data;
    $('planLabel').textContent = data.label || 'Premium Laksa';
    $('baseAmount').textContent = money(data.base_amount);
    $('discountAmount').textContent = data.discount_amount ? `−${money(data.discount_amount)}` : money(0);
    $('subtotalAmount').textContent = money(data.subtotal_amount);
    $('adminFee').textContent = money(data.admin_fee);
    $('totalAmount').textContent = money(data.total_amount);
    $('orderId').textContent = data.order_id;
    if (data.qris_url && data.status === 'pending') loadQrImage();
    if (data.status === 'approved') success();
    else if (data.status === 'expired' || data.status === 'failed') expired();
    else { setState('pending', 'Menunggu pembayaran'); startCountdown(data.expired_at); schedulePoll(); }
  }
  async function loadQrImage() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${CLOUD_URL}/payment/orders/${encodeURIComponent(orderId)}/qr`, { signal: controller.signal, headers: { Authorization:`Bearer ${token}` } });
      if (response.status === 401) { authRedirecting=true; localStorage.removeItem('laksa_token'); location.assign('/app.html#/login'); return; }
      if (!response.ok) throw new Error('QRIS tidak dapat dimuat');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Format QRIS tidak valid');
      const href = URL.createObjectURL(blob);
      const checkoutQr = $('checkoutQr');
      if (checkoutQr.dataset.blobUrl) URL.revokeObjectURL(checkoutQr.dataset.blobUrl);
      checkoutQr.dataset.blobUrl = href;
      checkoutQr.src = href;
      $('qrFallback').hidden = true;
    } catch (error) {
      $('errorBanner').hidden=false; $('errorBanner').textContent=`Gambar QRIS gagal dimuat. ${error.message}`;
      $('qrFallback').hidden=false;
    } finally { clearTimeout(timeout); }
  }
  function interval() { const elapsed = Date.now() - startedAt; return elapsed < 60_000 ? 5_000 : elapsed < 300_000 ? 10_000 : 20_000; }
  function schedulePoll() { clearTimeout(pollTimer); if (!document.hidden && order?.status === 'pending') pollTimer = setTimeout(() => refreshStatus(false), interval()); }
  async function refreshStatus(manual) {
    if (authRedirecting || order?.status !== 'pending') return;
    if (refreshInFlight || document.hidden) { schedulePoll(); return; }
    refreshInFlight = true; setState('verifying', 'Memverifikasi pembayaran');
    try { render(await request(`/payment/orders/${encodeURIComponent(orderId)}/refresh`, { method:'POST' })); }
    catch (e) { if (!authRedirecting) { $('errorBanner').hidden = false; $('errorBanner').textContent = navigator.onLine ? e.message : 'Koneksi terputus'; setState('pending','Menunggu pembayaran'); } }
    finally { refreshInFlight = false; if (!authRedirecting && order?.status === 'pending') schedulePoll(); }
  }
  function startCountdown(expiry) {
    clearInterval(countdownTimer);
    const end = new Date(expiry).getTime();
    const tick = () => { const left = Math.max(0, end - Date.now()); $('countdown').textContent = `${String(Math.floor(left/60000)).padStart(2,'0')}:${String(Math.floor(left/1000)%60).padStart(2,'0')}`; if (!left) expired(); };
    tick(); countdownTimer = setInterval(tick, 1000);
  }
  function stopTimers() { clearTimeout(pollTimer); clearInterval(countdownTimer); }
  function disablePaymentActions() { for (const id of ['saveQr','refreshPayment','qrFallback','copyAmount']) { const el=$(id); if(el){el.hidden=true;el.disabled=true;} } }
  function success() { stopTimers(); disablePaymentActions(); setState('success','Pembayaran berhasil — Premium aktif'); if (!receiptMode) setTimeout(() => location.assign('/app.html'), 4_000); }
  function expired() { stopTimers(); disablePaymentActions(); setState('expired','QRIS sudah kedaluwarsa'); $('newPayment').hidden = false; }
  async function loadCheckout() { if (!validateOrder()) { setState('error','Order pembayaran tidak valid'); return; } try { render(await request(`/payment/orders/${encodeURIComponent(orderId)}`)); } catch(e) { setState('error',e.message); } }
  $('copyAmount').addEventListener('click', () => navigator.clipboard.writeText(String(order?.total_amount || '')));
  $('copyOrder').addEventListener('click', () => navigator.clipboard.writeText(orderId || ''));
  $('refreshPayment').addEventListener('click', () => refreshStatus(true));
  $('newPayment').addEventListener('click', () => location.assign('/app.html#upgrade'));
  $('checkoutQr').addEventListener('error', () => { $('qrFallback').hidden = false; });
  $('saveQr').addEventListener('click', async () => { const href=$('checkoutQr').dataset.blobUrl; if(!href){await loadQrImage();return;} const a=document.createElement('a');a.href=href;a.download=`laksa-qris-${orderId}.png`;a.click(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && order?.status === 'pending') refreshStatus(false); });
  addEventListener('online', () => { if (order?.status === 'pending') refreshStatus(false); });
  addEventListener('offline', () => { $('errorBanner').hidden = false; $('errorBanner').textContent = 'Koneksi terputus'; });
  loadCheckout();
})();
