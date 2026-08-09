---
name: nuclei
description: Pengujian keamanan dinamis (DAST) untuk memverifikasi HTTP Security Headers, WAF, dan konfigurasi server runtime.
---

# Nuclei DAST Security Skill

`nuclei` adalah alat pengujian keamanan dinamis (Dynamic Application Security Testing / DAST) berbasis template dari ProjectDiscovery untuk memvalidasi konfigurasi server web, HTTP security headers, dan enkripsi SSL/TLS.

---

## 🚀 Perintah Eksekusi Utama (PowerShell / Windows)

```powershell
# Memindai target endpoint server web live atau lokal
& "C:\Users\asus\.local\bin\nuclei.exe" -u https://laksaapp.my.id
```

---

## 📋 Parameter & Opsi Penting

| Parameter | Deskripsi |
| :--- | :--- |
| `-u <URL>` | Memtentukan target URL web yang akan diuji |
| `-t http/vulnerabilities/` | Menjalankan kategori template HTTP spesifik |
| `-tags header` | Menguji keberadaan HTTP Security Headers |

---

## 🛠️ Langkah Remediasi / Perbaikan
1. Jika dilaporkan `missing-security-headers` (seperti CSP, HSTS, X-Frame-Options), buat/perbarui file `_headers` di Cloudflare Pages.
2. Jika ada file publik sensitif yang terdeteksi, tambahkan aturan `404` pada file `_redirects`.
