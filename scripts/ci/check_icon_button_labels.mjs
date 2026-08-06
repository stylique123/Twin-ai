// AN ICON-ONLY BUTTON MUST SAY WHAT IT DOES.
//
// A `<button>` whose only child is an icon has no accessible name. A screen
// reader announces "button" and stops — so the close button on every modal, and
// the month arrows on the Calendar, were nine controls a blind creator could
// find and not identify. Voice control has the same problem from the other
// side: "click close" cannot match a control with no name.
//
// This is the kind of defect that never appears in a bug report, because the
// people it excludes mostly do not file one — they leave. It is also trivially
// preventable, which is why it gets a guard rather than a one-time sweep: nine
// were fixed by hand today and the tenth will be added next week by someone who
// copied a working pattern from a file written before this rule existed.
//
// ── WHAT COUNTS AS A NAME ─────────────────────────────────────────────────
//
// `aria-label`, `aria-labelledby`, or `title`. Visible text is the best answer
// of all and needs nothing — a button containing words is already named, which
// is why this only fires on buttons whose entire content is an icon element.
//
// The check is deliberately NARROW. It looks for the unambiguous shape — a
// button element wrapping exactly one self-closing capitalised component and
// nothing else — and stays silent on anything more complicated. A conditional
// that renders an icon in one branch and text in another is not something a
// regex should have an opinion about, and a guard that guesses gets disabled.
//
//   node scripts/ci/check_icon_button_labels.mjs            # live
//   node scripts/ci/check_icon_button_labels.mjs --selftest # fixtures
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const ROOT = join(REPO, 'apps', 'web', 'src')

/** A button whose whole body is one self-closing component element. */
const ICON_ONLY = /<button\b([^>]*)>\s*<[A-Z][A-Za-z0-9]*\b[^>]*\/>\s*<\/button>/g
const NAMED = /\b(aria-label|aria-labelledby|title)\s*=/

export function findUnlabelled(src) {
  const out = []
  // Strip comments so a commented-out example cannot be reported.
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const m of code.matchAll(ICON_ONLY)) {
    const attrs = m[1] ?? ''
    if (NAMED.test(attrs)) continue
    // Line number of the match, for a clickable error.
    const line = code.slice(0, m.index).split('\n').length
    out.push({ line, snippet: m[0].replace(/\s+/g, ' ').slice(0, 90) })
  }
  return out
}

function tsxFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules' || e === 'dist') continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e.endsWith('.tsx')) out.push(p)
    }
  }
  walk(dir)
  return out
}

function evaluate() {
  const problems = []
  for (const f of tsxFiles(ROOT)) {
    for (const hit of findUnlabelled(readFileSync(f, 'utf8'))) {
      problems.push(
        `${relative(REPO, f)}:${hit.line} icon-only button has no accessible name — a screen `
        + `reader announces "button" and nothing else. Add aria-label. ${hit.snippet}`)
    }
  }
  return problems
}

function selftest() {
  const cases = [
    ['an unlabelled icon button is caught', '<button onClick={f} className="x"><X className="h-4" /></button>', 1],
    ['aria-label satisfies it', '<button aria-label="Close" onClick={f}><X className="h-4" /></button>', 0],
    ['aria-labelledby satisfies it', '<button aria-labelledby="t" onClick={f}><X className="h-4" /></button>', 0],
    ['title satisfies it', '<button title="Close" onClick={f}><X className="h-4" /></button>', 0],
    ['a button with visible text is already named', '<button onClick={f}><X className="h-4" /> Close</button>', 0],
    ['text-only button is not an icon button', '<button onClick={f}>Close</button>', 0],
    ['a commented-out example is not a finding', '{/* <button><X className="h-4" /></button> */}', 0],
    ['multiline attributes are handled', '<button\n  aria-label="Close"\n  onClick={f}\n><X className="h-4" /></button>', 0],
    ['multiline unlabelled is still caught', '<button\n  onClick={f}\n  className="x"\n><X className="h-4" /></button>', 1],
    // The narrowness, asserted: a conditional body is NOT this shape and must
    // stay silent rather than be guessed at.
    ['a conditional body is left alone', '<button onClick={f}>{ok ? <X className="h-4" /> : "Close"}</button>', 0],
  ]
  let failed = 0
  for (const [name, src, expected] of cases) {
    const got = findUnlabelled(src).length
    if (got !== expected) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${expected}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`icon-button-labels selftest: ${failed} failed`); process.exit(1) }
  console.log('icon-button-labels selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const problems = evaluate()
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log('icon-button-labels guard: OK (every icon-only button has an accessible name)')
  }
}
