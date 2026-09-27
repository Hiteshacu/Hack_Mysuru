# Deploy ProofArena on Vercel (with real SMS)

The app lives in `proofarena/` (Next.js). The 3D Quest world is already built into `proofarena/public/quest`.

## 1. Import the repo
1. https://vercel.com → **Add New… → Project** → import `Hiteshacu/Hack_Mysuru`.
2. **Root Directory**: click *Edit* and choose **`proofarena`**. Framework: Next.js (auto-detected). Keep the default
   build command. Leave "Include files outside the root directory" **on** (the demo student project is next to the app).
3. Don't deploy yet: first add storage and the environment variables below.

## 2. Storage (required)
Serverless functions can't keep files, so the demo data lives in Redis.
Project → **Storage → Create Database → Upstash (Redis)** (free) → **Connect to project**.
This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. The first request seeds the demo data.

## 3. Environment variables
Project → **Settings → Environment Variables** (Production + Preview):

| Name | Value |
|---|---|
| `GROQ_API_KEY` | your Groq key (AI questions, reviews) |
| `TWILIO_ACCOUNT_SID` | from console.twilio.com (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | from console.twilio.com |
| `TWILIO_FROM` | your Twilio phone number, e.g. `+1xxxxxxxxxx` |
| `DEMO_PHONES` | `hitesh:<your 10-digit mobile>` (who gets the real SMS) |

## 4. Twilio checklist (trial account)
- A trial account can only text **verified** numbers: console.twilio.com → *Phone Numbers → Verified Caller IDs* →
  add your mobile (+91…) and enter the code it receives.
- *Messaging → Settings → Geo permissions*: make sure **India** is enabled.
- Trial messages start with "Sent from your Twilio trial account". Indian carriers sometimes filter international
  SMS; if nothing arrives, check *Monitor → Logs → Messaging* for the delivery status.

## 5. Deploy and test
1. **Deploy**. Open `https://<your-project>.vercel.app`.
2. Company → onboarding → *Fill sample details* → Create.
3. Company → **3D Quests → Create 3D Quest** → Generate → Publish.
4. **Notify others** → tick **SMS** → **Send**. Hitesh's row shows **sent**; the demo students show *skipped* (their
   numbers are placeholders). The SMS contains the quest link on your Vercel domain.

## Notes
- **Reset demo** on the home page reseeds the Redis data.
- Local development is unchanged: without the Redis variables it uses `proofarena/data/db.json`.
- The code-review "Live Round" copies the student project into the function's temp folder; on serverless it works best
  when the steps are done in one sitting (a cold start clears the temp folder).
