// Security audit #8: an untrusted page is read only up to a cap, and claim_job
// never hands out a stale job that has used all its attempts.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readTextCapped } from '../safeFetch.js'

it('stops reading at the cap and cancels the download', async () => {
  let cancelled = false
  let sent = 0
  const chunk = new TextEncoder().encode('a'.repeat(1_000_000))
  const body = new ReadableStream<Uint8Array>({
    pull(c) { sent += 1; if (sent > 50) c.close(); else c.enqueue(chunk) }, // up to 50 MB
    cancel() { cancelled = true },
  })
  const text = await readTextCapped(new Response(body), 5_000_000)
  expect(text.length).toBe(5_000_000)
  expect(cancelled).toBe(true)
  expect(sent).toBeLessThan(10)
})

it('reads a normal page whole', async () => {
  expect(await readTextCapped(new Response('<html>ok</html>'))).toBe('<html>ok</html>')
})

it('claim_job re-picks a stale job only while it has attempts left', () => {
  const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
  const body = sql.slice(sql.lastIndexOf('create or replace function public.claim_job('))
  expect(body).toMatch(/status = 'running' and locked_at < now\(\) - make_interval\(secs => p_visibility_secs\) and attempts < max_attempts/)
})
