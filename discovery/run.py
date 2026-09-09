#!/usr/bin/env python3
"""Daily niche-discovery orchestrator.

For each niche it scrapes trending videos (TikTok + YouTube for free via Scrapling,
Instagram via Apify at reduced volume), de-dupes against what's already in the
gallery, and inserts the new ones into public.gallery_items as public system items
(owner_id NULL). Reads all config from the environment.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required — service key bypasses RLS)
  APIFY_TOKEN                               (optional — enables Instagram)
  APIFY_INSTAGRAM_DISCOVER_ACTOR            (default apify/instagram-scraper)
  DISCOVERY_NICHES                          (JSON array; default below)
  DISCOVERY_YT_LIMIT / _TT_LIMIT / _IG_LIMIT(per-niche caps; IG small = ~$5/mo)
"""
import os, sys, json, re, urllib.request, urllib.parse

# A MODULE THAT CANNOT BE IMPORTED WITHOUT PRODUCTION CREDENTIALS CANNOT BE
# TESTED, and that is why this file had no tests and why a defect that filled
# the gallery with 92 junk cards a week ran for a week unseen. `discover` needs
# `scrapling`, which exists only on the VPS image, and the two `os.environ[...]`
# reads below threw at import time on any other machine.
#
# BOTH ARE DEFERRED TO THE MOMENT THEY ARE ACTUALLY NEEDED, and the run still
# fails loudly without them -- see `_require_env`, called from the entrypoint.
# Nothing about the VPS run changes; what changes is that the rules in this file
# can now be exercised anywhere.
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
APIFY_TOKEN = os.environ.get('APIFY_TOKEN', '').strip()
IG_ACTOR = os.environ.get('APIFY_INSTAGRAM_DISCOVER_ACTOR', 'shu8hvrXbJbY3Eb9W').strip()

BASE_NICHES = json.loads(os.environ.get('DISCOVERY_NICHES',
    '["Business","Fitness","Food","Education","Lifestyle","Beauty"]'))
YT_LIMIT = int(os.environ.get('DISCOVERY_YT_LIMIT', '12'))
TT_LIMIT = int(os.environ.get('DISCOVERY_TT_LIMIT', '12'))
IG_LIMIT = int(os.environ.get('DISCOVERY_IG_LIMIT', '3'))  # reduced to keep IG ~$5/mo
# Cap how many creator-derived niches we add per run, so a growing user base can't
# blow up run time. Free scrapers (YT/TikTok) for these; paid IG scraper enabled if APIFY_TOKEN is set.
CREATOR_NICHE_CAP = int(os.environ.get('DISCOVERY_CREATOR_NICHE_CAP', '14'))


def _sb(path, method='GET', body=None, params=None):
    url = SUPABASE_URL + '/rest/v1/' + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    with urllib.request.urlopen(req, timeout=40) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def existing_urls():
    rows = _sb('gallery_items', params={'select': 'url', 'owner_id': 'is.null', 'limit': '20000'})
    return set(r['url'] for r in rows) if rows else set()


def creator_niches(base):
    """The niches REAL creators on the platform actually have (from their brand
    voices), so discovery covers THEM, not just a fixed list. A new signup's niche
    starts getting discovered automatically the next run. De-duped against the base
    set (case-insensitive) and capped so the run stays bounded."""
    try:
        # Select ONLY the two niche fields, not the whole (large) voice profile.
        rows = _sb('brand_voices', params={
            'select': 'niche:profile->>niche,sub_niche:profile->>sub_niche',
            'status': 'eq.ready', 'limit': '500'})
    except Exception as e:
        print('creator_niches lookup failed: %s' % e, file=sys.stderr)
        return []
    base_lower = set(n.strip().lower() for n in base)
    seen = set(base_lower)
    out = []
    for r in (rows or []):
        # Cover BOTH the specific sub_niche (prioritized: it's what the audience
        # actually searches) and the broad niche. Store each verbatim as the label
        # so it exact-matches the creator's voice in the gallery UI.
        for n in ((r.get('sub_niche') or '').strip(), (r.get('niche') or '').strip()):
            if not n or len(n) < 3:
                continue
            k = n.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append(n)
            if len(out) >= CREATOR_NICHE_CAP:
                break
        if len(out) >= CREATOR_NICHE_CAP:
            break
    return out


def _fmt(n):
    n = int(n or 0)
    for d, s in ((1e9, 'B'), (1e6, 'M'), (1e3, 'K')):
        if n >= d:
            return ('%.1f' % (n / d)).rstrip('0').rstrip('.') + s
    return str(n)


def is_instagram_post(u):
    """Is this a link to a POST, or to a page that merely lists posts?

    Kept as a function rather than an inline test because the same question is
    asked by the selftest below, and a second copy of the rule is a second thing
    that can drift. Accepts the canonical post shapes and nothing else --
    /explore/tags/, /explore/, a bare profile and the site root are all pages
    about posts rather than posts.
    """
    low = (u or '').lower()
    if '/explore/' in low or '/tags/' in low:
        return False
    return '/p/' in low or '/reel/' in low or '/reels/' in low or '/tv/' in low


def why_for(it):
    """A free, engagement-derived 'why it works' line (no LLM cost). Deep analysis
    happens lazily when a creator hits Remix and the worker reads the transcript."""
    v = int(it.get('views') or 0); l = int(it.get('likes') or 0)
    cap = (it.get('title') or '').strip(); low = cap.lower()
    parts = []
    if v:
        parts.append('%s views' % _fmt(v) + (' with a %d%% like rate' % round(l * 100 / v)
                     if v and l and l / v >= 0.03 else ''))
    if '?' in cap:
        parts.append('opens a curiosity loop with a question hook')
    elif any(w in low for w in ('how', 'why', 'secret', 'mistake', 'stop', 'never')):
        parts.append('leads with a value/curiosity hook')
    elif any(ord(ch) > 0x2600 for ch in cap):
        parts.append('a punchy, emoji-led hook stops the scroll')
    if len([w for w in cap.split() if w.startswith('#')]) >= 3:
        parts.append('rides trending hashtags for distribution')
    if not parts:
        return None
    return '. '.join(p[0].upper() + p[1:] for p in parts) + '.'


def insert(items, niche):
    rows = [{
        'owner_id': None, 'platform': it['platform'], 'url': it['url'], 'niche': niche,
        'creator': it.get('creator'), 'title': (it.get('title') or '')[:300],
        'why': it.get('why'), 'reach': _fmt(it.get('views')), 'likes': _fmt(it.get('likes')),
        'visibility': 'public',
    } for it in items]
    if rows:
        _sb('gallery_items', method='POST', body=rows)


def instagram(query, limit):
    if not APIFY_TOKEN:
        return []
    url = 'https://api.apify.com/v2/acts/%s/run-sync-get-dataset-items?token=%s' % (IG_ACTOR, APIFY_TOKEN)
    body = {'search': query, 'searchType': 'hashtag', 'searchLimit': 1,
            'resultsType': 'posts', 'resultsLimit': limit, 'addParentData': False}
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read() or '[]')
    out = []
    for p in (data or [])[:limit]:
        u = p.get('url') or ''
        if not u:
            continue
        # MEASURED IN PRODUCTION 2026-09-09: EVERY INSTAGRAM CARD OF THE LAST
        # SEVEN DAYS WAS A HASHTAG PAGE, NOT A POST. 92 of 92 carried
        # reach '0', likes '0', an EMPTY title and creator '@' -- and a sample
        # url of https://www.instagram.com/explore/tags/... . The actor returns
        # the search page objects alongside (or instead of) posts, and nothing
        # here told them apart, so the gallery filled with links that open a tag
        # page. A creator clicking one gets no video; it can never be remixed;
        # and `why_for` correctly produced None because there was nothing to say.
        #
        # A POST URL IS DECIDABLE, so decide it rather than hoping the payload
        # is well-formed. Instagram posts live at /p/<id> or /reel(s)/<id>;
        # /explore/tags/... is definitionally not one.
        if not is_instagram_post(u):
            continue
        # AND AN ITEM WITH NO CAPTION AND NO ENGAGEMENT IS NOT A REFERENCE.
        # It cannot be ranked, cannot be explained, and renders as a blank row.
        # Skipping it is not data loss: there was no datum.
        if not (p.get('caption') or '').strip() and not (
                p.get('videoViewCount') or p.get('videoPlayCount') or p.get('likesCount')):
            continue
        out.append({'platform': 'instagram', 'url': u, 'title': p.get('caption', ''),
                    'views': p.get('videoViewCount') or p.get('videoPlayCount') or p.get('likesCount') or 0,
                    'likes': p.get('likesCount') or 0,
                    'creator': '@' + (p.get('ownerUsername') or ''),
                    'thumbnail': p.get('displayUrl', '')})
    return out


def search_query(niche):
    """A clean, short search query from a possibly long multi-topic niche label.
    The first topic (before a comma or slash) and a few words search far better
    than the whole string, e.g. "Tech careers, Pakistani diaspora, prof tips" ->
    "Tech careers". The full niche stays the gallery LABEL; only the query shrinks."""
    seg = re.split(r'[,/]', niche)[0].strip()
    return ' '.join(seg.split()[:6]) or niche.strip()


def main():
    have = existing_urls()
    base_set = set(n.strip().lower() for n in BASE_NICHES)
    only = os.environ.get('DISCOVERY_ONLY_NICHE', '').strip()
    if only:
        # Trigger-driven run: a new creator niche just appeared, so scrape ONLY that
        # niche (free YT/TikTok) instead of re-sweeping every niche (~1 vs ~14).
        niches = list(dict.fromkeys(n.strip() for n in only.split(',') if n.strip()))
        print('discovering %d targeted niche(s): %s' % (len(niches), ', '.join(niches)))
    else:
        # Base niches + the niches real creators actually have (auto-derived each run).
        niches = list(dict.fromkeys(BASE_NICHES + creator_niches(BASE_NICHES)))
        print('discovering %d niches (%d base + creator-derived): %s'
              % (len(niches), len(BASE_NICHES), ', '.join(niches)))
    total = 0
    for niche in niches:
        q = search_query(niche)  # clean query for search; full `niche` stays the label
        # Imported here rather than at module scope: `scrapling` lives on the
        # VPS image only, and an import that fails on a laptop makes every rule
        # in this file untestable.
        import discover
        srcs = [('youtube', lambda: discover.youtube(q + ' tips', YT_LIMIT)),
                ('tiktok', lambda: discover.tiktok(q, TT_LIMIT))]
        # Instagram uses paid Apify. If APIFY_TOKEN is set, enable it for all niches
        # to ensure the gallery is highly relevant to their connected brand niche.
        if APIFY_TOKEN:
            srcs.append(('instagram', lambda: instagram(q, IG_LIMIT)))
        items = []
        for label, fn in srcs:
            try:
                items += fn()
            except Exception as e:
                print('[%s] %s failed: %s' % (niche, label, e), file=sys.stderr)
        fresh = []
        for it in items:
            if it.get('url') and it['url'] not in have:
                have.add(it['url'])
                it['why'] = why_for(it)
                fresh.append(it)
        insert(fresh, niche)
        total += len(fresh)
        print('%s: +%d new items' % (niche, len(fresh)))
    print('TOTAL inserted: %d' % total)


def _require_env():
    """The credentials the run genuinely cannot proceed without.

    Checked HERE rather than at import, so the file can be imported and its
    rules exercised without them -- while a real run still stops immediately,
    with the name of what is missing, instead of failing somewhere later.
    """
    missing = [k for k in ('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
               if not os.environ.get(k, '').strip()]
    if missing:
        print('discovery: missing required env: %s' % ', '.join(missing), file=sys.stderr)
        sys.exit(2)


def _selftest():
    """A HASHTAG PAGE IS NOT A POST — asserted on the real production URL.

    `discovery/` has no test harness and no CI job, so the rule that stops 92
    junk cards a week is checked here, by the same file that applies it. Run it
    with `python3 discovery/run.py --selftest`.
    """
    cases = [
        # The exact shape production stored, 92 times in seven days.
        ('https://www.instagram.com/explore/tags/%CF%83%CE%BF%CE%B6', False),
        ('https://www.instagram.com/explore/tags/skincare/', False),
        # THE CASE THAT MAKES THE /explore/ CHECK REACHABLE, and the reason it
        # is not redundant. Mutation testing removed that check and the suite
        # stayed green, because no tag name in it collided with a post shape.
        # `reels`, `p` and `tv` are all real hashtags, and without the check the
        # substring test would accept their tag pages as posts.
        ('https://www.instagram.com/explore/tags/reels/', False),
        ('https://www.instagram.com/explore/tags/p/', False),
        ('https://www.instagram.com/explore/tags/tv/', False),
        ('https://www.instagram.com/explore/', False),
        ('https://www.instagram.com/', False),
        ('https://www.instagram.com/someone/', False),
        # Real posts, in every shape Instagram serves them.
        ('https://www.instagram.com/p/Cxyz123/', True),
        ('https://www.instagram.com/reel/Cxyz123/', True),
        ('https://www.instagram.com/reels/Cxyz123/', True),
        ('https://www.instagram.com/tv/Cxyz123/', True),
        ('https://www.instagram.com/P/CXYZ123/', True),
        ('', False),
        (None, False),
    ]
    bad = 0
    for u, want in cases:
        got = is_instagram_post(u)
        if got != want:
            print('selftest: %r -> %s, want %s' % (u, got, want), file=sys.stderr); bad += 1
    # A caption-less, engagement-less item is not a reference even at a post URL.
    if why_for({'views': 0, 'likes': 0, 'title': ''}) is not None:
        print('selftest: an empty item produced a why line', file=sys.stderr); bad += 1
    # And a real one still does.
    if why_for({'views': 4300, 'likes': 250, 'title': 'How I did it?'}) is None:
        print('selftest: a real item produced no why line', file=sys.stderr); bad += 1
    if bad:
        print('discovery selftest: %d FAILED' % bad, file=sys.stderr); sys.exit(1)
    print('discovery selftest: OK (%d url cases + 2 why cases)' % len(cases))


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        _selftest(); sys.exit(0)
    _require_env()
    main()
