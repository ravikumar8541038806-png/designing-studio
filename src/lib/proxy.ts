/**
 * Routes AI traffic through the app's own Cloudflare Worker (`/api/ai/*`).
 * With the proxy on, the provider key exists only as a Worker secret — nothing
 * secret is ever written to localStorage or shipped in the built bundle.
 */

let current: { base: string; token: string } | null = null

export function configureProxy(settings: { enabled?: boolean; url?: string; token?: string }): void {
  if (!settings.enabled) {
    current = null
    return
  }
  const raw = (settings.url ?? '').trim()
  // Empty means "same origin": the Worker that serves this app also answers /api/ai.
  current = { base: (raw || '/api/ai').replace(/\/+$/, ''), token: (settings.token ?? '').trim() }
}

export function proxyOn(): boolean {
  return current !== null
}

export function proxyUrl(path: string, params: Record<string, string> = {}): string {
  const base = current?.base ?? '/api/ai'
  const absolute = /^https?:\/\//i.test(base) ? base : `${window.location.origin}${base}`
  const url = new URL(`${absolute}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (current?.token) headers['x-forge-token'] = current.token
  return headers
}

/** Round-trip probe used by API Settings so a wrong URL is caught early. */
export async function testProxy(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(proxyUrl('/status'), { headers: proxyHeaders() })
    const text = (await response.text()).replace(/\s+/g, ' ').trim()
    if (!response.ok) {
      return { ok: false, message: `Proxy answered HTTP ${response.status}${text ? ` — ${text.slice(0, 160)}` : ''}` }
    }
    return { ok: true, message: '✓ Proxy reachable — keys stay on the server' }
  } catch {
    return { ok: false, message: 'Could not reach the proxy URL from this browser.' }
  }
}
