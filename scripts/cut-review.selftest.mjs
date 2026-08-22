#!/usr/bin/env node
// ⚠️ THE PROPERTIES THAT MATTER ARE THE EXCLUSIONS. Anyone can build a packet;
// the question is whether it refuses staging rows, refuses uploads, refuses
// unrendered attempts, and puts controls somewhere a real cut is not.
import {
  isProductOrigin, eligibleRenders, packetReadiness, reviewWindow,
  controlPositions, reviewItems, PAD_MS, RENDERS_NEEDED,
} from './cut-review.mjs'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.error(`  FAIL  ${n}`) } }
const refuses = (n, fn) => { try { fn(); fail++; console.error(`  FAIL  ${n} — accepted`) } catch { pass++ } }

const render = (over = {}) => ({
  render_id: 'r1', origin: 'teleprompter', render_completed: true,
  output_duration_ms: 30000, cuts: [5000, 12000, 21000], ...over,
})

// ── who counts ────────────────────────────────────────────────────────────
ok('a teleprompter recording is product origin', isProductOrigin({ origin: 'teleprompter' }))
ok('an upload is NOT product origin', !isProductOrigin({ origin: 'upload' }))
ok('a missing origin is not product origin', !isProductOrigin({}))
ok('an unknown origin is not product origin', !isProductOrigin({ origin: 'staging' }))

ok('an upload is excluded from eligibility', eligibleRenders([render({ origin: 'upload' })]).length === 0)
ok('an unrendered attempt is excluded', eligibleRenders([render({ render_completed: false })]).length === 0)
ok('a render with no duration is excluded', eligibleRenders([render({ output_duration_ms: 0 })]).length === 0)
ok('a render with no cuts is excluded', eligibleRenders([render({ cuts: [] })]).length === 0)
ok('CONTROL: a genuine product render IS eligible', eligibleRenders([render()]).length === 1)

// ── readiness ─────────────────────────────────────────────────────────────
{
  const r0 = packetReadiness([])
  ok('nothing yet is not ready', !r0.ready && r0.shortfall === RENDERS_NEEDED)
  const r1 = packetReadiness([render()])
  ok('one render is not enough, and says how short', !r1.ready && r1.shortfall === 1)
  const r2 = packetReadiness([render(), render({ render_id: 'r2' })])
  ok('two genuine renders are ready', r2.ready && r2.shortfall === 0)
  // ⚠️ THE CASE THAT WOULD OTHERWISE READ AS "THE CREATOR MADE NOTHING".
  const up = packetReadiness([render({ origin: 'upload' }), render({ origin: 'upload' })])
  ok('uploads are counted as excluded, not as absent', !up.ready && up.seen === 2 && up.uploadsExcluded === 2)
}

// ── the window ────────────────────────────────────────────────────────────
{
  const w = reviewWindow(10000, 30000)
  ok('a mid-video cut is centred', w.startMs === 10000 - PAD_MS && w.endMs === 10000 + PAD_MS)
  ok('and reports where the cut falls inside the clip', w.offsetInClipMs === PAD_MS)

  const early = reviewWindow(400, 30000)
  ok('an early cut clamps at zero rather than going negative', early.startMs === 0)
  ok('...and the cut is NOT re-centred, it sits near the edge', early.offsetInClipMs === 400)

  const late = reviewWindow(29800, 30000)
  ok('a late cut clamps at the end', late.endMs === 30000)
  ok('...and still reports its true offset', late.offsetInClipMs === 29800 - late.startMs)

  refuses('a cut past the end is refused', () => reviewWindow(31000, 30000))
  refuses('a negative cut is refused', () => reviewWindow(-1, 30000))
  refuses('a zero-length video is refused', () => reviewWindow(0, 0))
}

// ── controls ──────────────────────────────────────────────────────────────
{
  const cuts = [5000, 12000, 21000]
  const c = controlPositions(cuts, 30000, 3, 'seed-a')
  ok('controls are produced', c.length > 0)
  ok('NO control lands on a real cut', c.every((t) => cuts.every((x) => Math.abs(x - t) >= PAD_MS)))
  ok('controls are clear of each other', c.every((t, i) => c.every((u, j) => i === j || Math.abs(t - u) >= PAD_MS)))
  ok('controls stay inside the video', c.every((t) => t > PAD_MS && t < 30000 - PAD_MS))

  // ⚠️ REPRODUCIBLE, OR TWO PEOPLE LABEL DIFFERENT PACKETS AND CALL IT ONE.
  ok('the same seed gives the same controls',
    JSON.stringify(controlPositions(cuts, 30000, 3, 'seed-a')) === JSON.stringify(c))
  ok('a different seed gives different controls',
    JSON.stringify(controlPositions(cuts, 30000, 3, 'seed-b')) !== JSON.stringify(c))

  // A densely-cut short video may have nowhere safe. Fewer honest controls
  // beats inventing unsafe ones.
  const dense = controlPositions([1000, 2000, 3000, 4000], 5000, 4, 's')
  ok('nowhere safe yields fewer controls, never unsafe ones',
    dense.every((t) => [1000, 2000, 3000, 4000].every((x) => Math.abs(x - t) >= PAD_MS)))
}

// ── the items ─────────────────────────────────────────────────────────────
{
  const items = reviewItems(render())
  const real = items.filter((i) => !i.isControl)
  ok('every real cut becomes an item', real.length === 3)
  ok('controls are mixed in', items.some((i) => i.isControl))
  ok('every item carries a window and the cut position', items.every((i) =>
    typeof i.startMs === 'number' && typeof i.endMs === 'number'
    && i.endMs > i.startMs && typeof i.offsetInClipMs === 'number'))
  ok('a control is shaped exactly like a real cut except for the flag',
    (() => {
      const a = items.find((i) => !i.isControl), b = items.find((i) => i.isControl)
      return b !== undefined
        && JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort())
    })())
  refuses('a render with no id is refused — controls could not be reproduced',
    () => reviewItems({ ...render(), render_id: null, id: null }))
}

console.log(`cut-review selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
