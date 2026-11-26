import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { Editable } from '../components/Editable'
import { setBlockText, setSectionHeading, updateBlock, updateMcq } from '../lib/docOps'
import { CALLOUT_LABELS } from '../lib/blocks'
import { A4, CONTENT_HEIGHT, CONTENT_WIDTH, FLOW_GAP, paginate } from '../lib/pagination'
import type { FlowItem } from '../lib/pagination'
import { themeFor } from '../theme/themes'
import { ChartSvg } from './charts'
import { DiagramView } from './diagram'
import { MathView } from './math'
import { BrandMark, Watermark, paperVars } from './chrome'
import type {
  AppSettings,
  BrandPreset,
  CalloutIcon,
  DocBlock,
  McqItem,
  PdfDoc,
} from '../types'

interface Props {
  doc: PdfDoc
  settings: AppSettings
  brand: BrandPreset
  onChange: (doc: PdfDoc) => void
  onPageCount?: (count: number) => void
  onMoveBlock?: (sectionId: string, blockId: string, direction: -1 | 1) => void
  onDeleteBlock?: (sectionId: string, blockId: string) => void
  onRegenerateImage?: (sectionId: string, blockId: string) => void
  onUploadBlockImage?: (sectionId: string, blockId: string, file: File) => void
  onCoverUpload?: (file: File) => void
  onCoverGenerate?: () => void
  coverBusy?: boolean
}

const TABLE_SLICE_ROWS = 7

const ICON_PATHS: Record<CalloutIcon, ReactNode> = {
  spark: <path d="M8 1.8 9.3 6l4.2 1.3-4.2 1.3L8 12.8 6.7 8.6 2.5 7.3 6.7 6z" />,
  alert: (
    <>
      <path d="M8 2.2 14.4 13H1.6z" />
      <path d="M8 6.4v3.1M8 11.3v.2" />
    </>
  ),
  bulb: (
    <>
      <path d="M5.6 10.2a4.2 4.2 0 1 1 4.8 0" />
      <path d="M6.4 12.2h3.2M6.9 14h2.2" />
    </>
  ),
  pin: (
    <>
      <circle cx="8" cy="6.6" r="2.6" />
      <path d="M8 14.2V9.2" />
    </>
  ),
  quote: <path d="M3 9.4V5.2h4v3.2c0 1.6-.8 2.8-2.4 3.4M9.6 9.4V5.2h4v3.2c0 1.6-.8 2.8-2.4 3.4" />,
  check: <path d="m2.8 8.4 3.2 3.2 7-7.4" />,
  book: (
    <>
      <path d="M2.6 3.4h4.2a1.4 1.4 0 0 1 1.2 1.4v8.4a1.6 1.6 0 0 0-1.6-1.2H2.6z" />
      <path d="M13.4 3.4H9.2A1.4 1.4 0 0 0 8 4.8v8.4a1.6 1.6 0 0 1 1.6-1.2h3.8z" />
    </>
  ),
  shield: (
    <>
      <path d="M8 1.8 13.2 4v4.4c0 2.8-2.2 4.8-5.2 5.8-3-1-5.2-3-5.2-5.8V4z" />
      <path d="m5.8 7.8 1.6 1.6 3-3.1" />
    </>
  ),
}

const DEFAULT_ICON: Record<string, CalloutIcon> = {
  exam: 'spark',
  fact: 'pin',
  note: 'book',
  tip: 'bulb',
  warning: 'alert',
  quote: 'quote',
  summary: 'check',
}

export function CalloutGlyph({ icon }: { icon: CalloutIcon }) {
  return (
    <svg
      className="callout__icon"
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[icon]}
    </svg>
  )
}

function RunningHeader({
  style,
  doc,
  brand,
}: {
  style: AppSettings['headerStyle']
  doc: PdfDoc
  brand: BrandPreset
}) {
  return (
    <header className={`paper-head paper-head--${style}`}>
      <div className="paper-head__inner">
        <BrandMark brand={brand} />
        <span className="paper-head__meta">{doc.eyebrow || 'PUBLICATION'}</span>
      </div>
    </header>
  )
}

function PageFooter({
  doc,
  brand,
  pageNumber,
  totalPages,
}: {
  doc: PdfDoc
  brand: BrandPreset
  pageNumber: number
  totalPages: number
}) {
  return (
    <footer className="paper-foot">
      <div className="paper-foot__left">
        <span className="paper-foot__brand">{brand.footer || brand.brandName}</span>
        {brand.handle ? <span className="paper-foot__handle">{brand.handle}</span> : null}
      </div>
      <div className="paper-foot__right">
        <span className="paper-foot__title">{doc.title}</span>
        <span className="paper-foot__page">
          {String(pageNumber).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
        </span>
      </div>
    </footer>
  )
}

function Cover({
  doc,
  brand,
  settings,
  totalPages,
  onChange,
  onCoverUpload,
  onCoverGenerate,
  coverBusy,
}: {
  doc: PdfDoc
  brand: BrandPreset
  settings: AppSettings
  totalPages: number
  onChange: (doc: PdfDoc) => void
  onCoverUpload?: (file: File) => void
  onCoverGenerate?: () => void
  coverBusy?: boolean
}) {
  const vars = paperVars(settings, brand, 'cover')
  const theme = themeFor(settings, 'cover')
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const coverInputRef = useRef<HTMLInputElement>(null)
  const coverLayout = doc.coverImageLayout ?? 'banner'
  const hasCoverImg = Boolean(doc.coverImage)

  const cycleCoverLayout = () => {
    const order: ('banner' | 'full' | 'side')[] = ['banner', 'side', 'full']
    const next = order[(order.indexOf(coverLayout) + 1) % order.length]
    onChange({ ...doc, coverImageLayout: next })
  }

  return (
    <article
      className={`paper-page paper-cover${hasCoverImg ? ` cover--has-image cover--${coverLayout}` : ''}`}
      data-pdf-page="cover"
      data-layout={settings.layout}
      data-header={settings.headerStyle}
      data-paper-dark={theme.dark || (hasCoverImg && coverLayout === 'full') ? 'true' : 'false'}
      style={vars}
    >
      <div className="cover__wash" aria-hidden="true" />
      <div className="cover__grid" aria-hidden="true" />

      {hasCoverImg && coverLayout === 'full' ? (
        <div className="cover__bg-media" aria-hidden="true">
          <img src={doc.coverImage} alt="" />
          <div className="cover__bg-scrim" />
        </div>
      ) : null}

      <div className="cover__top">
        <BrandMark brand={brand} />
        <div className="cover__top-right">
          <Editable
            as="span"
            className="cover__eyebrow"
            value={doc.eyebrow}
            placeholder="EYEBROW"
            onChange={(value) => onChange({ ...doc, eyebrow: value })}
          />
          {onCoverUpload || onCoverGenerate ? (
            <div className="cover-tools no-export">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && onCoverUpload) onCoverUpload(file)
                  e.target.value = ''
                }}
              />
              {onCoverGenerate ? (
                <button type="button" className="cover-tool" onClick={onCoverGenerate} disabled={coverBusy}>
                  {coverBusy ? 'Rendering…' : hasCoverImg ? 'Regen Cover' : 'AI Cover'}
                </button>
              ) : null}
              {onCoverUpload ? (
                <button type="button" className="cover-tool" onClick={() => coverInputRef.current?.click()}>
                  Upload
                </button>
              ) : null}
              {hasCoverImg ? (
                <>
                  <button type="button" className="cover-tool" onClick={cycleCoverLayout}>
                    {coverLayout}
                  </button>
                  <button
                    type="button"
                    className="cover-tool"
                    onClick={() => onChange({ ...doc, coverImage: undefined })}
                    title="Remove cover image"
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`cover__hero${hasCoverImg && coverLayout !== 'full' ? ` cover__hero--${coverLayout}` : ''}`}>
        <div className="cover__main">
          <Editable
            as="h1"
            className="cover__title"
            value={doc.title}
            multiline
            placeholder="Document title"
            onChange={(value) => onChange({ ...doc, title: value })}
          />
          <div className="cover__rule" aria-hidden="true" />
          <Editable
            as="p"
            className="cover__sub"
            value={doc.subtitle}
            multiline
            placeholder="One line of context"
            onChange={(value) => onChange({ ...doc, subtitle: value })}
          />
        </div>

        {hasCoverImg && coverLayout !== 'full' ? (
          <div className="cover__art">
            <img src={doc.coverImage} alt={doc.title || 'Cover visual'} />
          </div>
        ) : !hasCoverImg && coverBusy ? (
          <div className="cover__art cover__art--loading no-export">
            <div className="img-shimmer">Rendering cover visual…</div>
          </div>
        ) : null}
      </div>

      <div className="cover__foot">
        <div className="cover__chips">
          <span className="cover__chip">{doc.sections.length} sections</span>
          {doc.mcqs.length ? <span className="cover__chip">{doc.mcqs.length} MCQs</span> : null}
          <span className="cover__chip">{totalPages} pages</span>
        </div>
        <div className="cover__meta">
          <span>{date}</span>
          <span>{brand.handle}</span>
        </div>
      </div>
      {settings.paymentLock ? <Watermark text={brand.watermark} /> : null}
    </article>
  )
}

function BlockView({
  block,
  sectionIndex,
  blockIndex,
  doc,
  onChange,
  rowStart,
  rowEnd,
  isContinuation,
  onMoveBlock,
  onDeleteBlock,
  onRegenerateImage,
  onUploadBlockImage,
}: {
  block: DocBlock
  sectionIndex: number
  blockIndex: number
  doc: PdfDoc
  onChange: (doc: PdfDoc) => void
  rowStart?: number
  rowEnd?: number
  isContinuation?: boolean
  onMoveBlock?: (sectionId: string, blockId: string, direction: -1 | 1) => void
  onDeleteBlock?: (sectionId: string, blockId: string) => void
  onRegenerateImage?: (sectionId: string, blockId: string) => void
  onUploadBlockImage?: (sectionId: string, blockId: string, file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const section = doc.sections[sectionIndex]
  const set = (text: string) => onChange(setBlockText(doc, sectionIndex, blockIndex, text))
  const patch = (updater: (current: DocBlock) => DocBlock) =>
    onChange(updateBlock(doc, sectionIndex, blockIndex, updater))

  const wrapWithTools = (content: ReactNode) => {
    if (!section || isContinuation || (!onMoveBlock && !onDeleteBlock)) return content
    return (
      <div className="blk-wrap">
        <div className="blk-hover-tools no-export">
          {block.type === 'image' && onRegenerateImage ? (
            <button
              type="button"
              className="blk-tool"
              title="Generate / regenerate AI visual"
              onClick={() => onRegenerateImage(section.id, block.id)}
              disabled={block.generating}
            >
              {block.generating ? '…' : '✦ AI'}
            </button>
          ) : null}
          {block.type === 'image' && onUploadBlockImage ? (
            <button
              type="button"
              className="blk-tool"
              title="Upload image"
              onClick={() => fileRef.current?.click()}
            >
              ↑ Img
            </button>
          ) : null}
          {onMoveBlock ? (
            <>
              <button
                type="button"
                className="blk-tool"
                title="Move block up"
                disabled={blockIndex === 0}
                onClick={() => onMoveBlock(section.id, block.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="blk-tool"
                title="Move block down"
                disabled={blockIndex === section.blocks.length - 1}
                onClick={() => onMoveBlock(section.id, block.id, 1)}
              >
                ↓
              </button>
            </>
          ) : null}
          {onDeleteBlock ? (
            <button
              type="button"
              className="blk-tool blk-tool--danger"
              title="Remove block"
              onClick={() => onDeleteBlock(section.id, block.id)}
            >
              ×
            </button>
          ) : null}
        </div>
        {content}
      </div>
    )
  }

  switch (block.type) {
    case 'lead':
      return wrapWithTools(
        <div className="blk blk--lead">
          <Editable as="p" className="blk-lead__text" value={block.text} multiline onChange={set} />
        </div>,
      )
    case 'paragraph':
      return wrapWithTools(
        <div className="blk blk--p">
          <Editable as="p" className="blk-p__text" value={block.text} multiline onChange={set} />
        </div>,
      )
    case 'subheading':
      return wrapWithTools(
        <div className="blk blk--sub">
          <Editable as="h3" className="blk-sub__text" value={block.text} onChange={set} />
        </div>,
      )
    case 'bullets':
      return wrapWithTools(
        <div className="blk blk--list">
          <ul className="blk-list">
            {block.items.map((item, index) => (
              <li key={index}>
                <Editable
                  as="span"
                  value={item}
                  multiline
                  placeholder="List item"
                  onChange={(value) =>
                    patch((current) =>
                      current.type === 'bullets'
                        ? { ...current, items: current.items.map((it, i) => (i === index ? value : it)) }
                        : current,
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>,
      )
    case 'numbered':
      return wrapWithTools(
        <div className="blk blk--list">
          <ol className="blk-list blk-list--ordered">
            {block.items.map((item, index) => (
              <li key={index}>
                <span className="blk-list__marker">{String(index + 1).padStart(2, '0')}</span>
                <Editable
                  as="span"
                  value={item}
                  multiline
                  placeholder="Step"
                  onChange={(value) =>
                    patch((current) =>
                      current.type === 'numbered'
                        ? { ...current, items: current.items.map((it, i) => (i === index ? value : it)) }
                        : current,
                    )
                  }
                />
              </li>
            ))}
          </ol>
        </div>,
      )
    case 'keyterms':
      return wrapWithTools(
        <div className="blk blk--terms">
          <div className="blk-terms">
            {block.items.map((item, index) => (
              <div className="blk-terms__row" key={index}>
                <Editable
                  as="span"
                  className="blk-terms__term"
                  value={item.term}
                  onChange={(value) =>
                    patch((current) =>
                      current.type === 'keyterms'
                        ? {
                            ...current,
                            items: current.items.map((it, i) => (i === index ? { ...it, term: value } : it)),
                          }
                        : current,
                    )
                  }
                />
                <Editable
                  as="span"
                  className="blk-terms__def"
                  value={item.definition}
                  multiline
                  onChange={(value) =>
                    patch((current) =>
                      current.type === 'keyterms'
                        ? {
                            ...current,
                            items: current.items.map((it, i) =>
                              i === index ? { ...it, definition: value } : it,
                            ),
                          }
                        : current,
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>,
      )
    case 'table': {
      const start = rowStart ?? 0
      const end = rowEnd ?? block.rows.length
      const visibleRows = block.rows.slice(start, end)
      const capText = isContinuation
        ? `${block.caption || 'Table'} (cont.)`
        : block.caption
      return wrapWithTools(
        <div className="blk blk--table">
          <figure className="blk-table">
            {isContinuation ? (
              <figcaption className="blk-table__cap">{capText}</figcaption>
            ) : (
              <Editable
                as="figcaption"
                className="blk-table__cap"
                value={block.caption}
                placeholder="Table caption"
                onChange={(value) =>
                  patch((current) => (current.type === 'table' ? { ...current, caption: value } : current))
                }
              />
            )}
            <table>
              <thead>
                <tr>
                  {block.columns.map((column, columnIndex) => (
                    <th key={columnIndex}>
                      <Editable
                        as="span"
                        value={column}
                        placeholder="Column"
                        onChange={(value) =>
                          patch((current) =>
                            current.type === 'table'
                              ? {
                                  ...current,
                                  columns: current.columns.map((c, i) => (i === columnIndex ? value : c)),
                                }
                              : current,
                          )
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, relIndex) => {
                  const rowIndex = start + relIndex
                  return (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>
                          <Editable
                            as="span"
                            value={cell}
                            multiline
                            onChange={(value) =>
                              patch((current) =>
                                current.type === 'table'
                                  ? {
                                      ...current,
                                      rows: current.rows.map((r, ri) =>
                                        ri === rowIndex ? r.map((c, ci) => (ci === cellIndex ? value : c)) : r,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </figure>
        </div>,
      )
    }
    case 'callout': {
      const icon = (block.icon ?? DEFAULT_ICON[block.kind] ?? 'pin') as CalloutIcon
      return wrapWithTools(
        <div className={`blk blk--callout blk--callout-${block.kind}`}>
          <aside
            className="callout"
            style={block.accent ? ({ '--callout-accent': block.accent } as CSSProperties) : undefined}
          >
            <div className="callout__label">
              <CalloutGlyph icon={icon} />
              <span>{CALLOUT_LABELS[block.kind] ?? 'Key Fact'}</span>
            </div>
            <Editable
              as="h4"
              className="callout__title"
              value={block.title}
              onChange={(value) =>
                patch((current) => (current.type === 'callout' ? { ...current, title: value } : current))
              }
            />
            <Editable
              as="p"
              className="callout__body"
              value={block.body}
              multiline
              onChange={(value) =>
                patch((current) => (current.type === 'callout' ? { ...current, body: value } : current))
              }
            />
          </aside>
        </div>,
      )
    }
    case 'quote':
      return wrapWithTools(
        <div className="blk blk--quote">
          <blockquote className="quote">
            <Editable as="p" className="quote__text" value={block.text} multiline onChange={set} />
            <Editable
              as="cite"
              className="quote__cite"
              value={block.cite}
              placeholder="Source"
              onChange={(value) =>
                patch((current) => (current.type === 'quote' ? { ...current, cite: value } : current))
              }
            />
          </blockquote>
        </div>,
      )
    case 'stats':
      return wrapWithTools(
        <div className="blk blk--stats">
          {block.title ? (
            <Editable
              as="h4"
              className="stats-title"
              value={block.title}
              placeholder="Key metrics"
              onChange={(title) =>
                patch((current) => (current.type === 'stats' ? { ...current, title } : current))
              }
            />
          ) : null}
          <div className="stats-grid" data-count={Math.min(4, Math.max(1, block.items.length))}>
            {block.items.map((item, index) => (
              <div className="stat-card" key={item.id}>
                <Editable
                  as="span"
                  className="stat-card__value"
                  value={item.value}
                  onChange={(value) =>
                    patch((current) =>
                      current.type === 'stats'
                        ? {
                            ...current,
                            items: current.items.map((st, i) => (i === index ? { ...st, value } : st)),
                          }
                        : current,
                    )
                  }
                />
                <Editable
                  as="span"
                  className="stat-card__label"
                  value={item.label}
                  multiline
                  onChange={(label) =>
                    patch((current) =>
                      current.type === 'stats'
                        ? {
                            ...current,
                            items: current.items.map((st, i) => (i === index ? { ...st, label } : st)),
                          }
                        : current,
                    )
                  }
                />
                {item.delta ? (
                  <Editable
                    as="span"
                    className="stat-card__delta"
                    value={item.delta}
                    onChange={(delta) =>
                      patch((current) =>
                        current.type === 'stats'
                          ? {
                              ...current,
                              items: current.items.map((st, i) => (i === index ? { ...st, delta } : st)),
                            }
                          : current,
                      )
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>,
      )
    case 'image': {
      const width = Math.min(100, Math.max(25, block.width || 100))
      const fit = block.fit === 'cover' ? 'cover' : 'contain'
      return wrapWithTools(
        <div className={`blk blk--image blk--image-${block.align}`}>
          {onUploadBlockImage ? (
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file && section) onUploadBlockImage(section.id, block.id, file)
                e.target.value = ''
              }}
            />
          ) : null}
          <figure className="img-block" style={{ width: `${width}%` }}>
            {block.url ? (
              <img
                className={`img-block__img${block.rounded ? ' is-rounded' : ''} img-block__img--${fit}`}
                src={block.url}
                alt={block.caption || 'Document visual'}
              />
            ) : block.generating ? (
              <div className="img-shimmer no-export">
                <span>Generating visual: {block.prompt?.slice(0, 72) || 'Illustration'}…</span>
              </div>
            ) : (
              <div className="img-block__empty no-export">
                <p>{block.prompt ? `Visual brief: “${block.prompt.slice(0, 96)}”` : 'Drop, paste (Ctrl+V), upload or generate a visual'}</p>
                <div className="img-block__empty-actions">
                  {block.prompt && section && onRegenerateImage ? (
                    <button
                      type="button"
                      className="cover-tool"
                      onClick={() => onRegenerateImage(section.id, block.id)}
                    >
                      ✦ Generate AI Visual
                    </button>
                  ) : null}
                  {section && onUploadBlockImage ? (
                    <button type="button" className="cover-tool" onClick={() => fileRef.current?.click()}>
                      Upload Image
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            <Editable
              as="figcaption"
              className="img-block__cap"
              value={block.caption}
              placeholder="Image caption"
              onChange={(value) =>
                patch((current) => (current.type === 'image' ? { ...current, caption: value } : current))
              }
            />
          </figure>
        </div>,
      )
    }
    case 'chart':
      return wrapWithTools(
        <div className="blk blk--chart">
          <ChartSvg
            chart={block.chart}
            title={block.title}
            labels={block.labels}
            values={block.values}
            values2={block.values2}
            accent={block.accent || 'var(--brand)'}
            accent2={block.accent2 || 'var(--accent)'}
            unit={block.unit}
            seriesA={block.seriesA}
            seriesB={block.seriesB}
            note={block.note}
          />
        </div>,
      )
    case 'diagram':
      return wrapWithTools(
        <div className="blk blk--diagram">
          <DiagramView block={block} />
        </div>,
      )
    case 'math':
      return wrapWithTools(
        <div className="blk blk--math">
          <MathView block={block} />
        </div>,
      )
    case 'timeline':
      return wrapWithTools(
        <div className={`blk blk--timeline tl--${block.orientation}`}>
          <Editable
            as="h4"
            className="tl__title"
            value={block.title}
            placeholder="Timeline title"
            onChange={(value) =>
              patch((current) => (current.type === 'timeline' ? { ...current, title: value } : current))
            }
          />
          <ol className="tl">
            {block.items.map((event, index) => (
              <li className="tl__item" key={event.id}>
                <span className="tl__dot" aria-hidden="true" />
                <Editable
                  as="span"
                  className="tl__date"
                  value={event.date}
                  placeholder="Phase"
                  onChange={(value) =>
                    patch((current) =>
                      current.type === 'timeline'
                        ? {
                            ...current,
                            items: current.items.map((it, i) => (i === index ? { ...it, date: value } : it)),
                          }
                        : current,
                    )
                  }
                />
                <div className="tl__body">
                  <Editable
                    as="span"
                    className="tl__event"
                    value={event.title}
                    placeholder="Event title"
                    onChange={(value) =>
                      patch((current) =>
                        current.type === 'timeline'
                          ? {
                              ...current,
                              items: current.items.map((it, i) =>
                                i === index ? { ...it, title: value } : it,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                  <Editable
                    as="span"
                    className="tl__desc"
                    value={event.description}
                    multiline
                    placeholder="Short description"
                    onChange={(value) =>
                      patch((current) =>
                        current.type === 'timeline'
                          ? {
                              ...current,
                              items: current.items.map((it, i) =>
                                i === index ? { ...it, description: value } : it,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>,
      )
    default:
      return null
  }
}

function McqView({
  item,
  index,
  doc,
  onChange,
}: {
  item: McqItem
  index: number
  doc: PdfDoc
  onChange: (doc: PdfDoc) => void
}) {
  return (
    <div className="blk blk--mcq">
      <div className="mcq">
        <div className="mcq__stem">
          <span className="mcq__num">Q{index + 1}</span>
          <Editable
            as="span"
            className="mcq__question"
            value={item.question}
            multiline
            onChange={(value) => onChange(updateMcq(doc, index, { question: value }))}
          />
        </div>
        <ol className="mcq__options">
          {item.options.map((option, optionIndex) => (
            <li key={optionIndex} className={option === item.answer ? 'is-answer' : ''}>
              <span className="mcq__letter">{String.fromCharCode(65 + optionIndex)}</span>
              <Editable
                as="span"
                value={option}
                multiline
                onChange={(value) =>
                  onChange(
                    updateMcq(doc, index, {
                      options: item.options.map((o, i) => (i === optionIndex ? value : o)),
                      answer: option === item.answer ? value : item.answer,
                    }),
                  )
                }
              />
            </li>
          ))}
        </ol>
        <div className="mcq__answer">
          <span className="mcq__answer-label">Answer</span>
          <Editable
            as="span"
            className="mcq__answer-value"
            value={item.answer}
            multiline
            onChange={(value) => onChange(updateMcq(doc, index, { answer: value }))}
          />
          {item.explanation ? (
            <Editable
              as="span"
              className="mcq__why"
              value={item.explanation}
              multiline
              placeholder="Explanation"
              onChange={(value) => onChange(updateMcq(doc, index, { explanation: value }))}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function DocPages({
  doc,
  settings,
  brand,
  onChange,
  onPageCount,
  onMoveBlock,
  onDeleteBlock,
  onRegenerateImage,
  onUploadBlockImage,
  onCoverUpload,
  onCoverGenerate,
  coverBusy,
}: Props) {
  const vars = paperVars(settings, brand, 'body')
  const theme = themeFor(settings, 'body')
  const measureRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number[][][]>([])
  const [fontsReady, setFontsReady] = useState(false)
  const [measureTick, setMeasureTick] = useState(0)
  const [reserve, setReserve] = useState(48)
  const overflowChecks = useRef(0)

  const columns = settings.layout === 'two-column-textbook' ? 2 : 1
  const columnGap = 30
  const measureWidth =
    columns === 2 ? Math.floor((CONTENT_WIDTH - columnGap) / 2) : CONTENT_WIDTH

  const items = useMemo<FlowItem[]>(() => {
    const list: FlowItem[] = []
    doc.sections.forEach((section, sectionIndex) => {
      list.push({ key: `sec-${section.id}`, sticky: true, kind: 'section', sectionIndex })
      section.blocks.forEach((block, blockIndex) => {
        if (block.type === 'table' && block.rows.length > TABLE_SLICE_ROWS) {
          for (let start = 0; start < block.rows.length; start += TABLE_SLICE_ROWS) {
            const end = Math.min(start + TABLE_SLICE_ROWS, block.rows.length)
            list.push({
              key: `blk-${block.id}-r${start}`,
              sticky: false,
              kind: 'block',
              sectionIndex,
              blockIndex,
              rowStart: start,
              rowEnd: end,
              isContinuation: start > 0,
            })
          }
        } else {
          list.push({
            key: `blk-${block.id}`,
            sticky: block.type === 'subheading',
            kind: 'block',
            sectionIndex,
            blockIndex,
          })
        }
      })
    })
    if (doc.mcqs.length) {
      list.push({ key: 'mcq-heading', sticky: true, kind: 'mcq-head' })
      doc.mcqs.forEach((mcq, mcqIndex) => {
        list.push({ key: `mcq-${mcq.id}`, sticky: false, kind: 'mcq', mcqIndex })
      })
    }
    return list
  }, [doc])

  useEffect(() => {
    let alive = true
    const fonts = document.fonts
    if (!fonts) {
      setFontsReady(true)
      return
    }
    fonts.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // Re-measure whenever async images/SVGs/KaTeX resize inside the hidden measurement flow.
  useEffect(() => {
    const root = measureRef.current
    if (!root) return
    let raf = 0
    const bump = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setMeasureTick((t) => t + 1))
    }
    const observer = new ResizeObserver(bump)
    observer.observe(root)
    root.addEventListener('load', bump, true)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      root.removeEventListener('load', bump, true)
    }
  }, [])

  useEffect(() => {
    overflowChecks.current = 0
    setReserve(48)
  }, [settings.layout, settings.fontPairing, settings.headerStyle, settings.themeId, doc.sections.length])

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-measure-index]'))
    const measured = nodes.map((node) => node.offsetHeight)
    const sticky = items.map((item) => item.sticky)
    const columnCapacity = CONTENT_HEIGHT - reserve
    const columnsOfItems = paginate(measured, columnCapacity, sticky, FLOW_GAP)
    const grouped: number[][][] =
      columns === 2
        ? columnsOfItems.reduce<number[][][]>((acc, column, index) => {
            if (index % 2 === 0) acc.push([column])
            else acc[acc.length - 1].push(column)
            return acc
          }, [])
        : columnsOfItems.map((column) => [column])
    setPages(grouped)
  }, [
    items,
    columns,
    settings.layout,
    settings.fontPairing,
    settings.headerStyle,
    brand.primary,
    brand.accent,
    fontsReady,
    reserve,
    measureTick,
  ])

  useLayoutEffect(() => {
    const root = pagesRef.current
    if (!root || !pages.length) return
    const bodies = Array.from(root.querySelectorAll<HTMLElement>('.paper-body'))
    const overflowing = bodies.some((body) => body.scrollHeight > body.clientHeight + 2)
    if (overflowing && overflowChecks.current < 5) {
      overflowChecks.current += 1
      setReserve((value) => Math.min(value + 24, CONTENT_HEIGHT - 200))
    }
  }, [pages, reserve, settings.layout])

  const renderItem = (item: FlowItem, interactive = true) => {
    if (item.kind === 'section') {
      const sectionIndex = item.sectionIndex ?? 0
      const section = doc.sections[sectionIndex]
      if (!section) return null
      return (
        <div className="sec">
          <span className="sec__num">{String(sectionIndex + 1).padStart(2, '0')}</span>
          <Editable
            as="h2"
            className="sec__title"
            value={section.heading}
            onChange={(value) => onChange(setSectionHeading(doc, sectionIndex, value))}
          />
        </div>
      )
    }
    if (item.kind === 'mcq-head') {
      return (
        <div className="mcq-head">
          <div className="mcq-head__rule" />
          <span className="mcq-head__eyebrow">Practice Section</span>
          <h2 className="mcq-head__title">Practice MCQs</h2>
          <p className="mcq-head__sub">
            Pick one option per question. The answer key sits under each question.
          </p>
        </div>
      )
    }
    if (item.kind === 'mcq') {
      const mcqIndex = item.mcqIndex ?? 0
      const mcq = doc.mcqs[mcqIndex]
      if (!mcq) return null
      return <McqView item={mcq} index={mcqIndex} doc={doc} onChange={onChange} />
    }
    const sectionIndex = item.sectionIndex ?? 0
    const blockIndex = item.blockIndex ?? 0
    const block = doc.sections[sectionIndex]?.blocks[blockIndex]
    if (!block) return null
    return (
      <BlockView
        block={block}
        sectionIndex={sectionIndex}
        blockIndex={blockIndex}
        doc={doc}
        onChange={onChange}
        rowStart={item.rowStart}
        rowEnd={item.rowEnd}
        isContinuation={item.isContinuation}
        onMoveBlock={interactive ? onMoveBlock : undefined}
        onDeleteBlock={interactive ? onDeleteBlock : undefined}
        onRegenerateImage={interactive ? onRegenerateImage : undefined}
        onUploadBlockImage={interactive ? onUploadBlockImage : undefined}
      />
    )
  }

  const totalPages = pages.length + 1
  const pageStyle: CSSProperties = { width: A4.width, height: A4.height }

  const renderPageItems = (indices: number[]) =>
    indices.map((itemIndex) => {
      const item = items[itemIndex]
      if (!item) return null
      return (
        <div className="flow-item" key={item.key}>
          {renderItem(item, true)}
        </div>
      )
    })

  useEffect(() => {
    onPageCount?.(pages.length + 1)
  }, [pages.length, onPageCount])

  return (
    <div className="doc-pages" ref={pagesRef}>
      <div className="paper-measure" aria-hidden="true">
        <div
          ref={measureRef}
          className="paper paper--measure"
          data-layout={settings.layout}
          data-header={settings.headerStyle}
          data-paper-dark={theme.dark ? 'true' : 'false'}
          style={vars}
        >
          <div className="paper-flow" style={{ width: measureWidth, gap: FLOW_GAP }}>
            {items.map((item, index) => (
              <div className="flow-item" key={item.key} data-measure-index={index}>
                {renderItem(item, false)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Cover
        doc={doc}
        brand={brand}
        settings={settings}
        totalPages={Math.max(totalPages, 1)}
        onChange={onChange}
        onCoverUpload={onCoverUpload}
        onCoverGenerate={onCoverGenerate}
        coverBusy={coverBusy}
      />

      {pages.map((pageColumns, pageIndex) => (
        <article
          className="paper-page"
          data-pdf-page="page"
          data-layout={settings.layout}
          data-header={settings.headerStyle}
          data-paper-dark={theme.dark ? 'true' : 'false'}
          style={{ ...vars, ...pageStyle }}
          key={`page-${pageIndex}`}
        >
          <RunningHeader style={settings.headerStyle} doc={doc} brand={brand} />
          <div className="paper-body">
            {columns === 2 ? (
              <div className="paper-cols" style={{ columnGap }}>
                {pageColumns.map((column, columnIndex) => (
                  <div className="paper-col" key={columnIndex} style={{ gap: FLOW_GAP }}>
                    {renderPageItems(column)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="paper-flow" style={{ gap: FLOW_GAP }}>
                {renderPageItems(pageColumns[0] ?? [])}
              </div>
            )}
          </div>
          <PageFooter doc={doc} brand={brand} pageNumber={pageIndex + 2} totalPages={totalPages} />
          {settings.paymentLock ? <Watermark text={brand.watermark} /> : null}
        </article>
      ))}
    </div>
  )
}
