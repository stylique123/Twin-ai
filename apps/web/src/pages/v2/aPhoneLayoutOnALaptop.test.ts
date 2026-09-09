// THE STUDIO WAS DESIGNED AT PHONE WIDTH AND NEVER GIVEN A DESKTOP LAYOUT.
//
// ⚠️ ONE PART OF THE REPORT DID NOT REPRODUCE, and it is recorded here so nobody
// re-fixes it: "four cards stacked vertically" was never true on main. The doors
// have been `grid-cols-2` with no breakpoint since at least 2026-09-06, so they
// were a 2×2 at EVERY width — including phone, which is the actual defect in the
// other direction.
//
// ⚖️ WHAT DID REPRODUCE, AND IS MEASURABLE IN THE SOURCE:
//
//   the whole column      max-w-2xl  (672px) on a 1440px screen
//   the four doors        max-w-md   (448px)
//   the idea input        max-w-md   (448px)   ← the same number as the doors
//
// The last line is the one worth naming. The doors are a CHOOSER and the input
// is where she WRITES; sizing them identically is what makes the page read as
// five big boxes. The owner put it exactly this way: "the boxes for choosing a
// mode should be small; the box for writing your idea should be big. Those are
// opposite sizing rules and right now both are large."
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CREATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'V2Create.tsx'), 'utf8')

/** The class list of the element whose class string contains `marker`. */
const classesAround = (marker: string): string => {
  const i = CREATE.indexOf(marker)
  expect(i, `marker not found: ${marker}`).toBeGreaterThan(-1)
  const start = CREATE.lastIndexOf('className="', i)
  return CREATE.slice(start, CREATE.indexOf('"', start + 11))
}

describe('the column stops being phone-width on a desktop', () => {
  it('caps wider on large screens, and still caps', () => {
    const col = classesAround('relative mx-auto w-full max-w-2xl text-center')
    expect(col).toContain('lg:max-w-4xl')
    // ⚖️ A CAP, NOT A FILL. A line of text 1400px wide is unreadable, so this
    // must never become `w-full` with no maximum.
    expect(col).not.toMatch(/lg:max-w-none|lg:max-w-full/)
  })
})

describe('the doors are a chooser, so they stack on a phone', () => {
  it('one column on a phone, two from sm', () => {
    // ⚠️ THIS IS THE PART THE REPORT GOT BACKWARDS. `grid-cols-2` with no
    // breakpoint meant two columns on a 375px phone — two cramped cards, not
    // four stacked ones.
    const doors = classesAround('grid max-w-md grid-cols-1')
    expect(doors).toContain('grid-cols-1')
    expect(doors).toContain('sm:grid-cols-2')
  })

  it('and they get room on desktop without becoming the widest thing', () => {
    const doors = classesAround('grid max-w-md grid-cols-1')
    expect(doors).toContain('sm:max-w-xl')
    expect(doors).toContain('lg:max-w-2xl')
  })
})

describe('the two things sized oppositely are no longer sized the same', () => {
  it('the input grows on desktop', () => {
    const input = classesAround('glass gradient-border mx-auto mt-5 max-w-md rounded-2xl')
    expect(input).toContain('lg:max-w-2xl')
  })

  it('the doors and the input no longer share one width at every size', () => {
    // ⚠️⚠️ THE LOAD-BEARING ASSERTION, and the whole complaint in one line. Both
    // were `max-w-md` with no breakpoint. They may share the phone width — a
    // phone has one column and everything is that column — but they must not
    // share it all the way up.
    const doors = classesAround('grid max-w-md grid-cols-1')
    const input = classesAround('glass gradient-border mx-auto mt-5 max-w-md rounded-2xl')
    const widths = (c: string) => c.split(/\s+/).filter((t) => /(^|:)max-w-/.test(t)).sort().join(' ')
    expect(widths(doors)).not.toBe(widths(input))
  })
})
