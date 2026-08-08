---
name: google-osv-scanner
description: Pemindaian kerentanan dependensi open-source (Supply Chain / SCA) menggunakan Google OSV-Scanner pada file manifest dependensi seperti package-lock.json.
---

# Google OSV-Scanner Skill

`google-osv-scanner` adalah alat pemindaian kerentanan dependensi open-source buatan Google yang membandingkan versi paket dengan basis data kerentanan resmi OSV.dev (Open Source Vulnerabilities).

---

## 🚀 Perintah Eksekusi Utama (PowerShell / Windows)

```powershell
# Memindai seluruh dependensi proyek secara rekursif di folder lokal
& "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Google.OSVScanner_Microsoft.Winget.Source_8wekyb3d8bbwe\osv-scanner.exe" -r .
```

---

## 📋 Parameter & Opsi Penting

| Parameter | Deskripsi |
| :--- | :--- |
| `-r .` | Memindai direktori saat ini secara rekursif |
| `--lockfile package-lock.json` | Memindai spesifik file lockfile Node.js |
| `--json` | Mengeluarkan hasil pemindaian dalam format JSON untuk otomasi |

---

## 🛠️ Langkah Remediasi / Perbaikan
Jika OSV-Scanner menemukan dependensi yang memiliki kerentanan:
1. Perbarui versi paket di `package.json`.
2. Jalankan `npm update` atau `npm install` untuk memperbarui `package-lock.json`.
3. Jalankan pemindaian ulang `osv-scanner` sampai mengembalikan hasil `No issues found`.
