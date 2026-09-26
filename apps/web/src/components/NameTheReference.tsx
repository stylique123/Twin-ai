// NAME THE REFERENCE BACK — before asking "how much should Twin keep?", say
// what Twin actually read, so she can see it understood the video.
//
// ⚖️ FROM THE TRANSCRIPT ONLY: its length and its opening words. No model
// summary, so nothing here can be invented. While the read runs she sees a
// quiet line; if it never finishes, nothing is shown and the questions work
// exactly as before.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getJob } from '../lib/api'

const POLL_MS = 3000
const GIVE_UP_MS = 150_000

/** "48-second", from seconds; null when unknown. */
export function lengthLabel(sec: unknown): string | null {
  const n = typeof sec === 'number' ? sec : Number(sec)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 90) return `${Math.round(n)}-second`
  return `${Math.round(n / 60)}-minute`
}

/** The first spoken sentence, trimmed to something readable. */
export function openingWords(text: unknown, max = 140): string | null {
  if (typeof text !== 'string') return null
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 8) return null
  const first = t.match(/^.{8,}?[.!?](\s|$)/)?.[0]?.trim() ?? t
  return first.length > max ? `${first.slice(0, max).replace(/\s+\S*$/, '')}…` : first
}

export function NameTheReference({ early }: {
  early: Promise<{ jobId: string; transcriptId?: string }> | null
}) {
  const [line, setLine] = useState<string | null>(null)
  const [reading, setReading] = useState(!!early)

  useEffect(() => {
    if (!early) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    const show = async (transcriptId: string) => {
      const { data } = await supabase.from('transcripts').select('duration_sec, text').eq('id', transcriptId).maybeSingle()
      if (!alive) return
      setReading(false)
      const len = lengthLabel(data?.duration_sec)
      const open = openingWords(data?.text)
      if (!open) return
      setLine(`${len ? `This is a ${len} video` : 'This video'} that opens: “${open}”`)
    }
    const poll = (jobId: string) => {
      void getJob(jobId).then((job) => {
        if (!alive) return
        const tid = (job?.result as { transcript_id?: string } | null | undefined)?.transcript_id
        if (job?.status === 'done' && tid) { void show(tid); return }
        if (job?.status === 'failed' || Date.now() - started > GIVE_UP_MS) { setReading(false); return }
        timer = setTimeout(() => poll(jobId), POLL_MS)
      }, () => { if (alive) setReading(false) })
    }
    early.then((r) => {
      if (!alive) return
      if (r.transcriptId) void show(r.transcriptId)
      else poll(r.jobId)
    }, () => { if (alive) setReading(false) })
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [early])

  if (line) {
    return (
      <p className="text-[13px] leading-relaxed text-sand" data-testid="name-the-reference">
        {line}
      </p>
    )
  }
  return reading ? <p className="text-[12px] text-stone">Twin is watching the video you pasted…</p> : null
}
