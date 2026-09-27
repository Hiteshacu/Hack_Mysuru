// Shared helper for ProofArena challenge tests.
// PA_WORKSPACE points at the student's project folder being graded.
// Inside the Arena this file is copied to tests/, so it falls back to the project root.
const path = require('node:path');

const workspace = process.env.PA_WORKSPACE || path.join(__dirname, '..');

function loadServer() {
  return require(path.join(workspace, 'src', 'server.js'));
}

async function start() {
  const { createServer } = loadServer();
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { base, close };
}

async function book(base, body) {
  const res = await fetch(`${base}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

async function slot(base, id) {
  const res = await fetch(`${base}/slots`);
  const slots = await res.json();
  return slots.find((s) => s.id === id);
}

// Runs fn with a fresh server and always closes it.
async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

module.exports = { start, book, slot, withApp };
