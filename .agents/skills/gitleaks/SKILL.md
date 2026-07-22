---
name: gitleaks
description: Pemindaian riwayat commit Git dan file workspace untuk mendeteksi kebocoran kunci API, token OAuth, dan kredensial rahasia.
---

# Gitleaks Secret Detector Skill

`gitleaks` adalah pemindai rahasia (*secret scanner*) cepat untuk menemukan kunci API, token rahasia, kata sandi, dan sertifikat yang tidak sengaja tersimpan dalam repositori Git atau file workspace.

---

## 🚀 Perintah Eksekusi Utama (PowerShell / Windows)

```powershell
# Memindai seluruh riwayat commit Git pada proyek
& "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe\gitleaks.exe" detect --source . -v
```

---

## 📋 Parameter & Opsi Penting

| Parameter | Deskripsi |
| :--- | :--- |
| `detect --source .` | Memindai repositori Git di lokasi saat ini |
| `-v` / `--verbose` | Menampilkan detail baris dan commit tempat rahasia terdeteksi |
| `protect` | Memindai perubahan yang belum di-commit (uncommitted changes) |

---

## 🛠️ Langkah Remediasi / Perbaikan
1. Jangan pernah meng-commit file berisi token sensitif.
2. Tambahkan nama file sensitif ke dalam `.gitignore`.
3. Jika token sempat ter-commit, segera lakukan *revoke / rotate* token tersebut di penyedia layanannya.
