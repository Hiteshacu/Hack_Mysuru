const http = require('node:http');

// ProofArena contract: export createServer(). Each call must start with fresh seed data.
function createServer() {
  return http.createServer((req, res) => {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not implemented yet' }));
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`Palace Pass API on http://localhost:${port}`));
}
