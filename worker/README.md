# Cloudflare deployment — keep the Gemini key server-side

The Worker in `worker/index.js` both serves the built app and proxies Gemini, so
the API key lives in a Worker secret and never reaches a browser.

## 1. Log in and deploy once

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY      # paste the key when prompted
npm run build                                # produces ./dist for the Worker to serve
npx wrangler deploy
```

Wrangler prints the URL (`https://clientforge-studio.<subdomain>.workers.dev`).
Open it, go to **API Settings → Keep the key on Cloudflare**, leave **Proxy URL**
empty (same origin) and press **Test proxy** — it should answer
`✓ Proxy reachable`.

## 2. What the proxy exposes

| Route | Purpose |
| --- | --- |
| `GET /api/ai/status` | health probe used by “Test proxy” |
| `GET /api/ai/models` | live Gemini model list |
| `POST /api/ai/text?model=…` | one-shot generation (model test) |
| `POST /api/ai/text/stream?model=…` | streamed generation (PDF, carousel, labels) |
| `POST /api/ai/image?model=…&mode=…` | Gemini image chat or Imagen predict |

## 3. Optional hardening

* `npx wrangler secret put PROXY_TOKEN` — every request then needs the same token
  in **Proxy token** in API Settings. Use it when the URL is public and you want a
  second gate on top of the origin check.
* `ALLOWED_ORIGINS` variable — comma-separated extra origins (e.g. a custom
  domain, a Vercel copy). Same-origin calls are always allowed.
* Add a **Cloudflare → Security → WAF rate limiting rule** on `/api/ai/*`
  (e.g. 60 requests/minute per IP). The Worker also keeps a best-effort
  per-isolate counter that answers HTTP 429.

There is no client secret to protect: the proxy holds the provider key, and the
browser only ever sees `/api/ai`. Rotate the key with
`npx wrangler secret put GEMINI_API_KEY` — no rebuild or redeploy of the app.

## 4. Local development

`npm run dev` serves only the SPA, so the proxy routes do not exist there. Either
paste a key locally (nothing is uploaded), or run the Worker:

```bash
npm run build && npx wrangler dev
```

Then reach the app on the Wrangler port and keep **Proxy URL** empty. For a
remote Worker during local dev, set **Proxy URL** to
`https://<worker>.workers.dev/api/ai` and add `http://localhost:5173` to
`ALLOWED_ORIGINS`.
