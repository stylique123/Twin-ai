// @vitest-environment jsdom
//
// GAP #14 — THREE DOORS, ONE SET OF QUESTIONS.
//
// ⚠️ Claiming a product from a suggestion asked name/type/relationship/use/
// filming and nothing else: no options & prices, no story questions, no link,
// no photos. So a claimed product was born thinner than an added one. These
// tests pin that the claim door asks the same shared fields as "Add a product"
// and sends them in the same `ProductClaim` payload `claim()` saves.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PRODUCT_STORY_QUESTIONS, type ProductClaim } from '@twinai/shared'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } } }),
}))

import { ClaimForm } from './ProductLibrary'

afterEach(() => cleanup())

describe('claiming from a suggestion asks what the add form asks', () => {
  it('renders options & prices rows, the three story questions, link, kind, relationship, use and photos', () => {
    render(<ClaimForm busy={false} onCancel={() => {}} onClaim={() => {}} />)
    expect(screen.getByText('Options & prices')).toBeTruthy()
    expect(screen.getByLabelText('Option 1')).toBeTruthy()
    expect(screen.getByLabelText('Price 1')).toBeTruthy()
    for (const q of PRODUCT_STORY_QUESTIONS) expect(screen.getByText(q.label)).toBeTruthy()
    expect(screen.getByLabelText('Paste a link to it')).toBeTruthy()
    expect(screen.getByText('What is it?')).toBeTruthy()
    expect(screen.getByText('What is your relationship to it?')).toBeTruthy()
    expect(screen.getByText('Photos of it (optional)')).toBeTruthy()
  })

  it('still refuses a one-tap claim: the button is disabled until the attestation is answered', () => {
    render(<ClaimForm busy={false} onCancel={() => {}} onClaim={() => {}} />)
    const btn = screen.getByText('Add to my products').closest('button')!
    expect(btn.disabled).toBe(true)
  })

  it('sends offer, stories, link, kind, relationship, personal use and filming in the claim', () => {
    const onClaim = vi.fn<(a: ProductClaim) => void>()
    render(<ClaimForm busy={false} onCancel={() => {}} onClaim={onClaim} />)
    fireEvent.change(screen.getByLabelText('What do you call it?'), { target: { value: 'Peak Tripod' } })
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Small' } })
    fireEvent.change(screen.getByLabelText('Price 1'), { target: { value: '$28' } })
    fireEvent.blur(screen.getByLabelText('Price 1'))
    const story = screen.getByLabelText(new RegExp(PRODUCT_STORY_QUESTIONS[0]!.label.replace('?', '\\?')))
    fireEvent.change(story, { target: { value: 'The first batch cracked' } })
    fireEvent.blur(story)
    fireEvent.change(screen.getByLabelText('Paste a link to it'), { target: { value: 'peak.example/tripod' } })
    fireEvent.click(screen.getByText(/^A physical product/))
    fireEvent.click(screen.getByText('I make or sell it'))
    fireEvent.click(screen.getByText('Yes, I use it'))
    fireEvent.click(screen.getByText('Usually'))
    const btn = screen.getByText('Add to my products').closest('button')!
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(onClaim).toHaveBeenCalledTimes(1)
    const a = onClaim.mock.calls[0]![0]
    expect(a.name).toBe('Peak Tripod')
    expect(a.offer).toContain('$28')
    expect(a.offer).toContain('Small')
    expect(a.stories?.almostWentWrong).toBe('The first batch cracked')
    expect(a.productUrl).toBe('https://peak.example/tripod')
    expect(a.type).toBe('PHYSICAL_PRODUCT')
    expect(a.relationship).toBe('OWN_PRODUCT')
    expect(a.personalUse).toBe('CONFIRMED')
    expect(a.showability).toBe('ALWAYS')
    expect(a.flags).toEqual({ canFilmObjects: true })
    expect(a.imagePaths).toEqual([])
  })

  it('is saved by the same claim() as the add form', () => {
    const src = readFileSync(resolve(__dirname, 'ProductLibrary.tsx'), 'utf8')
    expect(src).toMatch(/<ClaimForm[\s\S]*?onClaim=\{\(a\) => void claim\(s, a\)\}/)
    expect(src).toMatch(/<StartFromLink[\s\S]*?onClaim=\{\(a\) => void claim\(null, a\)\}/)
  })
})
