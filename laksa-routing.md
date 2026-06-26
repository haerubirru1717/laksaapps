# Laksa — Implementasi Client-Side Routing (URL Cantik)

## Konteks Project

Web SaaS personal finance bernama **Laksa**. Frontend HTML/CSS/JS murni (tanpa framework), di-host di **Cloudflare Pages**. Navigasi antar halaman menggunakan fungsi `go(page)` di `js/app.js` yang bekerja dengan cara show/hide elemen DOM — URL tidak berubah saat navigasi.

**Tujuan:** Membuat URL cantik seperti `laksaapps.my.id/dashboard`, `laksaapps.my.id/transactions`, dll tanpa reload halaman.

---

## Pages & URL yang Ditarget

| Page | URL | Keterangan |
|---|---|---|
| dashboard | /dashboard | Halaman utama |
| transactions | /transactions | Daftar transaksi |
| receipt | /receipt | Scan struk |
| keuangan | /keuangan | Default ke sub-tab budget |
| keuangan > budget | /keuangan/budget | Sub-tab anggaran |
| keuangan > goals | /keuangan/goals | Sub-tab target |
| keuangan > bills | /keuangan/bills | Sub-tab tagihan |
| keuangan > piutang | /keuangan/piutang | Sub-tab piutang |
| reports | /reports | Laporan keuangan |
| settings | /settings | Pengaturan |

**Tambahan:**
- Akses ke `/` otomatis redirect ke `/dashboard`
- URL tidak dikenali (misal `/random`) tampilkan halaman 404 branded Laksa

---

## Fungsi `go()` Saat Ini (js/app.js)

```js
function go(page) {
  if (page === 'budget')  { if (curPage !== 'keuangan') go('keuangan'); setKeuTab('budget', null);  return; }
  if (page === 'goals')   { if (curPage !== 'keuangan') go('keuangan'); setKeuTab('goals', null);   return; }
  if (page === 'bills')   { if (curPage !== 'keuangan') go('keuangan'); setKeuTab('bills', null);   return; }
  if (page === 'piutang') { if (curPage !== 'keuangan') go('keuangan'); setKeuTab('piutang', null); return; }

  if (curPage === page) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item,.bnav-item').forEach(n => n.classList.remove('active'));
  const pg = el('page-' + page); if (pg) pg.classList.add('active');
  document.querySelectorAll('[data-page="' + page + '"]').forEach(n => n.classList.add('active'));
  curPage = page;
  requestAnimationFrame(() => {
    if (page === 'dashboard') renderDash();
    else if (page === 'transactions') renderTxPage();
    else if (page === 'receipt') renderRecPage();
    else if (page === 'keuangan') renderKeuangan();
    else if (page === 'reports') renderReports();
    else if (page === 'settings') renderSettings();
  });
}
```

Fungsi `setKeuTab(tab, btn)` mengatur tampilan sub-tab di halaman keuangan.

> Catatan: Fungsi `el()` adalah shorthand untuk `document.getElementById()`

---

## Yang Perlu Dilakukan

### 1. File `_redirects` di root repo (WAJIB)
Tanpa file ini semua URL selain `/` akan 404 di Cloudflare Pages.

```
/* /index.html 200
```

### 2. Modifikasi fungsi `go()` di `js/app.js`
Tambahkan `history.pushState` setiap navigasi agar URL ikut berubah tanpa reload. URL sub-tab keuangan ikut diupdate, contoh: pindah ke tab bills → URL jadi `/keuangan/bills`.

### 3. Modifikasi fungsi `setKeuTab()` di `js/app.js`
Saat ganti sub-tab keuangan, URL ikut berubah ke `/keuangan/{tab}`.

### 4. Tambahkan handler `popstate`
Agar tombol back/forward browser berfungsi normal, termasuk kembali ke sub-tab keuangan yang benar.

### 5. Tambahkan logic baca URL di `DOMContentLoaded`
Baca `window.location.pathname` saat pertama load, lalu panggil `go()` dan `setKeuTab()` sesuai URL. Contoh:
- `/keuangan/bills` → `go('keuangan')` lalu `setKeuTab('bills', null)`
- `/` → redirect ke `go('dashboard')`
- URL tidak dikenali → tampilkan halaman 404 branded

### 6. Update `<title>` setiap pindah halaman
Setiap navigasi, title browser ikut berubah:
- `/dashboard` → `Dashboard — Laksa`
- `/transactions` → `Transaksi — Laksa`
- `/receipt` → `Scan Struk — Laksa`
- `/keuangan` → `Keuangan — Laksa`
- `/keuangan/budget` → `Anggaran — Laksa`
- `/keuangan/goals` → `Target — Laksa`
- `/keuangan/bills` → `Tagihan — Laksa`
- `/keuangan/piutang` → `Piutang — Laksa`
- `/reports` → `Laporan — Laksa`
- `/settings` → `Pengaturan — Laksa`

### 7. Scroll to top setiap pindah halaman
Setiap `go()` dipanggil, tambahkan `window.scrollTo(0, 0)` agar posisi scroll balik ke atas.

---

## Catatan Penting

- Jangan ubah logika render atau auth — hanya bagian navigasi/URL
- File `_redirects` diletakkan di root repo sejajar dengan `index.html`
- Setelah push ke GitHub, Cloudflare Pages akan auto-deploy
- Halaman 404 branded cukup simpel — tampilkan logo Laksa, teks "Halaman tidak ditemukan", dan tombol kembali ke Dashboard

---

## Future Improvement (Tidak Perlu Sekarang)

- Preserve filter/state saat back/forward (misal filter bulan di transaksi)
- Loading progress bar tipis di atas halaman saat navigasi
- URL update saat ganti bulan di dashboard/laporan (misal `/reports?month=2025-05`)
