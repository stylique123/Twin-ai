#!/usr/bin/env python3
"""Compile a design board's markup into a React (TSX) component, one for one.

    python3 -I board2tsx.py <board.dc.html> <ComponentName> <out.tsx> [--from-text X] [--to-text Y]

What it does (START_HERE rule 1.2):
  * every inline `style` declaration becomes a Tailwind arbitrary-property class
    (`padding: 7px 16px` -> `[padding:7px_16px]`), so values are copied exactly;
  * declarations that contain `{{ holes }}` become a React `style` object;
  * `<sc-for list as>` -> `.map`, `<sc-if value>` -> conditional;
  * `{{ a.b }}` -> `v.a.b` (or the loop variable), `onClick="{{ f }}"` -> onClick={f};
  * board CSS classes are kept with an `lp-` prefix (their CSS is ported separately);
  * text under 12px is raised to 12px, except inside elements marked as device
    mockups (class `fl2`, or any element with `transform: scale(`);
  * board links become app routes; <video> becomes <LoopVideo> (poster +
    reduced-motion handling).
It never copies the design runtime (support.js, DCLogic). The state logic is
ported by hand into a hook that returns the `v` object.
"""
import html
import re
import sys
from html.parser import HTMLParser

VOID = {'br', 'img', 'input', 'stop', 'rect', 'path', 'ellipse', 'circle', 'line', 'source'}
SVG_ATTR = {
    'viewbox': 'viewBox', 'gradientunits': 'gradientUnits', 'stop-color': 'stopColor',
    'stroke-width': 'strokeWidth', 'stroke-dasharray': 'strokeDasharray', 'stroke-linejoin': 'strokeLinejoin',
    'stroke-linecap': 'strokeLinecap', 'fill-opacity': 'fillOpacity', 'stop-opacity': 'stopOpacity',
}
SVG_TAG = {'lineargradient': 'linearGradient', 'radialgradient': 'radialGradient'}
HOLE = re.compile(r'\{\{\s*([^}]+?)\s*\}\}')


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root', [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def camel(prop):
    if prop.startswith('-webkit-'):
        prop = 'Webkit-' + prop[8:]
    return re.sub(r'-([a-z])', lambda m: m.group(1).upper(), prop)


class Compiler:
    def __init__(self, responsive=True):
        self.loopvars = []
        # Width adaptation (rule B) is for the desktop board only; the phone
        # board is already the layout for every width under 768.
        self.responsive = responsive

    def expr(self, e):
        e = e.strip()
        head = re.split(r'[.\[]', e)[0]
        if head in ('true', 'false') or re.fullmatch(r'-?\d+(\.\d+)?', e):
            return e
        return e if head in self.loopvars else 'v.' + e

    def text(self, s):
        out = []
        pos = 0
        for m in HOLE.finditer(s):
            out.append(self.lit(s[pos:m.start()]))
            out.append('{' + self.expr(m.group(1)) + '}')
            pos = m.end()
        out.append(self.lit(s[pos:]))
        return ''.join(out)

    @staticmethod
    def lit(t):
        if not t:
            return ''
        t = re.sub(r'\s+', ' ', t)
        return t.replace('{', '&#123;').replace('}', '&#125;').replace('<', '&lt;').replace('>', '&gt;')

    def style(self, s, mockup):
        classes, dyn = [], []
        for decl in [d.strip() for d in s.split(';') if d.strip()]:
            if ':' not in decl:
                continue
            prop, val = [x.strip() for x in decl.split(':', 1)]
            prop = prop.lower()
            if prop == 'font-family':
                continue  # the app sets Geist once on the root
            if prop == 'font-size' and not mockup:
                m = re.fullmatch(r'([\d.]+)px', val)
                if m and float(m.group(1)) < 12:
                    val = '12px'  # rule 1.3: text under 12px goes up to 12px
            if HOLE.search(val):
                tpl = HOLE.sub(lambda m: '${' + self.expr(m.group(1)) + '}', val)
                dyn.append(f'{camel(prop)}: `{tpl}`')
                continue
            imp = val.endswith('!important')
            val = val.replace('!important', '').strip()
            val = val.replace('#0B0B0E', '#07070A').replace('#0b0b0e', '#07070A')  # rule 1.3: -> ink
            cls = '[' + prop + ':' + val.replace('_', '\\_').replace(' ', '_') + ']'
            classes.append(('!' if imp else '') + cls)
        return classes, dyn

    def link(self, href):
        if href in ('Welcome.dc.html', 'MWelcome.dc.html'):
            return ('Link', '/auth?mode=signup')
        if href == '#':
            return ('Link', '/auth?mode=signin')
        if href.startswith('#'):
            return ('a', href)
        if href.startswith('Privacy'):
            return ('Link', '/privacy')
        if href.startswith('Terms'):
            return ('Link', '/terms')
        return ('a', href)

    def node(self, n, ind, mockup=False, pstyle=''):
        if isinstance(n, str):
            if not n:
                return ''
            if not n.strip():
                return ' ' * ind + "{' '}"  # keep inter-element spaces (JSX trims them)
            t = self.text(n)
            lead = "{' '}" if n[0].isspace() else ''
            trail = "{' '}" if n[-1].isspace() else ''
            return ' ' * ind + lead + t.strip() + trail
        tag = n.tag
        a = n.attrs
        pad = ' ' * ind
        if tag == 'sc-for':
            lst = HOLE.search(a['list']).group(1)
            var = a['as']
            src = self.expr(lst)
            self.loopvars.append(var)
            body = self.kids(n, ind + 4, mockup)
            self.loopvars.pop()
            return f'{pad}{{{src}.map(({var}: any, {var}_i: number) => (\n{pad}  <Fragment key={{{var}_i}}>\n{body}\n{pad}  </Fragment>\n{pad}))}}'
        if tag == 'sc-if':
            cond = self.expr(HOLE.search(a['value']).group(1))
            body = self.kids(n, ind + 4, mockup)
            return f'{pad}{{{cond} ? (\n{pad}  <>\n{body}\n{pad}  </>\n{pad}) : null}}'
        if a.get('aria-hidden') == 'true' and any(isinstance(k, str) and k.strip() == '9:41' for d in n.kids if not isinstance(d, str) for k in d.kids):
            return ''  # the phone board's fake iOS status bar
        parent_mockup = mockup
        fit_w = None
        mockup = mockup or 'fl2' in a.get('class', '').split() or 'scale(' in a.get('style', '')
        is_root = 'brandbg' in a.get('class', '').split()
        props = []
        st = a.get('style', '')
        if is_root:
            # The board canvas: full width, no fixed min-height (rule B).
            st = re.sub(r'(^|;)\s*(width|min-height):[^;]*', r'\1', st)
            st += '; width: 100%'
        elif not parent_mockup and self.responsive:
            # Wide fixed containers shrink with the viewport (rule B), keeping 24px gutters.
            # Keep the board width exactly; cap it at the container instead
            # (a min() width collapses inside shrink-to-fit parents).
            m = re.search(r'(?:^|;)\s*width:\s*([\d.]+)px\s*(?=;|$)', st)
            hm = re.search(r'(?:^|;)\s*height:\s*([\d.]+)px', st)
            prow = 'display: flex' in pstyle and 'flex-direction: column' not in pstyle
            has_text = any(isinstance(k, str) and k.strip() for k in n.kids)
            if m and float(m.group(1)) >= 600 and hm and not prow and a.get('aria-hidden') != 'true' and 'position: absolute' not in st and not has_text:
                fit_w = m.group(1)  # fixed-size illustration stage: scaled to fit (lp-fit)
            elif m and prow and float(m.group(1)) >= 150 and 'flex-shrink: 0' not in st:
                # Fixed card in a row: exact board width when there's room, shrinks
                # (text wraps, never smaller) when there isn't.
                # Board flex items already shrink (flex-shrink 1); min-width 0 lets them.
                st += '; min-width: 0'
            elif m and float(m.group(1)) >= 600 and 'max-width' not in st:
                st += '; max-width: ' + ('calc(100% - 48px)' if float(m.group(1)) >= 800 else '100%')
        if fit_w:
            mockup = True  # inside a scaled illustration: no 12px raise, no further fitting
        classes, dyn = self.style(st, mockup)
        if self.responsive and not mockup and 'display: flex' in st and 'flex-direction: column' not in st:
            if 'flex-wrap' not in st:
                classes.append('max-lg:[flex-wrap:wrap]')
            if 'max-width' not in st:
                classes.append('max-xl:[max-width:calc(100%_-_48px)]')  # below 1280 a row may not outgrow the page
        g = re.search(r'grid-template-columns:\s*([^;]+)', st)
        if g and not mockup and self.responsive:
            tracks = g.group(1)
            ncols = int(re.search(r'repeat\((\d+)', tracks).group(1)) if 'repeat(' in tracks else len(re.findall(r'(?:minmax\([^)]*\)|[\d.]+(?:px|fr)|auto)', tracks))
            if re.search(r'\d+px', tracks) and ncols >= 2:
                # px columns shrink below 1280 (rule B: columns shrink, text doesn't)
                classes.append(f'max-xl:[grid-template-columns:repeat({ncols},minmax(0,1fr))]')
            if ncols >= 3:
                classes.append('max-lg:[grid-template-columns:repeat(2,minmax(0,1fr))]')

        board_classes = []
        cls_attr = a.get('class', '')
        dyn_class = None
        if HOLE.search(cls_attr):
            dyn_class = self.expr(HOLE.search(cls_attr).group(1))
            cls_attr = HOLE.sub('', cls_attr)
        for c in cls_attr.split():
            board_classes.append('lp-' + c)
        all_cls = board_classes + classes
        fitw = fit_w
        if fitw:
            all_cls = ['lp-fit'] + all_cls
            props.append(f'data-fit-w="{fitw}"')
        jtag = SVG_TAG.get(tag, tag)
        if tag == 'video':
            src = a.get('src', '')
            name = re.sub(r'.*/', '', src).replace('.mp4', '') if '{{' not in src else None
            nm = f'"{name}"' if name else '{' + self.expr(HOLE.search(src).group(1)) + '}'
            return f'{pad}<LoopVideo name={nm} className="{" ".join(all_cls)}" />'
        if tag == 'a':
            kind, href = self.link(a.get('href', '#'))
            jtag = kind
            props.append(f'to="{href}"' if kind == 'Link' else f'href="{href}"')
        for k, val in a.items():
            if k in ('style', 'class', 'href', 'hint-placeholder-count', 'hint-placeholder-val', 'src'):
                continue
            if val is None:
                continue
            kk = SVG_ATTR.get(k, k)
            if k == 'onclick':
                props.append('onClick={' + self.expr(HOLE.search(val).group(1)) + '}')
                continue
            if HOLE.search(val):
                props.append(f'{kk}={{{self.expr(HOLE.search(val).group(1))}}}')
                continue
            props.append(f'{kk}="{html.escape(val, quote=True)}"')
        if all_cls or dyn_class:
            if dyn_class:
                props.append('className={`' + ' '.join(all_cls) + ' lp-${' + dyn_class + '}`}')
            else:
                props.append('className="' + ' '.join(all_cls) + '"')
        if dyn:
            props.append('style={{ ' + ', '.join(dyn) + ' } as CSSProperties}')
        open_ = f'<{jtag}' + (' ' + ' '.join(props) if props else '')
        if tag in VOID:
            return f'{pad}{open_} />'
        body = self.kids(n, ind + 2, mockup, a.get('style', ''))
        if not body.strip():
            return f'{pad}{open_} />' if tag not in ('textarea',) else f'{pad}{open_}></{jtag}>'
        return f'{pad}{open_}>\n{body}\n{pad}</{jtag}>'

    def kids(self, n, ind, mockup, pstyle=''):
        parts = [self.node(k, ind, mockup, pstyle) for k in n.kids]
        return '\n'.join(p for p in parts if p.strip())


def main():
    path, name, out = sys.argv[1:4]
    opts = dict(zip(sys.argv[4::2], sys.argv[5::2]))
    s = open(path, encoding='utf-8').read()
    body = s[s.find('</helmet>') + 9:]
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
    # Drop the board header and footer: the app renders <Nav/> and <SiteFooter/>.
    body = re.sub(r'<header\b.*?</header>', '', body, count=1, flags=re.S)
    body = re.sub(r'<footer\b.*?</footer>', '', body, count=1, flags=re.S)
    body = body[:body.rfind('</x-dc>')] if '</x-dc>' in body else body
    p = P()
    p.feed(body)
    c = Compiler(responsive=opts.get('--phone') != '1')
    root = [k for k in p.root.kids if not isinstance(k, str) or k.strip()]
    jsx = '\n'.join(c.node(k, 4) for k in root)
    open(out, 'w', encoding='utf-8').write(
        f"""// GENERATED by design-handoff/tools/board2tsx.py from {path.split('/')[-1]}.
// Do not hand-edit values here: fix the board or the compiler and regenerate.
/* eslint-disable */
import {{ Fragment }} from 'react'
import type {{ CSSProperties }} from 'react'
import {{ Link }} from 'react-router-dom'
import LoopVideo from './LoopVideo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function {name}({{ v }}: {{ v: any }}) {{
  return (
  <>
{jsx}
  </>
  )
}}
""")
    print('wrote', out, len(jsx), 'chars')


if __name__ == '__main__':
    main()
