const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../src/server');

test('GET /slots responds', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/slots`);
  assert.ok(res.status);
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});
