import { useCallback, useEffect, useRef, useState } from 'react'
import { BrandPanel } from '../components/BrandPanel'
import { DesignPane } from '../components/DesignPane'
import { PreviewStage } from '../components/PreviewStage'
import { SourcePanel } from '../components/SourcePanel'
import { SlideDeck } from '../render/Slides'
import { generateCarousel } from '../lib/ai'
import { parseCarouselDirect } from '../lib/directMode'
import { addSlide, removeSlide, updateSlide } from '../lib/docOps'
import { SLIDE_DIMS } from '../lib/pagination'
import { exportSingleSlide, exportSlidesPdf, exportSlidesZip, slugify } from '../lib/export'
import { extractPdfText } from '../lib/pdfExtract'
import { useEditPulse } from '../lib/useEditPulse'
import { generateAiImage, hasGeminiImages, readImageFile, VisualError } from '../lib/visuals'
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
  const [genProgress, setGenProgress] = useState<number | null>(null)
  const [extracting, setExtracting] = useState<{ page: number; total: number } | null>(null)
  const [extracted, setExtracted] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [generatingSlideIndex, setGeneratingSlideIndex] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<Carousel[]>([])
  const [redoStack, setRedoStack] = useState<Carousel[]>([])

  const deckRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef(carousel)
  carouselRef.current = carousel
  const editPulse = useEditPulse()

  const dims = SLIDE_DIMS[settings.slideFormat] ?? SLIDE_DIMS.portrait

  const commitCarousel = useCallback(
    (next: Carousel, recordHistory = true) => {
      if (recordHistory) {
        setUndoStack((prev) => [carouselRef.current, ...prev].slice(0, 20))
        setRedoStack([])
      }
      onCarousel(next)
      editPulse.pulse()
    },
    [onCarousel, editPulse],
  )

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev
      const [target, ...rest] = prev
      setRedoStack((r) => [carouselRef.current, ...r].slice(0, 20))
      onCarousel(target)
      notify('Undid change', 'info')
      return rest
    })
  }, [onCarousel, notify])

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev
      const [target, ...rest] = prev
      setUndoStack((u) => [carouselRef.current, ...u].slice(0, 20))
      onCarousel(target)
      notify('Redid change', 'info')
      return rest
    })
  }, [onCarousel, notify])

  // Undo/Redo + Ctrl+V pastes clipboard image onto active slide
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        handleRedo()
      }
    }
    const onPaste = (event: ClipboardEvent) => {
      const el = event.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) {
        const hasImage = Array.from(event.clipboardData?.items ?? []).some(
          (item) => item.kind === 'file' && item.type.startsWith('image/'),
        )
        if (!hasImage) return
      }
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile()
      if (!file) return
      event.preventDefault()
      void (async () => {
        try {
          const url = await readImageFile(file)
          const idx = Math.min(activeSlideIndex, Math.max(0, carouselRef.current.slides.length - 1))
          commitCarousel(updateSlide(carouselRef.current, idx, { image: url }))
          notify(`Pasted image onto Slide ${idx + 1}`, 'success')
        } catch {
          notify('Could not paste that image.', 'error')
        }
      })()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', onPaste)
    }
  }, [activeSlideIndex, handleUndo, handleRedo, commitCarousel, notify])

  const slideNodes = () =>
    Array.from(deckRef.current?.querySelectorAll<HTMLElement>('[data-slide]') ?? [])

  const autoIllustrateSlides = useCallback(
    async (created: Carousel) => {
      if (!settings.autoVisuals || !hasGeminiImages(settings)) return
      const targets = created.slides
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => Boolean(s.imagePrompt) && !s.image)
        .slice(0, 3)

      for (const { s, idx } of targets) {
        setGeneratingSlideIndex(idx)
        try {
          const aspect = settings.slideFormat === 'deck' ? '16:9' : settings.slideFormat === 'square' ? '1:1' : '3:4'
          const url = await generateAiImage(settings, s.imagePrompt!, {
            style: s.kind === 'hook' ? 'cinematic-cover' : '3d-illustration',
            aspect,
          })
          onCarousel(updateSlide(carouselRef.current, idx, { image: url }))
        } catch {
          /* continue with remaining slides */
        }
      }
      setGeneratingSlideIndex(null)
    },
    [settings, onCarousel],
  )

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setGenError(null)
    setGenProgress(null)
    try {
      const next = settings.directMode
        ? parseCarouselDirect(source, { handle: brand.handle })
        : await generateCarousel(settings, source, brand, setGenProgress)
      commitCarousel(next)
      notify(
        settings.directMode
          ? `Built instantly — ${next.slides.length} slides`
          : `Deck ready — ${next.slides.length} slides`,
        'success',
      )
      if (!settings.directMode) {
        void autoIllustrateSlides(next)
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message}${'hint' in error && error.hint ? ` ${String(error.hint)}` : ''}`
          : 'Generation failed.'
      setGenError(message)
      notify(settings.directMode ? 'Direct Mode could not parse that text' : 'Could not reach AI', 'error')
    } finally {
      setGenerating(false)
      setGenProgress(null)
    }
  }

  const handleUseDirectMode = () => {
    setGenError(null)
    try {
      const next = parseCarouselDirect(source, { handle: brand.handle })
      commitCarousel(next)
      notify(`Built instantly — ${next.slides.length} slides`, 'success')
    } catch {
      notify('Direct Mode could not parse that text', 'error')
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

  const handleUploadSlideImage = async (index: number, file: File) => {
    try {
      const url = await readImageFile(file)
      commitCarousel(updateSlide(carousel, index, { image: url }))
      notify(`Image added to Slide ${index + 1}`, 'success')
    } catch {
      notify('Could not read that image.', 'error')
    }
  }

  const handleGenerateSlideImage = async (index: number) => {
    const slide = carousel.slides[index]
    if (!slide) return
    setGeneratingSlideIndex(index)
    try {
      const brief = slide.imagePrompt || `${slide.headline} — ${slide.subhook || carousel.title}`
      const aspect = settings.slideFormat === 'deck' ? '16:9' : settings.slideFormat === 'square' ? '1:1' : '3:4'
      const url = await generateAiImage(settings, brief, {
        style: slide.kind === 'hook' ? 'cinematic-cover' : '3d-illustration',
        aspect,
      })
      commitCarousel(updateSlide(carouselRef.current, index, { image: url }))
      notify(`Slide ${index + 1} visual generated`, 'success')
    } catch (error) {
      notify(error instanceof VisualError ? `${error.message} ${error.hint ?? ''}` : 'Image generation failed.', 'error')
    } finally {
      setGeneratingSlideIndex(null)
    }
  }

  const baseName = () => `${slugify(brand.brandName)}-deck-${slugify(carousel.title)}`

  const handleZip = async () => {
    const nodes = slideNodes()
    setBusy('Preparing slides…')
    try {
      await exportSlidesZip(
        nodes,
        baseName(),
        (done, total, label) => {
          setBusy(total ? `${label}…` : label)
          if (done === total) setBusy('Packing ZIP…')
        },
        settings.slideFormat,
      )
      notify('Slides ZIP exported', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Carousel export failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleDeckPdf = async () => {
    const nodes = slideNodes()
    setBusy('Preparing Deck PDF…')
    try {
      await exportSlidesPdf(nodes, baseName(), settings.slideFormat, (done, total, label) => {
        setBusy(total ? `${label}…` : label)
        if (done === total) setBusy('Saving PDF…')
      })
      notify('Deck PDF exported', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Deck PDF export failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleSlide = async (index: number) => {
    const node = slideNodes()[index]
    if (!node) return
    setBusy(`Slide ${index + 1}…`)
    try {
      await exportSingleSlide(
        node,
        `${baseName()}-slide-${String(index + 1).padStart(2, '0')}`,
        undefined,
        settings.slideFormat,
      )
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
            progress={genProgress}
            onUseDirectMode={handleUseDirectMode}
          />
          <hr className="pane__hr" />
          <BrandPanel settings={settings} onChange={onSettings} />
        </div>
      </aside>

      <section className="pane pane--center">
        <div className="preview-bar glass">
          <span className="preview-bar__dot" aria-hidden="true" />
          <span className="preview-bar__title">Live preview</span>
          <span className="preview-bar__hint">Edit inline · Ctrl+V pastes image onto Slide {activeSlideIndex + 1}</span>
          <span className="preview-bar__spacer" />
          <button
            type="button"
            className="preview-bar__btn"
            onClick={handleUndo}
            disabled={!undoStack.length}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="preview-bar__btn"
            onClick={handleRedo}
            disabled={!redoStack.length}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            ↷
          </button>
          {editPulse.state !== 'idle' ? (
            <span className={`save-badge save-badge--${editPulse.state}`} role="status">
              {editPulse.state === 'editing' ? 'Edited' : 'Saved'}
            </span>
          ) : null}
          <span className="pill">{carousel.slides.length} slides · {dims.label}</span>
          {settings.paymentLock ? <span className="pill pill--warn">Draft watermark</span> : null}
        </div>
        <div className="preview-host" ref={deckRef}>
          <PreviewStage naturalWidth={dims.width} itemSelector="[data-slide]" itemLabel="Slide">
            <SlideDeck
              carousel={carousel}
              settings={settings}
              brand={brand}
              onChange={(next) => commitCarousel(next)}
              onRemoveSlide={(index) => commitCarousel(removeSlide(carousel, index))}
              onUploadSlideImage={handleUploadSlideImage}
              onGenerateSlideImage={handleGenerateSlideImage}
              generatingSlideIndex={generatingSlideIndex}
              activeSlideIndex={activeSlideIndex}
              onSelectSlide={setActiveSlideIndex}
            />
          </PreviewStage>
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
            onExportDeckPdf={handleDeckPdf}
            onExportSlide={handleSlide}
            onAddSlide={() => commitCarousel(addSlide(carousel, carousel.slides.length))}
          />
        </div>
      </aside>
    </div>
  )
}
