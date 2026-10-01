// ⚠️ AUDIT 2026-10-01 (X1): THE PRODUCT READER FETCHED ANY HTTPS URL A CREATOR
// TYPED, AND FOLLOWED ITS REDIRECTS. This process holds service-role
// credentials and runs inside a cloud network, so a product link that
// redirected to 169.254.169.254 or a 10.x host was fetched and its answer
// stored where the creator could read it. Every hop is now checked: HTTPS
// only, and the host must not resolve to a private, loopback, link-local or
// otherwise internal address.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class UnsafeUrlError extends Error {
  constructor(message: string) { super(message); this.name = 'UnsafeUrlError' }
}

/** True for any address a public web page must never live on. */
export function isInternalAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127)       // carrier-grade NAT
      || (a === 169 && b === 254)                  // link-local, cloud metadata
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224                                   // multicast, reserved
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    if (s === '::' || s === '::1') return true
    if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true // link-local
    if (s.startsWith('fc') || s.startsWith('fd')) return true // unique local
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isInternalAddress(mapped[1]!)
    return false
  }
  return true // not an address at all: refuse
}

/** Throws UnsafeUrlError unless `raw` is an https URL on a public host. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let u: URL
  try { u = new URL(raw) } catch { throw new UnsafeUrlError('not a URL') }
  if (u.protocol !== 'https:') throw new UnsafeUrlError('only https links can be read')
  if (u.username || u.password) throw new UnsafeUrlError('links with credentials are refused')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeUrlError('internal host')
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (addrs.length === 0) throw new UnsafeUrlError('host does not resolve')
  if (addrs.some((a) => isInternalAddress(a.address))) throw new UnsafeUrlError('host resolves to an internal address')
  return u
}

/** fetch() that re-checks every redirect hop. At most 5 hops. */
export async function safeFetch(raw: string, init: RequestInit = {}, maxHops = 5): Promise<Response> {
  let current = raw
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicHttpsUrl(current)
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      current = new URL(loc, current).toString()
      continue
    }
    return res
  }
  throw new UnsafeUrlError('too many redirects')
}
