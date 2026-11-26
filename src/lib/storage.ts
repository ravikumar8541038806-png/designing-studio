import { uid } from './id'
import { loadDraft, saveDraft } from './draftDb'
import { LAYOUTS, SLIDE_LAYOUTS, DEFAULT_CATALOG } from '../theme/presets'
import { isKnownTheme } from '../theme/themes'
import type { AppSettings, BrandPreset, Carousel, ModelOption, PdfDoc } from '../types'

/**
 * Model ids that shipped as defaults before the live loader existed. They were
 * never real API models, so a catalog made only of these is replaced on load.
 */
const LEGACY_GEMINI_IDS = new Set(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-hydrogen'])
const LEGACY_ANTHROPIC_IDS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'])

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
  autoModel: true,
  autoVisuals: true,
  docFormat: 'auto',
  inputMode: 'auto',
  slideFormat: 'portrait',
  language: 'en',
  depth: 2,
  slideCount: 7,
  includeMcqs: true,
  layout: 'academic-clean',
  slideLayout: 'academic',
  themeId: 'pure-snow',
  coverThemeId: 'pure-snow',
  separateCoverTheme: false,
  headerStyle: 'classic',
  fontPairing: 'inter',
  fontSize: 13.5,
  headingScale: 1.0,
  lineHeight: 1.55,
  pageMargin: 56,
  pageSize: 'a4',
  showCoverToc: true,
  paymentLock: false,
  directMode: false,
  proxyEnabled: false,
  proxyUrl: '',
  proxyToken: '',
  brands: [defaultBrand],
  activeBrandId: defaultBrand.id,
}

/** V1 shipped four layouts and no separate theme model. Map them onto V2. */
const LEGACY_LAYOUTS: Record<string, { layout: AppSettings['layout']; theme?: AppSettings['themeId'] }> = {
  academic: { layout: 'academic-clean' },
  minimal: { layout: 'minimalist-playbook' },
  editorial: { layout: 'editorial-magazine' },
  executive: { layout: 'executive-report', theme: 'dark-executive' },
}

function migrateLayouts(stored: Partial<AppSettings>): {
  layout: AppSettings['layout']
  themeId: AppSettings['themeId']
} {
  const rawLayout = String(stored.layout ?? '')
  const legacy = LEGACY_LAYOUTS[rawLayout]
  const layout = legacy
    ? legacy.layout
    : (LAYOUTS.find((preset) => preset.id === stored.layout)?.id ?? DEFAULT_SETTINGS.layout)
  const layoutTheme = legacy?.theme
  const knownTheme = isKnownTheme(stored.themeId)
  const themeId = knownTheme
    ? stored.themeId!
    : (layoutTheme ?? DEFAULT_SETTINGS.themeId)
  return { layout, themeId }
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
  const storedGemini: ModelOption[] = stored.catalog?.gemini ?? []
  const legacyGeminiSeed =
    storedGemini.length > 0 &&
    storedGemini.some((model) => LEGACY_GEMINI_IDS.has(model.id)) &&
    !storedGemini.some((model) => model.note === 'Live from provider')

  const geminiCatalog = legacyGeminiSeed
    ? DEFAULT_CATALOG.gemini
    : storedGemini.length
      ? storedGemini
      : DEFAULT_CATALOG.gemini

  const storedAnthropic: ModelOption[] = stored.catalog?.anthropic ?? []
  const legacyAnthropicSeed =
    storedAnthropic.length > 0 && storedAnthropic.some((model) => LEGACY_ANTHROPIC_IDS.has(model.id))
  const anthropicCatalog = legacyAnthropicSeed
    ? DEFAULT_CATALOG.anthropic
    : storedAnthropic.length
      ? storedAnthropic
      : DEFAULT_CATALOG.anthropic

  const catalog = {
    gemini: geminiCatalog,
    anthropic: anthropicCatalog,
  }

  let models = { ...DEFAULT_SETTINGS.models, ...stored.models }
  if (legacyGeminiSeed && !geminiCatalog.some((model) => model.id === models.gemini)) {
    models = { ...models, gemini: DEFAULT_SETTINGS.models.gemini }
  }
  if (LEGACY_ANTHROPIC_IDS.has(models.anthropic)) {
    models = { ...models, anthropic: DEFAULT_SETTINGS.models.anthropic }
  }

  const { layout, themeId } = migrateLayouts(stored)
  const slideLayout = SLIDE_LAYOUTS.some((preset) => preset.id === stored.slideLayout)
    ? (stored.slideLayout as AppSettings['slideLayout'])
    : DEFAULT_SETTINGS.slideLayout
  const coverThemeId = isKnownTheme(stored.coverThemeId) ? stored.coverThemeId : themeId

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    keys: { ...DEFAULT_SETTINGS.keys, ...stored.keys },
    models,
    catalog,
    layout,
    slideLayout,
    themeId,
    coverThemeId,
    separateCoverTheme: Boolean(stored.separateCoverTheme),
    fontSize: typeof stored.fontSize === 'number' ? Math.min(18, Math.max(10, stored.fontSize)) : DEFAULT_SETTINGS.fontSize,
    headingScale:
      typeof stored.headingScale === 'number'
        ? Math.min(1.35, Math.max(0.8, stored.headingScale))
        : DEFAULT_SETTINGS.headingScale,
    lineHeight:
      typeof stored.lineHeight === 'number'
        ? Math.min(1.85, Math.max(1.3, stored.lineHeight))
        : DEFAULT_SETTINGS.lineHeight,
    pageMargin:
      typeof stored.pageMargin === 'number'
        ? Math.min(80, Math.max(36, stored.pageMargin))
        : DEFAULT_SETTINGS.pageMargin,
    pageSize: stored.pageSize === 'letter' ? 'letter' : 'a4',
    showCoverToc: stored.showCoverToc !== false,
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

export async function loadDocDraftAsync(): Promise<PdfDoc | null> {
  return loadDraft<PdfDoc>(PDF_DRAFT_KEY)
}

export async function saveDocDraftAsync(doc: PdfDoc): Promise<void> {
  await saveDraft(PDF_DRAFT_KEY, doc)
}

export async function loadCarouselDraftAsync(): Promise<Carousel | null> {
  return loadDraft<Carousel>(CAROUSEL_DRAFT_KEY)
}

export async function saveCarouselDraftAsync(carousel: Carousel): Promise<void> {
  await saveDraft(CAROUSEL_DRAFT_KEY, carousel)
}

export function activeBrand(settings: AppSettings): BrandPreset {
  return settings.brands.find((b) => b.id === settings.activeBrandId) ?? settings.brands[0]
}
