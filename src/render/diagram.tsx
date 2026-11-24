import { useId } from 'react'
import { layoutDiagram } from '../lib/diagrams'
import type { DocBlock, DiagramShape } from '../types'

type DiagramBlock = Extract<DocBlock, { type: 'diagram' }>

function wrapLabel(label: string, width: number): string[] {
  const maxChars = Math.max(8, Math.round(width / 7.1))
  const words = label.split(/\s+/)
  const lines: string[] = []
  let line = ''
  words.forEach((word) => {
    if ((line ? `${line} ${word}` : word).length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  })
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

function shapePath(shape: DiagramShape, w: number, h: number): { type: 'rect'; rx: number } | { type: 'path'; d: string } {
  const hw = w / 2
  const hh = h / 2
  switch (shape) {
    case 'ellipse':
      return { type: 'path', d: `M ${-hw} 0 a ${hw} ${hh} 0 1 0 ${w} 0 a ${hw} ${hh} 0 1 0 ${-w} 0` }
    case 'circle': {
      const r = Math.min(hw, hh)
      return { type: 'path', d: `M ${-r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0` }
    }
    case 'diamond':
      return { type: 'path', d: `M 0 ${-hh} L ${hw} 0 L 0 ${hh} L ${-hw} 0 Z` }
    case 'note':
      return { type: 'path', d: `M ${-hw} ${-hh + 6} Q ${-hw} ${-hh} ${-hw + 6} ${-hh} L ${hw - 10} ${-hh} L ${hw} ${-hh + 10} L ${hw} ${hh - 6} Q ${hw} ${hh} ${hw - 6} ${hh} L ${-hw + 6} ${hh} Q ${-hw} ${hh} ${-hw} ${hh - 6} Z` }
    case 'pill':
      return { type: 'rect', rx: hh }
    default:
      return { type: 'rect', rx: 7 }
  }
}

/**
 * Vector diagram: every node, arrow and label is SVG, so it stays razor sharp
 * in print and inherits the active page's ink and accent colours.
 */
export function DiagramView({ block }: { block: DiagramBlock }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const marker = `arrow-${uid}`
  const layout = layoutDiagram(block)
  const accent = block.accent || 'var(--brand)'
  const nodes = layout.byId

  return (
    <figure className="diagram-block">
      {block.title ? <figcaption className="diagram-block__title">{block.title}</figcaption> : null}
      <svg
        className="diagram-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={block.title || 'Diagram'}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" fillOpacity={0.62} />
          </marker>
        </defs>

        {block.edges.map((edge, index) => {
          const from = nodes.get(edge.from)
          const to = nodes.get(edge.to)
          if (!from || !to) return null
          const dx = to.cx - from.cx
          const dy = to.cy - from.cy
          const distance = Math.hypot(dx, dy) || 1
          const padFrom = Math.min(from.w, from.h) / 2 + 6
          const padTo = Math.min(to.w, to.h) / 2 + 8
          const x1 = from.cx + (dx / distance) * padFrom
          const y1 = from.cy + (dy / distance) * padFrom
          const x2 = to.cx - (dx / distance) * padTo
          const y2 = to.cy - (dy / distance) * padTo
          const midX = (x1 + x2) / 2
          const midY = (y1 + y2) / 2
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeOpacity={0.42}
                strokeWidth={1.3}
                strokeDasharray={edge.dashed ? '5 4' : undefined}
                markerEnd={`url(#${marker})`}
              />
              {edge.label ? (
                <>
                  <rect
                    x={midX - Math.min(edge.label.length * 2.7 + 6, 90) / 2}
                    y={midY - 7}
                    width={Math.min(edge.label.length * 2.7 + 6, 90)}
                    height={13}
                    rx={3}
                    fill="var(--paper-bg)"
                    fillOpacity={0.92}
                  />
                  <text
                    x={midX}
                    y={midY + 2.6}
                    textAnchor="middle"
                    fontSize={7.6}
                    fill="currentColor"
                    fillOpacity={0.68}
                    letterSpacing={0.2}
                  >
                    {edge.label.length > 30 ? `${edge.label.slice(0, 29)}…` : edge.label}
                  </text>
                </>
              ) : null}
            </g>
          )
        })}

        {layout.nodes.map((node) => {
          const shape = node.shape ?? (block.diagram === 'labeled' ? 'note' : 'box')
          const geometry = shapePath(shape, node.w, node.h)
          const lines = wrapLabel(node.label, node.w - 14)
          const lineHeight = 10.4
          const startY = node.cy - ((lines.length - 1) * lineHeight) / 2 + 2.6
          return (
            <g key={node.id} transform={`translate(${node.cx} ${node.cy})`}>
              {geometry.type === 'rect' ? (
                <rect
                  x={-node.w / 2}
                  y={-node.h / 2}
                  width={node.w}
                  height={node.h}
                  rx={geometry.rx}
                  fill="var(--paper-soft)"
                  stroke={accent}
                  strokeOpacity={0.55}
                  strokeWidth={1.1}
                />
              ) : (
                <path
                  d={geometry.d}
                  fill="var(--paper-soft)"
                  stroke={accent}
                  strokeOpacity={0.55}
                  strokeWidth={1.1}
                />
              )}
              {lines.map((line, index) => (
                <text
                  key={index}
                  x={0}
                  y={startY + index * lineHeight}
                  textAnchor="middle"
                  fontSize={9.2}
                  fontWeight={600}
                  fill="currentColor"
                >
                  {line}
                </text>
              ))}
              {node.detail ? (
                <text
                  x={0}
                  y={node.h / 2 + 10}
                  textAnchor="middle"
                  fontSize={7.4}
                  fill="currentColor"
                  fillOpacity={0.55}
                >
                  {node.detail}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {block.caption ? <p className="diagram-block__cap">{block.caption}</p> : null}
    </figure>
  )
}
