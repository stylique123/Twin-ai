// A CREATOR COULD SEND PHOTOS AND NEVER SEE THEM AGAIN.
//
// ⚠️ PICTURES COULD BE ATTACHED ONLY WHILE ADDING A PRODUCT. Afterwards the page
// showed the WORDS extraction got out of them and never the pictures, so "did my
// photo arrive" had no answer on screen, and changing one meant deleting the
// product — losing its facts, its confirmations and its history to swap an
// image.
//
// ⚖️ AND ADDING ONE RE-READS. New pictures are new evidence; storing them without
// re-extracting would leave the writer working from the old set while the page
// showed the new one, which is worse than either alone.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PAGE = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx',
), 'utf8')

describe('photos can be added to a product that already exists', () => {
  it('every product offers a slot while it has room', () => {
    expect(PAGE).toMatch(/photoPathsOf\(e\)\.length < PHOTO_SLOTS/)
    expect(PAGE).toMatch(/addPhotosTo\(e, ev\.target\.files\)/)
  })

  it('and re-reads everything, rather than storing the picture and moving on', () => {
    // ⚠️ THE SILENT-DIVERGENCE FAILURE. Uploading without extraction leaves the
    // page showing four photos and the writer knowing about two.
    const fn = PAGE.slice(PAGE.indexOf('async function addPhotosTo'))
    expect(fn.slice(0, fn.indexOf('\n  }'))).toMatch(/requestProductExtraction\(/)
  })

  it('passes the OLD paths with the new ones, so nothing is dropped', () => {
    // ⚖️ EXTRACTION REPLACES THE EVIDENCE SET. Sending only the new images would
    // silently discard the ones the creator sent last week.
    expect(PAGE).toMatch(/\[\.\.\.existing, \.\.\.added\]/)
  })

  it('never offers more slots than the add form does', () => {
    // ⚖️ ONE NUMBER. Two constants is how "you can add four" and "you may add
    // two more" come to disagree.
    expect(PAGE).toMatch(/const PHOTO_SLOTS = 4/)
    expect(PAGE).toMatch(/4 - imagePaths\.length/)
  })
})

describe('only the creator\'s own photographs are shown as theirs', () => {
  it('a captured page is not rendered under "Photos of it"', () => {
    // ⚠️ `evidence.sections` HOLDS BOTH. A screenshot of somebody's store page,
    // shown back to them as their own photograph, is the same provenance lie the
    // whole authority model exists to refuse — one machine's reading wearing a
    // person's authority.
    const fn = PAGE.slice(PAGE.indexOf('function photoPathsOf'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/ev\.form !== 'images'/)
  })

  it('and the order is the creator\'s, not one we computed', () => {
    expect(PAGE).toMatch(/sort\(\(a, b\) => a\.order - b\.order\)/)
  })
})

describe('the two lists are tabs, in words a creator already knows', () => {
  it('says what Twin will do, not what the column is called', () => {
    // ⚖️ THE STANDING UX RULE. `archived_at` is a database column; "In use" and
    // "Not in use" are the only thing the distinction means to a person.
    expect(PAGE).toMatch(/'In use'/)
    expect(PAGE).toMatch(/'Not in use'/)
    expect(PAGE).not.toMatch(/>Archived</)
  })

  it('hides the second tab until there is something in it', () => {
    // ⚠️ AN EMPTY ROOM ASKS THE CREATOR TO WONDER WHAT BELONGS IN IT.
    const tabs = PAGE.slice(PAGE.indexOf("[['live', 'In use']") - 900)
    expect(tabs.slice(0, 900)).toMatch(/archivedAt\)\.length > 0 && \(/)
  })

  it('the live list is filtered by the tab, not merely styled by it', () => {
    expect(PAGE).toMatch(/tab === 'live' \? entities : \[\]/)
  })
})
