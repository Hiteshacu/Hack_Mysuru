const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../src/server');

async function start() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { base, close };
}

function book(base, body) {
  return fetch(`${base}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('lists all Dasara slots', async () => {
  const app = await start();
  const res = await fetch(`${app.base}/slots`);
  const slots = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(slots.length, 3);
  await app.close();
});

test('books 2 tickets for ₹200', async () => {
  const app = await start();
  const res = await book(app.base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: 2 });
  const booking = await res.json();
  assert.strictEqual(res.status, 201);
  assert.strictEqual(booking.total, 200);
  await app.close();
});

test('rejects an unknown slot', async () => {
  const app = await start();
  const res = await book(app.base, { slotId: 'NOPE', visitorName: 'Asha', tickets: 1 });
  assert.strictEqual(res.status, 404);
  await app.close();
});

test('rejects overbooking', async () => {
  const app = await start();
  for (let i = 0; i < 3; i++) {
    await book(app.base, { slotId: 'DASARA-1000', visitorName: 'School trip', tickets: 10 });
  }
  await book(app.base, { slotId: 'DASARA-1000', visitorName: 'Family', tickets: 9 });
  const res = await book(app.base, { slotId: 'DASARA-1000', visitorName: 'Late family', tickets: 2 });
  assert.strictEqual(res.status, 409);
  await app.close();
});
