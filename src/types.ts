export type ProviderId = 'gemini' | 'anthropic'
export type StudioTab = 'pdf' | 'carousel'
export type LanguageId = 'en' | 'hi' | 'hinglish'

export type VisualStyleId =
  | 'photorealistic'
  | '3d-illustration'
  | '2d-vector'
  | 'textbook-diagram'
  | 'cinematic-cover'

export type AspectRatioId = '16:9' | '4:3' | '1:1' | '3:4'
export type DocFormatId = 'auto' | 'report' | 'coaching' | 'proposal' | 'playbook'
export type InputModeId = 'auto' | 'prompt' | 'source'
export type SlideFormatId = 'portrait' | 'square' | 'deck'

export type LayoutId =
  // Education & exam notes
  | 'academic-clean'
  | 'coaching-handout'
  | 'two-column-textbook'
  | 'exam-cheatsheet'
  // Business & corporate
  | 'executive-report'
  | 'agency-proposal'
  | 'client-case-study'
  | 'consulting-whitepaper'
  // Creators & eBooks
  | 'editorial-magazine'
  | 'lead-magnet'
  | 'minimalist-playbook'
  // Operations & docs
  | 'sop-manual'
  | 'checklist-workbook'

export type SlideLayoutId = 'academic' | 'minimal' | 'editorial' | 'executive'

export type HeaderStyleId = 'classic' | 'band' | 'rule' | 'stack'
export type FontPairingId = 'inter' | 'poppins' | 'editorial' | 'serif' | 'hindi'

export type ThemeId =
  // Snow & crisp light
  | 'pure-snow'
  | 'paper-ivory'
  | 'cool-alabaster'
  | 'arctic-minimal'
  // Natural & organic
  | 'forest-sage'
  | 'warm-sand'
  | 'terracotta-clay'
  | 'ocean-mist'
  // Aesthetic & editorial
  | 'espresso-cream'
  | 'matcha-minimal'
  | 'muted-lavender'
  | 'dusty-rose'
  // Dark & luxury
  | 'dark-executive'
  | 'obsidian-gold'
  | 'midnight-slate'
  | 'deep-emerald-night'
  // Academic & corporate
  | 'royal-navy'
  | 'oxford-crimson'
  | 'slate-professional'

export interface ModelOption {
  id: string
  label: string
  note?: string
}

export interface BrandPreset {
  id: string
  name: string
  brandName: string
  primary: string
  accent: string
  footer: string
  handle: string
  watermark: string
  logo: string | null
  updatedAt: number
}

export type CalloutKind = 'fact' | 'exam' | 'note' | 'tip' | 'warning' | 'quote' | 'summary'
export type CalloutIcon = 'spark' | 'alert' | 'bulb' | 'pin' | 'quote' | 'check' | 'book' | 'shield'

export type ChartKind = 'bar' | 'bar3d' | 'line' | 'donut' | 'hcompare' | 'area' | 'compare'

export interface StatMetric {
  id: string
  value: string
  label: string
  delta?: string
}

export type DiagramKind = 'flow' | 'cycle' | 'mindmap' | 'labeled' | 'schematic' | 'figure'

export type DiagramShape = 'box' | 'pill' | 'ellipse' | 'diamond' | 'circle' | 'note'

/** Textbook colour coding: red = oxygenated, blue = deoxygenated, etc. */
export type DiagramTone = 'oxygenated' | 'deoxygenated' | 'tissue' | 'highlight' | 'neutral'

/** Where a label sits relative to the artwork. */
export type DiagramSide = 'inside' | 'left' | 'right'

export interface DiagramNode {
  id: string
  label: string
  detail?: string
  shape?: DiagramShape
  /** Scientific schematic colour role; ignored by process diagrams. */
  tone?: DiagramTone
  /** left/right place the label outside the art with a leader line. */
  side?: DiagramSide
  /** Small circled key number (1, 2, 3 …) printed beside the label. */
  badge?: number
  /** Rotation in degrees, for arched vessels. */
  rotate?: number
  /** Anchor point (percent of the plate artwork) that a leader line starts from. */
  anchorX?: number
  anchorY?: number
  /** Optional absolute position in percent of the diagram canvas. */
  x?: number
  y?: number
  w?: number
  h?: number
}

export interface DiagramEdge {
  from: string
  to: string
  label?: string
  dashed?: boolean
  /** Trace colour for blood/fluid flow arrows. */
  tone?: DiagramTone
  /** Sideways bend of a flow arrow, in SVG units (negative bends the other way). */
  curve?: number
  width?: number
}

export interface MathItem {
  id: string
  label: string
  latex: string
}

export interface TimelineItem {
  id: string
  date: string
  title: string
  description: string
}

export type DocBlock =
  | { id: string; type: 'lead'; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'subheading'; text: string }
  | { id: string; type: 'bullets'; items: string[] }
  | { id: string; type: 'numbered'; items: string[] }
  | { id: string; type: 'keyterms'; items: { term: string; definition: string }[] }
  | { id: string; type: 'table'; caption: string; columns: string[]; rows: string[][] }
  | {
      id: string
      type: 'callout'
      kind: CalloutKind
      title: string
      body: string
      icon?: CalloutIcon
      accent?: string
    }
  | { id: string; type: 'quote'; text: string; cite: string }
  | {
      id: string
      type: 'image'
      url: string
      caption: string
      width: number
      align: 'left' | 'center' | 'right'
      rounded: boolean
      prompt?: string
      style?: VisualStyleId
      aspect?: AspectRatioId
      fit?: 'contain' | 'cover'
      generating?: boolean
    }
  | {
      id: string
      type: 'chart'
      chart: ChartKind
      title: string
      labels: string[]
      values: number[]
      /** Optional second series, used by the comparison chart. */
      values2?: number[]
      accent: string
      accent2: string
      unit?: string
      seriesA?: string
      seriesB?: string
      note?: string
    }
  | {
      id: string
      type: 'stats'
      title: string
      items: StatMetric[]
    }
  | {
      id: string
      type: 'timeline'
      title: string
      orientation: 'vertical' | 'horizontal'
      items: TimelineItem[]
    }
  | {
      id: string
      type: 'diagram'
      diagram: DiagramKind
      title: string
      caption: string
      nodes: DiagramNode[]
      edges: DiagramEdge[]
      accent: string
      /** Named anatomical artwork drawn behind the labels (e.g. 'heart'). */
      plate?: string
      /** Uploaded or AI-generated illustration used as the figure artwork. */
      plateImage?: string
      /** height / width of plateImage, so the labels line up with the picture. */
      plateAspect?: number
    }
  | {
      id: string
      type: 'math'
      title: string
      latex: string
      note: string
      /** Single display equation, or a multi-row cheat-sheet card. */
      layout: 'card' | 'sheet'
      items: MathItem[]
    }

export interface DocSection {
  id: string
  heading: string
  blocks: DocBlock[]
}

export interface McqItem {
  id: string
  question: string
  options: string[]
  answer: string
  explanation: string
}

export interface PdfDoc {
  title: string
  eyebrow: string
  subtitle: string
  sections: DocSection[]
  mcqs: McqItem[]
  coverImage?: string
  coverImagePrompt?: string
  coverImageLayout?: 'banner' | 'full' | 'side'
}

export type SlideKind = 'hook' | 'idea' | 'cta'

export interface Slide {
  id: string
  kind: SlideKind
  eyebrow: string
  headline: string
  subhook: string
  points: string[]
  numbered: boolean
  cta: string
  image?: string
  imagePrompt?: string
  imageLayout?: 'top' | 'split' | 'background'
}

export interface Carousel {
  title: string
  slides: Slide[]
}

export interface AppSettings {
  provider: ProviderId
  keys: Record<ProviderId, string>
  models: Record<ProviderId, string>
  catalog: Record<ProviderId, ModelOption[]>
  /** Automatically pick and fail over across the best stable models. */
  autoModel: boolean
  /** Automatically generate planned AI visuals/covers after structuring. */
  autoVisuals: boolean
  /** Document archetype for prompt-driven & formatted PDFs. */
  docFormat: DocFormatId
  /** Auto-detect prompt vs pasted notes, or force either workflow. */
  inputMode: InputModeId
  /** Output dimensions for Carousels & Pitch Decks. */
  slideFormat: SlideFormatId
  language: LanguageId
  depth: number
  slideCount: number
  includeMcqs: boolean
  /** PDF page architecture. */
  layout: LayoutId
  /** Carousel card architecture (kept separate from the PDF library). */
  slideLayout: SlideLayoutId
  /** Colour + mood theme for body pages. */
  themeId: ThemeId
  /** Theme used on the front cover when separateCoverTheme is on. */
  coverThemeId: ThemeId
  separateCoverTheme: boolean
  headerStyle: HeaderStyleId
  fontPairing: FontPairingId
  paymentLock: boolean
  /** Parse pasted text in the browser and skip the AI call entirely. */
  directMode: boolean
  /** Send AI calls through the app's Cloudflare Worker so no key lives in this browser. */
  proxyEnabled: boolean
  /** Worker base URL. Empty means same-origin /api/ai. */
  proxyUrl: string
  /** Optional shared secret, only when the Worker sets PROXY_TOKEN. */
  proxyToken: string
  brands: BrandPreset[]
  activeBrandId: string | null
}
