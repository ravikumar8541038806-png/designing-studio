import { useCallback, useEffect, useRef, useState } from 'react'
import { BrandPanel } from '../components/BrandPanel'
import { DesignPane } from '../components/DesignPane'
import { PreviewStage } from '../components/PreviewStage'
import { SourcePanel } from '../components/SourcePanel'
import { SuggestionBox } from '../components/SuggestionBox'
import { VisualStudio } from '../components/VisualStudio'
import { DocPages } from '../render/DocPages'
import { generateDoc } from '../lib/ai'
import { parseDocDirect } from '../lib/directMode'
import { moveBlockById, removeBlockById, updateBlockById } from '../lib/docOps'
import { A4 } from '../lib/pagination'
import { exportPdf as renderPdf, printVectorPdf, slugify } from '../lib/export'
import { createImageBlock, insertBlock } from '../lib/blocks'
import { extractPdfText } from '../lib/pdfExtract'
import { useEditPulse } from '../lib/useEditPulse'
import { generateAiImage, hasGeminiImages, readImageFile, VisualError } from '../lib/visuals'
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
  const [genProgress, setGenProgress] = useState<number | null>(null)
  const [extracting, setExtracting] = useState<{ page: number; total: number } | null>(null)
  const [extracted, setExtracted] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [visualStatus, setVisualStatus] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [pane, setPane] = useState<'design' | 'visual' | 'advisor'>('design')
  const [undoStack, setUndoStack] = useState<PdfDoc[]>([])
  const [redoStack, setRedoStack] = useState<PdfDoc[]>([])

  const previewRef = useRef<HTMLDivElement>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const editPulse = useEditPulse()

  const commitDoc = useCallback(
    (next: PdfDoc, recordHistory = true) => {
      if (recordHistory) {
        setUndoStack((prev) => [docRef.current, ...prev].slice(0, 20))
        setRedoStack([])
      }
      onDoc(next)
      editPulse.pulse()
    },
    [onDoc, editPulse],
  )

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev
      const [target, ...rest] = prev
      setRedoStack((r) => [docRef.current, ...r].slice(0, 20))
      onDoc(target)
      notify('Undid change', 'info')
      return rest
    })
  }, [onDoc, notify])

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev
      const [target, ...rest] = prev
      setUndoStack((u) => [docRef.current, ...u].slice(0, 20))
      onDoc(target)
      notify('Redid change', 'info')
      return rest
    })
  }, [onDoc, notify])

  // Keyboard Undo / Redo + Global Ctrl+V Image Paste anywhere in PDF Studio
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
          const block = { ...createImageBlock(), url, caption: 'Pasted visual' }
          const targetId = docRef.current.sections[0]?.id ?? ''
          commitDoc(insertBlock(docRef.current, targetId, block))
          notify('Pasted image into your document', 'success')
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
  }, [handleUndo, handleRedo, commitDoc, notify])

  /** Auto-generates planned AI cover & image blocks in the background (non-blocking). */
  const autoIllustrate = useCallback(
    async (created: PdfDoc) => {
      if (!settings.autoVisuals || !hasGeminiImages(settings)) return

      const tasks: { kind: 'cover' | 'block'; sectionId?: string; blockId?: string; prompt: string; style?: 'cinematic-cover' | 'photorealistic' | '3d-illustration' | '2d-vector' | 'textbook-diagram'; aspect?: '16:9' | '4:3' | '1:1' | '3:4' }[] = []

      if (created.coverImagePrompt && !created.coverImage) {
        tasks.push({
          kind: 'cover',
          prompt: created.coverImagePrompt,
          style: 'cinematic-cover',
          aspect: '16:9',
        })
      }

      created.sections.forEach((sec) => {
        sec.blocks.forEach((blk) => {
          if (blk.type === 'image' && !blk.url && blk.prompt) {
            tasks.push({
              kind: 'block',
              sectionId: sec.id,
              blockId: blk.id,
              prompt: blk.prompt,
              style: blk.style ?? 'photorealistic',
              aspect: blk.aspect ?? '16:9',
            })
          }
        })
      })

      if (!tasks.length) return

      // Mark queued image blocks as generating so the preview displays a clean shimmer.
      let working: PdfDoc = {
        ...created,
        sections: created.sections.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((blk) =>
            blk.type === 'image' && !blk.url && blk.prompt ? { ...blk, generating: true } : blk,
          ),
        })),
      }
      onDoc(working)
      if (tasks.some((t) => t.kind === 'cover')) setCoverBusy(true)
      setVisualStatus(`Rendering ${tasks.length} AI visual${tasks.length > 1 ? 's' : ''}…`)

      let completed = 0
      const runOne = async (task: (typeof tasks)[number]) => {
        try {
          const url = await generateAiImage(settings, task.prompt, {
            style: task.style,
            aspect: task.aspect,
          })
          if (task.kind === 'cover') {
            working = { ...docRef.current, coverImage: url }
            onDoc(working)
          } else if (task.sectionId && task.blockId) {
            working = updateBlockById(docRef.current, task.sectionId, task.blockId, (blk) =>
              blk.type === 'image' ? { ...blk, url, generating: false } : blk,
            )
            onDoc(working)
          }
          completed += 1
        } catch {
          if (task.sectionId && task.blockId) {
            working = updateBlockById(docRef.current, task.sectionId, task.blockId, (blk) =>
              blk.type === 'image' ? { ...blk, generating: false } : blk,
            )
            onDoc(working)
          }
        }
      }

      // Run up to 2 at a time so exports/renders stay fast and avoid 429 spikes.
      for (let i = 0; i < tasks.length; i += 2) {
        await Promise.all(tasks.slice(i, i + 2).map(runOne))
      }

      setCoverBusy(false)
      setVisualStatus(null)
      if (completed > 0) {
        notify(`Rendered ${completed} custom visual${completed > 1 ? 's' : ''}`, 'success')
      }
    },
    [settings, onDoc, notify],
  )

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setGenError(null)
    setGenProgress(null)
    try {
      const next = settings.directMode
        ? parseDocDirect(source)
        : await generateDoc(settings, source, brand, setGenProgress)
      commitDoc(next)
      notify(
        settings.directMode
          ? `Formatted instantly — ${next.sections.length} sections`
          : `Document structured — ${next.sections.length} sections`,
        'success',
      )
      if (!settings.directMode) {
        void autoIllustrate(next)
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
      const next = parseDocDirect(source)
      commitDoc(next)
      notify(`Formatted instantly — ${next.sections.length} sections`, 'success')
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

  const handleRegenerateBlockImage = async (sectionId: string, blockId: string) => {
    const sec = doc.sections.find((s) => s.id === sectionId)
    const blk = sec?.blocks.find((b) => b.id === blockId)
    if (!blk || blk.type !== 'image') return
    const brief = blk.prompt || blk.caption || `${doc.title} editorial illustration`
    commitDoc(
      updateBlockById(doc, sectionId, blockId, (b) => (b.type === 'image' ? { ...b, generating: true } : b)),
      false,
    )
    try {
      const url = await generateAiImage(settings, brief, { style: blk.style ?? 'photorealistic', aspect: blk.aspect ?? '16:9' })
      commitDoc(
        updateBlockById(docRef.current, sectionId, blockId, (b) =>
          b.type === 'image' ? { ...b, url, generating: false } : b,
        ),
      )
      notify('Visual updated', 'success')
    } catch (error) {
      commitDoc(
        updateBlockById(docRef.current, sectionId, blockId, (b) =>
          b.type === 'image' ? { ...b, generating: false } : b,
        ),
        false,
      )
      notify(error instanceof VisualError ? `${error.message} ${error.hint ?? ''}` : 'Could not generate image.', 'error')
    }
  }

  const handleUploadBlockImage = async (sectionId: string, blockId: string, file: File) => {
    try {
      const url = await readImageFile(file)
      commitDoc(
        updateBlockById(doc, sectionId, blockId, (b) =>
          b.type === 'image' ? { ...b, url, generating: false } : b,
        ),
      )
      notify('Image uploaded', 'success')
    } catch {
      notify('Could not read that image.', 'error')
    }
  }

  const handleCoverUpload = async (file: File) => {
    try {
      const url = await readImageFile(file)
      commitDoc({ ...doc, coverImage: url })
      notify('Cover image updated', 'success')
    } catch {
      notify('Could not read that image.', 'error')
    }
  }

  const handleCoverGenerate = async () => {
    if (coverBusy) return
    setCoverBusy(true)
    try {
      const prompt = doc.coverImagePrompt || `${doc.title} — ${doc.subtitle}`
      const url = await generateAiImage(settings, prompt, { style: 'cinematic-cover', aspect: '16:9' })
      commitDoc({ ...docRef.current, coverImage: url })
      notify('Cover image generated', 'success')
    } catch (error) {
      notify(error instanceof VisualError ? `${error.message} ${error.hint ?? ''}` : 'Cover generation failed.', 'error')
    } finally {
      setCoverBusy(false)
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
      notify('Print-ready PDF downloaded', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PDF export failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handlePrint = async () => {
    setBusy('Preparing print view…')
    try {
      await printVectorPdf(`${slugify(brand.brandName)}-${slugify(doc.title)}`, doc.title)
      notify('Print dialog opened — choose “Save as PDF”, margins: None', 'info')
    } catch {
      notify('The print dialog could not be opened.', 'error')
    } finally {
      setBusy(null)
    }
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
          <span className="preview-bar__hint">Click text to edit · Ctrl+V pastes images</span>
          <span className="preview-bar__spacer" />
          {visualStatus ? <span className="pill">{visualStatus}</span> : null}
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
          <span className="pill">{pageCount} pages · A4</span>
          {settings.paymentLock ? <span className="pill pill--warn">Draft watermark</span> : null}
        </div>
        <div className="preview-host" ref={previewRef}>
          <PreviewStage naturalWidth={A4.width} itemSelector="[data-pdf-page]" itemLabel="Page">
            <DocPages
              doc={doc}
              settings={settings}
              brand={brand}
              onChange={(next) => commitDoc(next)}
              onPageCount={setPageCount}
              onMoveBlock={(sectionId, blockId, dir) => commitDoc(moveBlockById(doc, sectionId, blockId, dir))}
              onDeleteBlock={(sectionId, blockId) => commitDoc(removeBlockById(doc, sectionId, blockId))}
              onRegenerateImage={handleRegenerateBlockImage}
              onUploadBlockImage={handleUploadBlockImage}
              onCoverUpload={handleCoverUpload}
              onCoverGenerate={handleCoverGenerate}
              coverBusy={coverBusy}
            />
          </PreviewStage>
        </div>
      </section>

      <aside className="pane pane--right glass">
        <div className="studio-tabs" role="tablist" aria-label="PDF tools">
          {(
            [
              ['design', 'Design'],
              ['visual', 'Visual studio'],
              ['advisor', 'Advisor'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              className={`studio-tab${pane === id ? ' is-active' : ''}`}
              onClick={() => setPane(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="pane__scroll">
          {pane === 'design' ? (
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
              doc={doc}
              onDoc={(next) => commitDoc(next)}
            />
          ) : null}
          {pane === 'visual' ? (
            <VisualStudio
              settings={settings}
              doc={doc}
              notify={notify}
              onInsert={(block, sectionId) => commitDoc(insertBlock(doc, sectionId, block))}
              onSetCover={(url) => commitDoc({ ...doc, coverImage: url })}
            />
          ) : null}
          {pane === 'advisor' ? (
            <SuggestionBox settings={settings} doc={doc} onChange={(next) => commitDoc(next)} notify={notify} />
          ) : null}
        </div>
      </aside>
    </div>
  )
}
