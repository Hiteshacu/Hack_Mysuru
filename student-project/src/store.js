const { seedSlots } = require('./data/slots');

// In-memory store. See docs/decisions.md (Decision 1) for why.
function createStore() {
  const slots = new Map();
  for (const slot of seedSlots()) {
    slots.set(slot.id, { ...slot, booked: 0 });
  }
  return {
    slots,
    bookings: new Map(),
    nextId: 1,
  };
}

module.exports = { createStore };
