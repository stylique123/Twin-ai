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
  /** ⚠️ WHAT IS ACTUALLY RUNNING, BECAUSE requirements.txt DOES NOT SAY.
   *  Docker keys the pip layer on that file's contents, so a FLOOR like
   *  `yt-dlp>=...` only re-resolves when the file changes — between edits the
   *  image is frozen at whatever was newest on the last edit. On 2026-08-20 the
   *  running worker was on 2026.07.04 while 2026.08.19 had been out for hours,
   *  and finding that out required reading a Docker build log for the word
   *  CACHED. A running worker should be able to say what it is. */
  ytDlpVersion: string | null
  curlCffiVersion: string | null
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
 * What the binary can ACTUALLY use, read off its own table.
 *
 * ⚠️ SPLIT OUT SO IT CAN BE TESTED AGAINST REAL OUTPUT. The bug below was a
 * parsing bug, and a parsing bug behind a `spawn` is only reachable on a box
 * that happens to reproduce it — which is how it survived being written by the
 * same person who wrote the comment explaining the distinction it missed.
 */
export function readTargets(raw: string): { usable: number; listedButUnusable: number } {
  // ⚠️ THE PROBE HAD THIS EXACT BUG, WHICH IS WORTH SAYING PLAINLY. It counted
  // every row naming a client and reported "4 impersonation targets available"
  // on a box where all four read:
  //
  //     Chrome  -  curl_cffi (unavailable)
  //
  // `--list-impersonate-targets` lists what yt-dlp KNOWS ABOUT, and marks what
  // it cannot actually use. So the check written to catch "declared but not
  // effective" was itself fooled by declared-but-not-effective, and would have
  // reported a healthy TikTok path during the very re-run where 38 of 40
  // downloads failed with "no impersonate target is available".
  //
  // ⚖️ AVAILABILITY IS THE WHOLE QUESTION, so `(unavailable)` is what decides it
  // and the client name is only how a row is recognised as a row.
  const rows = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(chrome|edge|safari|firefox|tor)/i.test(l))
  const targets = rows.filter((l) => !/\(unavailable\)/i.test(l))
  const n = targets.length
  const listedButUnusable = rows.length - n
  return { usable: n, listedButUnusable }
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
  // ⚖️ VERSIONS ARE BEST-EFFORT AND NEVER FATAL. They are diagnostics; a probe
  // that failed to boot a worker because it could not read a version string
  // would be worse than the ambiguity it set out to remove.
  const version = async (cmd: string, args: string[]) => {
    try { return (await exec(cmd, args, 10_000)).trim().split('\n')[0] || null } catch { return null }
  }
  const ytDlpVersion = await version('yt-dlp', ['--version'])
  const curlCffiVersion = await version('python3',
    ['-c', 'import curl_cffi;print(curl_cffi.__version__)'])

  let raw: string
  try {
    raw = await exec('yt-dlp', ['--list-impersonate-targets'], 20_000)
  } catch (e) {
    return {
      ytDlp: false, impersonateTargets: 0, tiktokReadable: false,
      ytDlpVersion, curlCffiVersion,
      detail: `yt-dlp could not be run: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
  const { usable: n, listedButUnusable } = readTargets(raw)
  return {
    ytDlp: true,
    impersonateTargets: n,
    ytDlpVersion,
    curlCffiVersion,
    tiktokReadable: n > 0,
    detail: n > 0
      ? `${n} impersonation targets available`
      // ⚠️ THE TWO ZEROS ARE DIFFERENT AND GET DIFFERENT SENTENCES. Nothing
      // listed at all is a yt-dlp too old to impersonate; rows listed and all
      // unusable is curl-cffi missing from the image — which is the case this
      // probe was written for, and the one an operator can actually fix.
      : listedButUnusable > 0
        ? `NO usable impersonation targets — TikTok reads will fail. yt-dlp lists ${listedButUnusable} target(s) but marks every one "(unavailable)": curl-cffi is declared in requirements.txt and is NOT effective in this image.`
        : 'NO impersonation targets — TikTok reads will fail. This yt-dlp lists none at all, so it cannot impersonate regardless of curl-cffi.',
  }
}
