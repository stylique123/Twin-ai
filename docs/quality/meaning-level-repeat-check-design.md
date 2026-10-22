# Meaning-level repeated-story check: design note

Status: design only. No code, no prompt, no flag wired yet. Nothing here changes live behaviour.

## Why the word-overlap version failed

The word-overlap check could not separate the two cases it has to separate. On panel-10, the
flagged retellings each added 5-10 novel words against the earlier telling, and the wrong cuts
(lines a human said must stay) added 1-5. A cut line can look more like a repeat than a true
repeat does, because a payoff line reuses the story's words on purpose. No word-count threshold
splits the two sets, so the check must judge meaning, not words.

## Inputs (per script)

- `lines`: the ordered script lines, each with its index (line 1 = hook line).
- `storyItemIds`: for each line, the story bank item id(s) it draws on (empty when none).
- `hook`: the hook text and the story item id it promises to pay off, if any.
- Only lines that share a story item id with an earlier line are candidates. Lines with no
  shared id are never sent to the model.

## Judgement asked

For each candidate line, given the earlier line(s) on the same story item, the model returns one of:

- `pure_repeat`: retells the same event with no new fact, consequence or turn. Cut candidate.
- `payoff`: closes what the hook or an earlier line set up. Keep.
- `new_info`: adds a fact, number, consequence or a different angle. Keep.
- `unsure`: keep.

Output is a short JSON object per candidate: `{ line, verdict, reason }` where `reason` is
under 20 words. Only `pure_repeat` can lead to a cut; everything else keeps the line.

## Model and cost

- A small, fast model tier (the same tier the worker already uses for cheap checks). Prompt is
  the candidate pairs only, not the whole script.
- Estimate: ~1.5-3k input tokens and ~200 output tokens per script with candidates; most scripts
  have 0-2 candidates. At small-tier prices this is well under $0.005 per script. Scripts with no
  candidate cost nothing (no call).

## Latency budget

- Runs as an async gate in the worker after the first draft is returned (same place as async
  polish), never in the user's blocking path.
- Budget: 4 s per script. On timeout or error the gate returns "keep all" and logs the miss.

## False-cut safeguards

1. Never drop line 1 (the hook line), whatever the verdict.
2. Payoff protection: a line that shares the hook's promised story item id and comes after the
   hook is never cut, even on `pure_repeat`.
3. Closing-line dependency: never cut a line that the closing line refers back to (shares an id
   with the last line or is the line directly before it).
4. At most one cut per script in the first rollout stage.
5. A cut is a suggestion recorded next to the script until the replay passes; it is not applied.

## Evaluation plan (panel-10, by id only)

- Must flag (true repeats): P10-02, P10-07, P10-09, P10-10, P10-15, P10-18.
- Must not cut: P10-04, P10-05, P10-13.
- Pass bar for replay: all 3 must-not-cut cases kept (zero false cuts) and at least 5 of 6
  flagged cases returned as `pure_repeat`. Run 3 times; a case counts only if stable in all 3.
- Then re-check on panel-11 once its labels exist, before any rollout beyond off.

## Kill switch

`REPEAT_CHECK_MEANING_ENABLED`, default off. When off, no model call is made and the existing
behaviour is unchanged.

## Rollout

1. Default off. Ship code dark (later PR) with a test that the flag off means no call.
2. Offline replay on the panel-10 ids above; must pass the bar.
3. Shadow mode: record verdicts, apply nothing; compare against panel-11 labels.
4. Enable cuts (one per script max) only after replay and shadow both pass.
