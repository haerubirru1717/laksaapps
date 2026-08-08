---
name: trivy
description: Pemindaian kerentanan file sistem (Filesystem), audit miskonfigurasi deployment, dan pemeriksaan keamanan struktur proyek.
---

# Trivy Security Scanner Skill

`trivy` adalah alat pemindai keamanan serbaguna dari Aqua Security yang memindai kerentanan file sistem, dependensi, dan kesalahan konfigurasi (*misconfigurations*).

---

## 🚀 Perintah Eksekusi Utama (PowerShell / Windows)

```powershell
# Memindai file sistem dan struktur proyek di direktori saat ini
& "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe\trivy.exe" fs .
```

---

## 📋 Parameter & Opsi Penting

| Parameter | Deskripsi |
| :--- | :--- |
| `fs .` | Memindai filesystem direktori lokal saat ini |
| `--scanners vuln` | Fokus memindai kerentanan kode/paket saja |
| `--scanners config` | Memindai file miskonfigurasi deployment |

---

## 🛠️ Langkah Remediasi / Perbaikan
1. Periksa hasil laporan Trivy pada kategori Vulnerabilities atau Secrets.
2. Perbarui versi file/paket yang terindikasi memiliki isu.
3. Jalankan kembali `trivy fs .` sampai mengembalikan status `No issues detected`.
