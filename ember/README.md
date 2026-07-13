# Ember 🔥

A small warm place for two people across a distance. Not a chat app — a
companion to one. Expo (React Native + TypeScript) on top of **Supabase**,
shipped as an **installable web app (PWA)** with real push notifications —
no Google services, no Apple Developer Program, no app store.

## What's inside (v3)

- **Presence** — when you both have Ember open, the orb on the Today screen
  breathes and glows. No message, just *we're both here*.
- **Spark button** — one tap: "thinking of you." The other side's orb flares
  live, and a push notification lands on every device they've registered if
  their app is closed.
- **Weather of the heart** — sunny / cloudy / stormy instead of "how are you."
- **Daily check-in** — three sliders (energy, heart, connection) plus one
  word. A two-week pattern view shows both of you side by side.
- **Blind daily question** — same question on both devices, picked from a
  pool of 60. Answers are sealed **by the server** until both of you have
  answered — no peeking, not even with developer tools.
- **Future letters** — once a month, a shared prompt. Each letter is sealed
  for three months — the server won't hand it to *anyone*, its author
  included, until unlock day.
- **Multi-device** — the same person can use Ember from their phone *and*
  their desktop as one identity: check in on your phone, come back to a
  half-written letter on your desktop. See "Using Ember on more than one
  device" below.

Pairing is by invite code: one of you creates the space, the other joins
with a 6-letter code. That gets you two **people** — the actual member
slots, capped at two. Each person can then link any number of **devices**
to themselves with a separate, private device code (Us tab) — identity is
per person, not per browser session.

## One-time setup (one of you does this, ~15 minutes)

### 1. Supabase (the sync layer, free tier)

**Brand new project?**

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

**Already running an earlier version of Ember** (from before multi-device
support existed)? Run these two files back to back, in order, in the SQL
editor — expect the app to show errors for the few seconds between them,
that's expected:

1. `supabase/migrations/0002_multi_device.sql` — restructures your existing
   data (nothing is deleted; the old table is kept as a backup) into the
   person/device shape.
2. `supabase/schema.sql` — reinstalls the current policies and functions on
   top of it.

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

### 5. Using Ember on more than one device

Want to check in on your phone and write a letter on your desktop, as the
*same* you? On your first device's **Us tab**, under "Your device code",
you'll find a private 6-character code (separate from the couple invite
code). Open Ember on the second device, and instead of "Create our space"
or "Join with code," use the **"Already using Ember on another device?"**
card on the Welcome screen and enter that code — it attaches as another
device for you, not a new person, and immediately shows your existing
check-ins, answers, and letters.

Keep that code private — it's not the couple invite code, it's closer to a
password: anyone who has it can add a device as *you*. If you're ever
worried it leaked, tap **"Get a new code"** on the Us tab; the old one stops
working immediately (already-linked devices are unaffected).

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

- **All tables**: visible only to the two people (across all of their
  devices) in the couple.
- **Blind reveal**: your partner's `answers` row for a date is SELECT-able
  only once your own row for that date exists — checked per *person*, so it
  doesn't matter which of your devices answered. Until then it's also
  excluded from realtime events.
- **Letter seal**: a `letters` row is SELECT-able by *no one* until
  `unlock_at` passes. The vault list uses a `letter_vault` view that exposes
  only metadata (who, which month, when it unlocks) for the countdown.
- **Immutability**: answers and letters have no UPDATE/DELETE grants —
  sealed means sealed. Check-ins can be re-saved by their owner.
- **Pairing**: `create_couple` / `join_couple` are the only writers of
  `persons`; the two-person cap is checked atomically under a row lock.
- **Device linking**: a private `device_link_codes` row per person, visible
  only to that person (not even their partner can read it) — the only way a
  new device can attach to an existing identity instead of creating a new
  one. The `devices` table itself grants nothing to the client at all; it's
  only ever touched through `create_couple` / `join_couple` / `link_device`
  / `save_push_subscription`.

## Where things live

```
App.tsx                       root: setup → welcome → tabs; owns the
                              presence/spark channel; desktop max-width frame
src/theme.ts                  colors (validated palette), spacing, type
src/config/supabaseConfig.ts  ← paste URL, anon key, VAPID public key here
src/lib/                      supabase client, couple/pairing + device
                              linking, statuses (weather), realtime
                              (presence + sparks, keyed by person), checkins,
                              questions, letters, push (Web Push, per
                              device), platform seams
src/components/               orb, sliders, weather picker, trend strips, ...
src/screens/                  Today, Check-in, Question, Letters, Us
public/                       manifest.json, sw.js (push handlers), icons
scripts/                      build:web finalizer, webpush crypto self-test
supabase/schema.sql           tables + RLS + RPCs — run in the SQL editor
                              (persons = member slots, devices = per-browser
                              identities linked to a person)
supabase/migrations/          one-time upgrade scripts for existing projects
supabase/functions/send-push  Edge Function: verifies membership, sends
                              VAPID Web Push to every device the partner has
                              registered (self-contained, no deps)
```

## Good to know

- **Clearing site data / reinstalling on a device you'll keep using** —
  before you do, grab that device's code from the Us tab if you can (or from
  another already-linked device of yours), then link it again with **"Already
  using Ember on another device?"** on the Welcome screen. That reattaches
  the fresh browser session to your existing person, with all your history
  intact.
- **If you clear the only device you had, with no code saved** — the app
  can't tell a fresh anonymous session is still "you," and rejoining with
  the couple invite code won't work (that's for a *new* person, and your
  slot is already taken). Recovery is one read-only lookup in the Supabase
  SQL editor — no data is touched:
  ```sql
  select p.name, dc.code from persons p
    join device_link_codes dc on dc.person_id = p.id
    join couples c on c.id = p.couple_id
    where c.code = 'YOUR_INVITE_CODE';
  ```
  Use the matching device code in the app's **"Already using Ember on
  another device?"** flow to reattach to your existing person, history
  intact.
- **Sealed letters update the partner's vault on their next app open** (a
  sealed letter is invisible to realtime by design — the server won't even
  emit an event for it).
- Sparks are ephemeral broadcasts: nothing is stored, they just glow.

## Ideas already sketched for v4

Same Sky Moment, Memory Jar, The Echo, Conflict Compass, Dare Deck, Veto
Game, Strangers Again — the data model (everything keyed by `couple_id`)
was chosen so these bolt on without migrations.
