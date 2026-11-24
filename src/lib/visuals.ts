import { callModel, extractJson, fallbackModels } from './ai'
import { createChartBlock, parseSeries } from './blocks'
import { blockFromPreset, normalizeDiagram, presetForPrompt } from './diagrams'
import { uid } from './id'
import type { AppSettings, ChartKind, DiagramKind, DocBlock, PdfDoc } from '../types'

export class VisualError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'VisualError'
    this.hint = hint
  }
}

export function hasAi(settings: AppSettings): boolean {
  return (
    !settings.directMode &&
    Boolean(settings.keys[settings.provider]?.trim()) &&
    Boolean(settings.models[settings.provider])
  )
}

async function ask(settings: AppSettings, system: string, user: string, maxTokens = 2048): Promise<unknown> {
  const text = await callModel({
    provider: settings.provider,
    apiKey: settings.keys[settings.provider],
    model: settings.models[settings.provider],
    system,
    user,
    maxTokens,
    fallbackModels: fallbackModels(settings),
  })
  return extractJson(text)
}

const SYSTEM_PRINT =
  'You are a senior textbook illustrator and print designer. You answer with a single valid JSON object only — no markdown, no code fences, no prose.'

function docContext(doc?: PdfDoc): string {
  if (!doc) return ''
  const sections = doc.sections
    .slice(0, 6)
    .map((section) => `- ${section.heading}: ${section.blocks.map((block) => ('text' in block ? block.text : '')).join(' ').slice(0, 240)}`)
    .join('\n')
  return `\nDOCUMENT: ${doc.title} (${doc.eyebrow})\nSECTIONS:\n${sections}`
}

/* ------------------------------------------------------------------------- */
/* Diagrams                                                                    */
/* ------------------------------------------------------------------------- */

export function localDiagram(prompt: string, kind: DiagramKind, title?: string): DocBlock {
  const preset = presetForPrompt(prompt, kind)
  if (preset) return blockFromPreset(preset, title)
  const steps = prompt
    .split(/[,.;\n]|\s(?:then|→|->|leads to|followed by)\s/i)
    .map((step) => step.replace(/^(?:a|an|the)\s+/i, '').trim())
    .filter((step) => step.length > 2 && step.length < 64)
    .slice(0, 5)
  const labels = steps.length >= 2 ? steps : [title || 'Input', 'Process', 'Output']
  return {
    id: uid('dia'),
    type: 'diagram',
    diagram: kind,
    title: title || prompt.slice(0, 60) || 'Diagram',
    caption: 'Schematic — edit any label in place',
    nodes: labels.map((label) => ({ id: uid('n'), label: label.charAt(0).toUpperCase() + label.slice(1) })),
    edges: labels.slice(1).map((_, index) => ({ from: `local-${index}`, to: `local-${index + 1}` })),
    accent: '',
  }
}

/** Links local preset edges by index when node ids are regenerated. */
function linkSequential(block: DocBlock): DocBlock {
  if (block.type !== 'diagram') return block
  const ids = block.nodes.map((node) => node.id)
  return {
    ...block,
    edges: block.edges
      .map((edge) => {
        const fromIndex = Number(edge.from.replace('local-', ''))
        const toIndex = Number(edge.to.replace('local-', ''))
        const from = ids[fromIndex]
        const to = ids[toIndex]
        return from && to ? { ...edge, from, to } : edge
      })
      .filter((edge) => ids.includes(edge.from) && ids.includes(edge.to)),
  }
}

export async function generateDiagram(
  settings: AppSettings,
  prompt: string,
  kind: DiagramKind,
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: linkSequential(localDiagram(prompt, kind)), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Create a print-ready ${kind} diagram about: "${prompt}".
Return JSON:
{
  "title": "short figure title",
  "caption": "Fig 1.1: one-line source or note",
  "diagram": "${kind}",
  "nodes": [{"id":"n1","label":"max 5 words","detail":"optional 3 words","shape":"box|pill|ellipse|diamond|circle|note","x":0-100,"y":0-100,"w":percent,"h":percent}],
  "edges": [{"from":"n1","to":"n2","label":"max 4 words, optional","dashed":false}]
}
Rules:
- 4 to 10 nodes, every label a crisp anatomy/process term a student must learn.
- ${kind === 'labeled' ? 'Place nodes like a textbook figure using x/y percentages (5-95) and w/h in percent. Give the core structure shapes, not floating text.' : 'Do not use x/y; the layout engine lays these out.'}
- ${kind === 'flow' ? 'A linear process: one arrow per consecutive step, 4-7 nodes.' : kind === 'cycle' ? 'A closed loop: the last edge returns to the first node.' : 'Central concept first, then 4-6 branches connected to it.'}
- Every label must be specific to the requested subject (e.g. "Left ventricle", "MPC repo rate", "Ray through F"), never generic.
${docContext()}`,
      2600,
    )
    const normalized = normalizeDiagram(raw, kind)
    if (normalized) return { block: normalized, local: false }
    throw new VisualError('The model returned an unusable diagram.')
  } catch {
    return { block: linkSequential(localDiagram(prompt, kind)), local: true }
  }
}

/* ------------------------------------------------------------------------- */
/* Tables, callouts and step lists (used by 1-click suggestions)               */
/* ------------------------------------------------------------------------- */

function sectionText(doc: PdfDoc | undefined, sectionId: string): string {
  const section = doc?.sections.find((entry) => entry.id === sectionId)
  if (!section) return ''
  return section.blocks
    .map((block) => ('text' in block ? block.text : block.type === 'keyterms' ? block.items.map((item) => `${item.term}: ${item.definition}`).join(' ') : ''))
    .join(' ')
}

function sectionTerms(doc: PdfDoc | undefined, sectionId: string): { term: string; definition: string }[] {
  const section = doc?.sections.find((entry) => entry.id === sectionId)
  if (!section) return []
  const terms = section.blocks.flatMap((block) => (block.type === 'keyterms' ? block.items : []))
  if (terms.length >= 2) return terms.slice(0, 2)
  const matches = sectionText(doc, sectionId).matchAll(/([A-Z][A-Za-z]{3,18})\s*(?:—|–|-|:)\s*([^.;]{12,90})/g)
  return Array.from(matches)
    .slice(0, 2)
    .map((match) => ({ term: match[1], definition: match[2].trim() }))
}

export function localTable(prompt: string, doc?: PdfDoc, sectionId = ''): DocBlock {
  const terms = sectionTerms(doc, sectionId)
  if (terms.length >= 2) {
    return {
      id: uid('b'),
      type: 'table',
      caption: `${terms[0].term} vs ${terms[1].term}`,
      columns: ['Basis', terms[0].term, terms[1].term],
      rows: [
        ['Meaning', terms[0].definition, terms[1].definition],
        ['Exam use', 'Define and distinguish from the other term.', 'Define and distinguish from the other term.'],
      ],
    }
  }
  const sentences = sectionText(doc, sectionId)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length > 20)
    .slice(0, 3)
  return {
    id: uid('b'),
    type: 'table',
    caption: prompt.slice(0, 60),
    columns: ['Point', 'What to remember'],
    rows: (sentences.length ? sentences : ['Add the comparison here.']).map((sentence, index) => [
      `Point ${index + 1}`,
      sentence.slice(0, 140),
    ]),
  }
}

export async function generateTable(
  settings: AppSettings,
  prompt: string,
  doc?: PdfDoc,
  sectionId = '',
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localTable(prompt, doc, sectionId), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Create a print-ready comparison table for: "${prompt}".
Return JSON: {"caption":"...","columns":["Basis","A","B"],"rows":[["...","...","..."]]}
Rules: 2 to 4 columns, 3 to 5 rows, short cells (max 8 words each), factually accurate for the subject.${docContext(doc)}`
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const columns = (Array.isArray(record.columns) ? record.columns : []).map((column) => String(column)).slice(0, 4)
    const rows = (Array.isArray(record.rows) ? record.rows : [])
      .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell)).slice(0, columns.length) : []))
      .filter((row) => row.some(Boolean))
      .slice(0, 6)
    if (columns.length < 2 || !rows.length) throw new VisualError('No table returned.')
    return {
      block: {
        id: uid('b'),
        type: 'table',
        caption: String(record.caption ?? prompt).slice(0, 90),
        columns,
        rows: rows.map((row) => {
          const next = [...row]
          while (next.length < columns.length) next.push('')
          return next
        }),
      },
      local: false,
    }
  } catch {
    return { block: localTable(prompt, doc, sectionId), local: true }
  }
}

export function localMnemonic(prompt: string, doc?: PdfDoc, sectionId = ''): DocBlock {
  const terms = doc?.sections.find((section) => section.id === sectionId)?.blocks.flatMap((block) => (block.type === 'keyterms' ? block.items : [])) ?? []
  const letters = terms.slice(0, 5).map((item) => item.term.charAt(0).toUpperCase()).join('')
  const body = terms.length
    ? `${letters || 'KEY'} — ${terms.slice(0, 5).map((item) => `${item.term.charAt(0).toUpperCase()} is ${item.term}`).join('; ')}.`
    : `Remember the sequence in ${prompt.slice(0, 50)} as one short phrase, then unpack each letter.`
  return {
    id: uid('co'),
    type: 'callout',
    kind: 'tip',
    icon: 'bulb',
    accent: '',
    title: letters ? `Mnemonic · ${letters}` : 'Memory trick',
    body,
  }
}

export async function generateCallout(
  settings: AppSettings,
  prompt: string,
  preset: 'exam' | 'tip' | 'summary' | 'warning' = 'exam',
  doc?: PdfDoc,
  sectionId = '',
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localMnemonic(prompt, doc, sectionId), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Write a high-value "${preset}" study callout for: "${prompt}".
Return JSON: {"title":"max 6 words","body":"2 to 3 sentences, specific facts, no filler"}
It must be something a student can quote in an exam.${docContext(doc)}`
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const title = String(record.title ?? '').trim()
    const body = String(record.body ?? '').trim()
    if (!title || !body) throw new VisualError('No callout returned.')
    return {
      block: {
        id: uid('co'),
        type: 'callout',
        kind: preset,
        icon: preset === 'warning' ? 'alert' : preset === 'tip' ? 'bulb' : preset === 'summary' ? 'check' : 'spark',
        accent: '',
        title,
        body,
      },
      local: false,
    }
  } catch {
    return { block: localMnemonic(prompt, doc, sectionId), local: true }
  }
}

export function localSteps(prompt: string, doc?: PdfDoc, sectionId = ''): DocBlock {
  const sentences = sectionText(doc, sectionId)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 18)
    .slice(0, 5)
  const items = sentences.length >= 2 ? sentences : [prompt, 'Second step', 'Third step']
  return {
    id: uid('b'),
    type: 'numbered',
    items: items.map((item) => item.slice(0, 160)),
  }
}

export async function generateSteps(
  settings: AppSettings,
  prompt: string,
  doc?: PdfDoc,
  sectionId = '',
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localSteps(prompt, doc, sectionId), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Turn this dense explanation into a clean numbered process: "${prompt}".
Return JSON: {"items":["step 1","step 2"]} with 3 to 5 steps, each max 22 words, verb-first.${docContext(doc)}`
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const items = (Array.isArray(record.items) ? record.items : []).map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    if (items.length < 2) throw new VisualError('No steps returned.')
    return { block: { id: uid('b'), type: 'numbered', items }, local: false }
  } catch {
    return { block: localSteps(prompt, doc, sectionId), local: true }
  }
}

/* ------------------------------------------------------------------------- */
/* Charts                                                                      */
/* ------------------------------------------------------------------------- */

export function localChart(prompt: string, source = '', chart: ChartKind = 'bar'): DocBlock {
  const text = `${prompt}\n${source}`
  const labels: string[] = []
  const values: number[] = []
  // Accepts "Q1 5.1", "Road: 42", "rail 27" and comma- or semicolon-separated briefs.
  text.split(/[,;\n]+/).forEach((fragment) => {
    const match = fragment.trim().match(/^(.*?)(-?\d+(?:\.\d+)?)\s*%?$/)
    if (!match) return
    const value = Number(match[2])
    if (!Number.isFinite(value)) return
    let label = match[1]
      .trim()
      .replace(/[:=–—-]\s*$/, '')
      .replace(/^.*:\s*/, '')
      .split(/\s+/)
      .slice(-3)
      .join(' ')
    if (!label || /^(by|in|for|of)$/i.test(label)) label = `Item ${labels.length + 1}`
    labels.push(label)
    values.push(value)
  })
  if (labels.length < 2) {
    const block = createChartBlock()
    return { ...block, chart, title: prompt.slice(0, 70) || block.title }
  }
  const block = createChartBlock()
  return {
    ...block,
    chart,
    title: prompt.slice(0, 70) || block.title,
    labels: labels.slice(0, 6),
    values: values.slice(0, 6),
  }
}

export async function generateChart(
  settings: AppSettings,
  prompt: string,
  chart: ChartKind,
  source = '',
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localChart(prompt, source, chart), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Build a publication-quality "${chart}" chart for: "${prompt}".
Return JSON: {"title":"short chart title","labels":["..."],"values":[12,34],"values2":[10,28],"note":"one line takeaway"}
Rules: 3 to 6 labels, short (max 3 words). values are plain numbers, realistic for the subject. Include values2 only for a comparison chart.`
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const labels = Array.isArray(record.labels) ? record.labels.map((label) => String(label)).slice(0, 6) : []
    const values = Array.isArray(record.values)
      ? record.values.map((value) => Number(value)).filter((value) => Number.isFinite(value)).slice(0, 6)
      : []
    if (labels.length < 2 || values.length < 2) throw new VisualError('The model returned no usable data.')
    const values2 = Array.isArray(record.values2)
      ? record.values2.map((value) => Number(value)).filter((value) => Number.isFinite(value)).slice(0, 6)
      : undefined
    return {
      block: {
        id: uid('chart'),
        type: 'chart',
        chart,
        title: String(record.title ?? prompt).slice(0, 80),
        labels,
        values,
        values2,
        accent: '',
        accent2: '',
      },
      local: false,
    }
  } catch {
    return { block: localChart(prompt, source, chart), local: true }
  }
}

export function chartFromSeries(text: string, chart: ChartKind, title: string): DocBlock {
  const matrix = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s*[|,;]\s*/))
  // "Label | 42" is one series; "Label | 42 | 31" also carries series B.
  const piped = matrix.every((row) => row.length >= 2)
  const parsed = parseSeries(text)
  const labels = piped ? matrix.map((row) => row[0]) : parsed.labels
  const values = piped ? matrix.map((row) => Number(row[1]) || 0) : parsed.values
  const withSecond = matrix.some((row) => row.length >= 3)
  const values2 = withSecond && piped ? matrix.map((row) => Number(row[2]) || 0) : undefined
  return {
    id: uid('chart'),
    type: 'chart',
    chart,
    title,
    labels: labels.slice(0, 8),
    values: values.slice(0, 8),
    values2: values2?.slice(0, 8),
    accent: '',
    accent2: '',
  }
}

/* ------------------------------------------------------------------------- */
/* Formulas                                                                    */
/* ------------------------------------------------------------------------- */

const FORMULA_LIBRARY: { keywords: RegExp; items: { label: string; latex: string }[] }[] = [
  {
    keywords: /physic|motion|force|optic|lens|mirror|electric|current|circuit|energy/i,
    items: [
      { label: 'Equations of motion', latex: 'v = u + at,\\quad s = ut + \\tfrac{1}{2}at^{2},\\quad v^{2} = u^{2} + 2as' },
      { label: "Newton's second law", latex: 'F = ma = \\frac{dp}{dt}' },
      { label: "Ohm's law", latex: 'V = IR,\\quad P = VI = I^{2}R' },
      { label: 'Lens / mirror', latex: '\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u},\\quad m = \\frac{v}{u}' },
      { label: 'Kinetic energy', latex: 'K = \\tfrac{1}{2}mv^{2},\\quad U = mgh' },
    ],
  },
  {
    keywords: /econom|gdp|inflation|demand|supply|elastic|monetary|bank|tax|market/i,
    items: [
      { label: 'GDP (expenditure)', latex: 'Y = C + I + G + (X - M)' },
      { label: 'Inflation (CPI)', latex: '\\pi_{t} = \\frac{CPI_{t} - CPI_{t-1}}{CPI_{t-1}} \\times 100' },
      { label: 'Price elasticity', latex: 'E_{d} = \\left|\\frac{\\%\\Delta Q_{d}}{\\%\\Delta P}\\right|' },
      { label: 'Money multiplier', latex: 'm = \\frac{1}{CRR + SLR + \\text{excess reserves}}' },
      { label: 'Quantity theory', latex: 'MV = PT' },
    ],
  },
  {
    keywords: /biolog|photosynth|respiration|genetic|cell|enzyme|population/i,
    items: [
      { label: 'Photosynthesis', latex: '6CO_{2} + 6H_{2}O \\xrightarrow{light} C_{6}H_{12}O_{6} + 6O_{2}' },
      { label: 'Aerobic respiration', latex: 'C_{6}H_{12}O_{6} + 6O_{2} \\rightarrow 6CO_{2} + 6H_{2}O + 38ATP' },
      { label: 'Hardy–Weinberg', latex: 'p^{2} + 2pq + q^{2} = 1' },
      { label: 'Growth rate', latex: 'r = \\frac{\\Delta N}{N\\,\\Delta t}' },
    ],
  },
  {
    keywords: /business|finance|roi|profit|break|interest|loan|investment|startup/i,
    items: [
      { label: 'Return on investment', latex: 'ROI = \\frac{\\text{Net profit}}{\\text{Cost of investment}} \\times 100' },
      { label: 'Break-even units', latex: 'Q^{*} = \\frac{F}{P - V}' },
      { label: 'Compound interest', latex: 'A = P\\left(1 + \\frac{r}{n}\\right)^{nt}' },
      { label: 'CAGR', latex: 'CAGR = \\left(\\frac{V_{f}}{V_{i}}\\right)^{1/n} - 1' },
    ],
  },
  {
    keywords: /math|algebra|calculus|quadratic|probabilit|statistic/i,
    items: [
      { label: 'Quadratic roots', latex: 'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}' },
      { label: 'Derivative rule', latex: '\\frac{d}{dx}x^{n} = nx^{n-1}' },
      { label: 'Probability', latex: 'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)' },
      { label: 'Mean', latex: '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_{i}' },
    ],
  },
]

export function localFormula(prompt: string, layout: 'card' | 'sheet'): DocBlock {
  const found = FORMULA_LIBRARY.find((entry) => entry.keywords.test(prompt))
  const items = (found?.items ?? FORMULA_LIBRARY[0].items).map((item) => ({ id: uid('f'), ...item }))
  return {
    id: uid('math'),
    type: 'math',
    title: prompt.slice(0, 70) || 'Formula sheet',
    latex: items[0]?.latex ?? 'E = mc^{2}',
    note: 'Edit any formula in the Visual Studio.',
    layout,
    items,
  }
}

export async function generateFormula(
  settings: AppSettings,
  prompt: string,
  layout: 'card' | 'sheet',
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localFormula(prompt, layout), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Write textbook-grade LaTeX for: "${prompt}". Target the Indian exam / business audience.
Return JSON: {"title":"short heading","items":[{"label":"what it means","latex":"..."}],"note":"one-line usage tip"}
Rules: 1 to 6 items. Raw LaTeX only, no $ delimiters, no markdown. Use \\frac, \\times, subscripts and Greek letters correctly.`
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const items = (Array.isArray(record.items) ? record.items : [])
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const item = entry as Record<string, unknown>
        const latex = String(item.latex ?? '').trim()
        if (!latex) return null
        return { id: uid('f'), label: String(item.label ?? '').trim(), latex }
      })
      .filter((item): item is { id: string; label: string; latex: string } => Boolean(item))
      .slice(0, 6)
    if (!items.length) throw new VisualError('The model returned no formula.')
    return {
      block: {
        id: uid('math'),
        type: 'math',
        title: String(record.title ?? prompt).slice(0, 80),
        latex: items[0].latex,
        note: String(record.note ?? '').trim(),
        layout,
        items,
      },
      local: false,
    }
  } catch {
    return { block: localFormula(prompt, layout), local: true }
  }
}

/* ------------------------------------------------------------------------- */
/* AI images (Gemini image models only)                                        */
/* ------------------------------------------------------------------------- */

const IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation']

export async function generateAiImage(settings: AppSettings, prompt: string): Promise<string> {
  const apiKey = settings.keys.gemini?.trim()
  if (!apiKey) {
    throw new VisualError(
      'Image generation needs a Gemini API key.',
      'Add your Gemini key in API Settings. Anthropic keys cannot generate images.',
    )
  }
  let lastError = ''
  for (const model of IMAGE_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      )
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
      }
      const part = data.candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData?.data)
      if (part?.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
      }
      lastError = 'no image returned'
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'network error'
    }
  }
  throw new VisualError(
    `Gemini could not generate that image${lastError ? ` (${lastError})` : ''}.`,
    'Try a simpler prompt, or use the upload tab instead.',
  )
}

/* ------------------------------------------------------------------------- */
/* Image helpers                                                               */
/* ------------------------------------------------------------------------- */

export async function readImageFile(file: File, limit = 1400): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('unreadable'))
    reader.readAsDataURL(file)
  })
  const image = new Image()
  await new Promise<void>((resolve) => {
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = raw
  })
  if (!image.width || image.width <= limit) return raw
  const scale = limit / image.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return raw
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}
