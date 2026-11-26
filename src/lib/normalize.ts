import { uid } from './id'
import { normalizeDiagram } from './diagrams'
import type {
  AspectRatioId,
  CalloutKind,
  Carousel,
  ChartKind,
  DocBlock,
  DocSection,
  McqItem,
  PdfDoc,
  Slide,
  SlideKind,
  StatMetric,
  TimelineItem,
  VisualStyleId,
} from '../types'

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((v) => asText(v)).filter(Boolean).join(' ')
  return fallback
}

const asList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const firstText = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const text = asText(record[key])
    if (text) return text
  }
  return ''
}

const itemText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  const record = asRecord(value)
  return firstText(record, ['text', 'title', 'label', 'content', 'value', 'point'])
}

const cleanItems = (value: unknown, limit = 8): string[] =>
  asList(value)
    .map(itemText)
    .map((item) => item.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, limit)

const CALLOUT_KINDS: CalloutKind[] = ['fact', 'exam', 'note', 'tip', 'warning', 'quote', 'summary']

const inferCalloutKind = (record: Record<string, unknown>): CalloutKind => {
  const declared = asText(record.kind).toLowerCase()
  if (CALLOUT_KINDS.includes(declared as CalloutKind)) return declared as CalloutKind
  const label = `${asText(record.title)} ${asText(record.label)}`.toLowerCase()
  if (/exam|pyq|marks|important|remember|must know/.test(label)) return 'exam'
  if (/tip|pro tip|trick|mnemonic/.test(label)) return 'tip'
  if (/warn|caution|trap|avoid|risk/.test(label)) return 'warning'
  if (/summary|takeaway|recap/.test(label)) return 'summary'
  if (/note/.test(label)) return 'note'
  return 'fact'
}

const CHART_KINDS: ChartKind[] = ['bar', 'bar3d', 'line', 'donut', 'hcompare', 'area', 'compare']
const VISUAL_STYLES: VisualStyleId[] = [
  'photorealistic',
  '3d-illustration',
  '2d-vector',
  'textbook-diagram',
  'cinematic-cover',
]
const ASPECT_RATIOS: AspectRatioId[] = ['16:9', '4:3', '1:1', '3:4']

const BLOCK_TYPES: Record<string, DocBlock['type']> = {
  lead: 'lead',
  intro: 'lead',
  opening: 'lead',
  paragraph: 'paragraph',
  text: 'paragraph',
  body: 'paragraph',
  subheading: 'subheading',
  heading: 'subheading',
  h3: 'subheading',
  subtitle: 'subheading',
  bullets: 'bullets',
  bullet: 'bullets',
  list: 'bullets',
  points: 'bullets',
  unordered_list: 'bullets',
  numbered: 'numbered',
  numbered_list: 'numbered',
  ordered_list: 'numbered',
  steps: 'numbered',
  sequence: 'numbered',
  keyterms: 'keyterms',
  key_terms: 'keyterms',
  terms: 'keyterms',
  definitions: 'keyterms',
  glossary: 'keyterms',
  table: 'table',
  comparison: 'table',
  comparison_table: 'table',
  callout: 'callout',
  callouts: 'callout',
  note: 'callout',
  important: 'callout',
  highlight: 'callout',
  quote: 'quote',
  blockquote: 'quote',
  pullquote: 'quote',
  chart: 'chart',
  graph: 'chart',
  data_chart: 'chart',
  stats: 'stats',
  stat: 'stats',
  metrics: 'stats',
  kpi: 'stats',
  kpis: 'stats',
  timeline: 'timeline',
  roadmap: 'timeline',
  diagram: 'diagram',
  flowchart: 'diagram',
  cycle: 'diagram',
  mindmap: 'diagram',
  math: 'math',
  formula: 'math',
  equation: 'math',
  image: 'image',
  visual: 'image',
  photo: 'image',
  illustration: 'image',
  figure: 'image',
}

export function normalizeBlock(raw: unknown): DocBlock | null {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    return { id: uid('b'), type: 'paragraph', text }
  }
  const record = asRecord(raw)
  const rawType = asText(record.type || record.block_type || (record.chart ? 'chart' : record.diagram ? 'diagram' : ''))
    .toLowerCase()
    .replace(/\s+/g, '_')
  const type = BLOCK_TYPES[rawType]
  if (!type) {
    const fallback = firstText(record, ['text', 'body', 'content'])
    return fallback ? { id: uid('b'), type: 'paragraph', text: fallback } : null
  }

  switch (type) {
    case 'lead': {
      const text = firstText(record, ['text', 'content', 'body'])
      return text ? { id: uid('b'), type: 'lead', text } : null
    }
    case 'paragraph': {
      const text = firstText(record, ['text', 'content', 'body'])
      return text ? { id: uid('b'), type: 'paragraph', text } : null
    }
    case 'subheading': {
      const text = firstText(record, ['text', 'title', 'content', 'heading'])
      return text ? { id: uid('b'), type: 'subheading', text } : null
    }
    case 'bullets': {
      const items = cleanItems(record.items ?? record.bullets ?? record.points ?? record.list ?? record.content, 6)
      return items.length ? { id: uid('b'), type: 'bullets', items } : null
    }
    case 'numbered': {
      const items = cleanItems(record.items ?? record.steps ?? record.points ?? record.list ?? record.content, 6)
      return items.length ? { id: uid('b'), type: 'numbered', items } : null
    }
    case 'keyterms': {
      const source = asList(record.items ?? record.terms ?? record.pairs ?? record.definitions)
      const items = source
        .map((entry) => {
          if (typeof entry === 'string') {
            const [term, definition] = entry.split(/\s*[:—–-]\s*/, 2)
            return term && definition ? { term: term.trim(), definition: definition.trim() } : null
          }
          const item = asRecord(entry)
          const term = firstText(item, ['term', 'word', 'name', 'key'])
          const definition = firstText(item, ['definition', 'meaning', 'description', 'value'])
          return term && definition ? { term, definition } : null
        })
        .filter((item): item is { term: string; definition: string } => Boolean(item))
        .slice(0, 6)
      return items.length ? { id: uid('b'), type: 'keyterms', items } : null
    }
    case 'table': {
      const columns = asList(record.columns ?? record.headers ?? record.fields)
        .map((c) => itemText(c))
        .filter(Boolean)
        .slice(0, 6)
      const rawRows = asList(record.rows ?? record.data ?? record.items)
      const rows = rawRows
        .map((row) => {
          const cells = Array.isArray(row) ? row : Object.values(asRecord(row))
          return cells.map((cell) => asText(cell)).slice(0, 6)
        })
        .filter((row) => row.some(Boolean))
        .slice(0, 14)
      if (!columns.length || !rows.length) return null
      const width = Math.min(columns.length, 6)
      return {
        id: uid('b'),
        type: 'table',
        caption: firstText(record, ['caption', 'title']),
        columns: columns.slice(0, width),
        rows: rows.map((row) => {
          const next = row.slice(0, width)
          while (next.length < width) next.push('')
          return next
        }),
      }
    }
    case 'callout': {
      const body = firstText(record, ['body', 'text', 'content', 'description'])
      const title = firstText(record, ['title', 'label', 'heading'])
      if (!body && !title) return null
      const kind = inferCalloutKind(record)
      return {
        id: uid('b'),
        type: 'callout',
        kind,
        title: title || (kind === 'exam' ? 'Exam Important' : 'Key Fact'),
        body: body || title,
      }
    }
    case 'quote': {
      const text = firstText(record, ['text', 'quote', 'content'])
      return text ? { id: uid('b'), type: 'quote', text, cite: firstText(record, ['cite', 'author', 'source']) } : null
    }
    case 'stats': {
      const items: StatMetric[] = asList(record.items ?? record.metrics ?? record.stats)
        .map((entry) => {
          const item = asRecord(entry)
          const value = firstText(item, ['value', 'number', 'metric', 'stat'])
          const label = firstText(item, ['label', 'title', 'name', 'description'])
          if (!value || !label) return null
          const delta = firstText(item, ['delta', 'change', 'trend', 'note'])
          return { id: uid('st'), value: value.slice(0, 24), label: label.slice(0, 56), ...(delta ? { delta: delta.slice(0, 28) } : {}) }
        })
        .filter((item): item is StatMetric => Boolean(item))
        .slice(0, 4)
      if (!items.length) return null
      return {
        id: uid('stats'),
        type: 'stats',
        title: firstText(record, ['title', 'heading', 'caption']) || 'Key Figures',
        items,
      }
    }
    case 'chart': {
      const rawChart = asText(record.chart || record.kind).toLowerCase() as ChartKind
      const chart: ChartKind = CHART_KINDS.includes(rawChart) ? rawChart : 'bar'
      const labels = asList(record.labels ?? record.categories).map((l) => asText(l)).filter(Boolean).slice(0, 8)
      const values = asList(record.values ?? record.data)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
        .slice(0, 8)
      if (labels.length < 2 || values.length < 2) return null
      const count = Math.min(labels.length, values.length)
      const values2 = Array.isArray(record.values2)
        ? record.values2.map((v) => Number(v)).filter((v) => Number.isFinite(v)).slice(0, count)
        : undefined
      return {
        id: uid('chart'),
        type: 'chart',
        chart,
        title: firstText(record, ['title', 'caption']) || 'Data Breakdown',
        labels: labels.slice(0, count),
        values: values.slice(0, count),
        ...(values2 && values2.length ? { values2 } : {}),
        accent: '',
        accent2: '',
        ...(firstText(record, ['unit']) ? { unit: firstText(record, ['unit']) } : {}),
        ...(firstText(record, ['seriesA']) ? { seriesA: firstText(record, ['seriesA']) } : {}),
        ...(firstText(record, ['seriesB']) ? { seriesB: firstText(record, ['seriesB']) } : {}),
        ...(firstText(record, ['note']) ? { note: firstText(record, ['note']) } : {}),
      }
    }
    case 'timeline': {
      const items: TimelineItem[] = asList(record.items ?? record.events ?? record.steps)
        .map((entry) => {
          const item = asRecord(entry)
          const title = firstText(item, ['title', 'event', 'name'])
          const date = firstText(item, ['date', 'year', 'phase', 'step', 'time'])
          const description = firstText(item, ['description', 'detail', 'summary', 'body'])
          if (!title && !description) return null
          return {
            id: uid('ev'),
            date: date || 'Phase',
            title: title || description.slice(0, 40),
            description,
          }
        })
        .filter((item): item is TimelineItem => Boolean(item))
        .slice(0, 8)
      if (items.length < 2) return null
      const orientation = asText(record.orientation).toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical'
      return {
        id: uid('tl'),
        type: 'timeline',
        title: firstText(record, ['title', 'heading']) || 'Timeline',
        orientation,
        items,
      }
    }
    case 'diagram': {
      const normalized = normalizeDiagram(record, 'flow')
      return normalized
    }
    case 'math': {
      const rawItems = asList(record.items)
        .map((entry) => {
          const item = asRecord(entry)
          const latex = firstText(item, ['latex', 'formula', 'expr'])
          if (!latex) return null
          return { id: uid('f'), label: firstText(item, ['label', 'name']), latex }
        })
        .filter((item): item is { id: string; label: string; latex: string } => Boolean(item))
        .slice(0, 6)
      const latex = firstText(record, ['latex', 'formula', 'expr']) || rawItems[0]?.latex || ''
      if (!latex && !rawItems.length) return null
      return {
        id: uid('math'),
        type: 'math',
        title: firstText(record, ['title', 'heading']) || 'Formula',
        latex: latex || rawItems[0].latex,
        note: firstText(record, ['note', 'caption']),
        layout: rawItems.length > 1 || asText(record.layout) === 'sheet' ? 'sheet' : 'card',
        items: rawItems.length ? rawItems : [{ id: uid('f'), label: '', latex }],
      }
    }
    case 'image': {
      const prompt = firstText(record, ['prompt', 'imagePrompt', 'description', 'brief'])
      const url = firstText(record, ['url', 'src', 'image'])
      const caption = firstText(record, ['caption', 'title', 'alt'])
      if (!prompt && !url) return null
      const rawStyle = asText(record.style).toLowerCase() as VisualStyleId
      const rawAspect = asText(record.aspect).toLowerCase() as AspectRatioId
      const rawWidth = Number(record.width)
      return {
        id: uid('img'),
        type: 'image',
        url,
        caption: caption || (prompt ? `Fig: ${prompt.slice(0, 72)}` : ''),
        width: Number.isFinite(rawWidth) ? Math.min(100, Math.max(30, rawWidth)) : 100,
        align: (['left', 'center', 'right'].includes(asText(record.align)) ? asText(record.align) : 'center') as
          | 'left'
          | 'center'
          | 'right',
        rounded: record.rounded !== false,
        ...(prompt ? { prompt } : {}),
        ...(VISUAL_STYLES.includes(rawStyle) ? { style: rawStyle } : { style: 'photorealistic' }),
        ...(ASPECT_RATIOS.includes(rawAspect) ? { aspect: rawAspect } : { aspect: '16:9' }),
        fit: asText(record.fit) === 'cover' ? 'cover' : 'contain',
      }
    }
    default:
      return null
  }
}

function normalizeSection(raw: unknown, index: number): DocSection | null {
  const record = asRecord(raw)
  const heading =
    firstText(record, ['heading', 'title', 'name', 'section']) || `Section ${index + 1}`
  const rawBlocks = asList(record.blocks ?? record.content ?? record.items ?? record.body)
  const blocks = rawBlocks
    .map((block) => normalizeBlock(block))
    .filter((block): block is DocBlock => Boolean(block))
  if (!blocks.length) {
    const text = firstText(record, ['text', 'summary'])
    if (!text) return null
    blocks.push({ id: uid('b'), type: 'paragraph', text })
  }
  return { id: uid('s'), heading, blocks }
}

function normalizeMcq(raw: unknown): McqItem | null {
  const record = asRecord(raw)
  const question = firstText(record, ['question', 'prompt', 'stem', 'q'])
  const rawOptions = asList(record.options ?? record.choices ?? record.answers)
  let options: string[] = rawOptions.map((option) => itemText(option)).filter(Boolean)
  if (!options.length) {
    const optionRecord = asRecord(record.options)
    options = Object.keys(optionRecord)
      .sort()
      .map((key) => `${key}. ${asText(optionRecord[key])}`)
      .filter((line) => line.trim().length > 2)
  }
  if (!question || options.length < 2) return null
  let answer = firstText(record, ['answer', 'correct_answer', 'correct', 'solution'])
  if (/^[A-Da-d]$/.test(answer)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65
    answer = options[index] ?? answer
  }
  return {
    id: uid('q'),
    question,
    options: options.slice(0, 5),
    answer: answer || options[0],
    explanation: firstText(record, ['explanation', 'reason', 'rationale', 'why']),
  }
}

export function normalizeDoc(raw: unknown): PdfDoc {
  const record = asRecord(raw)
  const rawSections = asList(
    record.sections ?? record.chapters ?? record.contents ?? record.outline ?? record.parts,
  )
  const sections = rawSections
    .map((section, index) => normalizeSection(section, index))
    .filter((section): section is DocSection => Boolean(section))

  const mcqs = asList(
    record.mcqs ?? record.mcq ?? record.questions ?? record.practice_mcqs ?? record.quiz,
  )
    .map((item) => normalizeMcq(item))
    .filter((item): item is McqItem => Boolean(item))

  let title = firstText(record, ['title', 'doc_title', 'name'])
  let subtitle = firstText(record, ['subtitle', 'tagline', 'description', 'summary'])
  const eyebrow = firstText(record, ['eyebrow', 'kicker', 'label']) || 'PUBLICATION'
  const coverImagePrompt = firstText(record, ['coverImagePrompt', 'cover_image_prompt', 'coverPrompt'])
  const coverImage = firstText(record, ['coverImage', 'cover_image'])
  const rawCoverLayout = asText(record.coverImageLayout).toLowerCase()
  const coverImageLayout =
    rawCoverLayout === 'full' || rawCoverLayout === 'side' || rawCoverLayout === 'banner'
      ? rawCoverLayout
      : 'banner'

  if (!sections.length) {
    const fallback = firstText(record, ['content', 'text', 'output'])
    if (fallback) {
      sections.push({
        id: uid('s'),
        heading: 'Overview',
        blocks: fallback
          .split(/\n{2,}/)
          .map((chunk) => normalizeBlock({ type: 'paragraph', text: chunk }))
          .filter((block): block is DocBlock => Boolean(block)),
      })
    }
  }

  if (!title) title = sections[0]?.heading || 'Untitled Document'
  if (!subtitle) subtitle = `Prepared ${new Date().toLocaleDateString()}`

  return {
    title,
    eyebrow,
    subtitle,
    sections,
    mcqs,
    ...(coverImage ? { coverImage } : {}),
    ...(coverImagePrompt ? { coverImagePrompt } : {}),
    coverImageLayout,
  }
}

const SLIDE_KINDS: SlideKind[] = ['hook', 'idea', 'cta']

function normalizeSlide(raw: unknown, index: number, total: number): Slide {
  const record = asRecord(raw)
  const declared = asText(record.kind || record.type).toLowerCase()
  const kind: SlideKind = SLIDE_KINDS.includes(declared as SlideKind)
    ? (declared as SlideKind)
    : index === 0
      ? 'hook'
      : index === total - 1
        ? 'cta'
        : 'idea'
  const points = cleanItems(record.points ?? record.bullets ?? record.items ?? record.list, 4)
  const imagePrompt = firstText(record, ['imagePrompt', 'image_prompt', 'visualPrompt'])
  const image = firstText(record, ['image', 'imageUrl'])
  const rawLayout = asText(record.imageLayout || record.image_layout).toLowerCase()
  const imageLayout =
    rawLayout === 'split' || rawLayout === 'background' || rawLayout === 'top'
      ? rawLayout
      : kind === 'hook'
        ? 'background'
        : 'split'

  return {
    id: uid('slide'),
    kind,
    eyebrow: firstText(record, ['eyebrow', 'kicker', 'label']),
    headline: firstText(record, ['headline', 'title', 'hook', 'text']) || 'Untitled slide',
    subhook: firstText(record, ['subhook', 'subtitle', 'support', 'description', 'subline']),
    points: kind === 'hook' ? [] : points,
    numbered: Boolean(record.numbered) || /^numbered|steps|sequence/i.test(asText(record.style)),
    cta: firstText(record, ['cta', 'call_to_action', 'action', 'button']),
    ...(image ? { image } : {}),
    ...(imagePrompt ? { imagePrompt } : {}),
    imageLayout,
  }
}

export function normalizeCarousel(raw: unknown): Carousel {
  const record = asRecord(raw)
  const rawSlides = asList(record.slides ?? record.cards ?? record.pages ?? record.items).slice(0, 10)
  const slides = rawSlides.map((slide, index) => normalizeSlide(slide, index, rawSlides.length))
  if (slides.length) {
    slides[0].kind = 'hook'
    slides[slides.length - 1].kind = 'cta'
    if (slides.length === 1) slides[0].kind = 'hook'
  }
  return {
    title: firstText(record, ['title', 'name', 'topic']) || 'Untitled Deck',
    slides,
  }
}
