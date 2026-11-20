import type {
  FontPairingId,
  HeaderStyleId,
  LanguageId,
  LayoutId,
  ModelOption,
  ProviderId,
  SlideLayoutId,
} from '../types'

export interface LayoutPreset {
  id: LayoutId
  name: string
  description: string
  swatch: [string, string, string]
}

export interface LayoutGroup {
  id: string
  name: string
  blurb: string
  layouts: LayoutId[]
}

export const LAYOUTS: LayoutPreset[] = [
  {
    id: 'academic-clean',
    name: 'Academic Clean',
    description: 'Numbered sections, serif headings, balanced 64px margins.',
    swatch: ['#ffffff', '#0f172a', '#1d4ed8'],
  },
  {
    id: 'coaching-handout',
    name: 'Coaching Handout',
    description: 'Dense revision sheet, boxed callouts with corner tags, tight leading.',
    swatch: ['#fff7ed', '#3b2412', '#ea580c'],
  },
  {
    id: 'two-column-textbook',
    name: 'Two-Column Textbook',
    description: 'Two-column body flow, drop-cap opener, full-width section rules.',
    swatch: ['#f8f5ef', '#241f18', '#8b5e34'],
  },
  {
    id: 'exam-cheatsheet',
    name: 'Exam Cheat-Sheet',
    description: 'Ultra-dense grid, uppercase section strips, two-up key terms.',
    swatch: ['#f5f7fa', '#111827', '#dc2626'],
  },
  {
    id: 'executive-report',
    name: 'Executive Report',
    description: 'Wide margins, oversized section numerals, muted boardroom rules.',
    swatch: ['#ffffff', '#0b1b33', '#1d4ed8'],
  },
  {
    id: 'agency-proposal',
    name: 'Agency Proposal',
    description: 'Accent side rail, pill section labels, airy proposal spacing.',
    swatch: ['#ffffff', '#18181b', '#6366f1'],
  },
  {
    id: 'client-case-study',
    name: 'Client Case Study',
    description: 'Sans structure, pull-quote emphasis, wide comparison tables.',
    swatch: ['#fbfbfd', '#161616', '#0ea5e9'],
  },
  {
    id: 'consulting-whitepaper',
    name: 'Consulting Whitepaper',
    description: 'Serif reading measure, small-caps subheads, numbered figures.',
    swatch: ['#fdfdfb', '#1f2937', '#334155'],
  },
  {
    id: 'editorial-magazine',
    name: 'Modern Editorial Magazine',
    description: 'Display headlines, gradient rules, drop caps and kickers.',
    swatch: ['#ffffff', '#111111', '#ec4899'],
  },
  {
    id: 'lead-magnet',
    name: 'Lead Magnet Guide',
    description: 'Centred cover, rounded callouts, friendly numbered steps.',
    swatch: ['#f7fbff', '#0c2340', '#0ea5e9'],
  },
  {
    id: 'minimalist-playbook',
    name: 'Minimalist Playbook',
    description: 'Hairline rules, tiny caps labels, maximum whitespace.',
    swatch: ['#ffffff', '#111827', '#94a3b8'],
  },
  {
    id: 'sop-manual',
    name: 'Step-by-Step SOP Manual',
    description: 'Numbered step cards, document code header, monospace step ids.',
    swatch: ['#f8fafc', '#0f172a', '#0f766e'],
  },
  {
    id: 'checklist-workbook',
    name: 'Action Checklist Workbook',
    description: 'Checkbox bullets, ruled write-in lines, boxed section headers.',
    swatch: ['#fffdf6', '#232012', '#16a34a'],
  },
]

export const LAYOUT_GROUPS: LayoutGroup[] = [
  {
    id: 'education',
    name: 'Education & Exam Notes',
    blurb: 'Revision-first architecture for coaching, school and university material.',
    layouts: ['academic-clean', 'coaching-handout', 'two-column-textbook', 'exam-cheatsheet'],
  },
  {
    id: 'business',
    name: 'Business & Corporate',
    blurb: 'Client-facing documents with boardroom hierarchy and clean tables.',
    layouts: ['executive-report', 'agency-proposal', 'client-case-study', 'consulting-whitepaper'],
  },
  {
    id: 'creators',
    name: 'Creators & eBooks',
    blurb: 'Long-form reading and lead magnets with editorial rhythm.',
    layouts: ['editorial-magazine', 'lead-magnet', 'minimalist-playbook'],
  },
  {
    id: 'operations',
    name: 'Operations & Docs',
    blurb: 'Process, checklists and internal runbooks that people actually use.',
    layouts: ['sop-manual', 'checklist-workbook'],
  },
]

export interface SlideLayoutPreset {
  id: SlideLayoutId
  name: string
  description: string
  swatch: [string, string, string]
}

export const SLIDE_LAYOUTS: SlideLayoutPreset[] = [
  {
    id: 'academic',
    name: 'Academic Paper',
    description: 'Warm paper, serif headlines, quiet footers.',
    swatch: ['#f6f4ef', '#14161a', '#0f766e'],
  },
  {
    id: 'minimal',
    name: 'Modern Minimal',
    description: 'White canvas, hairline structure, tiny caps.',
    swatch: ['#ffffff', '#111827', '#94a3b8'],
  },
  {
    id: 'editorial',
    name: 'Bold Editorial',
    description: 'Colour wash, oversized display type, gradient accents.',
    swatch: ['#ffffff', '#111111', '#ec4899'],
  },
  {
    id: 'executive',
    name: 'Dark Executive',
    description: 'Charcoal canvas, luminous accent, premium feel.',
    swatch: ['#0f1115', '#f4f6fb', '#7c9cff'],
  },
]

export interface HeaderPreset {
  id: HeaderStyleId
  name: string
  description: string
}

export const HEADER_STYLES: HeaderPreset[] = [
  { id: 'classic', name: 'Classic', description: 'Logo left, document meta right, thin rule.' },
  { id: 'band', name: 'Colour Band', description: 'Solid brand band across the top edge.' },
  { id: 'rule', name: 'Hairline', description: 'Editorial double rule, no fills.' },
  { id: 'stack', name: 'Stacked', description: 'Centred brand mark with small caps.' },
]

export interface FontPreset {
  id: FontPairingId
  name: string
  heading: string
  body: string
  headingStack: string
  bodyStack: string
  note: string
}

const DEVANAGARI = "'Noto Sans Devanagari'"

export const FONT_PAIRINGS: FontPreset[] = [
  {
    id: 'inter',
    name: 'Inter / Inter',
    heading: 'Inter',
    body: 'Inter',
    headingStack: `'Inter', ${DEVANAGARI}, -apple-system, sans-serif`,
    bodyStack: `'Inter', ${DEVANAGARI}, -apple-system, sans-serif`,
    note: 'Neutral, screen-first, safest for dense notes.',
  },
  {
    id: 'poppins',
    name: 'Poppins / Inter',
    heading: 'Poppins',
    body: 'Inter',
    headingStack: `'Poppins', ${DEVANAGARI}, sans-serif`,
    bodyStack: `'Inter', ${DEVANAGARI}, sans-serif`,
    note: 'Friendly geometric headings for carousels and eBooks.',
  },
  {
    id: 'editorial',
    name: 'Playfair / Inter',
    heading: 'Playfair Display',
    body: 'Inter',
    headingStack: `'Playfair Display', ${DEVANAGARI}, Georgia, serif`,
    bodyStack: `'Inter', ${DEVANAGARI}, sans-serif`,
    note: 'High-contrast display headings for editorial layouts.',
  },
  {
    id: 'serif',
    name: 'Source Serif / Inter',
    heading: 'Source Serif 4',
    body: 'Inter',
    headingStack: `'Source Serif 4', ${DEVANAGARI}, Georgia, serif`,
    bodyStack: `'Inter', ${DEVANAGARI}, sans-serif`,
    note: 'Academic reading texture, still crisp on print.',
  },
  {
    id: 'hindi',
    name: 'Noto Devanagari / Noto Devanagari',
    heading: 'Noto Sans Devanagari',
    body: 'Noto Sans Devanagari',
    headingStack: `${DEVANAGARI}, 'Inter', sans-serif`,
    bodyStack: `${DEVANAGARI}, 'Inter', sans-serif`,
    note: 'Crisp conjuncts and matras for Hindi and Hinglish.',
  },
]

export interface LanguagePreset {
  id: LanguageId
  label: string
  instruction: string
  sample: string
}

export const LANGUAGES: LanguagePreset[] = [
  {
    id: 'en',
    label: 'English',
    instruction:
      'Write every field in clear, natural English. Keep technical terms in English.',
    sample: 'The engine of life',
  },
  {
    id: 'hi',
    label: 'हिंदी',
    instruction:
      'Write every field in Hindi using Devanagari script. Never transliterate Hindi into Latin characters. Only unavoidable product or technical terms may stay in English, and they must sit inside Devanagari sentences naturally.',
    sample: 'जीवन का इंजन',
  },
  {
    id: 'hinglish',
    label: 'Hinglish',
    instruction:
      'Write in natural Hinglish: Hindi grammar and sentence flow written in Devanagari, with common English technical words kept in Latin script (for example: "Data science के लिए Python सीखें"). Do not write fully romanised Hindi.',
    sample: 'Life का engine',
  },
]

export interface ProviderPreset {
  id: ProviderId
  name: string
  short: string
  keyLabel: string
  keyUrl: string
  note: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'Gemini',
    keyLabel: 'Google AI Studio API key',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Direct browser calls are supported by Google.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    short: 'Claude',
    keyLabel: 'Anthropic API key',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Uses the browser-access header. Disabled for ZDR organisations.',
  },
]

/**
 * Starting point for the model picker. The list can be refreshed from the
 * provider at any time, and a custom model id can always be typed in, so no
 * model name is baked into the production flow.
 */
export const DEFAULT_CATALOG: Record<ProviderId, ModelOption[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Recommended · fastest stable Flash' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'Fastest · low cost' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Reasoning · slower' },
  ],
  anthropic: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Balanced drafting' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Deepest reasoning' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest' },
  ],
}

export const DEPTH_OPTIONS = [
  { value: 1, label: 'Concise', hint: 'Tight revision sheet' },
  { value: 2, label: 'Standard', hint: 'Balanced eBook chapter' },
  { value: 3, label: 'Deep', hint: 'Full teaching notes' },
]

export function layoutPreset(id: LayoutId): LayoutPreset {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]
}

export function slideLayoutPreset(id: SlideLayoutId): SlideLayoutPreset {
  return SLIDE_LAYOUTS.find((l) => l.id === id) ?? SLIDE_LAYOUTS[0]
}

export function fontPreset(id: FontPairingId): FontPreset {
  return FONT_PAIRINGS.find((f) => f.id === id) ?? FONT_PAIRINGS[0]
}

export function languagePreset(id: LanguageId): LanguagePreset {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]
}

export function providerPreset(id: ProviderId): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}
