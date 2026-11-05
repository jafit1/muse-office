# Muse.ai 2D Virtual Office

Lightweight 2D Virtual Office for Multi-Account Muse.ai Agents designed for low-memory environments (<512MB RAM) like Botkeep.

## Environment Variables (Botkeep Dashboard)
- `PORT`: App port (e.g. `3000`)
- `MUSE_BASE_URL`: Base API endpoint for Muse.ai (default: `https://api.muse.ai/v1`)
- `MUSE_KEY_PM`: API Key / token for Alice (Project Manager)
- `MUSE_KEY_DEV`: API Key / token for Bob (Developer)
- `MUSE_KEY_QA`: API Key / token for Charlie (Reviewer / QA)

## Run Locally
```bash
npm install
npm start
```
Open `http://localhost:3000` in your browser.
