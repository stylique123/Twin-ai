# The moat: learning loops, audit and fixes

This responds to the owner brief of 2026-10-01 and the owner's note that Twin should research new niches automatically. Figures were measured in production the same day.

## Loop status

| Loop | Verified | Fix today |
|---|---|---|
| 1. Public corpus becomes niche patterns | Running. Backlog is 0: all 8,103 videos read. | Gallery now reads these patterns (#1065). |
| 2. Her own posts become private notes | Running, scoped to her. | — |
| 3. Ratings, notes and hook picks become lessons | Running; 98 lessons so far. | See 3.1 and 3.2 below. |
| 4. Posted performance gives a pattern credit | **Now verified.** `brain_learn` counts how often each note was used, filmed and posted, plus its 7-day views and star ratings. `brain_brief_scoped` uses those counts to rank notes, with small weights (0.01–0.03 × ln(n), and rating ±0.015 per star). | Ratings tagged "Wrong product facts" no longer count against the notes a script used. |
| 5. Dated events become ideas | Running, but only for 12 broad buckets. | **New per-sub-niche research loop**, below. |

## 3.1 The specific gap evaporated: confirmed

Test-viewer findings survived only as generic rules, e.g. "Answer every question the script raises before the close" (24 such lessons). The specific missing fact was lost. Now:
- An **answered** panel question becomes her stated fact (#1063).
- An **unanswered** one becomes a standing "never invent this; keep that line general until she answers" lesson. The specific gap is no longer lost.

## 3.2 Fabrication pollutes learning: confirmed

"Wrong product facts" is the most common rating tag, on 10 of 32 rated scripts. About half of the rating lessons are remedial ("Never invent brewing instructions…"). The fabrication fixes (#1064, #1065) reduce that at the source. Loop 4 no longer lets those trust failures lower the craft credit of the niche notes a script used.

## Owner request: new niches research themselves

Before:
- A new niche got one small scrape (4 YouTube and 4 TikTok videos), and only if **no** video carried its label.
- Moments were researched for the 12 broad buckets only.
- Nothing looked at competitors, new products or niche news.

Now (migration 0259 plus the `nicheResearch` worker loop):
- **Every sub-niche a ready creator has is researched on its own** through grounded Google search. It covers dated days and events in the next 8 weeks, the last 4 weeks of news, new products and tools, known creators and brands in the niche, and the questions people ask.
- Only results that come back with real sources are kept.
- New niches go first; every niche refreshes weekly.
- The script writer reads the research for her sub-niche as context for ideas and angles, never as a fact about her (the one-source-of-facts rule).
- The signup scrape now fires while a niche has fewer than 12 videos, not only when it has none.

## Still open

- Views are not yet normalised to each creator's usual reach, so a big account's views count for more.
- `creator_ideas` does not yet read the niche research; only the writer does.
- Sub-niche labels in the corpus are still fragmented, which Gallery matching works around.
