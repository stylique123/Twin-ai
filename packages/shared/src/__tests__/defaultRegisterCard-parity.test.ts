// ⚠️ INLINED BECAUSE EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`. Same
// discipline as style-compiler-parity.test.ts and signaturePhrases-parity.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderDefaultRegisterCard } from '../defaultRegisterCard'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline(): () => string {
  const start = SRC.indexOf('function renderDefaultRegisterCardInline')
  const end = SRC.indexOf('\n}', start) + 2
  expect(start).toBeGreaterThan(-1)
  const body = SRC.slice(start, end).replace(/\(\): string \{/, '() {')
  // eslint-disable-next-line no-new-func
  return new Function(`${body}
    return renderDefaultRegisterCardInline`)()
}

describe('the inlined copy matches the shared original byte for byte', () => {
  it('produces the identical card', () => {
    expect(loadInline()()).toBe(renderDefaultRegisterCard())
  })
})
