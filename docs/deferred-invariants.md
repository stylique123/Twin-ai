# Deferred invariants and acceptance rules

Things that are **known, stated, and deliberately not built yet**, plus the
acceptance rules that must not soften while they wait.

⚠️ THIS FILE EXISTS BECAUSE A DEFERRAL THAT LIVES ONLY IN A CONVERSATION IS A
DEFERRAL THAT QUIETLY BECOMES A DECISION. Each entry says what the rule is, why
it is not built yet, and what evidence would make it urgent.

---

## 1. Packet readiness must require renderable frames

**The invariant, stated exactly:**

> A pilot packet cannot transition to `READY_FOR_LABEL` if any claimed reference
> has zero renderable frame objects available at packet-build time.

**Why it is not covered today.** `checkPacketInvariants` reconciles the packet
against the attrition report — ready-URL count vs packet-URL count, no claims
from `FAILED`/`UNREADABLE` references, and `claims === readyUrls × claimPaths`.
It never asks whether the frames the review page must render actually exist.
And `terminalStateOf` returns `READY_FOR_LABEL` on `visual_profile` alone; the
`frames_sampled` branch sits below it and is only reached when there is no
profile. So a reference with a profile and no surviving frames is `READY_FOR_LABEL`,
generates a full set of claims, passes every invariant, flips the run, and hands
over a review URL to a page with no pictures.

**How it becomes reachable.** Not at collect time — the visual route needs
frames to produce a profile at all. Later: retention or cleanup removes frame
objects while the profile row persists. A packet built or rebuilt after that is
structurally valid and visually empty.

⚠️ **AND `frames_sampled > 0` IS NOT THE CHECK.** That column is HISTORICAL
EVIDENCE — it records that frames were once sampled. What review needs is
*currently renderable* frame objects. The check must verify:

- `reference_frames` rows exist for every claimed URL,
- `storage_path` is non-null on each, and
- the appropriate server-side existence/signability check succeeds.

Otherwise retention turns yesterday's valid evidence into today's empty review
page while the database cheerfully insists everything is fine.

**Why it is deferred.** ⚖️ OWNER DECISION 2026-08-22: measured safe for the run
that matters, and not worth a full gate before #75 is active. Run
`7204de6f-fd06-4546-b2fa-ed39a90a295b`, read-only on production: 8 sample URLs,
8/8 with frame rows, 29 frame rows (7 references × 4 frames, `@todays.variable`
× 1), **0** frames whose storage object is missing, **0** null storage paths.
The failure mode is real; it does not touch this run. Paying another ~90-minute
lane before the cheap tier exists would be cost without evidence.

---

## 2. A staging failure must say WHICH KIND of failure it was (#67)

**The defect.** On 2026-08-22 two consecutive staging-matrix runs failed in
phase 3, on unrelated diffs, both with **empty error payloads**:

```
32604523031  head 5a76021  phase3 harness crashed: Error: start-editor-v2 502: {}
32605464757  head 7bf1710  phase3 harness crashed: Error: K: non-sanctioned analysis rows is unreadable:
```

The second is a PostgREST count whose `error.message` is empty. Measured
read-only against staging at the time: project `ACTIVE_HEALTHY`,
`media_analyses` 49,044 rows, non-sanctioned components **0**, and the K1 query
itself runs in **34 ms**. **The assertion that failed would have passed.** The
data was correct and fast; the READ failed.

⚠️ **AN EMPTY 502 OR AN EMPTY PostgREST ERROR IS NOT EVIDENCE ABOUT THE PROPERTY
UNDER TEST.** The harness currently reports it as though it were. That is the
whole point of a staging gate; without the distinction it is an elaborate
coin-flip machine wearing YAML.

**Required shape.** The distinction must be MACHINE-VISIBLE, not buried in prose:

```
ASSERTION_FAILED
TRANSPORT_FAILED
DEPENDENCY_UNAVAILABLE
HARNESS_FAILED
```

For `TRANSPORT_FAILED`, persist at least: endpoint, HTTP status, attempt count,
elapsed time, response content type, response body length/hash, and **whether a
body was actually empty**.

⚠️ **AND NO TOLERANCE OR RETRY WIDENING TO MANUFACTURE GREEN.** Absorbing a
documented transient means naming it and carrying on; it never means relaxing an
assertion, a timeout, or a threshold so a run passes.

**Status.** Staging transport/harness behaviour is the LEADING HYPOTHESIS and
NOT a proven root cause. The affected PR diffs do not explain the phase-3
failures, and the database explanation was falsified above.

---

## 3. Before a pilot is called labellable (#58)

Five parts, all of them, before the owner is told anything:

1. the existing run is still the SAME FROZEN RUN;
2. `visual_pilot_claims > 0`;
3. claims reconcile with ready references and claim paths;
4. every claimed reference still has renderable frames;
5. the review endpoint returns an actual first claim with usable image URLs.

Until all five hold: **no Start, no Lock, no rerun, no spend.**

⚠️ A CLAIMS COUNT ALONE IS NOT PART 5. `pilot-review`'s `packet` action reads
`visual_pilot_claims` → distinct URLs → `reference_frames` for those URLs →
`createSignedUrl` against the private `reference-frames` bucket. Three layers,
three places an empty page can hide.

---

## 4. #460 — green is not acceptance

The zoom sweep has executed twice and both were `INSUFFICIENT_EVIDENCE`.

⚠️ **THOSE REMAIN EXACTLY WHAT THEY WERE: INSUFFICIENT EVIDENCE, NOT
ALMOST-PASSES.** `INSUFFICIENT_EVIDENCE` means the experiment did not run — not
that the defect is absent.

Acceptance requires reading the four `zoom = 0/1/2/3` rows and finding a real
`CORRELATION_GONE`, over a genuine four-point population with coherent
collected/attempted/excluded counts. A green matrix does not qualify: phase 8
renders ONCE, so it observes ONE zoom count, and A17 asserts the FROZEN ±250 ms
tolerance — not the slope. Section E is ADVISORY and cannot fail the phase, so
green means "the sweep did not break the matrix" and nothing more.

Say both halves every time: the renderer slope is **PROVEN LOCALLY** by direct
frame counts off rendered MP4s (184/184/184 continuous vs 181/176/170
decomposed), and **NOT PROVEN STAGING-SIDE**.
