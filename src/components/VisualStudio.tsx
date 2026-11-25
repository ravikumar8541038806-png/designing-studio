import { useEffect, useRef, useState } from 'react'
import { Button, Icon, SectionLabel, TextArea, TextInput } from './ui'
import { DiagramView } from '../render/diagram'
import { ChartSvg } from '../render/charts'
import { MathView } from '../render/math'
import { CHART_KINDS, createImageBlock } from '../lib/blocks'
import { DIAGRAM_KINDS, labeledFigureBlock } from '../lib/diagrams'
import {
  chartFromSeries,
  generateAiImage,
  generateChart,
  generateDiagram,
  generateFormula,
  hasAi,
  readImageFile,
  VisualError,
} from '../lib/visuals'
import type {
  AppSettings,
  ChartKind,
  DiagramKind,
  DiagramNode,
  DocBlock,
  PdfDoc,
} from '../types'

type StudioTab = 'diagram' | 'chart' | 'formula' | 'image'
type DiagramBlock = Extract<DocBlock, { type: 'diagram' }>
type ChartBlock = Extract<DocBlock, { type: 'chart' }>
type MathBlock = Extract<DocBlock, { type: 'math' }>
type ImageBlock = Extract<DocBlock, { type: 'image' }>

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'diagram', label: 'Diagrams' },
  { id: 'chart', label: 'Charts' },
  { id: 'formula', label: 'Formulas' },
  { id: 'image', label: 'Images' },
]

const PROMPT_HINTS: Record<StudioTab, string> = {
  diagram: 'e.g. Human heart with labelled chambers and valves',
  chart: 'e.g. Freight costs by mode in 2025 (road 42, rail 27, air 18, sea 13)',
  formula: 'e.g. Macro formulas for RBI monetary policy',
  image: 'e.g. Plant cell with labelled nucleus, chloroplast and cell wall',
}

export function VisualStudio({
  settings,
  doc,
  onInsert,
  notify,
}: {
  settings: AppSettings
  doc: PdfDoc
  onInsert: (block: DocBlock, sectionId: string) => void
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const [tab, setTab] = useState<StudioTab>('diagram')
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<DiagramKind>('schematic')
  const [chartKind, setChartKind] = useState<ChartKind>('bar')
  const [formulaLayout, setFormulaLayout] = useState<'card' | 'sheet'>('card')
  const [preview, setPreview] = useState<DocBlock | null>(null)
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [sectionId, setSectionId] = useState(doc.sections[0]?.id ?? '')
  const [seriesDraft, setSeriesDraft] = useState('')
  const [imageWidth, setImageWidth] = useState(80)
  const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center')
  const [dragging, setDragging] = useState(false)
  const [imageAspect, setImageAspect] = useState(0.78)
  const fileRef = useRef<HTMLInputElement>(null)

  const target = doc.sections.some((section) => section.id === sectionId)
    ? sectionId
    : doc.sections[doc.sections.length - 1]?.id ?? ''

  const acceptFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('That file is not an image.', 'error')
      return
    }
    try {
      const url = await readImageFile(file)
      const name = file.name.replace(/\.[a-z0-9]+$/i, '').trim()
      setImageAspect(await measureAspect(url))
      setPreview({
        ...(createImageBlock() as ImageBlock),
        url,
        caption: figureCaption(name || 'Uploaded image'),
        width: imageWidth,
        align: imageAlign,
      })
      notify('Image ready — set the width and caption, then insert', 'success')
    } catch {
      notify('Could not read that image.', 'error')
    }
  }

  // Ctrl+V anywhere in the Images tab drops a clipboard bitmap into the frame.
  useEffect(() => {
    if (tab !== 'image') return
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? [])
      const file = items
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile()
      if (!file) return
      event.preventDefault()
      void acceptFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const run = async (mode: 'generate' | 'regenerate') => {
    const brief = prompt.trim()
    if (!brief && tab !== 'image') {
      notify('Describe the visual you want first.', 'error')
      return
    }
    if (tab === 'image') {
      if (!brief) {
        notify('Describe the image you want first.', 'error')
        return
      }
      setImageBusy(true)
      try {
        const url = await generateAiImage(settings, brief)
        setImageAspect(await measureAspect(url))
        setPreview({
          ...(createImageBlock() as ImageBlock),
          url,
          caption: figureCaption(brief),
          width: imageWidth,
          align: imageAlign,
        })
        notify('Image generated', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image generation failed.'
        const hint = error instanceof VisualError ? error.hint : undefined
        notify(hint ? `${message} ${hint}` : message, 'error')
      } finally {
        setImageBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      if (tab === 'diagram') {
        const result = await generateDiagram(settings, brief, kind)
        setPreview(result.block)
        notify(result.local ? 'Generated an editable flowchart (no AI used)' : 'Diagram generated', 'success')
      } else if (tab === 'chart') {
        const result = await generateChart(settings, brief, chartKind)
        if (result.block.type === 'chart') setSeriesDraft(result.block.labels.map((label, index) => `${label} | ${result.block.type === 'chart' ? result.block.values[index] ?? 0 : 0}`).join('\n'))
        setPreview(result.block)
        notify(result.local ? 'Chart built from the numbers in your brief' : 'Chart generated', 'success')
      } else {
        const result = await generateFormula(settings, brief, formulaLayout)
        setPreview(result.block)
        notify(result.local ? 'Formula card built offline — edit the LaTeX below' : 'Formulas generated', 'success')
      }
      if (mode === 'regenerate') notify('Regenerated', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Generation failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const patchPreview = (next: DocBlock) => setPreview(next)

  const patchNode = (nodeId: string, next: Partial<DiagramNode>) => {
    if (!preview || preview.type !== 'diagram') return
    setPreview({
      ...preview,
      nodes: preview.nodes.map((node) => (node.id === nodeId ? { ...node, ...next } : node)),
    })
  }

  /** Turns the current image into a labelled figure with editable anchors. */
  const labelFigure = () => {
    if (!preview || preview.type !== 'image' || !preview.url) return
    setPreview(labeledFigureBlock(preview.url, imageAspect, preview.caption))
    setTab('diagram')
    notify('Figure ready — rename the labels and drag their positions', 'success')
  }

  const insert = () => {
    if (!preview) return
    onInsert(preview, target)
    notify('Visual inserted into the PDF', 'success')
  }

  const changeTab = (next: StudioTab) => {
    setTab(next)
    setPreview(null)
    setSeriesDraft('')
  }

  return (
    <div className="visual-studio">
      <div className="vs-tabs" role="tablist" aria-label="Visual studio">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`vs-tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => changeTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p className="vs-status">
        {hasAi(settings)
          ? 'Gemini is connected — every visual is drawn for this document’s subject.'
          : 'Direct Mode / no key: diagrams, formulas and charts still generate from built-in subject presets.'}
      </p>

      {tab !== 'image' ? (
        <>
          {tab === 'diagram' ? (
            <div className="bs-chips">
              {DIAGRAM_KINDS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`bs-chip${kind === entry.id ? ' is-active' : ''}`}
                  onClick={() => setKind(entry.id)}
                  title={entry.note}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}
          {tab === 'chart' ? (
            <div className="bs-chips">
              {CHART_KINDS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`bs-chip${chartKind === entry.id ? ' is-active' : ''}`}
                  onClick={() => setChartKind(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}
          {tab === 'formula' ? (
            <div className="bs-chips">
              {(['card', 'sheet'] as const).map((layout) => (
                <button
                  key={layout}
                  type="button"
                  className={`bs-chip${formulaLayout === layout ? ' is-active' : ''}`}
                  onClick={() => setFormulaLayout(layout)}
                >
                  {layout === 'card' ? 'Single equation' : 'Cheat-sheet box'}
                </button>
              ))}
            </div>
          ) : null}

          <label className="bs-field">
            <span className="bs-field__label">
              {tab === 'diagram' ? 'What should the diagram show?' : tab === 'chart' ? 'What should the chart plot?' : 'Which formulas?'}
            </span>
            <TextArea rows={3} value={prompt} onChange={setPrompt} placeholder={PROMPT_HINTS[tab]} />
          </label>

          <div className="vs-actions">
            <Button variant="primary" icon="sparkles" full onClick={() => run('generate')} disabled={busy}>
              {busy ? 'Drawing…' : preview ? 'Regenerate' : 'Generate'}
            </Button>
            {preview ? (
              <Button icon="refresh" onClick={() => run('regenerate')} disabled={busy}>
                Variation
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <label className="bs-field">
            <span className="bs-field__label">Describe the illustration</span>
            <TextArea rows={3} value={prompt} onChange={setPrompt} placeholder={PROMPT_HINTS.image} />
          </label>
          <p className="vs-hint">
            Drawn by a real Gemini image model — returns a high-resolution PNG that prints crisply in the PDF.
          </p>
          <div className="vs-actions">
            <Button
              variant="primary"
              icon="sparkles"
              full
              onClick={() => run('generate')}
              disabled={imageBusy}
            >
              {imageBusy ? 'Rendering image…' : preview ? 'Regenerate' : 'Generate image'}
            </Button>
            {preview ? (
              <Button icon="refresh" onClick={() => run('regenerate')} disabled={imageBusy}>
                Variation
              </Button>
            ) : null}
          </div>
          <div
            className={`vs-drop${dragging ? ' is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click()
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files?.[0]
              if (file) void acceptFile(file)
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void acceptFile(file)
                event.target.value = ''
              }}
            />
            <Icon name="upload" size={18} />
            <strong>Drop an image here, or press Ctrl+V</strong>
            <span>Paste from the clipboard, drag a file in, or click to browse</span>
          </div>
          {preview?.type === 'image' && preview.url ? (
            <Button icon="image" full onClick={labelFigure}>
              Use as labelled figure
            </Button>
          ) : null}
        </>
      )}

      {preview ? (
        <div className="vs-preview-card">
          <div className="vs-preview">
            {preview.type === 'diagram' ? <DiagramView block={preview} /> : null}
            {preview.type === 'chart' ? (
              <ChartSvg
                chart={preview.chart}
                title={preview.title}
                labels={preview.labels}
                values={preview.values}
                values2={preview.values2}
                accent={preview.accent || 'var(--brand)'}
                accent2={preview.accent2 || 'var(--accent)'}
              />
            ) : null}
            {preview.type === 'math' ? <MathView block={preview} /> : null}
            {preview.type === 'image' ? (
              preview.url ? (
                <img
                  className={`img-block__img${preview.rounded ? ' is-rounded' : ''}`}
                  src={preview.url}
                  alt={preview.caption || 'Generated visual'}
                />
              ) : (
                <div className="img-block__empty">No image yet</div>
              )
            ) : null}
          </div>

          <div className="vs-edit">
            <SectionLabel>Edit before inserting</SectionLabel>

            {preview.type === 'diagram' ? (
              <>
                <label className="bs-field">
                  <span className="bs-field__label">Figure title</span>
                  <TextInput
                    value={preview.title}
                    onChange={(title) => patchPreview({ ...(preview as DiagramBlock), title })}
                  />
                </label>
                <label className="bs-field">
                  <span className="bs-field__label">Labels · one per line</span>
                  <TextArea
                    rows={Math.min(10, Math.max(4, preview.nodes.length))}
                    value={preview.nodes.map((node) => node.label.replace(/\s*\n\s*/g, ' — ')).join('\n')}
                    onChange={(value) => {
                      const labels = value.split('\n')
                      patchPreview({
                        ...(preview as DiagramBlock),
                        nodes: preview.nodes.map((node, index) => ({
                          ...node,
                          label: labels[index] ?? node.label,
                        })),
                      })
                    }}
                  />
                </label>
                {preview.plateImage ? (
                  <div className="vs-anchors">
                    <SectionLabel>Label anchors</SectionLabel>
                    {preview.nodes.map((node, index) => (
                      <div className="vs-anchor" key={node.id}>
                        <span className="vs-anchor__name">{node.label || `Label ${index + 1}`}</span>
                        <div className="vs-anchor__controls">
                          <input
                            className="bs-range"
                            type="range"
                            min={4}
                            max={96}
                            value={node.anchorX ?? 50}
                            aria-label={`${node.label} horizontal position`}
                            onChange={(event) => patchNode(node.id, { anchorX: Number(event.target.value) })}
                          />
                          <input
                            className="bs-range"
                            type="range"
                            min={4}
                            max={96}
                            value={node.anchorY ?? 50}
                            aria-label={`${node.label} vertical position`}
                            onChange={(event) => patchNode(node.id, { anchorY: Number(event.target.value) })}
                          />
                          <div className="segmented segmented--mini">
                            {(['left', 'right'] as const).map((side) => (
                              <button
                                key={side}
                                type="button"
                                className={`segmented__item${(node.side ?? 'left') === side ? ' is-active' : ''}`}
                                onClick={() => patchNode(node.id, { side })}
                              >
                                {side === 'left' ? 'L' : 'R'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <label className="bs-field">
                  <span className="bs-field__label">Caption</span>
                  <TextInput
                    value={preview.caption}
                    onChange={(caption) => patchPreview({ ...(preview as DiagramBlock), caption })}
                  />
                </label>
              </>
            ) : null}

            {preview.type === 'chart' ? (
              <>
                <label className="bs-field">
                  <span className="bs-field__label">Chart title</span>
                  <TextInput
                    value={preview.title}
                    onChange={(title) => patchPreview({ ...(preview as ChartBlock), title })}
                  />
                </label>
                <label className="bs-field">
                  <span className="bs-field__label">Data · Label | value</span>
                  <TextArea
                    rows={6}
                    value={seriesDraft}
                    onChange={(value) => {
                      setSeriesDraft(value)
                      const rows = value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                      const labels = rows.map((line) => line.split(/\s*[|,;]\s*/)[0] ?? '')
                      const values = rows.map((line) => Number(line.split(/\s*[|,;]\s*/)[1]) || 0)
                      patchPreview({ ...(preview as ChartBlock), labels, values })
                    }}
                  />
                </label>
                <Button
                  icon="check"
                  full
                  onClick={() => {
                    const rebuilt = chartFromSeries(seriesDraft, chartKind, (preview as ChartBlock).title)
                    setPreview(rebuilt)
                    if (rebuilt.type === 'chart') setSeriesDraft(rebuilt.labels.map((label, index) => `${label} | ${rebuilt.values[index] ?? 0}`).join('\n'))
                    notify('Chart data applied')
                  }}
                >
                  Apply data
                </Button>
              </>
            ) : null}

            {preview.type === 'math' ? (
              <>
                <label className="bs-field">
                  <span className="bs-field__label">Title</span>
                  <TextInput
                    value={preview.title}
                    onChange={(title) => patchPreview({ ...(preview as MathBlock), title })}
                  />
                </label>
                {preview.layout === 'sheet' ? (
                  preview.items.map((item, index) => (
                    <label className="bs-field" key={item.id}>
                      <span className="bs-field__label">{item.label || `Formula ${index + 1}`} · LaTeX</span>
                      <TextArea
                        rows={2}
                        value={item.latex}
                        onChange={(latex) =>
                          patchPreview({
                            ...(preview as MathBlock),
                            items: preview.items.map((entry, i) => (i === index ? { ...entry, latex } : entry)),
                            latex: index === 0 ? latex : preview.latex,
                          })
                        }
                      />
                    </label>
                  ))
                ) : (
                  <label className="bs-field">
                    <span className="bs-field__label">LaTeX</span>
                    <TextArea
                      rows={4}
                      value={preview.latex}
                      onChange={(latex) => patchPreview({ ...(preview as MathBlock), latex })}
                    />
                  </label>
                )}
                <label className="bs-field">
                  <span className="bs-field__label">Note</span>
                  <TextInput
                    value={preview.note}
                    onChange={(note) => patchPreview({ ...(preview as MathBlock), note })}
                  />
                </label>
              </>
            ) : null}

            {preview.type === 'image' ? (
              <>
                <label className="bs-field">
                  <span className="bs-field__label">Caption</span>
                  <TextInput
                    value={preview.caption}
                    onChange={(caption) => patchPreview({ ...(preview as ImageBlock), caption })}
                  />
                </label>
                <label className="bs-field">
                  <span className="bs-field__label">Width · {preview.width}%</span>
                  <input
                    className="bs-range"
                    type="range"
                    min={30}
                    max={100}
                    step={5}
                    value={imageWidth}
                    onChange={(event) => {
                      const width = Number(event.target.value)
                      setImageWidth(width)
                      patchPreview({ ...(preview as ImageBlock), width })
                    }}
                  />
                </label>
                <label className="bs-field">
                  <span className="bs-field__label">Alignment</span>
                  <div className="segmented">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        className={`segmented__item${imageAlign === align ? ' is-active' : ''}`}
                        onClick={() => {
                          setImageAlign(align)
                          patchPreview({ ...(preview as ImageBlock), align })
                        }}
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="bs-check">
                  <input
                    type="checkbox"
                    checked={preview.rounded}
                    onChange={(event) => patchPreview({ ...(preview as ImageBlock), rounded: event.target.checked })}
                  />
                  <span>Rounded corners</span>
                </label>
              </>
            ) : null}
          </div>

          <div className="vs-insert">
            <label className="bs-field">
              <span className="bs-field__label">Insert after section</span>
              <select
                className="input"
                value={target}
                onChange={(event) => setSectionId(event.target.value)}
                disabled={!doc.sections.length}
              >
                {doc.sections.map((section, index) => (
                  <option key={section.id} value={section.id}>
                    {String(index + 1).padStart(2, '0')} · {section.heading}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" icon="plus" full onClick={insert}>
              Insert into PDF
            </Button>
          </div>
        </div>
      ) : (
        <div className="vs-empty">
          <span className="vs-empty__mark">{tab === 'diagram' ? '◈' : tab === 'chart' ? '▤' : tab === 'formula' ? '∑' : '▣'}</span>
          <p>
            {tab === 'diagram'
              ? 'Scientific schematics (colour-coded anatomy with leader-line labels and traced pathways), flowcharts, cycles and mindmaps — crisp SVG that matches the page theme.'
              : tab === 'chart'
                ? 'Bar, line, pie, area and comparison charts with editable data.'
                : tab === 'formula'
                  ? 'KaTeX-rendered equations and cheat-sheet boxes.'
                  : 'Textbook illustrations from Gemini’s image models, or paste/drop your own.'}
          </p>
          <p className="vs-empty__hint">Start from a preset without typing:</p>
          <div className="vs-quick">
            {createQuickStart(tab).map((entry) => (
              <button
                key={entry.label}
                type="button"
                className="vs-quick__item"
                onClick={() => {
                  setPrompt(entry.prompt)
                  if (tab === 'diagram') setKind(entry.kind ?? 'labeled')
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function createQuickStart(tab: StudioTab): { label: string; prompt: string; kind?: DiagramKind }[] {
  if (tab === 'diagram') {
    return [
      { label: 'Human heart schematic', prompt: 'Human heart with chambers, valves, vessels and the pathway of blood flow', kind: 'schematic' },
      { label: 'Neuron', prompt: 'Neuron with dendrites, axon, myelin sheath and synapse', kind: 'schematic' },
      { label: 'Monetary transmission', prompt: 'Hawkish vs dovish RBI monetary transmission', kind: 'flow' },
      { label: 'Photosynthesis', prompt: 'Photosynthesis light and Calvin cycle', kind: 'cycle' },
      { label: 'Research method', prompt: 'Problem, hypothesis, method, data, conclusion', kind: 'flow' },
      { label: 'Supply chain', prompt: 'Supplier, factory, warehouse, distributor, retailer', kind: 'flow' },
      { label: 'Revision map', prompt: 'Indian economy: agriculture, industry, services, external sector', kind: 'mindmap' },
    ]
  }
  if (tab === 'chart') {
    return [
      { label: 'Inflation trend', prompt: 'CPI inflation by quarter: Q1 5.1, Q2 4.8, Q3 5.6, Q4 6.2' },
      { label: 'Cost split', prompt: 'Freight cost by mode: road 42, rail 27, air 18, sea 13' },
      { label: 'GDP growth', prompt: 'GDP growth by sector: agriculture 3.1, industry 6.4, services 8.2' },
    ]
  }
  if (tab === 'formula') {
    return [
      { label: 'Physics sheet', prompt: 'Physics formula cheat sheet for motion and optics' },
      { label: 'Economics sheet', prompt: 'Macroeconomics formula sheet for inflation and money supply' },
      { label: 'Finance sheet', prompt: 'Business finance formulas for ROI, break-even and CAGR' },
      { label: 'Biology sheet', prompt: 'Biology equations for photosynthesis and respiration' },
    ]
  }
  return [
    { label: 'Human heart', prompt: 'Human heart with chambers, valves and major vessels' },
    { label: 'Plant cell', prompt: 'Plant cell with nucleus, chloroplast, vacuole and cell wall' },
    { label: 'Ray optics', prompt: 'Concave mirror ray diagram with principal axis, focus and image' },
    { label: 'Neuron', prompt: 'Neuron with dendrites, axon, myelin sheath and synapse' },
    { label: 'Leaf section', prompt: 'Cross-section of a leaf showing stomata, mesophyll and veins' },
  ]
}

/** height / width of an image URL, so labels can be placed on it accurately. */
function measureAspect(url: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.height && image.width ? image.height / image.width : 0.78)
    image.onerror = () => resolve(0.78)
    image.src = url
  })
}

/** Default figure caption, editable in the panel before inserting. */
function figureCaption(text: string): string {
  const clean = text
    .replace(/^fig(?:ure)?\.?\s*\d+(?:\.\d+)?\s*[:.–—-]\s*/i, '')
    .trim()
    .slice(0, 90)
  return `Fig 1.1: ${clean || 'Untitled figure'}`
}
