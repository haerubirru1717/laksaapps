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

---

## 🔒 Privacy
All financial data is stored **in your browser** (localStorage). Cloud sync is only active if you connect your own Telegram account.

---

## 👨‍💻 Developer
Made by **[haerubirru17](https://github.com/haerubirru17)** · © 2026

<div align="center">
  <sub>⭐ If Laksa helps you manage your finances, consider leaving a star!</sub>
</div>
