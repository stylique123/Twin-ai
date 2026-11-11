# Screen map: design board → route → file in the repo

Every row is ONE responsive React page. The desktop board (1440 px) and the phone board (`M…`, 390 px) show the same page at two widths. Do not build two versions.

"Today" is what the repo had when this was written (`apps/web/src/App.tsx`). Check it again before you start. Files move.

## Part 1: Website (no login)

| Desktop board | Phone board | Route | File today | Notes |
|---|---|---|---|---|
| Landing | MLanding | `/` | `pages/Landing.tsx`, `components/Nav.tsx` | Footer: logo, "© 2026 Twin Studios LLC. All Rights Reserved.", one block with Product / Account / Legal columns |
| Privacy | (same page, narrow) | `/privacy` | **new** `pages/Privacy.tsx` | Centered column, "at a glance" row, numbered sections that open and close |
| Terms | (same page, narrow) | `/terms` | **new** `pages/Terms.tsx` | Same layout as Privacy |

`/privacy` and `/terms` are public pages. They must **not** be added to the `inApp` list in `App.tsx`, and they must sit above the `*` catch-all route.

## Part 2: Onboarding (logged in, not onboarded yet)

| Desktop board | Phone board | Route | File today | Notes |
|---|---|---|---|---|
| Welcome | MWelcome | `/auth` | `pages/Auth.tsx` | Sign up and Sign in get **different** left panels and animations |
| Connect ("Your handle") | MConnect | `/onboarding`, step 1 | `pages/Onboarding.tsx` | Includes the failure previews (private, no posts, rate limited) |
| Reading | MReading | `/onboarding`, step 2 | `pages/Onboarding.tsx` | 3 quick steps: About you, Your audience, Only you know |
| Stories | MStories | `/onboarding`, step 3 | `pages/Onboarding.tsx`, `components/StoryInterview.tsx` | Questions worded for her niche |
| Meet ("Your voice") | MMeet | `/onboarding`, step 4 | `pages/Onboarding.tsx`, `components/VoiceCardPanel.tsx` | Full voice review |

## Part 3: The app (sidebar on desktop, top bar and bottom tabs on phone)

| Desktop board | Phone board | Route | File today | Notes |
|---|---|---|---|---|
| Sidebar (component) | (bottom tab bar) | all app pages | `components/AppShell.tsx` | |
| Home | MHome | `/dashboard` | `pages/Dashboard.tsx` | |
| **Create (v4)** | **MCreate** | `/v2`, then `/v2/building` | `pages/v2/V2Create.tsx`, `pages/v2/V2Building.tsx` | The biggest job. Read `specs/create-flow-v4.md` first |
| Script | MScript | `/result/:id` | `pages/Result.tsx`, `components/ScriptEditor.tsx` | One step at a time. Add the "General version" banner (see the spec addendum) |
| Gallery | MGallery | `/gallery` | `pages/Gallery.tsx` | Picking a video goes to Create, "A video I liked", with the link filled in |
| Products | MProducts | `/products` (and `/brands`) | `pages/ProductLibrary.tsx`, `pages/Brands.tsx` | "+ Add a product" and "+ Add a brand" |
| MyTwin | MTwin | `/brain` | `pages/WhatTwinKnows.tsx` | One page: About you, then Around you |
| Settings | MSettings | `/settings` (+ `/billing`) | `pages/Settings.tsx`, `pages/Billing.tsx` | |
| Calendar | MCalendar | `/calendar` | `pages/Calendar.tsx` | Month and Week views, best-time slots |
| Tour | MTour | (overlay) | `components/ProductTour.tsx` | Shows once. Replay from Settings → How it works |

## Part 4: After the script (the rest of the loop)

| Desktop board | Phone board | Route | File today | Notes |
|---|---|---|---|---|
| Record | MRecord | `/record/:id` | `pages/v2/V2Capture.tsx`, `components/FocusTeleprompter.tsx` | Full screen on phone |
| Upload | MUpload | (inside the record flow) | `pages/v2/V2Capture.tsx` | Upload a clip instead of recording |
| Review ("How did it go?") | MReview | (after recording) | `components/DidYouFilmIt.tsx` | Upload states |
| Edit (AI edit) | MEdit | `/edit/:projectId/review` | `pages/v2/V2EditReview.tsx` | Checking, steps, your review, done, failures |
| Post ("Schedule a post") | MPost | (dialog from Result / Calendar) | `components/SchedulePostDialog.tsx` | Statuses, needs attention, post it yourself |
| Results ("How it did") | MResults | `/history` or `/metrics` (check) | `pages/History.tsx`, `components/PostInsights.tsx` | Comments turn into ideas for the next videos |

If a board has no clear home in the code, **ask the owner. Don't invent a route.**
