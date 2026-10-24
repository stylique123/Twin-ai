# Not-started threads: groundwork (docs only)

Companion to `docs/release/dropped-threads-status.md`. For each NOT STARTED thread this gives
the part that needs no live change (protocol, checklist, spec) and lists what still waits on a
live run, the owner or panel-11 labels. Nothing here changes live behaviour. No creator text.

## 3. Ask-first rate re-measure

Protocol (to run later on the panel, no change to the app):
- [ ] One clean batch, same panel set as the pre-fix measure, after #1234.
- [ ] Record per request: did it ask first (yes/no), number of asks, any ask repeated
      (same question asked twice in one session).
- [ ] Report: ask-first rate, repeated-ask count, and the pre-fix rate next to it.
- Done when the numbers are in this file's sibling status table row 3.
Waiting on: a live panel batch (paid calls).

## 5. Reference / Idea / Suggest modes evaluated

Rating sheet columns: request id, mode, "shape kept" (Reference only, 0-2),
"words new" (Reference only, 0-2), usable as-is (yes/no), notes (no text from the output).
- [ ] Pick 4 requests per mode for the hold-out (see 12) once it is frozen.
Waiting on: the frozen hold-out (12) and a live run.

## 6. Option dependency split

Design: each angle option carries `needs: "her_moment" | "her_facts" | "general"`.
- `her_moment`: needs a lived event from her story bank; hide when the bank has none.
- `her_facts`: needs product or profile facts; hide when missing.
- `general`: always offered.
Start minimal in Phase 4.3 as a tag only (no filtering), behind a flag that defaults off.
Waiting on: code PR (dark), then a live check that hiding does not empty the option list.

## 7. Phase 5 (stance profile, idea ledger, claim library, mix dial)

Scope decision checklist for the owner:
- [ ] Is Phase 5 still in scope? (yes / later / no)
- [ ] If yes: claim library first, 30-50 claims, each with a source link and date.
- [ ] Claim record fields: id, claim, source, checked date, product area. No creator text.
Waiting on: owner decision.

## 9. 30-story human check

Protocol: the owner rates 30 reshaped stories side by side with the original, locally.
Only the score leaves the machine: story id, score (1-5), "still hers" (yes/no).
Waiting on: the owner's ratings.

## 10. Video-to-product linking with confirmation

Spec: see `docs/release/video-product-link-spec.md`.
Waiting on: code and a migration (live changes).

## 12. Frozen hold-out (~30 requests)

Freeze protocol:
- [ ] Choose ~30 requests across modes (incl. 4 each Reference/Idea/Suggest) and creator types.
- [ ] Fictional people only; pass `check_fixture_identity`.
- [ ] Record a content hash of the set in this doc; any edit is a new version, never a tweak.
- [ ] Never tune prompts on these; tuning uses the panel working set.
- [ ] Owner rates blind (outputs shuffled, arm labels hidden).
Waiting on: choosing the set, owner blind ratings.

## 21. Scheduling and AI-edit audit

Audit template (audit now, fixes after rollout):

| Area | Works | Broken | Evidence (PR / file) | Fix after rollout? |
|---|---|---|---|---|
| Schedule a post | | | | |
| Reschedule / cancel | | | | |
| Timezone handling | | | | |
| AI edit: apply | | | | |
| AI edit: undo | | | | |

Waiting on: walking the live app to fill the table.
