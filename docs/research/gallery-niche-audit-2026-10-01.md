# Gallery and niche classification: audit and fix

This responds to the owner brief of 2026-10-01. All figures were measured in production on the same day.

| Brief item | Finding | Action |
|---|---|---|
| 1. Does the Gallery use the new classification? | **No.** It fetched the newest 200 `gallery_items` rows and filtered them on the client with `gallery_items.niche`, which is the niche of whoever's search found the video. That is the field 0227 replaced. | **Fixed.** The new `gallery_for_me` RPC (migration 0258) ranks the whole read corpus by how close each video's own `sub_niche` and `topic` are to hers (trigram similarity), then by her bucket. It returns the level that matched, and the page ranks on that. The old field is only a fallback when the RPC returns nothing. |
| 2. Backlog | **None.** All 8,103 videos have been read: 6,535 readable and 1,565 unreadable. The last read was at 13:13 today. The backlog is not the cause. | — |
| 3. Bucket-only vs sub-niche | The Gallery never used either; see item 1. | Fixed by item 1. |
| 4. Reuse `isPrivate()` for her facts | **Already done.** Her facts are flagged by a database trigger (0252/0255), and the writer reads only the private-free view. The final guard (`guardScript`) uses the same `PRIVATE` list as the corpus gate. The trigger's word list is a hand copy of that list, and a parity test pins the two together. | Nothing to build. |
| 5. Double-counting fix deployed? | Yes. #1056 merged and the worker deployed on 2026-10-01. `times_seen` is now clamped to the videos actually read. | — |
| 6. Sub-niche tuning | **Confirmed too fragmented.** There are 708 distinct sub-niches; 573 are used by one video, and the median is 1 video per sub-niche. An exact sub-niche match would show 1 card. | Matching now uses similarity rather than equality, so fragmentation no longer hides relevant videos. Merging the labels themselves is a separate, later job. |

## Before vs after (coffee account)

- **Before:** about 3–4 coffee cards. Then, because fewer than 6 matched, the whole unrelated shelf was shown.
- **After:** 20 videos matched at the sub-niche level, including roasting on an Aillio Bullet, starting a micro-roastery, coffee packaging and coffee in pouches. These come first, then the wider food category.
- When fewer than 12 close matches exist, the page now says how many it found and that more are added as Twin reads new videos.

## Success criteria (Part 5)

1. Results share her sub-niche: yes, ranked on the corpus's own labels.
2. Honest counts: yes, the page shows the "found N close to your niche" notice.
3. Private content never reaches her script: covered by 0252/0255 and the final guard.
4. Patterns are not double-counted: fixed in #1056.
