import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Icon, SectionLabel, TextArea, TextInput } from './ui'
import { DiagramView } from '../render/diagram'
import { ChartSvg } from '../render/charts'
import { MathView } from '../render/math'
import { CHART_KINDS, createImageBlock } from '../lib/blocks'
import { DIAGRAM_KINDS, labeledFigureBlock } from '../lib/diagrams'
import { ASPECT_RATIOS, VISUAL_STYLES } from '../theme/presets'
import {
  chartFromSeries,
  generateAiImage,
  generateChart,
  generateDiagram,
  generateFormula,
  generateStats,
  hasAi,
  hasGeminiImages,
  readImageFile,
  VisualError,
} from '../lib/visuals'
import type {
  AppSettings,
  AspectRatioId,
  ChartKind,
  DiagramKind,
  DiagramNode,
  DocBlock,
  PdfDoc,
  VisualStyleId,
} from '../types'

type StudioTab = 'image' | 'chart' | 'diagram' | 'stats' | 'formula'
type DiagramBlock = Extract<DocBlock, { type: 'diagram' }>
type ChartBlock = Extract<DocBlock, { type: 'chart' }>
type StatsBlock = Extract<DocBlock, { type: 'stats' }>
type MathBlock = Extract<DocBlock, { type: 'math' }>
type ImageBlock = Extract<DocBlock, { type: 'image' }>

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'image', label: 'Images' },
  { id: 'chart', label: 'Charts' },
  { id: 'diagram', label: 'Diagrams' },
  { id: 'stats', label: 'Stats' },
  { id: 'formula', label: 'Formulas' },
]

const PROMPT_HINTS: Record<StudioTab, string> = {
  image: 'e.g. Dramatic aerial photograph of melting Arctic glaciers at golden hour',
  chart: 'e.g. Global CO2 concentration 1980–2025 (1980 338, 1995 360, 2010 390, 2025 424)',
  diagram: 'e.g. Arctic ice-albedo climate feedback loop',
  stats: 'e.g. Key climate change indicators: global warming, CO2 ppm, sea level rise',
  formula: 'e.g. Business finance formulas for ROI, break-even and CAGR',
}

export function VisualStudio({
  settings,
  doc,
  onInsert,
  onSetCover,
  notify,
}: {
  settings: AppSettings
  doc: PdfDoc
  onInsert: (block: DocBlock, sectionId: string) => void
  onSetCover?: (url: string) => void
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const [tab, setTab] = useState<StudioTab>('image')
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<DiagramKind>('flow')
  const [chartKind, setChartKind] = useState<ChartKind>('bar')
  const [visualStyle, setVisualStyle] = useState<VisualStyleId>('photorealistic')
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>('16:9')
  const [formulaLayout, setFormulaLayout] = useState<'card' | 'sheet'>('card')
  const [preview, setPreview] = useState<DocBlock | null>(null)
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [sectionId, setSectionId] = useState(doc.sections[0]?.id ?? '')
  const [seriesDraft, setSeriesDraft] = useState('')
  const [imageWidth, setImageWidth] = useState(100)
  const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center')
  const [dragging, setDragging] = useState(false)
  const [imageAspect, setImageAspect] = useState(0.78)
  const fileRef = useRef<HTMLInputElement>(null)

  const target = doc.sections.some((section) => section.id === sectionId)
    ? sectionId
    : doc.sections[doc.sections.length - 1]?.id ?? ''

  const acceptFile = useCallback(
    async (file: File) => {
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
          caption: figureCaption(name && name !== 'image' ? name : 'Uploaded visual'),
          width: imageWidth,
          align: imageAlign,
        })
        notify('Image loaded — customize width, caption & placement, then insert', 'success')
      } catch {
        notify('Could not read that image.', 'error')
      }
    },
    [imageAlign, imageWidth, notify],
  )

  useEffect(() => {
    if (tab !== 'image') return
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? [])
      const file = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      void acceptFile(file)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [tab, acceptFile])

  const run = async (mode: 'generate' | 'regenerate') => {
    const brief = prompt.trim()
    if (!brief) {
      notify('Describe the visual you want first.', 'error')
      return
    }
    if (tab === 'image') {
      setImageBusy(true)
      try {
        const url = await generateAiImage(settings, brief, { style: visualStyle, aspect: aspectRatio })
        setImageAspect(await measureAspect(url))
        setPreview({
          ...(createImageBlock() as ImageBlock),
          url,
          caption: figureCaption(brief),
          width: imageWidth,
          align: imageAlign,
          prompt: brief,
          style: visualStyle,
          aspect: aspectRatio,
        })
        notify(mode === 'regenerate' ? 'New variation generated' : 'Visual generated', 'success')
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
        notify(
          kind === 'figure'
            ? 'Annotated figure ready — adjust labels or anchor points'
            : result.local
              ? 'Built from saved presets (connect AI for custom diagrams)'
              : 'Diagram generated',
          'success',
        )
      } else if (tab === 'chart') {
        const result = await generateChart(settings, brief, chartKind)
        if (result.block.type === 'chart') {
          setSeriesDraft(
            result.block.labels
              .map((label, index) => `${label} | ${result.block.type === 'chart' ? result.block.values[index] ?? 0 : 0}`)
              .join('\n'),
          )
        }
        setPreview(result.block)
        notify(result.local ? 'Chart built from numbers in your brief' : 'Chart generated', 'success')
      } else if (tab === 'stats') {
        const result = await generateStats(settings, brief, doc)
        setPreview(result.block)
        notify(result.local ? 'Starter KPI cards ready — edit values below' : 'KPI Stat cards generated', 'success')
      } else {
        const result = await generateFormula(settings, brief, formulaLayout)
        setPreview(result.block)
        notify(result.local ? 'Formula card built offline — edit LaTeX below' : 'Formulas generated', 'success')
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

  const labelFigure = () => {
    if (!preview || preview.type !== 'image' || !preview.url) return
    setPreview(labeledFigureBlock(preview.url, imageAspect, preview.caption))
    setTab('diagram')
    notify('Figure ready — rename labels and slide their anchor coordinates', 'success')
  }

  const insert = () => {
    if (!preview) return
    onInsert(preview, target)
    notify('Visual inserted into document', 'success')
  }

  const changeTab = (next: StudioTab) => {
    setTab(next)
    setPreview(null)
    setSeriesDraft('')
  }

  return (
    <div className="visual-studio">
      <div className="vs-tabs" role="tablist" aria-label="Visual studio" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
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
        {tab === 'image'
          ? hasGeminiImages(settings)
            ? 'AI image engine ready — photorealistic, 3D, vector, or textbook styles. Or drop/paste (Ctrl+V) any image.'
            : 'Upload or press Ctrl+V to paste any image directly (add a Gemini key in AI Settings to enable AI image generation).'
          : hasAi(settings)
            ? 'AI connected — every chart, diagram & KPI block adapts to your document.'
            : 'Offline presets ready — edit any data or labels directly.'}
      </p>

      {tab === 'image' ? (
        <>
          <div className="bs-field">
            <span className="bs-field__label">Visual style</span>
            <div className="bs-chips">
              {VISUAL_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`bs-chip${visualStyle === style.id ? ' is-active' : ''}`}
                  onClick={() => setVisualStyle(style.id)}
                  title={style.hint}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bs-field">
            <span className="bs-field__label">Aspect ratio</span>
            <div className="bs-chips">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.id}
                  type="button"
                  className={`bs-chip${aspectRatio === ratio.id ? ' is-active' : ''}`}
                  onClick={() => setAspectRatio(ratio.id)}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          <label className="bs-field">
            <span className="bs-field__label">Describe the visual</span>
            <TextArea rows={3} value={prompt} onChange={setPrompt} placeholder={PROMPT_HINTS.image} />
          </label>

          <div className="vs-actions">
            <Button variant="primary" icon="sparkles" full onClick={() => run('generate')} disabled={imageBusy}>
              {imageBusy ? 'Rendering…' : preview ? 'Regenerate' : 'Generate visual'}
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
            <strong>Drop an image, click to browse, or press Ctrl+V</strong>
            <span>Supports PNG, JPG, WebP &amp; clipboard screenshots</span>
          </div>

          {preview?.type === 'image' && preview.url ? (
            <div className="vs-actions">
              {onSetCover ? (
                <Button
                  icon="image"
                  onClick={() => {
                    onSetCover(preview.url)
                    notify('Applied to PDF cover page', 'success')
                  }}
                >
                  Use as Cover
                </Button>
              ) : null}
              <Button icon="sparkles" onClick={labelFigure}>
                Add Labels
              </Button>
            </div>
          ) : null}
        </>
      ) : (
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
              {tab === 'diagram'
                ? 'What should the diagram show?'
                : tab === 'chart'
                  ? 'What data should the chart plot?'
                  : tab === 'stats'
                    ? 'What metrics or KPIs should be highlighted?'
                    : 'Which formulas?'}
            </span>
            <TextArea
              rows={3}
              value={prompt}
              onChange={setPrompt}
              placeholder={PROMPT_HINTS[tab]}
            />
          </label>

          <div className="vs-actions">
            <Button variant="primary" icon="sparkles" full onClick={() => run('generate')} disabled={busy}>
              {busy ? 'Creating…' : preview ? 'Regenerate' : 'Generate'}
            </Button>
            {preview ? (
              <Button icon="refresh" onClick={() => run('regenerate')} disabled={busy}>
                Variation
              </Button>
            ) : null}
          </div>
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
                unit={preview.unit}
                seriesA={preview.seriesA}
                seriesB={preview.seriesB}
                note={preview.note}
              />
            ) : null}
            {preview.type === 'stats' ? (
              <div className="stats-grid" data-count={Math.min(4, Math.max(1, preview.items.length))}>
                {preview.items.map((st) => (
                  <div className="stat-card" key={st.id}>
                    <span className="stat-card__value">{st.value}</span>
                    <span className="stat-card__label">{st.label}</span>
                  </div>
                ))}
              </div>
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
                  <span className="bs-field__label">Unit (optional, e.g. %, °C, $M)</span>
                  <TextInput
                    value={preview.unit ?? ''}
                    onChange={(unit) => patchPreview({ ...(preview as ChartBlock), unit })}
                    placeholder="%"
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
                    const rebuilt = chartFromSeries(
                      seriesDraft,
                      chartKind,
                      (preview as ChartBlock).title,
                      (preview as ChartBlock).unit,
                    )
                    setPreview(rebuilt)
                    if (rebuilt.type === 'chart') {
                      setSeriesDraft(
                        rebuilt.labels.map((label, index) => `${label} | ${rebuilt.values[index] ?? 0}`).join('\n'),
                      )
                    }
                    notify('Chart data applied')
                  }}
                >
                  Apply data
                </Button>
              </>
            ) : null}

            {preview.type === 'stats' ? (
              <>
                <label className="bs-field">
                  <span className="bs-field__label">Section heading</span>
                  <TextInput
                    value={preview.title}
                    onChange={(title) => patchPreview({ ...(preview as StatsBlock), title })}
                  />
                </label>
                {preview.items.map((item, idx) => (
                  <div className="bs-event" key={item.id}>
                    <div className="bs-event__head">
                      <span>Metric {idx + 1}</span>
                    </div>
                    <TextInput
                      value={item.value}
                      onChange={(value) =>
                        patchPreview({
                          ...(preview as StatsBlock),
                          items: preview.items.map((st, i) => (i === idx ? { ...st, value } : st)),
                        })
                      }
                      placeholder="Value (e.g. +1.45°C)"
                    />
                    <TextInput
                      value={item.label}
                      onChange={(label) =>
                        patchPreview({
                          ...(preview as StatsBlock),
                          items: preview.items.map((st, i) => (i === idx ? { ...st, label } : st)),
                        })
                      }
                      placeholder="Label"
                    />
                  </div>
                ))}
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
              <span className="bs-field__label">Insert into section</span>
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
          <span className="vs-empty__mark">
            {tab === 'image' ? '▣' : tab === 'chart' ? '▤' : tab === 'diagram' ? '◈' : tab === 'stats' ? '✦' : '∑'}
          </span>
          <p>
            {tab === 'image'
              ? 'Photorealistic scenes, 3D renders, 2D editorial art, or textbook plates — plus instant drag/drop & Ctrl+V paste.'
              : tab === 'chart'
                ? 'Crisp 2D & 3D Bar, Line, Area, Pie/Donut, Horizontal, and Comparison charts.'
                : tab === 'diagram'
                  ? 'Vector Flowcharts, Cycles, Mindmaps, and Annotated Images with leader lines.'
                  : tab === 'stats'
                    ? 'Publication-grade KPI metric cards for executive reports and case studies.'
                    : 'KaTeX-rendered equations and cheat-sheet boxes.'}
          </p>
          <p className="vs-empty__hint">Try a quick preset:</p>
          <div className="vs-quick">
            {createQuickStart(tab).map((entry) => (
              <button
                key={entry.label}
                type="button"
                className="vs-quick__item"
                onClick={() => {
                  setPrompt(entry.prompt)
                  if (tab === 'diagram') setKind(entry.kind ?? 'flow')
                  if (tab === 'image' && entry.style) setVisualStyle(entry.style)
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

function createQuickStart(
  tab: StudioTab,
): { label: string; prompt: string; kind?: DiagramKind; style?: VisualStyleId }[] {
  if (tab === 'image') {
    return [
      {
        label: 'Melting Glacier (HD)',
        prompt: 'Dramatic aerial view of turquoise meltwater rivers carving across an Arctic glacier at golden hour',
        style: 'photorealistic',
      },
      {
        label: '3D Clean Energy Grid',
        prompt: 'Isometric 3D architectural model of solar panels, wind turbines, and smart battery storage connected to a green city',
        style: '3d-illustration',
      },
      {
        label: 'Mountain Horizon',
        prompt: 'Misty alpine mountain peaks at sunrise above low valley clouds, crisp editorial landscape photography',
        style: 'cinematic-cover',
      },
      {
        label: '2D Editorial Concept',
        prompt: 'Minimalist geometric editorial illustration of global sustainability, balance, and renewable growth',
        style: '2d-vector',
      },
    ]
  }
  if (tab === 'diagram') {
    return [
      { label: 'Climate Loop', prompt: 'Arctic ice-albedo warming feedback loop', kind: 'cycle' },
      { label: 'Delivery Workflow', prompt: 'Audit & discovery, strategy, production, client growth', kind: 'flow' },
      { label: 'Strategy Mindmap', prompt: 'Core business growth pillars: brand, product, content, retention', kind: 'mindmap' },
      { label: 'Heart (Annotated)', prompt: 'Human heart cut-away with chambers and valves', kind: 'figure' },
    ]
  }
  if (tab === 'chart') {
    return [
      { label: 'Global Temp Rise', prompt: 'Global temperature anomaly by decade: 1980s 0.26, 1990s 0.40, 2000s 0.59, 2010s 0.85, 2020s 1.24' },
      { label: 'Revenue Split', prompt: 'Revenue mix by tier: Retainers 48, Brand Systems 28, Audits 14, Workshops 10' },
      { label: 'Energy Growth', prompt: 'Clean energy capacity GW: Solar 1600, Wind 1020, Hydro 1400, Nuclear 415' },
    ]
  }
  if (tab === 'stats') {
    return [
      { label: 'Climate Snapshot', prompt: 'Global Climate Change key indicators: warming anomaly, CO2 ppm, renewable share' },
      { label: 'Agency ROI', prompt: 'Client campaign results: conversion lift, pipeline growth, payback period' },
    ]
  }
  return [
    { label: 'Finance sheet', prompt: 'Business finance formulas for ROI, break-even and CAGR' },
    { label: 'Physics sheet', prompt: 'Physics formula cheat sheet for motion and optics' },
    { label: 'Economics sheet', prompt: 'Macroeconomics formula sheet for inflation and money supply' },
    { label: 'Biology sheet', prompt: 'Biology equations for photosynthesis and respiration' },
  ]
}

function measureAspect(url: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.height && image.width ? image.height / image.width : 0.78)
    image.onerror = () => resolve(0.78)
    image.src = url
  })
}

function figureCaption(text: string): string {
  const clean = text
    .replace(/^fig(?:ure)?\.?\s*\d+(?:\.\d+)?\s*[:.–—-]\s*/i, '')
    .trim()
    .slice(0, 90)
  return `Fig: ${clean || 'Untitled visual'}`
}
