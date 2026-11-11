// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { RadioGroup } from './RadioGroup'

afterEach(cleanup)

const opts = [
  { value: 'a', title: 'First' },
  { value: 'b', title: 'Second', disabled: true },
  { value: 'c', title: 'Third' },
] as const

describe('RadioGroup', () => {
  it('is a radiogroup with one tab stop on the checked row', () => {
    render(<RadioGroup label="Pick one" options={[...opts]} value="c" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Pick one' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0])
  })

  it('arrow keys move and select, skipping disabled rows', () => {
    const onChange = vi.fn()
    render(<RadioGroup label="Pick" options={[...opts]} value="a" onChange={onChange} />)
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('c')
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('c')
  })

  it('does not select a disabled row on click', () => {
    const onChange = vi.fn()
    render(<RadioGroup label="Pick" options={[...opts]} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('Second'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('First'))
    expect(onChange).toHaveBeenCalledWith('a')
  })
})
