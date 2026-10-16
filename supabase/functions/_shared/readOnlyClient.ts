// A READ-ONLY VIEW OF THE SERVICE CLIENT, FOR SHADOW RE-RUNS (docs/release/shadow-and-flags.md §3).
//
// A shadow re-run goes through the same generate-blueprint handler as the live
// request, so every write in that handler (generations, credits, attempts,
// knowledge spend, analytics, queues, storage) must be a no-op. Rather than
// guard each of them, the handler is given this client: table writes, storage
// writes and any RPC not on the read allowlist resolve to
// `{ data: null, error: null }` without reaching the database. Reads pass through.
// The shadow runner itself writes shadow_runs and the usage ledger with the REAL
// client, outside the handler.

const TABLE_WRITES = new Set(['insert', 'update', 'upsert', 'delete'])
const STORAGE_WRITES = new Set(['upload', 'update', 'remove', 'move', 'copy', 'createSignedUploadUrl', 'uploadToSignedUrl'])

/** RPCs that only read. Everything else (spend/refund credits, rate-limit counters,
 *  lessons_used, record_knowledge_use, ...) is blocked. */
export const READ_RPCS: ReadonlySet<string> = new Set([
  'brain_brief_scoped',
  'brain_trends',
  'creator_track_record',
  'creator_recent_edits',
  'creator_script_feedback',
  'creator_audience_lessons',
])

/** A chainable stand-in: any call or property returns itself; awaiting it gives an empty result. */
export function blockedCall(): unknown {
  const result = { data: null, error: null, count: null, status: 200, statusText: 'shadow_blocked' }
  const fn = function () { return proxy }
  const proxy: unknown = new Proxy(fn, {
    get(_t, k) {
      if (k === 'then') return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      if (k === 'catch') return () => Promise.resolve(result)
      if (k === 'finally') return (f: () => unknown) => Promise.resolve(result).finally(f)
      return proxy
    },
    apply() { return proxy },
  })
  return proxy
}

function wrapMethods<T extends object>(target: T, blocked: ReadonlySet<string>, onBlocked: (what: string) => void, label: string): T {
  return new Proxy(target, {
    get(t, k, r) {
      if (typeof k === 'string' && blocked.has(k)) return () => { onBlocked(`${label}.${k}`); return blockedCall() }
      const v = Reflect.get(t, k, r)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}

// deno-lint-ignore no-explicit-any
type AnyClient = any
export function readOnlyClient<C extends object>(client: C, onBlocked: (what: string) => void = () => {}): C {
  return new Proxy(client as AnyClient, {
    get(t: AnyClient, k, r) {
      if (k === 'from') return (table: string) => wrapMethods(t.from(table), TABLE_WRITES, onBlocked, table)
      if (k === 'rpc') return (fn: string, args?: unknown, opts?: unknown) => {
        if (READ_RPCS.has(fn)) return t.rpc(fn, args, opts)
        onBlocked(`rpc.${fn}`)
        return blockedCall()
      }
      if (k === 'storage') return { from: (bucket: string) => wrapMethods(t.storage.from(bucket), STORAGE_WRITES, onBlocked, `storage.${bucket}`) }
      if (k === 'schema') return (name: string) => readOnlyClient(t.schema(name), onBlocked)
      const v = Reflect.get(t, k, r)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}
