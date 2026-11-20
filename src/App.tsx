import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrandVault } from './components/BrandVault'
import { Rail } from './components/Rail'
import { SettingsModal } from './components/SettingsModal'
import { TopBar } from './components/TopBar'
import { CarouselStudio } from './workspaces/CarouselStudio'
import { PdfStudio } from './workspaces/PdfStudio'
import { SAMPLE_CAROUSEL, SAMPLE_DOC, SAMPLE_SOURCE } from './data/sample'
import { listModels, pickDefaultModel } from './lib/ai'
import { uid } from './lib/id'
import {
  activeBrand,
  loadCarouselDraft,
  loadDocDraft,
  loadSettings,
  saveCarouselDraft,
  saveDocDraft,
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
  const [tab, setTab] = useState<StudioTab>('pdf')
  const [doc, setDoc] = useState<PdfDoc>(() => loadDocDraft() ?? SAMPLE_DOC)
  const [carousel, setCarousel] = useState<Carousel>(() => loadCarouselDraft() ?? SAMPLE_CAROUSEL)
  const [sources, setSources] = useState<Record<StudioTab, string>>({
    pdf: SAMPLE_SOURCE,
    carousel: SAMPLE_SOURCE,
  })
  const [modal, setModal] = useState<'vault' | 'settings' | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const brand = useMemo(() => activeBrand(settings), [settings])
  const catalogBootstrapped = useRef(false)

  // Replace stale/hardcoded model ids with the account's real list on first load.
  useEffect(() => {
    if (catalogBootstrapped.current) return
    catalogBootstrapped.current = true
    const provider = settings.provider
    const key = settings.keys[provider]
    if (!key.trim()) return

    let cancelled = false
    void listModels(provider, key)
      .then((models) => {
        if (cancelled || !models.length) return
        setSettings((current) => {
          const selected = current.models[provider]
          const listed = models.some((model) => model.id === selected)
          const wasCatalogued = current.catalog[provider].some((model) => model.id === selected)
          const nextModel = listed || (!wasCatalogued && selected.trim()) ? selected : pickDefaultModel(models)
          return {
            ...current,
            catalog: { ...current.catalog, [provider]: models },
            models: { ...current.models, [provider]: nextModel },
          }
        })
      })
      .catch(() => {
        /* offline or invalid key — generation surfaces the real error */
      })

    return () => {
      cancelled = true
    }
    // Runs once with the saved settings; later refreshes come from API Settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => saveSettings(settings), 220)
    return () => window.clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    const timer = window.setTimeout(() => saveDocDraft(doc), 320)
    return () => window.clearTimeout(timer)
  }, [doc])

  useEffect(() => {
    const timer = window.setTimeout(() => saveCarouselDraft(carousel), 320)
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
    <div className="app-shell">
      <Rail
        tab={tab}
        onTab={setTab}
        onOpenVault={() => setModal('vault')}
        onOpenSettings={() => setModal('settings')}
        brandName={brand.name}
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
