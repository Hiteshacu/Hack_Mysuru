# Decision Log

## Decision 1: In-memory store instead of a database

**Choice:** Keep slots and bookings in JavaScript `Map`s.
**Why:** The challenge is about booking rules, not storage. A database would add setup time for reviewers.
**Trade-off:** Data is lost on restart. For production I would move to Postgres and use a row lock on the slot while booking.

## Decision 2: Pricing in its own module

**Choice:** `services/pricing.js` owns every price rule.
**Why:** Ticket prices change often during Dasara (festival days, child tickets, group offers). Keeping pricing in one file means a price change doesn't touch booking or routing code.
**Trade-off:** One more file for a rule that is currently a single multiplication.

## Decision 3: Plain `node:http` instead of Express

**Choice:** Built-in `http` module and `node:test`.
**Why:** Zero dependencies, so `npm test` works instantly on any machine.
**Trade-off:** I wrote my own small router and JSON body parser.

## Scaling risk

Two people booking the last seats at the same moment is safe here only because Node runs one request at a time in memory. With a real database and several servers, the capacity check and the update must happen in one transaction.
