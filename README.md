# ProofArena · Hack Mysuru 1.0 · Problem Statement 2

**Show what you can build, not just your resume.**
Students build a real project, get a code review, then prove it's theirs by fixing, changing and explaining it
live inside their own code. Companies see verified proof and hire.

---

## 1. The idea in plain words

| Step | Who | What happens |
|---|---|---|
| 1 | Company | Creates a profile, posts an opening, picks a challenge from the library (no test writing) |
| 2 | Student | Uses the GitHub template, builds on their own laptop, submits the repo link |
| 3 | Platform | **Phase 1 · Code review.** Runs 12 hidden tests, checks README claims against the code, plants a tiny bug to see if the student's own tests notice (mutation probe), drafts line-by-line review comments |
| 4 | Company engineer | Confirms or rejects each AI comment, scores a rubric, publishes. This unlocks the game |
| 5 | Student | **Phase 2 · Live Round (the game)** inside a copy of their own project, in a VS Code editor in the browser |
| 6 | Student | Level 1 **Bug Hunt** → Level 2 **Customer Complaint** → Level 3 **Boss: Plot Twist** → Level 4 **Viva** |
| 7 | Company | Sees the Verified Score, every number linked to evidence (tests, diffs, a replay of how they fixed it), sends an invite |

**Where does the student code in the Live Round?** In the browser. The platform copies the student's project into a
private workspace, plants the mission (a bug, a failing test, a new requirement), and opens it in a VS Code editor
(Monaco). They edit, press **Run tests**, and **Submit fix**. Grading happens on a *clean copy* with *fresh official
tests*, so editing the test file can't fake a pass. Their real GitHub repo is never touched.

**Why companies would use it:** they set up nothing (the platform owns the challenges), one student proof counts for
every company that uses the challenge, and every score is backed by tests they can re-run.

---

## 2. Folders

```
D:\Mysuru_Hackathon\
├── proofarena\          ← the platform (Next.js). Company + Student dashboards, review engine, Live Round
│   ├── challenges\palace-pass\   challenge.json (spec, missions, mutations) + hidden & mission tests
│   ├── lib\             engine: review pipeline, test runner, missions, scoring, optional AI (Groq or Claude)
│   ├── app\company\     company dashboard pages
│   ├── app\student\     student dashboard pages + the in-browser editor
│   └── scripts\         smoke.mjs (full rehearsal) · autoplay.mjs (play one level automatically)
├── student-project\     ← Hitesh's submission ("Palace Pass" API). Has 3 deliberate weaknesses
├── quest-world\         ← the 3D Quest world (Three.js + Vite). `npm run build` writes it into proofarena/public/quest
│   └── src\quest\       gate quiz, arrow range game, VS Code coding stages, station panels, API client
├── challenge-template\  ← what you'd publish on GitHub as the "Use this template" repo
└── demo-solutions\      ← answer key for Level 2 and Level 3 (so a live demo never gets stuck)
```

The student project's weaknesses (found automatically in Phase 1):
1. `tickets` is never validated (0, -3, 11 tickets are accepted) → 3 hidden tests fail → becomes **Level 2**
2. Its own tests never book the exact last seat → the mutation probe finds the blind spot → becomes **Level 1**
3. README claims "bookings survive restarts" but data is in memory → flagged as an unverified claim

---

## 3. Run it

Needs Node.js 20+. No Docker, no database.

```bash
cd proofarena
npm install
npm run dev
```

Open http://localhost:3000. Use **Reset demo data** on the home page before every presentation.

Optional AI reviewer: set a free **Groq** key (`GROQ_API_KEY`, from console.groq.com/keys) as a Windows environment
variable or in `proofarena/.env.local` (see `.env.local.example`), then restart `npm run dev`. Groq then writes extra
review comments and the viva questions. The home page shows "AI reviewer: Groq connected". Without a key the built-in
rule engine does the same job, so the demo always works offline. `ANTHROPIC_API_KEY` (Claude) also works.

The 3D Quest world is already built into `proofarena/public/quest`. Only if you change its code:

```bash
cd quest-world
npm install
npm run build        # type-checks, then writes the world into ../proofarena/public/quest
```

Real SMS for **Notify others** is optional: add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` to
`proofarena/.env.local`. Without them SMS is simulated and students still get the in-app notification.

Rehearsal helpers (server must be running):

```bash
npm run smoke                  # plays the whole demo through the API and prints the final score (resets data!)
npm run autoplay -- fix-review # clears one level for Hitesh: bug-hunt | fix-review | plot-twist
```

---

## 4. Demo script (about 6 minutes)

Open two browser tabs: **Tab A = Company** (`/company`), **Tab B = Student** (`/student`).

| Time | Tab | Do | Say |
|---|---|---|---|
| 0:00 | Home | Show the hero | "Resumes are claims. AI can write code. We verify what a student built, then test if they can defend it." |
| 0:20 | A | Company onboarding → **Fill sample details** → Create | "A company joins in one minute." |
| 0:40 | A | Openings → New opening → pick **Palace Pass** → Post | "They don't write tests. They pick a challenge from our library." |
| 1:00 | B | Opportunities → View challenge → **Use Hitesh's demo project** → Submit | "Hitesh built this on his own laptop from our GitHub template." |
| 1:10 | B | Watch the 7 checks tick | "Hidden tests: 9/12. The mutation probe planted a bug and his tests didn't notice. His README makes a claim the code doesn't back up." |
| 1:40 | A | Reviews → open Hitesh → show line comments → **Confirm all** → rubric → **Publish** | "AI drafts, a human decides. The AI never gives points, so a hidden prompt in a README can't cheat the score." |
| 2:20 | B | Enter the Live Round → map → **Start mission** (Bug Hunt) | "Each weak spot became a mission in HIS code. Nobody else gets these missions." |
| 2:40 | B | Read the incident log → Run tests (red) → open `src/services/bookingService.js` → change `>=` to `>` → Run tests (green) → **Submit fix** | "Real debugging. Graded on a clean copy with fresh tests." Confetti, XP, badges. |
| 3:30 | terminal | `npm run autoplay -- fix-review` then `npm run autoplay -- plot-twist` (or play Level 3 live by pasting from `demo-solutions/level-3`) | "Boss level: the rules changed tonight. A good design changes 2 files. A tangled one changes 7." |
| 4:10 | B | Viva → answer 3 questions → Submit | "Questions come from his own diff. If he didn't write the fix, he can't answer." |
| 4:40 | A | Reviews → score the viva → Candidates → Hitesh → **Replay how they solved it** | "Every number links to proof: the tests, the diff, a timeline of how he fixed it." |
| 5:20 | A | **Send invite** → B shows the invite → Accept → A: Hiring pipeline | "Build → review → prove → discover → hire, in one connected flow." |

**3D Quest add-on (about 2 minutes, see WALKTHROUGH Part 8):** Company → 3D Quests → Create 3D Quest → Generate
with AI → Publish → Notify others → Send. Student → bell → the quest → Gate Quiz (5 MCQs) → Arrow Range (win the
rifle) → Debug Den (fix the bug) → Algorithm Grove (DSA with hidden tests) → Community Camp (apply links + HR emails).
Say: *"Fun on the outside, verified on the inside: every unlock comes from code that passes tests on our server."*

Level 1 answer: in `src/services/bookingService.js`, line 23, change `>=` back to `>`.
Bonus (+100 XP, "Blind Spot Closed"): add a test in `tests/` that books all 40 seats of `DASARA-1000`.

---

## 5. The four "work out on paper" answers

**1 · User types**
- **Student:** discover opening → build from template → submit → read review → Live Round → viva → verified profile → accept invites
- **Reviewer (company engineer):** confirm/reject AI comments → rubric → score viva
- **Company (recruiter + HR):** profile → opening + challenge → search verified candidates → open evidence → invite → pipeline

**2 · Core entities**
Company → Opening → Challenge (spec, hidden tests, mutations, missions) · Student → Submission (frozen commit) →
Checks + ReviewComments → Missions → Sessions (workspace, events, diffs) → Viva → Score → Invite

**3 · Ranking logic** (Verified Score out of 100)
- Phase 1 · Code review (40): hidden tests 15 · reviewer rubric 15 · docs 5 · README claims match code 5
- Phase 2 · Live Round (45): Bug Hunt 10 · Customer Complaint 10 · Plot Twist 25 (20 for passing with no regressions + up to 5 for a small footprint). Extra submits and hints cost points
- Viva (15): reviewer scores 3 answers
- **Ignored:** stars, likes, followers, lines of code, XP. XP is only for fun
- Candidates who haven't finished yet are shown in a separate **Rising** list so one good result can't top the board

**4 · Preventing gaming**
- Copied project: missions come from *your* code's weak spots; the viva asks about *your* diff
- Fake test pass: grading runs on a clean copy with fresh official tests; mission test files are read-only
- Prompt injection in README: the AI only drafts comments and questions; points come from tests and humans
- Free labour for companies: challenges are platform-owned practice problems, never a company's real product
- Cold start: one proof counts for every company using that challenge

---

## 6. Honest limits (say this if asked)

- Workspaces run as child processes on the server. Production would use a sandbox per mission (Docker, E2B or Daytona) and code-server for a full terminal.
- Keystroke-level replay is simplified to an event timeline (edits, test runs, hints, submits) plus diffs.
- One challenge is live (Palace Pass); the library shows two more as "coming soon".
- No login: the demo has one company account and one student (Hitesh). Sample candidates are seeded.
