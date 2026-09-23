// ⚠️ OWNER REPORT: onboarding failed partway and there was no way to recover.
// Every non-handle step offers "Start over"; the confirm error offers "Try again";
// and a voice row left by a partial run never blocks re-entry.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const ONB = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')
const START_DNA = readFileSync(join(repo, 'supabase', 'functions', 'start-dna', 'index.ts'), 'utf8')

describe('onboarding can always be recovered', () => {
  const body = ONB.slice(ONB.indexOf('const startOver = useCallback('), ONB.indexOf('const startOver = useCallback(') + 400)

  it('start over clears both drafts and returns to the handle step', () => {
    expect(body).toMatch(/safeClearDraft\(userId\)/)
    expect(body).toMatch(/clearStoryDraft\(\)/)
    expect(body).toMatch(/setDraft\(null\)/)
    expect(body).toMatch(/setMode\('handle'\)/)
  })

  it('does not delete the account or voice record', () => {
    expect(body).not.toMatch(/\.delete\(|deleteVoice|signOut/)
  })

  it('is offered on every step after the handle, behind a confirm', () => {
    expect(ONB).toMatch(/mode !== 'handle' && \(/)
    expect(ONB).toContain('Stuck? Start over')
    expect(ONB).toContain('Yes, start over')
  })

  it('a partial voice record does not block re-entry: the handle step repoints the one slot', () => {
    expect(ONB).toMatch(/startDna\(handle\.trim\(\), platform, false, true\)/)
    expect(START_DNA).toMatch(/const isReplace = body\.replace === true/)
  })

  it('a failed confirm save offers a retry of the same idempotent save', () => {
    expect(ONB).toMatch(/onClick=\{\(\) => void confirm\(\)\}[^>]*>\s*Try again/)
  })
})
