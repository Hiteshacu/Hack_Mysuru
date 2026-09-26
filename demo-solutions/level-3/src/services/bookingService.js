const { AppError } = require('../errors');
const { calculatePrice } = require('./pricing');

const MAX_PEOPLE = 10;

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

  // Old apps send { tickets }: treat those as adult tickets.
  function bookTickets({ slotId, visitorName, tickets, adults = tickets, children = 0 }) {
    if (!visitorName) {
      throw new AppError(400, 'visitorName is required');
    }
    if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 1 || children < 0) {
      throw new AppError(400, 'A booking needs at least 1 adult, and counts must be whole numbers');
    }
    const people = adults + children;
    if (people > MAX_PEOPLE) {
      throw new AppError(400, `At most ${MAX_PEOPLE} people per booking`);
    }
    const slot = store.slots.get(slotId);
    if (!slot) {
      throw new AppError(404, `Slot ${slotId} not found`);
    }
    if (slot.booked + people > slot.capacity) {
      throw new AppError(409, 'Not enough seats left in this slot');
    }

    slot.booked += people;
    const booking = {
      id: `PP-${store.nextId++}`,
      slotId,
      visitorName,
      adults,
      children,
      tickets: people,
      total: calculatePrice({ adults, children }),
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
