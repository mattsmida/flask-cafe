# Ember 🔥

A small warm place for two people across a distance. Not a chat app — a
companion to one. Built with Expo (React Native + react-native-web) on
Supabase, shipped as an installable web app (PWA) with real push
notifications — no app store, no Apple Developer Program.

## What's inside (v2)

- **Presence** — when you both have the app open, the orb on the Today screen
  breathes and glows. No message, just *we're both here*.
- **Spark button** — one tap: "thinking of you." Their orb flares if they're
  in the app, and their phone gets a push notification if they're not.
- **Weather of the heart** — sunny / cloudy / stormy instead of "how are you."
- **Daily check-in** — three sliders (energy, heart, connection) plus one word.
  A two-week pattern view shows both of you side by side.
- **Blind daily question** — same question on both devices, picked from a pool
  of 60. The *server* keeps answers sealed until both of you have answered.
- **Future letters** — once a month, a shared prompt. Each letter is sealed
  for three months — server-enforced, even from its author — then unlocks for
  you both.

Pairing is by invite code: one of you creates the space, the other joins with
a 6-letter code. Use it on your iPhones (installed to the Home Screen) and in
any desktop browser — long answers and letters are much nicer with a real
keyboard.

## One-time setup (~20 minutes, one of you does this)

### 1. Supabase (the sync layer, free tier)

1. Go to [supabase.com](https://supabase.com), create an account, and **New
   project** (pick a region close to the two of you, e.g. Frankfurt if you're
   both in Europe).
2. Open the **SQL Editor**, paste the entire contents of
   `ember/supabase/schema.sql`, and **Run**. (It's idempotent — safe to run
   again after edits.)
3. **Authentication → Sign In / Up →** make sure **Anonymous sign-ins** are
   enabled.
4. **Project Settings → API**: copy the **Project URL** and the **anon
   public** key into `ember/src/config/supabaseConfig.ts`.

### 2. Push notifications (Web Push, ~5 minutes)

1. Generate a VAPID key pair once:

   ```bash
   npx web-push generate-vapid-keys
   ```

   Put the **public** key into `vapidPublicKey` in
   `ember/src/config/supabaseConfig.ts`. Keep the private key for the next
   step.
2. Deploy the sender function and its secrets (needs the
   [Supabase CLI](https://supabase.com/docs/guides/cli), which `npx supabase`
   fetches on demand; log in once with `npx supabase login`):

   ```bash
   cd ember
   npx supabase functions deploy send-push --project-ref <your-project-ref>
   npx supabase secrets set --project-ref <your-project-ref> \
     VAPID_PUBLIC_KEY=<public key> \
     VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:you@example.com
   ```

### 3. Build and host the app (free static hosting)

```bash
cd ember
npm install
npm run build          # exports the web app into ember/dist
```

Deploy `dist/` anywhere static. Cloudflare Pages is the documented path:

```bash
npx wrangler pages deploy dist --project-name ember
```

(First run: `npx wrangler login`, and accept creating the project. Redeploy
after any config change or update by re-running build + deploy.) You'll get a
stable `https://ember-xxx.pages.dev` URL — that URL is your app.

### 4. Install it on your iPhones

1. Open the URL in **Safari**.
2. Tap **Share → Add to Home Screen**. (This matters: iOS only gives push
   notifications to installed home-screen web apps, iOS 16.4+.)
3. Open **Ember from the Home Screen icon**. One of you taps **Create our
   space** and shares the code; the other joins with it.
4. On the **Us** tab, tap **Enable notifications** on each device.

On a desktop browser (Windows/Mac/Linux) just open the same URL — the app
runs in a centered phone-width column, and you can enable notifications there
too.

## Everyday development

```bash
cd ember
npm install
npx expo start --web     # live-reload in a browser
```

The native path (`npx expo start` + Expo Go on a phone) still works for
development, but the web app is the product: Expo Go can't receive push
notifications, and a native iOS build would need the paid Apple Developer
Program — the whole reason v2 is a PWA.

## Good to know

- **Privacy model:** all data lives in *your* Supabase project, readable only
  by the two anonymous users in the couple (row-level security). The blind
  reveal and the three-month letter seal are enforced by the database, not
  the app.
- **Sparks are ephemeral.** They ride a realtime channel (plus a push
  notification) and are never stored.
- **Signing out / reinstalling gets that device a fresh anonymous identity.**
  The space and all data survive, but a spot for rejoining only opens if it
  was never taken — so don't clear Safari's website data casually. Your
  invite code is on the Us tab; screenshot it.
- **If notifications stop** (iOS can drop a subscription after a long
  offline stretch), open the Us tab and enable them again.

## Where things live

```
App.tsx                       root: setup → welcome → tabs (+ desktop column)
src/theme.ts                  colors (validated palette), spacing, type
src/config/supabaseConfig.ts  ← paste your Supabase URL/key + VAPID public key
src/lib/                      supabase client, couple/pairing, status
                              (presence, weather, sparks), checkins,
                              questions, letters, push
src/components/               orb, sliders, weather picker, trend strips, ...
src/screens/                  Today, Check-in, Question, Letters, Us
supabase/schema.sql           tables, RLS policies, RPCs — run in SQL editor
supabase/functions/send-push  edge function that delivers Web Push
public/                       PWA manifest, service worker, icons
scripts/inject-pwa.js         stamps PWA tags into the exported index.html
```

## Ideas already sketched for v3

Same Sky Moment, Memory Jar, The Echo, Conflict Compass, Dare Deck, Veto Game,
Strangers Again — the data model (everything keyed by one couple id) was
chosen so these bolt on without migrations.
