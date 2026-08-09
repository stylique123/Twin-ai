# TwinAI — build plan from the 2026-08-09 first-recording session

Written at the end of the session that landed #297, #301 and #304, applied
`0118` and `0119` to production, and put a real creator through onboarding →
DNA → plan → recording for the first time.

**What makes this document different from the ones before it:** every item below
was found by USING the product, not by reading it. Where a claim is evidenced by
a query, a grep or a CI guard, the evidence is named. Where something is
suspected and unreproduced, it says so rather than being listed as a bug.

Status legend:

| | |
|---|---|
| ✅ | Merged AND verified in production |
| 🟡 | Merged, deploy not verified |
| ⚠️ | Half-done — one half live, one half not |
| 🔴 | Open |
| 🚫 | Blocked on a human decision |
| ❓ | Reported, NOT reproduced — do not "fix" blind |

---

## 0. The one root cause

Three complaints that arrived separately are the same defect:

- the script is voice-accurate and content-empty ("stupid things")
- a tech creator gets the same script as a doctor
- "I never saw half these questions"

**A creator answers questions; the answers are validated, sanitized, stored — and
then read by nothing.** `scripts/ci/brief_consumers.json` already documents this
and calls it out in its own header. The generator has the creator's VOICE and
almost nothing else, so it can only produce well-shaped, well-voiced emptiness.

Everything in §4 and §5 is a face of this.

---

## 1. ✅ Done and verified in production

| Item | Evidence |
|---|---|
| **One click = one remix.** `generate-blueprint` had no idempotency; `V2Building` guards its build with a `useRef` that dies on remount, so navigating away and back started a second fully-charged build. Three navigations = three charges = one video. | `0119` applied; column + partial unique index confirmed by query. Merged `f9088558` (#304) |
| **`takes` bucket second write door closed.** `0006`'s INSERT policy let any authenticated user PUT bytes with no capture intent, no finalize record and no etag binding. | `0118` applied; `pg_policies` now shows only `twinai takes read` (SELECT) |
| **Credits restitution.** Two of the three duplicate builds were never owed. | `refund_credits` × 2 through the ledger: 20 restitution + 40 test grant. Balance 60 = 6 remixes |

## 2. 🟡 Merged, production deploy not verified

Frontend only. Vercel deploys from `main` automatically; nobody confirmed the
build landed. Do not assume these are live.

- **Unusable reference stops BEFORE the spend.** Previously `assessReference`
  judged the reference correctly, recorded a note, and spent anyway — telling
  the creator at 94% that the script was built from something else.
- **Trust screen stopped contradicting itself.** In pattern mode the banner said
  "We could not read this video" while every INTERPRETED row underneath claimed
  to be "a model's reading of the transcript". There was no transcript.
- **Recorder has somewhere to go.** The review screen's only exits were record
  again / download raw / leave, under a hardcoded "AI editing is being rebuilt".
  Now offers "Turn this into a video" once the source is SAVED, routing to
  `Result` (which already owns the start-edit flow) rather than adding a second
  start seam.
- **Branding** — `@` glyph, scan sparkle, building sparkle → `LogoMark`.

## 3. ⚠️ Half-done

| Item | State |
|---|---|
| **The editor is switched ON but has never run.** All four gates are live: `EDITOR_V2_START_ENABLED` (Supabase, set 05 Aug), `EDITOR_DIRECTOR_ENABLED` + `EDITOR_RENDER_ENABLED` + `GEMINI_API_KEY` (VPS `/opt/twinai-worker.env`, container restarted 06 Aug 15:24, verified by `docker exec printenv`). **`edit_projects` = 0.** Staging proves all 8 phases including the real render; production has never produced one. |
| **Docs describe a system that was turned on three days ago.** `phase7-exit-contract`, `phase5-production-signoff-evidence`, the open-items ledger and the recording-day runbook all say the editor is gated off. `verify-prod-gate.yml` still ASSERTS the secret is absent — it will fail, and the failure will be wrong. |
| **Landing page still says "AI editing — coming soon"** in three places. Deliberately untouched: it stays true until one edit succeeds. |

---

## 4. 🔴 Onboarding & questions — the biggest cluster

### 4a. What is asked, and what is read

Authoritative source: `scripts/ci/brief_consumers.json`.

| Question | Key | Asked? | Read? |
|---|---|---|---|
| Who you're talking to | `audience` | ✅ | ✅ `generate-blueprint` |
| What is your offer called | `offer` | ✅ | ✅ creator's answer beats the scan's guess |
| Anything you're not allowed to claim | `forbiddenClaims` | ✅ | ✅ |
| What do your videos promote | `promotes` | ✅ | ✅ strongest-wired; changes the CTA rule |
| **Your goal** | `goal` | ✅ | ❌ generator prefers voice profile → dna → the literal string `'turn attention into trust'` |
| **What do you do?** | `workKind` | ✅ | ❌ *"a doctor and a hobbyist get the same script"* |
| **"Something else" free text** | `workKindOther` | ❌ **never asked** | ❌ zero refs in `apps/web` |
| **Product evidence** | `productEvidence` | ❌ **never asked** | ❌ `PRODUCT_EVIDENCE_FORM` fully specified, no screen imports it |
| **Anything else you want to make** | `alsoWantsToMake` | ❌ **never asked** | ❌ |
| How can you film (screen / objects) | `can_record_screen`, `can_film_objects` | ✅ | ✅ `DeclaredClips.tsx` |

**4 of 9 do anything. 3 are never asked at all.**

### 4b. Work items

- 🔴 **Wire `workKind` + `workKindOther` into the prompt.** Two lines beside
  Audience and Goal. Highest single lever on script quality.
- 🔴 **Wire `goal`** — stop preferring three other authorities over the answer
  the creator typed.
- 🔴 **Wire `productEvidence`** — so `[SHOW: the product]` points at something
  real instead of the model inventing product details.
- 🔴 **`alsoWantsToMake`** — give it a consumer or delete the question.
- 🔴 **ASK the three that are never asked.** Wiring a question nobody sees
  produces the same empty script. Asking and wiring are one piece of work.
- 🔴 **Interleave questions with the scan.** Currently ~5 minutes of dead
  waiting, then a wall. Two justifications: the wait feels shorter, AND the
  questions actually get answered. In the real session every chip below the
  fold came back unselected.
- 🔴 **Chunk the review screen.** ~5 phone-screens in one scroll.
- 🚫 **What should each `workKind` answer DRIVE?** Needs a product decision
  before code: what changes for Software vs Licensed professional vs Creator.
- ✅ **DECIDED: keep the screen-recording question, do NOT default it to yes.**
  `DeclaredClips.tsx` shows screen slots only on `isExplicitlyTrue`. Removing it
  hides screen shots forever; defaulting to yes hands screen instructions to
  people who cannot record a screen.

---

## 5. 🔴 Scripting & "containers"

"Containers" = what goes INSIDE each script beat, not the shot slots.

**Observed:** the generated script paraphrased the DNA profile back across five
scenes. Scene 3 restated a stored POV almost verbatim. The result is
voice-accurate and information-free — nothing a creator learns anything from.

**Why:** the generator's only inputs were the voice profile, a one-line idea and
a reference that contributed nothing. Voice says HOW to speak; structure says in
WHAT ORDER. Neither says WHAT TO SAY.

Work items:

- 🔴 **Give the containers a substance source.** Three candidates, in order of
  impact: (1) a reference that genuinely reads — already half-built and failing
  silently; (2) a knowledge/research step for the creator's niche — new
  capability; (3) ask the creator for their own material when no reference was
  read — cheapest and most honest, and nothing in the flow requests it.
- 🔴 **Shot list quality.**
- 🔴 **No pattern-interrupt guidance anywhere.**

---

## 6. 🔴 The reference pipeline

- 🔴 **`mode: 'pattern'` must be a hard stop before spending, in EVERY path.**
  Currently only the too-long case stops. The no-transcript case (ingest failed,
  timed out, private, unsupported host) still falls through and charges for a
  script built without the reference.
- 🔴 **Nine things are never observed** — shot choices, camera work, framing,
  caption design, transitions, b-roll purpose, zooms, music, pacing of dead
  space. Not a bug in the reader: **the system reads transcripts, never pixels.**
  Making these real needs frame sampling, shot detection, caption OCR. This is
  the widest gap between what the product claims and what it does.
- 🔴 **Long references should be rejected at paste time**, not after a 72s
  ingest poll.

---

## 7. 🔴 Recorder & saving

- 🔴 **Pre-record checklist can't check.** 3 of 5 items say "Not checked — worth
  a look yourself" (you in frame, light on your face, room sound). A checklist
  that cannot check is a to-do list.
- 🔴 **Teleprompter text overlaps the Record button** — unreadable while
  recording.
- 🔴 **Background / phone / laptop positioning guidance is generic.** "Warm beige
  background" to someone in a bedroom at night. Should work from what the
  creator actually has, informed by the reference and DNA.
- 🔴 **"Saving to your library…" never confirms.** Partially masked now, since
  the new edit button only appears once `saveState === 'saved'`, but the state
  itself still doesn't visibly resolve.
- 🔴 **Progress bar restarts from 0 on remount.** The CHARGE is fixed; the
  animation still replays.

---

## 8. ❓ Reported, not reproduced

- ❓ **Gallery showed `Lifestyle` for a `Productivity & Business` voice.**
  Stored voice is `niche: "Productivity & Business"`, `sub_niche: "feel-good
  productivity"`. `resolveNiche` scores that to **Business** (the `business`
  keyword hits; nothing else scores). One default voice per owner, so not a
  multi-default collision. **Do not ship a guess.** Needs a live repro with the
  actual runtime state.

---

## 9. 🔴 Security & housekeeping

- 🔴 `create_workspace_invite()` has **no `auth.uid()` check**. It survives an
  anonymous call only because `workspace_invites.owner_id` is `NOT NULL` — an
  accidental guard, not an intentional one. Drop that constraint some day and it
  becomes an unbounded anonymous insert.
- 🚫 **Leaked-password protection is disabled.** One dashboard toggle, owner
  only. Highest value-per-effort item on the whole board.
- 🔴 11 functions with a mutable `search_path`.
- 🔴 `pg_net` installed in `public` (cosmetic; moving it risks more than it
  fixes).
- 🔴 Three test files pass a dead `uploadTake` prop to `initApi`. Inert —
  `packages/shared/tsconfig.json` excludes `__tests__` from typecheck.
- 🔴 **`verify-prod-gate.yml` asserts the editor secret is ABSENT.** Now wrong.
  Update it to assert deliberate-ON, or it becomes a red check that means
  "you switched your product on".

---

## 10. Recommended order

1. **Record one short take and press "Turn this into a video."** `edit_projects`
   is 0. Nothing below is worth tuning until the pipeline has succeeded once in
   production. Credits are available.
2. **Reference `pattern` → hard stop before spend, every path.** If we have no
   substance, do not sell a script.
3. **`workKind` + `workKindOther`: ask AND wire.** The single largest lever on
   script quality.
4. **`goal` and `productEvidence`: ask AND wire.**
5. **Interleave questions with the scan; chunk the review screen.**
6. **Visual analysis of the reference** — the nine NOT OBSERVED rows.
7. Recorder guidance, checklist, teleprompter overlap.
8. Security backlog.

---

## 11. What this session proved

The first real run through the product found, in one sitting: a billing defect
that charged 3× for one video, a trust screen that contradicted itself four
lines apart, a recorder that dead-ended by design, a storage write path open
since `0006`, five questions that change nothing, three that are never asked, and
a documentation set describing a system that had been switched on three days
earlier.

None of it was visible from reading the code. All of it was visible in twenty
minutes of using it.
