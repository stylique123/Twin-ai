# Comments, Stories/Highlights and Analytics: what exists, what was missing

This responds to the owner brief of 2026-10-01. The numbers come from production on that date.

## Part 1: Platforms

Twin connects to **Instagram (22 voices, 50 posts), TikTok (29 voices, 554 posts) and YouTube (12 voices, 82 posts)**.

Instagram is supported, but the scan is thin: about 2 posts per voice, against about 19 per voice on TikTok.

Stories and Highlights are **not read anywhere**. Instagram Stories expire after 24 hours, and the Graph API returns them only for an account connected through Meta login (`instagram_manage_insights`). Just one platform connection exists today, and it is TikTok through Outstand. Recommendation: no Stories/Highlights work until creators connect Instagram. Highlights could then be read with the same token, but this is a product decision rather than a bug.

## Part 2: Comments

The brief's premise was only half right:

- **Already built, but never used:** `post_questions` (0240) and `fileHerReplies` (0241).
  - The social cron read comments only under posts *Twin published*. Only 5 posts have ever been published, and the table has 0 rows.
  - Unanswered questions were filed **straight into her brain without asking her**. That breaks the brief's "candidates first" rule.
  - Her replies were filed with no sensitivity check.
- **Missing:** comments under her own 600+ scraped posts were never read.

### Built (0263)

The design copies `mentions.ts` closely:

- **Reading comments:** `comment_candidates` and `comments_due`. Each TikTok or Instagram voice is read once a month: its top 6 posts by plays, 60 comments each, through Apify (the vendor the scan already uses).
- **What is kept:** only direct questions and concrete requests. Her own comments are skipped. When the same question appears under several posts, it becomes one candidate with a "times asked" count.
- **Sensitivity:** private matter is dropped before a candidate exists, using `isPrivate`, the same guard the writer uses.
- **Twin-published posts:** questions under these now become candidates too (`postQuestionsToCandidates`). Nothing is filed unseen any more.
- **Her replies:** these now carry the same sensitivity flag as every other fact.
- **Confirming:** under My Twin → "What your audience asks", she taps *Use it*. She can optionally type her answer and pick which product it is about. The `decide_comment` RPC checks that the product is hers.
- **Filing:** only confirmed rows are filed, into `creator_knowledge` with source `comment` and `product_entity_id`, through the same store, view and exclusion rules as any other fact.
  - With her answer, the row is `stated`, because the answer is her own words.
  - With no answer, it is `demonstrated`: viewers ask it, but she has not said anything.

### Reaching "answer what people keep asking"

The writer's second read and the plan screen's second read now both include `comment` alongside `asked`, so the screen and the writer stay identical.

The `conversations` objective contract tells the writer to prefer a "Viewers ask:" fact as THE question. It may use her answer only where she gave one; otherwise it asks her.

## Part 3: Analytics

1. **Creator-facing:** the Calendar shows each published post's numbers and comments (`social?action=insights`, `post_stat_snapshots`). `Metrics.tsx` is an admin-only data room, not a creator view.
2. **Feedback into the writer:** yes, by design. `recordStats` writes views into `generation_outcomes`, and `brain_learn` weights notes by views relative to her normal reach (0261). **But 0 outcomes have any views yet.** Only 5 posts have been published through Twin, and native stat sync needs a native connection, which nobody has. The loop is wired but has had no input.
3. **The gap:** scraped posts carry `plays`/`likes` and already shape personas and brain weighting. What Twin does not do is tell her "this topic over-performed for you, do another". That should be built once published outcomes exist.

## Status

The code and migration are live. Candidates start appearing as the monthly reader works through the voices, one every 10 minutes. This needs `APIFY_TOKEN`, which is already set for the scan.
