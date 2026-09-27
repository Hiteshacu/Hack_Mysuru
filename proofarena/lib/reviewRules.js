// Deterministic review checks. These run with or without Claude and produce
// line-level comments the company engineer then confirms or rejects.

function lineOf(content, regex) {
  const i = content.split('\n').findIndex((l) => regex.test(l));
  return i >= 0 ? i + 1 : null;
}

function srcEntries(files) {
  return Object.entries(files).filter(([p]) => p.startsWith('src/') && /\.(c|m)?js$/.test(p));
}

const CLAIM_RULES = [
  {
    match: /(survive|persist|saved to (a )?(json )?file|stored (in|on) (a )?(file|disk))/i,
    evidence: (src) => /fs\.(write|append)|writeFile|appendFile/.test(src),
    missing: 'README says data is saved to a file, but nothing in src/ writes to a file. Bookings only live in memory, so a restart loses them.',
    found: 'File writes found in src/.',
  },
  {
    match: /redis/i,
    evidence: (src) => /require\(['"](io)?redis['"]\)|from ['"](io)?redis['"]/.test(src),
    missing: 'README mentions Redis, but Redis is never imported in src/.',
    found: 'Redis client imported in src/.',
  },
  {
    match: /mongo/i,
    evidence: (src) => /mongoose|mongodb/.test(src),
    missing: 'README mentions MongoDB, but it is never imported in src/.',
    found: 'MongoDB client imported in src/.',
  },
  {
    match: /rate.?limit/i,
    evidence: (src) => /rateLimit|rate-limit|429/.test(src),
    missing: 'README mentions rate limiting, but no rate limiting code exists.',
    found: 'Rate limiting code found.',
  },
  {
    match: /\bjwt\b|json web token/i,
    evidence: (src) => /jsonwebtoken|jwt\.verify/.test(src),
    missing: 'README mentions JWT auth, but no token verification exists.',
    found: 'JWT verification found.',
  },
];

export function checkClaims(files) {
  const readme = files['README.md'] || '';
  const src = srcEntries(files).map(([, c]) => c).join('\n');
  const claims = [];
  readme.split('\n').forEach((line, i) => {
    if (/^\s*(#|```|\|)/.test(line)) return;
    for (const rule of CLAIM_RULES) {
      if (!rule.match.test(line)) continue;
      const verified = rule.evidence(src);
      claims.push({
        claim: line.replace(/^[-*\s]+/, '').trim(),
        verified,
        evidence: verified ? rule.found : rule.missing,
        file: 'README.md',
        line: i + 1,
      });
    }
  });
  return claims;
}

export function checkDocs(files) {
  return {
    readme: Boolean(files['README.md']),
    architecture: Object.keys(files).some((p) => /^docs\/architecture/i.test(p)),
    decisions: Object.keys(files).some((p) => /^docs\/(decisions|decision-log|adr)/i.test(p)),
    aiDisclosure: Boolean(files['ai.md'] || files['AI.md']),
  };
}

export function ruleComments(files, checks) {
  const comments = [];
  const src = srcEntries(files);
  const allSrc = src.map(([, c]) => c).join('\n');

  // 1. Missing ticket validation (the source of the Level 2 mission).
  // Only for Palace Pass (the only challenge with hidden tests about tickets).
  const failingValidation = checks.hiddenTests ? checks.hiddenTests.tests.filter((t) => !t.ok && /tickets/.test(t.name) && /400/.test(t.name)) : [];
  const hasValidation = /Number\.isInteger\([^)]*tickets|tickets\s*<\s*1|tickets\s*<=\s*0|tickets\s*>\s*10/.test(allSrc);
  if (checks.hiddenTests && (failingValidation.length || !hasValidation)) {
    const target =
      src.find(([, c]) => /\{\s*slotId[^}]*tickets[^}]*\}/.test(c)) ||
      src.find(([, c]) => /function\s+bookTickets/.test(c)) ||
      src.find(([, c]) => /tickets/.test(c)) ||
      src[0];
    if (target) {
      const [file, content] = target;
      comments.push({
        file,
        line: lineOf(content, /\{\s*slotId.*tickets\s*\}/) || lineOf(content, /tickets/) || 1,
        severity: 'high',
        category: 'Correctness',
        title: 'tickets is never validated',
        body:
          'A booking with 0, -3 or 11 tickets is accepted. With -3 tickets the slot gets 3 seats back and the total becomes ₹-300.' +
          (failingValidation.length ? ` ${failingValidation.length} hidden tests fail because of this.` : ''),
        mission: 'fix-review',
        failingTests: failingValidation.map((t) => t.name),
      });
    }
  }

  // 2. Test blind spot found by the mutation probe (the source of the Level 1 mission).
  const m = checks.mutation;
  if (m && m.survived) {
    comments.push({
      file: m.file,
      line: m.line,
      severity: 'medium',
      category: 'Testing',
      title: m.id === 'capacity-off-by-one' ? 'Your tests miss the "exactly full" case' : 'Your tests miss a boundary case',
      body:
        `We changed \`${m.original.trim()}\` to \`${m.mutated.trim()}\` and all ${checks.studentTests.total} of your tests still passed. ` +
        (m.id === 'capacity-off-by-one'
          ? 'A real bug here would turn visitors away from half-empty slots and nobody would notice.'
          : 'A real bug on this line would ship without anyone noticing. Add a test for this edge case.'),
      mission: checks.hiddenTests ? 'bug-hunt' : undefined,
    });
  }

  // 3. README claims that the code doesn't back up.
  for (const claim of checks.claims.filter((c) => !c.verified)) {
    comments.push({
      file: claim.file,
      line: claim.line,
      severity: 'medium',
      category: 'Documentation',
      title: 'Claim not backed by code',
      body: claim.evidence,
    });
  }

  // 4. Internal error messages sent to clients.
  for (const [file, content] of src) {
    const line = lineOf(content, /error:\s*err\.message/);
    if (line && /500/.test(content)) {
      comments.push({
        file,
        line,
        severity: 'low',
        category: 'Robustness',
        title: 'Unexpected errors send internal messages to the client',
        body: 'For a 500, return a generic message and log the real error on the server. Otherwise stack details can leak to users.',
      });
    }
  }

  // 5. Strengths.
  const pricing = src.find(([p]) => /pric/i.test(p));
  if (pricing) {
    comments.push({
      file: pricing[0],
      line: lineOf(pricing[1], /function|=>/) || 1,
      severity: 'good',
      category: 'Design',
      title: 'Pricing lives in one module',
      body: 'All price rules are in one place, so a price change should not touch booking or routing code.',
    });
  }
  const routes = src.find(([p]) => /route/i.test(p));
  const service = src.find(([p]) => /service/i.test(p));
  if (routes && service && !/capacity/.test(routes[1]) && !/writeHead|statusCode/.test(service[1])) {
    comments.push({
      file: routes[0],
      line: lineOf(routes[1], /async function|function handle/) || 1,
      severity: 'good',
      category: 'Design',
      title: 'HTTP and booking rules are separated',
      body: 'Routes only translate HTTP to service calls, and the service has no HTTP code. That keeps rules testable.',
    });
  }
  const decisions = Object.entries(files).find(([p]) => /^docs\/(decisions|decision-log)/i.test(p));
  if (decisions && (decisions[1].match(/^##\s/gm) || []).length >= 2) {
    comments.push({
      file: decisions[0],
      line: 1,
      severity: 'good',
      category: 'Documentation',
      title: 'Decision log explains trade-offs',
      body: 'Each decision names the choice, the reason and the trade-off. Reviewers can see how you think.',
    });
  }

  return comments;
}
