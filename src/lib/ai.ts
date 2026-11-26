import { normalizeCarousel, normalizeDoc } from './normalize'
import {
  carouselSystemPrompt,
  carouselUserPrompt,
  detectInputMode,
  docSystemPrompt,
  docUserPrompt,
} from './prompts'
import { DEFAULT_CATALOG, providerPreset } from '../theme/presets'
import { proxyHeaders, proxyOn, proxyUrl } from './proxy'
import type { AppSettings, BrandPreset, Carousel, ModelOption, PdfDoc, ProviderId } from '../types'

export class AiError extends Error {
  hint?: string
  status?: number
  retryable: boolean
  /** True when the API key itself is invalid/unauthorized and retrying other models will not help. */
  fatalAuth: boolean
  constructor(
    message: string,
    hint?: string,
    options: { status?: number; retryable?: boolean; fatalAuth?: boolean } = {},
  ) {
    super(message)
    this.name = 'AiError'
    this.hint = hint
    this.status = options.status
    this.retryable = options.retryable ?? false
    this.fatalAuth = options.fatalAuth ?? false
  }
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const ANTHROPIC_MESSAGES = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODELS = 'https://api.anthropic.com/v1/models'
const ANTHROPIC_VERSION = '2023-06-01'

/** A stream that sends nothing for this long is treated as stalled and fails over. */
export const STREAM_IDLE_TIMEOUT_MS = 28_000
/** Absolute ceiling for one streaming request. */
export const STREAM_MAX_MS = 140_000
/** Short retry count per model before failing over cleanly to the next model. */
const MAX_RETRIES_PER_MODEL = 1
const MAX_MODEL_ATTEMPTS = 5

const CURATED_FALLBACKS: Record<ProviderId, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
}

/** Receives the number of characters streamed so far, for live button labels. */
export type StreamProgress = (chars: number) => void

let cachedImageModels: { key: string; models: { id: string; mode: 'chat' | 'predict' }[] } | null = null

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

function timeoutError(reason: 'idle' | 'cap' = 'cap'): AiError {
  return reason === 'idle'
    ? new AiError(
        'The AI model took too long to respond.',
        'Retrying with another model or use Direct Mode (No AI) for an instant layout.',
        { retryable: true },
      )
    : new AiError(
        'The request took too long to complete.',
        'Try a shorter prompt or Direct Mode (No AI) for instant structuring.',
        { retryable: true },
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
  if (detail) console.warn(`[ClientForge AI] ${label} HTTP ${status}: ${detail}`)

  if (status === 401 || status === 403) {
    return new AiError(
      `Your ${label} API key wasn't accepted.`,
      'Open API Settings and verify your key (or enable the Cloudflare proxy).',
      { status, fatalAuth: true },
    )
  }
  if (status === 404) {
    return new AiError(
      'That AI model is currently unavailable on your account.',
      'Switching automatically to an available model.',
      { status, retryable: true },
    )
  }
  if (status === 429) {
    return new AiError(
      `${label} is temporarily busy (rate limit reached).`,
      'Wait a few seconds and try again, or use Direct Mode (No AI) instantly.',
      { status, retryable: true },
    )
  }
  if (status === 400) {
    return new AiError(
      'The AI model could not process those parameters.',
      'Trying a compatible fallback model automatically.',
      { status, retryable: true },
    )
  }
  if (status >= 500) {
    return new AiError(
      `${label} is temporarily overloaded.`,
      'Please try again in a moment.',
      { status, retryable: true },
    )
  }
  return new AiError(`${label} could not complete the request.`, 'Please try again.', {
    status,
    retryable: true,
  })
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

function geminiPayload(
  system: string,
  user: string,
  maxTokens: number,
  options: { jsonMode: boolean; suppressThinking: boolean },
): string {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.45,
    maxOutputTokens: maxTokens,
  }
  if (options.jsonMode) generationConfig.responseMimeType = 'application/json'
  if (options.suppressThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 }

  return JSON.stringify({
    systemInstruction: { role: 'system', parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig,
  })
}

async function streamGemini(options: {
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens: number
  thinking: boolean
  onProgress?: StreamProgress
}): Promise<string> {
  const url = proxyOn()
    ? proxyUrl('/text/stream', { model: options.model })
    : `${GEMINI_BASE}/models/${encodeURIComponent(
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
    const send = (jsonMode: boolean, suppressThinking: boolean) =>
      fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: proxyOn() ? proxyHeaders() : { 'content-type': 'application/json' },
        body: geminiPayload(options.system, options.user, options.maxTokens, {
          jsonMode,
          suppressThinking,
        }),
      })

    let response = await send(true, options.thinking)
    // Step 1: older Gemini models reject thinkingConfig with HTTP 400.
    if (!response.ok && response.status === 400 && options.thinking) {
      response = await send(true, false)
    }
    // Step 2: some models reject responseMimeType: application/json with HTTP 400.
    if (!response.ok && response.status === 400) {
      response = await send(false, false)
    }
    if (!response.ok) throw await failureMessage(response, 'gemini')
    if (!response.body) {
      throw new AiError('The AI stream opened empty.', 'Trying another model.', { retryable: true })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let blocked = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()
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
      if (blocked) {
        throw new AiError(
          'That content triggered a safety filter.',
          'Adjust your wording slightly or use Direct Mode (No AI).',
        )
      }
      throw new AiError('The AI returned an empty response.', 'Trying another model.', { retryable: true })
    }
    return text
  } catch (error) {
    if (abortReason) throw timeoutError(abortReason)
    if (error instanceof AiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw timeoutError('cap')
    throw new AiError(
      'Could not reach the AI service.',
      'Check your internet connection, or use Direct Mode (No AI).',
      { retryable: true },
    )
  } finally {
    window.clearTimeout(idleTimer)
    window.clearTimeout(capTimer)
  }
}

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
        temperature: 0.45,
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
      throw new AiError('The AI response was unreadable.', 'Trying another model.', { retryable: true })
    }
    const content = data.content as { type?: string; text?: string }[] | undefined
    const text = (content ?? []).map((part) => part.text ?? '').join('')
    if (!text.trim()) {
      throw new AiError('The AI returned an empty response.', 'Trying another model.', { retryable: true })
    }
    return text
  } catch (error) {
    if (error instanceof AiError) throw error
    if (controller.signal.aborted) throw timeoutError('cap')
    throw new AiError(
      'Could not reach Anthropic from this browser.',
      'Check your connection or switch to Gemini in API Settings.',
      { retryable: true },
    )
  } finally {
    window.clearTimeout(timer)
  }
}

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
 * Resolves the ordered model chain for a request:
 * when `autoModel` is enabled, picks the best ranked stable model from the catalog first,
 * then fails over across live catalog models and curated known-good models.
 */
export function buildModelChain(settings: AppSettings, preferredModel?: string): string[] {
  const provider = settings.provider
  const catalogIds = settings.catalog[provider]
    .map((m) => m.id)
    .sort((a, b) => rankModel(a) - rankModel(b) || versionOf(b) - versionOf(a))

  const primary = settings.autoModel
    ? catalogIds[0] || settings.models[provider] || DEFAULT_CATALOG[provider][0]?.id || ''
    : preferredModel || settings.models[provider] || catalogIds[0] || ''

  return [primary, ...catalogIds, ...CURATED_FALLBACKS[provider]]
    .map((model) => model.replace(/^models\//, '').trim())
    .filter((model, index, all) => Boolean(model) && all.indexOf(model) === index)
    .slice(0, MAX_MODEL_ATTEMPTS)
}

/**
 * Calls the AI with silent automatic failover across models and optional JSON validation.
 * Only fatal auth errors (401/403) stop immediately; 400/404/429/503/timeouts/bad JSON
 * transparently fall back to the next healthy model in the chain.
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
  validateJson?: boolean
}): Promise<string> {
  if (!options.apiKey.trim() && !proxyOn()) {
    throw new AiError(
      'AI is not connected yet.',
      'Open API Settings to add your key, or switch on Direct Mode (No AI) for instant offline formatting.',
    )
  }

  const chain = [options.model, ...(options.fallbackModels ?? []), ...CURATED_FALLBACKS[options.provider]]
    .map((model) => model.replace(/^models\//, '').trim())
    .filter((model, index, all) => Boolean(model) && all.indexOf(model) === index)
    .slice(0, MAX_MODEL_ATTEMPTS)

  if (!chain.length) {
    throw new AiError('No AI model configured.', 'Open API Settings or switch on Direct Mode (No AI).')
  }

  let lastError: AiError | null = null

  for (const model of chain) {
    const suppressThinking =
      options.provider === 'gemini' && /flash/i.test(model) && !/pro|thinking|learnlm|image|tts/i.test(model)

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt += 1) {
      try {
        const text = await requestOnce({
          provider: options.provider,
          apiKey: options.apiKey,
          model,
          system: options.system,
          user: options.user,
          maxTokens: options.maxTokens ?? 8192,
          thinking: suppressThinking,
          onProgress: options.onProgress,
        })
        if (options.validateJson) {
          extractJson(text)
        }
        return text
      } catch (error) {
        const aiError =
          error instanceof AiError
            ? error
            : new AiError(error instanceof Error ? error.message : 'Generation failed.', undefined, {
                retryable: true,
              })
        if (aiError.fatalAuth) throw aiError
        lastError = aiError
        // Only do a quick local retry on 429/503; 400/404/bad JSON advance to the next model immediately.
        const shouldWait = attempt < MAX_RETRIES_PER_MODEL && (aiError.status === 429 || aiError.status === 503)
        if (shouldWait) {
          await wait(1100 + attempt * 900)
          continue
        }
        break
      }
    }
  }

  throw (
    lastError ??
    new AiError(
      'Could not complete the AI request right now.',
      'Wait a moment and try again, or click "Use Direct Mode Instantly" below.',
    )
  )
}

export async function testModel(provider: ProviderId, apiKey: string, model: string): Promise<number> {
  const key = apiKey.trim()
  const id = model.replace(/^models\//, '').trim()
  if (!key && !(proxyOn() && provider === 'gemini')) {
    throw new AiError('Add an API key first.', 'The model list is read live from the provider.')
  }
  if (!id) throw new AiError('Choose a model first.', 'Refresh the list, then pick a Flash model.')

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15_000)
  const started = performance.now()

  try {
    let response: Response
    if (provider === 'gemini') {
      const url = proxyOn()
        ? proxyUrl('/text', { model: id })
        : `${GEMINI_BASE}/models/${encodeURIComponent(id)}:generateContent?key=${encodeURIComponent(key)}`
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
        headers: proxyOn() ? proxyHeaders() : { 'content-type': 'application/json' },
        body: withThinking,
      })
      if (response.status === 400) {
        response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: proxyOn() ? proxyHeaders() : { 'content-type': 'application/json' },
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
      throw new AiError('The connection test timed out.', 'Try again or check your network.')
    }
    throw new AiError('Could not reach the provider from this browser.', 'Check your connection, then test again.')
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

/** Repairs slightly truncated JSON or trailing commas before failing over. */
function repairJson(candidate: string): unknown | undefined {
  let cleaned = candidate.replace(/,\s*([}\]])/g, '$1').trim()
  const direct = parseJsonSlice(cleaned)
  if (direct !== undefined) return direct

  // Close unclosed string/braces if stream was truncated near the end.
  let inString = false
  let escaped = false
  const stack: string[] = []
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  if (inString) cleaned += '"'
  cleaned = cleaned.replace(/,\s*$/, '')
  while (stack.length) {
    cleaned += stack.pop()
  }
  return parseJsonSlice(cleaned)
}

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
 * directly, extracts balanced slices, and repairs minor trailing truncations.
 */
export function extractJson(text: string): unknown {
  let cleaned = text.replace(/^\uFEFF/, '').trim()

  const fenced = cleaned.match(/```[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/)
  if (fenced && fenced[1] && fenced[1].trim()) cleaned = fenced[1].trim()
  cleaned = cleaned
    .replace(/^```[ \t]*(?:json|JSON)?[ \t]*\r?\n?/, '')
    .replace(/\r?\n?```[ \t]*$/, '')
    .trim()

  const direct = parseJsonSlice(cleaned)
  if (direct !== undefined) return direct

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i]
    if (char !== '{' && char !== '[') continue
    const slice = balancedSlice(cleaned, i)
    if (!slice) continue
    const parsed = parseJsonSlice(slice) ?? repairJson(slice)
    if (parsed !== undefined) return parsed
  }

  const firstBrace = cleaned.search(/[[{]/)
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  if (firstBrace !== -1) {
    const tail = lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned.slice(firstBrace)
    const repaired = repairJson(tail)
    if (repaired !== undefined) return repaired
  }

  throw new AiError(
    'The AI response was incomplete.',
    'Trying another model or click "Use Direct Mode Instantly".',
    { retryable: true },
  )
}

export function fallbackModels(settings: AppSettings): string[] {
  return buildModelChain(settings).slice(1)
}

export async function generateDoc(
  settings: AppSettings,
  source: string,
  brand: BrandPreset,
  onProgress?: StreamProgress,
): Promise<PdfDoc> {
  const mode = detectInputMode(source, settings.inputMode)
  const chain = buildModelChain(settings)
  const text = await callModel({
    provider: settings.provider,
    apiKey: settings.keys[settings.provider],
    model: chain[0] ?? settings.models[settings.provider],
    system: docSystemPrompt(mode),
    user: docUserPrompt({
      source,
      language: settings.language,
      depth: settings.depth,
      includeMcqs: settings.includeMcqs,
      brand,
      docFormat: settings.docFormat,
      inputMode: settings.inputMode,
      autoVisuals: settings.autoVisuals,
    }),
    maxTokens: 12288,
    fallbackModels: chain.slice(1),
    onProgress,
    validateJson: true,
  })
  const doc = normalizeDoc(extractJson(text))
  if (!doc.sections.length) {
    throw new AiError('Could not build sections from that input.', 'Add a bit more detail and try again.')
  }
  return doc
}

export async function generateCarousel(
  settings: AppSettings,
  source: string,
  brand: BrandPreset,
  onProgress?: StreamProgress,
): Promise<Carousel> {
  const chain = buildModelChain(settings)
  const text = await callModel({
    provider: settings.provider,
    apiKey: settings.keys[settings.provider],
    model: chain[0] ?? settings.models[settings.provider],
    system: carouselSystemPrompt(settings.slideFormat),
    user: carouselUserPrompt({
      source,
      language: settings.language,
      slideCount: settings.slideCount,
      brand,
      slideFormat: settings.slideFormat,
      autoVisuals: settings.autoVisuals,
    }),
    maxTokens: 6144,
    fallbackModels: chain.slice(1),
    onProgress,
    validateJson: true,
  })
  const carousel = normalizeCarousel(extractJson(text))
  if (!carousel.slides.length) {
    throw new AiError('Could not build slides from that input.', 'Try a clearer topic or longer brief.')
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
  if (NON_CHAT_PATTERN.test(name)) return 60
  if (PREVIEW_PATTERN.test(name)) return 40
  if (/flash-lite/.test(name)) return 1
  if (/flash/.test(name)) return 0
  if (/(sonnet|haiku)/.test(name)) return 0
  if (/(pro|ultra|opus)/.test(name)) return 20
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
  if (/flash-lite|haiku/.test(name)) return 'Fastest · low cost'
  if (/flash|sonnet/.test(name)) return 'Fast · stable'
  if (/(pro|ultra|opus)/.test(name)) return 'Reasoning · slower'
  return 'Text model'
}

export function pickDefaultModel(models: ModelOption[]): string {
  return models[0]?.id ?? ''
}

interface RawProviderModel {
  name?: string
  id?: string
  display_name?: string
  displayName?: string
  supportedGenerationMethods?: string[]
}

async function fetchRawGeminiModels(apiKey: string, signal?: AbortSignal): Promise<RawProviderModel[]> {
  const raw: RawProviderModel[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 3; page += 1) {
    const url = proxyOn() ? new URL(proxyUrl('/models')) : new URL(`${GEMINI_BASE}/models`)
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url.toString(), {
      headers: proxyOn() ? proxyHeaders() : { 'x-goog-api-key': apiKey },
      signal,
    })
    if (!response.ok) throw await failureMessage(response, 'gemini')
    const data = (await response.json()) as {
      models?: RawProviderModel[]
      nextPageToken?: string
    }
    raw.push(...(data.models ?? []))
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return raw
}

/** Discovers image-capable Gemini/Imagen models available on the user's account. */
export async function listImageModels(apiKey: string): Promise<{ id: string; mode: 'chat' | 'predict' }[]> {
  const cacheKey = proxyOn() ? '__proxy__' : apiKey.trim()
  if (!cacheKey) return []
  if (cachedImageModels && cachedImageModels.key === cacheKey) return cachedImageModels.models

  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 12_000)
    const raw = await fetchRawGeminiModels(apiKey, controller.signal).finally(() => window.clearTimeout(timer))
    const found: { id: string; mode: 'chat' | 'predict' }[] = []
    for (const model of raw) {
      const id = (model.id ?? model.name ?? '').replace(/^models\//, '').trim()
      if (!id) continue
      const methods = model.supportedGenerationMethods ?? []
      if (/imagen/i.test(id) && (methods.includes('predict') || !methods.length)) {
        found.push({ id, mode: 'predict' })
      } else if (/image/i.test(id) && methods.includes('generateContent')) {
        found.push({ id, mode: 'chat' })
      }
    }
    found.sort((a, b) => versionOf(b.id) - versionOf(a.id))
    cachedImageModels = { key: cacheKey, models: found }
    return found
  } catch {
    return []
  }
}

export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelOption[]> {
  if (!apiKey.trim() && !(proxyOn() && provider === 'gemini')) {
    throw new AiError('Add an API key first.', 'The model list is read live from the provider.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  const raw: RawProviderModel[] = []

  try {
    if (provider === 'gemini') {
      raw.push(...(await fetchRawGeminiModels(apiKey, controller.signal)))
    } else {
      const response = await fetch(`${ANTHROPIC_MODELS}?limit=100`, {
        headers: anthropicHeaders(apiKey),
        signal: controller.signal,
      })
      if (!response.ok) throw await failureMessage(response, provider)
      const data = (await response.json()) as { data?: RawProviderModel[]; models?: RawProviderModel[] }
      raw.push(...(data.data ?? data.models ?? []))
    }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (controller.signal.aborted) {
      throw new AiError('Loading the model list timed out.', 'Check your connection, then hit Refresh again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  const models = raw
    .filter((model) => {
      if (provider === 'gemini') {
        const id = (model.id ?? model.name ?? '').toLowerCase()
        return Boolean(model.supportedGenerationMethods?.includes('generateContent')) && !NON_CHAT_PATTERN.test(id)
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

  if (!models.length) throw new AiError('No compatible text models found on this account.')
  if (provider === 'gemini') {
    models[0] = { ...models[0], note: 'Recommended · fastest stable Flash' }
  }
  return models
}
