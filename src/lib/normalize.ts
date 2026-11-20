import { uid } from './id'
import type {
  CalloutKind,
  Carousel,
  DocBlock,
  DocSection,
  McqItem,
  PdfDoc,
  Slide,
  SlideKind,
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

const CALLOUT_KINDS: CalloutKind[] = ['fact', 'exam', 'note']

const inferCalloutKind = (record: Record<string, unknown>): CalloutKind => {
  const declared = asText(record.kind).toLowerCase()
  if (CALLOUT_KINDS.includes(declared as CalloutKind)) return declared as CalloutKind
  const label = `${asText(record.title)} ${asText(record.label)}`.toLowerCase()
  if (/exam|pyq|marks|important|remember|must know/.test(label)) return 'exam'
  if (/note|caution|tip|avoid|warning/.test(label)) return 'note'
  return 'fact'
}

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
}

export function normalizeBlock(raw: unknown): DocBlock | null {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    return { id: uid('b'), type: 'paragraph', text }
  }
  const record = asRecord(raw)
  const rawType = asText(record.type || record.kind || record.block_type).toLowerCase().replace(/\s+/g, '_')
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
        .slice(0, 10)
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
      return {
        id: uid('b'),
        type: 'callout',
        kind: inferCalloutKind(record),
        title: title || (inferCalloutKind(record) === 'exam' ? 'Exam Important' : 'Key Fact'),
        body: body || title,
      }
    }
    case 'quote': {
      const text = firstText(record, ['text', 'quote', 'content'])
      return text ? { id: uid('b'), type: 'quote', text, cite: firstText(record, ['cite', 'author', 'source']) } : null
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
  const eyebrow = firstText(record, ['eyebrow', 'kicker', 'label']) || 'STUDY NOTES'

  if (!sections.length) {
    // Some models return a flat "content" string when they ignore the schema.
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
  if (!subtitle) subtitle = `Generated by ${new Date().toLocaleDateString()}`

  return { title, eyebrow, subtitle, sections, mcqs }
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
  return {
    id: uid('slide'),
    kind,
    eyebrow: firstText(record, ['eyebrow', 'kicker', 'label']),
    headline: firstText(record, ['headline', 'title', 'hook', 'text']) || 'Untitled slide',
    subhook: firstText(record, ['subhook', 'subtitle', 'support', 'description', 'subline']),
    points: kind === 'hook' ? [] : points,
    numbered: Boolean(record.numbered) || /^numbered|steps|sequence/i.test(asText(record.style)),
    cta: firstText(record, ['cta', 'call_to_action', 'action', 'button']),
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
    title: firstText(record, ['title', 'name', 'topic']) || 'Untitled Carousel',
    slides,
  }
}
