// Level 1 · Bug Hunt. Visible to the student inside the Arena.
// Customer report: "The 10:00 AM slot showed 2 seats left, but my 2 tickets were refused as sold out."
const test = require('node:test');
const assert = require('node:assert');
const { book, slot, withApp } = require('./_helper');

test('the last 2 seats of a slot can be booked', () =>
  withApp(async ({ base }) => {
    await book(base, { slotId: 'DASARA-1000', visitorName: 'School trip', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Family A', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Family B', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Family C', tickets: 8 });
    const before = await slot(base, 'DASARA-1000');
    assert.strictEqual(before.available, 2, 'setup: 2 seats should be left');

    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Priya', tickets: 2 });
    assert.strictEqual(r.status, 201, `expected 201 Created, got ${r.status} (${r.body && r.body.error})`);
  }));

test('one seat too many is still refused', () =>
  withApp(async ({ base }) => {
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Group', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Group', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Group', tickets: 10 });
    await book(base, { slotId: 'DASARA-1000', visitorName: 'Group', tickets: 8 });
    const r = await book(base, { slotId: 'DASARA-1000', visitorName: 'Late', tickets: 3 });
    assert.strictEqual(r.status, 409);
  }));
