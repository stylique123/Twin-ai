// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BlurText, OfferEditor, StoryFields } from './ProductFields'

const PAGE = readFileSync(resolve(__dirname, '../pages/ProductLibrary.tsx'), 'utf8')

describe('#13 a box being typed in survives another field saving', () => {
  it('keeps the draft when the stored value changes while focused', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<BlurText aria-label="one line" value={null} onCommit={onCommit} />)
    const box = screen.getByLabelText('one line') as HTMLInputElement
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Bandanas for big dogs' } })
    // Another field's save lands and the record re-renders with the old (empty) summary.
    rerender(<BlurText aria-label="one line" value={null} onCommit={onCommit} />)
    expect(box.value).toBe('Bandanas for big dogs')
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith('Bandanas for big dogs')
  })

  it('adopts the stored value when not focused', () => {
    const { rerender } = render(<BlurText aria-label="n" value="a" onCommit={() => {}} />)
    rerender(<BlurText aria-label="n" value="b" onCommit={() => {}} />)
    expect((screen.getByLabelText('n') as HTMLInputElement).value).toBe('b')
  })

  it('the panel no longer keys its text boxes on updated_at', () => {
    expect(PAGE).not.toMatch(/key=\{`(name|summary|offer)-\$\{e\.id\}-\$\{e\.updated/)
  })
})

describe('#16 several unnamed prices are called out', () => {
  it('says how many have no option name', () => {
    render(<OfferEditor value={null} found={['$28 (one of 3 prices on the page — x)', '$13', '$35']} onSave={() => {}} />)
    expect(screen.getByText(/3 have no option name — probably sizes or styles/)).toBeTruthy()
  })
})

describe('#21 the three story questions', () => {
  it('renders all three and commits by key', () => {
    const onCommit = vi.fn()
    render(<StoryFields idPrefix="t" value={null} onCommit={onCommit} />)
    const box = screen.getByLabelText(/What almost went wrong with this one\?/)
    fireEvent.focus(box); fireEvent.change(box, { target: { value: 'The dye ran' } }); fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith('almostWentWrong', 'The dye ran')
    expect(screen.getByLabelText(/What do customers say back to you about it\?/)).toBeTruthy()
    expect(screen.getByLabelText(/How is it actually made or delivered\?/)).toBeTruthy()
  })
})

describe('#14 the add form and the panel share the fields', () => {
  const add = PAGE.slice(PAGE.indexOf('function StartFromLink('))
  it('both render OfferEditor and StoryFields', () => {
    expect(add).toMatch(/<OfferEditor /)
    expect(add).toMatch(/<StoryFields /)
    expect(PAGE.slice(0, PAGE.indexOf('function StartFromLink('))).toMatch(/<StoryFields /)
  })
})

describe('#11 / #19 photos', () => {
  it('replace and remove are always visible controls, not hover-only', () => {
    expect(PAGE).toMatch(/replacePhotoIn\(e, path,/)
    expect(PAGE).not.toMatch(/opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100/)
  })
  it('photos added with a new product are stored on it', () => {
    const claim = PAGE.slice(PAGE.indexOf('async function claim('))
    expect(claim.slice(0, 6000)).toMatch(/sections: addedPhotos\.map/)
  })
})

describe('#12 a bare domain is accepted everywhere', () => {
  it('no url-typed input remains in the add form', () => {
    expect(PAGE.slice(PAGE.indexOf('function StartFromLink('))).not.toMatch(/type="url"/)
  })
  it('the brand website fallback is normalised to https', () => {
    expect(PAGE).toMatch(/normalizeLink\(\(brands \?\? \[\]\)\.find\(\(b\) => b\.id === targetBrand\)\?\.website/)
  })
})
