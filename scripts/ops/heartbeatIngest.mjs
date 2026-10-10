/**
 * ⚠️ 2026-10-10: THE REFERENCE VARIANT NEVER READ ITS REFERENCE. It posted a
 * bare `reference_url`, and the writer's hard stop (an unread reference is a
 * 409 REFERENCE_UNREAD, never a cheaper script) refused every run from 2 Oct.
 * The app always ingests first and passes the transcript; so does this now.
 * Same edge function, same job table, same poll the client uses.
 */
export async function ingestForHeartbeat({ url, supabaseUrl, anonKey, token, fetchImpl = fetch, waitMs = 180_000, pollMs = 5_000 }) {
  const headers = { authorization: `Bearer ${token}`, apikey: anonKey, 'content-type': 'application/json' }
  const res = await fetchImpl(`${supabaseUrl}/functions/v1/ingest-reference`, { method: 'POST', headers, body: JSON.stringify({ url }) })
  if (!res.ok) throw new Error(`ingest-reference ${res.status}`)
  const d = await res.json()
  if (d.transcript_id) return d.transcript_id
  if (!d.job_id) throw new Error('ingest-reference returned no job')
  const until = Date.now() + waitMs
  while (Date.now() < until) {
    const r = await fetchImpl(`${supabaseUrl}/rest/v1/jobs?id=eq.${d.job_id}&select=status,result,error`, { headers })
    const [job] = r.ok ? await r.json() : []
    if (job?.status === 'done' && job.result?.transcript_id) return job.result.transcript_id
    if (job?.status === 'failed' || job?.status === 'error') throw new Error(`ingest job failed: ${String(job.error ?? '').slice(0, 120)}`)
    await new Promise((ok) => setTimeout(ok, pollMs))
  }
  throw new Error('ingest timed out')
}
