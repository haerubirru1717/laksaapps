<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/LAKSA-Personal_Finance-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMkwyIDdsIDEwIDUgMTAtNS0xMC01ek0yIDE3bDEwIDUgMTAtNU0yIDEybDEwIDUgMTAtNSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=&logoColor=white" />
  <img alt="Laksa" src="https://img.shields.io/badge/LAKSA-Personal_Finance-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMkwyIDdsIDEwIDUgMTAtNS0xMC01ek0yIDE3bDEwIDUgMTAtNU0yIDEybDEwIDUgMTAtNSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=&logoColor=white" />
</picture>

# Laksa

**Aplikasi pencatatan keuangan pribadi berbasis web dengan AI financial agent.**

Kelola transaksi, anggaran, tagihan, dan target tabungan dari browser atau Telegram — ditenagai oleh **Laksa.na**, asisten keuangan cerdas berbahasa Indonesia.

[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-222?style=flat-square&logo=github)](https://haerubirru17.github.io/laksaapps)
[![Cloudflare Workers](https://img.shields.io/badge/Backend-Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![D1 Database](https://img.shields.io/badge/Database-Cloudflare_D1-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)

</div>

---

## Daftar Isi

- [Tentang](#tentang)
- [Fitur Utama](#fitur-utama)
- [Arsitektur](#arsitektur)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Panduan Setup](#panduan-setup)
- [Konfigurasi Environment](#konfigurasi-environment)
- [API Reference](#api-reference)
- [Tema & Personalisasi](#tema--personalisasi)
- [Laksa.na — AI Financial Agent](#laksana--ai-financial-agent)
- [Lisensi](#lisensi)

---

## Tentang

**Laksa** adalah aplikasi keuangan pribadi full-stack yang dirancang untuk pengguna Indonesia. Seluruh antarmuka web berjalan sebagai static Single Page Application (SPA) tanpa framework — murni HTML, CSS, dan JavaScript vanilla. Backend dijalankan sebagai Cloudflare Worker dengan D1 (SQLite) sebagai database.

Laksa juga terintegrasi dengan **Telegram Bot** untuk pencatatan transaksi via chat dan scan struk, serta dilengkapi **Laksa.na** — AI financial agent yang bisa diajak ngobrol langsung dari web app.

---

## Fitur Utama

### Pencatatan Keuangan

| Fitur | Deskripsi |
|-------|-----------|
| **Transaksi** | Catat pemasukan & pengeluaran dengan kategori, rekening, dan catatan. Filter, search, sort, dan pagination. |
| **Multi-Rekening** | Kelola banyak rekening bank & e-wallet. Logo 90+ bank Indonesia tersedia (BCA, Mandiri, BRI, dll). |
| **Anggaran** | Set limit bulanan per kategori. Progress bar real-time dengan status OK / Warning / Danger. |
| **Target Tabungan** | Buat target finansial dengan deadline dan tracking progress. |
| **Tagihan** | Catat tagihan bulanan/tahunan. Reminder otomatis di dashboard dan Telegram. |
| **Piutang** | Tracking pinjaman yang diberikan — siapa, berapa, kapan jatuh tempo. |
| **Scan Struk (OCR)** | Upload foto struk → AI extract data otomatis → satu klik simpan sebagai transaksi. |

### Analitik & Laporan

| Fitur | Deskripsi |
|-------|-----------|
| **Dashboard** | Overview saldo, pemasukan vs pengeluaran bulan ini, kategori pengeluaran (donut chart), status anggaran, tagihan mendatang. |
| **Laporan Tahunan** | Visualisasi pemasukan vs pengeluaran per bulan (bar / line / area chart — bisa di-toggle). |
| **Ringkasan Keuangan** | Total income, expense, selisih, dan rasio tabungan. Tabel detail per bulan (expandable). |

### Laksa.na — AI Financial Agent

| Fitur | Deskripsi |
|-------|-----------|
| **Chat di Web** | Tanya apa saja soal keuanganmu — Laksa.na punya akses ke data real-time. |
| **Chat di Telegram** | Kirim teks bebas → transaksi otomatis tercatat. Tidak perlu isi form. |
| **Scan Struk via Telegram** | Kirim foto struk → AI parse → konfirmasi → simpan. |
| **Context-Aware** | Laksa.na tahu saldo, anggaran, tagihan, dan tren keuanganmu saat menjawab. |

### UX & Desain

| Fitur | Deskripsi |
|-------|-----------|
| **Responsive** | Optimized untuk mobile dan desktop. Bottom nav pill (mobile) + sidebar (desktop). |
| **3 Tema** | Glass (terang), OLED Dark (gelap), Educational (neobrutalism). |
| **Glassmorphism UI** | Backdrop blur, gradient subtle, smooth animations. |
| **Bottom Sheet FAB** | Quick actions (catat transaksi, tambah rekening, dll) accessible dari mana saja. |
| **Backup & Restore** | Export data ke JSON, import kembali kapan saja. |

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT LAYER                          │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────────────┐   │
│  │   Web App (SPA)  │          │    Telegram Bot Client   │   │
│  │  GitHub Pages    │          │    (User's Telegram)     │   │
│  └────────┬────────┘          └────────────┬────────────┘   │
│           │ REST API                       │ Webhook        │
└───────────┼────────────────────────────────┼────────────────┘
            │                                │
┌───────────▼────────────────────────────────▼────────────────┐
│                    CLOUDFLARE WORKER                         │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ REST API │  │ Telegram │  │ AI Chat  │  │ OCR/Vision │  │
│  │  Router  │  │ Handler  │  │  Proxy   │  │   Proxy    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │             │               │         │
│  ┌────▼──────────────▼─────┐ ┌────▼───────────────▼──────┐  │
│  │    Cloudflare D1        │ │       Groq LLM API        │  │
│  │    (SQLite)             │ │  (Llama, Qwen — fallback)  │  │
│  └─────────────────────────┘ └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | HTML5, CSS3 (custom properties, glassmorphism), Vanilla JavaScript |
| **Charts** | [Chart.js 4.4](https://www.chartjs.org/) |
| **Fonts** | [Inter](https://rsms.me/inter/) (UI) + [JetBrains Mono](https://www.jetbrains.com/mono/) (monospace) |
| **Backend** | [Cloudflare Workers](https://workers.cloudflare.com/) (serverless, edge computing) |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (distributed SQLite) |
| **AI/LLM** | [Groq](https://groq.com/) — Llama 4 Scout (vision), Qwen 3 32B (chat), Llama 3.3 70B (parsing) |
| **Bot** | [Telegram Bot API](https://core.telegram.org/bots/api) |
| **Hosting** | [GitHub Pages](https://pages.github.com/) (frontend) |

---

## Struktur Proyek

```
laksaapps/
├── index.html              # SPA entry point — semua halaman dalam satu file
├── ai-chat.js              # Modul AI chatbot Laksa.na (style + logic + UI)
├── banks.js                # Database 90+ bank Indonesia (nama, kode, deteksi logo)
├── cloudflare-worker.js    # Backend: REST API + Telegram bot + AI proxy
│
├── js/
│   ├── app.js              # Core: constants, state, API layer, theme, navigation
│   ├── dashboard.js        # Dashboard: saldo, stats, charts, widgets
│   ├── transactions.js     # Halaman transaksi: filter, sort, pagination
│   ├── keuangan.js         # Keuangan: anggaran, target, tagihan, piutang
│   ├── reports.js          # Laporan: chart toggle, ringkasan, detail bulanan
│   ├── settings.js         # Pengaturan: profil, tema, backup/restore
│   ├── modals.js           # Modal dialogs: form transaksi, rekening, dll
│   └── receipt.js          # Scan struk: kamera, upload, OCR processing
│
├── css/
│   ├── core.css            # Design tokens, tema (glass/dark/education), base styles
│   ├── layout.css          # Sidebar, bottom nav, page grid, responsive breakpoints
│   ├── components.css      # Cards, buttons, forms, modals, charts, badges
│   └── pages.css           # Page-specific overrides
│
├── Banks Logo/             # 90+ SVG logo bank Indonesia
├── ewallet/                # Logo e-wallet (GoPay, OVO, DANA, ShopeePay, LinkAja)
└── .gitignore
```

---

## Panduan Setup

### Prerequisites

- Akun [Cloudflare](https://dash.cloudflare.com/) (gratis)
- Akun [Groq](https://console.groq.com/) untuk API key (gratis)
- (Opsional) [Telegram Bot](https://t.me/BotFather) untuk fitur bot

### 1. Deploy Frontend

Frontend adalah static site — cukup enable GitHub Pages:

1. Fork/clone repository ini
2. Buka **Settings** > **Pages** di GitHub
3. Set source ke branch `main`, folder `/ (root)`
4. Akses di `https://<username>.github.io/laksaapps`

### 2. Deploy Backend (Cloudflare Worker)

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login ke Cloudflare
wrangler login

# Buat D1 database
wrangler d1 create laksa-db

# Update wrangler.toml dengan database ID (lihat output di atas)
```

Buat file `wrangler.toml`:

```toml
name = "laksana"
main = "cloudflare-worker.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "laksa-db"
database_id = "<YOUR_DATABASE_ID>"
```

```bash
# Deploy
wrangler deploy

# Setup database tables
curl -X GET https://<worker-name>.<subdomain>.workers.dev/setup
```

### 3. Setup Telegram Bot (Opsional)

1. Chat [@BotFather](https://t.me/BotFather) di Telegram → `/newbot`
2. Set environment variables di Cloudflare:

```bash
wrangler secret put TELEGRAM_TOKEN
wrangler secret put GROQ_API_KEY
# Opsional: webhook secret
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

3. Register webhook:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev/webhook&secret_token=<SECRET>"
```

### 4. Konfigurasi Frontend

Edit `CLOUD_URL` di `js/app.js` untuk mengarah ke Worker kamu:

```javascript
const CLOUD_URL = 'https://<worker-name>.<subdomain>.workers.dev';
```

---

## Konfigurasi Environment

| Variable | Required | Deskripsi |
|----------|----------|-----------|
| `TELEGRAM_TOKEN` | Ya (jika pakai bot) | Token dari BotFather |
| `GROQ_API_KEY` | Ya | API key dari [Groq Console](https://console.groq.com/) |
| `TELEGRAM_WEBHOOK_SECRET` | Tidak | Secret untuk validasi webhook (recommended) |
| `DB` (D1 binding) | Ya | Cloudflare D1 database binding |

---

## API Reference

Base URL: `https://<worker>.workers.dev`

Semua endpoint (kecuali `/setup`, `/ai-chat`, `/scan-receipt`) memerlukan query parameter `user_id`.

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| `GET` | `/` | Health check |
| `GET` | `/setup` | Inisialisasi tabel database |
| | | |
| `GET` | `/accounts?user_id=` | List semua rekening |
| `POST` | `/accounts?user_id=` | Buat rekening baru |
| `PATCH` | `/accounts/:id?user_id=` | Update rekening |
| `DELETE` | `/accounts/:id?user_id=` | Hapus rekening |
| | | |
| `GET` | `/categories?user_id=` | List kategori |
| `POST` | `/categories?user_id=` | Buat kategori |
| `DELETE` | `/categories/:id?user_id=` | Hapus kategori |
| | | |
| `GET` | `/transactions?user_id=&month=&limit=` | List transaksi (filter bulan) |
| `POST` | `/transactions?user_id=` | Buat transaksi |
| `PATCH` | `/transactions/:id?user_id=` | Update transaksi |
| `DELETE` | `/transactions/:id?user_id=` | Hapus transaksi |
| | | |
| `GET` | `/budgets?user_id=` | List anggaran |
| `POST` | `/budgets?user_id=` | Buat anggaran |
| `DELETE` | `/budgets/:id?user_id=` | Hapus anggaran |
| | | |
| `GET` | `/goals?user_id=` | List target tabungan |
| `POST` | `/goals?user_id=` | Buat target |
| `PATCH` | `/goals/:id?user_id=` | Update target |
| `DELETE` | `/goals/:id?user_id=` | Hapus target |
| | | |
| `GET` | `/bills?user_id=` | List tagihan |
| `POST` | `/bills?user_id=` | Buat tagihan |
| `PATCH` | `/bills/:id?user_id=` | Update tagihan |
| `DELETE` | `/bills/:id?user_id=` | Hapus tagihan |
| | | |
| `GET` | `/piutang?user_id=` | List piutang |
| `POST` | `/piutang?user_id=` | Buat piutang |
| `PATCH` | `/piutang/:id?user_id=` | Update piutang |
| `DELETE` | `/piutang/:id?user_id=` | Hapus piutang |
| | | |
| `GET` | `/transaction-items?transaction_id=` | List item dalam transaksi |
| | | |
| `POST` | `/ai-chat` | Proxy AI chat ke Groq |
| `POST` | `/scan-receipt` | Proxy scan struk (vision) ke Groq |

### Telegram Bot Commands

| Command | Deskripsi |
|---------|-----------|
| `/start`, `/menu` | Tampilkan menu utama |
| `/myid` | Lihat Telegram ID kamu |
| `/saldo` | Cek saldo semua rekening |
| `/riwayat` | Lihat 10 transaksi terakhir |
| `/tagihan` | Lihat tagihan yang belum dibayar |
| `/batal` | Batalkan input yang sedang berlangsung |
| _(teks bebas)_ | Catat transaksi otomatis via AI |
| _(kirim foto)_ | Scan struk via AI Vision |

---

## Tema & Personalisasi

Laksa menyediakan 3 tema yang bisa dipilih saat setup atau di halaman Pengaturan:

### Glass (Terang)
Tema default. Glassmorphism dengan backdrop blur, gradient halus, dan nuansa terang yang modern.

### OLED Dark (Gelap)
Background hitam pekat (#000) untuk layar AMOLED. Glassmorphism tetap hadir dengan border subtle dan glow effect pada elemen interaktif.

### Educational
Desain neobrutalism — border tebal, box-shadow displacement, warna solid (navy, cream, mint green). Cocok untuk konteks edukasi keuangan.

---

## Laksa.na — AI Financial Agent

**Laksa.na** adalah AI financial agent bawaan Laksa yang bisa diakses dari web app maupun Telegram.

### Kemampuan

- **Tanya jawab keuangan** — "Berapa pengeluaran makanan bulan ini?", "Gimana tren pemasukan 3 bulan terakhir?"
- **Pencatatan via chat** — "Beli kopi 25rb di Starbucks" → transaksi tercatat otomatis
- **Scan struk** — Kirim/upload foto struk → AI extract semua item, total, dan toko
- **Saran finansial** — Berdasarkan data aktual keuanganmu, bukan template generik
- **Bahasa Indonesia kasual** — Laksa.na ngobrol natural, bukan robot

### Model AI (dengan Fallback Chain)

| Fungsi | Primary Model | Fallback |
|--------|---------------|----------|
| Chat | Qwen 3 32B | Llama 3.3 70B → Llama 4 Scout → Llama 3.1 8B |
| Parsing transaksi | Llama 3.1 8B | Llama 3.3 70B → Llama 4 Scout |
| Vision (struk) | Llama 4 Scout | Llama 4 Maverick |

Semua model dijalankan via [Groq](https://groq.com/) untuk inferensi ultra-cepat.

---

## Database Schema

```sql
accounts          -- Rekening bank & e-wallet
categories        -- Kategori transaksi (custom + default)
transactions      -- Semua transaksi pemasukan & pengeluaran
transaction_items -- Item detail per transaksi (dari scan struk)
budgets           -- Anggaran bulanan per kategori
goals             -- Target tabungan
bills             -- Tagihan berkala
piutang           -- Tracking pinjaman yang diberikan
pending_scans     -- Antrian scan struk (Telegram)
pending_texts     -- Antrian teks pending (Telegram)
processed_updates -- Deduplikasi update Telegram
```

---

## Lisensi

Hak cipta dilindungi. Hubungi pemilik repositori untuk informasi penggunaan.

---

<div align="center">

**Dibangun dengan semangat untuk literasi keuangan Indonesia.**

[Live Demo](https://haerubirru17.github.io/laksaapps) · [Laporkan Bug](https://github.com/haerubirru17/laksaapps/issues)

</div>
