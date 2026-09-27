// Curated, pre-verified quest content. Used when no AI key is set, and whenever an
// AI-generated coding task fails verification (its reference solution must pass its tests).

const MCQ = {
  'Node.js': [
    { q: 'What does `await` do inside an async function in Node.js?', options: ['Blocks the whole process until the promise settles', 'Pauses only that function until the promise settles', 'Converts the function to a callback', 'Runs the promise on a new thread'], answer: 1, explain: 'Only the async function pauses; the event loop keeps serving other work.' },
    { q: 'Which module is built into Node.js for creating an HTTP server?', options: ['express', 'node:http', 'axios', 'node:net-http'], answer: 1, explain: 'node:http ships with Node; Express is a third-party library built on top of it.' },
    { q: 'What is `process.env` used for?', options: ['Reading environment variables', 'Listing running processes', 'Changing the Node version', 'Reading package.json'], answer: 0, explain: 'Configuration like PORT or API keys comes from environment variables.' },
  ],
  'REST APIs': [
    { q: 'Which status code fits a successful POST that created a resource?', options: ['200 OK', '201 Created', '204 No Content', '302 Found'], answer: 1, explain: '201 tells the client a new resource was created.' },
    { q: 'A client sends invalid JSON in the body. Which status code is best?', options: ['400 Bad Request', '401 Unauthorized', '404 Not Found', '500 Internal Server Error'], answer: 0, explain: 'The client made a malformed request, so 400.' },
    { q: 'Which HTTP method should be idempotent and replace a resource?', options: ['POST', 'PUT', 'PATCH', 'CONNECT'], answer: 1, explain: 'PUT replaces the resource and repeating it has the same effect.' },
  ],
  Testing: [
    { q: 'What does a unit test check?', options: ['The whole system through the UI', 'One small piece of code in isolation', 'Server load under traffic', 'Code formatting'], answer: 1, explain: 'Unit tests isolate a single function or module.' },
    { q: 'Why test edge cases like 0, -1 and empty input?', options: ['They make tests run faster', 'Bugs cluster at boundaries', 'Linters require it', 'They improve code coverage only'], answer: 1, explain: 'Off-by-one and validation bugs live at the boundaries.' },
  ],
  Validation: [
    { q: 'Which check rejects "2abc", 2.5 and undefined as a ticket count?', options: ['typeof x === "number"', 'Number.isInteger(x)', 'x > 0', 'parseInt(x)'], answer: 1, explain: 'Number.isInteger only accepts whole numbers of type number.' },
  ],
  SQL: [
    { q: 'Which clause filters rows AFTER grouping?', options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], answer: 1, explain: 'HAVING filters groups; WHERE filters rows before grouping.' },
    { q: 'What does an index on a column mainly speed up?', options: ['Inserts', 'Lookups and filters on that column', 'Backups', 'Schema changes'], answer: 1, explain: 'Indexes make reads on the column fast, at some write cost.' },
  ],
  React: [
    { q: 'Why does React need a `key` on list items?', options: ['For CSS styling', 'To identify items between renders', 'To make items clickable', 'To sort the list'], answer: 1, explain: 'Keys let React match old and new items efficiently.' },
    { q: 'Which hook runs code after render, e.g. to fetch data?', options: ['useMemo', 'useEffect', 'useRef', 'useId'], answer: 1, explain: 'useEffect runs side effects after the render commits.' },
  ],
  Python: [
    { q: 'What does `len({1, 1, 2})` return in Python?', options: ['3', '2', '1', 'Error'], answer: 1, explain: 'A set keeps unique values: {1, 2}.' },
  ],
  JavaScript: [
    { q: 'What is `[1, 2, 3].map(x => x * 2)`?', options: ['[2, 4, 6]', '[1, 2, 3, 2]', '12', 'undefined'], answer: 0, explain: 'map returns a new array with each value transformed.' },
    { q: 'What does `===` check that `==` does not?', options: ['Only the value', 'Value and type', 'Only the type', 'Memory address only'], answer: 1, explain: '=== is strict equality: no type conversion.' },
    { q: 'Which keyword declares a block-scoped variable that can be reassigned?', options: ['var', 'let', 'const', 'static'], answer: 1, explain: 'let is block scoped and reassignable; const cannot be reassigned.' },
  ],
  'Data Structures': [
    { q: 'Average time to look up a key in a hash map?', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], answer: 0, explain: 'Hash maps give constant-time lookups on average.' },
    { q: 'Which structure gives first-in, first-out order?', options: ['Stack', 'Queue', 'Tree', 'Heap'], answer: 1, explain: 'A queue serves items in the order they arrived.' },
  ],
  Git: [
    { q: 'Which command creates a new branch and switches to it?', options: ['git branch -d x', 'git switch -c x', 'git merge x', 'git reset x'], answer: 1, explain: 'git switch -c (or checkout -b) creates and switches.' },
  ],
  Security: [
    { q: 'How should passwords be stored?', options: ['Plain text', 'Base64 encoded', 'Hashed with a slow salted hash like bcrypt', 'Encrypted with the same key for everyone'], answer: 2, explain: 'Slow salted hashes resist brute force if the database leaks.' },
  ],
};

const ARROWS = {
  'Node.js': [
    { prompt: 'Built-in module for an HTTP server', choices: ['node:http', 'lodash', 'react'], answer: 0 },
    { prompt: 'Runs Node code without blocking', choices: ['async/await', 'while(true)', 'alert()'], answer: 0 },
  ],
  'REST APIs': [
    { prompt: 'Status for "resource created"', choices: ['201', '500', '301'], answer: 0 },
    { prompt: 'Status for "not found"', choices: ['200', '404', '418'], answer: 1 },
    { prompt: 'Method to delete a booking', choices: ['GET', 'DELETE', 'HEAD'], answer: 1 },
  ],
  Testing: [
    { prompt: 'Tests one function in isolation', choices: ['Load test', 'Unit test', 'Smoke alarm'], answer: 1 },
  ],
  Validation: [{ prompt: 'Reject 2.5 and "2abc"', choices: ['Number.isInteger', 'toString', 'Math.random'], answer: 0 }],
  SQL: [{ prompt: 'Filter groups after GROUP BY', choices: ['WHERE', 'HAVING', 'JOIN'], answer: 1 }],
  React: [{ prompt: 'Hook for side effects', choices: ['useEffect', 'useKey', 'useLoop'], answer: 0 }],
  Python: [{ prompt: 'Unique values container', choices: ['list', 'set', 'str'], answer: 1 }],
  JavaScript: [
    { prompt: 'Strict equality operator', choices: ['==', '===', '=>'], answer: 1 },
    { prompt: 'Block-scoped, reassignable', choices: ['let', 'var', 'const'], answer: 0 },
  ],
  'Data Structures': [
    { prompt: 'O(1) average lookup', choices: ['Hash map', 'Linked list', 'Array scan'], answer: 0 },
    { prompt: 'Last in, first out', choices: ['Queue', 'Stack', 'Graph'], answer: 1 },
  ],
  Git: [{ prompt: 'Save staged changes', choices: ['git commit', 'git clone', 'git blame'], answer: 0 }],
  Security: [{ prompt: 'Safe password storage', choices: ['bcrypt', 'plain text', 'base64'], answer: 0 }],
};

export const DEBUG_TASKS = [
  {
    title: 'The cart total is always short',
    story: 'Customers say their cart total is missing the last item. Finance is losing money on every order.',
    functionName: 'cartTotal',
    buggyCode: `// Returns the total price of all items: sum of price * qty
function cartTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length - 1; i++) {
    total += items[i].price * items[i].qty;
  }
  return total;
}`,
    reference: `function cartTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].qty;
  }
  return total;
}`,
    tests: [
      { args: [[{ price: 100, qty: 2 }, { price: 50, qty: 1 }]], expected: 250 },
      { args: [[{ price: 10, qty: 3 }]], expected: 30 },
      { args: [[]], expected: 0 },
    ],
    hidden: [
      { args: [[{ price: 5, qty: 1 }, { price: 5, qty: 1 }, { price: 5, qty: 1 }]], expected: 15 },
      { args: [[{ price: 99, qty: 0 }, { price: 1, qty: 7 }]], expected: 7 },
      { args: [[{ price: 250, qty: 4 }]], expected: 1000 },
    ],
    hint: 'Look closely at where the loop stops.',
    bugType: 'Off-by-one',
  },
  {
    title: 'Discount makes prices negative',
    story: 'A 150% coupon made a ₹200 order cost ₹-100. Discounts must be capped at 100% and never go below 0.',
    functionName: 'applyDiscount',
    buggyCode: `// price: number, percent: 0-100. Returns the discounted price, never below 0.
function applyDiscount(price, percent) {
  return price - price * percent / 100;
}`,
    reference: `function applyDiscount(price, percent) {
  const p = Math.min(Math.max(percent, 0), 100);
  return Math.max(0, price - price * p / 100);
}`,
    tests: [
      { args: [200, 10], expected: 180 },
      { args: [200, 150], expected: 0 },
      { args: [200, -5], expected: 200 },
      { args: [0, 50], expected: 0 },
    ],
    hidden: [
      { args: [500, 100], expected: 0 },
      { args: [80, 25], expected: 60 },
      { args: [1000, 0], expected: 1000 },
    ],
    hint: 'Clamp the percent between 0 and 100 before using it.',
    bugType: 'Edge case',
  },
  {
    title: 'Palindrome checker says "Madam" is not a palindrome',
    story: 'The word game rejects valid palindromes that have capital letters or spaces.',
    functionName: 'isPalindrome',
    buggyCode: `// Ignores case and spaces. "Never odd or even" -> true
function isPalindrome(text) {
  const reversed = text.split('').reverse().join('');
  return text === reversed;
}`,
    reference: `function isPalindrome(text) {
  const clean = text.toLowerCase().replace(/\\s+/g, '');
  return clean === clean.split('').reverse().join('');
}`,
    tests: [
      { args: ['Madam'], expected: true },
      { args: ['Never odd or even'], expected: true },
      { args: ['hello'], expected: false },
    ],
    hidden: [
      { args: ['A man a plan a canal Panama'], expected: true },
      { args: [''], expected: true },
      { args: ['Mysuru'], expected: false },
    ],
    hint: 'Normalise the text first: lower case, no spaces.',
    bugType: 'Normalize input',
  },
];

export const DSA_TASKS = [
  {
    title: 'Two Sum',
    statement: 'Given an array of numbers `nums` and a number `target`, return the indices `[i, j]` (i < j) of the two numbers that add up to `target`. Exactly one answer exists. Aim for O(n) with a hash map.',
    functionName: 'twoSum',
    starterCode: `function twoSum(nums, target) {
  // your code here
}`,
    reference: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
  return [];
}`,
    examples: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
    ],
    hidden: [
      { args: [[3, 3], 6], expected: [0, 1] },
      { args: [[1, 5, 9, 14, 20], 34], expected: [3, 4] },
      { args: [[-4, 8, 1, 12], -3], expected: [0, 2] },
      { args: [[0, 4, 3, 0], 0], expected: [0, 3] },
      { args: [[5, 75, 25], 100], expected: [1, 2] },
    ],
  },
  {
    title: 'Valid Brackets',
    statement: 'Given a string of brackets `()[]{}`, return `true` if every bracket is closed by the same type in the right order. Use a stack.',
    functionName: 'isValid',
    starterCode: `function isValid(s) {
  // your code here
}`,
    reference: `function isValid(s) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}`,
    examples: [
      { args: ['()[]{}'], expected: true },
      { args: ['(]'], expected: false },
    ],
    hidden: [
      { args: ['{[()()]}'], expected: true },
      { args: ['(('], expected: false },
      { args: [''], expected: true },
      { args: ['([)]'], expected: false },
      { args: [')('], expected: false },
      { args: ['((([[{}]])))'], expected: true },
    ],
  },
  {
    title: 'Best Dasara Crowd Window',
    statement: 'Given an array `visitors` of hourly visitor changes (can be negative), return the largest sum of any non-empty run of consecutive hours (maximum subarray). Aim for O(n).',
    functionName: 'maxWindow',
    starterCode: `function maxWindow(visitors) {
  // your code here
}`,
    reference: `function maxWindow(visitors) {
  let best = visitors[0], cur = visitors[0];
  for (let i = 1; i < visitors.length; i++) {
    cur = Math.max(visitors[i], cur + visitors[i]);
    best = Math.max(best, cur);
  }
  return best;
}`,
    examples: [
      { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { args: [[1]], expected: 1 },
    ],
    hidden: [
      { args: [[-3, -1, -2]], expected: -1 },
      { args: [[5, 4, -1, 7, 8]], expected: 23 },
      { args: [[2, -1, 2, -1, 2]], expected: 4 },
      { args: [[-7]], expected: -7 },
      { args: [[3, -10, 3, 3]], expected: 6 },
    ],
  },
];

function pick(list, n, seed = 0) {
  const out = [];
  const pool = [...list];
  let s = seed + 7;
  while (out.length < n && pool.length) {
    s = (s * 9301 + 49297) % 233280;
    out.push(pool.splice(s % pool.length, 1)[0]);
  }
  return out;
}

// Builds a full quest from the bank, favouring the chosen skills.
export function questFromBank(skills, seed = Date.now() % 1000) {
  const skillMcq = skills.flatMap((s) => MCQ[s] || []);
  const extraMcq = [...MCQ.JavaScript, ...MCQ['Data Structures'], ...MCQ['REST APIs'], ...MCQ.Testing];
  const mcq = [...pick(skillMcq, 5, seed), ...pick(extraMcq.filter((m) => !skillMcq.includes(m)), 5, seed)].slice(0, 5);
  const skillArrows = skills.flatMap((s) => ARROWS[s] || []);
  const extraArrows = [...ARROWS.JavaScript, ...ARROWS['Data Structures'], ...ARROWS['REST APIs']];
  const arrows = [...pick(skillArrows, 5, seed), ...pick(extraArrows.filter((a) => !skillArrows.includes(a)), 5, seed)].slice(0, 5);
  const debug = DEBUG_TASKS[seed % DEBUG_TASKS.length];
  const dsa = DSA_TASKS[(seed + 1) % DSA_TASKS.length];
  return { mcq, arrows, debug, dsa };
}
