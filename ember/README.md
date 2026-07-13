# Ember 🔥

A small warm place for two people across a distance. Not a chat app — a
companion to one. Expo (React Native + TypeScript) on top of **Supabase**,
shipped as an **installable web app (PWA)** with real push notifications —
no Google services, no Apple Developer Program, no app store.

## What's inside (v2)

- **Presence** — when you both have Ember open, the orb on the Today screen
  breathes and glows. No message, just *we're both here*.
- **Spark button** — one tap: "thinking of you." The other side's orb flares
  live, and a push notification lands if their app is closed.
- **Weather of the heart** — sunny / cloudy / stormy instead of "how are you."
- **Daily check-in** — three sliders (energy, heart, connection) plus one
  word. A two-week pattern view shows both of you side by side.
- **Blind daily question** — same question on both devices, picked from a
  pool of 60. Answers are sealed **by the server** until both of you have
  answered — no peeking, not even with developer tools.
- **Future letters** — once a month, a shared prompt. Each letter is sealed
  for three months — the server won't hand it to *anyone*, its author
  included, until unlock day.

Pairing is by invite code: one of you creates the space, the other joins
with a 6-letter code. Identity is one anonymous Supabase user per device —
no accounts, no emails.

## One-time setup (one of you does this, ~15 minutes)

### 1. Supabase (the sync layer, free tier)

1. Go to [supabase.com](https://supabase.com), create a project. Pick a
   **region close to the two of you** (e.g. Frankfurt if you're both in
   Europe) — everything you sync flows through it.
2. **Authentication → Sign In / Providers → enable "Anonymous sign-ins".**
3. **SQL Editor** → paste the entire contents of `supabase/schema.sql` →
   **Run**. (Safe to re-run later; it's idempotent.) This creates the tables,
   the pairing functions, and the row-level-security policies that enforce
   the blind reveal and the letter seal server-side.
4. **Project Settings → API** → copy the **Project URL** and the **anon
   public** key into `src/config/supabaseConfig.ts`.

### 2. Push notifications (optional but recommended)

Standard Web Push with VAPID — no Firebase, no FCM.

1. Generate a key pair once:

   ```bash
   npx web-push generate-vapid-keys
   ```

   Put the **public key** into `src/config/supabaseConfig.ts`
   (`vapidPublicKey`). The private key stays out of the app.

2. Deploy the `send-push` Edge Function and give it the keys
   ([CLI install docs](https://supabase.com/docs/guides/cli)):

   ```bash
   cd ember
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
   npx supabase functions deploy send-push
   ```

   The function verifies the caller is a member of the couple, reads the
   partner's stored push subscription, and delivers through Apple's /
   Mozilla's / Google's push service. Sparks, sealed answers, and check-ins
   all notify the partner.

### 3. Host the web app (free tier)

The app is a static site, hosted on Cloudflare (free, no card required).
`wrangler.jsonc` in this folder already describes it as a static-assets
Worker, so the dashboard flow is:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Compute →
   Workers & Pages → Create** → import `mattsmida/flask-cafe` from GitHub.
2. Settings in the setup form:
   - **Project name:** `ember`
   - **Build command:** `npm run build:web`
   - **Deploy command:** `npx wrangler deploy`
   - **Advanced → Path:** `/ember`
3. Every push to `main` redeploys. (The classic Cloudflare *Pages* flow —
   root dir `ember`, build `npm run build:web`, output `dist` — also still
   works if your dashboard offers it, as does Netlify.)

> The site must be served over **https** for installation and push to work
> (any Pages/Netlify domain is).

### 4. Install it on your iPhones

1. Open your deployed URL **in Safari**.
2. **Share → Add to Home Screen.** That's the real install — since iOS 16.4,
   home-screen web apps get real push notifications.
3. Open Ember **from the home-screen icon**, create/join your space, then go
   to the **Us** tab → **Enable notifications** (iOS only offers this to
   installed apps, and only from a button tap).

On desktop (Windows/Mac), just open the URL in Chrome/Edge/Firefox — it's a
first-class way to use Ember, especially for writing longer answers and
letters with a real keyboard. Chrome/Edge can also install it from the
address-bar install icon.

## Developing

```bash
cd ember
npm install
npm run web          # dev server in the browser
npm run build:web    # static export into dist/ (+ PWA tags)
npx tsc --noEmit     # typecheck
node scripts/test-webpush.mjs   # Web Push crypto self-test (RFC 8291 vector)
```

The native Expo Go path (`npx expo start`) still compiles and runs for
development convenience, but web is the primary target; push only exists on
web.

## How the privacy games are enforced

Everything sensitive is row-level security in Postgres (`supabase/schema.sql`),
not app logic:

- **All tables**: visible only to the two members of the couple.
- **Blind reveal**: your partner's `answers` row for a date is SELECT-able
  only once your own row for that date exists. Until then it's also excluded
  from realtime events.
- **Letter seal**: a `letters` row is SELECT-able by *no one* until
  `unlock_at` passes. The vault list uses a `letter_vault` view that exposes
  only metadata (who, which month, when it unlocks) for the countdown.
- **Immutability**: answers and letters have no UPDATE/DELETE grants —
  sealed means sealed. Check-ins can be re-saved by their owner.
- **Pairing**: `create_couple` / `join_couple` are the only writers of
  membership; the two-person cap is checked atomically under a row lock.

## Where things live

```
App.tsx                       root: setup → welcome → tabs; owns the
                              presence/spark channel; desktop max-width frame
src/theme.ts                  colors (validated palette), spacing, type
src/config/supabaseConfig.ts  ← paste URL, anon key, VAPID public key here
src/lib/                      supabase client, couple/pairing, statuses
                              (weather + push subscription), realtime
                              (presence + sparks), checkins, questions,
                              letters, push (Web Push), platform seams
src/components/               orb, sliders, weather picker, trend strips, ...
src/screens/                  Today, Check-in, Question, Letters, Us
public/                       manifest.json, sw.js (push handlers), icons
scripts/                      build:web finalizer, webpush crypto self-test
supabase/schema.sql           tables + RLS + RPCs — run in the SQL editor
supabase/functions/send-push  Edge Function: verifies membership, sends
                              VAPID Web Push (self-contained, no deps)
```

## Good to know

- **Reinstalling / clearing site data gets you a fresh anonymous identity.**
  The space and all data survive, but your member slot stays taken by the
  old identity — the app can't tell it's still you. Keep your invite code
  handy (Us tab): rejoining works only while the space has a free slot, so
  don't clear Safari website data for the app casually.
- **Sealed letters update the partner's vault on their next app open** (a
  sealed letter is invisible to realtime by design — the server won't even
  emit an event for it).
- Sparks are ephemeral broadcasts: nothing is stored, they just glow.

## Ideas already sketched for v3

Same Sky Moment, Memory Jar, The Echo, Conflict Compass, Dare Deck, Veto
Game, Strangers Again — the data model (everything keyed by `couple_id`)
was chosen so these bolt on without migrations.
