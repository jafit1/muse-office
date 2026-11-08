# Gembul Agent

Kantor virtual 2D ringan untuk tiga agen yang bekerja berantai:

| Agen | Peran | Tugas |
| --- | --- | --- |
| **Gembul** | Project Manager | memecah tujuan jadi spesifikasi kerja |
| **Bulu** | Developer | mengeksekusi spesifikasi jadi hasil teknis |
| **Kecil** | Reviewer / QA | mengaudit hasil dan memberi verdict |

Semua inferensi lewat **sesi login Google Antigravity** (OAuth), bukan API key. Avatar di canvas berjalan mengikuti fase kerja riil: diam di meja saat `idle`, menunduk ke layar saat `thinking`, berjalan ke jalur serah-terima saat `talking`, lalu kembali ke meja.

## Alur OAuth Antigravity

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

Model: id ramah diperluas otomatis (`gemini-3.8-flash` → `gemini-3.8-flash-medium(medium)`), dan string preset upstream diterima apa adanya, mis. `gemini-3.8-flash-high(high)`.

## Pemakaian

1. Buka service, tekan **LOGIN GOOGLE**, setujui consent.
2. Status berubah jadi `CONNECTED` dan email akun muncul di kanan atas.
3. Tulis tujuan di **Mission Dispatch**, tekan **DISPATCH**. Satu tugas diproses pada satu waktu (`409` kalau masih berjalan), dan ditolak dengan `401` kalau belum login.
4. Feed **Inter-Agent Protocol Bus** menampilkan serah-terima Gembul → Bulu → Kecil.

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
