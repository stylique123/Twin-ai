# Beat-based writer: design (plan v6.8 §33 item 6)

Status: designed and unit-tested offline. Behind `BEAT_WRITER`, which defaults OFF. No model is called by anything in this change. The live test waits for the AI to return.

## Why

Panel data (§33) show the single-call writer under-produces: word target 105, written 62, shipped 56. Guards remove lines and nothing replaces them, and the unfiltered refill bought length with unrelated stories. Length has to come from her relevant material, placed in the right order. The beat writer does that in two steps: a deterministic map from her items to beats, then one short, budgeted prompt per beat.

## Step 1: the items-to-beats map (deterministic, no AI)

`packages/shared/src/script/beatWriterMap.ts`, `mapItemsToBeats(items, { angle, topic, productLed?, minRelevance? })`.

- **Items:** `story | proof | product_fact | opinion | cta`, each with an id and text (and optional tags). On the edge these come from the knowledge ledger she already has (`LedgerItem` in `inventionGate.ts`, the same items the refill, Plan B and spine planner read).
- **Relevance:** content-word overlap (stop words removed, light stemming) between the item and `angle + topic`, measured against the smaller side, 0 to 1. Items below `minRelevance` (default 0.2) are refused as `unrelated`. A CTA is about her offer, not the topic, so it is never refused for relevance.
- **Which beats a kind may fill** (preference order): story to proof, then hook; proof to proof, then hook; product fact to method; opinion to problem, then method, then hook; CTA to cta.
- **Assignment:** items sorted by relevance, then id (so the result does not depend on input order). Pass 0 fills each beat only from items whose first choice it is; pass 1 lets leftovers borrow a later choice. Fill order is proof, method, problem, cta, hook, so a story is not spent on the hook while proof is empty.
- **Hard rules:** each item lands in at most one beat (duplicate ids are dropped); at most one story per script; an unrelated story is never placed; when `productLed`, the method beat holds product facts only.
- **Capacity:** one item per beat, except method (two).
- **Report:** `unfilled` (empty beats), `needsMaterial` (empty beats that need her material: proof, problem, and method when product-led; hook and CTA are writable from the angle and goal), `askFor` (the ONE beat the QC's thin-material path asks about: product-led asks for method first, otherwise proof first), and `refused` (id, reason, relevance; ids only, no text, so it is safe to log).

## Step 2: write each beat within its budget

Budgets live in ONE shared constant, `BEAT_WORD_BUDGETS` in `packages/shared/src/script/beatBudgets.ts`, which the Quality Controller imports too:

| beat | words |
|---|---|
| hook | 12 to 20 |
| problem or reality | 15 to 30 |
| her proof | 30 to 50 |
| method or product facts | 20 to 40 |
| call to action | 8 to 15 |

A full five-beat script therefore runs 85 to 155 words, which covers the Standard floor (90 to 145) when every beat is filled, and drops toward Sprint honestly when material is thin.

### Per-beat prompt shape

`packages/shared/src/script/beatPrompt.ts`, `buildBeatPrompt({ slot, angle, topic, voice?, earlierLines?, offer? })`, pure.

System:

```
You write ONE beat of a short video script in the creator's own voice: the <label> beat.
Write between <min> and <max> words. Spoken English, first person.
Use ONLY the material given. Never invent a story, a number, a result, a quote or a product fact.
Do not repeat anything in the earlier lines.
Return only the spoken words of this beat, no labels.
```

User:

```
BEAT: <beat>
PURPOSE: <what this beat is for>
ANGLE: <angle>
TOPIC: <topic>
WORD BUDGET: <min>-<max>
MATERIAL:
- [<kind>] <item text>          (or "(none: write only from the angle; make no factual claim)")
VOICE: <voice card notes>       (optional)
OFFER: <her offer>              (CTA beat only)
EARLIER LINES (do not repeat):  (beats already written)
- <line>
```

It also returns `itemIds`, so provenance per beat is known without reading text.

## How it plugs into the current writer

Today: `supabase/functions/generate-blueprint/index.ts` builds one large writer prompt (the `beat_plan` instructions around the writer system prompt) and calls `callModel(apiKey, writerSystem, prompt, blueprintSchema, ...)` once (best-of-N drafts via `Promise.allSettled`), then runs guards, refill, Plan B (`_shared/planBAssembly.ts`) and polish. The spine planner (`packages/shared/src/script/planner/spinePlanner.ts`) already decides the one point of the script for trial accounts.

With `BEAT_WRITER` on (test and panel accounts only; real creators never):

1. After the angle and spine are chosen, read her ledger items, call `mapItemsToBeats`.
2. If `askFor` is set and nothing can fill it, hand that one beat to the QC thin-material path (one question, answer saved as her fact) instead of writing a padded script.
3. For each filled beat (and hook/CTA), `buildBeatPrompt`, in beat order, passing earlier beats' lines; call the existing `callModel` with a one-field schema (`{ line: string }`). Five small calls replace one large one; they share the existing attempt recorder and writer ladder, and each is short enough to stay inside the 75s + 55s edge budget.
4. Assemble the lines into the existing `script[]` and `beat_plan[]` (one entry per beat, `target_sec` from words / wpm), so everything downstream (guards, polish, QC, adapter) is unchanged.
5. The QC runs last as planned and checks each beat against the same `BEAT_WORD_BUDGETS`.

The edge reads the flag with `beatWriterOn(Deno.env.get('BEAT_WRITER'))`, true only for `1`, `true` or `on`. The three modules are mirrored into `supabase/functions/_shared/` by `scripts/ci/generate_shared_pilot_core.mjs`; nothing on the edge imports them yet.

## What is left (needs the AI)

- Wire step 3 into `generate-blueprint` behind the flag (test accounts only).
- Live panel: beat writer versus the panel-10 baseline on the same requests; acceptance per §33 (median words at least 90, free-judge not below baseline, 0 placeholders and repeats, invented lines not worse).
- Tune `minRelevance` against the labeled panels (refill v2 keep/block cases).
