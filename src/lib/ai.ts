import { normalizeCarousel, normalizeDoc } from './normalize'
import { carouselSystemPrompt, carouselUserPrompt, docSystemPrompt, docUserPrompt } from './prompts'
import { providerPreset } from '../theme/presets'
import type { AppSettings, BrandPreset, Carousel, ModelOption, PdfDoc, ProviderId } from '../types'

export class AiError extends Error {
  hint?: string
  status?: number
  retryable: boolean
  constructor(message: string, hint?: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'AiError'
    this.hint = hint
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const ANTHROPIC_MESSAGES = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODELS = 'https://api.anthropic.com/v1/models'
const ANTHROPIC_VERSION = '2023-06-01'

/** A stream that sends nothing for this long is treated as dead. */
export const STREAM_IDLE_TIMEOUT_MS = 30_000
/** Absolute ceiling for one streaming request. A working stream runs to the end. */
export const STREAM_MAX_MS = 150_000
/** Retries after the first attempt, per model, for 429 / 503. */
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2_000
const MAX_MODEL_ATTEMPTS = 3

/** Receives the number of characters streamed so far, for live button labels. */
export type StreamProgress = (chars: number) => void

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required for direct browser calls; the key never leaves this device.
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

function timeoutError(reason: 'idle' | 'cap' = 'cap'): AiError {
  return reason === 'idle'
    ? new AiError(
        `The model stopped sending data for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)} seconds.`,
        'Pick a Flash model, shorten the source, or use Direct Mode (No AI) for an instant result.',
      )
    : new AiError(
        `The request hit its ${Math.round(STREAM_MAX_MS / 1000)}-second ceiling.`,
        'Pick a Flash model, shorten the source, or use Direct Mode (No AI) for an instant result.',
      )
}

function shortDetail(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 220)
}

async function failureMessage(response: Response, provider: ProviderId): Promise<AiError> {
  let detail = ''
  try {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string }
      detail = parsed.error?.message || parsed.message || text
    } catch {
      detail = text
    }
  } catch {
    detail = ''
  }
  detail = shortDetail(detail)
  const label = providerPreset(provider).name
  const status = response.status
  // Google reports the useful cause in the body; keep it so debugging is not guesswork.
  const suffix = detail ? `: ${detail}` : '.'
  const retryable = status === 429 || status === 503 || status === 502 || status === 504

  if (status === 401 || status === 403) {
    return new AiError(
      `${label} rejected the API key (HTTP ${status})${suffix}`,
      'Open API Settings and paste a valid key for this provider.',
      { status },
    )
  }
  if (status === 404) {
    return new AiError(
      `${label} could not find that model (HTTP 404)${suffix}`,
      'Open API Settings, refresh the model list and pick a model your key can access.',
      { status },
    )
  }
  if (status === 429) {
    return new AiError(
      `${label} rate limit or quota reached (HTTP 429)${suffix}`,
      'Free-tier quota refills per minute. Wait ~30 seconds, or switch to a Flash-Lite model.',
      { status, retryable },
    )
  }
  if (status === 400) {
    return new AiError(
      `${label} rejected the request (HTTP 400)${suffix}`,
      'The model may not accept JSON mode or thinking settings. Pick another Flash model in API Settings.',
      { status },
    )
  }
  if (status === 503) {
    return new AiError(
      `${label} is overloaded (HTTP 503)${suffix}`,
      'This is temporary — retrying on a fallback Flash model usually clears it.',
      { status, retryable },
    )
  }
  if (status >= 500) {
    return new AiError(
      `${label} service error (HTTP ${status})${suffix}`,
      'Retrying usually helps; if not, switch model or provider.',
      { status, retryable },
    )
  }
  return new AiError(`${label} request failed (HTTP ${status})${suffix}`, undefined, { status })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function geminiText(data: Record<string, unknown>): string {
  const candidates = data.candidates as
    | { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    | undefined
  const parts = candidates?.[0]?.content?.parts
  return (parts ?? []).map((part) => part.text ?? '').join('')
}

function geminiConfig(maxTokens: number, thinking: boolean): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature: 0.5,
    maxOutputTokens: maxTokens,
    // Structured output: no prose wrapper, no markdown fences, much faster.
    responseMimeType: 'application/json',
  }
  // Fast response mode — suppress extended thinking where the model allows it.
  if (thinking) config.thinkingConfig = { thinkingBudget: 0 }
  return config
}

function geminiPayload(system: string, user: string, maxTokens: number, thinking: boolean): string {
  return JSON.stringify({
    systemInstruction: { role: 'system', parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: geminiConfig(maxTokens, thinking),
  })
}

/**
 * Gemini SSE stream, called straight from the browser (no proxy in between).
 * Progress is reported per chunk, a 30s idle watchdog resets on every chunk so
 * a working stream is never cut, and the 150s cap is the only hard ceiling.
 */
async function streamGemini(options: {
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens: number
  thinking: boolean
  onProgress?: StreamProgress
}): Promise<string> {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(
    options.model,
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`
  const controller = new AbortController()
  let abortReason: 'idle' | 'cap' | null = null

  const capTimer = window.setTimeout(() => {
    abortReason = 'cap'
    controller.abort()
  }, STREAM_MAX_MS)

  let idleTimer: number | undefined
  const resetIdle = () => {
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      abortReason = 'idle'
      controller.abort()
    }, STREAM_IDLE_TIMEOUT_MS)
  }

  try {
    resetIdle()
    const send = (thinking: boolean) =>
      fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: geminiPayload(options.system, options.user, options.maxTokens, thinking),
      })

    let response = await send(options.thinking)
    // Older models reject thinkingConfig outright; the same call succeeds without it.
    if (!response.ok && response.status === 400 && options.thinking) {
      response = await send(false)
    }
    if (!response.ok) throw await failureMessage(response, 'gemini')
    if (!response.body) throw new AiError('The provider opened no stream.', 'Try again, or switch model.')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let blocked = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()
      // Raw CR only appears in SSE line endings, so normalising is safe.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let cut = buffer.indexOf('\n\n')
      while (cut !== -1) {
        const event = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          let data: Record<string, unknown>
          try {
            data = JSON.parse(payload) as Record<string, unknown>
          } catch {
            continue
          }
          const chunk = geminiText(data)
          if (chunk) {
            text += chunk
            options.onProgress?.(text.length)
          }
          const reason = (data.promptFeedback as { blockReason?: string } | undefined)?.blockReason
          if (reason) blocked = reason
          const finish = (data.candidates as { finishReason?: string }[] | undefined)?.[0]?.finishReason
          if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') blocked = finish
        }
        cut = buffer.indexOf('\n\n')
      }
    }

    if (!text.trim()) {
      if (blocked) throw new AiError(`Gemini blocked the response (${blocked}).`, 'Adjust the source text and retry.')
      throw new AiError('The model returned an empty response.', 'Try again, or switch to another model.')
    }
    return text
  } catch (error) {
    if (abortReason) throw timeoutError(abortReason)
    if (error instanceof AiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw timeoutError('cap')
    throw new AiError(
      'Could not reach the provider from this browser.',
      'This is usually a network or CORS problem. Check your connection, then try again.',
    )
  } finally {
    window.clearTimeout(idleTimer)
    window.clearTimeout(capTimer)
  }
}

/** Anthropic has no JSON streaming contract here, so one bounded round trip. */
async function requestAnthropic(options: {
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens: number
}): Promise<string> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), STREAM_MAX_MS)
  try {
    const response = await fetch(ANTHROPIC_MESSAGES, {
      method: 'POST',
      signal: controller.signal,
      headers: anthropicHeaders(options.apiKey),
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: 0.5,
        system: options.system,
        messages: [{ role: 'user', content: options.user }],
      }),
    })
    if (!response.ok) throw await failureMessage(response, 'anthropic')
    let data: Record<string, unknown>
    try {
      data = (await response.json()) as Record<string, unknown>
    } catch {
      if (controller.signal.aborted) throw timeoutError('cap')
      throw new AiError('The provider returned an unreadable response.', 'Try again, or switch model.')
    }
    const content = data.content as { type?: string; text?: string }[] | undefined
    const text = (content ?? []).map((part) => part.text ?? '').join('')
    if (!text.trim()) {
      throw new AiError('The model returned an empty response.', 'Try again, or switch to another model.')
    }
    return text
  } catch (error) {
    if (error instanceof AiError) throw error
    if (controller.signal.aborted) throw timeoutError('cap')
    throw new AiError(
      'Could not reach the provider from this browser.',
      'This is usually a network or CORS problem. Check your connection, then try again.',
    )
  } finally {
    window.clearTimeout(timer)
  }
}

/** Dispatches one attempt; throws typed AiError so the retry loop can decide. */
function requestOnce(options: {
  provider: ProviderId
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens: number
  thinking: boolean
  onProgress?: StreamProgress
}): Promise<string> {
  if (options.provider === 'gemini') {
    return streamGemini({
      apiKey: options.apiKey,
      model: options.model,
      system: options.system,
      user: options.user,
      maxTokens: options.maxTokens,
      thinking: options.thinking,
      onProgress: options.onProgress,
    })
  }
  return requestAnthropic({
    apiKey: options.apiKey,
    model: options.model,
    system: options.system,
    user: options.user,
    maxTokens: options.maxTokens,
  })
}

/**
 * Streams (Gemini) with a 30s idle guard and a 150s cap, retries 429/503 three
 * times with a 2s backoff, then falls back through the next stable Flash models.
 */
export async function callModel(options: {
  provider: ProviderId
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens?: number
  fallbackModels?: string[]
  onProgress?: StreamProgress
}): Promise<string> {
  if (!options.apiKey.trim()) {
    throw new AiError('No API key saved for this provider.', 'Add your key in API Settings — it stays in this browser.')
  }
  if (!options.model.trim()) {
    throw new AiError(
      'No model selected.',
      'Open API Settings and refresh the model list — or switch on Direct Mode (No AI).',
    )
  }

  const chain = [options.model, ...(options.fallbackModels ?? [])]
    .map((model) => model.replace(/^models\//, '').trim())
    .filter((model, index, all) => Boolean(model) && all.indexOf(model) === index)
    .slice(0, MAX_MODEL_ATTEMPTS)

  const tried: string[] = []
  let retries = 0
  let lastError: AiError | null = null

  for (const model of chain) {
    tried.push(model)
    // Some Gemini models reject thinkingConfig outright; the stream retries without it.
    const thinking =
      options.provider === 'gemini' && /flash/i.test(model) && !/pro|thinking|learnlm|image|tts/i.test(model)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await requestOnce({
          provider: options.provider,
          apiKey: options.apiKey,
          model,
          system: options.system,
          user: options.user,
          maxTokens: options.maxTokens ?? 8192,
          thinking,
          onProgress: options.onProgress,
        })
      } catch (error) {
        const aiError =
          error instanceof AiError
            ? error
            : new AiError(error instanceof Error ? error.message : 'Generation failed.')
        if (!aiError.retryable) throw aiError

        lastError = aiError
        if (attempt < MAX_RETRIES) {
          retries += 1
          await wait(RETRY_DELAY_MS)
        }
      }
    }
  }

  if (!lastError) {
    throw new AiError('Generation failed.', 'Try again, or turn on Direct Mode (No AI).')
  }
  const triedNote = tried.length > 1 ? ` Tried ${tried.join(' → ')}.` : ''
  const retryNote = retries ? ` Retried ${retries}× before giving up.` : ''
  throw new AiError(
    `${lastError.message}${retryNote}${triedNote}`,
    lastError.hint ?? 'Try again in a moment, switch to Flash-Lite, or turn on Direct Mode (No AI).',
    { status: lastError.status },
  )
}

/**
 * Tiny "Reply OK" ping so a model can be verified in about two seconds.
 * Returns the round-trip time in milliseconds.
 */
export async function testModel(provider: ProviderId, apiKey: string, model: string): Promise<number> {
  const key = apiKey.trim()
  const id = model.replace(/^models\//, '').trim()
  if (!key) throw new AiError('Add an API key first.', 'The model list is read live from the provider.')
  if (!id) throw new AiError('Choose a model first.', 'Refresh the list, then pick a Flash model.')

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15_000)
  const started = performance.now()

  try {
    let response: Response
    if (provider === 'gemini') {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(id)}:generateContent?key=${encodeURIComponent(key)}`
      const withThinking = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
        generationConfig: {
          maxOutputTokens: 16,
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: withThinking,
      })
      if (response.status === 400) {
        response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
            generationConfig: { maxOutputTokens: 16, temperature: 0 },
          }),
        })
      }
    } else {
      response = await fetch(ANTHROPIC_MESSAGES, {
        method: 'POST',
        signal: controller.signal,
        headers: anthropicHeaders(key),
        body: JSON.stringify({
          model: id,
          max_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      })
    }

    if (!response.ok) throw await failureMessage(response, provider)
    await response.text()
    return Math.max(1, Math.round(performance.now() - started))
  } catch (error) {
    if (error instanceof AiError) throw error
    if (controller.signal.aborted) {
      throw new AiError('The test timed out after 15 seconds.', 'The model is not responding — pick a Flash model.')
    }
    throw new AiError(
      'Could not reach the provider from this browser.',
      'Check your connection, then test again.',
    )
  } finally {
    window.clearTimeout(timer)
  }
}

function parseJsonSlice(candidate: string): unknown | undefined {
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    return undefined
  }
}

/** Walks a brace/bracket balanced slice starting at `start`, ignoring strings. */
function balancedSlice(source: string, start: number): string | null {
  const opener = source[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === opener) depth += 1
    else if (char === closer) {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Tolerant JSON reader: unwraps markdown fences, parses clean payloads
 * directly, and otherwise extracts the first balanced object or array.
 */
export function extractJson(text: string): unknown {
  let cleaned = text.replace(/^\uFEFF/, '').trim()

  // ```json ... ``` (also plain ``` and a trailing fence without a newline)
  const fenced = cleaned.match(/```[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/)
  if (fenced && fenced[1] && fenced[1].trim()) cleaned = fenced[1].trim()
  cleaned = cleaned
    .replace(/^```[ \t]*(?:json|JSON)?[ \t]*\r?\n?/, '')
    .replace(/\r?\n?```[ \t]*$/, '')
    .trim()

  const direct = parseJsonSlice(cleaned)
  if (direct !== undefined) return direct

  // First balanced object, then array.
  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i]
    if (char !== '{' && char !== '[') continue
    const slice = balancedSlice(cleaned, i)
    if (!slice) continue
    const parsed = parseJsonSlice(slice)
    if (parsed !== undefined) return parsed
  }

  // Last resort: trim trailing prose and retry once.
  const firstBrace = cleaned.search(/[[{]/)
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const parsed = parseJsonSlice(cleaned.slice(firstBrace, lastBrace + 1))
    if (parsed !== undefined) return parsed
  }

  throw new AiError(
    'The model returned malformed JSON.',
    'Generate again, switch to a stronger model, or turn on Direct Mode (No AI).',
  )
}

/** Ordered fallbacks: next fastest stable models from the live catalog. */
export function fallbackModels(settings: AppSettings): string[] {
  const provider = settings.provider
  return settings.catalog[provider]
    .map((model) => model.id)
    .filter((id) => id && id !== settings.models[provider])
    .sort((a, b) => rankModel(a) - rankModel(b) || versionOf(b) - versionOf(a))
    .slice(0, MAX_MODEL_ATTEMPTS - 1)
}

export async function generateDoc(
  settings: AppSettings,
  source: string,
  brand: BrandPreset,
  onProgress?: StreamProgress,
): Promise<PdfDoc> {
  const text = await callModel({
    provider: settings.provider,
    apiKey: settings.keys[settings.provider],
    model: settings.models[settings.provider],
    system: docSystemPrompt(),
    user: docUserPrompt({
      source,
      language: settings.language,
      depth: settings.depth,
      includeMcqs: settings.includeMcqs,
      brand,
    }),
    fallbackModels: fallbackModels(settings),
    onProgress,
  })
  const doc = normalizeDoc(extractJson(text))
  if (!doc.sections.length) {
    throw new AiError('The model returned a document with no sections.', 'Try again with a little more source text.')
  }
  return doc
}

export async function generateCarousel(
  settings: AppSettings,
  source: string,
  brand: BrandPreset,
  onProgress?: StreamProgress,
): Promise<Carousel> {
  const text = await callModel({
    provider: settings.provider,
    apiKey: settings.keys[settings.provider],
    model: settings.models[settings.provider],
    system: carouselSystemPrompt(),
    user: carouselUserPrompt({
      source,
      language: settings.language,
      slideCount: settings.slideCount,
      brand,
    }),
    maxTokens: 4096,
    fallbackModels: fallbackModels(settings),
    onProgress,
  })
  const carousel = normalizeCarousel(extractJson(text))
  if (!carousel.slides.length) {
    throw new AiError('The model returned no slides.', 'Try again with a clearer topic or a longer transcript.')
  }
  return carousel
}

function modelLabel(id: string, displayName?: string): string {
  if (displayName) return displayName
  return id
    .replace(/^models\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const PREVIEW_PATTERN = /(preview|experimental|exp\d|thinking|deep-research|learnlm|computer-use|robotics)/i
const NON_CHAT_PATTERN = /(embedding|image|imagen|audio|tts|veo|aqa|gemma)/i

/** Lower is better. Stable Flash wins, preview/reasoning models sink. */
export function rankModel(id: string): number {
  const name = id.toLowerCase().replace(/^models\//, '')
  if (PREVIEW_PATTERN.test(name)) return 40
  if (/flash-lite/.test(name)) return 1
  if (/flash/.test(name)) return 0
  if (NON_CHAT_PATTERN.test(name)) return 60
  if (/(pro|ultra)/.test(name)) return 20
  return 10
}

function versionOf(id: string): number {
  const matches = id.match(/\d+(?:\.\d+)?/g)
  if (!matches) return 0
  const first = Number(matches[0])
  return Number.isFinite(first) ? first : 0
}

function modelNote(id: string): string {
  const name = id.toLowerCase()
  if (PREVIEW_PATTERN.test(name)) return 'Preview — can be overloaded'
  if (/flash-lite/.test(name)) return 'Fastest · low cost'
  if (/flash/.test(name)) return 'Fast · stable'
  if (/(pro|ultra)/.test(name)) return 'Reasoning · slower'
  return 'Text model'
}

/** The model a fresh install (or an empty selection) should land on. */
export function pickDefaultModel(models: ModelOption[]): string {
  return models[0]?.id ?? ''
}

export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelOption[]> {
  if (!apiKey.trim()) {
    throw new AiError('Add an API key first.', 'The model list is read live from the provider.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  const raw: { name?: string; id?: string; display_name?: string; displayName?: string; supportedGenerationMethods?: string[] }[] = []

  try {
    if (provider === 'gemini') {
      let pageToken: string | undefined
      for (let page = 0; page < 3; page += 1) {
        const url = new URL(`${GEMINI_BASE}/models`)
        url.searchParams.set('pageSize', '200')
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        const response = await fetch(url.toString(), {
          headers: { 'x-goog-api-key': apiKey },
          signal: controller.signal,
        })
        if (!response.ok) throw await failureMessage(response, provider)
        const data = (await response.json()) as {
          models?: typeof raw
          nextPageToken?: string
        }
        raw.push(...(data.models ?? []))
        pageToken = data.nextPageToken
        if (!pageToken) break
      }
    } else {
      const response = await fetch(`${ANTHROPIC_MODELS}?limit=100`, {
        headers: anthropicHeaders(apiKey),
        signal: controller.signal,
      })
      if (!response.ok) throw await failureMessage(response, provider)
      const data = (await response.json()) as { models?: typeof raw }
      raw.push(...(data.models ?? []))
    }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (controller.signal.aborted) {
      throw new AiError(
        'Loading the model list timed out.',
        'Check your connection, then hit Refresh again.',
      )
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  const models = raw
    .filter((model) => {
      // Gemini only lists generateContent models; other keys may list embeddings.
      if (provider === 'gemini') {
        return Boolean(model.supportedGenerationMethods?.includes('generateContent'))
      }
      return !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent')
    })
    .map((model) => {
      const value = model.id ?? model.name ?? ''
      const id = value.replace(/^models\//, '')
      return { id, label: modelLabel(id, model.displayName ?? model.display_name), note: modelNote(id) }
    })
    .filter((model) => model.id)

  models.sort(
    (a, b) => rankModel(a.id) - rankModel(b.id) || versionOf(b.id) - versionOf(a.id) || a.id.localeCompare(b.id),
  )

  if (!models.length) throw new AiError('The provider returned no usable text models.')
  if (provider === 'gemini') {
    models[0] = { ...models[0], note: 'Recommended · fastest stable Flash' }
  }
  return models
}
