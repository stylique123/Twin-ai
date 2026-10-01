# The brain, the classifier, and how data is mixed into a script

This answers the owner brief of 2026-10-01. All file references are to `main` as of today.

## The missing file (Part 2) has been found

Prompt assembly is **not** in `apps/`. It is in `supabase/functions/generate-blueprint/index.ts`, the edge function that writes every script.

| Question | Answer from the code |
|---|---|
| **1. Real filtering, or concatenation?** | **Real filtering.** Knowledge is read through the `creator_knowledge_writable` view, which excludes private and switched-off rows (0252/0253). It is then scored for relevance to this video's own words and rotated so the same facts aren't always used. Answers she typed get reserved slots, but only when they share this idea's words. Facts are scoped to the picked product (by **id** as of today, by name as a fallback). The writer gets at most 10 items, or exactly the set she kept on the plan screen. Corpus notes are filtered to her lane, ranked for this video's goal, and checked for private matter. |
| **2. What becomes a lesson from a test?** | The best hook, gaps the panel flagged repeatedly, what worked and why (0257), and, as of #1066, every **unanswered** specific question. Answered ones become her stated facts. |
| **3. Scoped by objective or mode?** | **Yes.** `compileVideoIntentInline` turns goal, focus and outcome into which kinds of fact go first (`prefersKinds`) and how many must be real substance (`substanceFloor`). The creator family (#1061) changes which hooks and structure are used. |

## Part 3: status

| Item | Status |
|---|---|
| 3.1 Trace the assembly | Done: the table above, and `generate-blueprint/index.ts` (knowledge read ~6760, scoping ~8860–8930, one-source rule ~8960, final guards ~13990–14140). |
| 3.2 Answer the three questions | Done (above). |
| 3.3 Scope field and exclusion field on facts | **Done.** `creator_knowledge.creator_excluded_at` (0253). **New:** `creator_knowledge.product_entity_id` (0260). A fact with a product id is used only in that product's scripts. Objective answers store the product they were asked about. The backfill tagged rows that name exactly one product. Most stored facts are about her account in general, so they stay untagged. |
| 3.4 Reuse `isPrivate()` | Already true: the same `PRIVATE` list feeds the database trigger (via a parity test), the writer's final guard, test-viewer rewrites, and the corpus gate. |
| 3.5 Diagnosed gap becomes a lesson | Done (#1066). |

## Part 4: the goal, against today's state

1. **A fact is used only for its own entity.** Done by id for tagged facts. Untagged facts still go through the name heuristic.
2. **Excluded means excluded everywhere.** The writer reads the same view the screen's choices write to, and every fact she keeps on is read (#1065).
3. **Private matter is handled one way everywhere.** The same `PRIVATE` source is used everywhere.
4. **A lesson changes later scripts.** Lessons are read on every script. A second correction of the same thing still needs a "repeated lesson" alarm. **Open.**
5. **Corpus data shapes a script but never makes claims about her.** Enforced by the one-source rule (#1065) and the figure guard.
6. **Classification is specific enough.** The Gallery matches on sub-niche (#1065). Labels are now merged (0262): 708 down to 643, a deliberately conservative threshold.

## Also shipped in this PR

- **Views measured against her normal reach (0261).** A note's real-world credit is now 7-day views divided by her median plays, not raw views.
- **Niche research reaches "ideas for you".** The ideas writer now reads her sub-niche's researched dates, news, products and questions.
- **The number check now covers titles, captions, thumbnail text and hooks**, not only the script.
