# Gemini 2D Virtual Office

Lightweight 2D office for a Project Manager, Developer, and Reviewer that exchange work through a shared task bus. Built for Botkeep and low-memory deployments.

## Botkeep environment

Set `GEMINI_API_KEY` to a key created in Google AI Studio. Optional per-agent keys allow separate Google Cloud projects:

```text
GEMINI_API_KEY=AIza...
GEMINI_KEY_PM=AIza...
GEMINI_KEY_DEV=AIza...
GEMINI_KEY_QA=AIza...
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

The previous Muse API integration is removed. Keys are read only on the server and are never sent to the browser. This uses the official Gemini API; it does not automate Gemini web cookies or Google account sessions.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.
