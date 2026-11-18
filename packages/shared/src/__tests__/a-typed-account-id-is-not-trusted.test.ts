// Security audit #15: the Outstand callback's account_id comes from the URL, so it
// must be refused when another Twin user already has that account linked.
import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const SOCIAL = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'functions', 'social', 'index.ts'), 'utf8')

it('checks who already holds a URL-supplied account id before saving it', () => {
  const branch = SOCIAL.slice(SOCIAL.indexOf("const accountId = q.get('account_id')"), SOCIAL.indexOf('acc = { id: accountId'))
  expect(branch).toMatch(/\.eq\('external_account_id', accountId\)\.neq\('owner_id', nonce\.owner_id\)/)
  expect(branch).toContain("back('connect_error=taken')")
})
