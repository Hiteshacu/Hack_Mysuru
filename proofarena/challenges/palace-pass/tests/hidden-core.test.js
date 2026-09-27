// HIDDEN official tests for Palace Pass. Students never see this file.
const test = require('node:test');
const assert = require('node:assert');
const { book, slot, withApp } = require('./_helper');

test('GET /slots lists slots with seats available', () =>
  withApp(async ({ base }) => {
    const res = await fetch(`${base}/slots`);
    const slots = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(slots.length >= 1);
    for (const s of slots) {
      assert.ok(s.id && typeof s.capacity === 'number' && typeof s.available === 'number');
    }
  }));

test('booking 2 tickets costs ₹200', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: 2 });
    assert.strictEqual(r.status, 201);
    assert.ok(r.body.id);
    assert.strictEqual(r.body.total, 200);
  }));

test('booking reduces available seats', () =>
  withApp(async ({ base }) => {
    const before = await slot(base, 'DASARA-1000');
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Ravi', tickets: 3 });
    const after = await slot(base, 'DASARA-1000');
    assert.strictEqual(after.available, before.available - 3);
  }));

test('unknown slot returns 404', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'NOPE', visitorName: 'Asha', tickets: 1 });
    assert.strictEqual(r.status, 404);
  }));

test('overbooking returns 409', () =>
  withApp(async ({ base }) => {
    for (let i = 0; i < 3; i++) await book(base, { slotId: 'DASARA-1000', visitorName: 'Tour', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Tour', tickets: 9 });
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Late family', tickets: 2 });
    assert.strictEqual(r.status, 409);
  }));

test('booking the exact last seats is allowed', () =>
  withApp(async ({ base }) => {
    for (let i = 0; i < 4; i++) {
      await book(base, { slotId: 'DASARA-1000', visitorName: `Group ${i}`, tickets: 10 });
    }
    const s = await slot(base, 'DASARA-1000');
    assert.strictEqual(s.available, 0);
  }));

test('missing visitorName returns 400', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', tickets: 1 });
    assert.strictEqual(r.status, 400);
  }));

test('zero tickets returns 400', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: 0 });
    assert.strictEqual(r.status, 400);
  }));

test('negative tickets returns 400', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: -3 });
    assert.strictEqual(r.status, 400);
  }));

test('more than 10 tickets in one booking returns 400', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'LIGHTS-1900', visitorName: 'Tour', tickets: 11 });
    assert.strictEqual(r.status, 400);
  }));

test('cancelling frees the seats', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1400', visitorName: 'Meena', tickets: 4 });
    const del = await fetch(`${base}/bookings/${r.body.id}`, { method: 'DELETE' });
    assert.strictEqual(del.status, 200);
    const s = await slot(base, 'DASARA-1400');
    assert.strictEqual(s.available, s.capacity);
  }));

test('cancelling an unknown booking returns 404', () =>
  withApp(async ({ base }) => {
    const del = await fetch(`${base}/bookings/PP-999`, { method: 'DELETE' });
    assert.strictEqual(del.status, 404);
  }));
