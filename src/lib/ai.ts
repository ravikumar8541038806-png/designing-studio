import { normalizeCarousel, normalizeDoc } from './normalize'
import { carouselSystemPrompt, carouselUserPrompt, docSystemPrompt, docUserPrompt } from './prompts'
import { providerPreset } from '../theme/presets'
import type { AppSettings, BrandPreset, Carousel, ModelOption, PdfDoc, ProviderId } from '../types'

export class AiError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'AiError'
    this.hint = hint
  }
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const ANTHROPIC_MESSAGES = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODELS = 'https://api.anthropic.com/v1/models'
const ANTHROPIC_VERSION = '2023-06-01'

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required for direct browser calls; the key never leaves this device.
    'anthropic-dangerous-direct-browser-access': 'true',
  }
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
  detail = detail.slice(0, 320)
  const label = providerPreset(provider).name

  if (response.status === 401 || response.status === 403) {
    return new AiError(
      `${label} rejected the API key${detail ? `: ${detail}` : '.'}`,
      'Open API Settings and paste a valid key for this provider.',
    )
  }
  if (response.status === 404) {
    return new AiError(
      `${label} could not find that model${detail ? `: ${detail}` : '.'}`,
      'Refresh the model list in API Settings, or type a model id your key can access.',
    )
  }
  if (response.status === 429) {
    return new AiError(
      `${label} rate limit or quota reached${detail ? `: ${detail}` : '.'}`,
      'Wait a minute, switch model, or check the provider billing dashboard.',
    )
  }
  if (response.status >= 500) {
    return new AiError(`${label} is having trouble (HTTP ${response.status}).`, 'Try again, or switch provider.')
  }
  return new AiError(`${label} request failed (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`)
}

async function callModel(options: {
  provider: ProviderId
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens?: number
}): Promise<string> {
  const { provider, apiKey, model, system, user } = options
  if (!apiKey.trim()) {
    throw new AiError('No API key saved for this provider.', 'Add your key in API Settings — it stays in this browser.')
  }
  if (!model.trim()) {
    throw new AiError('No model selected.', 'Pick a model in API Settings.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 180_000)

  try {
    let response: Response
    if (provider === 'gemini') {
      response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { role: 'system', parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: options.maxTokens ?? 8192,
            responseMimeType: 'application/json',
          },
        }),
      })
    } else {
      response = await fetch(ANTHROPIC_MESSAGES, {
        method: 'POST',
        signal: controller.signal,
        headers: anthropicHeaders(apiKey),
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 8192,
          temperature: 0.65,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      })
    }

    if (!response.ok) throw await failureMessage(response, provider)

    const data = (await response.json()) as Record<string, unknown>
    let text = ''

    if (provider === 'gemini') {
      const candidates = data.candidates as
        | { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
        | undefined
      const parts = candidates?.[0]?.content?.parts
      text = (parts ?? []).map((part) => part.text ?? '').join('')
      if (!text) {
        const blocked = (data.promptFeedback as { blockReason?: string } | undefined)?.blockReason
        if (blocked) throw new AiError(`Gemini blocked the response (${blocked}).`, 'Adjust the source text and retry.')
      }
    } else {
      const content = data.content as { type?: string; text?: string }[] | undefined
      text = (content ?? []).map((part) => part.text ?? '').join('')
    }

    if (!text.trim()) {
      throw new AiError('The model returned an empty response.', 'Try again, or switch to another model.')
    }
    return text
  } catch (error) {
    if (error instanceof AiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AiError('The request timed out after 3 minutes.', 'Try a faster model, or shorten the source material.')
    }
    throw new AiError(
      'Could not reach the provider from this browser.',
      'This is usually a network or CORS problem. Check your connection, then try again.',
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json)?/gi, '')
    .trim()
  const start = cleaned.indexOf('{')
  if (start === -1) throw new AiError('The model did not return JSON.', 'Try again — a retry usually fixes this.')
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const slice = cleaned.slice(start, i + 1)
        try {
          return JSON.parse(slice)
        } catch {
          break
        }
      }
    }
  }
  try {
    return JSON.parse(cleaned.slice(start))
  } catch {
    throw new AiError(
      'The model returned malformed JSON.',
      'Generate again, or switch to a stronger model in API Settings.',
    )
  }
}

export async function generateDoc(
  settings: AppSettings,
  source: string,
  brand: BrandPreset,
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

export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelOption[]> {
  if (!apiKey.trim()) {
    throw new AiError('Add an API key first.', 'The model list is read live from the provider.')
  }
  let response: Response
  if (provider === 'gemini') {
    response = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
    })
  } else {
    response = await fetch(`${ANTHROPIC_MODELS}?limit=100`, { headers: anthropicHeaders(apiKey) })
  }
  if (!response.ok) throw await failureMessage(response, provider)
  const data = (await response.json()) as {
    models?: { name?: string; id?: string; display_name?: string; displayName?: string; supportedGenerationMethods?: string[] }[]
  }
  const models = (data.models ?? [])
    .filter((model) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
    .map((model) => {
      const raw = model.id ?? model.name ?? ''
      const id = raw.replace(/^models\//, '')
      return { id, label: modelLabel(id, model.displayName ?? model.display_name), note: 'Live from provider' }
    })
    .filter((model) => model.id)
  models.sort((a, b) => a.id.localeCompare(b.id))
  if (!models.length) throw new AiError('The provider returned no usable text models.')
  return models
}
