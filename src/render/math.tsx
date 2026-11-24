import { useMemo } from 'react'
import katex from 'katex'
import type { DocBlock } from '../types'

type MathBlock = Extract<DocBlock, { type: 'math' }>

function render(latex: string, displayMode: boolean): string {
  const source = latex.trim() || '\\text{Formula}'
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'html',
      errorColor: 'currentColor',
    })
  } catch {
    return `<code>${source.replace(/[<>&]/g, '')}</code>`
  }
}

/** KaTeX output is self-contained markup; no external fonts are fetched. */
export function MathView({ block }: { block: MathBlock }) {
  const html = useMemo(() => render(block.latex, block.layout !== 'sheet'), [block.latex, block.layout])
  const items = useMemo(
    () => block.items.map((item) => ({ ...item, html: render(item.latex, true) })),
    [block.items],
  )

  return (
    <figure className={`math-block math-block--${block.layout}`}>
      {block.title ? <figcaption className="math-block__title">{block.title}</figcaption> : null}
      {block.layout === 'sheet' ? (
        <div className="math-sheet">
          {items.map((item) => (
            <div className="math-sheet__row" key={item.id}>
              {item.label ? <span className="math-sheet__label">{item.label}</span> : null}
              <span className="math-sheet__expr" dangerouslySetInnerHTML={{ __html: item.html }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="math-block__expr" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {block.note ? <p className="math-block__note">{block.note}</p> : null}
    </figure>
  )
}
