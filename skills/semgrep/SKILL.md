---
name: semgrep
description: Analisis keamanan kode statis (SAST) berbasis aturan untuk memindai logika kode JavaScript, HTML, CSS, dan file sumber proyek.
---

# Semgrep Security Analysis Skill

`semgrep` adalah mesin analisis kode statis (Static Application Security Testing / SAST) yang memindai logika kode tanpa mengeksekusinya untuk menemukan celah keamanan, bug sintaksis, dan anti-pattern.

---

## 🚀 Perintah Eksekusi Utama (PowerShell / Windows)

```powershell
# Memindai seluruh kode basis data dengan aturan otomatis (auto config)
python -m semgrep scan --config auto
```

---

## 📋 Parameter & Opsi Penting

| Parameter | Deskripsi |
| :--- | :--- |
| `scan --config auto` | Menjalankan aturan rekomendasi otomatis dari Semgrep Registry |
| `--config p/javascript` | Menjalankan aturan spesifik untuk kode JavaScript |
| `--config p/owasp-top-10` | Menjalankan pemindaian khusus standar OWASP Top 10 |
| `--json` | Mengeluarkan hasil laporan dalam bentuk JSON |

---

## 🛠️ Langkah Remediasi / Perbaikan
1. Jika Semgrep menemukan *blocking finding*, periksa baris kode dan nomor baris yang dilaporkan.
2. Tambahkan pengaman sintaksis (misalnya Subresource Integrity `integrity=""` pada tag `<script>`).
3. Jalankan ulang `semgrep scan --config auto` hingga mendapatkan `0 findings`.
