import { useId } from 'react'
import { layoutDiagram, wrapText } from '../lib/diagrams'
import type { DiagramLayout, LaidOutNode } from '../lib/diagrams'
import { PLATES, PLATE_VIEW } from './plates'
import type { DiagramShape, DiagramTone, DocBlock } from '../types'

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
      return { type: 'rect', rx: Math.min(hw, hh) }
    default:
      return { type: 'rect', rx: 7 }
  }
}

/* ---------------------------------------------------------------------------
   Scientific schematic: textbook colour coding, leader-line labels and
   curved flow arrows that trace blood / signal / fluid through the artwork.
   ------------------------------------------------------------------------- */

const TONES: Record<DiagramTone, { stroke: string; fill: string; label: string }> = {
  oxygenated: { stroke: '#b23a48', fill: '#e5aab1', label: 'Oxygenated blood' },
  deoxygenated: { stroke: '#2f6ba8', fill: '#aecdeb', label: 'Deoxygenated blood' },
  tissue: { stroke: '#9c5d69', fill: '#dcb0b6', label: 'Tissue' },
  highlight: { stroke: '#c08a2c', fill: '#f0d69f', label: 'Valve / junction' },
  neutral: { stroke: '#8b7d86', fill: '#d9d2d6', label: 'Structure' },
}

const SCHEMATIC_FONT = 10.4
const SCHEMATIC_LINE = 12.6

function edgeGeometry(from: LaidOutNode, to: LaidOutNode, curve = 0) {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  const distance = Math.hypot(dx, dy) || 1
  const padFrom = Math.min(from.w, from.h) / 2 + 4
  const padTo = Math.min(to.w, to.h) / 2 + 8
  const x1 = from.cx + (dx / distance) * padFrom
  const y1 = from.cy + (dy / distance) * padFrom
  const x2 = to.cx - (dx / distance) * padTo
  const y2 = to.cy - (dy / distance) * padTo
  if (!curve) return { d: `M ${x1} ${y1} L ${x2} ${y2}`, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 }
  // Bend the trace to one side so the flow reads like a drawn pathway.
  const mx = (x1 + x2) / 2 + (-dy / distance) * curve
  const my = (y1 + y2) / 2 + (dx / distance) * curve
  return {
    d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
    midX: 0.25 * x1 + 0.5 * mx + 0.25 * x2,
    midY: 0.25 * y1 + 0.5 * my + 0.25 * y2,
  }
}

/** Gutter labels with their leader lines, shared by plates and schematics. */
function SchematicLabels({ block, layout }: { block: DiagramBlock; layout: DiagramLayout }) {
  return (
    <>
      {layout.nodes.map((node) => {
        if (!node.labelSide || !node.labelX) return null
        const left = node.labelSide === 'left'
        const lines = node.labelLines ?? wrapText(node.label, 19)
        const top = node.labelTop ?? node.cy - (lines.length * SCHEMATIC_LINE) / 2
        const midY = top + ((lines.length - 1) * SCHEMATIC_LINE) / 2 + 3.4
        const anchorX = left ? node.cx - node.w / 2 : node.cx + node.w / 2
        const tipX = left ? node.labelX + 2 : node.labelX - 2
        const textX = left ? node.labelX - (node.badge ? 15 : 0) : node.labelX + (node.badge ? 15 : 0)
        const badgeY = top + 3.4
        return (
          <g key={`label-${node.id}`}>
            <path
              d={`M ${anchorX} ${node.cy} L ${tipX} ${midY}`}
              stroke="currentColor"
              strokeOpacity={0.38}
              strokeWidth={0.9}
            />
            <circle cx={anchorX} cy={node.cy} r={1.7} fill="currentColor" fillOpacity={0.55} />
            {node.badge ? (
              <>
                <circle
                  cx={node.labelX}
                  cy={badgeY}
                  r={6.6}
                  fill="#ffffff"
                  stroke="currentColor"
                  strokeOpacity={0.5}
                  strokeWidth={0.9}
                />
                <text
                  x={node.labelX}
                  y={badgeY + 3.1}
                  textAnchor="middle"
                  fontSize={8.2}
                  fontWeight={600}
                  fill="currentColor"
                >
                  {node.badge}
                </text>
              </>
            ) : null}
            {lines.map((line, index) => (
              <text
                key={index}
                x={textX}
                y={top + index * SCHEMATIC_LINE + 3.4}
                textAnchor={left ? 'end' : 'start'}
                fontSize={SCHEMATIC_FONT}
                fontWeight={index === 0 ? 600 : 400}
                fill="currentColor"
                fillOpacity={index === 0 ? 0.92 : 0.66}
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
      <ToneLegend block={block} height={layout.height} />
    </>
  )
}

function ToneLegend({ block, height }: { block: DiagramBlock; height: number }) {
  const tones = Array.from(
    new Set(block.nodes.map((node) => node.tone).filter((tone): tone is DiagramTone => Boolean(tone))),
  ).filter((tone) => tone === 'oxygenated' || tone === 'deoxygenated')
  if (!tones.length) return null
  return (
    <g transform={`translate(18 ${height - 16})`}>
      {tones.map((tone, index) => (
        <g key={tone} transform={`translate(${index * 150} 0)`}>
          <rect width={16} height={9} rx={4.5} fill={TONES[tone].fill} stroke={TONES[tone].stroke} strokeWidth={1.2} />
          <text x={22} y={8} fontSize={9.4} fill="currentColor" fillOpacity={0.68}>
            {TONES[tone].label}
          </text>
        </g>
      ))}
    </g>
  )
}

function SchematicArt({
  block,
  layout,
  accent,
  marker,
}: {
  block: DiagramBlock
  layout: DiagramLayout
  accent: string
  marker: string
}) {
  const nodes = layout.byId
  const tonesUsed = Array.from(
    new Set(block.nodes.map((node) => node.tone).filter((tone): tone is DiagramTone => Boolean(tone))),
  )

  return (
    <>
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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" fillOpacity={0.7} />
        </marker>
        {tonesUsed.map((tone) => (
          <marker
            key={tone}
            id={`${marker}-${tone}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5.4"
            markerHeight="5.4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={TONES[tone].stroke} />
          </marker>
        ))}
      </defs>

      {/* Structures sit under the arrows, exactly like a printed anatomy plate. */}
      {layout.nodes.map((node) => {
        const shape = node.shape ?? 'ellipse'
        const geometry = shapePath(shape, node.w, node.h)
        const tone = node.tone ? TONES[node.tone] : null
        const fill = tone ? tone.fill : 'var(--paper-soft)'
        const stroke = tone ? tone.stroke : accent
        const insideLabel = !node.labelSide && node.side !== 'left' && node.side !== 'right'
        const lines = insideLabel ? wrapText(node.label, Math.max(8, Math.round((node.w - 10) / 5.1))) : []
        // Coordinates here are relative to the translated node origin.
        const startY = lines.length ? -((lines.length - 1) * SCHEMATIC_LINE) / 2 + 3.4 : 0
        return (
          <g
            key={node.id}
            transform={`translate(${node.cx} ${node.cy})${node.rotate ? ` rotate(${node.rotate})` : ''}`}
          >
            {geometry.type === 'rect' ? (
              <rect
                x={-node.w / 2}
                y={-node.h / 2}
                width={node.w}
                height={node.h}
                rx={geometry.rx}
                fill={fill}
                fillOpacity={0.92}
                stroke={stroke}
                strokeWidth={1.5}
              />
            ) : (
              <path d={geometry.d} fill={fill} fillOpacity={0.92} stroke={stroke} strokeWidth={1.5} />
            )}
            {lines.map((line, index) => (
              <text
                key={index}
                x={0}
                y={startY + index * SCHEMATIC_LINE}
                textAnchor="middle"
                fontSize={SCHEMATIC_FONT - 0.6}
                fontWeight={600}
                fill="currentColor"
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}

      {block.edges.map((edge, index) => {
        const from = nodes.get(edge.from)
        const to = nodes.get(edge.to)
        if (!from || !to) return null
        const tone = edge.tone ? TONES[edge.tone] : null
        const geometry = edgeGeometry(from, to, edge.curve)
        const stroke = tone ? tone.stroke : 'currentColor'
        const opacity = tone ? 0.88 : 0.45
        return (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <path
              d={geometry.d}
              fill="none"
              stroke={stroke}
              strokeOpacity={opacity}
              strokeWidth={edge.width ?? 2.6}
              strokeLinecap="round"
              strokeDasharray={edge.dashed ? '6 5' : undefined}
              markerEnd={`url(#${tone ? `${marker}-${edge.tone}` : marker})`}
            />
            {edge.label ? (
              <>
                <rect
                  x={geometry.midX - Math.min(edge.label.length * 3.1 + 6, 108) / 2}
                  y={geometry.midY - 7.5}
                  width={Math.min(edge.label.length * 3.1 + 6, 108)}
                  height={15}
                  rx={3}
                  fill="#ffffff"
                  fillOpacity={0.86}
                />
                <text
                  x={geometry.midX}
                  y={geometry.midY + 3}
                  textAnchor="middle"
                  fontSize={8.4}
                  fill="currentColor"
                  fillOpacity={0.7}
                >
                  {edge.label.length > 26 ? `${edge.label.slice(0, 25)}…` : edge.label}
                </text>
              </>
            ) : null}
          </g>
        )
      })}

      <SchematicLabels block={block} layout={layout} />
    </>
  )
}

/**
 * Figure artwork — either a named vector plate or a real illustration — plus
 * the same gutter labels and leader lines used by schematics.
 */
function PlateArt({ block, layout }: { block: DiagramBlock; layout: DiagramLayout }) {
  const plate = layout.plate
  const Art = block.plate ? PLATES[block.plate] : undefined
  if (!plate) return null
  if (!Art && !block.plateImage) return null
  return (
    <>
      {block.plateImage ? (
        <image
          href={block.plateImage}
          x={plate.x}
          y={plate.y}
          width={plate.w}
          height={plate.h}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <svg
          x={plate.x}
          y={plate.y}
          width={plate.w}
          height={plate.h}
          viewBox={`0 0 ${PLATE_VIEW.w} ${PLATE_VIEW.h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {Art ? <Art /> : null}
        </svg>
      )}
      <SchematicLabels block={block} layout={layout} />
    </>
  )
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
  const schematic = Boolean(layout.schematic)

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
        {schematic ? (
          block.plate || block.plateImage ? (
            <PlateArt block={block} layout={layout} />
          ) : (
            <SchematicArt block={block} layout={layout} accent={accent} marker={marker} />
          )
        ) : (
          <>
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
              // Relative to the translated node origin, so the label centres on the shape.
              const startY = -((lines.length - 1) * lineHeight) / 2 + 2.6
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
          </>
        )}
      </svg>
      {block.caption ? <p className="diagram-block__cap">{block.caption}</p> : null}
    </figure>
  )
}
