// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import CreatorTypePicker, { creatorTypePickerOn } from './CreatorTypePicker'

afterEach(cleanup)

describe('CreatorTypePicker (W12.2, flag default off)', () => {
  it('flag is off unless VITE_CREATOR_TYPE_RULES is exactly on', () => {
    expect(creatorTypePickerOn({})).toBe(false)
    expect(creatorTypePickerOn({ VITE_CREATOR_TYPE_RULES: 'true' })).toBe(false)
    expect(creatorTypePickerOn({ VITE_CREATOR_TYPE_RULES: 'on' })).toBe(true)
  })
  it('renders nothing with the flag off', () => {
    render(<CreatorTypePicker value="coach" onChange={() => {}} enabled={false} />)
    expect(screen.queryByTestId('creator-type-picker')).toBeNull()
  })
  it('shows a legacy stored value as its new type, and picks or clears a type', () => {
    const onChange = vi.fn()
    render(<CreatorTypePicker value="coach_consultant" onChange={onChange} enabled />)
    expect(screen.getByRole('button', { name: 'Coach or consultant' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Local business' }))
    expect(onChange).toHaveBeenLastCalledWith('local_business')
    fireEvent.click(screen.getByRole('button', { name: 'Coach or consultant' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
