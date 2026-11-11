# TwinAI design handoff: read this first

You are Claude Code, working in the `stylique123/Twin-ai` repo. This folder holds the new TwinAI design. Your job is to rebuild the real app to match it, one part at a time, without breaking what already works.

## 1. What's in this folder

| Folder | What it is | How to use it |
|---|---|---|
| `screenshots/desktop/` | One full-page picture of every desktop screen (1440 px wide) | **What it should look like.** Open these with your image viewer before building a screen |
| `screenshots/phone/` | The same screens on a phone (390 px wide), files start with `M` | How the same page looks narrow |
| `screenshots/create-states/` | The Create flow in its important states | Create has many states. These show the key ones |
| `boards/*.dc.html` | The interactive design boards (HTML + a small runtime) | **The exact words, colors, spacing and behavior.** Read the markup for copy and sizes. To click through them, run `python3 -m http.server 8000` in **this folder (not inside `boards/`)** and open `http://localhost:8000/boards/Create.dc.html`, so the pictures and videos in `assets/` load. Each board has a dashed **DESIGN PREVIEW** bar at the top: click it to see every screen and state |
| `assets/` | Every picture and video the design uses (4 videos, 14 images, the logo) | **Read `assets/ASSETS.md` before using any of them.** It says which are real marketing media for the Landing page and which are placeholders that must be replaced by the user's real data |
| `specs/screen-map.md` | Which board is which route and which file in the repo | **Your map.** Check it before every task |
| `specs/create-flow-v4.md` | The full rules for the Create flow (the hardest part) | Read it in full before touching Create |
| `reference/create-flow-logic.js` | The state logic behind the Create board (what's required, what turns Continue on, which panel shows) | A reference for the rules. **Don't copy it into the app**, it's design-preview code |

**The boards are mockups, not production code.** They use inline styles and a design runtime (`support.js`, `<sc-if>`, `<sc-for>`, `{{ holes }}`, `class Component extends DCLogic`). Never copy that markup or runtime into the app. Rebuild each screen in the repo's own stack (React + TypeScript + Tailwind + the primitives in `DESIGN.md`).

## 2. Four parts, one app

The owner thinks of the design as four parts: **Website · Onboarding · App · Phone**. In code it is **one responsive web app** (see the root `package.json`: "the web app is the single client surface (phone + desktop)").

- **Phone is not a separate app or separate pages.** Every `M…` board is the phone width of the same React page as its desktop board. Build each page once, mobile-first, and check it at **390, 768 and 1440 px.**
- Phone-only patterns to get right:
  - the bottom tab bar instead of the sidebar (`AppShell`);
  - panels and pop-ups become **bottom sheets**;
  - Continue becomes a **sticky bar** at the bottom;
  - long chip rows scroll sideways;
  - 44 px tap targets;
  - safe-area insets.
- So the real work order is the three parts below, with phone done inside each one.

## 3. Rules that apply to every task

1. **The boards are the exact spec.** These rules win over anything else in this file and in `DESIGN.md`.
   1. **Match the boards exactly.** Same layout, words, sizes, spacing, colours, corner sizes, borders, gradients, shadows and animations. Don't swap in a "similar" style from DESIGN.md or an existing component if it looks different. If an existing component doesn't match the board, change the component or make a new one.
   2. **"Don't copy the markup" only means:** don't copy the design runtime (`support.js`, `<sc-if>`, `<sc-for>`, `{{ }}` holes, `DCLogic`). Do copy the structure and every value. Turn the board's inline styles into Tailwind classes (or arbitrary values like `rounded-[14px]`, `text-[14.5px]`, `gap-[13px]`) one for one.
   3. **DESIGN.md is only for naming.** If a board colour matches a token exactly, use the token. If it doesn't, add a new token with the board's exact value. Never round a value to the nearest existing token. The only allowed changes are:
      - text under 12px goes up to 12px;
      - `#0B0B0E` becomes `ink`.
   4. **Measure, don't guess.** Before building each screen, write a Playwright script that:
      - serves `design-handoff/` (`python3 -m http.server 8000` from that folder);
      - opens the board at 1440px and 390px;
      - picks the DESIGN PREVIEW state you're building;
      - saves the computed styles of every visible element (font size, weight, line height, letter spacing, colours, padding, gap, radius, border, width, height) to a JSON file.
      Build from those numbers.
   5. **Prove it matches.** For every screen and state, screenshot the board and the real page at the same size and state, make a pixel-difference image, and report the percentage that differs. Fix it until the only differences are real data and fonts loading. Put each board / app / difference set side by side in the PR description.
   6. **Never invent content.** Test and preview pages use the board's own example content, never made-up content.
   7. **Every screen size, everything working.**
      - **A. Sizes to support.** Build and check every screen at 375, 390, 430 (phones), 744, 820, 1024 (iPad), 1180, 1366 (iPad landscape), 1440 and 1920 (desktop). Phone widths must match the M… boards. 1440 must match the desktop boards. Everything in between follows B and C.
      - **B. Layout by width.**
        - Under 768: phone layout exactly as the M… boards. Bottom tab bar, bottom sheets, sticky Continue bar, and chip rows that scroll sideways.
        - 768 to 1023 (iPad portrait): use the desktop page structure and components. The sidebar becomes an icon rail (72px) with labels in tooltips; never a hamburger menu. Grids drop one column (4→2, 3→2, 2 stays 2). Pop-ups are centred dialogs, max 560px wide. The Continue bar stays [the rest of this rule was cut off in the owner's message, to be completed]
      - **C.** [not received yet, to be completed]
   Tools for 1.4 and 1.5 live in `design-handoff/tools/` (`measure.js`, `diff.py`).
2. **Copy is exact.** Use the words on the boards, in plain everyday language. Don't add jargon ("hook", "beat", "arc"). Don't add hype.
3. **Example data and media are fake.** Maya, Maya's Coffee, @brewbyjo, Signature Blend, Northfield Gooseneck Kettle and all the numbers are placeholders. Wire every screen to the real data and API calls the page already uses. **Never ship the placeholder names or numbers.** Never show a made-up number in the product (viewer scores, counts). The same goes for the pictures and videos in `assets/`: only the Landing page media ships (see `assets/ASSETS.md`). In-app screens show the user's real camera, clips and Gallery thumbnails.
4. **Keep the plumbing.** Most pages already exist and have tests (`*.test.ts(x)` next to them). Change the look and flow, keep the data loading, auth, routing and edge-function calls. Run the tests. If a test fails because the design changed the behavior on purpose, update the test and say why in the commit. If it fails for any other reason, fix your code.
5. **Reuse what exists.** Before building a new component, search `apps/web/src/components/`. Many pieces already exist, for example `UsingList`, `GeneralVersionBanner`, `AngleQuestionsCard`, `TestViewers`, `BuildProgress`, `ProductTour`, `FocusTeleprompter`, `SchedulePostDialog`, `ProductFields`.
6. **Routes:** follow the rules written in `App.tsx`. Every new in-app route must be added to the `inApp` list, or the screen goes black. Public pages (`/privacy`, `/terms`) must **not** be on that list.
7. **Small steps.** One part per branch and pull request. Inside a part, one screen per commit. Don't change backend, Supabase or worker code unless a screen truly can't work without it, and ask first if you need to.
8. **Check your work like a designer.** After each screen:
   - Run the app and take Playwright screenshots at 390, 768 and 1440 px.
   - Put each one next to the matching file in `screenshots/` and fix the differences.
   - Click through every state shown in the board's DESIGN PREVIEW bar.
9. **Accessibility:**
   - Real buttons and links.
   - `role="radio"` / radiogroup for single choices.
   - `aria-live` for step lists and progress.
   - Visible focus.
   - Respect `prefers-reduced-motion`.
10. **When unsure, ask the owner.** Don't guess routes, data fields or product rules.

## 4. The order to build in

Do the parts in this order. Finish and get approval on one before starting the next.

### Part 0: Setup (small, do first)
- Read `DESIGN.md`, `ARCHITECTURE.md`, `apps/web/tailwind.config.js` and `apps/web/src/index.css`.
- Read `assets/ASSETS.md`. Compress the Landing videos and images and copy them into `apps/web/public/landing/` (sizes and settings are in that file).
- Compare the boards' colors, radii and type to the tokens. List any token the design needs that's missing (for example the muted amber for warnings, or the faint background shading). Add those tokens once, in the theme, before building screens.
- Build the shared pieces the parts reuse:
  - a bottom-sheet / centered-dialog component (sheet on phone, dialog on desktop);
  - the footer (logo, "© 2026 Twin Studios LLC. All Rights Reserved.", Product / Account / Legal columns);
  - the radio-row style used for single choices.

### Part 1: Website
Boards: `Landing`, `MLanding`, `Privacy`, `Terms`.
- Landing page + footer.
- New `/privacy` and `/terms` pages: centered column, an "at a glance" row, numbered sections that open and close.
- The free offer says **3 free videos** (not scripts): "One credit is one whole video: script, teleprompter, edit and post."

- Use the videos and images from `assets/` (already compressed in Part 0) for the hero phones and the "who it's for" cards. Each video needs a poster image and must stop playing when the user prefers reduced motion.
### Part 2: Onboarding
Boards: `Welcome`, `Connect`, `Reading`, `Stories`, `Meet` (+ the `M…` versions).
- Sign up and Sign in are different screens with different words and animations.
- Reading has 3 quick steps. Stories is its own screen. Your voice (Meet) is the full review.
- The failure states on Connect (private, no posts, rate limited) each name the reason and offer "Try on another platform" and "Describe it myself".
- Progress moves only when a step really finishes.

### Part 3: The app
Do the screens in this order:
1. `AppShell` (sidebar + phone tab bar).
2. Home (`/dashboard`).
3. **Create v4.** Read `specs/create-flow-v4.md` fully, section A first. Then build in this order:
   1. the Create screen, all four modes;
   2. Wait 1;
   3. the angle screen and its panels;
   4. Wait 2;
   5. the general-version banner on Result.
4. Script / Result.
5. Gallery (picking a video opens Create in "A video I liked" with the link filled in).
6. Products.
7. My Twin.
8. Settings.
9. Calendar.
10. First-time tour.
11. After the script: Record → Upload → How did it go? → AI edit → Schedule a post → How it did.

## 5. Prompts the owner can paste, one per session

Start each Claude Code session with the prompt for that part:

**Part 0**
> Read `design-handoff/START_HERE.md` and do Part 0 only. Show me the token gaps you found and the shared components you'd add before writing code.

**Part 1**
> Read `design-handoff/START_HERE.md`, then build Part 1 (Website) following it. Use `specs/screen-map.md` for routes. Compare against `screenshots/desktop/Landing.webp`, `Privacy.webp`, `Terms.webp` and `screenshots/phone/MLanding.webp` at 390/768/1440. Open a PR when done.

**Part 2**
> Read `design-handoff/START_HERE.md`, then build Part 2 (Onboarding) on `/auth` and `/onboarding`, keeping the existing onboarding logic and tests. Compare every step against the screenshots and the board previews.

**Part 3, Create only (give it its own session)**
> Read `design-handoff/START_HERE.md` and `design-handoff/specs/create-flow-v4.md` (section A wins over B). Rebuild `/v2` and `/v2/building` to match `boards/Create.dc.html` and `boards/MCreate.dc.html`, keeping the real data and edge-function calls. First write me a plan that lists each state and which existing component you'll reuse, then build.

**Part 3, the rest**
> Read `design-handoff/START_HERE.md`, then rebuild these app screens one commit each: [list from section 4]. Use the screen map. Stop and ask if a board has no clear route.

## 6. Done means
- Every screen matches its screenshot at 1440 and 390 px, and looks sensible at 768 px.
- Every state in the board's DESIGN PREVIEW bar exists in the real app (or you've told the owner which ones need backend work).
- `npm run typecheck` and the test suite pass.
- No placeholder names or fake numbers anywhere in the shipped app.
- No emoji, one teal, no text under 12 px, nothing overlapping on a phone.
