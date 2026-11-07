# Gemini 2D Virtual Office

Lightweight 2D office for a Project Manager, Developer, and Reviewer that exchange work through a shared task bus. Built for Botkeep and low-memory deployments.

## Botkeep environment

Set these variables in Botkeep:

```text
ANTIGRAVITY_CLIENT_ID=your-antigravity-oauth-client-id
ANTIGRAVITY_CLIENT_SECRET=your-antigravity-oauth-client-secret
ANTIGRAVITY_MODEL=gemini-3.8-flash
PORT=3000
```

The app uses Google OAuth login for Antigravity, stores the refreshable session and project ID in `DATA_DIR/antigravity.json`, then routes the PM, Developer, and QA requests through Antigravity. Use persistent Botkeep storage and configure the OAuth client's redirect URI as `https://YOUR-DEPLOYMENT/api/auth/antigravity/callback`. OAuth client credentials are not included in this repository.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.
