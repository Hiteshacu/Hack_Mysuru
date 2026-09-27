# ProofArena platform

Next.js 16 app with the Company and Student dashboards, the Phase 1 review engine and the Phase 2 Live Round.
See [../README.md](../README.md) for the idea, the demo script and the scoring rules.

```bash
npm install
npm run dev          # http://localhost:3000
npm run smoke        # full rehearsal through the API (resets demo data)
npm run autoplay -- bug-hunt | fix-review | plot-twist
```

| Path | What it is |
|---|---|
| `lib/review.js` | Phase 1 pipeline: fetch → contract → hidden tests → own tests → docs & claims → mutation probe → AI draft |
| `lib/reviewRules.js` | Rule-based review comments and README claim checks |
| `lib/ai.js` | Optional AI: Groq (`GROQ_API_KEY`, free) or Claude (`ANTHROPIC_API_KEY`); drafts only, never scores |
| `lib/missions.js` | Live Round: start a workspace, plant the mission, run, save, hint, grade on a clean copy |
| `lib/runner.js` | Runs `node:test` files and parses the results |
| `lib/scoring.js` | Verified Score, skills, XP levels and badges |
| `challenges/palace-pass/` | The challenge: spec, mutations, missions, hidden and mission tests |
| `data/db.json` | Demo data (created on first run, reset from the home page) |
| `.workspaces/` | Per-submission copies and per-mission workspaces |
