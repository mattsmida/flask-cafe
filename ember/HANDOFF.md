# Ember — Phase 2 brief (Firebase → Supabase + PWA with Web Push)

This file is the working brief for the next Claude Code session. Read it fully
before writing code. Delete this file in the final commit of the phase — the
README should absorb anything durable.

## What Ember is

A private two-person app for a long-distance couple (see `README.md`). v1 is
complete and pushed: Expo (React Native, TypeScript), Firebase sync, five tabs
— Today (presence orb, spark button, weather of the heart), Check-in (three
sliders + one word + 14-day two-person trend strips), Question (blind daily
question from a 60-item pool), Letters (monthly prompt, sealed 3 months), Us
(pairing code, sign-out). Pairing is by 6-letter invite code; identity is one
anonymous auth user per phone; everything lives under `couples/{id}`.

Architecture note that makes this phase tractable: **screens and components
never import Firebase directly.** All backend access goes through the modules
in `src/lib/` (`firebase.ts`, `couple.ts`, `status.ts`, `checkins.ts`,
`questions.ts`, `letters.ts`, `push.ts`). Swap the internals of those modules
and keep their exported signatures (or improve them minimally) and the UI
should barely change.

## Why phase 2

The owner (Matt) wants: (1) **no Google products** — Firebase must go;
(2) **no Apple Developer Program** — $99/yr is out, which on iOS rules out
native push entirely (APNs entitlement is paid-only); (3) **real push
notifications anyway**; (4) his environment is Windows + WSL, no Mac; both
partners use iPhones. He's fine with some manual maintenance.

The agreed solution: **Supabase replaces Firebase, and the app ships as a PWA**
(installable home-screen web app). Since iOS 16.4, home-screen web apps get
real Web Push through Apple's relay with no developer account. Desktop
browsers (his Windows PC) become a first-class way to use the app — he
specifically wants to type long answers/letters with a real keyboard.

## The work

### 1. Supabase replaces Firebase

- Free tier, region of the user's choice (put "pick a region close to you two,
  e.g. Frankfurt" in the README; don't hardcode).
- **Auth:** Supabase anonymous sign-in (`signInAnonymously()`), session
  persisted (localStorage on web / AsyncStorage on native via the supabase-js
  storage option).
- **Schema** (SQL file `ember/supabase/schema.sql`, applied by the user in the
  Supabase SQL editor — keep it one idempotent file; include the RLS policies
  and the RPC below):
  - `couples(id uuid pk, code text unique, created_at)`
  - `members(couple_id fk, uid uuid, name text, pk (couple_id, uid))` — max 2
    enforced in the join RPC.
  - `statuses(couple_id, uid, weather text, weather_at, push_subscription
    jsonb, pk (couple_id, uid))` — note: heartbeat/presence moves OUT of the
    database (see Realtime below), so no `last_active_at` needed.
  - `checkins(couple_id, uid, date date, energy int, heart int, connection
    int, word text, at timestamptz, pk (couple_id, uid, date))`
  - `answers(couple_id, uid, date date, text text, at, pk (couple_id, uid,
    date))`
  - `letters(couple_id, uid, month text, prompt text, text text, written_at,
    unlock_at, pk (couple_id, uid, month))`
- **RLS everywhere.** Membership check: uid is in `members` for that couple.
  Two policies are the point of this migration — enforce server-side what v1
  left to the UI:
  - `answers` SELECT: own rows always; partner's row for a date **only if your
    own row for that (couple, date) exists**.
  - `letters` SELECT: own and partner's rows **only when `unlock_at <= now()`**
    (metadata for locked letters can be exposed via a view or a
    `security definer` function returning month/uid/unlock_at only — the vault
    list UI needs to show locked entries with countdowns).
  - Writes: INSERT only your own rows (`uid = auth.uid()`); answers and
    letters are immutable (no UPDATE policy); checkins upsertable by owner.
- **Join flow:** `join_couple(code text, name text)` as a `security definer`
  RPC — validates the code, checks member count < 2, inserts the member row
  atomically. `create_couple(name text)` RPC generates the 6-char code
  (alphabet without 0/O/1/I/L, as in v1).
- **Realtime:**
  - Live data (answers, checkins, letters, partner weather): Supabase Realtime
    `postgres_changes` subscriptions replacing Firestore `onSnapshot`.
    Postgres-changes events are subject to RLS, but don't rely on events alone
    — refetch on event to keep the blind-reveal logic simple and correct.
  - **Presence:** use Supabase Realtime's built-in Presence on a
    `couple:{id}` channel — replaces v1's heartbeat-timestamp hack entirely.
    Track on focus/appear, untrack on background.
  - **Sparks:** Realtime Broadcast on the same channel (ephemeral, nothing
    stored) + the push notification below for when the partner is closed.
- Remove `firebase` and `@firebase/auth` deps, `src/lib/firebase.ts`,
  `firestore.rules`, and the `@firebase/auth` paths hack in `tsconfig.json`.
  Replace `src/config/firebaseConfig.ts` with `supabaseConfig.ts` (URL + anon
  key placeholders, same `isConfigured()` pattern, same in-app SetupScreen
  behavior when unconfigured).

### 2. PWA + Web Push

- Target: `npx expo export --platform web` output, deployed as a static site
  (README instructions for Cloudflare Pages or Netlify free tier — build
  command and output dir; either is fine, pick one and document it).
- Add a web manifest (name Ember, dark background `#171210`, standalone
  display, icons — generate from the existing assets) and a service worker
  registered only on web. The service worker handles `push` and
  `notificationclick` events. Keep it minimal — offline caching is optional
  polish; push is the requirement.
- **Web Push:** standard VAPID flow, no Firebase/FCM SDK anywhere:
  - Generate VAPID keys once (document the command, e.g. `npx web-push
    generate-vapid-keys`); public key in app config, private key as a
    Supabase Edge Function secret.
  - On iOS, `Notification.requestPermission()` only works for an
    **installed** (Add to Home Screen) app and must be called from a user
    gesture — put an "Enable notifications" button/banner in the Us tab and/or
    onboarding, don't request on load. Detect and gently explain the
    add-to-home-screen prerequisite on iOS Safari.
  - Store each member's `PushSubscription` JSON in `statuses.push_subscription`.
  - Sending: a Supabase Edge Function `send-push` (service role; verifies the
    caller's JWT and membership) that takes `{couple_id, type}` and sends to
    the partner's subscription. Wire sparks to it; if trivial to add, also
    notify "answered the daily question" and "checked in" — but sparks first.
- **Desktop layout:** the app must feel right in a desktop browser window —
  wrap screens in a centered max-width (~560px) column on wide viewports;
  verify TextInputs, the PanResponder slider, and tab bar work with mouse
  (react-native-web maps PanResponder to mouse events — verify, and fix or
  swap for a pointer-based implementation if broken).
- Keep the native/Expo Go path compiling (it's free to keep as a dev
  convenience), but **web is the primary target now**. `src/lib/push.ts`'s
  Expo-push path can be deleted along with the expo-notifications/expo-device
  deps if they complicate the web build — Web Push replaces it.

### 3. Verification (this environment can do more for web than it could for iOS)

- `npx tsc --noEmit` clean.
- `npx expo export --platform web` builds.
- **Actually run it**: serve the export (or `expo start --web`) and drive it
  with Playwright (Chromium is preinstalled at `/opt/pw-browsers/chromium`,
  `PLAYWRIGHT_BROWSERS_PATH` is set) — two browser contexts, create + join a
  couple, exchange a spark, verify presence and the blind reveal (answer with
  one, confirm hidden; answer with the other, confirm both revealed).
  This needs a real Supabase project; if none is configured in the session,
  verify against a local mock or at minimum screenshot the SetupScreen and
  onboarding flows and state clearly what was and wasn't exercised.
- Update `README.md` fully: Supabase setup (project → run schema.sql → paste
  URL/anon key → deploy Edge Function → VAPID keys), hosting deploy, iPhone
  install (Share → Add to Home Screen → enable notifications), desktop use.
  Remove the Firebase walkthrough and the stale limitations it documented
  (push-in-Expo-Go, honor-system blind reveal — both are fixed by this phase).

## Constraints & style

- No Google services anywhere (no Firebase, no FCM, no Google Fonts CDN).
- Don't touch the flask-cafe code at the repo root.
- Keep the existing visual language (`src/theme.ts`) — the ember/violet series
  colors are palette-validated for the dark surface; don't change them.
- Keep the `src/lib/` isolation: screens shouldn't know Supabase exists.
- Work on branch `claude/longdistance-relationship-app-wx3kkb` if the session
  allows; otherwise branch from it and say so. Commit in meaningful steps and
  push when green.
