const { AppError } = require('../errors');
const { calculatePrice } = require('./pricing');

function createBookingService(store) {
  function listSlots() {
    return [...store.slots.values()].map((slot) => ({
      id: slot.id,
      label: slot.label,
      capacity: slot.capacity,
      booked: slot.booked,
      available: slot.capacity - slot.booked,
    }));
  }

  function bookTickets({ slotId, visitorName, tickets }) {
    if (!visitorName) {
      throw new AppError(400, 'visitorName is required');
    }
    const slot = store.slots.get(slotId);
    if (!slot) {
      throw new AppError(404, `Slot ${slotId} not found`);
    }
    if (slot.booked + tickets > slot.capacity) {
      throw new AppError(409, 'Not enough seats left in this slot');
    }

    slot.booked += tickets;
    const booking = {
      id: `PP-${store.nextId++}`,
      slotId,
      visitorName,
      tickets,
      total: calculatePrice(tickets),
    };
    store.bookings.set(booking.id, booking);
    return booking;
  }

  function getBooking(id) {
    const booking = store.bookings.get(id);
    if (!booking) {
      throw new AppError(404, `Booking ${id} not found`);
    }
    return booking;
  }

  function cancelBooking(id) {
    const booking = getBooking(id);
    const slot = store.slots.get(booking.slotId);
    slot.booked -= booking.tickets;
    store.bookings.delete(id);
    return { cancelled: true, id };
  }

  return { listSlots, bookTickets, getBooking, cancelBooking };
}

module.exports = { createBookingService };
