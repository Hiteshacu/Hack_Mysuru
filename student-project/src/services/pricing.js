// All pricing rules live here so a price change touches one file.
const TICKET_PRICE = 100;

function calculatePrice(tickets) {
  return tickets * TICKET_PRICE;
}

module.exports = { calculatePrice, TICKET_PRICE };
