import { buildModelChain, callModel, extractJson, listImageModels } from './ai'
import { createChartBlock, createStatsBlock, parseSeries } from './blocks'
import { blockFromPreset, labeledFigureBlock, normalizeDiagram, presetForPrompt } from './diagrams'
import { uid } from './id'
import { visualStylePreset } from '../theme/presets'
import { proxyHeaders, proxyOn, proxyUrl } from './proxy'
import type {
  AppSettings,
  AspectRatioId,
  ChartKind,
  DiagramKind,
  DocBlock,
  PdfDoc,
  StatMetric,
  VisualStyleId,
} from '../types'

export class VisualError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'VisualError'
    this.hint = hint
  }
}

export function hasAi(settings: AppSettings): boolean {
  const credential = Boolean(settings.keys[settings.provider]?.trim()) || (proxyOn() && settings.provider === 'gemini')
  return !settings.directMode && credential && (settings.autoModel || Boolean(settings.models[settings.provider]))
}

export function hasGeminiImages(settings: AppSettings): boolean {
  return Boolean(settings.keys.gemini?.trim()) || proxyOn()
}

async function ask(settings: AppSettings, system: string, user: string, maxTokens = 2400): Promise<unknown> {
  const chain = buildModelChain(settings)
  const text = await callModel({
    provider: settings.provider,
    apiKey: settings.keys[settings.provider],
    model: chain[0] ?? settings.models[settings.provider],
    system,
    user,
    maxTokens,
    fallbackModels: chain.slice(1),
    validateJson: true,
  })
  return extractJson(text)
}

const SYSTEM_PRINT =
  'You are a senior editorial illustrator, data journalist, and publication designer. You answer with a single valid JSON object only — no markdown, no code fences, no prose.'

function docContext(doc?: PdfDoc): string {
  if (!doc) return ''
  const sections = doc.sections
    .slice(0, 6)
    .map(
      (section) =>
        `- ${section.heading}: ${section.blocks
          .map((block) => ('text' in block ? block.text : ''))
          .join(' ')
          .slice(0, 220)}`,
    )
    .join('\n')
  return `\nDOCUMENT: ${doc.title} (${doc.eyebrow})\nSECTIONS:\n${sections}`
}

/* ------------------------------------------------------------------------- */
/* Diagrams (clean vector flows, cycles, mindmaps & real-image figures)       */
/* ------------------------------------------------------------------------- */

export function localDiagram(prompt: string, kind: DiagramKind, title?: string): DocBlock {
  const preset = presetForPrompt(prompt, kind)
  if (preset) return blockFromPreset(preset, title)

  const steps = prompt
    .split(/[,.;\n]|\s(?:and|with|then|→|->|leads to|followed by)\s/i)
    .map((step) => step.replace(/^(?:a|an|the)\s+/i, '').trim())
    .filter((step) => step.length > 2 && step.length < 64)
    .slice(0, 6)
  const subject = (title || prompt).slice(0, 60) || 'Process Diagram'
  const effectiveKind: DiagramKind =
    kind === 'figure' || kind === 'schematic' || kind === 'labeled' ? 'mindmap' : kind
  const labels = steps.length >= 2 ? steps : [subject, 'Core Drivers', 'Key Mechanisms', 'Outcomes']

  const nodes = labels.map((label) => ({
    id: uid('n'),
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }))

  const edges =
    effectiveKind === 'mindmap'
      ? nodes.slice(1).map((node) => ({ from: nodes[0].id, to: node.id }))
      : effectiveKind === 'cycle'
        ? nodes.map((node, index) => ({ from: node.id, to: nodes[(index + 1) % nodes.length].id }))
        : nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }))

  return {
    id: uid('dia'),
    type: 'diagram',
    diagram: effectiveKind,
    title: subject,
    caption: `${effectiveKind === 'cycle' ? 'Feedback cycle' : effectiveKind === 'mindmap' ? 'Concept map' : 'Process flow'} — edit labels directly`,
    nodes,
    edges,
    accent: '',
  }
}

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
  if (kind === 'figure') return generateFigure(settings, prompt)
  if (!hasAi(settings)) return { block: linkSequential(localDiagram(prompt, kind)), local: true }
  const vectorKind = kind === 'schematic' || kind === 'labeled' ? 'mindmap' : kind
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Create a crisp print-ready ${vectorKind} diagram about: "${prompt}".
Return JSON:
{
  "title": "short figure title",
  "caption": "Fig: one-line explanatory note",
  "diagram": "${vectorKind}",
  "nodes": [{"id":"n1","label":"max 5 words","detail":"optional 3 words","shape":"box|pill|ellipse|diamond|circle"}],
  "edges": [{"from":"n1","to":"n2","label":"max 4 words, optional","dashed":false}]
}
Rules:
- 4 to 7 nodes, every label a specific, insightful term for the requested topic.
- Do not include x/y coordinates; the layout engine arranges flows, cycles, and mindmaps cleanly.
- ${vectorKind === 'flow' ? 'Linear sequence: connect each step to the next.' : vectorKind === 'cycle' ? 'Closed feedback loop: the final edge connects back to the first node.' : 'Central topic as node 1, with 4-6 branches radiating from it.'}`,
      2200,
    )
    const normalized = normalizeDiagram(raw, vectorKind)
    if (normalized) return { block: normalized, local: false }
    throw new VisualError('The model returned an unusable diagram.')
  } catch {
    return { block: linkSequential(localDiagram(prompt, kind)), local: true }
  }
}

/* ------------------------------------------------------------------------- */
/* Tables, callouts, stats and step lists                                     */
/* ------------------------------------------------------------------------- */

function sectionText(doc: PdfDoc | undefined, sectionId: string): string {
  const section = doc?.sections.find((entry) => entry.id === sectionId)
  if (!section) return ''
  return section.blocks
    .map((block) =>
      'text' in block
        ? block.text
        : block.type === 'keyterms'
          ? block.items.map((item) => `${item.term}: ${item.definition}`).join(' ')
          : '',
    )
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
      columns: ['Dimension', terms[0].term, terms[1].term],
      rows: [
        ['Definition', terms[0].definition, terms[1].definition],
        ['Key takeaway', 'Primary focus area', 'Complementary concept'],
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
    columns: ['Point', 'Key Detail'],
    rows: (sentences.length ? sentences : ['Add comparison rows here.']).map((sentence, index) => [
      `Item ${index + 1}`,
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
Return JSON: {"caption":"...","columns":["Dimension","A","B"],"rows":[["...","...","..."]]}
Rules: 2 to 4 columns, 3 to 5 rows, short crisp cells (max 9 words each), factually accurate.${docContext(doc)}`,
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
  const terms =
    doc?.sections
      .find((section) => section.id === sectionId)
      ?.blocks.flatMap((block) => (block.type === 'keyterms' ? block.items : [])) ?? []
  const letters = terms
    .slice(0, 5)
    .map((item) => item.term.charAt(0).toUpperCase())
    .join('')
  const body = terms.length
    ? `${letters || 'KEY'} — ${terms
        .slice(0, 5)
        .map((item) => `${item.term.charAt(0).toUpperCase()} is ${item.term}`)
        .join('; ')}.`
    : `Summarise the core idea of ${prompt.slice(0, 50)} in one memorable takeaway.`
  return {
    id: uid('co'),
    type: 'callout',
    kind: 'tip',
    icon: 'bulb',
    accent: '',
    title: letters ? `Key Takeaway · ${letters}` : 'Key Takeaway',
    body,
  }
}

export async function generateCallout(
  settings: AppSettings,
  prompt: string,
  preset: 'exam' | 'tip' | 'summary' | 'warning' = 'tip',
  doc?: PdfDoc,
  sectionId = '',
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localMnemonic(prompt, doc, sectionId), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Write a high-value "${preset}" editorial callout for: "${prompt}".
Return JSON: {"title":"max 6 words","body":"2 to 3 sentences, specific insights, zero filler"}${docContext(doc)}`,
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
  const items = sentences.length >= 2 ? sentences : [prompt, 'Define the key drivers', 'Execute and measure']
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
      `Turn this explanation into a clean numbered action sequence: "${prompt}".
Return JSON: {"items":["step 1","step 2"]} with 3 to 5 steps, each max 22 words, verb-first.${docContext(doc)}`,
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const items = (Array.isArray(record.items) ? record.items : [])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 5)
    if (items.length < 2) throw new VisualError('No steps returned.')
    return { block: { id: uid('b'), type: 'numbered', items }, local: false }
  } catch {
    return { block: localSteps(prompt, doc, sectionId), local: true }
  }
}

/* ------------------------------------------------------------------------- */
/* KPI / Infographic Stat Cards                                               */
/* ------------------------------------------------------------------------- */

export function localStats(prompt: string): DocBlock {
  if (/climate|warming|carbon|co2|emission|glacier|energy|ocean/i.test(prompt)) {
    return {
      id: uid('stats'),
      type: 'stats',
      title: 'Global Climate Indicators',
      items: [
        { id: uid('st'), value: '+1.45°C', label: 'Warming above pre-industrial', delta: '2024 Record' },
        { id: uid('st'), value: '424 ppm', label: 'Atmospheric CO₂ level', delta: '↑ +2.8 ppm/yr' },
        { id: uid('st'), value: '30%+', label: 'Global clean electricity share', delta: 'Solar & Wind' },
      ],
    }
  }
  const base = createStatsBlock()
  return {
    ...base,
    title: prompt.slice(0, 60) || base.title,
  }
}

export async function generateStats(
  settings: AppSettings,
  prompt: string,
  doc?: PdfDoc,
): Promise<{ block: DocBlock; local: boolean }> {
  if (!hasAi(settings)) return { block: localStats(prompt), local: true }
  try {
    const raw = await ask(
      settings,
      SYSTEM_PRINT,
      `Create 3 or 4 publication-grade KPI / infographic stat cards for: "${prompt}".
Return JSON: {"title":"2 to 5 words","items":[{"value":"e.g. +1.45°C or 424 ppm or $2.4B","label":"3 to 5 word metric label","delta":"short trend badge e.g. +12% YoY"}]}
Rules: Accurate, realistic figures for the subject. Keep values punchy (max 10 chars).${docContext(doc)}`,
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const items: StatMetric[] = (Array.isArray(record.items) ? record.items : [])
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const item = entry as Record<string, unknown>
        const value = String(item.value ?? '').trim()
        const label = String(item.label ?? '').trim()
        if (!value || !label) return null
        const delta = String(item.delta ?? '').trim()
        return { id: uid('st'), value: value.slice(0, 22), label: label.slice(0, 52), ...(delta ? { delta: delta.slice(0, 26) } : {}) }
      })
      .filter((entry): entry is StatMetric => Boolean(entry))
      .slice(0, 4)
    if (!items.length) throw new VisualError('No stats returned.')
    return {
      block: {
        id: uid('stats'),
        type: 'stats',
        title: String(record.title ?? prompt).slice(0, 70) || 'Key Figures',
        items,
      },
      local: false,
    }
  } catch {
    return { block: localStats(prompt), local: true }
  }
}

/* ------------------------------------------------------------------------- */
/* Charts (2D & 3D data visualizations)                                       */
/* ------------------------------------------------------------------------- */

export function localChart(prompt: string, source = '', chart: ChartKind = 'bar'): DocBlock {
  const text = `${prompt}\n${source}`
  const labels: string[] = []
  const values: number[] = []
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
  const block = createChartBlock()
  if (labels.length < 2) {
    return { ...block, chart, title: prompt.slice(0, 70) || block.title }
  }
  return {
    ...block,
    chart,
    title: prompt.slice(0, 70) || block.title,
    labels: labels.slice(0, 6),
    values: values.slice(0, 6),
    unit: /%/.test(prompt) ? '%' : '',
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
Return JSON: {"title":"short chart title","labels":["..."],"values":[12,34],"values2":[10,28],"unit":"e.g. % or °C or $M or empty","seriesA":"label A","seriesB":"label B","note":"one line takeaway"}
Rules: 3 to 7 labels, short (max 3 words). values are plain numbers, realistic for the subject. Include values2 only for a comparison chart.`,
    )
    const record = (raw ?? {}) as Record<string, unknown>
    const labels = Array.isArray(record.labels) ? record.labels.map((label) => String(label)).slice(0, 7) : []
    const values = Array.isArray(record.values)
      ? record.values.map((value) => Number(value)).filter((value) => Number.isFinite(value)).slice(0, 7)
      : []
    if (labels.length < 2 || values.length < 2) throw new VisualError('The model returned no usable data.')
    const count = Math.min(labels.length, values.length)
    const values2 = Array.isArray(record.values2)
      ? record.values2.map((value) => Number(value)).filter((value) => Number.isFinite(value)).slice(0, count)
      : undefined
    return {
      block: {
        id: uid('chart'),
        type: 'chart',
        chart,
        title: String(record.title ?? prompt).slice(0, 80),
        labels: labels.slice(0, count),
        values: values.slice(0, count),
        ...(values2 && values2.length ? { values2 } : {}),
        accent: '',
        accent2: '',
        unit: record.unit ? String(record.unit).trim().slice(0, 10) : '',
        seriesA: record.seriesA ? String(record.seriesA).trim().slice(0, 24) : undefined,
        seriesB: record.seriesB ? String(record.seriesB).trim().slice(0, 24) : undefined,
        note: record.note ? String(record.note).trim().slice(0, 120) : undefined,
      },
      local: false,
    }
  } catch {
    return { block: localChart(prompt, source, chart), local: true }
  }
}

export function chartFromSeries(text: string, chart: ChartKind, title: string, unit = ''): DocBlock {
  const matrix = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s*[|,;]\s*/))
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
    unit,
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
      `Write publication-grade LaTeX for: "${prompt}".
Return JSON: {"title":"short heading","items":[{"label":"what it means","latex":"..."}],"note":"one-line usage tip"}
Rules: 1 to 6 items. Raw LaTeX only, no $ delimiters, no markdown. Use \\frac, \\times, subscripts and Greek letters correctly.`,
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
/* AI images — multi-style raster generation with silent model fallback       */
/* ------------------------------------------------------------------------- */

const IMAGE_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const IMAGE_PLATE_STYLE =
  'clean scientific textbook illustration on a pure plain white background, anatomically and structurally accurate, soft studio lighting, no text, no letters, no numbers, no arrows, no watermark'

const CURATED_IMAGE_MODELS: { id: string; mode: 'chat' | 'predict' }[] = [
  { id: 'gemini-2.5-flash-image', mode: 'chat' },
  { id: 'imagen-4.0-generate-001', mode: 'predict' },
  { id: 'imagen-4.0-fast-generate-001', mode: 'predict' },
  { id: 'imagen-3.0-generate-002', mode: 'predict' },
  { id: 'gemini-2.0-flash-exp-image-generation', mode: 'chat' },
  { id: 'gemini-2.0-flash-preview-image-generation', mode: 'chat' },
]

function imageFailure(status: number, body: string): string {
  const text = body.replace(/\s+/g, ' ').trim()
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    if (parsed.error?.message) return `HTTP ${status} — ${parsed.error.message.slice(0, 180)}`
  } catch {
    /* plain text body */
  }
  return `HTTP ${status}${text ? ` — ${text.slice(0, 180)}` : ''}`
}

async function requestImage(
  model: { id: string; mode: 'chat' | 'predict' },
  apiKey: string,
  prompt: string,
  aspectRatio: AspectRatioId,
  signal: AbortSignal,
): Promise<string> {
  const url = proxyOn()
    ? proxyUrl('/image', { model: model.id, mode: model.mode })
    : model.mode === 'predict'
      ? `${IMAGE_BASE}/models/${model.id}:predict`
      : `${IMAGE_BASE}/models/${model.id}:generateContent`

  const send = async (withAspect: boolean) => {
    const body =
      model.mode === 'predict'
        ? {
            instances: [{ prompt }],
            parameters: withAspect ? { sampleCount: 1, aspectRatio } : { sampleCount: 1 },
          }
        : {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: withAspect
              ? { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio } }
              : { responseModalities: ['IMAGE', 'TEXT'] },
          }

    return fetch(url, {
      method: 'POST',
      signal,
      headers: proxyOn() ? proxyHeaders() : { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    })
  }

  let response = await send(true)
  if (!response.ok && response.status === 400) {
    response = await send(false)
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = await response.text()
    } catch {
      detail = ''
    }
    const err = new Error(imageFailure(response.status, detail)) as Error & { status?: number }
    err.status = response.status
    throw err
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
    predictions?: { bytesBase64Encoded?: string; mimeType?: string }[]
  }
  const inline = data.candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData?.data)?.inlineData
  if (inline?.data) return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`

  const prediction = data.predictions?.[0]
  if (prediction?.bytesBase64Encoded) {
    return `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`
  }
  throw new Error('no image in the response')
}

export interface GenerateImageOptions {
  style?: VisualStyleId
  aspect?: AspectRatioId
  styleDirective?: string
}

/**
 * Generates a high-resolution visual (photorealistic, 3D illustration, 2D vector,
 * textbook plate, or cinematic hero) using live-discovered + curated Gemini/Imagen models.
 */
export async function generateAiImage(
  settings: AppSettings,
  prompt: string,
  styleOrOptions: string | GenerateImageOptions = {},
): Promise<string> {
  const apiKey = settings.keys.gemini?.trim() ?? ''
  if (!apiKey && !proxyOn()) {
    throw new VisualError(
      'Image generation requires a Gemini key or Cloud Proxy.',
      'Open API Settings to add a Gemini key, or upload/paste (Ctrl+V) any image directly.',
    )
  }
  const brief = prompt.trim()
  if (!brief) throw new VisualError('Describe the image you want first.')

  const opts: GenerateImageOptions =
    typeof styleOrOptions === 'string' ? { styleDirective: styleOrOptions } : styleOrOptions
  const directive = opts.styleDirective ?? visualStylePreset(opts.style).directive
  const aspect: AspectRatioId = opts.aspect ?? '16:9'
  const styled = `${brief}. Style: ${directive}.`

  const liveModels = await listImageModels(apiKey)
  const seen = new Set<string>()
  const chain = [...liveModels, ...CURATED_IMAGE_MODELS].filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 110_000)

  try {
    for (const model of chain) {
      try {
        return await requestImage(model, apiKey, styled, aspect, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) break
        const status = (error as { status?: number })?.status
        console.warn(`[ClientForge Image] ${model.id} failed:`, error instanceof Error ? error.message : error)
        if (status === 401 || status === 403) {
          throw new VisualError(
            'Your Gemini API key was rejected for image generation.',
            'Verify your Gemini key in API Settings, or paste/upload your own image.',
          )
        }
      }
    }
  } finally {
    window.clearTimeout(timer)
  }

  if (controller.signal.aborted) {
    throw new VisualError('Image generation timed out.', 'Try again or paste/upload an image directly.')
  }
  throw new VisualError(
    'No image model on this account could render that visual right now.',
    'You can upload an image or press Ctrl+V anywhere to paste one instantly.',
  )
}

/* ------------------------------------------------------------------------- */
/* Annotated real illustration figure                                         */
/* ------------------------------------------------------------------------- */

export function imageAspect(url: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.height && image.width ? image.height / image.width : 0.78)
    image.onerror = () => resolve(0.78)
    image.src = url
  })
}

export async function generateFigure(
  settings: AppSettings,
  prompt: string,
  title?: string,
): Promise<{ block: DocBlock; local: boolean }> {
  const brief = prompt.trim()
  if (!brief) throw new VisualError('Describe the illustration you want first.')
  const preset = presetForPrompt(brief, 'figure')
  if (preset?.plateImage) return { block: blockFromPreset(preset, title), local: true }
  if (!hasGeminiImages(settings)) {
    throw new VisualError(
      'An AI illustration requires a Gemini key or Cloud Proxy.',
      'Add a Gemini key in API Settings, or drop/paste an image into the Images tab and click "Add Leader-Line Labels".',
    )
  }

  let figureTitle = (title || brief).slice(0, 80)
  let caption = ''
  let imagePrompt = brief
  let labels: { label: string; side: 'left' | 'right'; x: number; y: number }[] = []

  if (hasAi(settings)) {
    try {
      const raw = await ask(
        settings,
        SYSTEM_PRINT,
        `Plan a labelled editorial illustration of: "${brief}".
Return JSON:
{
  "title": "short figure title",
  "caption": "Fig 1.1: one-line explanatory note",
  "imagePrompt": "one paragraph describing exactly what the visual shows, crisp 3D/textbook illustration with ZERO text or labels inside",
  "labels": [{"label":"exact part or feature name","side":"left|right","x":0-100,"y":0-100}]
}
Rules:
- 5 to 7 crisp labels.
- x and y are coordinates (0-100) inside the visual.
- Alternate "side" left/right and keep y values spaced at least 12 apart.
- Never ask for letters, arrows or numbers inside imagePrompt.
${docContext()}`,
      )
      const record = (raw ?? {}) as Record<string, unknown>
      figureTitle = String(record.title ?? '').trim() || figureTitle
      caption = String(record.caption ?? '').trim()
      const planned = String(record.imagePrompt ?? '').trim()
      if (planned.length > 20) imagePrompt = planned
      labels = (Array.isArray(record.labels) ? record.labels : [])
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null
          const label = entry as Record<string, unknown>
          const text = String(label.label ?? label.name ?? '').trim()
          if (!text) return null
          const side = String(label.side ?? '').toLowerCase() === 'right' ? 'right' : 'left'
          const x = Number(label.x)
          const y = Number(label.y)
          return {
            label: text.slice(0, 42),
            side: (side === 'left' && index % 2 === 1 ? 'right' : side) as 'left' | 'right',
            x: Number.isFinite(x) ? x : 50,
            y: Number.isFinite(y) ? y : 20 + index * 10,
          }
        })
        .filter((entry): entry is { label: string; side: 'left' | 'right'; x: number; y: number } => entry !== null)
        .slice(0, 8)
    } catch {
      /* generate the illustration even if label planning failed */
    }
  }

  const url = await generateAiImage(settings, imagePrompt, { style: 'textbook-diagram', aspect: '4:3' })
  const aspect = await imageAspect(url)
  const block = labeledFigureBlock(
    url,
    aspect,
    figureTitle,
    labels,
    caption || 'Annotated figure — rename labels or adjust anchor positions',
  )
  return { block, local: false }
}

/* ------------------------------------------------------------------------- */
/* Image helpers                                                               */
/* ------------------------------------------------------------------------- */

export async function readImageFile(file: File, limit = 1800): Promise<string> {
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
  if (!image.width || (image.width <= limit && image.height <= limit)) return raw
  const scale = Math.min(limit / image.width, limit / image.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return raw
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
  return keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
}
