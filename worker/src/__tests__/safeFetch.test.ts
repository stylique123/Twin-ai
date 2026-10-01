import { describe, it, expect } from 'vitest'
import { isInternalAddress, assertPublicHttpsUrl, UnsafeUrlError } from '../safeFetch.js'

// ⚠️ AUDIT 2026-10-01 (X1): a product link could reach cloud metadata or an
// internal service through the worker.
describe('the product reader never reaches an internal address', () => {
  it('refuses private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isInternalAddress(ip)).toBe(true)
    }
  })
  it('allows a public address', () => {
    expect(isInternalAddress('93.184.216.34')).toBe(false)
    expect(isInternalAddress('2606:4700::1111')).toBe(false)
  })
  it('refuses http, credentials, internal names and literal private IPs before any fetch', async () => {
    for (const u of ['http://example.com', 'https://user:pw@example.com', 'https://localhost/x', 'https://metadata.internal/', 'https://169.254.169.254/latest', 'https://[::1]/']) {
      await expect(assertPublicHttpsUrl(u)).rejects.toBeInstanceOf(UnsafeUrlError)
    }
  })
})
