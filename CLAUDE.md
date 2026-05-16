# Kashmir Shaivism App

A single-page web app that lets users ask questions about Kashmir Shaivism and receive answers in the voice of a realized teacher. Built for mobile-first use.

## What it does

- Presents a cinematic welcome overlay (Kailash mountain background, Shiva silhouette, incense smoke animation, tanpura drone audio) before the main app loads
- Accepts free-text questions about Kashmir Shaivism
- Retrieves relevant passages from a curated knowledge base, then calls the Gemini API to generate short, teacher-voiced answers
- Caches answers in `cache.json` to avoid redundant API calls
- Suggests follow-up questions and insight cards

## Tech stack

- **Frontend**: Vanilla HTML/CSS/JS — single file (`index.html`), no framework
- **Backend**: Node.js + Express (`server.js`) served as a Vercel serverless function
- **AI**: Google Gemini (`gemini-2.0-flash`) via `@google/generative-ai`
- **Deployment**: Vercel (`vercel.json`) — static frontend + Node serverless `/ask` route
- **Audio**: Web Audio API (tanpura drone synthesized from oscillators, no audio files)

## Key files

| File | Purpose |
|---|---|
| `index.html` | Entire frontend — welcome overlay, UI, particles, Shiva SVG, all CSS and JS |
| `server.js` | Express API — keyword-scored RAG over knowledge base, Gemini call, response cache |
| `system-prompt.txt` | Persona and style instructions sent to Gemini on every request |
| `knowledge-base.txt` | Curated Kashmir Shaivism texts used as retrieval context |
| `cache.json` | In-process answer cache (read-only on Vercel, persistent locally) |
| `vercel.json` | Deployment config — routes `/ask` to serverless function, serves `index.html` statically |

## Local dev

```bash
cp .env.example .env  # add GEMINI_API_KEY
npm start             # runs on http://localhost:3000
```

## Environment variables

- `GEMINI_API_KEY` — required, Google AI Studio key

## Notes

- The welcome overlay uses `sessionStorage` (`ks_welcomed`) to show only once per session. Clear it in the console to re-trigger: `sessionStorage.removeItem('ks_welcomed')`
- RAG is keyword-scored (no embeddings) — `extractRelevantContext()` in `server.js` scores knowledge base chunks against query keywords and passes the top-scoring chunks to Gemini
