import { describe, it, expect } from 'vitest'
import { auditSoftwareClose } from '../softwareClose.js'

describe('auditSoftwareClose', () => {
  it('finds cost, sign-up and time answers in the last line', () => {
    expect(auditSoftwareClose(['Hook.', 'Try it free, no card needed.']).answers).toEqual(['cost'])
    expect(auditSoftwareClose(['Hook.', 'Sign up takes one minute, link in bio.']).answers).toEqual(['signup'])
    expect(auditSoftwareClose(['Hook.', 'You can log your first roast today.']).answers).toEqual(['time'])
  })
  it('flags a close that answers none', () => {
    const a = auditSoftwareClose(['Hook.', 'It changed how I work.'])
    expect(a.ok).toBe(false)
    expect(a.answers).toEqual([])
  })
  it('reads only the last spoken line and skips blanks', () => {
    expect(auditSoftwareClose(['It is free.', 'Go check it out.', '  ', null]).ok).toBe(false)
  })
})
