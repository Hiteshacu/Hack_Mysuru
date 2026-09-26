const http = require('node:http');
const { createStore } = require('./store');
const { createBookingService } = require('./services/bookingService');
const { handleRequest } = require('./routes');

// Every call starts with fresh seed data (the ProofArena contract needs this for testing).
function createServer() {
  const store = createStore();
  const service = createBookingService(store);
  return http.createServer((req, res) => handleRequest(req, res, service));
}

module.exports = { createServer };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => {
    console.log(`Palace Pass API running on http://localhost:${port}`);
  });
}
