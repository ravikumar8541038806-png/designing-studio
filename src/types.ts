export type ProviderId = 'gemini' | 'anthropic'
export type StudioTab = 'pdf' | 'carousel'
export type LanguageId = 'en' | 'hi' | 'hinglish'
export type LayoutId = 'academic' | 'minimal' | 'editorial' | 'executive'
export type HeaderStyleId = 'classic' | 'band' | 'rule' | 'stack'
export type FontPairingId = 'inter' | 'poppins' | 'editorial' | 'serif' | 'hindi'

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

export type CalloutKind = 'fact' | 'exam' | 'note'

export type DocBlock =
  | { id: string; type: 'lead'; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'subheading'; text: string }
  | { id: string; type: 'bullets'; items: string[] }
  | { id: string; type: 'numbered'; items: string[] }
  | { id: string; type: 'keyterms'; items: { term: string; definition: string }[] }
  | { id: string; type: 'table'; caption: string; columns: string[]; rows: string[][] }
  | { id: string; type: 'callout'; kind: CalloutKind; title: string; body: string }
  | { id: string; type: 'quote'; text: string; cite: string }

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
  language: LanguageId
  depth: number
  slideCount: number
  includeMcqs: boolean
  layout: LayoutId
  headerStyle: HeaderStyleId
  fontPairing: FontPairingId
  paymentLock: boolean
  brands: BrandPreset[]
  activeBrandId: string | null
}
