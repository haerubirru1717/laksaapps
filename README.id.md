<div align="center">

# 🌐 Laksa Apps

🇮🇩 **Bahasa Indonesia** | 🇬🇧 [English](README.md)

**Aplikasi manajemen keuangan pribadi berbasis web**  
Catat transaksi, kelola anggaran, scan struk dengan AI, dan pantau tagihan — semua dalam satu tempat.

🔗 **[Coba Sekarang → haerubirru17.github.io/laksaapps](https://haerubirru17.github.io/laksaapps/)**

![HTML](https://img.shields.io/badge/HTML-44.2%25-e34c26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-37.2%25-f1e05a?style=flat-square&logo=javascript&logoColor=black)
![CSS](https://img.shields.io/badge/CSS-18.5%25-563d7c?style=flat-square&logo=css3&logoColor=white)
![Versi](https://img.shields.io/badge/versi-1.2.0-blueviolet?style=flat-square)
![Live](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen?style=flat-square&logo=github)

</div>

---

## ✨ Fitur Utama

### 📊 Dashboard
- Ringkasan **total kekayaan bersih** dari semua rekening dan e-wallet
- Grafik **arus kas** interaktif (7 hari / 30 hari)
- Donut chart **kategori pengeluaran** + status anggaran
- Widget tagihan mendatang dengan indikator urgensi
- Sapaan personal dengan nama pengguna

### 💳 Rekening & E-Wallet
- Tambah **rekening bank** dengan logo bank otomatis
- Dukungan penuh **e-wallet** (GoPay, OVO, Dana, dll.)
- Scroll horizontal antar rekening di dashboard

### 📝 Transaksi
- Catat transaksi **pemasukan, pengeluaran, dan transfer**
- Filter berdasarkan jenis, kategori, dan bulan
- Pencarian real-time + paginasi

### 🤖 Scan Struk — AI OCR
- Upload via **kamera langsung**, galeri, atau drag & drop
- Analisis otomatis dengan **AI** — ekstrak nama toko, tanggal, item, dan total
- Simpan sebagai: **1 total**, **per item**, atau **per kategori**
- Riwayat scan tersimpan

### 💰 Keuangan
| Fitur | Deskripsi |
|-------|-----------|
| **Anggaran** | Pantau batas pengeluaran per kategori dengan progress bar |
| **Target Tabungan** | Lacak progress menabung menuju tujuan finansial |
| **Tagihan** | 🔴 Kritis (≤3 hari) · 🟡 Mendekat (4–7 hari) · 🟢 Aman |
| **Piutang** | Catat uang yang dipinjamkan dan status pengembaliannya |

### 📈 Laporan
- Grafik pemasukan vs pengeluaran per bulan
- Tabel ringkasan bulanan + persentase tabungan
- Top kategori pengeluaran · Export **CSV**

### ⚙️ Pengaturan
- Foto profil + nama pengguna
- Mata uang: 🇮🇩 Rupiah · 🇺🇸 Dollar · 🇪🇺 Euro · 🇯🇵 Yen
- Tema: **Glass Terang**, **Glass Gelap**, **Educational**
- Backup & Restore data via **JSON**
- Kategori transaksi **kustom**

---

## 🤖 Bot Telegram
Laksa terhubung dengan AI Financial Agent di Telegram.
1. Cari bot **`@laksatel_bot`** di Telegram
2. Ketik `/myid` untuk mendapatkan Telegram ID kamu
3. Masukkan ID tersebut saat setup di aplikasi
4. Data kamu akan tersinkron ke cloud ☁️

---

## 🚀 Cara Pakai

**Opsi 1 — Langsung buka (paling mudah)**  
👉 [haerubirru17.github.io/laksaapps](https://haerubirru17.github.io/laksaapps/)

**Opsi 2 — Jalankan lokal**
```bash
git clone https://github.com/haerubirru17/laksaapps.git
cd laksaapps
# Buka index.html di browser
```

---

## 🛠️ Teknologi

| Teknologi | Peran |
|-----------|-------|
| HTML5 / CSS3 | Struktur dan tampilan antarmuka |
| Vanilla JavaScript | Logika aplikasi tanpa framework |
| Chart.js 4.4.1 | Grafik arus kas, donut chart, bar chart |
| Google Fonts | Tipografi (Inter, JetBrains Mono) |
| Cloudflare Workers | Backend proxy & sinkronisasi data |
| AI Vision API | Analisis gambar struk (OCR) |
| GitHub Pages | Hosting aplikasi |

---

## 📁 Struktur Folder

```
laksaapps/
├── index.html              # Halaman utama aplikasi
├── css/
│   ├── core.css            # Variabel & reset
│   ├── layout.css          # Grid & layout
│   ├── components.css      # Komponen UI
│   └── pages.css           # Style per halaman
├── js/                     # Modul JavaScript
├── ewallet/                # Logo e-wallet
├── Banks Logo/             # Logo bank
├── banks.js                # Data daftar bank
├── bankColors.js           # Warna identitas bank
├── ai-chat.js              # Integrasi AI
└── cloudflare-worker.js    # Cloudflare Worker
```

---

## 🔒 Privasi
Data tersimpan di **browser kamu** (localStorage). Sinkronisasi cloud hanya aktif jika kamu menghubungkan Telegram sendiri.

---

## 👨‍💻 Developer
Dibuat oleh **[haerubirru17](https://github.com/haerubirru17)** · © 2026

<div align="center">
  <sub>⭐ Kalau Laksa membantu keuanganmu, jangan lupa beri bintang!</sub>
</div>
