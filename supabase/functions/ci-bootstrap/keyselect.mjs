// Pure, runtime-agnostic (Deno + Node) selection of the staging service secret
// key from the Edge-Function-injected SUPABASE_SECRET_KEYS dictionary (the new
// sb_secret_... keys). Returns { key?, source } — `source` names ONLY the
// selection outcome / key NAME, never any key bytes, so callers can log it
// safely. No legacy service_role fallback: on this rotated project the legacy
// HS256 JWT is rejected by GoTrue, so a missing/invalid new-format secret must
// FAIL CLOSED rather than silently hand out an unusable credential.
//
// Robust to two documented shapes of SUPABASE_SECRET_KEYS:
//   * an object map:  { "default": "sb_secret_...", "other": "sb_secret_..." }
//   * an array:       [ { "name": "default", "api_key": "sb_secret_..." }, ... ]
// and to plain-string values. Selection is DETERMINISTIC: prefer the key named
// "default"; else the SOLE valid sb_secret_ value; else fail closed (missing /
// malformed_json / no_valid_secret / ambiguous_multiple_secrets).
export function selectSecretKey(rawJson) {
  if (!rawJson) return { source: 'missing' }
  let parsed
  try { parsed = JSON.parse(rawJson) } catch { return { source: 'malformed_json' } }

  const candidates = []
  const pushObj = (name, value) => {
    if (typeof value === 'string') {
      candidates.push({ name: String(name ?? ''), value })
    } else if (value && typeof value === 'object') {
      const v = value.api_key ?? value.secret ?? value.value ?? value.key
      if (typeof v === 'string') candidates.push({ name: String(name ?? value.name ?? value.id ?? ''), value: v })
    }
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string') candidates.push({ name: '', value: item })
      else pushObj(item?.name ?? item?.id, item)
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [name, value] of Object.entries(parsed)) pushObj(name, value)
  }

  const valid = candidates.filter((c) => typeof c.value === 'string' && c.value.startsWith('sb_secret_'))
  if (valid.length === 0) return { source: 'no_valid_secret' }
  const byDefault = valid.find((c) => c.name === 'default')
  if (byDefault) return { key: byDefault.value, source: 'secret_key:default' }
  if (valid.length === 1) return { key: valid[0].value, source: `secret_key:${valid[0].name || 'sole'}` }
  return { source: 'ambiguous_multiple_secrets' }
}
