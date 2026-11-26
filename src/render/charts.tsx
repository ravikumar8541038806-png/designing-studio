import { useId } from 'react'
import type { ChartKind } from '../types'

interface Props {
  chart: ChartKind
  title: string
  labels: string[]
  values: number[]
  values2?: number[]
  accent: string
  accent2: string
  unit?: string
  seriesA?: string
  seriesB?: string
  note?: string
}

const W = 560
const H = 306
const PLOT = { left: 48, right: 536, top: 26, bottom: 236 }

function niceMax(values: number[]): number {
  const max = Math.max(...values.map((v) => (Number.isFinite(v) ? Math.abs(v) : 0)), 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => max / s <= 4) ?? max
  return Math.max(step * Math.ceil(max / step), step)
}

function formatVal(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  let num = ''
  if (abs >= 1_000_000) num = `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  else if (abs >= 10_000) num = `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  else if (Number.isInteger(value)) num = String(value)
  else num = String(Number(value.toFixed(2)))
  if (!unit) return num
  return unit === '$' || unit === '€' || unit === '₹' ? `${unit}${num}` : `${num}${unit}`
}

const short = (label: string, max = 14) => (label.length > max ? `${label.slice(0, max - 1)}…` : label)

const PALETTE_EXTRAS = ['#0ea5e9', '#10b981', '#8b5cf6', '#f43f5e']

function colorAt(index: number, accent: string, accent2: string): string {
  const palette = [accent, accent2, ...PALETTE_EXTRAS]
  return palette[index % palette.length]
}

function Grid({ max, unit }: { max: number; unit?: string }) {
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PLOT.bottom - ratio * (PLOT.bottom - PLOT.top)
        const tick = Math.round(max * ratio * 100) / 100
        return (
          <g key={ratio}>
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={ratio === 0 ? 0.28 : 0.1}
              strokeDasharray={ratio === 0 ? undefined : '3 3'}
              strokeWidth={1}
            />
            <text x={PLOT.left - 8} y={y + 3.5} textAnchor="end" fontSize={8.8} fill="currentColor" fillOpacity={0.58}>
              {formatVal(tick, unit)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function BarChart({ labels, values, accent, accent2, max, unit, uid }: Props & { max: number; uid: string }) {
  const n = Math.max(values.length, 1)
  const slot = (PLOT.right - PLOT.left) / n
  const width = Math.min(60, slot * 0.56)
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-g0`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="1" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={`${uid}-g1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="1" />
          <stop offset="100%" stopColor={accent2} stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <Grid max={max} unit={unit} />
      {values.map((value, index) => {
        const height = Math.max((Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top), 2)
        const x = PLOT.left + slot * index + (slot - width) / 2
        const fill = index % 2 === 0 ? `url(#${uid}-g0)` : `url(#${uid}-g1)`
        return (
          <g key={index}>
            <rect x={x} y={PLOT.bottom - height} width={width} height={height} rx={5} fill={fill} />
            <text
              x={x + width / 2}
              y={PLOT.bottom - height - 7}
              textAnchor="middle"
              fontSize={9.6}
              fontWeight={700}
              fill="currentColor"
            >
              {formatVal(value, unit)}
            </text>
            <text
              x={x + width / 2}
              y={PLOT.bottom + 18}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.68}
            >
              {short(labels[index] ?? '', 12)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Isometric 3D extruded bar chart — crisp vector depth that exports cleanly at 2.5×. */
function Bar3DChart({ labels, values, accent, accent2, max, unit }: Props & { max: number }) {
  const n = Math.max(values.length, 1)
  const slot = (PLOT.right - PLOT.left) / n
  const width = Math.min(48, slot * 0.48)
  const dx = 11
  const dy = 7

  return (
    <g>
      <Grid max={max} unit={unit} />
      {values.map((value, index) => {
        const height = Math.max((Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top - dy), 4)
        const x = PLOT.left + slot * index + (slot - width - dx) / 2
        const y = PLOT.bottom - height
        const color = colorAt(index, accent, accent2)

        const topCap = `M ${x} ${y} L ${x + dx} ${y - dy} L ${x + width + dx} ${y - dy} L ${x + width} ${y} Z`
        const rightFace = `M ${x + width} ${y} L ${x + width + dx} ${y - dy} L ${x + width + dx} ${PLOT.bottom - dy} L ${x + width} ${PLOT.bottom} Z`

        return (
          <g key={index}>
            <rect x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.92} />
            <path d={topCap} fill={color} fillOpacity={0.62} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.7} />
            <path d={rightFace} fill={color} fillOpacity={0.55} />
            <path d={rightFace} fill="#000000" fillOpacity={0.18} />
            <text
              x={x + (width + dx) / 2}
              y={y - dy - 6}
              textAnchor="middle"
              fontSize={9.4}
              fontWeight={700}
              fill="currentColor"
            >
              {formatVal(value, unit)}
            </text>
            <text
              x={x + width / 2}
              y={PLOT.bottom + 18}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.68}
            >
              {short(labels[index] ?? '', 12)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length <= 1) return points[0] ? `M ${points[0].x} ${points[0].y}` : ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const cx = (p0.x + p1.x) / 2
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`
  }
  return d
}

function LineChart({ labels, values, accent, accent2, max, unit, uid }: Props & { max: number; uid: string }) {
  const n = Math.max(values.length, 2)
  const span = PLOT.right - PLOT.left
  const points = values.map((value, index) => ({
    x: PLOT.left + (span / (n - 1)) * index,
    y: PLOT.bottom - (Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top),
  }))
  const curve = smoothPath(points)
  const area = `${curve} L ${points[points.length - 1].x} ${PLOT.bottom} L ${points[0].x} ${PLOT.bottom} Z`

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <Grid max={max} unit={unit} />
      <path d={area} fill={`url(#${uid}-area)`} />
      <path d={curve} fill="none" stroke={accent} strokeWidth={2.8} strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={index}>
          <circle
            cx={point.x}
            cy={point.y}
            r={4.5}
            fill={index === points.length - 1 ? accent2 : accent}
            stroke="var(--paper-bg)"
            strokeWidth={1.8}
          />
          <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize={9.4} fontWeight={700} fill="currentColor">
            {formatVal(values[index], unit)}
          </text>
          <text x={point.x} y={PLOT.bottom + 18} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.68}>
            {short(labels[index] ?? '', 11)}
          </text>
        </g>
      ))}
    </g>
  )
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

function DonutChart({ labels, values, accent, accent2, unit }: Props) {
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0) || 1
  const cx = 148
  const cy = 152
  const outer = 98
  const inner = 56
  let angle = -Math.PI / 2

  return (
    <g>
      {values.map((value, index) => {
        const sweep = (Math.max(value, 0) / total) * Math.PI * 2
        const a0 = angle
        const a1 = angle + sweep
        angle = a1
        if (sweep <= 0.001) return null
        const large = sweep > Math.PI ? 1 : 0
        const p0 = polar(cx, cy, outer, a0)
        const p1 = polar(cx, cy, outer, a1)
        const p2 = polar(cx, cy, inner, a1)
        const p3 = polar(cx, cy, inner, a0)
        const path = [
          `M ${p0.x} ${p0.y}`,
          `A ${outer} ${outer} 0 ${large} 1 ${p1.x} ${p1.y}`,
          `L ${p2.x} ${p2.y}`,
          `A ${inner} ${inner} 0 ${large} 0 ${p3.x} ${p3.y}`,
          'Z',
        ].join(' ')
        return (
          <path
            key={index}
            d={path}
            fill={colorAt(index, accent, accent2)}
            fillOpacity={0.94}
            stroke="var(--paper-bg)"
            strokeWidth={2}
          />
        )
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={19} fontWeight={800} fill="currentColor">
        {formatVal(Math.round(total * 10) / 10, unit)}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={8.5} letterSpacing={1.4} fill="currentColor" fillOpacity={0.58}>
        TOTAL
      </text>
      {labels.slice(0, 7).map((label, index) => {
        const y = 56 + index * 30
        return (
          <g key={index}>
            <rect x={286} y={y - 9} width={11} height={11} rx={3} fill={colorAt(index, accent, accent2)} />
            <text x={306} y={y} fontSize={10.4} fontWeight={600} fill="currentColor">
              {short(label, 21)}
            </text>
            <text x={534} y={y} fontSize={10} fontWeight={700} textAnchor="end" fill="currentColor" fillOpacity={0.75}>
              {Math.round((Math.max(values[index] ?? 0, 0) / total) * 100)}%
            </text>
          </g>
        )
      })}
    </g>
  )
}

function HorizontalChart({ labels, values, accent, accent2, max, unit }: Props & { max: number }) {
  const n = Math.max(values.length, 1)
  const rowHeight = Math.min(40, (PLOT.bottom - PLOT.top) / n)
  const left = 152
  return (
    <g>
      {values.map((value, index) => {
        const barMax = PLOT.right - left - 52
        const width = Math.max((Math.max(value, 0) / max) * barMax, 3)
        const y = PLOT.top + index * rowHeight + rowHeight * 0.18
        const color = colorAt(index, accent, accent2)
        const barH = Math.min(16, rowHeight * 0.54)
        return (
          <g key={index}>
            <text x={4} y={y + barH * 0.72} fontSize={10} fontWeight={600} fill="currentColor">
              {short(labels[index] ?? '', 20)}
            </text>
            <rect x={left} y={y} width={barMax} height={barH} rx={8} fill="currentColor" fillOpacity={0.08} />
            <rect x={left} y={y} width={width} height={barH} rx={8} fill={color} fillOpacity={0.94} />
            <text x={PLOT.right} y={y + barH * 0.72} textAnchor="end" fontSize={10} fontWeight={700} fill="currentColor">
              {formatVal(value, unit)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function AreaChart({ labels, values, accent, max, unit, uid }: Props & { max: number; uid: string }) {
  const n = Math.max(values.length, 2)
  const span = PLOT.right - PLOT.left
  const points = values.map((value, index) => ({
    x: PLOT.left + (span / (n - 1)) * index,
    y: PLOT.bottom - (Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top),
  }))
  const curve = smoothPath(points)
  const area = `${curve} L ${points[points.length - 1].x} ${PLOT.bottom} L ${points[0].x} ${PLOT.bottom} Z`

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <Grid max={max} unit={unit} />
      <path d={area} fill={`url(#${uid}-fill)`} />
      <path d={curve} fill="none" stroke={accent} strokeWidth={2.6} strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={index}>
          <circle cx={point.x} cy={point.y} r={3.8} fill={accent} stroke="var(--paper-bg)" strokeWidth={1.5} />
          <text x={point.x} y={point.y - 9} textAnchor="middle" fontSize={8.8} fontWeight={700} fill="currentColor">
            {formatVal(values[index], unit)}
          </text>
          <text x={point.x} y={PLOT.bottom + 18} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.68}>
            {short(labels[index] ?? '', 11)}
          </text>
        </g>
      ))}
    </g>
  )
}

function CompareChart({
  labels,
  values,
  values2,
  accent,
  accent2,
  max,
  unit,
  seriesA,
  seriesB,
}: Props & { max: number }) {
  const second =
    values2 && values2.length ? values2 : values.map((value, index) => Math.round(value * (index % 2 ? 0.72 : 0.86)))
  const n = Math.max(values.length, 1)
  const slot = (PLOT.right - PLOT.left) / n
  const width = Math.min(26, slot * 0.28)
  return (
    <g>
      <Grid max={max} unit={unit} />
      {values.map((value, index) => {
        const x = PLOT.left + slot * index + slot / 2
        const h1 = Math.max((Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top), 2)
        const h2 = Math.max((Math.max(second[index] ?? 0, 0) / max) * (PLOT.bottom - PLOT.top), 2)
        return (
          <g key={index}>
            <rect x={x - width - 2} y={PLOT.bottom - h1} width={width} height={h1} rx={3.5} fill={accent} fillOpacity={0.92} />
            <rect x={x + 2} y={PLOT.bottom - h2} width={width} height={h2} rx={3.5} fill={accent2} fillOpacity={0.92} />
            <text x={x} y={PLOT.bottom - Math.max(h1, h2) - 7} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="currentColor">
              {formatVal(value, unit)} · {formatVal(second[index] ?? 0, unit)}
            </text>
            <text x={x} y={PLOT.bottom + 18} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.68}>
              {short(labels[index] ?? '', 11)}
            </text>
          </g>
        )
      })}
      <g transform={`translate(${PLOT.left} ${PLOT.top - 16})`}>
        <rect width={9} height={9} rx={2} fill={accent} />
        <text x={13} y={8} fontSize={8.8} fontWeight={600} fill="currentColor" fillOpacity={0.78}>
          {seriesA || 'Series A'}
        </text>
        <rect x={92} width={9} height={9} rx={2} fill={accent2} />
        <text x={105} y={8} fontSize={8.8} fontWeight={600} fill="currentColor" fillOpacity={0.78}>
          {seriesB || 'Series B'}
        </text>
      </g>
    </g>
  )
}

/** Crisp 2D & 3D vector charts: scale with the page and export at 2.5× cleanly. */
export function ChartSvg({
  chart,
  title,
  labels,
  values,
  values2,
  accent,
  accent2,
  unit,
  seriesA,
  seriesB,
  note,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const safeValues = values.length ? values.map((v) => (Number.isFinite(v) ? v : 0)) : [1]
  const safeLabels = labels.length ? labels : safeValues.map((_, index) => `Item ${index + 1}`)
  const max = niceMax([...safeValues, ...(values2 ?? [])])
  const props = {
    chart,
    title,
    labels: safeLabels,
    values: safeValues,
    values2,
    accent,
    accent2,
    unit,
    seriesA,
    seriesB,
  }
  return (
    <figure className="chart-block">
      {title ? <figcaption className="chart-block__title">{title}</figcaption> : null}
      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title || `${chart} chart`}
        preserveAspectRatio="xMidYMid meet"
      >
        {chart === 'bar' ? <BarChart {...props} max={max} uid={uid} /> : null}
        {chart === 'bar3d' ? <Bar3DChart {...props} max={max} /> : null}
        {chart === 'line' ? <LineChart {...props} max={max} uid={uid} /> : null}
        {chart === 'donut' ? <DonutChart {...props} /> : null}
        {chart === 'hcompare' ? <HorizontalChart {...props} max={max} /> : null}
        {chart === 'area' ? <AreaChart {...props} max={max} uid={uid} /> : null}
        {chart === 'compare' ? <CompareChart {...props} max={max} /> : null}
      </svg>
      {note ? <p className="chart-block__note">{note}</p> : null}
    </figure>
  )
}
