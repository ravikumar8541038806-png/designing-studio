import { useRef, useState } from 'react'
import { BrandPanel } from '../components/BrandPanel'
import { DesignPane } from '../components/DesignPane'
import { PreviewStage } from '../components/PreviewStage'
import { SourcePanel } from '../components/SourcePanel'
import { DocPages } from '../render/DocPages'
import { generateDoc } from '../lib/ai'
import { A4 } from '../lib/pagination'
import { exportPdf as renderPdf, slugify } from '../lib/export'
import { extractPdfText } from '../lib/pdfExtract'
import { useEditPulse } from '../lib/useEditPulse'
import type { AppSettings, BrandPreset, PdfDoc } from '../types'

interface Props {
  settings: AppSettings
  onSettings: (settings: AppSettings) => void
  brand: BrandPreset
  doc: PdfDoc
  onDoc: (doc: PdfDoc) => void
  source: string
  onSource: (value: string) => void
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void
  onOpenSettings: () => void
}

export function PdfStudio({
  settings,
  onSettings,
  brand,
  doc,
  onDoc,
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
  const [pageCount, setPageCount] = useState(1)
  const previewRef = useRef<HTMLDivElement>(null)
  const editPulse = useEditPulse()

  const handleDocChange = (next: PdfDoc) => {
    onDoc(next)
    editPulse.pulse()
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const next = await generateDoc(settings, source, brand)
      onDoc(next)
      notify(`Document structured — ${next.sections.length} sections`, 'success')
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

  const handleExportPdf = async () => {
    const pages = Array.from(previewRef.current?.querySelectorAll<HTMLElement>('[data-pdf-page]') ?? [])
    setBusy('Preparing PDF…')
    try {
      await renderPdf(pages, `${slugify(brand.brandName)}-${slugify(doc.title)}`, (done, total, label) => {
        setBusy(total ? `${label}…` : label)
        if (done === total) setBusy('Saving…')
      })
      notify('PDF exported', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PDF export failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handlePrint = () => {
    const cleanup = () => {
      document.body.classList.remove('printing')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    document.body.classList.add('printing')
    window.print()
    setTimeout(cleanup, 4000)
  }

  return (
    <div className="studio-grid">
      <aside className="pane pane--left glass">
        <div className="pane__scroll">
          <SourcePanel
            mode="pdf"
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
          <span className="preview-bar__dot" aria-hidden="true" />
          <span className="preview-bar__title">Live preview</span>
          <span className="preview-bar__hint">Click any text to edit it in place</span>
          <span className="preview-bar__spacer" />
          {editPulse.state !== 'idle' ? (
            <span className={`save-badge save-badge--${editPulse.state}`} role="status">
              {editPulse.state === 'editing' ? 'Edited' : 'Saved'}
            </span>
          ) : null}
          <span className="pill">{pageCount} pages · A4</span>
          {settings.paymentLock ? <span className="pill pill--warn">Draft watermark</span> : null}
        </div>
        <div className="preview-host" ref={previewRef}>
          <PreviewStage naturalWidth={A4.width} itemSelector="[data-pdf-page]" itemLabel="Page">
            <DocPages
              doc={doc}
              settings={settings}
              brand={brand}
              onChange={handleDocChange}
              onPageCount={setPageCount}
            />
          </PreviewStage>
        </div>
      </section>

      <aside className="pane pane--right glass">
        <div className="pane__scroll">
          <DesignPane
            mode="pdf"
            settings={settings}
            onPatch={(patch) => onSettings({ ...settings, ...patch })}
            pageCount={pageCount}
            slideCount={0}
            busy={busy}
            onExportPdf={handleExportPdf}
            onPrint={handlePrint}
            onExportZip={() => undefined}
            onExportSlide={() => undefined}
            onAddSlide={() => undefined}
          />
        </div>
      </aside>
    </div>
  )
}
