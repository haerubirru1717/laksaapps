# Laporan Review Aplikasi Laksa
**laksaapp.my.id** · Juni 2026

---

## Kategori 1 — Bug Fix

### BUG-01 · Nominal Transaksi Terpotong
**Halaman:** Transaksi  
**Prioritas:** 🔴 Tinggi

Nilai transaksi seperti `+Rp 5.088.4...` tidak terbaca penuh karena kolom kanan tidak mendapat ruang cukup dalam layout flex.

**Fix:**
```css
.transaction-amount {
  flex-shrink: 0;
  min-width: 110px;
  text-align: right;
  white-space: nowrap;
}
```

---

### BUG-02 · Icon Tidak Sinkron dengan Kategori
**Halaman:** Transaksi  
**Prioritas:** 🔴 Tinggi

Icon yang ditampilkan tidak sesuai dengan kategori transaksi:

| Transaksi | Icon Tampil | Seharusnya |
|---|---|---|
| Bayar parkir | 🏷️ Tag/label | 🚗 Transportasi |
| Beli buku kuliah | 🚗 Kendaraan | 📚 Pendidikan |
| Print tugas akhir | 💡 Utilitas | 📚 Pendidikan |
| Bayar tagihan air | 💡 Lampu | 💧 Utilitas/air |

**Penyebab:** Mapping `kategori → icon` di kode kemungkinan salah, atau auto-kategorisasi yang keliru sehingga icon ikut salah.

---

### BUG-03 · Label "baru" Statis Tidak Informatif
**Halaman:** Dashboard — Hero Card  
**Prioritas:** 🟡 Medium

Di bawah nominal Pemasukan dan Pengeluaran hanya tampil teks statis `"baru"` tanpa nilai apapun.

**Saran logika:** Ganti dengan nilai transaksi terbaru dari masing-masing tipe:
- Pemasukan → ambil 1 transaksi income terakhir, tampilkan `↑ +Rp [nominal]`
- Pengeluaran → ambil 1 transaksi expense terakhir, tampilkan `↓ -Rp [nominal]`

---

### BUG-04 · Info Redundan di Kartu Bank
**Halaman:** Dashboard — Section Rekening  
**Prioritas:** 🟡 Medium

Kartu bank (contoh: MNC Bank) menampilkan saldo yang sama dua kali:
- Baris atas: `Rp 33.976.786` (saldo tersedia)
- Baris bawah: `↑ +Rp 33.976.786` (duplikat, tidak ada nilai tambah)

**Saran:** Baris bawah diganti dengan transaksi terakhir pada rekening tersebut, mengikuti pendekatan yang sama dengan BUG-03.

---

### BUG-05 · Double Glass Card Bertumpuk
**Halaman:** Transaksi  
**Prioritas:** 🟡 Medium

List transaksi harian punya dua lapisan card (glass card luar + white card dalam), sedangkan di halaman Dashboard hanya satu lapisan. Perbedaan ini tidak konsisten dan menambah visual noise.

**Fix:** Periksa struktur HTML — hapus wrapper card yang redundant, cukup satu level container per grup tanggal.

---

### BUG-06 · Filter Bulan Boros Baris
**Halaman:** Transaksi  
**Prioritas:** 🟢 Low

Filter "Juni 2026" ditampilkan sebagai baris penuh terpisah di bawah dropdown kategori, membuang ruang vertikal.

**Fix:** Gabungkan ke satu baris dengan dropdown kategori:
```css
.filter-row {
  display: flex;
  gap: 8px;
}
.filter-row > * {
  flex: 1;
}
```

---

### BUG-07 · Badge Kategori Wrap Tidak Konsisten
**Halaman:** Transaksi  
**Prioritas:** 🟢 Low

Badge "MAKANAN & MINUMAN" wrap ke 2 baris, sementara badge lain tetap 1 baris. Ini membuat tinggi tiap item transaksi tidak seragam.

**Fix:**
```css
.category-badge {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
```

---

### BUG-08 · "Target Tercapai" Muncul saat Progress 0%
**Halaman:** Keuangan — Tab Target  
**Prioritas:** 🟡 Medium

Label `"Target tercapai! 🎉"` muncul pada card DP Rumah padahal progress masih 0% dan kurang Rp 100.000.000. Ini bug logika kondisi.

**Fix:** Tampilkan label tersebut hanya jika `terkumpul >= total_target`.

---

### BUG-09 · Empty State Dirender sebagai Card Kosong
**Halaman:** Keuangan — Tab Target  
**Prioritas:** 🟢 Low

Card "TARGET TERDEKAT" tetap dirender meski tidak ada data, menampilkan hanya garis oranye tanpa konten.

**Fix:** Tambahkan conditional rendering — sembunyikan section jika data kosong.

---

### BUG-10 · Glass Card Transparan Bocor di Halaman Pengaturan
**Halaman:** Pengaturan  
**Prioritas:** 🟡 Medium

Card di halaman Pengaturan terlalu transparan sehingga konten "tembus" ke background hitam di belakangnya. Halaman lain (Laporan, Keuangan) tidak mengalami ini karena nilai `background` rgba card-nya lebih tinggi.

**Penyebab:** Komponen card di halaman Pengaturan kemungkinan pakai class berbeda atau nilai opacity yang lebih rendah dari halaman lain.

**Fix:** Samakan nilai background card dengan halaman lain:
```css
/* Sebelum — terlalu transparan */
background: rgba(255, 255, 255, 0.03);

/* Sesudah — samakan dengan halaman lain */
background: rgba(255, 255, 255, 0.08);
```

---

### BUG-11 · Glass Card Item Piutang Lebih Transparan dari Card Header
**Halaman:** Keuangan — Tab Piutang  
**Prioritas:** 🟡 Medium

Card item piutang (contoh: "Andi") terlihat lebih transparan/bocor dibanding 3 card header di atasnya yang tampilannya sudah benar. Terjadi karena card item menggunakan komponen berbeda dengan nilai `background` rgba lebih rendah.

**Fix:** Samakan nilai `background` card item dengan card header di halaman yang sama.

---

### BUG-12 · Tidak Ada Feedback Interaksi (Glow) di Halaman Keuangan
**Halaman:** Keuangan — semua sub-halaman  
**Prioritas:** 🟡 Medium

Halaman lain memiliki efek glow pada card saat di-tap sebagai visual feedback. Card di halaman Keuangan tidak memiliki efek ini, membuat tap terasa "mati" dan tidak responsif.

**Fix:**
```css
.keuangan-card {
  cursor: pointer;
  transition: box-shadow 0.2s ease;
}

.keuangan-card:active {
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
}
```

---

## Kategori 2 — Redesign UI

### UI-01 · Konsolidasi Header Card — Halaman Keuangan

**Masalah:** Setiap sub-halaman (Anggaran, Target, Tagihan, Piutang) menampilkan 3 kartu header terpisah yang memaksa user scroll sebelum melihat konten utama.

**Prinsip:** Maksimal 2 card per sub-halaman — 1 summary card + 1 list card.

---

#### Sub-halaman: Anggaran

**Sebelum:** 3 kartu (Total Batas / Terpakai / Sisa Anggaran)

**Sesudah:**
```
┌─────────────────────────────────────┐
│ ANGGARAN · Juni 2026                │
│                                     │
│ Terpakai    Rp 11.682.942           │
│ Batas       Rp  6.000.000           │
│ Selisih    -Rp  5.682.942  ⚠️       │
│                                     │
│ ██████████████████░░░░  194%        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🍜 Makanan & Minuman        108%   │
│ Rp 5.383.404 / Rp 5.000.000        │
│ ████████████████████░  -383rb lebih │
├─────────────────────────────────────┤
│ 🚗 Transportasi             630%   │
│ Rp 6.299.538 / Rp 1.000.000        │
│ ████████████████████░  -5,3jt lebih │
└─────────────────────────────────────┘
```

---

#### Sub-halaman: Target

**Sebelum:** 3 kartu (Total Target / Terkumpul / Target Terdekat — sering kosong)

**Sesudah:**
```
┌─────────────────────────────────────┐
│ TARGET TABUNGAN                     │
│                                     │
│ Total Target    Rp 100.000.000      │
│ Terkumpul       Rp           0      │
│ Terdekat        DP Rumah  →  0%     │
│                                     │
│ ░░░░░░░░░░░░░░░░░░░░░░  0%          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🎯 DP RUMAH                    0%  │
│ Rp 0 / Rp 100.000.000              │
│ ░░░░░░░░░░░░░░░░░░░░░░             │
│ Kurang Rp 100.000.000              │
│                      [+ Tabung]    │
└─────────────────────────────────────┘
```

---

#### Sub-halaman: Tagihan

**Sebelum:** Summary card + 3 kotak mini (Kritis/Mendekat/Aman) terpisah

**Sesudah:** Stat urgensi digabung ke dalam summary card:
```
┌─────────────────────────────────────┐
│ TAGIHAN · Juni 2026                 │
│                                     │
│ Total          Rp 333.162           │
│ Sudah dibayar  Rp       0           │
│                                     │
│ ░░░░░░░░░░░░░░░░░░░░░░  0%          │
│                                     │
│ 🔴 1 Kritis   🟡 0 Mendekat        │
│ 🟢 0 Aman     ≤3hr  4-7hr  7+hr    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🔴 BCA                   Hari ini! │
│ Jatuh tempo 25 Jun · Lainnya        │
│                                     │
│ Rp 333.162          >> geser lunas  │
│                  [⏰] [✏️] [🗑️]    │
└─────────────────────────────────────┘
```

---

#### Sub-halaman: Piutang

**Sebelum:** 3 kartu (Total Dipinjamkan / Telah Dikembalikan / Sisa Piutang)

**Sesudah:**
```
┌─────────────────────────────────────┐
│ PIUTANG AKTIF                       │
│                                     │
│ Dipinjamkan    Rp 500.000           │
│ Dikembalikan   Rp       0           │
│ Sisa           Rp 500.000  (100%)   │
│                                     │
│ ████████████████████░░░░  0% balik  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 👤 Andi                             │
│ Dipinjam 25 Jun 2026                │
│                                     │
│ Rp 500.000      Dikembalikan: 0%    │
│ Sisa Rp 500.000                     │
│            [🎁 Bayar] [✏️] [🗑️]   │
└─────────────────────────────────────┘
```

---

### UI-02 · Perbaikan Layout Item Transaksi

**Masalah:** Kolom nama terlalu lebar, kolom nominal terpotong, badge kategori tidak konsisten tingginya.

**Struktur yang disarankan:**
```
[Icon] [Nama + Badge + Wallet]    [Nominal]
                                  [Jam   ]
```

Aturan kolom:
- Kolom kiri: `flex: 1`, bisa truncate dengan `text-overflow: ellipsis`
- Kolom kanan: `flex-shrink: 0`, `min-width: 110px`, `white-space: nowrap`
- Badge: `white-space: nowrap`, `max-width: 120px`, `text-overflow: ellipsis`

---

### UI-03 · Penyederhanaan Hero Card Dashboard

**Masalah:** Label "baru" tidak informatif. Informasi di kartu bank duplikat.

**Hero Card — sesudah:**
```
┌─────────────────────────────────────┐
│ TOTAL KEKAYAAN BERSIH               │
│ Rp 352.977.092,00              [👁] │
│ 5 rekening · 3 e-wallet             │
│                                     │
│ PEMASUKAN BULAN INI  KELUAR BULAN INI│
│ Rp 396.375.367       Rp 43.398.275  │
│ ↑ terakhir +5,08jt   ↓ terakhir -37rb│
└─────────────────────────────────────┘
```

> **Catatan logika:** Label diubah dari "PENGELUARAN" → "KELUAR BULAN INI" agar tidak ambigu. Baris kedua menampilkan transaksi terbaru masing-masing tipe — bukan menambah total, melainkan menunjukkan *transaksi apa yang terakhir masuk/keluar*. Panah arah + warna (hijau/merah) sudah cukup mengkomunikasikan konteksnya.

**Kartu Bank — sesudah:**
```
┌─────────────────────────────────────┐
│ [chip]        [Logo MNC Bank]       │
│                                     │
│ SALDO TERSEDIA                      │
│ Rp 33.976.786                       │
│ ─────────────────────────────────── │
│ MNC BANK          10% dari total    │
│ ↑ +Rp 5.088.400  (transaksi terbaru)│
└─────────────────────────────────────┘
```

---

### BUG-13 · Halaman 404 Bentrok dengan Layout Utama
**Halaman:** `/settings/bug` (dan kemungkinan semua route tidak valid)  
**Prioritas:** 🔴 Tinggi

Saat mengakses route yang tidak ada, halaman 404 dirender **di atas layout aplikasi utama** (navbar, tombol-tombol navigasi) alih-alih menggantikannya sepenuhnya. Hasilnya dua tampilan bertumpuk — komponen app shell tetap muncul bersama pesan 404.

**Penyebab:** Route fallback (`404` / `*`) tidak memiliki layout tersendiri — masih dibungkus oleh layout utama app.

**Fix:** Pisahkan layout 404 dari app shell. Route fallback harus render di luar wrapper layout utama:
```js
// Contoh pendekatan
<Route path="*" element={<NotFoundPage />} /> // tanpa AppLayout wrapper
```

---

### BUG-14 · Routing Auth Tidak Terlindungi + Dashboard Terlihat saat Scroll Cepat
**Halaman:** `/settings` (redirect ke halaman daftar/login)  
**Prioritas:** 🔴 Tinggi

Dua masalah terkait routing auth:

**a) Tidak ada protected route** — URL `/settings` seharusnya hanya bisa diakses user yang sudah login. Saat tidak ada sesi aktif, harusnya redirect ke `/login`, bukan menampilkan halaman register (`/register` atau form daftar).

**b) Dashboard "nyempil" saat scroll cepat** — Saat di halaman login/daftar dan scroll ke bawah dengan cepat, halaman Dashboard sempat terlihat sekilas. Ini menandakan Dashboard dirender di background bersamaan dengan halaman auth, hanya disembunyikan via CSS (`display: none` atau `opacity: 0`), bukan benar-benar di-unmount.

**Fix:**
- Implementasi `ProtectedRoute` — cek sesi sebelum render halaman apapun selain auth
- Pastikan halaman auth dan halaman app **tidak dirender bersamaan** — gunakan conditional rendering, bukan CSS hide/show

---

## Ringkasan

### Bug Fix

| ID | Bug | Halaman | Prioritas |
|---|---|---|---|
| BUG-13 | Halaman 404 bentrok dengan layout utama | `/settings/bug` & route invalid | 🔴 Tinggi |
| BUG-14 | Routing auth tidak terlindungi + dashboard bocor saat scroll | Login / Daftar | 🔴 Tinggi |
| BUG-01 | Nominal transaksi terpotong | Transaksi | 🔴 Tinggi |
| BUG-02 | Icon tidak sinkron kategori | Transaksi | 🔴 Tinggi |
| BUG-03 | Label "baru" statis | Dashboard | 🟡 Medium |
| BUG-04 | Info redundan kartu bank | Dashboard | 🟡 Medium |
| BUG-05 | Double glass card bertumpuk | Transaksi | 🟡 Medium |
| BUG-08 | "Target tercapai" muncul di 0% | Keuangan | 🟡 Medium |
| BUG-10 | Glass card transparan bocor | Pengaturan | 🟡 Medium |
| BUG-11 | Glass card item piutang lebih transparan dari header | Keuangan — Piutang | 🟡 Medium |
| BUG-12 | Tidak ada feedback glow saat tap | Keuangan | 🟡 Medium |
| BUG-06 | Filter bulan boros baris | Transaksi | 🟢 Low |
| BUG-07 | Badge kategori wrap tidak konsisten | Transaksi | 🟢 Low |
| BUG-09 | Empty state dirender sebagai card kosong | Keuangan | 🟢 Low |

### Redesign UI

| ID | Perubahan | Halaman |
|---|---|---|
| UI-01 | Konsolidasi 3 header card → 1 summary card | Keuangan (semua sub) |
| UI-02 | Perbaikan layout kolom item transaksi | Transaksi |
| UI-03 | Hero card & kartu bank lebih informatif | Dashboard |
