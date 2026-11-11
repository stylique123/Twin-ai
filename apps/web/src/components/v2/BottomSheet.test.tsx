// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { Sheet } from './BottomSheet'

afterEach(cleanup)

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} title="T" onClose={() => {}}>body</Sheet>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a labelled modal dialog with description and footer', () => {
    render(
      <Sheet open title="Discard this take?" description="You can't undo this." onClose={() => {}} footer={<button>Continue</button>}>
        body
      </Sheet>,
    )
    const dlg = screen.getByRole('dialog', { name: 'Discard this take?' })
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('closes on Escape and on the close button, and locks page scroll while open', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
