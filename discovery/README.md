# Niche Discovery

Daily-refreshed gallery of trending videos per niche, with views + "why it works".
Built to run **free** for the two biggest platforms by scraping from the VPS with
[Scrapling](https://github.com/D4Vinci/Scrapling) (stealth Chromium), falling back
to Apify only where a login wall makes free scraping impossible.

## What's proven (live, from the production VPS IP)

| Platform | Method | Cost | Returns | Status |
|----------|--------|------|---------|--------|
| **YouTube** | Scrapling `StealthyFetcher` → `ytInitialData` | **$0** | url, title, views, creator, thumbnail | ✅ verified |
| **TikTok** | Scrapling tag page → hydrate top-N video pages | **$0** | url, caption, views, likes, creator, thumbnail | ✅ verified |
| **Instagram** | Apify `apify/instagram-scraper` (hashtag) | ~$0.0027/item | url, caption, views, creator, thumbnail | login wall ⇒ Apify |

Instagram bounces anonymous visitors to `/accounts/login/`, so it runs through
Apify at **reduced volume to start (~$5/mo)**. TikTok + YouTube run at full daily
volume for $0.

## `discover.py`

```
python discover.py <platform> <query> <limit>
# platform: youtube | tiktok
# prints a JSON array of {platform,url,title,views,likes,creator,thumbnail}
```

- **YouTube**: loads the search results sorted by view count (`sp=CAMSAhAB`) and
  walks `ytInitialData` for `videoRenderer` entries.
- **TikTok**: loads `/tag/<query>` (renders ~180 video links but no stats), then
  **hydrates** the top-N by fetching each video page and reading
  `__UNIVERSAL_DATA_FOR_REHYDRATION__` for real `playCount`/`diggCount`.

## Why a separate container

The stealth Chromium dependency is ~3.3 GB. Isolating it here keeps the main
`worker` image lean and means a scraper breakage can never take down job
processing. Build: `docker build -t twinai-discovery .` from this directory.

## Remaining wiring (next)

1. **Inserter**: write parsed items into `public.gallery_items` (owner_id NULL,
   visibility `public`) via the Supabase service key, de-duped by url.
2. **Instagram**: Apify hashtag pull at reduced volume.
3. **"Why it works"**: cheap Gemini pass over caption + engagement (≈$0 lazy /
   top-N), reusing the worker's `deriveStructure` engine for deep on-click reads.
4. **Daily cron**: a scheduled trigger (e.g. GitHub Action) that runs the
   container per niche × platform once a day.
5. **Gallery UI**: embed the playable video + show views/why on each card.
