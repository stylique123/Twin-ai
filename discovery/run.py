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
import discover

SUPABASE_URL = os.environ['SUPABASE_URL'].rstrip('/')
SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
APIFY_TOKEN = os.environ.get('APIFY_TOKEN', '').strip()
IG_ACTOR = os.environ.get('APIFY_INSTAGRAM_DISCOVER_ACTOR', 'shu8hvrXbJbY3Eb9W').strip()

BASE_NICHES = json.loads(os.environ.get('DISCOVERY_NICHES',
    '["Business","Fitness","Food","Education","Lifestyle","Beauty"]'))
YT_LIMIT = int(os.environ.get('DISCOVERY_YT_LIMIT', '12'))
TT_LIMIT = int(os.environ.get('DISCOVERY_TT_LIMIT', '12'))
IG_LIMIT = int(os.environ.get('DISCOVERY_IG_LIMIT', '3'))  # reduced to keep IG ~$5/mo
# Cap how many creator-derived niches we add per run, so a growing user base can't
# blow up run time. Free scrapers (YT/TikTok) only for these — IG stays base-only.
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
        rows = _sb('brand_voices', params={'select': 'profile', 'status': 'eq.ready', 'limit': '500'})
    except Exception as e:
        print('creator_niches lookup failed: %s' % e, file=sys.stderr)
        return []
    base_lower = set(n.strip().lower() for n in base)
    seen = set(base_lower)
    out = []
    for r in (rows or []):
        # Store the FULL niche verbatim as the label so it exact-matches the
        # creator's voice niche in the gallery UI (a truncated label would not).
        n = ((r.get('profile') or {}).get('niche') or '').strip()
        if not n or len(n) < 3:
            continue
        k = n.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(n)
        if len(out) >= CREATOR_NICHE_CAP:
            break
    return out


def _fmt(n):
    n = int(n or 0)
    for d, s in ((1e9, 'B'), (1e6, 'M'), (1e3, 'K')):
        if n >= d:
            return ('%.1f' % (n / d)).rstrip('0').rstrip('.') + s
    return str(n)


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
    # Base niches + the niches real creators actually have (auto-derived each run).
    niches = list(dict.fromkeys(BASE_NICHES + creator_niches(BASE_NICHES)))
    print('discovering %d niches (%d base + creator-derived): %s'
          % (len(niches), len(BASE_NICHES), ', '.join(niches)))
    total = 0
    for niche in niches:
        q = search_query(niche)  # clean query for search; full `niche` stays the label
        srcs = [('youtube', lambda: discover.youtube(q + ' tips', YT_LIMIT)),
                ('tiktok', lambda: discover.tiktok(q, TT_LIMIT))]
        # Instagram uses paid Apify, so keep it to the base niches only (cost cap).
        if niche.strip().lower() in base_set:
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


if __name__ == '__main__':
    main()
