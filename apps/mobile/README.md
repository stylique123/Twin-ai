# TwinAI Mobile (iOS) — Expo app

The iOS app for TwinAI. It is **another client of the same backend** as the web
app — same Supabase project, same edge functions, same `jobs` queue, same VPS
worker (see the repo-root `ARCHITECTURE.md`). It reuses `@twinai/shared` for all
data types and backend calls; only the UI + camera/recording are mobile-specific.

## Phase 1 scope (this build)
Auth → Onboarding (voice from a handle) → Library → Create (paste a reference →
blueprint) → Blueprint (pick hook + read script) → Record (camera + teleprompter
→ auto-edit → play the finished vertical). Billing, publishing, agency, admin,
gallery submissions, and push notifications come later.

## Run it (needs a Mac for the iOS Simulator)
From the **repo root** (workspaces install everything):
```bash
npm install
```
Then configure env and start:
```bash
cd apps/mobile
cp .env.example .env        # fill EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo install            # aligns native dep versions to your installed Expo SDK
npx expo start --ios        # opens the iOS Simulator (press "i")
```
Use the **same** Supabase URL + anon key as the web app's `.env.production`
(`VITE_SUPABASE_*`) — it's the same backend.

> The first time, run `npx expo install` so the RN/Expo native module versions
> match your SDK exactly (the versions in `package.json` are SDK 52 baselines).

## Ship to a device / TestFlight (later — needs an Apple Developer account)
```bash
npm i -g eas-cli && eas login
eas build:configure
eas build -p ios            # cloud build → install on device / submit to TestFlight
eas submit -p ios
```
Before an EAS build, add app `assets/` (icon + splash) and reference them in
`app.json` (`expo.icon`, `expo.splash.image`).

## Layout
```
app/                 expo-router screens
  _layout.tsx        AuthProvider + auth redirect gate
  sign-in.tsx        email/password
  index.tsx          Library (listGenerations)
  onboarding.tsx     voice from handle (startDna/pollDna)
  create.tsx         ingestReference → generateBlueprint
  blueprint/[id].tsx hook picker + script (Scene Timeline)
  record/[id].tsx    camera + teleprompter → autoEditTake → play result
src/
  lib/supabase.ts    RN client (AsyncStorage) + initApi() wiring
  context/AuthContext.tsx
  components/ui.tsx   Screen/Button/Field/Card/H1/Body primitives (brand tokens)
  theme.ts           brand colors (mirror of the web Tailwind tokens)
```
