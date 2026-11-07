# Gembul Agent

Lightweight animated 2D agent office for Botkeep. Three agents (Gembul / PM, Bulu / Developer, Kecil / Reviewer) collaborate through Antigravity OAuth. Agent avatars walk to work/communication positions based on task states and return to their desks when idle.

## Botkeep

Set environment variables:

```text
ANTIGRAVITY_CLIENT_ID=...
ANTIGRAVITY_CLIENT_SECRET=...
ANTIGRAVITY_MODEL=gemini-3.8-flash
DATA_DIR=/your/persistent/path
PORT=3000
```

Configure the Google OAuth redirect URI as `https://YOUR-BOTKEEP-DOMAIN/api/auth/antigravity/callback`. Mount persistent storage at `DATA_DIR` to keep the Antigravity refresh token across redeploys. Memory target: under 1.5 GB. Runtime: Node 20+.

## Run locally

```bash
npm install
npm start
```

Open the Botkeep service URL and click **LOGIN GOOGLE** to authorize Antigravity. Then dispatch a task; PM, Developer, and Reviewer work sequentially, with status changes reflected in the animated office and activity feed.
