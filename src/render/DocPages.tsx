import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { Editable } from '../components/Editable'
import { setBlockText, setSectionHeading, updateBlock, updateMcq } from '../lib/docOps'
import { CALLOUT_LABELS } from '../lib/blocks'
import { A4, CONTENT_HEIGHT, CONTENT_WIDTH, FLOW_GAP, paginate } from '../lib/pagination'
import type { FlowItem } from '../lib/pagination'
import { themeFor } from '../theme/themes'
import { ChartSvg } from './charts'
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
}

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
        <span className="paper-head__meta">{doc.eyebrow || 'STUDY NOTES'}</span>
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
}: {
  doc: PdfDoc
  brand: BrandPreset
  settings: AppSettings
  totalPages: number
  onChange: (doc: PdfDoc) => void
}) {
  const vars = paperVars(settings, brand, 'cover')
  const theme = themeFor(settings, 'cover')
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <article
      className="paper-page paper-cover"
      data-pdf-page="cover"
      data-layout={settings.layout}
      data-header={settings.headerStyle}
      data-paper-dark={theme.dark ? 'true' : 'false'}
      style={vars}
    >
      <div className="cover__wash" aria-hidden="true" />
      <div className="cover__grid" aria-hidden="true" />
      <div className="cover__top">
        <BrandMark brand={brand} />
        <Editable
          as="span"
          className="cover__eyebrow"
          value={doc.eyebrow}
          placeholder="EYEBROW"
          onChange={(value) => onChange({ ...doc, eyebrow: value })}
        />
      </div>
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
}: {
  block: DocBlock
  sectionIndex: number
  blockIndex: number
  doc: PdfDoc
  onChange: (doc: PdfDoc) => void
}) {
  const set = (text: string) => onChange(setBlockText(doc, sectionIndex, blockIndex, text))
  const patch = (updater: (current: DocBlock) => DocBlock) =>
    onChange(updateBlock(doc, sectionIndex, blockIndex, updater))

  switch (block.type) {
    case 'lead':
      return (
        <div className="blk blk--lead">
          <Editable as="p" className="blk-lead__text" value={block.text} multiline onChange={set} />
        </div>
      )
    case 'paragraph':
      return (
        <div className="blk blk--p">
          <Editable as="p" className="blk-p__text" value={block.text} multiline onChange={set} />
        </div>
      )
    case 'subheading':
      return (
        <div className="blk blk--sub">
          <Editable as="h3" className="blk-sub__text" value={block.text} onChange={set} />
        </div>
      )
    case 'bullets':
      return (
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
        </div>
      )
    case 'numbered':
      return (
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
        </div>
      )
    case 'keyterms':
      return (
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
        </div>
      )
    case 'table':
      return (
        <div className="blk blk--table">
          <figure className="blk-table">
            <Editable
              as="figcaption"
              className="blk-table__cap"
              value={block.caption}
              placeholder="Table caption"
              onChange={(value) =>
                patch((current) => (current.type === 'table' ? { ...current, caption: value } : current))
              }
            />
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
                {block.rows.map((row, rowIndex) => (
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
                ))}
              </tbody>
            </table>
          </figure>
        </div>
      )
    case 'callout': {
      const icon = (block.icon ?? DEFAULT_ICON[block.kind] ?? 'pin') as CalloutIcon
      return (
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
        </div>
      )
    }
    case 'quote':
      return (
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
        </div>
      )
    case 'image': {
      const width = Math.min(100, Math.max(25, block.width || 100))
      return (
        <div className={`blk blk--image blk--image-${block.align}`}>
          <figure className="img-block" style={{ width: `${width}%` }}>
            {block.url ? (
              <img
                className={`img-block__img${block.rounded ? ' is-rounded' : ''}`}
                src={block.url}
                alt={block.caption || 'Document image'}
              />
            ) : (
              <div className="img-block__empty">Paste an image URL or upload one in the Design panel</div>
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
        </div>
      )
    }
    case 'chart':
      return (
        <div className="blk blk--chart">
          <ChartSvg
            chart={block.chart}
            title={block.title}
            labels={block.labels}
            values={block.values}
            accent={block.accent || 'var(--brand)'}
            accent2={block.accent2 || 'var(--accent)'}
          />
        </div>
      )
    case 'timeline':
      return (
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
                  placeholder="Year"
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
        </div>
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

export function DocPages({ doc, settings, brand, onChange, onPageCount }: Props) {
  const vars = paperVars(settings, brand, 'body')
  const theme = themeFor(settings, 'body')
  const measureRef = useRef<HTMLDivElement>(null)
  // page → column → flow-item indices
  const [pages, setPages] = useState<number[][][]>([])
  const [fontsReady, setFontsReady] = useState(false)
  // The textbook layout places body content in two measured columns, so one
  // page holds roughly twice the single-column height.
  const columns = settings.layout === 'two-column-textbook' ? 2 : 1
  const columnGap = 30
  const measureWidth =
    columns === 2 ? Math.floor((CONTENT_WIDTH - columnGap) / 2) : CONTENT_WIDTH

  const items = useMemo<FlowItem[]>(() => {
    const list: FlowItem[] = []
    doc.sections.forEach((section, sectionIndex) => {
      list.push({ key: `sec-${section.id}`, sticky: true, kind: 'section', sectionIndex })
      section.blocks.forEach((block, blockIndex) => {
        list.push({
          key: `blk-${block.id}`,
          sticky: false,
          kind: 'block',
          sectionIndex,
          blockIndex,
        })
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

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-measure-index]'))
    // offsetHeight is layout-based, so it stays correct inside the zoom transform.
    const measured = nodes.map((node) => node.offsetHeight)
    const sticky = items.map((item) => item.sticky)
    // Two columns are packed as separate measured columns and then paired onto
    // pages, so neither column can ever outgrow the A4 body height.
    const columnCapacity = CONTENT_HEIGHT - (columns === 2 ? 80 : 80)
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
  ])

  const renderItem = (item: FlowItem) => {
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
          {renderItem(item)}
        </div>
      )
    })

  useEffect(() => {
    onPageCount?.(pages.length + 1)
  }, [pages.length, onPageCount])

  return (
    <div className="doc-pages">
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
                {renderItem(item)}
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
