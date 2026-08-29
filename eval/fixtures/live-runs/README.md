# Wave 0 — the four-run regression harness

Four fixtures (`run-a.json` … `run-d.json`), one per independently-audited
dogfood generation against the same reference — a Hormozi YouTube Short
("3 reasons your business isn't making more money"). Each file is a
**reconstructed, shape-correct `Generation`** (see `packages/shared/src/types.ts`)
built to be faithful to every quoted line, header value, beat budget, hook
option, setup label and CTA text the audits cite verbatim — not real DB rows
(this harness has no DB access).

Two fields are NOT part of the real `Generation`/`Blueprint` schema and exist
only so the fixtures can carry evidence the schema does not (yet) have a
column for:

- `settings` — the onboarding/goal/subject/fidelity/tone choices the audit
  reports, since `Generation` does not itself store the creator's brief
  answers verbatim.
- `ui_header` — the duration/scene-count text the Result screen rendered
  (`"About 47 seconds of talking"`, `"1m 27s"`, …), which is computed
  client-side and not persisted; the audits quote it directly so it is
  captured here as documentation, checked against the sum of
  `blueprint.beat_plan[].target_sec`.
- `known_defects` — a plain-English index of which audited bug each fixture
  encodes, for a human reading the JSON. The test file does not read it.

Run `npm run test -w @twinai/shared -- liveRunFixtures` to execute the
harness (`packages/shared/src/__tests__/liveRunFixtures.test.ts`).

## Expected-red vs expected-green, at baseline commit (before Fix 1)

Per the build plan's 13 acceptance assertions, run against all four fixtures:

1. No ≥6-content-word reference overlap — **RED** for A (verbatim Hormozi
   line) and D (verbatim near-quotes); green for B and C (no such lines).
2. No CTA names an unowned entity — **RED** for C (Acquisition.com CTA);
   green for A, B, D.
3. No unattributed figure in a hook — **RED** for A, C, D; green for B.
4. Shot list ≡ teleprompter — **RED** for all four (A: different hook line
   in the shot list; B: extra sentence; C: missing/extra beats; D:
   contradicting framings).
5. Coaching panels reference only real beats — **RED** for B, C, D (describe
   the reference's structure, not the shipped script); green for A (not
   audited as a coaching-panel defect).
6. Enumeration checker correct on both phrasings — **RED** for A and C
   (false "promises 3, delivers 0"); green for B (correctly silent).
7. Locations intact, setup letters sequential/no repeat — **RED** for all
   four (comma-split location strings; B/C/D also misorder or repeat
   letters).
8. Header seconds = sum(beat seconds) ±2s — **RED** for all four (A: 47 vs
   35; B: 87 vs 36; C: 57 vs 30, and a scene missing from the count; D: 79
   vs 49).
9. No markdown in spoken lines — **RED** for B (`*not*`); green for A, C, D.
10. Fidelity has one value in both surfaces — **RED** for D (advanced slider
    "loose" silently overrides Q3 "Keep it close"); green for A, B, C
    (single control exercised).
11. Tone visibly changes delivery notes, never contradicted — **RED** for C
    (inert) and D (actively contradicted); N/A for A and B (no tone set).
12. Each subject option reaches a distinct, explicitly-labelled source —
    **RED** for D (subject="something I've experienced" produced zero
    first-person lines); C's skip is separately asserted as correct
    (product-capture card fired) — see the dedicated test.
13. Twin-strength score differs across accounts — **KNOWN HARNESS
    LIMITATION**, not asserted here; see the test file's comment.

Today, before Fix 1, **assertion 1 fails on both A and D**. Fix 1 (this same
PR) turns it green for both — see the mutation test in
`packages/shared/src/script/__tests__/phraseOverlap.test.ts`.
