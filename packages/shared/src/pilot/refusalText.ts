/**
 * The server's own words, even when it refused.
 *
 * ⚠️ THIS IS THE BUG THAT HID A REAL REFUSAL. supabase-js does NOT read the
 * body of a non-2xx function response: it hands back a FunctionsHttpError whose
 * message is the fixed string "Edge Function returned a non-2xx status code",
 * and sets `data` to null — so the `data.error` branch below can only ever run
 * on a 200. A live pilot refused a second run with a paragraph naming the run,
 * its status, and what to do about it, and the operator saw the fixed string.
 *
 * The body is on `error.context`, which is the Response. Read it, and fall back
 * to the generic message only when there is genuinely nothing else to say.
 */
export const refusalText = async (error: unknown, fallback: string): Promise<string> => {
  const res = (error as { context?: unknown })?.context
  if (res instanceof Response) {
    try {
      // ⚠️ CLONED, because a Response body can be read exactly once and this
      // must not be the read that spends it.
      const body = await res.clone().json() as { error?: unknown; packet_error?: unknown }
      const said = body?.error ?? body?.packet_error
      if (typeof said === 'string' && said.trim()) return said
    } catch {
      try {
        const text = (await res.clone().text()).trim()
        if (text) return text
      } catch { /* the body is genuinely unreadable; fall through */ }
    }
  }
  const msg = (error as { message?: unknown })?.message
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}
