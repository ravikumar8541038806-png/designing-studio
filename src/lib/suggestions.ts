import { callModel, extractJson, fallbackModels } from './ai'
import { uid } from './id'
import {
  generateCallout,
  generateChart,
  generateDiagram,
  generateFormula,
  generateSteps,
  generateTable,
  hasAi,
  localTable,
} from './visuals'
import type { AppSettings, ChartKind, DiagramKind, DocBlock, PdfDoc } from '../types'

export type SuggestionCategory = 'visual' | 'exam' | 'layout'
export type SuggestionActionKind =
  | 'diagram'
  | 'chart'
  | 'formula'
  | 'table'
  | 'callout'
  | 'process'

export interface SuggestionAction {
  kind: SuggestionActionKind
  prompt: string
  diagram?: DiagramKind
  chart?: ChartKind
  preset?: 'exam' | 'tip' | 'summary' | 'warning'
}

export interface Suggestion {
  id: string
  category: SuggestionCategory
  title: string
  detail: string
  sectionId: string
  sectionHeading: string
  action: SuggestionAction
}

export const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  visual: 'Visual',
  exam: 'Exam booster',
  layout: 'Clarity',
}

const SUBJECTS: { label: string; keywords: RegExp }[] = [
  { label: 'Biology', keywords: /biolog|cell|heart|photosynth|enzyme|genetic|neuron|plant|blood/i },
  { label: 'Physics', keywords: /physic|motion|force|optic|circuit|electric|magnet|thermo|wave/i },
  { label: 'Economics', keywords: /econom|inflation|gdp|demand|supply|monetary|fiscal|rbi|budget|bank/i },
  { label: 'Business', keywords: /business|marketing|strategy|startup|revenue|profit|customer|brand/i },
  { label: 'Chemistry', keywords: /chemis|reaction|mole|acid|base|organic|periodic/i },
  { label: 'Mathematics', keywords: /math|algebra|calculus|geometry|trigono|statistic|probabilit/i },
  { label: 'Geography', keywords: /geograph|climate|monsoon|water cycle|soil|river|population/i },
  { label: 'UPSC / Polity', keywords: /upsc|polity|constitution|parliament|article|governance|civil service/i },
]

export function inferSubject(doc: PdfDoc): string {
  const text = `${doc.title} ${doc.eyebrow} ${doc.subtitle} ${doc.sections.map((section) => section.heading).join(' ')} ${doc.sections
    .flatMap((section) => section.blocks)
    .map((block) => ('text' in block ? block.text : ''))
    .join(' ')
    .slice(0, 4000)}`
  const scored = SUBJECTS.map((subject) => ({
    label: subject.label,
    score: (text.match(subject.keywords) ?? []).length,
  })).sort((a, b) => b.score - a.score)
  return scored[0]?.score ? scored[0].label : 'General studies'
}

function blockText(block: DocBlock): string {
  if ('text' in block) return block.text
  if (block.type === 'callout') return `${block.title} ${block.body}`
  if (block.type === 'table') return block.rows.flat().join(' ')
  if (block.type === 'keyterms') return block.items.map((item) => `${item.term} ${item.definition}`).join(' ')
  if (block.type === 'chart') return block.title
  if (block.type === 'diagram') return block.title
  if (block.type === 'math') return block.title
  if (block.type === 'image') return block.caption
  if (block.type === 'timeline') return block.items.map((item) => `${item.title} ${item.description}`).join(' ')
  if (block.type === 'bullets' || block.type === 'numbered') return block.items.join(' ')
  return ''
}

export function sectionCharacters(doc: PdfDoc, sectionId: string): number {
  const section = doc.sections.find((entry) => entry.id === sectionId)
  if (!section) return 0
  return section.blocks.reduce((total, block) => total + blockText(block).length, 0)
}

function hasVisual(section: PdfDoc['sections'][number]): boolean {
  return section.blocks.some((block) =>
    ['chart', 'diagram', 'image', 'timeline', 'math', 'table'].includes(block.type),
  )
}

function hasKind(doc: PdfDoc, kind: DocBlock['type']): boolean {
  return doc.sections.some((section) => section.blocks.some((block) => block.type === kind))
}

function firstParagraph(section: PdfDoc['sections'][number]): string {
  const block = section.blocks.find((entry) => entry.type === 'paragraph' || entry.type === 'lead')
  return block && 'text' in block ? block.text : ''
}

/**
 * Heuristic advisor. Runs instantly, with or without an API key, so the panel
 * is never an empty state.
 */
export function scanLocalSuggestions(doc: PdfDoc): Suggestion[] {
  const subject = inferSubject(doc)
  const items: Suggestion[] = []
  const push = (suggestion: Omit<Suggestion, 'id'>) => {
    if (items.length >= 6) return
    if (items.some((entry) => entry.sectionId === suggestion.sectionId && entry.action.kind === suggestion.action.kind)) return
    items.push({ id: uid('sg'), ...suggestion })
  }

  doc.sections.forEach((section, index) => {
    const text = sectionCharacters(doc, section.id)
    if (!hasVisual(section) && text > 160) {
      push({
        category: 'visual',
        title: `Add a labeled visual to “${section.heading}”`,
        detail: `Section ${index + 1} is text-only. A ${subject} diagram gives the reader an anchor and breaks the wall of prose.`,
        sectionId: section.id,
        sectionHeading: section.heading,
        action: {
          kind: 'diagram',
          diagram: subject === 'Economics' ? 'mindmap' : 'labeled',
          prompt: `${subject} labeled diagram explaining ${section.heading}`,
        },
      })
    }
    const dense = section.blocks.find(
      (block) => block.type === 'paragraph' && block.text.length > 340,
    )
    if (dense) {
      push({
        category: 'layout',
        title: `Convert the dense paragraph in “${section.heading}”`,
        detail: 'Long unbroken prose reads as a wall on A4. A 4-step numbered process scans in seconds.',
        sectionId: section.id,
        sectionHeading: section.heading,
        action: { kind: 'process', prompt: `Break ${section.heading} into a numbered process` },
      })
    }
  })

  if (!hasKind(doc, 'math') && /Physics|Economics|Business|Mathematics|Chemistry|Biology/.test(subject)) {
    const section = doc.sections[0]
    if (section) {
      push({
        category: 'exam',
        title: `Add a ${subject} formula sheet`,
        detail: 'A single cheat-sheet box gives the chapter a revision surface students photograph and share.',
        sectionId: section.id,
        sectionHeading: section.heading,
        action: { kind: 'formula', prompt: `${subject} formula cheat sheet for ${doc.title}` },
      })
    }
  }

  const termSection = doc.sections.find((section) =>
    section.blocks.some((block) => block.type === 'keyterms' && block.items.length >= 2),
  )
  if (termSection && !hasKind(doc, 'table')) {
    const terms = termSection.blocks.find((block) => block.type === 'keyterms')
    const names = terms && terms.type === 'keyterms' ? terms.items.slice(0, 2).map((item) => item.term) : []
    push({
      category: 'exam',
      title: names.length === 2 ? `Compare ${names[0]} vs ${names[1]}` : `Add a comparison table to “${termSection.heading}”`,
      detail: 'Difference tables are the most repeated answer format in written exams. Marks are lost for missing contrast.',
      sectionId: termSection.id,
      sectionHeading: termSection.heading,
      action: {
        kind: 'table',
        prompt: names.length === 2 ? `Difference between ${names[0]} and ${names[1]}` : `Comparison table for ${termSection.heading}`,
      },
    })
  }

  const examSection = doc.sections.find(
    (section) => !section.blocks.some((block) => block.type === 'callout' && block.kind === 'exam'),
  )
  if (examSection) {
    push({
      category: 'exam',
      title: `Add a memory trick to “${examSection.heading}”`,
      detail: 'A mnemonic callout turns a list into a retrievable chunk — ideal for last-week revision.',
      sectionId: examSection.id,
      sectionHeading: examSection.heading,
      action: { kind: 'callout', preset: 'tip', prompt: `Mnemonic for ${examSection.heading}` },
    })
  }

  // Always offer a complete review: fill up to four cards with section-level visuals.
  for (const section of doc.sections) {
    if (items.length >= 4) break
    push({
      category: 'visual',
      title: `Show the trend in “${section.heading}”`,
      detail: 'Numbers stated in prose are hard to compare. A chart makes the gap obvious at a glance.',
      sectionId: section.id,
      sectionHeading: section.heading,
      action: { kind: 'chart', chart: 'bar', prompt: `Key figures from ${section.heading}` },
    })
  }

  return items.slice(0, 6)
}

const VALID_KINDS: SuggestionActionKind[] = ['diagram', 'chart', 'formula', 'table', 'callout', 'process']

export async function scanSuggestions(
  settings: AppSettings,
  doc: PdfDoc,
): Promise<{ items: Suggestion[]; local: boolean }> {
  const local = scanLocalSuggestions(doc)
  if (!hasAi(settings)) return { items: local, local: true }

  const outline = doc.sections
    .map((section, index) => {
      const text = section.blocks.map(blockText).join(' ').slice(0, 700)
      return `[${index + 1}] id=${section.id} | ${section.heading}\n${text}`
    })
    .join('\n\n')

  try {
    const text = await callModel({
      provider: settings.provider,
      apiKey: settings.keys[settings.provider],
      model: settings.models[settings.provider],
      system:
        'You are a ruthless instructional-design reviewer for print study material. You return a single valid JSON object and nothing else.',
      user: `Review this ${inferSubject(doc)} document and return 4 to 6 specific, high-impact improvements.
Title: ${doc.title}
Audience: exam aspirants and self-learners. Target: print-ready A4 notes.

SECTIONS
${outline.slice(0, 9000)}

Return JSON:
{"suggestions":[{
  "category":"visual|exam|layout",
  "title":"imperative, max 9 words, names the section",
  "detail":"one sentence on the marks or clarity gained, max 24 words",
  "sectionId":"copy an exact id above",
  "action":{"kind":"diagram|chart|formula|table|callout|process","prompt":"precise generation brief","diagram":"labeled|flow|cycle|mindmap","chart":"bar|line|donut|area|compare","preset":"exam|tip|summary|warning"}
}]}
Rules:
- Use at least one visual (a diagram with the exact structures to label, or a chart with the exact series) and at least one exam booster (comparison table, formula sheet, or mnemonic).
- Name real subject content from the text — "MPC repo transmission", "concave mirror ray diagram", "CRR vs SLR". Never generic advice.
- Do not suggest anything the document already contains.
- action.prompt must be self-contained: it is sent to an illustrator without this document.`,
      maxTokens: 2400,
      fallbackModels: fallbackModels(settings),
    })
    const raw = extractJson(text) as { suggestions?: unknown }
    const list = Array.isArray(raw?.suggestions) ? raw.suggestions : []
    const items: Suggestion[] = []
    list.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || items.length >= 6) return
      const record = entry as Record<string, unknown>
      const actionRecord = (record.action ?? {}) as Record<string, unknown>
      const kind = String(actionRecord.kind ?? '') as SuggestionActionKind
      if (!VALID_KINDS.includes(kind)) return
      const prompt = String(actionRecord.prompt ?? '').trim()
      if (prompt.length < 8) return
      const sectionId = String(record.sectionId ?? '')
      const section = doc.sections.find((item) => item.id === sectionId) ?? doc.sections[0]
      if (!section) return
      const category = String(record.category ?? 'visual') as SuggestionCategory
      items.push({
        id: uid('sg'),
        category: ['visual', 'exam', 'layout'].includes(category) ? category : 'visual',
        title: String(record.title ?? '').trim().slice(0, 110) || 'Suggested improvement',
        detail: String(record.detail ?? '').trim().slice(0, 220),
        sectionId: section.id,
        sectionHeading: section.heading,
        action: {
          kind,
          prompt,
          diagram: String(actionRecord.diagram ?? '') as DiagramKind,
          chart: String(actionRecord.chart ?? '') as ChartKind,
          preset: String(actionRecord.preset ?? 'exam') as SuggestionAction['preset'],
        },
      })
    })
    if (items.length >= 3) return { items, local: false }
    return { items: local, local: true }
  } catch {
    return { items: local, local: true }
  }
}

export function insertIntoSection(doc: PdfDoc, sectionId: string, block: DocBlock): PdfDoc {
  if (!doc.sections.length) {
    return { ...doc, sections: [{ id: uid('s'), heading: 'Visuals', blocks: [block] }] }
  }
  const target = doc.sections.some((section) => section.id === sectionId)
    ? sectionId
    : doc.sections[doc.sections.length - 1].id
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === target ? { ...section, blocks: [...section.blocks, block] } : section,
    ),
  }
}

export async function executeSuggestion(
  settings: AppSettings,
  doc: PdfDoc,
  suggestion: Suggestion,
): Promise<{ doc: PdfDoc; local: boolean; block: DocBlock }> {
  const sectionId = doc.sections.some((section) => section.id === suggestion.sectionId)
    ? suggestion.sectionId
    : doc.sections[doc.sections.length - 1]?.id ?? ''
  const { action } = suggestion
  let result: { block: DocBlock; local: boolean }

  switch (action.kind) {
    case 'diagram':
      result = await generateDiagram(settings, action.prompt, action.diagram || 'flow')
      break
    case 'chart':
      result = await generateChart(settings, action.prompt, action.chart || 'bar')
      break
    case 'formula':
      result = await generateFormula(settings, action.prompt, 'sheet')
      break
    case 'table':
      result = await generateTable(settings, action.prompt, doc, sectionId)
      break
    case 'callout':
      result = await generateCallout(settings, action.prompt, action.preset || 'exam', doc, sectionId)
      break
    case 'process':
      result = await generateSteps(settings, action.prompt, doc, sectionId)
      break
    default:
      result = { block: localTable(action.prompt, doc, sectionId), local: true }
  }

  return { block: result.block, local: result.local, doc: insertIntoSection(doc, sectionId, result.block) }
}
