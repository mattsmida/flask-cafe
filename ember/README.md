# Ember 🔥

A small warm place for two people across a distance. Not a chat app — a
companion to one. Built with Expo (React Native) + Firebase.

## What's inside (v1)

- **Presence window** — when you both have the app open, the orb on the Today
  screen breathes and glows. No message, just *we're both here*.
- **Spark button** — one tap: "thinking of you." The other phone's orb flares
  (and gets a push notification in a real build).
- **Weather of the heart** — sunny / cloudy / stormy instead of "how are you."
- **Daily check-in** — three sliders (energy, heart, connection) plus one word.
  A two-week pattern view shows both of you side by side.
- **Blind daily question** — same question on both phones, picked from a pool
  of 60. Answers stay sealed until *both* of you have answered.
- **Future letters** — once a month, a shared prompt. Each letter is sealed
  for three months, then unlocks for you both.

Pairing is by invite code: one of you creates the space, the other joins with
a 6-letter code.

## One-time setup (~15 minutes, one of you does this)

### 1. Firebase (the sync layer, free tier)

1. Go to [console.firebase.google.com](https://console.firebase.google.com),
   **Add project** (name it anything; Analytics off is fine).
2. **Build → Authentication → Get started → Anonymous → Enable.**
3. **Build → Firestore Database → Create database** (production mode, any
   region close to you two).
4. In Firestore → **Rules**, paste the contents of `firestore.rules` from this
   folder and publish.
5. **Project settings (gear) → Your apps → Web app (`</>`)** → register (no
   hosting needed). Copy the `firebaseConfig` values into
   `src/config/firebaseConfig.ts`.

### 2. Run it

```bash
cd ember
npm install
npx expo start
```

Install **Expo Go** from the App Store on both iPhones, scan the QR code, and
you're in. One of you taps **Create our space** and shares the code; the other
joins with it.

> Both phones need to reach the dev server, so easiest is being on the same
> network — or run `npx expo start --tunnel`. For everyday use without your
> computer running, make a real build (below).

## Known limits of running inside Expo Go

- **Push notifications don't arrive in Expo Go** (Expo removed remote push
  from Go in SDK 53). Sparks and everything else still sync live whenever the
  app is open. To get real notifications, create a development build or a
  TestFlight build: `npx eas build --platform ios` (needs a free Expo account;
  TestFlight distribution needs the $99/yr Apple Developer Program).
- **The blind reveal is enforced by the app, not the server** (v1). The
  Firestore rules keep outsiders away from all your data, but a determined
  partner with your Firebase credentials could technically peek. It's an
  honor-system game — that's rather the point.
- **Reinstalling the app gets you a fresh anonymous identity.** The space and
  all data survive, but a full spot for rejoining only opens if it was never
  taken; keep that in mind before deleting the app. (Your invite code is shown
  on the Us tab — screenshot it.)

## Where things live

```
App.tsx                     root: setup → welcome → tabs
src/theme.ts                colors (validated palette), spacing, type
src/config/firebaseConfig.ts  ← paste your Firebase config here
src/lib/                    firebase, couple/pairing, status (presence,
                            weather, sparks), checkins, questions, letters, push
src/components/             orb, sliders, weather picker, trend strips, ...
src/screens/                Today, Check-in, Question, Letters, Us
firestore.rules             security rules — paste into Firebase console
```

## Ideas already sketched for v2

Same Sky Moment, Memory Jar, The Echo, Conflict Compass, Dare Deck, Veto Game,
Strangers Again — the data model (everything under one `couples/{id}` doc)
was chosen so these bolt on without migrations.
