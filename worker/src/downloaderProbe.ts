// THE CONTAINER IS THE TRUTH. `requirements.txt` IS ASPIRATIONAL LITERATURE.
//
// ⚠️ THE FAILURE THIS EXISTS FOR. `curl-cffi` is pinned in requirements.txt with
// a long comment explaining that TikTok requires impersonation and that this
// image once shipped without it. The dependency is declared. And every TikTok
// download in a forced re-run of 40 videos still printed:
//
//     WARNING: [TikTok] The extractor is attempting impersonation, but no
//     impersonate target is available.
//
// A declared dependency is not an installed one, an installed one is not an
// importable one, and an importable one is not necessarily reachable by the
// binary that needs it. Only the running container can answer that, and until
// now nothing asked it.
//
// ⚖️ AND `capabilities.ts` STRUCTURALLY CANNOT SEE THIS. It reads environment
// variables — it answers "was this configured", which is a different question
// from "does this work here". Both are worth asking at boot; neither substitutes
// for the other. This file is the second question.
//
// ⚠️ IT REPORTS, IT DOES NOT REFUSE. A worker with no impersonation still
// transcribes, renders, reads Instagram and YouTube. Crashing on boot would turn
// a degraded TikTok path into a total outage — the same reasoning
// `capabilities.ts` already makes for a missing API key.

import { spawn } from 'node:child_process'

export interface DownloaderProbe {
  /** Did `yt-dlp` run at all? */
  ytDlp: boolean
  /** How many impersonation targets the binary can actually offer. ZERO IS THE
   *  FINDING: it is what "no impersonate target is available" means, said before
   *  a creator trips over it rather than after. */
  impersonateTargets: number
  /** True when TikTok can realistically be read. */
  tiktokReadable: boolean
  /** One line, safe to log. */
  detail: string
}

function exec(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')) }, timeoutMs)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', () => { clearTimeout(timer); resolve(out) })
  })
}

/**
 * Ask the binary what it can do, rather than asking the repository what we
 * intended it to do.
 *
 * ⚖️ `--list-impersonate-targets` IS THE RIGHT QUESTION because it is the same
 * capability the TikTok extractor consults. A check that imported `curl_cffi`
 * from Python would prove the package exists and NOT that yt-dlp can reach it —
 * which is precisely the gap that let a declared dependency look installed.
 */
export async function probeDownloader(): Promise<DownloaderProbe> {
  let raw: string
  try {
    raw = await exec('yt-dlp', ['--list-impersonate-targets'], 20_000)
  } catch (e) {
    return {
      ytDlp: false, impersonateTargets: 0, tiktokReadable: false,
      detail: `yt-dlp could not be run: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
  // Each target is a row in a table; the header and any separator rows are not
  // targets. Counting rows that name a client is enough to tell "some" from
  // "none", and none is the only value that changes what we do.
  const targets = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(chrome|edge|safari|firefox)/i.test(l))
  const n = targets.length
  return {
    ytDlp: true,
    impersonateTargets: n,
    tiktokReadable: n > 0,
    detail: n > 0
      ? `${n} impersonation targets available`
      : 'NO impersonation targets — TikTok reads will fail. curl-cffi is declared in requirements.txt but is not effective in this image.',
  }
}
