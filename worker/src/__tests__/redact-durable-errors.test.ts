// What may be written into a row a client can read.
//
// sanitizeError.ts states the rule for durable state and editorV2 honours it.
// The worker's main loop — which settles EVERY OTHER job type — did not: it
// wrote `err.message` straight into jobs.error and ops_events.detail, and
// `jobs` is owner-readable (0002).
//
// So these tests are built from the messages that ACTUALLY reach that loop,
// quoted from the code that throws them, rather than from invented strings. A
// redactor tested only against samples someone imagined is a redactor tested
// against the wrong distribution — which is the same fixture mistake that hid
// four pipeline defects in this codebase.
import { describe, it, expect } from 'vitest'
import { redact } from '../sanitizeError.js'

describe('the messages this worker really throws', () => {
  it('strips a signed CDN URL out of a yt-dlp failure', () => {
    // media.ts: reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))
    const real = 'yt-dlp exited 1: ERROR: unable to download video data: '
      + 'https://v16-webapp.tiktok.com/video/tos/useast2a/xy/?a=1988&ch=0&signature=9f2c8d1e4b7a&x-expires=1754060000'
    const safe = redact(real)
    expect(safe).not.toContain('signature=')
    expect(safe).not.toContain('tiktok.com')
    expect(safe).toContain('[url]')
    // The failure is still legible — redaction that destroys the diagnosis
    // just moves the problem.
    expect(safe).toContain('yt-dlp exited 1')
  })

  it('strips local temp paths out of an ffprobe failure', () => {
    // validateSource.ts: `not decodable media: ${String(e).slice(0, 200)}`
    const real = 'not decodable media: Error: ffprobe exited 1: '
      + '/var/tmp/twinai/job-8f21/source-bytes/take.webm: Invalid data found when processing input'
    const safe = redact(real)
    expect(safe).not.toContain('/var/tmp/twinai')
    expect(safe).toContain('[path]')
    expect(safe).toContain('Invalid data found')
  })

  it('strips an authorization header echoed by a failing fetch', () => {
    const real = 'apify start failed: 401 {"error":"unauthorized"} apikey=apify_api_9Xk2LmQ8vRtY4uZ1'
    const safe = redact(real)
    expect(safe).not.toContain('apify_api_9Xk2LmQ8vRtY4uZ1')
    expect(safe).toContain('[secret]')
  })

  it('strips a service-role JWT', () => {
    const real = 'db insert failed: JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
      + 'eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzU0MDAwMDAwfQ.4Qk1vZ8mNpX2rLtY'
    const safe = redact(real)
    expect(safe).not.toContain('eyJyb2xlIjoic2VydmljZV9yb2xl')
    expect(safe).toContain('[secret]')
  })

  it('strips a content digest, which identifies a creator\'s exact file', () => {
    const real = 'source mismatch: expected a3f5c9d2e7b14086f2c5d8a1b4e70369c8d5f2a7b1e40936c8d5f2a7b1e40936'
    expect(redact(real)).toContain('[hex]')
  })

  it('bounds length, so one enormous stderr cannot flood the table', () => {
    expect(redact('x'.repeat(5000)).length).toBeLessThanOrEqual(300)
  })

  it('CONTROL: an ordinary message survives intact', () => {
    // A redactor that mangles everything would pass every test above while
    // making the durable record useless.
    const plain = 'director call previously failed - not retrying'
    expect(redact(plain)).toBe(plain)
  })

  it('CONTROL: the raw text really did contain what we claim to remove', () => {
    // Otherwise "the secret is gone" could be true because it was never there.
    const real = 'yt-dlp exited 1: https://cdn.example/v?signature=9f2c8d1e4b7a'
    expect(real).toContain('signature=9f2c8d1e4b7a')
    expect(redact(real)).not.toContain('9f2c8d1e4b7a')
  })
})
