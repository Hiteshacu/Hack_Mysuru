# Palace Pass · ProofArena challenge template

> Push this folder to GitHub and mark it as a **Template repository** (Settings → Template repository).
> Students click **Use this template** to start.

## The challenge

During Dasara, lakhs of visitors come to Mysuru Palace. Build the backend that lets visitors see
entry slots, book tickets and cancel bookings, without ever selling more tickets than a slot holds.

### Requirements

- `GET /slots` lists every slot with `capacity` and `available` seats
- `POST /bookings` with `{ slotId, visitorName, tickets }` returns the booking with `total` (₹100 per ticket)
- A slot can never be overbooked (`409`)
- Invalid requests return `400` with `{ "error": "..." }`
- `GET /bookings/:id` returns a booking, `DELETE /bookings/:id` cancels it and frees the seats
- Your own tests in `tests/`, plus `docs/architecture.md`, `docs/decisions.md` and `ai.md`

### Contract (so the hidden tests can run your code)

- `src/server.js` exports `createServer()` returning a Node `http.Server` that is **not** listening yet
- Every `createServer()` call starts with fresh seed data:
  `DASARA-1000` (40 seats), `DASARA-1400` (40 seats), `LIGHTS-1900` (60 seats)

## What happens after you submit

1. **Code review**: 12 hidden tests, a README-claims check, a mutation probe, and an AI review that a company engineer confirms.
2. **Live Round**: missions inside a copy of your own project, in a browser VS Code: Bug Hunt → Customer Complaint → Boss: Plot Twist → Viva.

Use any editor and any AI tool. Say what you used in `ai.md`.
