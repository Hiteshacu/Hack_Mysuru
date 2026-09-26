# ProofArena: full walkthrough with exact inputs

You play **both roles** in one browser: the **Company** (Kaveri Softworks) and the **Student** (Hitesh).
Every time the turn changes, there's a **Switch to company / Switch to student** button.

Keep `npm run dev` running in `D:\Mysuru_Hackathon\proofarena` and open **http://localhost:3000**.

---

## Step 0 · Start fresh

1. Open **http://localhost:3000**
2. Scroll down. Check the badge says **"AI reviewer: Groq connected"**
3. Click **Reset demo data** → you land on the company setup page

You can also reset any time with **Reset demo** at the bottom of the company sidebar (or top-right on the student side).
Reset clears your company, your challenges, openings and Hitesh's progress. The 4 sample students stay.

---

## PART 1 · COMPANY sets up

### Step 1 · Create the company
Click **Fill sample details**, or type:

| Field | Input |
|---|---|
| Company name | `Kaveri Softworks` |
| City | `Mysuru` |
| Industry | `SaaS` |
| Team size | `51–200` |
| Website | `kaverisoftworks.example` |
| About | `We build booking and payments software for tourism in Karnataka.` |
| HR contact name | `Priya Nair` |
| HR contact role | `Talent Acquisition Lead` |
| Brand colour | the first (indigo) |

Click **Create company** → the **Company dashboard** opens with a 5-step "Your hiring loop" checklist.

### Step 2 · Post an opening
Click **Post an opening** (top right). The form is already filled; check it:

| Field | Input |
|---|---|
| Role title | `Backend Engineering Intern` |
| Type | `Internship` |
| Location | `Mysuru · On-site` |
| Pay | `₹25,000 / month` |
| Seats | `2` |
| Skills | Node.js, REST APIs, Testing |
| Challenge | **Palace Pass** (selected) |
| Minimum verified score | `70` |

Click **Post opening**.
✅ You see the opening card: "4 verified candidates already meet this bar" (the sample students).

Optional look: **Challenge library** in the left menu shows what Palace Pass tests and its 4 levels.

### Step 2b (optional) · Company creates its OWN challenge with AI
Left menu → **Challenge library** → **Create a challenge**.

**Option A · Write my own + Refine with AI**
| Field | Input |
|---|---|
| Skills | Node.js, Validation, Testing (click to select; type your own in "+ Add a skill") |
| Difficulty | `Medium` |
| Time budget | `About 4 hours` |
| Title | `Coorg Homestay Booking` |
| Problem statement | click **Use the example text** (or write rough notes) |

Click **Refine with AI** → Groq rewrites it: clear title, tagline, problem, 5–8 requirements covering every skill, scope, deliverables.

**Option B · Generate with AI**
Click the **Generate with AI** tab → Role `Backend Engineering Intern`, Theme `Mysuru Zoo` → **Generate problem statement**. Don't like it? **Generate another**.

Then in **Preview & edit**: change any word, add/remove requirements, then **Publish to my library**.
✅ It opens a new opening with your challenge already selected → **Post opening**.

Company-written challenges run on the **review track**: code review + mutation probe + README check + viva from the student's own code
(no hidden tests / game levels; those exist for verified challenges like Palace Pass). **For the main demo, keep using Palace Pass.**

---

## PART 2 · STUDENT submits

### Step 3 · Switch to the student
Click **Switch to student view** (bottom-left).
✅ Student home: "Hi Hitesh", Level 1 Rookie, 0 XP, journey map, **Next step: Pick your first challenge**.

### Step 4 · Open the challenge
Click **See opportunities** → on **Kaveri Softworks · Backend Engineering Intern** click **View challenge**.
✅ You see the problem statement, the rules to follow (contract), and how it's checked.

### Step 5 · Submit the project (local folder)
In **Submit your project** on the right:

| Field | Input |
|---|---|
| Tab | **Local folder** |
| Project folder | `D:\Mysuru_Hackathon\student-project` (or click **Use Hitesh's demo project**) |
| Deployed URL | leave empty |

Click **Submit for review**.

### Step 6 · Watch Phase 1 (automatic checks, about 10 seconds)
✅ The 7 checks tick one by one:

| Check | Expected result |
|---|---|
| Fetch code and freeze the commit | Copied from local folder · commit xxxxxxx |
| Check the project contract | 14 files · 173 lines · contract OK |
| Run 12 hidden tests | **9/12 passed** (0, -3 and 11 tickets are wrongly accepted) |
| Run the student's own tests | 4/4 pass |
| Check docs and README claims | 4/4 docs · **1 claim not backed by code** |
| Mutation probe | **Planted bug was NOT caught by their tests** (blind spot) |
| AI reviewer drafts comments | 7 rule comments + up to 4 from Groq |

Then click **Switch to company**.

---

## PART 3 · COMPANY reviews the code

### Step 7 · Review
You're on **Reviews → Hitesh · Palace Pass**.
✅ Left: the code with comments under the exact lines. Right: AI summary, machine checks, the comment list, the rubric.

Look at these comments (the ones marked **Becomes a mission** turn into game levels):
- 🔴 **tickets is never validated** (`src/services/bookingService.js`) → becomes **Level 2**
- 🟠 **Your tests miss the "exactly full" case** → becomes **Level 1**
- 🟠 **Claim not backed by code** (README.md)
- 🟢 Strengths: pricing in one module, HTTP separated from booking rules, decision log

Do this:
1. Click **Confirm** on each comment (or **Confirm all**). If a Groq comment looks wrong, click **Reject**. That's the human check.
2. Rubric sliders: **Design 8 · Code quality 7 · Testing 6 · Docs & decisions 8**
3. Note to the student: `Good layering and a clear decision log. Fix input validation first, then add boundary tests.`
4. Click **Publish review & unlock Live Round**
5. Click **Switch to student · play the Live Round**

---

## PART 4 · STUDENT plays the Live Round (the game)

✅ A dark game map with 4 levels: Level 1 glowing, the others locked.

### Step 8 · Level 1: Bug Hunt (debugging)
Click **Start mission**. The editor opens (VS Code style):
- **Left:** the story ("Sold out" with seats still free) and the server log
- **Middle:** the files of Hitesh's own project
- **Right:** the editor, with the terminal at the bottom

Do this:
1. Click **Run tests** → the terminal shows **Mission 1/2** in red: "expected 201, got 409"
2. In the file list open **src/services → bookingService.js**
3. Go to **line 23**. The platform secretly planted a bug:
   ```js
   if (slot.booked + tickets >= slot.capacity) {
   ```
   Change `>=` to `>`:
   ```js
   if (slot.booked + tickets > slot.capacity) {
   ```
   It saves automatically ("Saved" at the top).
4. **Bonus +100 XP (Blind Spot Closed badge):** open **tests → booking.test.js**, go to the very end and paste:
   ```js
   test('the last seats of a slot can be booked', async () => {
     const app = await start();
     for (let i = 0; i < 4; i++) {
       await book(app.base, { slotId: 'DASARA-1000', visitorName: 'Group', tickets: 10 });
     }
     const res = await fetch(`${app.base}/slots`);
     const slot = (await res.json()).find((s) => s.id === 'DASARA-1000');
     assert.strictEqual(slot.available, 0);
     await app.close();
   });
   ```
5. Click **Run tests** → **Mission 2/2** and **Your tests 5/5**, all green
6. Click **Submit fix**

✅ Confetti, **Mission cleared!**, XP breakdown (+200, speed bonus +50, test bonus +100), badges **Bug Hunter**, **Blind Spot Closed** (and **Speed Runner** if under 10 minutes), plus the code change you made.
Click **Back to the map**.

### Step 9 · Level 2: Customer Complaint (fix the review finding)
Click **Start mission**. Story: "Someone booked -3 tickets".

1. **Run tests** → Mission **0/4** red
2. Open **src/services/bookingService.js**. Find this block (around line 16):
   ```js
   function bookTickets({ slotId, visitorName, tickets }) {
     if (!visitorName) {
       throw new AppError(400, 'visitorName is required');
     }
   ```
   Add these 3 lines right after it, before `const slot = ...`:
   ```js
     if (!Number.isInteger(tickets) || tickets < 1 || tickets > 10) {
       throw new AppError(400, 'tickets must be a whole number from 1 to 10');
     }
   ```
   (Or replace the whole file with `D:\Mysuru_Hackathon\demo-solutions\level-2\src\services\bookingService.js`: click in the editor, **Ctrl+A**, paste.)
3. **Run tests** → Mission **4/4** green
4. **Submit fix**

✅ Mission cleared, **+250 XP** (+50 more if under 10 minutes), **Clean Fixer** badge. **Back to the map**.

### Step 10 · Level 3: BOSS · Plot Twist (change your own design)
Click **Start mission**. Story: "Dasara pricing changes tonight": adults ₹100, children ₹50, 10% off for groups of 5+, at least 1 adult, max 10 people.

1. **Run tests** → Mission **3/6** red
2. Open **src/services/pricing.js**, click in the editor, **Ctrl+A**, and paste:
   ```js
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
   ```
3. Open **src/services/bookingService.js**, **Ctrl+A**, and paste the whole file from
   `D:\Mysuru_Hackathon\demo-solutions\level-3\src\services\bookingService.js`
   (open it in Notepad or VS Code and copy everything).
4. **Run tests** → Mission **6/6** green
5. **Submit fix**

✅ **Boss defeated!** **+650 XP** (500 + small-footprint bonus 100 + speed 50), badges **Twist Tamer** and **Small Footprint**. The message says "You changed **2** source files: your design absorbed the change well."
**Point to make to judges:** a messy design would have needed 5–7 files. That's what the Plot Twist measures.

Click **Back to the map** → Level 4 **Viva** is unlocked.

### Step 11 · Level 4: Viva
Click **Start viva**. Groq wrote 3 questions about the exact code Hitesh changed (the wording differs every time).
Answer each in 2–4 sentences (at least 5 words). Sample answers; pick whichever matches the question:

- **About pricing / calculatePrice / 3 adults + 2 children:**
  `I changed calculatePrice in pricing.js to take adults and children. 3 adults × ₹100 + 2 children × ₹50 = ₹400, and because 5 people is a group it applies 10% off, so the total is ₹360. bookingService only passes the counts, so the price rules stay in one file.`
- **About the planted bug / capacity check:**
  `The mission test booked exactly the last 2 seats and got 409. I checked the capacity condition in bookTickets and saw >= instead of >, which refuses a booking that fills the slot exactly. I changed it to > and added a test that books all 40 seats.`
- **About validation / where the checks live / at least 1 adult:**
  `The checks are at the start of bookTickets in bookingService.js, before the slot is touched, so a bad request never changes the seat count. adults must be at least 1 and adults + children at most 10. Routes only handle HTTP, so the rules stay testable in one place.`
- **About why separate prices / constants:**
  `Adult and child prices are different business rules that can change separately during Dasara, so each has its own constant. Changing a price is then a one-line edit in pricing.js.`

Click **Submit answers** → on the map click **Switch to company · score the viva**.

---

## PART 5 · COMPANY scores and hires

### Step 12 · Score the viva
✅ The 3 questions with Hitesh's answers, each with a suggested score.
Click **4** or **5** for each → **Save viva scores**.
✅ "The profile is now fully verified."

### Step 13 · Find the candidate
Left menu → **Candidates**.
✅ Leaderboard: Ananya 97 · **Hitesh about 85–90** · Rahul 72 · Arjun 57, and Meera in the **Rising** list.
Try the filters: **Must be strong in: Debugging ≥ 90** → Hitesh stays.

Click **Hitesh**:
- The big score ring, "Fully verified", "% of points from re-runnable tests"
- **Where the score comes from:** Code review /40 · Live Round /45 · Viva /15
- **Live Round evidence:** click **Replay how they solved it** on Level 1 → a timeline (started, ran tests, edited the file, submitted) plus the code change
- Proven skills bars and badges

### Step 14 · Invite
In **Invite to interview**: Opening **Backend Engineering Intern**. The message is prefilled.
Click **Send invite** → click **Switch to student · accept the invite**.

---

## PART 6 · STUDENT accepts

### Step 15
✅ Student home: **"You're verified: 8x/100"**, all journey steps green, Level 4 Engineer, and an **Interview invites** card from Kaveri Softworks.
Click **Accept**.

### Step 16 · Close the loop
Top right → **Company view** → left menu **Hiring pipeline**.
✅ Hitesh is in **Accepted** → click **Schedule interview** → **Make offer**.

**Build → review → prove → discover → hire, in one connected flow.** 🎉

---

## PART 7 · The Top 3 reward: HR Connect (show this during the Live Round)

Watch Hitesh's **rank** while he plays. It's shown on the student home ("Race to HR Connect" podium), the game map (the #rank tile) and in every "Mission cleared!" popup:

| Moment | Hitesh's rank | What to say |
|---|---|---|
| After the review is published | **#5 of 5** · "28 points to the top 3" | "He joins the leaderboard only after a human review." |
| After Level 1 | #5 | |
| After Level 2 | **#4** · "8 points to go" | |
| After the Boss (Level 3) | **#2 · HR Connect unlocked** 🎉 (full-screen celebration) | "Beating the boss pushes him into the top 3." |

Then:
1. Student menu → **HR Connect**: the gold "You're #2" page, the podium and the HR of each company that uses Palace Pass.
2. On **Kaveri Softworks · Priya Nair**, click **Request intro**. The **proof card** (score, top skills, % test-backed) is attached automatically. The message is pre-written from his real strengths. Pick a **coffee-chat slot** → **Send intro**.
3. Click **Switch to company → HR Connect** (or the left menu). Priya sees the request with the rank medal, score and skills. Click **Accept intro**.
4. Back on the student **HR Connect** page, the chat shows the HR's reply.

Also on the student side:
- **Mysuru Leagues** (Sandalwood → Rosewood → Silk → Gold → Palace), with a promotion zone (top 3) and a demotion zone, like TryHackMe/Duolingo.
- **Celebrations** pop up automatically for rank climbs, level-ups, new badges, league promotion and "Fully verified".
- A **skill radar chart** on the profile.

Pitch line: *"Badges and XP keep students motivated, but the reward that matters, a direct line to HR, is earned only by the top 3 on an evidence-backed score."*

---

## PART 8 · The 3D Quest (quiz → arrow range → debugging → DSA → community)

A second, faster way in: a company turns a job into a quest in a 3D world. Anyone who finishes it joins the
**Community Camp**, with every job's apply link and HR email.

### Step 17 · Company creates the quest
Company menu → **3D Quests → Create 3D Quest**.

| Field | Type this |
|---|---|
| Role | `Backend Engineering Intern` (already filled) |
| Students need to pass the gate quiz with | `3 of 5 correct` |
| Apply link (optional) | `https://kaverisoftworks.example/careers/backend-intern` |
| Job description | already filled (keep it) |
| Skills | keep **Node.js, REST APIs, Testing, Data Structures** selected |

Click **Generate quest with AI** (about 3–10 seconds with Groq; without a key the built-in question bank is used).
✅ You see 5 MCQs and 5 arrow rounds (all editable), plus the debugging task and the DSA problem.
Every AI coding task is **machine-checked** before you see it: the reference solution must pass its tests and the
buggy code must fail them. If the AI's task fails that check, a verified task from the bank is used instead (the label
says which). Click **Publish quest**.

### Step 18 · Notify others
You land on **Notify others** (also in the left menu). Keep **Top students** (slider at 5), both **SMS** and **In-app notification** ticked,
and the pre-written message. Click **Send to 5 students**.
✅ Each student gets a notification (the bell on the student side). SMS says **simulated** unless Twilio keys are set
in `.env.local` (see `.env.local.example`). The demo phone numbers are fake on purpose.

### Step 19 · Student enters the world
Student side → bell icon → click the quest (or menu → **3D Quests → Enter the 3D world**).
It opens `http://localhost:3000/quest/index.html?quest=<id>&student=hitesh`.

**Stage 1 · Gate Quiz** (on the loading screen, all 5 questions in one window). Pick answers → **Submit answers**.
✅ Pass (3+ correct): every question shows right/wrong with a one-line explanation, and **Enter the 3D world** appears.
❌ Fail: only the score is shown ("2/5 · You need 3, attempt 1"). **The answers stay hidden until you pass**, so a
retry can't just copy them. Every retry lowers the points, and the company sees the attempt count.

**In the world:** the **golden arrow** at the top always points to the next stage and shows the distance, and a
**light beacon** stands over it. The **quest tracker** is on the left. Walk with **WASD** (Shift = sprint) or use the
top bar to fast travel. At a glowing ring press **E**.

**Stage 2 · Arrow Range** (east). **Step up to the range**. Each round shows a question; the three answers are painted
on targets.
- **The `+` is where the arrow lands.** Move the mouse (or arrow keys) to put the `+` on the right answer. The target
  lights up and the bar says *"Aiming at GET"*.
- **Hold** click (or Space) to draw the bow. The `+` steadies and the bar turns green: **"Steady! Release now"**.
- **Release** while it's green. The arrow flies in an arc (over the other targets) and sticks exactly where the `+` was.
- Hold too long and the arm shakes (red bar, the `+` wobbles). Release too early and it drops short.
  Wind pushes the `+` sideways, so keep it on the board.
- Centre = **BULLSEYE +10**, middle ring +7, edge +5. 2 arrows per round.
3 of 5 correct targets → **Collect your rifle** → the **Start battle** button (and the **B** key) unlocks.
If you fail, only the score is shown (answers stay hidden), then **Try the range again**.

**Stage 3 · Debug Den** (the cabin, west). **Open the laptop**. A VS Code editor shows buggy code, the bug report and
3 visible tests. There are also **3 hidden tests**, so hard-coding the visible answers fails.
Demo moves:
1. Press **Run tests & submit fix** without changing anything → red, some tests fail (e.g. 3/6).
2. Fix the bug (the hint helps). `console.log` works; its output appears in the **Console** box.
3. Submit → **All 6 tests pass!** → back in the world with a toast and confetti.

**Stage 4 · Algorithm Grove** (south). **Enter the grove**.
- **Run examples** checks the 2 visible examples. **Submit solution** also runs the hidden tests (4–5).
- **Custom input**: type your own arguments as a JSON array (e.g. `["pwwkew"]`) → **Run my input**. You see your output
  and the **expected** output, computed by the company's reference solution on the server (the reference never reaches
  the browser).
- **Ctrl+Enter** runs, **Reset code** starts over, and leaving with ✕ keeps your code.
- Demo trick: a lazy answer that only fits the examples passes **Run examples** but fails a hidden test on **Submit**.

**How the code is judged (say this if asked about cheating or safety):** every run happens on the server in a separate
Node process with Node's permission model (it can't write files or start programs). The code runs inside a sandbox
with no `require`, no `process` and no `eval`, a 1.5 s limit per test, a memory cap and capped output.
Console output from hidden tests is not shown, so hidden inputs can't be printed. For production you would add a
throwaway container (Docker) per run.

**Finale · Community Camp** (by the lake). Every role with **Apply** links and HR emails (click an email to copy it).
The quest's own role comes first. The same list is on the student **Community** page.

Say: *"The quiz filters, the arrow range makes it fun, but the rifle, the community and the HR emails are only
unlocked by code that passes tests on our server. Answers never reach the browser."*

---

## Doing the challenge again (retake)

One proof counts for every company, so the student normally doesn't submit twice. To start over anyway:
**Opportunities → View program → Retake from scratch → Start new attempt.** The old attempt is archived and the journey restarts from the code review.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Stuck on a level during the demo | Second terminal in `proofarena`: `npm run autoplay -- fix-review` (or `bug-hunt`, `plot-twist`), then refresh the map |
| "Not yet" after Submit fix | Read the red lines in the popup. "Broke an old test" means a change broke something that used to work |
| Editor shows "Loading…" for long | It downloads from the internet the first time. Wait or refresh |
| Want to restart | Home → **Reset demo data** |
| Badge says "built-in rules" | Groq key not loaded. Restart `npm run dev`. The demo still works without it |
| Groq comments/questions missing | Free tier allows ~8,000 tokens a minute. The app retries on a smaller model, then uses built-in rules. Wait a minute between submissions |
| "You already have a submission" | Use **Retake from scratch** on the program page, or **Reset demo** |
| 3D world shows "No 3D Quest has been published yet" | Create one in Company → 3D Quests first |
| 3D world is blank or old after changing its code | `cd quest-world` → `npm run build` (writes into `proofarena/public/quest`), then refresh |
| 3D world is slow | Settings (gear) → Graphics **Low**, or add `&quality=low` to the link |
| Quest already finished for Hitesh | Company → **3D Quests** → **Reset players (to demo it again)** under the quest. Or open the link with `&student=ananya` (or rahul, meera, arjun) |
