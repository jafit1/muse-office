# Gembul Agent

Gembul Agent is a lightweight animated 2D agent office built for Botkeep. Gembul (PM), Bulu (Developer), and Kecil (Reviewer) collaborate through an Antigravity OAuth session. The canvas animates each avatar between desk and task position as server-side task phases change.

## Deploy on Botkeep

Deploy `jafit1/muse-office`, branch `main`, using Node.js 20 or newer. Configure a persistent volume and set:

```text
ANTIGRAVITY_CLIENT_ID=...
ANTIGRAVITY_CLIENT_SECRET=...
ANTIGRAVITY_CALLBACK_URL=https://YOUR-STABLE-DOMAIN/api/auth/antigravity/callback
ANTIGRAVITY_MODEL=gemini-3.8-flash
DATA_DIR=/path/to/persistent-volume
PORT=3000
```

The OAuth redirect URI must exactly match `ANTIGRAVITY_CALLBACK_URL`. Put the persistent volume at `DATA_DIR`; the refreshable login is stored in `antigravity.json`. Do not commit that file or expose it. Login by opening the service and pressing **LOGIN GOOGLE**. `/health` reports app and provider connectivity metadata without tokens.

## Resource profile

The app runs an Express server, serves static HTML/Canvas, and uses one WebSocket connection per browser. No frontend framework, Three.js, database, or build step. `botkeep.json` documents a deployment target matching the supplied limits (1537 MB memory, 1 CPU, 1024 MB storage); actual consumption depends on Botkeep runtime overhead and must be verified in its dashboard.

## Local run

```bash
npm install
npm test
npm start
```

Open `http://localhost:3000`. Node.js 20+ is recommended.
