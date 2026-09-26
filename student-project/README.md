# Palace Pass API

Book entry tickets for Mysuru Palace time slots during Dasara.
Submission for the ProofArena challenge **"Palace Pass"** (Backend Intern, Kaveri Softworks).

## Features

- List Dasara entry slots with seats left
- Book tickets for a slot (₹100 per ticket)
- Stops a slot from being overbooked
- Look up and cancel a booking
- Bookings are saved to a JSON file so they survive server restarts

## Run

```bash
npm start        # http://localhost:3000
npm test         # runs my tests with node:test
```

No dependencies. Needs Node.js 20+.

## API

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/slots` | | List of slots with `available` seats |
| POST | `/bookings` | `{ slotId, visitorName, tickets }` | `201` booking with `total` |
| GET | `/bookings/:id` | | The booking |
| DELETE | `/bookings/:id` | | `{ cancelled: true }` and seats are freed |

Errors return `{ "error": "..." }` with `400`, `404` or `409`.

## Project layout

```
src/
  server.js                 creates the HTTP server
  routes.js                 URL → service call, JSON in/out
  services/bookingService.js  booking rules
  services/pricing.js       all price rules in one place
  store.js                  in-memory data
  data/slots.js             seed slots
tests/booking.test.js
docs/architecture.md, docs/decisions.md
```

See [docs/decisions.md](docs/decisions.md) for my design decisions and [ai.md](ai.md) for how I used AI.
