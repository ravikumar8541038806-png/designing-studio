import { buildModelChain, callModel, extractJson } from './ai'
import { uid } from './id'
import {
  generateAiImage,
  generateCallout,
  generateChart,
  generateDiagram,
  generateFormula,
  generateStats,
  generateSteps,
  generateTable,
  hasAi,
  hasGeminiImages,
  localTable,
} from './visuals'
import type { AppSettings, ChartKind, DiagramKind, DocBlock, PdfDoc } from '../types'

export type SuggestionCategory = 'visual' | 'exam' | 'layout'
export type SuggestionActionKind =
  | 'diagram'
  | 'chart'
  | 'stats'
  | 'image'
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
  exam: 'High-Yield',
  layout: 'Clarity',
}

const SUBJECTS: { label: string; keywords: RegExp }[] = [
  {
    label: 'Economics & Finance',
    keywords: /\b(econom\w*|inflation|deflation|stagflation|gdp|gnp|nnp|gva|demand|supply|monetary|fiscal|rbi|mpc|repo|crr|slr|budget|balance of payments|forex|reer|neer|phillips|laffer|lorenz|kuznets|bank\w*)\b/i,
  },
  {
    label: 'Biology',
    keywords: /\b(biolog\w*|cell|heart|photosynth\w*|chlorophyll|enzyme|genetic|neuron|plant|blood|atp|stroma)\b/i,
  },
  {
    label: 'Physics',
    keywords: /\b(physic\w*|kinematic|optics|lens|mirror|circuit|resistor|voltage|magnetic|thermo\w*|quantum|newton)\b/i,
  },
  {
    label: 'Business & Strategy',
    keywords: /\b(business|marketing|strategy|startup|revenue|profit|customer|brand|saas|retainer|pipeline|roi)\b/i,
  },
  {
    label: 'Climate & Geography',
    keywords: /\b(climate|warming|carbon|co2|greenhouse|glacier|monsoon|water cycle|ecosystem|renewable|solar|ocean)\b/i,
  },
  {
    label: 'Chemistry',
    keywords: /\b(chemis\w*|reaction|mole|acid|base|organic|periodic table|covalent|ionic)\b/i,
  },
  {
    label: 'Mathematics',
    keywords: /\b(math\w*|algebra|calculus|geometry|trigonometr\w*|statistic|probabilit\w*|quadratic|integral)\b/i,
  },
  {
    label: 'Polity & Governance',
    keywords: /\b(polity|constitution|parliament|lok sabha|rajya sabha|article \d+|governance|supreme court|federal)\b/i,
  },
]

export function inferSubject(doc: PdfDoc): string {
  const text = `${doc.title} ${doc.eyebrow} ${doc.subtitle} ${doc.sections.map((section) => section.heading).join(' ')} ${doc.sections
    .flatMap((section) => section.blocks)
    .map((block) => blockText(block))
    .join(' ')
    .slice(0, 6000)}`

  const scored = SUBJECTS.map((subject) => {
    const globalRe = new RegExp(subject.keywords.source, 'gi')
    return {
      label: subject.label,
      score: (text.match(globalRe) ?? []).length,
    }
  }).sort((a, b) => b.score - a.score)

  return scored[0]?.score ? scored[0].label : 'General Studies'
}

function blockText(block: DocBlock): string {
  if ('text' in block) return block.text
  if (block.type === 'callout') return `${block.title} ${block.body}`
  if (block.type === 'table') return block.rows.flat().join(' ')
  if (block.type === 'keyterms') return block.items.map((item) => `${item.term} ${item.definition}`).join(' ')
  if (block.type === 'chart') return block.title
  if (block.type === 'stats') return `${block.title} ${block.items.map((i) => `${i.value} ${i.label}`).join(' ')}`
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
    ['chart', 'diagram', 'image', 'timeline', 'math', 'table', 'stats'].includes(block.type),
  )
}

function hasKind(doc: PdfDoc, kind: DocBlock['type']): boolean {
  return doc.sections.some((section) => section.blocks.some((block) => block.type === kind))
}

function isSubstantiveHeading(heading: string): boolean {
  const clean = heading.trim()
  return clean.length >= 6 && !/^[A-Z0-9_=+\-*/()]+$/.test(clean)
}

/**
 * Context-aware local advisor. Produces subject-accurate, zero-hallucination
 * recommendations grounded in the document's real sections.
 */
export function scanLocalSuggestions(doc: PdfDoc, settings?: AppSettings): Suggestion[] {
  const subject = inferSubject(doc)
  const items: Suggestion[] = []
  const push = (suggestion: Omit<Suggestion, 'id'>) => {
    if (items.length >= 6) return
    if (items.some((entry) => entry.sectionId === suggestion.sectionId && entry.action.kind === suggestion.action.kind)) return
    items.push({ id: uid('sg'), ...suggestion })
  }

  // 1. Visual / diagram suggestion for text-heavy sections without visuals
  doc.sections.forEach((section, index) => {
    const text = sectionCharacters(doc, section.id)
    if (!hasVisual(section) && text > 200 && isSubstantiveHeading(section.heading)) {
      const cleanHeading = section.heading.replace(/^\d+\.\s*/, '')
      const diagramKind: DiagramKind = /flow|cycle|transmission|circulat/i.test(cleanHeading) ? 'cycle' : 'mindmap'
      push({
        category: 'visual',
        title: `Add a concept visual to “${cleanHeading}”`,
        detail: `Section ${index + 1} is text-only. A crisp ${subject.split(' ')[0]} visual anchors the key relationships.`,
        sectionId: section.id,
        sectionHeading: section.heading,
        action: {
          kind: 'diagram',
          diagram: diagramKind,
          prompt: cleanHeading,
        },
      })
    }

    const dense = section.blocks.find((block) => block.type === 'paragraph' && block.text.length > 380)
    if (dense && isSubstantiveHeading(section.heading)) {
      const cleanHeading = section.heading.replace(/^\d+\.\s*/, '')
      push({
        category: 'layout',
        title: `Break down dense prose in “${cleanHeading}”`,
        detail: 'Long paragraphs slow scanning. Converting into crisp numbered steps improves readability.',
        sectionId: section.id,
        sectionHeading: section.heading,
        action: { kind: 'process', prompt: `Break ${cleanHeading} into clear steps` },
      })
    }
  })

  // 2. KPI / Stats snapshot if none exists
  if (!hasKind(doc, 'stats') && doc.sections[0]) {
    const s = doc.sections[0]
    push({
      category: 'visual',
      title: `Add a KPI / Metrics Snapshot`,
      detail: 'A 3-card infographic strip highlights core targets and numbers immediately on page 2.',
      sectionId: s.id,
      sectionHeading: s.heading,
      action: { kind: 'stats', prompt: `${doc.title} key metrics and indicators` },
    })
  }

  // 3. AI Editorial Illustration when Gemini images are connected
  if (!hasKind(doc, 'image') && settings && hasGeminiImages(settings) && doc.sections[0]) {
    const s = doc.sections[0]
    push({
      category: 'visual',
      title: `Generate an editorial visual for “${doc.title.slice(0, 32)}”`,
      detail: 'Creates a crisp custom illustration with zero embedded text distortion.',
      sectionId: s.id,
      sectionHeading: s.heading,
      action: { kind: 'image', prompt: `Editorial visual representing ${doc.title} (${subject})` },
    })
  }

  // 4. Formula sheet if relevant subject lacks formulas
  if (!hasKind(doc, 'math') && /Physics|Economics|Business|Mathematics|Chemistry|Biology/.test(subject)) {
    const section = doc.sections[0]
    if (section) {
      push({
        category: 'exam',
        title: `Add a ${subject.split(' ')[0]} formula cheat-sheet`,
        detail: 'A single formula summary box gives readers an instant revision reference.',
        sectionId: section.id,
        sectionHeading: section.heading,
        action: { kind: 'formula', prompt: `${subject} formula cheat sheet for ${doc.title}` },
      })
    }
  }

  // 5. Comparison table if document has key terms but no table
  const termSection = doc.sections.find((section) =>
    section.blocks.some((block) => block.type === 'keyterms' && block.items.length >= 2),
  )
  if (termSection && !hasKind(doc, 'table')) {
    const terms = termSection.blocks.find((block) => block.type === 'keyterms')
    const names = terms && terms.type === 'keyterms' ? terms.items.slice(0, 2).map((item) => item.term) : []
    push({
      category: 'exam',
      title: names.length === 2 ? `Compare ${names[0]} vs ${names[1]}` : `Add comparison table to “${termSection.heading}”`,
      detail: 'Contrast tables clarify subtle distinctions in seconds.',
      sectionId: termSection.id,
      sectionHeading: termSection.heading,
      action: {
        kind: 'table',
        prompt: names.length === 2 ? `Difference between ${names[0]} and ${names[1]}` : `Comparison table for ${termSection.heading}`,
      },
    })
  }

  // 6. Callout booster if a section lacks callouts
  const examSection = doc.sections.find(
    (section) => isSubstantiveHeading(section.heading) && !section.blocks.some((block) => block.type === 'callout'),
  )
  if (examSection) {
    const cleanHeading = examSection.heading.replace(/^\d+\.\s*/, '')
    push({
      category: 'exam',
      title: `Add key takeaway box to “${cleanHeading}”`,
      detail: 'Highlights high-yield traps or takeaways in an accented callout card.',
      sectionId: examSection.id,
      sectionHeading: examSection.heading,
      action: { kind: 'callout', preset: 'tip', prompt: `Key takeaway for ${cleanHeading}` },
    })
  }

  return items.slice(0, 6)
}

const VALID_KINDS: SuggestionActionKind[] = ['diagram', 'chart', 'stats', 'image', 'formula', 'table', 'callout', 'process']

export async function scanSuggestions(
  settings: AppSettings,
  doc: PdfDoc,
): Promise<{ items: Suggestion[]; local: boolean }> {
  const local = scanLocalSuggestions(doc, settings)
  if (!hasAi(settings)) return { items: local, local: true }

  const outline = doc.sections
    .map((section, index) => {
      const text = section.blocks.map(blockText).join(' ').slice(0, 700)
      return `[${index + 1}] id=${section.id} | ${section.heading}\n${text}`
    })
    .join('\n\n')

  try {
    const chain = buildModelChain(settings)
    const text = await callModel({
      provider: settings.provider,
      apiKey: settings.keys[settings.provider],
      model: chain[0] ?? settings.models[settings.provider],
      system:
        'You are a senior publication editor and instructional-design director. Return a single valid JSON object and nothing else.',
      user: `Review this ${inferSubject(doc)} document and return 4 to 6 specific, high-impact visual or clarity upgrades.
Title: ${doc.title}

SECTIONS
${outline.slice(0, 9000)}

Return JSON:
{"suggestions":[{
  "category":"visual|exam|layout",
  "title":"imperative, max 9 words, names the section",
  "detail":"one sentence on the clarity gained, max 24 words",
  "sectionId":"copy an exact id above",
  "action":{"kind":"diagram|chart|stats|image|formula|table|callout|process","prompt":"precise self-contained generation brief","diagram":"flow|cycle|mindmap","chart":"bar|bar3d|line|donut|area|compare","preset":"exam|tip|summary|warning"}
}]}
Rules:
- Name real content from the document — never generic filler.
- Suggest "image" for real-world scenes/concepts and "diagram" strictly for flows, cycles, or mindmaps.
- Do not suggest elements the section already has.`,
      maxTokens: 2400,
      fallbackModels: chain.slice(1),
      validateJson: true,
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
      if (prompt.length < 6) return
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
          preset: String(actionRecord.preset ?? 'tip') as SuggestionAction['preset'],
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
      result = await generateDiagram(settings, action.prompt, action.diagram || 'mindmap', doc, sectionId)
      break
    case 'chart':
      result = await generateChart(settings, action.prompt, action.chart || 'bar')
      break
    case 'stats':
      result = await generateStats(settings, action.prompt, doc)
      break
    case 'image': {
      const url = await generateAiImage(settings, action.prompt, { style: 'photorealistic', aspect: '16:9' })
      result = {
        block: {
          id: uid('img'),
          type: 'image',
          url,
          caption: `Fig: ${suggestion.sectionHeading.replace(/^\d+\.\s*/, '')}`,
          width: 100,
          align: 'center',
          rounded: true,
          prompt: action.prompt,
          style: 'photorealistic',
          aspect: '16:9',
        },
        local: false,
      }
      break
    }
    case 'formula':
      result = await generateFormula(settings, action.prompt, 'sheet')
      break
    case 'table':
      result = await generateTable(settings, action.prompt, doc, sectionId)
      break
    case 'callout':
      result = await generateCallout(settings, action.prompt, action.preset || 'tip', doc, sectionId)
      break
    case 'process':
      result = await generateSteps(settings, action.prompt, doc, sectionId)
      break
    default:
      result = { block: localTable(action.prompt, doc, sectionId), local: true }
  }

  return { block: result.block, local: result.local, doc: insertIntoSection(doc, sectionId, result.block) }
}
