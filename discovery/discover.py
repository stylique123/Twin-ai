#!/usr/bin/env python3
"""Niche discovery scraper (free, Scrapling). Usage: discover.py <platform> <query> <limit>
Prints JSON array of {url,title,views,likes,creator,thumbnail,platform}."""
import sys, json, re
from scrapling.fetchers import StealthyFetcher

def _find_json(html, marker):
    i = html.find(marker)
    if i < 0: return None
    j = html.find('{', i)
    if j < 0: return None
    depth, in_str, esc = 0, False, False
    for k in range(j, len(html)):
        c = html[k]
        if in_str:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == '"': in_str = False
        else:
            if c == '"': in_str = True
            elif c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    try: return json.loads(html[j:k+1])
                    except Exception: return None
    return None

def _num(s):
    if isinstance(s, (int, float)): return int(s)
    if not s: return 0
    s = str(s).replace(',', '').strip().lower().replace(' views','').replace(' view','')
    m = re.match(r'([\d.]+)\s*([kmb]?)', s)
    if not m: return 0
    return int(float(m.group(1)) * {'k':1e3,'m':1e6,'b':1e9}.get(m.group(2),1))

def _fetch(url):
    p = StealthyFetcher.fetch(url, headless=True, network_idle=True, timeout=70000)
    return getattr(p, 'html_content', None) or str(p)

def youtube(query, limit):
    html = _fetch('https://www.youtube.com/results?search_query=' + query.replace(' ', '+') + '&sp=CAMSAhAB')
    data = _find_json(html, 'ytInitialData'); out = []
    def walk(o):
        if len(out) >= limit: return
        if isinstance(o, dict):
            vr = o.get('videoRenderer')
            if isinstance(vr, dict) and vr.get('videoId'):
                title = ''.join(r.get('text','') for r in vr.get('title',{}).get('runs',[]))
                views = vr.get('viewCountText',{}).get('simpleText','') or ''.join(r.get('text','') for r in vr.get('viewCountText',{}).get('runs',[]))
                ch = ''.join(r.get('text','') for r in vr.get('ownerText',{}).get('runs',[]))
                th = vr.get('thumbnail',{}).get('thumbnails',[])
                out.append({'platform':'youtube','url':'https://www.youtube.com/watch?v='+vr['videoId'],'title':title,'views':_num(views),'likes':0,'creator':ch,'thumbnail':th[-1]['url'] if th else ''})
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    if data: walk(data)
    return out[:limit]

def _tt_hydrate(uname, vid):
    """Fetch a single TikTok video page and pull its real stats."""
    html = _fetch('https://www.tiktok.com/@' + uname + '/video/' + vid)
    data = _find_json(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__')
    if not data: return None
    found = {}
    def walk(o):
        if found: return
        if isinstance(o, dict):
            if o.get('id') and isinstance(o.get('stats'), dict) and isinstance(o.get('author'), dict):
                found.update(o); return
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data)
    if not found: return None
    st = found.get('stats', {}); au = found.get('author', {}); vv = found.get('video', {})
    handle = au.get('uniqueId') or uname if isinstance(au, dict) else uname
    cover = (vv.get('cover') or vv.get('originCover') or '') if isinstance(vv, dict) else ''
    return {'platform':'tiktok','url':'https://www.tiktok.com/@'+handle+'/video/'+vid,
            'title':found.get('desc',''),'views':_num(st.get('playCount',0)),
            'likes':_num(st.get('diggCount',0)),'creator':'@'+handle,'thumbnail':cover}

def tiktok(query, limit):
    html = _fetch('https://www.tiktok.com/tag/' + query.replace(' ', ''))
    seen, cands = set(), []
    for uname, vid in re.findall(r'/@([\w.]+)/video/(\d+)', html):
        if vid not in seen:
            seen.add(vid); cands.append((uname, vid))
    out = []
    for uname, vid in cands[:max(limit, 1)]:
        try:
            it = _tt_hydrate(uname, vid)
            if it: out.append(it)
        except Exception:
            pass
        if len(out) >= limit: break
    out.sort(key=lambda x: x['views'], reverse=True)
    return out[:limit]

if __name__ == '__main__':
    platform, query, limit = sys.argv[1], sys.argv[2], int(sys.argv[3])
    try:
        print(json.dumps({'youtube':youtube,'tiktok':tiktok}[platform](query, limit)))
    except Exception as e:
        print(json.dumps({'error':str(type(e).__name__)+': '+str(e)})); sys.exit(1)
