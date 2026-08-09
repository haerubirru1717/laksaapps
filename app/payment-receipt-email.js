const RECEIPT_URL = 'https://laksaapp.my.id';
const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function safeText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0;
}

function money(value) {
  return rupiah.format(safeAmount(value)).replace(/\s/g, '');
}

function receiptValues(data = {}) {
  let receiptUrl = RECEIPT_URL;
  if (data.receiptUrl) {
    try {
      const candidate = new URL(String(data.receiptUrl));
      if (candidate.protocol === 'https:' && candidate.hostname === 'laksaapp.my.id') receiptUrl = candidate.toString();
    } catch {}
  }
  return {
    customerName: safeText(data.customerName, 'Pelanggan Laksa'),
    orderId: safeText(data.orderId, '—'),
    planLabel: safeText(data.planLabel, 'Premium Laksa'),
    paidAt: safeText(data.paidAt, '—'),
    baseAmount: safeAmount(data.baseAmount),
    discountAmount: safeAmount(data.discountAmount),
    subtotalAmount: safeAmount(data.subtotalAmount),
    adminFee: safeAmount(data.adminFee),
    totalAmount: safeAmount(data.totalAmount),
    receiptUrl,
  };
}

function amountRow(label, value, options = {}) {
  const color = options.color || '#5b4636';
  const weight = options.bold ? '700' : '400';
  return `<tr><td style="padding:7px 0;font-family:Arial,sans-serif;font-size:14px;line-height:20px;color:#7a6352;">${label}</td><td style="padding:7px 0;font-family:Arial,sans-serif;font-size:14px;line-height:20px;color:${color};font-weight:${weight};text-align:right;white-space:nowrap;">${options.prefix || ''}${money(value)}</td></tr>`;
}

export function renderPaymentReceiptHtml(data = {}) {
  const value = receiptValues(data);
  const name = escapeHtml(value.customerName);
  const orderId = escapeHtml(value.orderId);
  const plan = escapeHtml(value.planLabel);
  const paidAt = escapeHtml(value.paidAt);

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bukti Pembayaran Laksa</title></head>
<body style="margin:0;padding:0;background-color:#f6eee7;color:#4a372b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f6eee7;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffaf6;border:1px solid #ead8ca;border-radius:20px;">
<tr><td style="padding:34px 34px 26px;background-color:#8f4b32;border-radius:20px 20px 0 0;color:#fffaf6;font-family:Arial,sans-serif;">
<div style="font-size:25px;line-height:30px;font-weight:700;letter-spacing:.2px;">Laksa</div><div style="margin-top:8px;font-size:14px;line-height:21px;color:#f8dfcf;">Bukti pembayaran berhasil</div>
</td></tr>
<tr><td style="padding:32px 34px;font-family:Arial,sans-serif;">
<div style="font-size:20px;line-height:28px;font-weight:700;color:#4a372b;">Terima kasih, ${name}.</div>
<div style="margin-top:8px;font-size:14px;line-height:22px;color:#756052;">Pembayaran Anda telah terverifikasi. Simpan email ini sebagai bukti pembayaran resmi.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:24px;background-color:#fff3ea;border:1px solid #efd8c8;border-radius:14px;">
<tr><td style="padding:20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
<tr><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:12px;color:#8a6c59;text-transform:uppercase;letter-spacing:.7px;">Paket</td><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#4a372b;text-align:right;">${plan}</td></tr>
<tr><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:12px;color:#8a6c59;text-transform:uppercase;letter-spacing:.7px;">Order ID</td><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#4a372b;text-align:right;">${orderId}</td></tr>
<tr><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:12px;color:#8a6c59;text-transform:uppercase;letter-spacing:.7px;">Dibayar</td><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#4a372b;text-align:right;">${paidAt}</td></tr>
</table></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;border-collapse:collapse;">
${amountRow('Harga paket', value.baseAmount)}
${amountRow('Diskon', value.discountAmount, { prefix: '-' , color: '#39735b' })}
${amountRow('Subtotal', value.subtotalAmount, { bold: true })}
${amountRow('Biaya admin / kode unik KlikQRIS', value.adminFee)}
<tr><td colspan="2" style="padding-top:10px;border-top:1px solid #e7d6c9;"></td></tr>
${amountRow('Total pembayaran', value.totalAmount, { bold: true, color: '#8f4b32' })}
</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;"><tr><td style="background-color:#8f4b32;border-radius:10px;"><a href="${escapeHtml(value.receiptUrl)}" style="display:inline-block;padding:13px 22px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Lihat bukti pembayaran</a></td></tr></table>
<div style="margin-top:26px;font-size:12px;line-height:19px;color:#927867;">Email ini dibuat otomatis untuk pembayaran Laksa. Jika Anda tidak mengenali transaksi ini, hubungi dukungan melalui situs resmi Laksa.</div>
</td></tr></table>
<div style="padding:18px;font-family:Arial,sans-serif;font-size:11px;line-height:17px;color:#9a8070;text-align:center;">© Laksa · Keuangan terasa lebih hangat dan sederhana</div>
</td></tr></table></body></html>`;
}

export function renderPaymentReceiptText(data = {}) {
  const value = receiptValues(data);
  return `BUKTI PEMBAYARAN LAKSA

Hai ${value.customerName},

Pembayaran Anda telah terverifikasi. Simpan email ini sebagai bukti pembayaran resmi.

Paket                              : ${value.planLabel}
Order ID                           : ${value.orderId}
Dibayar                            : ${value.paidAt}

Harga paket                        : ${money(value.baseAmount)}
Diskon                             : -${money(value.discountAmount)}
Subtotal                           : ${money(value.subtotalAmount)}
Biaya admin / kode unik KlikQRIS   : ${money(value.adminFee)}
TOTAL PEMBAYARAN                   : ${money(value.totalAmount)}

Buka Laksa: ${value.receiptUrl}

Email ini dibuat otomatis untuk pembayaran Laksa.`;
}
