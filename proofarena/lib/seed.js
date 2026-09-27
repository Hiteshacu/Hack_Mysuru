// Demo data. Hitesh is the live student; the others are sample candidates
// so the company leaderboard isn't empty. All companies and people are fictional.

const daysAgo = (d, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000).toISOString();

function tests(names, failing = []) {
  return names.map((name) => ({ name, ok: !failing.includes(name) }));
}

const HIDDEN = [
  'GET /slots lists slots with seats available',
  'booking 2 tickets costs ₹200',
  'booking reduces available seats',
  'unknown slot returns 404',
  'overbooking returns 409',
  'booking the exact last seats is allowed',
  'missing visitorName returns 400',
  'zero tickets returns 400',
  'negative tickets returns 400',
  'more than 10 tickets in one booking returns 400',
  'cancelling frees the seats',
  'cancelling an unknown booking returns 404',
];

function hidden(failing = []) {
  const t = tests(HIDDEN, failing);
  return { passed: t.filter((x) => x.ok).length, total: t.length, tests: t };
}

function doneSteps() {
  return ['fetch', 'structure', 'hidden', 'own', 'docs', 'mutation', 'ai'].map((key) => ({ key, status: 'done' }));
}

function passedMission(id, { attempts = 1, hintsUsed = 0, durationSec, srcFilesChanged = 1, blindSpotClosed = false, changes = [] }) {
  return {
    id,
    status: 'passed',
    attempts,
    result: {
      passed: true,
      durationSec,
      hintsUsed,
      runs: attempts + 2,
      regressions: [],
      srcFilesChanged,
      blindSpotClosed,
      changes,
      events: [],
      finishedAt: daysAgo(1),
    },
  };
}

function sampleSubmission({ id, studentId, days, hiddenFailing, ownTests, docs, claims, survived, rubric, comments, missions, viva, summary }) {
  return {
    id,
    studentId,
    challengeId: 'palace-pass',
    openingId: 'op-chamundi-1',
    source: `https://github.com/${studentId}/palace-pass`,
    sourceKind: 'github',
    commit: Math.random().toString(16).slice(2, 9),
    deployUrl: '',
    sample: true,
    createdAt: daysAgo(days),
    status: missions.some((m) => m.status !== 'passed' && m.status !== 'skipped') ? 'in_arena' : 'complete',
    pipeline: doneSteps(),
    checks: {
      structure: { ok: true, files: 11, lines: 180 },
      hiddenTests: hidden(hiddenFailing),
      studentTests: { passed: ownTests, total: ownTests },
      docs,
      claims,
      mutation: { survived, file: 'src/services/bookingService.js', line: 22 },
    },
    comments,
    aiSummary: summary,
    rubric,
    reviewerNote: '',
    reviewedAt: daysAgo(days - 1),
    missions,
    viva,
  };
}

export function createSeed() {
  const companies = [
    {
      id: 'co-chamundi',
      name: 'Chamundi Cloud Labs',
      city: 'Mysuru',
      industry: 'Cloud & DevOps',
      size: '51–200',
      website: 'chamundicloud.example',
      about: 'We run hosting and CI infrastructure for Karnataka startups.',
      color: '#0E7C66',
      hr: { name: 'Arjun Menon', role: 'Head of Talent', email: 'careers@chamundicloud.example', linkedin: '', slots: ['Mon 11:00 AM', 'Tue 4:00 PM', 'Thu 6:30 PM'] },
      // Fictional demo people. Companies add real LinkedIn links in their profile.
      team: [
        { name: 'Kavya Rao', role: 'Engineering Manager', linkedin: '' },
        { name: 'Rohan Shetty', role: 'Senior Backend Engineer', linkedin: '' },
      ],
      createdAt: daysAgo(20),
    },
  ];

  const openings = [
    {
      id: 'op-chamundi-1',
      companyId: 'co-chamundi',
      title: 'Junior Backend Developer',
      type: 'Full-time',
      location: 'Mysuru · Hybrid',
      pay: '₹6–8 LPA',
      seats: 2,
      skills: ['Node.js', 'REST APIs', 'Testing'],
      challengeId: 'palace-pass',
      minScore: 70,
      description: 'Build and run APIs for our customers. You will own services end to end.',
      applyUrl: 'https://chamundicloud.example/careers/junior-backend',
      deadline: '2026-10-20',
      createdAt: daysAgo(14),
    },
  ];

  const students = [
    { id: 'hitesh', phone: '+91 90000 00001', email: 'hitesh@student.example', name: 'Hitesh', initials: 'H', college: 'NIE Mysuru', year: '3rd year · CSE', github: 'github.com/hitesh', xp: 0, badges: [], live: true, color: '#7C3AED' },
    { id: 'ananya', phone: '+91 90000 00002', email: 'ananya@student.example', name: 'Ananya Rao', initials: 'AR', college: 'SJCE Mysuru', year: '4th year · ISE', github: 'github.com/ananya-rao', xp: 1650, badges: ['first-submit', 'bug-hunter', 'blind-spot', 'twist-tamer', 'small-footprint', 'speed-runner', 'clear-thinker'], color: '#0891B2' },
    { id: 'rahul', phone: '+91 90000 00003', email: 'rahul@student.example', name: 'Rahul Kumar', initials: 'RK', college: 'VVCE Mysuru', year: '4th year · CSE', github: 'github.com/rahulk', xp: 1180, badges: ['first-submit', 'bug-hunter', 'clean-fixer', 'twist-tamer'], color: '#DB2777' },
    { id: 'meera', phone: '+91 90000 00004', email: 'meera@student.example', name: 'Meera S', initials: 'MS', college: 'GSSSIETW Mysuru', year: '3rd year · CSE', github: 'github.com/meera-s', xp: 350, badges: ['first-submit'], color: '#EA580C' },
    { id: 'arjun', phone: '+91 90000 00005', email: 'arjun@student.example', name: 'Arjun Patil', initials: 'AP', college: 'MIT Mysore', year: '4th year · CSE', github: 'github.com/arjunp', xp: 1010, badges: ['first-submit', 'bug-hunter', 'clean-fixer', 'twist-tamer'], color: '#65A30D' },
  ];

  const allDocs = { readme: true, architecture: true, decisions: true, aiDisclosure: true };

  const submissions = [
    sampleSubmission({
      id: 'sub-ananya',
      studentId: 'ananya',
      days: 6,
      hiddenFailing: [],
      ownTests: 11,
      docs: allDocs,
      claims: [],
      survived: false,
      rubric: { design: 9, code: 9, testing: 9, docs: 8 },
      summary: 'Clean layering, validation in one place, and tests cover capacity boundaries.',
      comments: [
        { id: 'c1', file: 'src/services/pricing.js', line: 3, severity: 'good', category: 'Design', title: 'Pricing isolated in one module', body: 'Price rules live in one file, so pricing changes stay small.', source: 'ai', status: 'confirmed' },
        { id: 'c2', file: 'tests/booking.test.js', line: 40, severity: 'good', category: 'Testing', title: 'Tests the exact-capacity boundary', body: 'Booking the last seat and one seat too many are both tested.', source: 'ai', status: 'confirmed' },
      ],
      missions: [
        passedMission('bug-hunt', { durationSec: 380, srcFilesChanged: 1, blindSpotClosed: true }),
        { id: 'fix-review', status: 'skipped', attempts: 0, result: null },
        passedMission('plot-twist', { durationSec: 1260, srcFilesChanged: 2 }),
        { id: 'viva', status: 'passed', attempts: 1, result: null },
      ],
      viva: { questions: [{ id: 'q1', q: 'Why did pricing need no changes in bookingService?' }, { id: 'q2', q: 'What stops a child-only booking?' }, { id: 'q3', q: 'What would break first with two servers?' }], answers: { q1: '…', q2: '…', q3: '…' }, submittedAt: daysAgo(2), scores: { q1: 5, q2: 5, q3: 4 }, scoredAt: daysAgo(1) },
    }),
    sampleSubmission({
      id: 'sub-rahul',
      studentId: 'rahul',
      days: 7,
      hiddenFailing: ['zero tickets returns 400', 'negative tickets returns 400'],
      ownTests: 5,
      docs: { ...allDocs, aiDisclosure: false },
      claims: [{ claim: 'Rate limiting on /bookings', verified: false, evidence: 'No rate limiting code found in src/' }],
      survived: true,
      rubric: { design: 6, code: 7, testing: 5, docs: 6 },
      summary: 'Works for the happy path. Pricing is spread across routes and service, and validation was missing.',
      comments: [
        { id: 'c1', file: 'src/routes/bookings.js', line: 18, severity: 'medium', category: 'Design', title: 'Price calculated inside the route handler', body: 'Price rules are in the HTTP layer and the service, so any price change touches both.', source: 'ai', status: 'confirmed' },
        { id: 'c2', file: 'README.md', line: 12, severity: 'medium', category: 'Documentation', title: 'Claim not backed by code', body: 'README mentions rate limiting but no rate limiting exists.', source: 'ai', status: 'confirmed' },
      ],
      missions: [
        passedMission('bug-hunt', { attempts: 2, hintsUsed: 1, durationSec: 1020 }),
        passedMission('fix-review', { durationSec: 700 }),
        passedMission('plot-twist', { attempts: 3, durationSec: 2500, srcFilesChanged: 5 }),
        { id: 'viva', status: 'passed', attempts: 1, result: null },
      ],
      viva: { questions: [{ id: 'q1', q: 'Why did the twist touch 5 files?' }, { id: 'q2', q: 'How is a refund calculated?' }, { id: 'q3', q: 'Where is validation now?' }], answers: { q1: '…', q2: '…', q3: '…' }, submittedAt: daysAgo(3), scores: { q1: 3, q2: 4, q3: 3 }, scoredAt: daysAgo(2) },
    }),
    sampleSubmission({
      id: 'sub-meera',
      studentId: 'meera',
      days: 2,
      hiddenFailing: [],
      ownTests: 7,
      docs: allDocs,
      claims: [],
      survived: true,
      rubric: { design: 8, code: 8, testing: 7, docs: 9 },
      summary: 'Solid first submission. Excellent decision log. Tests miss the exact-capacity case.',
      comments: [
        { id: 'c1', file: 'docs/decisions.md', line: 1, severity: 'good', category: 'Documentation', title: 'Clear decision log', body: 'Each decision states the trade-off and what would change at scale.', source: 'ai', status: 'confirmed' },
      ],
      missions: [
        { id: 'bug-hunt', status: 'ready', attempts: 0, result: null },
        { id: 'fix-review', status: 'skipped', attempts: 0, result: null },
        { id: 'plot-twist', status: 'locked', attempts: 0, result: null },
        { id: 'viva', status: 'locked', attempts: 0, result: null },
      ],
      viva: null,
    }),
    sampleSubmission({
      id: 'sub-arjun',
      studentId: 'arjun',
      days: 9,
      hiddenFailing: ['zero tickets returns 400', 'negative tickets returns 400', 'more than 10 tickets in one booking returns 400', 'cancelling frees the seats'],
      ownTests: 3,
      docs: { readme: true, architecture: false, decisions: true, aiDisclosure: false },
      claims: [{ claim: 'Bookings stored in MongoDB', verified: false, evidence: 'mongodb is in package.json but never imported' }],
      survived: true,
      rubric: { design: 5, code: 5, testing: 4, docs: 5 },
      summary: 'Everything is in one 300-line file. Several validation gaps and a cancel bug.',
      comments: [
        { id: 'c1', file: 'index.js', line: 1, severity: 'medium', category: 'Design', title: 'Single 300-line file', body: 'Routing, rules and pricing are mixed together, which makes changes risky.', source: 'ai', status: 'confirmed' },
      ],
      missions: [
        passedMission('bug-hunt', { attempts: 3, hintsUsed: 3, durationSec: 1180 }),
        passedMission('fix-review', { attempts: 2, durationSec: 1100 }),
        passedMission('plot-twist', { attempts: 4, durationSec: 2690, srcFilesChanged: 7 }),
        { id: 'viva', status: 'passed', attempts: 1, result: null },
      ],
      viva: { questions: [{ id: 'q1', q: 'Why did the twist need 7 files?' }, { id: 'q2', q: 'What was the cancel bug?' }, { id: 'q3', q: 'How would you split index.js?' }], answers: { q1: '…', q2: '…', q3: '…' }, submittedAt: daysAgo(4), scores: { q1: 2, q2: 3, q3: 2 }, scoredAt: daysAgo(3) },
    }),
  ];

  return {
    version: 1,
    activeCompanyId: null,
    companies,
    openings,
    students,
    submissions,
    sessions: [],
    customChallenges: [],
    quests: [],
    questRuns: [],
    notifications: [],
    connections: [
      {
        id: 'con-seed',
        studentId: 'ananya',
        companyId: 'co-chamundi',
        challengeId: 'palace-pass',
        status: 'accepted',
        slot: 'Tue 4:00 PM',
        proof: { score: 97, rank: 1 },
        createdAt: daysAgo(1, 5),
        thread: [
          { from: 'student', text: 'Hi Arjun, I finished Palace Pass at #1. I would love to hear how your team handles traffic spikes.', at: daysAgo(1, 5) },
          { from: 'company', text: 'Loved your 2-file Plot Twist fix. Tuesday 4 PM works, see you then!', at: daysAgo(1, 3) },
        ],
      },
    ],
    invites: [
      { id: 'inv-seed', companyId: 'co-chamundi', openingId: 'op-chamundi-1', studentId: 'ananya', status: 'interview', message: 'Loved your Plot Twist solution.', createdAt: daysAgo(1) },
    ],
    activity: [
      { id: 'act-seed-1', text: 'Ananya Rao beat the Plot Twist boss by changing only 2 files', who: 'ananya', at: daysAgo(2) },
      { id: 'act-seed-2', text: 'Meera S passed code review with 12/12 hidden tests', who: 'meera', at: daysAgo(1) },
    ],
  };
}
