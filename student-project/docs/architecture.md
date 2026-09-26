# Architecture

```
HTTP request
   │
   ▼
routes.js            parse URL + JSON, map errors to status codes
   │
   ▼
bookingService.js    rules: slot exists, capacity, create/cancel booking
   │        │
   │        ▼
   │     pricing.js  ticket price rules
   ▼
store.js             in-memory Maps (slots, bookings)
```

- **routes.js** knows about HTTP, nothing about booking rules.
- **bookingService.js** knows the rules, nothing about HTTP.
- **pricing.js** is the only place that knows prices.
- Errors are thrown as `AppError(status, message)` and turned into JSON by `routes.js`.
