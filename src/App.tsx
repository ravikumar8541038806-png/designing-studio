import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrandVault } from './components/BrandVault'
import { Rail } from './components/Rail'
import { SettingsModal } from './components/SettingsModal'
import { TopBar } from './components/TopBar'
import { CarouselStudio } from './workspaces/CarouselStudio'
import { PdfStudio } from './workspaces/PdfStudio'
import { SAMPLE_CAROUSEL, SAMPLE_DOC, SAMPLE_SOURCE } from './data/sample'
import { listModels, pickDefaultModel } from './lib/ai'
import { configureProxy, proxyOn } from './lib/proxy'
import { uid } from './lib/id'
import {
  activeBrand,
  loadCarouselDraft,
  loadCarouselDraftAsync,
  loadDocDraft,
  loadDocDraftAsync,
  loadSettings,
  saveCarouselDraftAsync,
  saveDocDraftAsync,
  saveSettings,
} from './lib/storage'
import type { AppSettings, Carousel, PdfDoc, StudioTab } from './types'

type ToastTone = 'info' | 'success' | 'error'

interface Toast {
  id: string
  text: string
  tone: ToastTone
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  configureProxy({ enabled: settings.proxyEnabled, url: settings.proxyUrl, token: settings.proxyToken })
  const [tab, setTab] = useState<StudioTab>('pdf')
  const [doc, setDoc] = useState<PdfDoc>(() => loadDocDraft() ?? SAMPLE_DOC)
  const [carousel, setCarousel] = useState<Carousel>(() => loadCarouselDraft() ?? SAMPLE_CAROUSEL)
  const [sources, setSources] = useState<Record<StudioTab, string>>({
    pdf: SAMPLE_SOURCE,
    carousel: SAMPLE_SOURCE,
  })
  const [modal, setModal] = useState<'vault' | 'settings' | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [railCompact, setRailCompact] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1440 : false,
  )

  const brand = useMemo(() => activeBrand(settings), [settings])
  const catalogBootstrapped = useRef(false)
  const draftsHydrated = useRef(false)

  // Hydrate full drafts (including large HD images) from IndexedDB on mount.
  useEffect(() => {
    let cancelled = false
    void Promise.all([loadDocDraftAsync(), loadCarouselDraftAsync()]).then(([savedDoc, savedCarousel]) => {
      if (cancelled) return
      if (savedDoc) setDoc(savedDoc)
      if (savedCarousel) setCarousel(savedCarousel)
      draftsHydrated.current = true
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    configureProxy({ enabled: settings.proxyEnabled, url: settings.proxyUrl, token: settings.proxyToken })
  }, [settings.proxyEnabled, settings.proxyUrl, settings.proxyToken])

  useEffect(() => {
    if (catalogBootstrapped.current) return
    catalogBootstrapped.current = true
    const provider = settings.provider
    const key = settings.keys[provider]
    if (!key.trim() && !(proxyOn() && provider === 'gemini')) return

    let cancelled = false
    void listModels(provider, key)
      .then((models) => {
        if (cancelled || !models.length) return
        setSettings((current) => {
          const selected = current.models[provider]
          const listed = models.some((model) => model.id === selected)
          const wasCatalogued = current.catalog[provider].some((model) => model.id === selected)
          const nextModel =
            current.autoModel || (!listed && wasCatalogued) || !selected.trim()
              ? pickDefaultModel(models)
              : selected
          return {
            ...current,
            catalog: { ...current.catalog, [provider]: models },
            models: { ...current.models, [provider]: nextModel },
          }
        })
      })
      .catch(() => {
        /* offline or invalid key — handled silently until user generates */
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => saveSettings(settings), 220)
    return () => window.clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftsHydrated.current) void saveDocDraftAsync(doc)
    }, 320)
    return () => window.clearTimeout(timer)
  }, [doc])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftsHydrated.current) void saveCarouselDraftAsync(carousel)
    }, 320)
    return () => window.clearTimeout(timer)
  }, [carousel])

  const notify = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = uid('toast')
    setToasts((current) => [...current.slice(-2), { id, text, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4600)
  }, [])

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  const setSource = (mode: StudioTab) => (value: string) =>
    setSources((current) => ({ ...current, [mode]: value }))

  return (
    <div className={`app-shell${railCompact ? ' is-rail-compact' : ''}`}>
      <Rail
        tab={tab}
        onTab={setTab}
        onOpenVault={() => setModal('vault')}
        onOpenSettings={() => setModal('settings')}
        brandName={brand.name}
        compact={railCompact}
        onToggleCompact={() => setRailCompact((v) => !v)}
      />

      <div className="workarea">
        <TopBar
          tab={tab}
          settings={settings}
          onPatch={patchSettings}
          onOpenSettings={() => setModal('settings')}
          brandLabel={brand.brandName}
        />

        <main className="workspace">
          {tab === 'pdf' ? (
            <PdfStudio
              settings={settings}
              onSettings={setSettings}
              brand={brand}
              doc={doc}
              onDoc={setDoc}
              source={sources.pdf}
              onSource={setSource('pdf')}
              notify={notify}
              onOpenSettings={() => setModal('settings')}
            />
          ) : (
            <CarouselStudio
              settings={settings}
              onSettings={setSettings}
              brand={brand}
              carousel={carousel}
              onCarousel={setCarousel}
              source={sources.carousel}
              onSource={setSource('carousel')}
              notify={notify}
              onOpenSettings={() => setModal('settings')}
            />
          )}
        </main>
      </div>

      <SettingsModal
        open={modal === 'settings'}
        onClose={() => setModal(null)}
        settings={settings}
        onChange={setSettings}
      />
      <BrandVault
        open={modal === 'vault'}
        onClose={() => setModal(null)}
        settings={settings}
        onChange={setSettings}
      />

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  )
}
