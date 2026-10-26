# Third-party source inventory for counsel, 2026-10-26

Read-only counts from the production database (SELECT only). No content, no names, no URLs.

## Kinds of third-party sources Twin reads

| Source kind | How it is read | Where it is stored | Rows |
|---|---|---|---|
| TikTok public posts | scraper (Apify) and captions/transcripts | `reference_content_profiles` | 3789 |
| | | `scraped_posts` | 536 |
| | | `transcripts` | 476 |
| | | `creator_knowledge` with a TikTok URL | 780 |
| | | `comment_candidates` (public comments) | 86 |
| | | `dna_cache` | 23 |
| YouTube public videos | captions (paid and free), local transcription | `reference_content_profiles` | 1730 |
| | | `scraped_posts` | 82 |
| | | `transcripts` | 89 |
| | | `creator_knowledge` with a YouTube URL | 445 |
| | | `dna_cache` | 10 |
| Instagram public posts | scraper (Apify) | `reference_content_profiles` | 111 |
| | | `scraped_posts` | 68 |
| | | `transcripts` | 55 |
| | | `creator_knowledge` with an Instagram URL | 304 |
| | | `comment_candidates` | 1 |
| | | `dna_cache` | 12 |
| Reference transcripts (all platforms) | by method | `reference_transcripts`: local transcription 3263, YouTube captions paid 1252, YouTube captions free 11, Instagram paid 22 | 4548 |
| Reddit public threads | scraper (Apify), now off | `niche_reddit` (titles, URLs, community, upvotes; no usernames) | 52 rows / 780 threads |
| Web search (niche research) | model-grounded search | `niche_research` (53 with sources; of these 19 cite YouTube, 8 Instagram, 1 TikTok, 10 Reddit) | 55 |
| Product web pages | page read on the user's request | `product_entities` with a source URL | 82 |
| Model-written notes on the public corpus | derived from the above | `brain_notes` | 16543 |

First-party (the user's own) data, for contrast: `creator_knowledge` by source: transcript
1264, caption 1031, asked (answers) 128; connected accounts 2 (TikTok); `posts` 8.
`story_passages` 0, `post_outcome_observations` 0.

## Notes for counsel

- No Reddit usernames are stored; Reddit post titles are (see `docs/ops/ops-audit-2026-10-26.md` §1).
- There is no general consent record or account-deletion path in production today
  (`eval_consents` exists for eval participants, 0 rows). A design is in
  `docs/legal/consent-and-deletion.md`, behind a flag that is off.
