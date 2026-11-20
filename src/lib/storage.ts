import { uid } from './id'
import { DEFAULT_CATALOG } from '../theme/presets'
import type { AppSettings, BrandPreset, Carousel, PdfDoc } from '../types'

const SETTINGS_KEY = 'clientforge.settings.v1'
const PDF_DRAFT_KEY = 'clientforge.draft.pdf.v1'
const CAROUSEL_DRAFT_KEY = 'clientforge.draft.carousel.v1'

export function createBrand(partial: Partial<BrandPreset> = {}): BrandPreset {
  return {
    id: uid('brand'),
    name: 'Default Brand',
    brandName: 'Your Studio',
    primary: '#3b5bdb',
    accent: '#f59e0b',
    footer: 'Prepared for client review',
    handle: '@yourhandle',
    watermark: 'PREVIEW ONLY',
    logo: null,
    updatedAt: Date.now(),
    ...partial,
  }
}

const defaultBrand = createBrand({ id: 'brand_default', name: 'Studio Default' })

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  keys: { gemini: '', anthropic: '' },
  models: { gemini: DEFAULT_CATALOG.gemini[0].id, anthropic: DEFAULT_CATALOG.anthropic[0].id },
  catalog: DEFAULT_CATALOG,
  language: 'en',
  depth: 2,
  slideCount: 7,
  includeMcqs: true,
  layout: 'academic',
  headerStyle: 'classic',
  fontPairing: 'inter',
  paymentLock: false,
  brands: [defaultBrand],
  activeBrandId: defaultBrand.id,
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadSettings(): AppSettings {
  const stored = readJson<Partial<AppSettings>>(SETTINGS_KEY)
  if (!stored) return DEFAULT_SETTINGS
  const brands =
    Array.isArray(stored.brands) && stored.brands.length ? stored.brands : DEFAULT_SETTINGS.brands
  const catalog = {
    gemini: stored.catalog?.gemini?.length ? stored.catalog.gemini : DEFAULT_CATALOG.gemini,
    anthropic: stored.catalog?.anthropic?.length ? stored.catalog.anthropic : DEFAULT_CATALOG.anthropic,
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    keys: { ...DEFAULT_SETTINGS.keys, ...stored.keys },
    models: { ...DEFAULT_SETTINGS.models, ...stored.models },
    catalog,
    brands,
    activeBrandId:
      stored.activeBrandId && brands.some((b) => b.id === stored.activeBrandId)
        ? stored.activeBrandId
        : brands[0].id,
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage full or blocked — settings simply stay session-only */
  }
}

export function loadDocDraft(): PdfDoc | null {
  return readJson<PdfDoc>(PDF_DRAFT_KEY)
}

export function saveDocDraft(doc: PdfDoc): void {
  try {
    localStorage.setItem(PDF_DRAFT_KEY, JSON.stringify(doc))
  } catch {
    /* ignore quota errors */
  }
}

export function loadCarouselDraft(): Carousel | null {
  return readJson<Carousel>(CAROUSEL_DRAFT_KEY)
}

export function saveCarouselDraft(carousel: Carousel): void {
  try {
    localStorage.setItem(CAROUSEL_DRAFT_KEY, JSON.stringify(carousel))
  } catch {
    /* ignore quota errors */
  }
}

export function activeBrand(settings: AppSettings): BrandPreset {
  return settings.brands.find((b) => b.id === settings.activeBrandId) ?? settings.brands[0]
}
