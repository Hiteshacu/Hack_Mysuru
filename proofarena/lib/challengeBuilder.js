// Builds company-authored challenges. Used when no AI key is set, and to fill
// any field the AI leaves out, so the builder always works offline.

export const GENERIC_MUTATIONS = [
  { id: 'gt-to-gte', find: '(\\w|\\))\\s>\\s(?!=)', replace: '$1 >= ', describe: 'Changes a > comparison to >=' },
  { id: 'lt-to-lte', find: '(\\w|\\))\\s<\\s(?!=)', replace: '$1 <= ', describe: 'Changes a < comparison to <=' },
  { id: 'eq-to-neq', find: '\\s===\\s', replace: ' !== ', describe: 'Flips an === check to !==' },
];

export const REVIEW_TRACK_EVALUATION = [
  { label: 'Code review', detail: 'AI draft + your engineer confirms' },
  { label: 'Mutation probe', detail: 'A planted bug checks if their tests notice' },
  { label: 'Docs & claims', detail: 'README claims are checked against the code' },
  { label: 'Viva', detail: 'Questions generated from their own code' },
];

const SKILL_REQUIREMENTS = {
  'Node.js': 'Build the service in Node.js 20+ with a clear folder structure (routes, services, data)',
  'REST APIs': 'Expose REST endpoints with correct status codes (200/201, 400, 404, 409) and JSON errors',
  Validation: 'Validate every input and return 400 with a helpful message for bad requests',
  Testing: 'Write your own automated tests in tests/ using node:test, including edge cases',
  SQL: 'Store data in a SQL database (SQLite is fine) with a schema file and at least one index',
  React: 'Build the UI in React with reusable components and loading/error states',
  'Design for change': 'Keep business rules (like prices or limits) in one module so they are easy to change',
  Debugging: 'Log errors with enough context to debug them, without leaking internals to users',
  Security: 'Never trust client input; protect admin-only actions with a role check',
  Accessibility: 'Every control is keyboard reachable and labelled for screen readers',
  Python: 'Build the service in Python 3.11+ with a clear module structure',
  'System design': 'Explain in docs/architecture.md how the system scales to 10× traffic',
};

const STANDARD_DELIVERABLES = [
  'Source code in a GitHub repository (public or shared with the reviewer)',
  'Your own tests in tests/',
  'README.md with how to run it',
  'docs/decisions.md with at least 2 design decisions and their trade-offs',
  'ai.md saying which AI tools you used and for what',
];

const IDEAS = [
  {
    match: ['REST APIs', 'Node.js', 'Validation'],
    title: 'Chamundi Hills Shuttle',
    tagline: 'A seat booking API for weekend shuttles up Chamundi Hills',
    summary:
      'On weekends hundreds of visitors take the shuttle up Chamundi Hills. Build the backend that shows shuttle departures, books seats, and never sells more seats than a shuttle has.',
    requirements: [
      'GET /departures lists departures with seats left',
      'POST /bookings books seats on a departure and returns the booking with its total fare',
      'A departure can never be overbooked (409 when there are not enough seats)',
      'DELETE /bookings/:id cancels a booking and frees the seats',
    ],
  },
  {
    match: ['React', 'Accessibility'],
    title: 'Mysuru Bus Tracker',
    tagline: 'A mobile-first page showing live city bus arrivals at a stop',
    summary:
      'Commuters at Mysuru city bus stops want to know when the next bus arrives. Build a mobile-first page that lists arrivals for a stop, updates every 30 seconds, and works on slow connections.',
    requirements: [
      'Search for a bus stop by name and see its next 5 arrivals',
      'Arrivals refresh every 30 seconds without reloading the page',
      'Show a clear message when the data is loading, stale or unavailable',
      'Save favourite stops on the device',
    ],
  },
  {
    match: ['SQL', 'Python'],
    title: 'Silk Weaver Inventory',
    tagline: 'Stock and order tracking for a Mysore silk co-operative',
    summary:
      'A Mysore silk co-operative tracks sarees by weaver, colour and stock in a notebook. Build a service that records stock, takes orders and stops them from selling sarees they do not have.',
    requirements: [
      'Add sarees with weaver, colour, price and quantity',
      'Place an order that reduces stock; reject orders larger than the stock',
      'List low-stock items (fewer than 3 left)',
      'Show monthly sales per weaver',
    ],
  },
  {
    match: [],
    title: 'Dasara Volunteer Desk',
    tagline: 'A shift sign-up service for Dasara festival volunteers',
    summary:
      'Hundreds of volunteers help during Dasara. Build a service where volunteers sign up for shifts at venues, where each shift has a limit, and nobody can sign up for two shifts at the same time.',
    requirements: [
      'List shifts with venue, time and places left',
      'Sign a volunteer up for a shift; reject it when the shift is full',
      'Reject a sign-up that overlaps another shift the volunteer already has',
      'Cancel a sign-up and free the place',
    ],
  },
];

function skillRequirements(skills) {
  return skills.map((s) => SKILL_REQUIREMENTS[s]).filter(Boolean);
}

function sentences(text) {
  return (text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length > 12);
}

function scopeFor(skills) {
  return {
    in: ['Everything listed under requirements', 'Your own tests and docs', ...(skills.includes('React') ? ['The UI on mobile and desktop'] : ['The API and its error handling'])],
    out: ['Payments and real user accounts', 'Production deployment (optional, not scored)'],
  };
}

// Turns a company's rough statement into a structured challenge without AI.
export function refineWithoutAi({ title, statement, skills = [], difficulty = 'Easy', hours = 4 }) {
  const parts = sentences(statement);
  const summary = parts.slice(0, 2).join(' ') || statement?.trim() || '';
  const featureReqs = parts.slice(2).map((s) => s.replace(/\.$/, ''));
  return {
    title: title?.trim() || 'Untitled challenge',
    tagline: parts[0]?.replace(/\.$/, '') || 'A company challenge',
    summary,
    requirements: [...featureReqs, ...skillRequirements(skills)].slice(0, 8),
    deliverables: STANDARD_DELIVERABLES,
    scope: scopeFor(skills),
    skills,
    difficulty,
    estimatedHours: Number(hours) || 4,
  };
}

// Picks a starter idea that matches the chosen skills, without AI.
export function generateWithoutAi({ role, skills = [], difficulty = 'Easy', hours = 4, theme }) {
  const idea = IDEAS.find((i) => i.match.length && i.match.some((m) => skills.includes(m))) || IDEAS[IDEAS.length - 1];
  return {
    title: idea.title,
    tagline: idea.tagline,
    summary: `${idea.summary}${theme ? ` Theme: ${theme}.` : ''}${role ? ` This challenge screens for a ${role}.` : ''}`,
    requirements: [...idea.requirements, ...skillRequirements(skills)].slice(0, 8),
    deliverables: STANDARD_DELIVERABLES,
    scope: scopeFor(skills),
    skills,
    difficulty,
    estimatedHours: Number(hours) || 4,
  };
}

// Final shape stored in the database for a company-authored challenge.
export function buildCustomChallenge(input, companyId, id) {
  const skills = (input.skills || []).filter(Boolean);
  return {
    id,
    companyId,
    title: input.title.trim(),
    tagline: (input.tagline || '').trim(),
    summary: (input.summary || '').trim(),
    requirements: (input.requirements || []).map((r) => r.trim()).filter(Boolean),
    deliverables: (input.deliverables?.length ? input.deliverables : STANDARD_DELIVERABLES).map((r) => r.trim()).filter(Boolean),
    scope: input.scope || scopeFor(skills),
    rules: [
      'AI tools are allowed. Say what you used in ai.md.',
      'Build it yourself: the viva asks about your own code.',
      `About ${Number(input.estimatedHours) || 4} hours of work.`,
      'Your code stays yours. Companies only see your proof.',
    ],
    skills,
    difficulty: input.difficulty || 'Easy',
    estimatedHours: Number(input.estimatedHours) || 4,
    stack: input.stack || 'Any language. Tests must run with node:test for the automatic checks.',
    contract: [],
    evaluation: REVIEW_TRACK_EVALUATION,
    track: 'review',
    verified: false,
    aiAssist: input.aiAssist || 'manual',
    mutations: GENERIC_MUTATIONS,
    missions: [{ id: 'viva', level: 1, title: 'Viva', kind: 'Explain your code', minutes: 10, xp: 150 }],
    createdAt: new Date().toISOString(),
  };
}
