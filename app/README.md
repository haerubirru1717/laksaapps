<div align="center">

# 🌐 Laksa Apps

🇮🇩 [Bahasa Indonesia](README.id.md) | 🇬🇧 **English**

**A web-based personal finance management app**  
Record transactions, manage budgets, scan receipts with AI, and track bills — all in one place.

🔗 **[Try it now → haerubirru17.github.io/laksaapps](https://haerubirru17.github.io/laksaapps/)**

![HTML](https://img.shields.io/badge/HTML-44.2%25-e34c26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-37.2%25-f1e05a?style=flat-square&logo=javascript&logoColor=black)
![CSS](https://img.shields.io/badge/CSS-18.5%25-563d7c?style=flat-square&logo=css3&logoColor=white)
![Version](https://img.shields.io/badge/version-1.2.0-blueviolet?style=flat-square)
![Live](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen?style=flat-square&logo=github)

</div>

---

## ✨ Features

### 📊 Dashboard
- **Net worth summary** across all accounts and e-wallets
- Interactive **cash flow chart** (7 days / 30 days)
- **Spending category** donut chart + budget status
- Upcoming bills widget with urgency indicators
- Personalized greeting with your name

### 💳 Accounts & E-Wallets
- Add **bank accounts** with automatic bank logos
- Full support for **e-wallets** (GoPay, OVO, Dana, etc.)
- Horizontal scroll through accounts on the dashboard

### 📝 Transactions
- Record **income, expenses, and transfers**
- Filter by type, category, and month
- Real-time search + pagination

### 🤖 Receipt Scanner — AI OCR
- Upload via **camera**, gallery, or drag & drop
- AI-powered analysis — extracts store name, date, items, and total
- Save as: **single total**, **per item**, or **per category**
- Scan history saved locally

### 💰 Finance Tools
| Feature | Description |
|---------|-------------|
| **Budget** | Track spending limits per category with a progress bar |
| **Savings Goals** | Monitor progress toward your financial targets |
| **Bills** | 🔴 Critical (≤3 days) · 🟡 Upcoming (4–7 days) · 🟢 Safe |
| **Receivables** | Track money you've lent and repayment status |

### 📈 Reports
- Income vs expenses chart per month
- Monthly summary table + savings rate
- Top spending categories · Export to **CSV**

### ⚙️ Settings
- Profile photo + username
- Currency: 🇮🇩 Rupiah · 🇺🇸 Dollar · 🇪🇺 Euro · 🇯🇵 Yen
- Themes: **Glass Light**, **Glass Dark**, **Educational**
- Backup & Restore data via **JSON**
- **Custom** transaction categories

---

## 🤖 Telegram Bot
Laksa connects to an AI Financial Agent on Telegram.
1. Search for **`@laksatel_bot`** on Telegram
2. Type `/myid` to get your Telegram ID
3. Enter the ID during app setup
4. Your data will sync to the cloud ☁️

The deployment uses two separate Telegram bots:

- Consumer bot: `TELEGRAM_TOKEN` + `TELEGRAM_WEBHOOK_SECRET`, served at
  `/telegram-webhook` (legacy `/webhook` is also accepted).
- Admin bot: `ADMIN_BOT_TOKEN` + `ADMIN_TELEGRAM_WEBHOOK_SECRET`, served only
  at `/admin-webhook` and restricted to `ADMIN_TELEGRAM_ID`.

Do not reuse webhook secrets between these bots. Running the protected `/setup`
endpoint registers a different command menu for each bot.

---

## 🚀 Getting Started

**Option 1 — Open directly (easiest)**  
👉 [haerubirru17.github.io/laksaapps](https://haerubirru17.github.io/laksaapps/)

**Option 2 — Run locally**
```bash
git clone https://github.com/haerubirru17/laksaapps.git
cd laksaapps
# Open index.html in your browser
```

---

## 🛠️ Tech Stack

| Technology | Role |
|------------|------|
| HTML5 / CSS3 | UI structure and styling |
| Vanilla JavaScript | App logic, no frameworks |
| Chart.js 4.4.1 | Cash flow, donut, and bar charts |
| Google Fonts | Typography (Inter, JetBrains Mono) |
| Cloudflare Workers | Backend proxy & data sync |
| AI Vision API | Receipt image analysis (OCR) |
| GitHub Pages | App hosting |

---

## 📁 Project Structure

```
laksaapps/
├── index.html              # Main app page
├── css/
│   ├── core.css            # Variables & reset
│   ├── layout.css          # Grid & layout
│   ├── components.css      # UI components
│   └── pages.css           # Per-page styles
├── js/                     # JavaScript modules
├── ewallet/                # E-wallet logos
├── Banks Logo/             # Bank logos
├── banks.js                # Bank list data
├── bankColors.js           # Bank brand colors
├── ai-chat.js              # AI integration
└── cloudflare-worker.js    # Cloudflare Worker
```

## Safe static deployment

Only the generated `dist/` directory may be published. This prevents Worker
source, Wrangler configuration, documentation, and other repository files from
being served as static assets.

```bash
npm ci
npm run build
```

- GitHub Pages: use the included `.github/workflows/pages.yml` workflow and set
  **Settings → Pages → Source** to **GitHub Actions**.
- Cloudflare Pages: set **Build command** to `npm run build` and
  **Build output directory** to `dist`.
- Cloudflare Worker: deploy separately with `npm run deploy:worker`.

After deploying, rotate any Telegram token that has ever appeared in a public
URL, repository, build artifact, or log.

### Automatic KlikQRIS MY PG payments

Store the KlikQRIS credentials as Worker secrets:

```bash
wrangler secret put KLIKQRIS_MERCHANT_ID
wrangler secret put KLIKQRIS_API_KEY
```

For testing, add the Worker variable `KLIKQRIS_ENVIRONMENT=sandbox`. Remove it
or change it to `production` before accepting real payments.

Configure the KlikQRIS webhook URL as:

```text
https://laksana.haerubirru17.workers.dev/payment/klikqris-webhook
```

The Worker matches the callback signature and re-verifies the order ID, total,
and status through the MY PG Status API before activating Premium. Never expose
the KlikQRIS API key in frontend or Cloudflare Pages configuration.

Linked Telegram users can also run `/upgrade`, select a package, and open the
generated KlikQRIS checkout from an inline button. A recent pending checkout is
reused for 15 minutes to avoid duplicate orders. Coupons remain available
through the web checkout. The bot never approves a payment itself.

---

## 🔒 Privacy
Authenticated financial records are stored in Cloudflare D1 and synchronized over HTTPS. Limited preferences and cached UI data may be stored in the browser. AI chat content and receipt images are sent to the configured AI provider for processing; deployments must disclose the active providers and retention terms to users.

---

## 👨‍💻 Developer
Made by **[haerubirru17](https://github.com/haerubirru17)** · © 2026

<div align="center">
  <sub>⭐ If Laksa helps you manage your finances, consider leaving a star!</sub>
</div>
