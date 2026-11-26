/**
 * ClientForge Studio — Worker entry.
 *
 * Serves the built SPA from ./dist and proxies Gemini calls under /api/ai/*.
 * The provider key is read from the GEMINI_API_KEY secret, so it never reaches
 * a browser, a bundle or localStorage.
 *
 * Routes (all POST unless noted):
 *   GET  /api/ai/status                 → health probe
 *   GET  /api/ai/models                 → live model list
 *   POST /api/ai/text?model=…           → generateContent (one round trip)
 *   POST /api/ai/text/stream?model=…    → streamGenerateContent (SSE passthrough)
 *   POST /api/ai/image?model=…&mode=…   → image generation (chat | predict)
 */

const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta'
const MAX_BODY_BYTES = 6 * 1024 * 1024
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 60_000

/** Best-effort per-isolate throttle. Add a Cloudflare rate-limiting rule for the real guard. */
const hits = new Map()

function throttled(ip) {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 })
    if (hits.size > 5000) hits.clear()
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || ''
  if (!origin) return ''
  const here = new URL(request.url).origin
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  return origin === here || list.includes(origin.toLowerCase()) || (list.length > 0 && isLocal) ? origin : ''
}

function corsHeaders(origin) {
  const headers = new Headers({ vary: 'origin' })
  if (origin) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'GET,POST,OPTIONS')
    headers.set('access-control-allow-headers', 'content-type,x-forge-token')
    headers.set('access-control-max-age', '86400')
  }
  return headers
}

function json(body, status, origin) {
  const headers = corsHeaders(origin)
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

function authorised(request, env) {
  const token = String(env.PROXY_TOKEN || '').trim()
  if (token) {
    if ((request.headers.get('x-forge-token') || '') !== token) return 'proxy token missing or wrong'
  }
  const origin = request.headers.get('origin') || ''
  if (!origin) return token ? '' : 'browser origin required'
  return allowedOrigin(request, env) ? '' : 'origin not allowed'
}

async function forward(request, env, upstreamUrl, origin) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BODY_BYTES) return json({ error: { message: 'Request body too large.' } }, 413, origin)
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY_BYTES) return json({ error: { message: 'Request body too large.' } }, 413, origin)

  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() },
    body,
  })

  const headers = corsHeaders(origin)
  const type = upstream.headers.get('content-type')
  if (type) headers.set('content-type', type)
  headers.set('cache-control', 'no-store')
  return new Response(upstream.body, { status: upstream.status, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/ai/')) return env.ASSETS.fetch(request)

    const origin = allowedOrigin(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })

    const denied = authorised(request, env)
    if (denied) return json({ error: { message: `Unauthorised: ${denied}` } }, 403, origin)

    const key = String(env.GEMINI_API_KEY || '').trim()
    if (!key) {
      return json({ error: { message: 'This Worker has no GEMINI_API_KEY secret set.' } }, 500, origin)
    }

    const ip = request.headers.get('cf-connecting-ip') || 'unknown'
    if (throttled(ip)) return json({ error: { message: 'Too many requests — wait a minute.' } }, 429, origin)

    const model = url.searchParams.get('model') || ''
    if (model && !/^[A-Za-z0-9._-]{1,80}$/.test(model)) {
      return json({ error: { message: 'Invalid model id.' } }, 400, origin)
    }

    try {
      if (url.pathname === '/api/ai/status') {
        return json({ ok: true, image: true, models: true }, 200, origin)
      }

      if (url.pathname === '/api/ai/models' && request.method === 'GET') {
        const upstream = new URL(`${UPSTREAM}/models`)
        upstream.searchParams.set('pageSize', url.searchParams.get('pageSize') || '200')
        const pageToken = url.searchParams.get('pageToken')
        if (pageToken) upstream.searchParams.set('pageToken', pageToken)
        const response = await fetch(upstream.toString(), {
          headers: { 'x-goog-api-key': key },
        })
        const headers = corsHeaders(origin)
        headers.set('content-type', 'application/json')
        headers.set('cache-control', 'no-store')
        return new Response(response.body, { status: response.status, headers })
      }

      if (url.pathname === '/api/ai/text/stream' && request.method === 'POST') {
        if (!model) return json({ error: { message: 'model is required' } }, 400, origin)
        return await forward(
          request,
          env,
          `${UPSTREAM}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
          origin,
        )
      }

      if (url.pathname === '/api/ai/text' && request.method === 'POST') {
        if (!model) return json({ error: { message: 'model is required' } }, 400, origin)
        return await forward(request, env, `${UPSTREAM}/models/${encodeURIComponent(model)}:generateContent`, origin)
      }

      if (url.pathname === '/api/ai/image' && request.method === 'POST') {
        if (!model) return json({ error: { message: 'model is required' } }, 400, origin)
        const action = url.searchParams.get('mode') === 'predict' ? 'predict' : 'generateContent'
        return await forward(request, env, `${UPSTREAM}/models/${encodeURIComponent(model)}:${action}`, origin)
      }

      return json({ error: { message: 'Unknown API route.' } }, 404, origin)
    } catch (error) {
      return json({ error: { message: `Proxy failed: ${error instanceof Error ? error.message : 'unknown'}` } }, 502, origin)
    }
  },
}
