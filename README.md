# Gembul Agent — VibeOffice Architecture

Kantor virtual retro pixel-art 16-bit (mengadopsi arsitektur [vibeoffice](https://github.com/acost1a/vibeoffice)) di mana agen AI Anda hidup, mengetik, berdiskusi, dan bekerja secara realtime di atas mesin **Google Antigravity (Gemini 3.8 Flash)**.

| Agen | Peran | Avatar | Tugas |
| --- | --- | --- | --- |
| **Gembul** | Project Manager & Architect | 👔 `#4A90E2` (Biru) | Scoping, arsitektur, perencanaan & direct chat |
| **Bulu** | Lead Developer | 💻 `#10B981` (Hijau) | Menulis kode bersih, algoritma, refactor & debugging |
| **Kecil** | QA & Security Auditor | 🔍 `#F5A623` (Kuning) | Audit keamanan, race condition, edge cases & approval |

Plus tombol **➕ HIRE AGENT** untuk mempekerjakan spesialis baru (Coder, Excel Master, Word Master, PPT Master, Researcher) langsung ke kantor!

## Fitur & Kehidupan Kantor

- **Retro 16-bit Pixel-Art Office:** Lantai kayu dengan ubin, jendela dengan langit dan cahaya matahari, rak buku, jam dinding, papan tulis rapat, tanaman hias, rak server, akuarium berisi ikan, dispenser air, dan mesin kopi dengan uap panas.
- **Micro-Animations Realtime:**
  - Saat agen mengetik kode (`editing`): avatar mengetik cepat di keyboard, monitor menyala hijau/amber!
  - Saat agen membaca file / audit (`reading`): lembaran kertas dibolak-balik di atas meja.
  - Saat agen menganalisis (`thinking`): gelembung 💭 melayang di atas kepala.
  - Saat menunggu (`waiting`): berjalan ke mesin kopi ☕.
  - Saat santai/idle: kucing berjalan-jalan di kantor, robot vacuum menyapu lantai, agen rebahan tidur di sofa lounge 💤.
  - Saat deliverable selesai: konfeti warna-warni berhamburan di kantor 🎉!
- **Interactive Rail & Direct Chat:**
  - Klik agen mana saja (Gembul, Bulu, Kecil, atau hired agent) untuk membuka detail profil dan **chat interaktif 1-on-1 langsung di mejanya**.
  - Format percakapan mendukung Markdown, blok kode dengan tema gelap, dan tombol **Salin (Copy)** instan.
- **Smart Auto-Relay vs Direct:**
  - Jika kirim pesan ke Gembul (misal `"hi"`, `"kamu siapa"`): Gembul membalas ramah dan singkat secara langsung tanpa melibatkan agen lain.
  - Jika kirim tugas koding ke Gembul: Gembul merancang spesifikasi ➔ mendelegasikan ke Bulu (nulis kode) ➔ diaudit Kecil (QA) ➔ konfeti merayakan hasil kerja!
  - Jika klik Bulu langsung: Bulu langsung menjawab dan menulis kodingan.
  - Jika klik Kecil langsung: Kecil langsung memberikan hasil review dan audit.
- **Pelacakan Token & Biaya Realtime:**
  - Menghitung token input/output dan estimasi biaya USD secara realtime di bar atas (`👥 agents`, `🔤 tokens`, `💰 cost today`).

## Alur OAuth & Token Antigravity

1. `GET /api/auth/antigravity/start` → redirect ke Google (`cloud-platform`, `userinfo.email`, `userinfo.profile`, `cclog`, `experimentsandconfigs`, `access_type=offline`, `prompt=consent`).
2. `GET /api/auth/antigravity/callback` → tukar `code` jadi token, ambil `project_id` dari `v1internal:loadCodeAssist`, jalankan `onboardUser` bila project belum ada.
3. Token + refresh token disimpan di `DATA_DIR/antigravity.json` (mode 0600). Token di-refresh otomatis; `invalid_grant` menghapus sesi dan meminta login ulang.
4. Generasi teks: `POST https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent` dengan payload `{ project, model, userAgent, requestId, request }`.

## Deploy di Botkeep

Deploy repo `jafit1/muse-office`, branch `main`. Buildpack Node, perintah build `npm install --omit=dev`, start `npm start`, Node 20+.

Variabel yang wajib diisi:

```text
ANTIGRAVITY_CLIENT_ID=...
ANTIGRAVITY_CLIENT_SECRET=...
ANTIGRAVITY_CALLBACK_URL=https://DOMAIN-TETAP/api/auth/antigravity/callback
ANTIGRAVITY_MODEL=gemini-3.8-flash
DATA_DIR=/path/ke/volume/persistent
PORT=3000
```

Langkah di Google Cloud Console:

1. APIs & Services → Credentials → **Create credentials → OAuth client ID → Web application**.
2. Authorized redirect URI: `https://DOMAIN-TETAP/api/auth/antigravity/callback`. Harus sama persis dengan `ANTIGRAVITY_CALLBACK_URL`, termasuk skema dan tanpa slash di akhir.
3. Salin Client ID dan Client Secret ke env Botkeep. Jangan commit ke repo — GitHub Push Protection menolak nilai ini.
4. OAuth consent screen: kalau status app masih **Testing**, tambahkan akun Google yang akan dipakai sebagai *test user*, atau login akan ditolak dengan `access_denied`.

`DATA_DIR` harus volume persisten; kalau tidak, login hilang setiap redeploy dan harus authorize ulang. Set `ANTIGRAVITY_CALLBACK_URL` eksplisit supaya callback tidak pernah dibangun dari host internal proxy.

### Membatasi akun yang boleh login

Dua lapis, dan keduanya perlu dipahami bedanya:

1. **Consent screen → Audience → Test users.** Hanya berlaku selama app berstatus **Testing**. Akun di luar daftar ditolak Google dengan `access_denied`. Batasannya: refresh token hanya hidup 7 hari, jadi sesi mati dan harus login ulang tiap minggu.
2. **`ANTIGRAVITY_ALLOWED_EMAILS`.** Gate milik app, jalan di kode, bukan di Google. Isi dengan email yang diizinkan, pisahkan koma:
   ```
   ANTIGRAVITY_ALLOWED_EMAILS=aku@gmail.com
   ```
   Kosong berarti siapa pun yang menyelesaikan consent diterima. Kalau diisi, akun lain yang menekan LOGIN GOOGLE tetap bisa menyelesaikan consent di sisi Google, lalu ditolak di callback: diarahkan balik ke app dengan pesan "akun itu tidak diizinkan", dan tidak ada token yang disimpan.

Saran: **Publish app** (Audience → Publish app) supaya refresh token tidak mati tiap 7 hari, lalu pakai `ANTIGRAVITY_ALLOWED_EMAILS` sebagai pembatas akun. Kalau app sudah terlanjur berisi sesi dari akun yang tidak ada di daftar, sesi itu otomatis dibuang saat service start dan `antigravity.json` dihapus.

Status `GET /health` menampilkan `email`, `emailAllowed`, dan `allowlistSize` untuk memastikan gate-nya benar-benar aktif.

### Login lewat token, tanpa callback

Kalau OAuth client-nya tidak bisa didaftarkan untuk domain ini, mint token di komputer sendiri:

```
node login-local.js        # untuk akun default (shared)
node login-local.js pm     # khusus akun Gembul (PM)
node login-local.js dev    # khusus akun Bulu (Developer)
node login-local.js qa     # khusus akun Kecil (QA & Reviewer)
```

Skrip membuka consent screen di browser, menangkap callback di `http://localhost:53682`, lalu mencetak refresh token. Tempel hasilnya ke env `ANTIGRAVITY_REFRESH_TOKEN` (atau `_PM`, `_DEV`, `_QA`); service memakainya untuk menukar access token seperti biasa. Tiap agen bisa memakai akun Google berbeda atau berbagi akun default yang sama.

Model: id ramah diperluas ke kunci model yang diterima API (`gemini-3.8-flash` → `gemini-3.8-flash-medium`), dan id lain dikirim apa adanya. Akhiran gaya IDE seperti `(medium)` dibuang, karena bentuk itu dijawab `404 Requested entity was not found`.

## Pemakaian & Mode Agen

1. Buka service, pastikan status `CLUSTER ACTIVE` dan `Antigravity` terhubung (lewat token env atau login Google).
2. Pilih mode di atas kotak chat:
   - **✨ Auto Relay (Workflow Pintar):** Jika pesan hanya sapaan ("hi", "halo"), obrolan santai, atau konsultasi, Gembul langsung menjawab tanpa melempar ke agen lain. Jika butuh koding/implementasi, Gembul membuat spesifikasi teknis ➔ didelegasikan ke Bulu (Developer) ➔ diaudit & disetujui Kecil (QA) ➔ hasil diserahkan ke OPERATOR.
   - **👔 Gembul (PM):** Diskusi langsung 1-on-1 mengenai perencanaan, arsitektur, atau scoping proyek.
   - **💻 Bulu (Developer):** Instruksi coding langsung, penulisan script, algoritma, atau perbaikan bug.
   - **🔍 Kecil (QA):** Review kode langsung, audit keamanan, analisis race condition, dan validasi edge-case.
3. Feed chat berjalan dari atas ke bawah (full viewport 100vh) lengkap dengan formatting Markdown, pemformatan blok kode, dan tombol salin instan.
4. Canvas 2D di sebelah kiri menampilkan pergerakan fisik agen secara realtime saat serah terima tugas berlangsung.

Mau lihat animasinya tanpa login? Tambahkan `?demo=1` di URL. Satu siklus kerja diputar ulang di browser saja (badge **DEMO** menyala, server tidak dipanggil, tidak ada task yang benar-benar jalan).

Endpoint bantu: `GET /health` (uptime + status koneksi, tanpa token), `GET /api/antigravity/status`, `GET /api/state`.

## Profil resource

Tanpa framework frontend, tanpa Three.js, tanpa database, tanpa langkah build. Express menyajikan satu halaman HTML + canvas dan satu socket WebSocket per browser. Target yang dipegang: **~1.5 GB RAM, 1 vCPU, 1 GB storage**; konsumsi sebenarnya tetap perlu dicek di dashboard Botkeep karena overhead runtime ikut dihitung.

## Lokal

```bash
npm install
cp .env.example .env      # isi nilai sebenarnya
npm run start:local       # node --env-file=.env server.js
npm test
```

Buka `http://localhost:3000`.
