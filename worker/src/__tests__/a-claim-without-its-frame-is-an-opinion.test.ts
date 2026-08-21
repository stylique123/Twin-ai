// THE EVIDENCE MUST OUTLIVE THE CALL THAT USED IT.
//
// ⚠️ THE DEFECT THESE PIN. runVisualPass sampled frames into a temp directory,
// sent them to the model, and deleted the directory. The profile cited `frame
// 2` and frame 2 existed nowhere, so no human could ever check a visual claim —
// the #58 labelling pass had nothing to show beside a claim.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const sample = (n: number) => ({
  frames: Array.from({ length: n }, () => ({ mimeType: 'image/jpeg', data: 'AAAA' })),
  framesSampled: n,
  atSeconds: Array.from({ length: n }, (_, i) => i * 1.5),
  scheduleBasis: 'content_beats' as const,
})

describe('a frame is addressed by the number the model was told to cite', () => {
  it('numbers frames from ONE, because a claim says frame 1 for the first frame', async () => {
    const { frameObjectPath } = await import('../referenceFrames.js')
    const p = frameObjectPath('https://x/1', 1, 'image/jpeg')
    // ⚠️ ZERO-BASING WOULD SILENTLY RE-POINT EVERY CITATION ALREADY WRITTEN.
    expect(p.endsWith('/01.jpg')).toBe(true)
    expect(frameObjectPath('https://x/1', 2, 'image/jpeg').endsWith('/02.jpg')).toBe(true)
  })

  it('does not let a url invent directories in the bucket', async () => {
    const { frameObjectPath } = await import('../referenceFrames.js')
    // A raw url carries / and ? and & — a storage key made from one would
    // create folders and truncate names.
    const p = frameObjectPath('https://www.tiktok.com/@a/video/7?is_from=1&x=2', 3, 'image/jpeg')
    expect(p.split('/')).toHaveLength(2)
    expect(p).not.toContain('?')
    expect(p).toMatch(/^[0-9a-f]{64}\/03\.jpg$/)
  })

  it('is stable, so a re-sample lands on the same object and conflicts with itself', async () => {
    const { frameObjectPath } = await import('../referenceFrames.js')
    expect(frameObjectPath('https://x/1', 1, 'image/jpeg'))
      .toBe(frameObjectPath('https://x/1', 1, 'image/jpeg'))
    expect(frameObjectPath('https://x/1', 1, 'image/jpeg'))
      .not.toBe(frameObjectPath('https://x/2', 1, 'image/jpeg'))
  })

  it('digests the BYTES, not the base64 text', async () => {
    const { frameDigest } = await import('../referenceFrames.js')
    const { createHash } = await import('node:crypto')
    const want = createHash('sha256').update(Buffer.from('AAAA', 'base64')).digest('hex')
    // ⚖️ A frame silently replaced by a re-run is otherwise indistinguishable
    // from the original, and the claim it supported would look unchanged.
    expect(frameDigest('AAAA')).toBe(want)
    expect(frameDigest('AAAA')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('an empty sample is refused before anything is uploaded', () => {
  it('reports NO_FRAMES_SAMPLED rather than storing nothing quietly', async () => {
    const { persistFrames } = await import('../referenceFrames.js')
    const r = await persistFrames('https://x/1', sample(0))
    expect(r.stored).toBe(0)
    // ⚠️ `failure` DISTINGUISHES "never attempted" FROM "attempted and empty".
    // Silence here would make a reference with no frames look identical to one
    // whose upload failed.
    expect(r.failure).toBe('NO_FRAMES_SAMPLED')
  })
})

describe('the pass keeps the frames BEFORE it shows them', () => {
  it('persists ahead of the model call, and refuses the call if it could not', async () => {
    // ⚠️ ASSERTED ON THE SOURCE, because the ordering IS the guarantee. Uploading
    // after the call would spend the call and only then discover the evidence
    // could not be kept — leaving the unverifiable claims this exists to prevent.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../visualPass.ts', import.meta.url), 'utf8')
    const persisted = src.indexOf('persistFrames(')
    const call = src.indexOf('geminiJson(')
    expect(persisted).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(-1)
    expect(persisted).toBeLessThan(call)
    // and a failure to keep them stops the pass rather than proceeding
    expect(src).toContain("NOT_RUN('FRAMES_NOT_PERSISTED'")
  })

  it('still throws for nothing — a frames failure must not lose a good transcript', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../visualPass.ts', import.meta.url), 'utf8')
    // The 0143 rule one layer up: every failure here is a ROW, not an exception.
    const persistLine = src.slice(src.indexOf('const kept ='), src.indexOf('let raw: unknown'))
    expect(persistLine).toContain('return NOT_RUN(')
    expect(persistLine).not.toContain('throw ')
  })

  it('no longer deletes the frames along with the video', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../visualPass.ts', import.meta.url), 'utf8')
    // The temp dir still goes — it holds the downloaded VIDEO. The frames are
    // in the bucket by then, which is the whole change.
    expect(src).toContain('Analyze-and-discard the VIDEO')
  })
})

describe('the migration says what the table must refuse', () => {
  it('0160 makes two rows claiming to be frame 2 impossible', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(new URL(
      '../../../supabase/migrations/0160_a_claim_without_its_frame_is_an_opinion.sql',
      import.meta.url), 'utf8')
    expect(sql).toContain('reference_frames_one_per_index')
    expect(sql).toContain('unique (url, frame_index)')
  })

  it('grants no client role and keeps the bucket private', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(new URL(
      '../../../supabase/migrations/0160_a_claim_without_its_frame_is_an_opinion.sql',
      import.meta.url), 'utf8')
    // ⚠️ THE CORPUS IS OTHER CREATORS' VIDEOS. A read grant, or a public bucket,
    // publishes it to every signed-in account in exchange for no feature.
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('revoke all on public.reference_frames from anon, authenticated')
    expect(sql).toMatch(/reference-frames'\s*,\s*'reference-frames'\s*,\s*false/)
  })
})
