// All pricing rules live here so a price change touches one file.
const ADULT_PRICE = 100;
const CHILD_PRICE = 50;
const GROUP_SIZE = 5;
const GROUP_DISCOUNT = 0.1;

function calculatePrice({ adults, children = 0 }) {
  const subtotal = adults * ADULT_PRICE + children * CHILD_PRICE;
  const people = adults + children;
  return people >= GROUP_SIZE ? Math.round(subtotal * (1 - GROUP_DISCOUNT)) : subtotal;
}

module.exports = { calculatePrice, ADULT_PRICE, CHILD_PRICE };
