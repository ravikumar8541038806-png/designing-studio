import type { ChartKind } from '../types'

interface Props {
  chart: ChartKind
  title: string
  labels: string[]
  values: number[]
  accent: string
  accent2: string
}

const W = 560
const H = 300
const PLOT = { left: 40, right: 536, top: 22, bottom: 232 }

function niceMax(values: number[]): number {
  const max = Math.max(...values.map((v) => (Number.isFinite(v) ? Math.abs(v) : 0)), 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => max / s <= 4) ?? max
  return Math.max(step * Math.ceil(max / step), step)
}

const short = (label: string, max = 14) => (label.length > max ? `${label.slice(0, max - 1)}…` : label)

function Grid({ max }: { max: number }) {
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PLOT.bottom - ratio * (PLOT.bottom - PLOT.top)
        return (
          <g key={ratio}>
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeWidth={1}
            />
            <text x={PLOT.left - 8} y={y + 3.5} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.55}>
              {Math.round(max * ratio)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function BarChart({ labels, values, accent, accent2, max }: Props & { max: number }) {
  const n = Math.max(values.length, 1)
  const slot = (PLOT.right - PLOT.left) / n
  const width = Math.min(64, slot * 0.58)
  return (
    <g>
      <Grid max={max} />
      {values.map((value, index) => {
        const height = Math.max((Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top), 1)
        const x = PLOT.left + slot * index + (slot - width) / 2
        const color = index % 2 === 0 ? accent : accent2
        return (
          <g key={index}>
            <rect
              x={x}
              y={PLOT.bottom - height}
              width={width}
              height={height}
              rx={5}
              fill={color}
              fillOpacity={0.92}
            />
            <text
              x={x + width / 2}
              y={PLOT.bottom - height - 7}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="currentColor"
            >
              {value}
            </text>
            <text
              x={x + width / 2}
              y={PLOT.bottom + 16}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.62}
            >
              {short(labels[index] ?? '', 12)}
            </text>
          </g>
        )
      })}
      <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="currentColor" strokeOpacity={0.28} />
    </g>
  )
}

function LineChart({ labels, values, accent, accent2, max }: Props & { max: number }) {
  const n = Math.max(values.length, 2)
  const span = PLOT.right - PLOT.left
  const points = values.map((value, index) => {
    const x = PLOT.left + (span / (n - 1)) * index
    const y = PLOT.bottom - (Math.max(value, 0) / max) * (PLOT.bottom - PLOT.top)
    return { x, y }
  })
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${PLOT.left},${PLOT.bottom} ${line} ${PLOT.right},${PLOT.bottom}`
  return (
    <g>
      <Grid max={max} />
      <polygon points={area} fill={accent} fillOpacity={0.12} />
      <polyline points={line} fill="none" stroke={accent} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={index}>
          <circle cx={point.x} cy={point.y} r={4.4} fill={index === points.length - 1 ? accent2 : accent} stroke="#fff" strokeWidth={1.6} />
          <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="currentColor">
            {values[index]}
          </text>
          <text x={point.x} y={PLOT.bottom + 16} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.62}>
            {short(labels[index] ?? '', 11)}
          </text>
        </g>
      ))}
      <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="currentColor" strokeOpacity={0.28} />
    </g>
  )
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

function DonutChart({ labels, values, accent, accent2 }: Props) {
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0) || 1
  const palette = [accent, accent2, accent, accent2, accent]
  const cx = 148
  const cy = 150
  const outer = 96
  const inner = 56
  let angle = -Math.PI / 2
  return (
    <g>
      {values.map((value, index) => {
        const sweep = (Math.max(value, 0) / total) * Math.PI * 2
        const a0 = angle
        const a1 = angle + sweep
        angle = a1
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
            fill={palette[index % palette.length]}
            fillOpacity={1 - index * 0.14}
            stroke="#fff"
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
        )
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={20} fontWeight={800} fill="currentColor">
        {Math.round(total)}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={8.5} letterSpacing={1.4} fill="currentColor" fillOpacity={0.55}>
        TOTAL
      </text>
      {labels.slice(0, 5).map((label, index) => {
        const y = 88 + index * 30
        return (
          <g key={index}>
            <rect x={286} y={y - 9} width={10} height={10} rx={2.5} fill={palette[index % palette.length]} fillOpacity={1 - index * 0.14} />
            <text x={304} y={y} fontSize={10.5} fontWeight={600} fill="currentColor">
              {short(label, 22)}
            </text>
            <text x={532} y={y} fontSize={10} fontWeight={700} textAnchor="end" fill="currentColor" fillOpacity={0.7}>
              {Math.round((Math.max(values[index] ?? 0, 0) / total) * 100)}%
            </text>
          </g>
        )
      })}
    </g>
  )
}

function HorizontalChart({ labels, values, accent, accent2, max }: Props & { max: number }) {
  const n = Math.max(values.length, 1)
  const rowHeight = Math.min(40, (PLOT.bottom - PLOT.top) / n)
  const left = 148
  return (
    <g>
      {values.map((value, index) => {
        const width = Math.max((Math.max(value, 0) / max) * (PLOT.right - left - 46), 1)
        const y = PLOT.top + index * rowHeight + rowHeight * 0.18
        const color = index % 2 === 0 ? accent : accent2
        return (
          <g key={index}>
            <text x={0} y={y + rowHeight * 0.42} fontSize={10} fontWeight={600} fill="currentColor">
              {short(labels[index] ?? '', 20)}
            </text>
            <rect x={left} y={y} width={PLOT.right - left} height={Math.min(16, rowHeight * 0.54)} rx={8} fill="currentColor" fillOpacity={0.08} />
            <rect x={left} y={y} width={width} height={Math.min(16, rowHeight * 0.54)} rx={8} fill={color} fillOpacity={0.92} />
            <text x={PLOT.right} y={y + rowHeight * 0.42} textAnchor="end" fontSize={10} fontWeight={700} fill="currentColor">
              {value}
            </text>
          </g>
        )
      })}
      <line x1={left} x2={PLOT.right} y1={PLOT.bottom + 4} y2={PLOT.bottom + 4} stroke="currentColor" strokeOpacity={0.18} />
    </g>
  )
}

/** Crisp vector chart: scales with the page and rasterises cleanly at 2x. */
export function ChartSvg({ chart, title, labels, values, accent, accent2 }: Props) {
  const safeValues = values.length ? values.map((v) => (Number.isFinite(v) ? v : 0)) : [1]
  const safeLabels = labels.length ? labels : safeValues.map((_, index) => `Item ${index + 1}`)
  const max = niceMax(safeValues)
  const props = { chart, title, labels: safeLabels, values: safeValues, accent, accent2 }
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
        {chart === 'bar' ? <BarChart {...props} max={max} /> : null}
        {chart === 'line' ? <LineChart {...props} max={max} /> : null}
        {chart === 'donut' ? <DonutChart {...props} /> : null}
        {chart === 'hcompare' ? <HorizontalChart {...props} max={max} /> : null}
      </svg>
    </figure>
  )
}
