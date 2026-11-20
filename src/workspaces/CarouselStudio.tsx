import { useRef, useState } from 'react'
import { BrandPanel } from '../components/BrandPanel'
import { DesignPane } from '../components/DesignPane'
import { SourcePanel } from '../components/SourcePanel'
import { SlideDeck } from '../render/Slides'
import { generateCarousel } from '../lib/ai'
import { addSlide, removeSlide } from '../lib/docOps'
import { exportSingleSlide, exportSlidesZip, slugify } from '../lib/export'
import { extractPdfText } from '../lib/pdfExtract'
import type { AppSettings, BrandPreset, Carousel } from '../types'

interface Props {
  settings: AppSettings
  onSettings: (settings: AppSettings) => void
  brand: BrandPreset
  carousel: Carousel
  onCarousel: (carousel: Carousel) => void
  source: string
  onSource: (value: string) => void
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void
  onOpenSettings: () => void
}

export function CarouselStudio({
  settings,
  onSettings,
  brand,
  carousel,
  onCarousel,
  source,
  onSource,
  notify,
  onOpenSettings,
}: Props) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState<{ page: number; total: number } | null>(null)
  const [extracted, setExtracted] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const deckRef = useRef<HTMLDivElement>(null)

  const slideNodes = () =>
    Array.from(deckRef.current?.querySelectorAll<HTMLElement>('[data-slide]') ?? [])

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const next = await generateCarousel(settings, source, brand)
      onCarousel(next)
      notify(`Carousel ready — ${next.slides.length} slides`, 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message}${'hint' in error && error.hint ? ` ${String(error.hint)}` : ''}`
          : 'Generation failed.'
      setGenError(message)
      notify('Generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleExtract = async (file: File) => {
    setExtracting({ page: 0, total: 1 })
    setExtracted(null)
    try {
      const result = await extractPdfText(file, (page, total) => setExtracting({ page, total }))
      if (!result.text.trim()) {
        notify('That PDF has no selectable text (it looks scanned).', 'error')
        return
      }
      onSource(result.text)
      setExtracted(`${file.name} · ${result.pages} pages${result.truncated ? ' · trimmed' : ''}`)
      notify('PDF text extracted', 'success')
    } catch {
      notify('Could not read that PDF.', 'error')
    } finally {
      setExtracting(null)
    }
  }

  const baseName = () => `${slugify(brand.brandName)}-carousel-${slugify(carousel.title)}`

  const handleZip = async () => {
    const nodes = slideNodes()
    setBusy('Preparing slides…')
    try {
      await exportSlidesZip(nodes, baseName(), (done, total, label) => {
        setBusy(total ? `${label}…` : label)
        if (done === total) setBusy('Packing ZIP…')
      })
      notify('Carousel ZIP exported', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Carousel export failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleSlide = async (index: number) => {
    const node = slideNodes()[index]
    if (!node) return
    setBusy(`Slide ${index + 1}…`)
    try {
      await exportSingleSlide(node, `${baseName()}-slide-${String(index + 1).padStart(2, '0')}`)
      notify(`Slide ${index + 1} exported`, 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Slide export failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="studio-grid">
      <aside className="pane pane--left glass">
        <div className="pane__scroll">
          <SourcePanel
            mode="carousel"
            source={source}
            onSourceChange={onSource}
            settings={settings}
            onPatch={(patch) => onSettings({ ...settings, ...patch })}
            generating={generating}
            onGenerate={handleGenerate}
            error={genError}
            onOpenSettings={onOpenSettings}
            onExtractPdf={handleExtract}
            extracting={extracting}
            extracted={extracted}
          />
          <hr className="pane__hr" />
          <BrandPanel settings={settings} onChange={onSettings} />
        </div>
      </aside>

      <section className="pane pane--center">
        <div className="preview-bar glass">
          <span className="preview-bar__title">Live preview</span>
          <span className="preview-bar__hint">Edit headlines, bullets and the CTA inline</span>
          <span className="preview-bar__spacer" />
          <span className="pill">{carousel.slides.length} slides · 1080 × 1350</span>
          {settings.paymentLock ? <span className="pill pill--warn">Draft watermark</span> : null}
        </div>
        <div className="preview-canvas preview-canvas--deck" ref={deckRef}>
          <SlideDeck
            carousel={carousel}
            settings={settings}
            brand={brand}
            onChange={onCarousel}
            onRemoveSlide={(index) => onCarousel(removeSlide(carousel, index))}
          />
        </div>
      </section>

      <aside className="pane pane--right glass">
        <div className="pane__scroll">
          <DesignPane
            mode="carousel"
            settings={settings}
            onPatch={(patch) => onSettings({ ...settings, ...patch })}
            pageCount={0}
            slideCount={carousel.slides.length}
            busy={busy}
            onExportPdf={() => undefined}
            onPrint={() => undefined}
            onExportZip={handleZip}
            onExportSlide={handleSlide}
            onAddSlide={() => onCarousel(addSlide(carousel, carousel.slides.length))}
          />
        </div>
      </aside>
    </div>
  )
}
