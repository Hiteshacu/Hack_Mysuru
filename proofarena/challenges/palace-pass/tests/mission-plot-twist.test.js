// Level 3 · BOSS: Plot Twist. Visible to the student inside the Arena.
// New rule for Dasara: adults ₹100, children ₹50, groups of 5+ people get 10% off,
// at least 1 adult per booking, max 10 people per booking. Old { tickets } requests still work.
const test = require('node:test');
const assert = require('node:assert');
const { book, slot, withApp } = require('./_helper');

test('2 adults + 1 child costs ₹250', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Rao family', adults: 2, children: 1 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.total, 250);
  }));

test('group of 5 (3 adults + 2 children) gets 10% off: ₹360', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Gowda family', adults: 3, children: 2 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.total, 360);
  }));

test('children cannot book without an adult', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Kids', adults: 0, children: 3 });
    assert.strictEqual(r.status, 400);
  }));

test('children count towards slot capacity', () =>
  withApp(async ({ base }) => {
    const before = await slot(base, 'DASARA-1400');
    await book(base, { slotId: 'DASARA-1400', visitorName: 'Shetty family', adults: 2, children: 3 });
    const after = await slot(base, 'DASARA-1400');
    assert.strictEqual(after.available, before.available - 5);
  }));

test('old requests with { tickets } still work as adult tickets', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: 2 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.total, 200);
  }));

test('more than 10 people in one booking is rejected', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'LIGHTS-1900', visitorName: 'Tour', adults: 6, children: 5 });
    assert.strictEqual(r.status, 400);
  }));
