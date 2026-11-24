import { useEffect, useState, type ReactNode } from 'react'
import { Button, ColorField, Icon, TextArea, TextInput } from './ui'
import { CalloutGlyph } from '../render/DocPages'
import {
  CALLOUT_PRESETS,
  CHART_KINDS,
  createCalloutBlock,
  createChartBlock,
  createImageBlock,
  createTimelineBlock,
  findBlocks,
  insertBlock,
  newTimelineItem,
  parseSeries,
  seriesText,
} from '../lib/blocks'
import { moveBlockById, removeBlockById, updateBlockById } from '../lib/docOps'
import type { CalloutIcon, ChartKind, DocBlock, PdfDoc } from '../types'

const BLOCK_LABELS: Record<string, string> = {
  image: 'Image',
  chart: 'Chart',
  timeline: 'Timeline',
  callout: 'Callout',
  diagram: 'Diagram',
  math: 'Formula',
}

const ICONS: CalloutIcon[] = ['spark', 'pin', 'bulb', 'alert', 'quote', 'check', 'book', 'shield']

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="bs-field">
      <span className="bs-field__label">{label}</span>
      {children}
    </label>
  )
}

async function readImageFile(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('unreadable'))
    reader.readAsDataURL(file)
  })
  // Downscale once so the draft stays inside localStorage and export stays fast.
  const image = new Image()
  await new Promise<void>((resolve) => {
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = raw
  })
  const limit = 1400
  if (!image.width || image.width <= limit) return raw
  const scale = limit / image.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return raw
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}

export function BlockStudio({
  doc,
  onChange,
}: {
  doc: PdfDoc
  onChange: (doc: PdfDoc) => void
}) {
  const entries = findBlocks(doc).filter((entry) =>
    ['image', 'chart', 'timeline', 'callout', 'diagram', 'math'].includes(entry.block.type),
  )
  const [target, setTarget] = useState(doc.sections[doc.sections.length - 1]?.id ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.block.id ?? null)
  const [seriesDraft, setSeriesDraft] = useState('')

  useEffect(() => {
    if (!doc.sections.some((section) => section.id === target)) {
      setTarget(doc.sections[doc.sections.length - 1]?.id ?? '')
    }
  }, [doc.sections, target])

  const selected = entries.find((entry) => entry.block.id === selectedId) ?? null
  const block = selected?.block ?? null

  useEffect(() => {
    if (block?.type === 'chart') setSeriesDraft(seriesText(block.labels, block.values))
    // Only resync when the chart being edited changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const add = (factory: () => DocBlock) => {
    const next = factory()
    onChange(insertBlock(doc, target, next))
    setSelectedId(next.id)
  }

  const patch = (next: DocBlock) => {
    if (!selected) return
    onChange(updateBlockById(doc, selected.section.id, selected.block.id, () => next))
  }

  const patchChart = (partial: Partial<Extract<DocBlock, { type: 'chart' }>>) => {
    if (block?.type !== 'chart') return
    patch({ ...block, ...partial })
  }

  return (
    <div className="block-studio">
      <div className="bs-insert">
        <Button variant="primary" icon="plus" full onClick={() => add(createImageBlock)}>
          Insert Image block
        </Button>
        <div className="bs-insert__grid">
          <Button icon="image" onClick={() => add(createChartBlock)}>
            Chart
          </Button>
          <Button icon="arrow" onClick={() => add(createTimelineBlock)}>
            Timeline
          </Button>
          <Button icon="sparkles" onClick={() => add(createCalloutBlock)}>
            Callout
          </Button>
        </div>
        {doc.sections.length ? (
          <Field label="Insert into section">
            <select className="input" value={target} onChange={(event) => setTarget(event.target.value)}>
              {doc.sections.map((section, index) => (
                <option key={section.id} value={section.id}>
                  {String(index + 1).padStart(2, '0')} · {section.heading}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      {entries.length ? (
        <ul className="bs-list">
          {entries.map((entry) => {
            const label =
              entry.block.type === 'chart' ||
              entry.block.type === 'timeline' ||
              entry.block.type === 'diagram' ||
              entry.block.type === 'math'
                ? entry.block.title || BLOCK_LABELS[entry.block.type]
                : entry.block.type === 'image'
                  ? entry.block.caption || 'Image'
                  : entry.block.type === 'callout'
                    ? entry.block.title || 'Callout'
                    : 'Block'
            return (
              <li
                key={entry.block.id}
                className={`bs-row${entry.block.id === selectedId ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  className="bs-row__main"
                  onClick={() => setSelectedId(entry.block.id)}
                  title={`${BLOCK_LABELS[entry.block.type]} block`}
                >
                  <span className="bs-row__kind">{BLOCK_LABELS[entry.block.type]}</span>
                  <span className="bs-row__label">{label}</span>
                </button>
                <div className="bs-row__tools">
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Move up"
                    aria-label="Move block up"
                    onClick={() =>
                      onChange(moveBlockById(doc, entry.section.id, entry.block.id, -1))
                    }
                    disabled={entry.index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Move down"
                    aria-label="Move block down"
                    onClick={() =>
                      onChange(moveBlockById(doc, entry.section.id, entry.block.id, 1))
                    }
                    disabled={entry.index === entry.section.blocks.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Delete block"
                    aria-label="Delete block"
                    onClick={() => {
                      onChange(removeBlockById(doc, entry.section.id, entry.block.id))
                      if (selectedId === entry.block.id) setSelectedId(null)
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="bs-empty">No visual blocks yet. Insert one to build charts, timelines and callouts.</p>
      )}

      {block?.type === 'image' ? (
        <div className="bs-inspector">
          <Field label="Image URL">
            <TextInput
              value={block.url}
              onChange={(url) => patch({ ...block, url })}
              placeholder="https://…"
            />
          </Field>
          <label className="bs-upload">
            <span>Upload from this device</span>
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const url = await readImageFile(file)
                patch({ ...block, url })
                event.target.value = ''
              }}
            />
          </label>
          <Field label={`Width · ${block.width}%`}>
            <input
              className="bs-range"
              type="range"
              min={30}
              max={100}
              step={5}
              value={block.width}
              onChange={(event) => patch({ ...block, width: Number(event.target.value) })}
            />
          </Field>
          <Field label="Alignment">
            <div className="segmented">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={`segmented__item${block.align === align ? ' is-active' : ''}`}
                  onClick={() => patch({ ...block, align })}
                >
                  {align}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Caption">
            <TextInput
              value={block.caption}
              onChange={(caption) => patch({ ...block, caption })}
            />
          </Field>
          <label className="bs-check">
            <input
              type="checkbox"
              checked={block.rounded}
              onChange={(event) => patch({ ...block, rounded: event.target.checked })}
            />
            <span>Rounded corners</span>
          </label>
        </div>
      ) : null}

      {block?.type === 'chart' ? (
        <div className="bs-inspector">
          <div className="bs-chips">
            {CHART_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                className={`bs-chip${block.chart === kind.id ? ' is-active' : ''}`}
                onClick={() => patchChart({ chart: kind.id as ChartKind })}
              >
                {kind.label}
              </button>
            ))}
          </div>
          <Field label="Chart title">
            <TextInput value={block.title} onChange={(title) => patchChart({ title })} />
          </Field>
          <Field label="Data · one row per item (Label: value)">
            <TextArea
              rows={6}
              value={seriesDraft}
              onChange={(value) => {
                setSeriesDraft(value)
                const parsed = parseSeries(value)
                patchChart({ labels: parsed.labels, values: parsed.values })
              }}
            />
          </Field>
          {block.chart === 'compare' ? (
            <Field label="Series B · optional, one value per row">
              <TextInput
                value={(block.values2 ?? []).join(', ')}
                placeholder="e.g. 28, 34, 19"
                onChange={(value) => {
                  const values2 = value
                    .split(/\s*[,|]\s*/)
                    .map((entry) => Number(entry))
                    .filter((entry) => Number.isFinite(entry))
                  patchChart({ values2 })
                }}
              />
            </Field>
          ) : null}
          <ColorField
            label="Primary accent"
            value={block.accent}
            onChange={(accent) => patchChart({ accent })}
          />
          <ColorField
            label="Secondary accent"
            value={block.accent2}
            onChange={(accent2) => patchChart({ accent2 })}
          />
        </div>
      ) : null}

      {block?.type === 'timeline' ? (
        <div className="bs-inspector">
          <Field label="Timeline title">
            <TextInput value={block.title} onChange={(title) => patch({ ...block, title })} />
          </Field>
          <div className="bs-chips">
            {(['vertical', 'horizontal'] as const).map((orientation) => (
              <button
                key={orientation}
                type="button"
                className={`bs-chip${block.orientation === orientation ? ' is-active' : ''}`}
                onClick={() => patch({ ...block, orientation })}
              >
                {orientation}
              </button>
            ))}
          </div>
          {block.items.map((item, index) => (
            <div className="bs-event" key={item.id}>
              <div className="bs-event__head">
                <span>Event {index + 1}</span>
                {block.items.length > 1 ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label="Remove event"
                    onClick={() =>
                      patch({ ...block, items: block.items.filter((entry) => entry.id !== item.id) })
                    }
                  >
                    <Icon name="x" size={12} />
                  </button>
                ) : null}
              </div>
              <TextInput
                value={item.date}
                onChange={(date) =>
                  patch({
                    ...block,
                    items: block.items.map((entry, i) => (i === index ? { ...entry, date } : entry)),
                  })
                }
                placeholder="1857 or Q1 2026"
              />
              <TextInput
                value={item.title}
                onChange={(title) =>
                  patch({
                    ...block,
                    items: block.items.map((entry, i) => (i === index ? { ...entry, title } : entry)),
                  })
                }
                placeholder="Event title"
              />
              <TextInput
                value={item.description}
                onChange={(description) =>
                  patch({
                    ...block,
                    items: block.items.map((entry, i) =>
                      i === index ? { ...entry, description } : entry,
                    ),
                  })
                }
                placeholder="Short description"
              />
            </div>
          ))}
          <Button
            icon="plus"
            full
            onClick={() => patch({ ...block, items: [...block.items, newTimelineItem()] })}
          >
            Add event
          </Button>
        </div>
      ) : null}

      {block?.type === 'diagram' ? (
        <div className="bs-inspector">
          <Field label="Figure title">
            <TextInput value={block.title} onChange={(title) => patch({ ...block, title })} />
          </Field>
          <Field label="Caption">
            <TextInput value={block.caption} onChange={(caption) => patch({ ...block, caption })} />
          </Field>
          <p className="bs-empty">
            {block.nodes.length} labels · {block.diagram} diagram. Regenerate or relabel it in Visual
            Studio.
          </p>
        </div>
      ) : null}

      {block?.type === 'math' ? (
        <div className="bs-inspector">
          <Field label="Title">
            <TextInput value={block.title} onChange={(title) => patch({ ...block, title })} />
          </Field>
          <Field label="Note">
            <TextInput value={block.note} onChange={(note) => patch({ ...block, note })} />
          </Field>
          <p className="bs-empty">
            {block.layout === 'sheet' ? `${block.items.length} formulas in this sheet` : 'Single equation'}.
            Edit the LaTeX in Visual Studio.
          </p>
        </div>
      ) : null}

      {block?.type === 'callout' ? (
        <div className="bs-inspector">
          <div className="bs-chips">
            {CALLOUT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`bs-chip${block.kind === preset.id ? ' is-active' : ''}`}
                onClick={() =>
                  patch({
                    ...block,
                    kind: preset.id,
                    icon: preset.icon,
                    title: block.title || preset.label,
                  })
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Field label="Icon">
            <div className="bs-icons">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={`bs-icon${(block.icon ?? 'pin') === icon ? ' is-active' : ''}`}
                  onClick={() => patch({ ...block, icon })}
                  title={icon}
                  aria-label={`Use ${icon} icon`}
                >
                  <CalloutGlyph icon={icon} />
                </button>
              ))}
            </div>
          </Field>
          <ColorField
            label="Accent colour"
            value={block.accent || '#4f6bff'}
            onChange={(accent) => patch({ ...block, accent })}
          />
          <Field label="Heading">
            <TextInput value={block.title} onChange={(title) => patch({ ...block, title })} />
          </Field>
          <Field label="Body">
            <TextArea rows={4} value={block.body} onChange={(body) => patch({ ...block, body })} />
          </Field>
        </div>
      ) : null}
    </div>
  )
}
