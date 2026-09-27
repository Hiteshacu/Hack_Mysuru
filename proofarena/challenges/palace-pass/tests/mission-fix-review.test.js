// Level 2 · Customer Complaint. Visible to the student inside the Arena.
// Built from the confirmed review comment: "tickets is never validated".
const test = require('node:test');
const assert = require('node:assert');
const { book, slot, withApp } = require('./_helper');

test('0 tickets is rejected with 400', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: 0 });
    assert.strictEqual(r.status, 400);
  }));

test('-3 tickets is rejected with 400 and seats do not change', () =>
  withApp(async ({ base }) => {
    const before = await slot(base, 'DASARA-1000');
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Trickster', tickets: -3 });
    const after = await slot(base, 'DASARA-1000');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(after.available, before.available);
  }));

test('more than 10 tickets in one booking is rejected with 400', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'LIGHTS-1900', visitorName: 'Tour', tickets: 11 });
    assert.strictEqual(r.status, 400);
  }));

test('tickets must be a whole number', () =>
  withApp(async ({ base }) => {
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Asha', tickets: '2abc' });
    assert.strictEqual(r.status, 400);
  }));
