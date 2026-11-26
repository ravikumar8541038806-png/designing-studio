import { uid } from './id'
import type {
  DiagramEdge,
  DiagramKind,
  DiagramNode,
  DiagramShape,
  DiagramSide,
  DiagramTone,
  DocBlock,
} from '../types'

export const DIAGRAM_KINDS: { id: DiagramKind; label: string; note: string }[] = [
  { id: 'flow', label: 'Flowchart', note: 'Linear processes, funnels and decision chains' },
  { id: 'cycle', label: 'Cycle Loop', note: 'Feedback loops, circular frameworks and ecosystems' },
  { id: 'mindmap', label: 'Mindmap', note: 'Concept trees, pillars and topic breakdowns' },
  { id: 'figure', label: 'Annotated Image', note: 'AI/uploaded illustration with crisp vector leader-line labels' },
]

const SHAPES: DiagramShape[] = ['box', 'pill', 'ellipse', 'diamond', 'circle', 'note']
const TONES: DiagramTone[] = ['oxygenated', 'deoxygenated', 'tissue', 'highlight', 'neutral']
const SIDES: DiagramSide[] = ['inside', 'left', 'right']

export function diagramLabel(kind: DiagramKind): string {
  return DIAGRAM_KINDS.find((entry) => entry.id === kind)?.label ?? 'Diagram'
}

function bindPreset(preset: DiagramPreset, title: string): DocBlock {
  const nodes = preset.nodes.map((node) => ({ ...node, id: uid('n') }))
  const ids = new Map<string, string>()
  nodes.forEach((node, index) => {
    const source = preset.nodes[index].label
    ids.set(source.toLowerCase(), node.id)
    ids.set(source.split('\n')[0].trim().toLowerCase(), node.id)
  })
  const edges = preset.edges
    .map((edge) => {
      const from = ids.get(edge.from.toLowerCase())
      const to = ids.get(edge.to.toLowerCase())
      return from && to ? { ...edge, from, to } : null
    })
    .filter((edge): edge is DiagramEdge => edge !== null)
  return {
    id: uid('dia'),
    type: 'diagram',
    diagram: preset.kind,
    title: title || preset.name,
    caption:
      preset.caption ??
      (preset.kind === 'figure'
        ? 'Annotated figure — rename any label and slide its anchor'
        : preset.kind === 'cycle'
          ? 'Feedback cycle — edit any node in Visual Studio'
          : 'Vector diagram — crisp at any print resolution'),
    nodes,
    edges,
    accent: '',
    plate: preset.plate,
    plateImage: preset.plateImage,
    plateAspect: preset.plateAspect,
  }
}

export function createDiagramBlock(kind: DiagramKind = 'flow', title = 'Process diagram'): DocBlock {
  const preset = DIAGRAM_PRESETS.find((entry) => entry.kind === kind) ?? DIAGRAM_PRESETS[0]
  return bindPreset(preset, title)
}

/** Structured block from a model payload, tolerant of near-miss field names. */
export function normalizeDiagram(raw: unknown, fallbackKind: DiagramKind = 'flow'): DocBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const rawKind = String(record.diagram ?? record.kind ?? record.type ?? fallbackKind).toLowerCase()
  const picked: DiagramKind = (['flow', 'cycle', 'mindmap', 'labeled', 'schematic', 'figure'] as const).includes(
    rawKind as DiagramKind,
  )
    ? (rawKind as DiagramKind)
    : fallbackKind
  const kind: DiagramKind = picked === 'figure' ? 'labeled' : picked

  const rawNodes = Array.isArray(record.nodes) ? record.nodes : Array.isArray(record.labels) ? record.labels : []
  const nodes: DiagramNode[] = rawNodes
    .map((entry, index): DiagramNode | null => {
      if (typeof entry === 'string') return { id: `n${index + 1}`, label: entry.trim() }
      if (!entry || typeof entry !== 'object') return null
      const node = entry as Record<string, unknown>
      const label = String(node.label ?? node.name ?? node.text ?? '').trim()
      if (!label) return null
      const shape = String(node.shape ?? '').toLowerCase() as DiagramShape
      const tone = String(node.tone ?? node.color ?? '').toLowerCase() as DiagramTone
      const side = String(node.side ?? node.label_side ?? '').toLowerCase() as DiagramSide
      return {
        id: String(node.id ?? `n${index + 1}`),
        label,
        detail: node.detail ? String(node.detail).trim() : undefined,
        shape: SHAPES.includes(shape) ? shape : undefined,
        tone: TONES.includes(tone) ? tone : undefined,
        side: SIDES.includes(side) ? side : undefined,
        badge: numeric(node.badge ?? node.number ?? node.index),
        rotate: numeric(node.rotate ?? node.angle),
        x: numeric(node.x),
        y: numeric(node.y),
        w: numeric(node.w),
        h: numeric(node.h),
      }
    })
    .filter((node): node is DiagramNode => node !== null)
    .slice(0, kind === 'schematic' ? 18 : 14)

  if (nodes.length < 2) return null

  const byLabel = new Map(nodes.map((node) => [node.label.toLowerCase(), node.id]))
  const rawEdges = Array.isArray(record.edges) ? record.edges : Array.isArray(record.links) ? record.links : []
  const edges: DiagramEdge[] = rawEdges
    .map((entry): DiagramEdge | null => {
      if (!entry || typeof entry !== 'object') return null
      const edge = entry as Record<string, unknown>
      const resolve = (value: unknown) => {
        const key = String(value ?? '').trim()
        if (!key) return ''
        return nodes.some((node) => node.id === key) ? key : (byLabel.get(key.toLowerCase()) ?? '')
      }
      const from = resolve(edge.from ?? edge.source ?? edge.a)
      const to = resolve(edge.to ?? edge.target ?? edge.b)
      if (!from || !to || from === to) return null
      const tone = String(edge.tone ?? edge.color ?? '').toLowerCase() as DiagramTone
      return {
        from,
        to,
        label: edge.label ? String(edge.label).trim() : undefined,
        dashed: Boolean(edge.dashed),
        tone: TONES.includes(tone) ? tone : undefined,
        curve: numeric(edge.curve),
        width: numeric(edge.width),
      }
    })
    .filter((edge): edge is DiagramEdge => edge !== null)
    .slice(0, 24)

  return {
    id: uid('dia'),
    type: 'diagram',
    diagram: kind,
    title: String(record.title ?? 'Diagram').trim() || 'Diagram',
    caption: String(record.caption ?? '').trim(),
    nodes,
    edges: kind === 'labeled' && !edges.length ? [] : edges,
    accent: '',
  }
}

function numeric(value: unknown): number | undefined {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

/* ---------------------------------------------------------------------------
   Versatile presets across Business, Science, Climate & Education
   ------------------------------------------------------------------------- */

export interface DiagramPreset {
  id: string
  name: string
  subject: string
  kind: DiagramKind
  keywords: RegExp
  nodes: Omit<DiagramNode, 'id'>[]
  edges: DiagramEdge[]
  plate?: string
  plateImage?: string
  plateAspect?: number
  caption?: string
}

export const DIAGRAM_PRESETS: DiagramPreset[] = [
  {
    id: 'circular-flow',
    name: 'Circular Flow of Income (Three-Sector)',
    subject: 'Economics',
    kind: 'cycle',
    keywords: /\b(circular flow|national income|leakages|injections|households|macroeconomic|gdp|gnp|nnp)\b/i,
    nodes: [
      { label: 'Households (Factor Owners)' },
      { label: 'Factor Payments (Rent, Wages, Profit)' },
      { label: 'Firms (Producers)' },
      { label: 'Consumption Spending (C)' },
      { label: 'Financial Markets & Govt (S, T ↔ I, G)' },
    ],
    edges: [
      { from: 'Households (Factor Owners)', to: 'Firms (Producers)', label: 'factor services' },
      { from: 'Firms (Producers)', to: 'Factor Payments (Rent, Wages, Profit)' },
      { from: 'Factor Payments (Rent, Wages, Profit)', to: 'Households (Factor Owners)' },
      { from: 'Households (Factor Owners)', to: 'Consumption Spending (C)' },
      { from: 'Consumption Spending (C)', to: 'Financial Markets & Govt (S, T ↔ I, G)' },
      { from: 'Financial Markets & Govt (S, T ↔ I, G)', to: 'Firms (Producers)' },
    ],
  },
  {
    id: 'budget-structure',
    name: 'Union Budget & Fiscal Architecture',
    subject: 'Economics',
    kind: 'mindmap',
    keywords: /\b(budget|fiscal deficit|revenue deficit|capex|frbm|taxation|laffer|crowding)\b/i,
    nodes: [
      { label: 'Union Budget', shape: 'pill' },
      { label: 'Revenue Receipts (Tax & Non-Tax)', shape: 'box' },
      { label: 'Revenue Expenditure (Salaries, Interest)', shape: 'box' },
      { label: 'Capital Receipts (Borrowings, Disinvestment)', shape: 'box' },
      { label: 'Capital Expenditure (Infra & Assets)', shape: 'box' },
      { label: 'Fiscal & Primary Deficits', shape: 'box' },
    ],
    edges: [
      { from: 'Union Budget', to: 'Revenue Receipts (Tax & Non-Tax)' },
      { from: 'Union Budget', to: 'Revenue Expenditure (Salaries, Interest)' },
      { from: 'Union Budget', to: 'Capital Receipts (Borrowings, Disinvestment)' },
      { from: 'Union Budget', to: 'Capital Expenditure (Infra & Assets)' },
      { from: 'Union Budget', to: 'Fiscal & Primary Deficits' },
    ],
  },
  {
    id: 'process',
    name: 'Strategic Delivery Workflow',
    subject: 'Business',
    kind: 'flow',
    keywords: /\b(process|workflow|funnel|onboarding|strategy|roadmap|launch|delivery)\b/i,
    nodes: [
      { label: 'Audit & Discovery', shape: 'pill' },
      { label: 'Architecture & Design', shape: 'box' },
      { label: 'Execution & QA', shape: 'box' },
      { label: 'Client Handover & Growth', shape: 'note' },
    ],
    edges: [
      { from: 'Audit & Discovery', to: 'Architecture & Design' },
      { from: 'Architecture & Design', to: 'Execution & QA' },
      { from: 'Execution & QA', to: 'Client Handover & Growth' },
    ],
  },
  {
    id: 'climate-loop',
    name: 'Climate Albedo Feedback Loop',
    subject: 'Climate',
    kind: 'cycle',
    keywords: /\b(climate change|global warming|albedo|greenhouse|glacier|sea ice|emission)\b/i,
    nodes: [
      { label: 'Rising global temperatures' },
      { label: 'Arctic sea ice melts' },
      { label: 'Surface albedo drops' },
      { label: 'More solar heat absorbed' },
      { label: 'Ocean warming accelerates' },
    ],
    edges: [
      { from: 'Rising global temperatures', to: 'Arctic sea ice melts' },
      { from: 'Arctic sea ice melts', to: 'Surface albedo drops' },
      { from: 'Surface albedo drops', to: 'More solar heat absorbed' },
      { from: 'More solar heat absorbed', to: 'Ocean warming accelerates' },
      { from: 'Ocean warming accelerates', to: 'Rising global temperatures' },
    ],
  },
  {
    id: 'growth-flywheel',
    name: 'Content & Client Growth Flywheel',
    subject: 'Marketing',
    kind: 'cycle',
    keywords: /\b(flywheel|content marketing|audience retention|lead magnet)\b/i,
    nodes: [
      { label: 'High-value content' },
      { label: 'Audience trust & reach' },
      { label: 'Qualified client leads' },
      { label: 'Case studies & results' },
    ],
    edges: [
      { from: 'High-value content', to: 'Audience trust & reach' },
      { from: 'Audience trust & reach', to: 'Qualified client leads' },
      { from: 'Qualified client leads', to: 'Case studies & results' },
      { from: 'Case studies & results', to: 'High-value content' },
    ],
  },
  {
    id: 'concept-map',
    name: 'Core Pillars Mindmap',
    subject: 'General',
    kind: 'mindmap',
    keywords: /\b(mindmap|core pillars|brand framework)\b/i,
    nodes: [
      { label: 'Core Strategy', shape: 'pill' },
      { label: 'Audience Clarity', shape: 'box' },
      { label: 'Visual Authority', shape: 'box' },
      { label: 'Data & Proof', shape: 'box' },
      { label: 'Clear Call to Action', shape: 'box' },
      { label: 'Consistent Cadence', shape: 'box' },
    ],
    edges: [
      { from: 'Core Strategy', to: 'Audience Clarity' },
      { from: 'Core Strategy', to: 'Visual Authority' },
      { from: 'Core Strategy', to: 'Data & Proof' },
      { from: 'Core Strategy', to: 'Clear Call to Action' },
      { from: 'Core Strategy', to: 'Consistent Cadence' },
    ],
  },
  {
    id: 'photosynthesis',
    name: 'Photosynthesis Cycle',
    subject: 'Biology',
    kind: 'cycle',
    keywords: /\b(photosynth\w*|calvin cycle|light reaction|chlorophyll)\b/i,
    nodes: [
      { label: 'Light absorbed by chlorophyll' },
      { label: 'Water split (photolysis)' },
      { label: 'ATP + NADPH produced' },
      { label: 'Calvin cycle fixes CO₂' },
      { label: 'Glucose formed' },
      { label: 'O₂ released' },
    ],
    edges: [
      { from: 'Light absorbed by chlorophyll', to: 'Water split (photolysis)' },
      { from: 'Water split (photolysis)', to: 'ATP + NADPH produced' },
      { from: 'ATP + NADPH produced', to: 'Calvin cycle fixes CO₂' },
      { from: 'Calvin cycle fixes CO₂', to: 'Glucose formed' },
      { from: 'Glucose formed', to: 'O₂ released' },
      { from: 'O₂ released', to: 'Light absorbed by chlorophyll' },
    ],
  },
  {
    id: 'monetary',
    name: 'Monetary Policy Transmission',
    subject: 'Economics',
    kind: 'flow',
    keywords: /\b(monetary|repo rate|mpc|hawkish|dovish|money supply|money multiplier|rbi|inflation|deflation)\b/i,
    nodes: [
      { label: 'RBI Policy Rate (Repo)', shape: 'pill' },
      { label: 'LAF Corridor (SDF ↔ MSF)', shape: 'box' },
      { label: 'Bank Lending & Deposit Rates', shape: 'box' },
      { label: 'Credit & Aggregate Demand', shape: 'box' },
      { label: 'CPI Inflation (4% ± 2%)', shape: 'note' },
    ],
    edges: [
      { from: 'RBI Policy Rate (Repo)', to: 'LAF Corridor (SDF ↔ MSF)' },
      { from: 'LAF Corridor (SDF ↔ MSF)', to: 'Bank Lending & Deposit Rates' },
      { from: 'Bank Lending & Deposit Rates', to: 'Credit & Aggregate Demand' },
      { from: 'Credit & Aggregate Demand', to: 'CPI Inflation (4% ± 2%)' },
    ],
  },
  {
    id: 'heart-real',
    name: 'Human heart — real illustration',
    subject: 'Biology',
    kind: 'figure',
    plateImage: '/figures/heart-real.jpg',
    plateAspect: 1,
    caption: 'Real illustration — red = oxygenated, blue = deoxygenated',
    keywords: /\b(human heart|cardiac|atrium|ventricle|blood flow|aorta|vena cava)\b/i,
    nodes: [
      { label: 'Superior vena cava\n(from upper body)', side: 'left', badge: 1, anchorX: 37, anchorY: 24 },
      { label: 'Right atrium', side: 'left', badge: 2, anchorX: 31, anchorY: 45 },
      { label: 'Right ventricle', side: 'left', badge: 3, anchorX: 38, anchorY: 66 },
      { label: 'Coronary vessels\n(heart muscle supply)', side: 'left', badge: 4, anchorX: 48, anchorY: 79 },
      { label: 'Aorta\n(to body)', side: 'right', badge: 5, anchorX: 58, anchorY: 12 },
      { label: 'Pulmonary artery\n(to lungs)', side: 'right', badge: 6, anchorX: 60, anchorY: 31 },
      { label: 'Left atrium', side: 'right', badge: 7, anchorX: 68, anchorY: 42 },
      { label: 'Left ventricle', side: 'right', badge: 8, anchorX: 66, anchorY: 70 },
    ],
    edges: [],
  },
  {
    id: 'blood-real',
    name: 'Composition of blood — real illustration',
    subject: 'Biology',
    kind: 'figure',
    plateImage: '/figures/blood-real.jpg',
    plateAspect: 1,
    caption: 'Real illustration — plasma, buffy coat, packed cells and formed elements',
    keywords:
      /\b(blood composition|plasma|rbc|wbc|platelet|erythrocyte|leucocyte|thrombocyte)\b/i,
    nodes: [
      { label: 'Plasma\n(55% of blood)', side: 'left', badge: 1, anchorX: 47, anchorY: 32 },
      { label: 'Buffy coat\n(white cells & platelets)', side: 'left', badge: 2, anchorX: 47, anchorY: 50 },
      { label: 'Packed red cells\n(45% of blood)', side: 'left', badge: 3, anchorX: 46, anchorY: 72 },
      { label: 'Whole blood sample', side: 'left', badge: 4, anchorX: 44, anchorY: 90 },
      { label: 'Red blood cell\n(erythrocyte)', side: 'right', badge: 5, anchorX: 69, anchorY: 32 },
      { label: 'White blood cell\n(leucocyte)', side: 'right', badge: 6, anchorX: 66, anchorY: 60 },
      { label: 'Platelets\n(thrombocytes)', side: 'right', badge: 7, anchorX: 72, anchorY: 56 },
    ],
    edges: [],
  },
]

export function presetForPrompt(prompt: string, kind?: DiagramKind): DiagramPreset | null {
  const matches = DIAGRAM_PRESETS.filter((preset) => preset.keywords.test(prompt))
  return matches.find((preset) => preset.kind === kind) ?? matches[0] ?? null
}

export function blockFromPreset(preset: DiagramPreset, title?: string): DocBlock {
  return bindPreset(preset, title || preset.name)
}

export function labeledFigureBlock(
  url: string,
  aspect: number,
  title = 'Labelled figure',
  labels?: { label: string; side?: DiagramSide; x?: number; y?: number }[],
  caption = 'Annotated figure — rename each label and set its anchor position',
): DocBlock {
  const starters: { label: string; side: 'left' | 'right'; x: number; y: number }[] = labels?.length
    ? labels.map((entry, index) => ({
        label: entry.label,
        side: entry.side === 'right' ? 'right' : entry.side === 'left' ? 'left' : index % 2 ? 'right' : 'left',
        x: clampPercent(entry.x, 50),
        y: clampPercent(entry.y, 50),
      }))
    : [
        { label: 'Feature A', side: 'left', x: 30, y: 28 },
        { label: 'Feature B', side: 'left', x: 30, y: 58 },
        { label: 'Feature C', side: 'right', x: 70, y: 34 },
        { label: 'Feature D', side: 'right', x: 70, y: 64 },
      ]
  return {
    id: uid('dia'),
    type: 'diagram',
    diagram: 'schematic',
    plateImage: url,
    plateAspect: aspect > 0 ? aspect : 0.78,
    title: title.replace(/^fig(?:ure)?\.?\s*\d+(?:\.\d+)?\s*[:.–—-]\s*/i, '').trim() || 'Annotated figure',
    caption,
    accent: '',
    edges: [],
    nodes: starters.map((entry, index) => ({
      id: uid('n'),
      label: entry.label,
      side: entry.side,
      badge: index + 1,
      anchorX: entry.x,
      anchorY: entry.y,
    })),
  }
}

function clampPercent(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(96, Math.max(4, Math.round(value)))
}

/* ---------------------------------------------------------------------------
   Geometry — one canvas, viewBox 0 0 W H, auto-sized heights for zero clipping
   ------------------------------------------------------------------------- */

export interface LaidOutNode extends DiagramNode {
  cx: number
  cy: number
  w: number
  h: number
  labelSide?: 'left' | 'right'
  labelLines?: string[]
  labelX?: number
  labelTop?: number
}

export interface DiagramLayout {
  width: number
  height: number
  nodes: LaidOutNode[]
  byId: Map<string, LaidOutNode>
  schematic?: boolean
  plate?: { x: number; y: number; w: number; h: number }
}

const WIDTH = 560

export const SCHEMATIC_WIDTH = 690
const SCHEMATIC_HEIGHT = 440
const SCHEMATIC_INSET = 128
const SCHEMATIC_TOP = 16
const SCHEMATIC_BOTTOM = 38

export function wrapText(label: string, maxChars: number): string[] {
  const lines: string[] = []
  label.split(/\n/).forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    let line = ''
    words.forEach((word) => {
      if (line && `${line} ${word}`.length > maxChars) {
        lines.push(line)
        line = word
      } else {
        line = line ? `${line} ${word}` : word
      }
    })
    if (line) lines.push(line)
  })
  return lines.length ? lines.slice(0, 4) : [label]
}

function nodeHeightFor(label: string, boxW: number, minH: number): number {
  const maxChars = Math.max(10, Math.round((boxW - 18) / 6.2))
  const lines = wrapText(label, maxChars).length
  return Math.max(minH, lines * 13 + 20)
}

function layoutSchematic(block: Extract<DocBlock, { type: 'diagram' }>): DiagramLayout {
  const hasSideLabels = block.nodes.some((node) => node.side === 'left' || node.side === 'right')
  const inset = hasSideLabels ? SCHEMATIC_INSET : 26
  const stageW = SCHEMATIC_WIDTH - inset * 2
  const stageH = SCHEMATIC_HEIGHT - SCHEMATIC_TOP - SCHEMATIC_BOTTOM
  const total = Math.max(1, block.nodes.length)

  const nodes: LaidOutNode[] = block.nodes.map((node, index) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2
    const px = typeof node.x === 'number' ? node.x : 50 + Math.cos(angle) * 26
    const py = typeof node.y === 'number' ? node.y : 50 + Math.sin(angle) * 28
    const w = typeof node.w === 'number' ? (node.w / 100) * stageW : 108
    return {
      ...node,
      cx: inset + (px / 100) * stageW,
      cy: SCHEMATIC_TOP + (py / 100) * stageH,
      w,
      h: typeof node.h === 'number' ? (node.h / 100) * stageH : nodeHeightFor(node.label, w, 44),
    }
  })

  placeSideLabels(nodes, inset, SCHEMATIC_WIDTH, SCHEMATIC_TOP)

  return {
    width: SCHEMATIC_WIDTH,
    height: SCHEMATIC_HEIGHT,
    nodes,
    byId: new Map(nodes.map((node) => [node.id, node])),
    schematic: true,
  }
}

function placeSideLabels(nodes: LaidOutNode[], inset: number, width: number, top: number) {
  const columns: Record<'left' | 'right', LaidOutNode[]> = { left: [], right: [] }
  nodes.forEach((node) => {
    if (node.side === 'left' || node.side === 'right') columns[node.side].push(node)
  })
  ;(['left', 'right'] as const).forEach((side) => {
    const list = columns[side].sort((a, b) => a.cy - b.cy)
    let cursor = top + 4
    list.forEach((node) => {
      const lines = wrapText(node.label, 19)
      const blockHeight = lines.length * 11.8
      const labelTop = Math.max(node.cy - blockHeight / 2, cursor)
      node.labelSide = side
      node.labelLines = lines
      node.labelX = side === 'left' ? inset - 14 : width - inset + 14
      node.labelTop = labelTop
      cursor = labelTop + blockHeight + 7
    })
  })
}

const PLATE_WIDTH = 760
const PLATE_INSET = 136
const PLATE_TOP = 10
const PLATE_RATIO = 560 / 640
const PLATE_LEGEND = 28

function layoutPlate(block: Extract<DocBlock, { type: 'diagram' }>): DiagramLayout {
  const aspect = block.plateAspect && block.plateAspect > 0 ? block.plateAspect : PLATE_RATIO
  let artW = PLATE_WIDTH - PLATE_INSET * 2
  let artH = Math.round(artW * aspect)
  const maxArtH = 520
  if (artH > maxArtH) {
    artH = maxArtH
    artW = Math.round(artH / aspect)
  }
  const height = PLATE_TOP + artH + PLATE_LEGEND
  const plateX = Math.round((PLATE_WIDTH - artW) / 2)
  const nodes: LaidOutNode[] = block.nodes.map((node) => ({
    ...node,
    cx: plateX + ((node.anchorX ?? 50) / 100) * artW,
    cy: PLATE_TOP + ((node.anchorY ?? 50) / 100) * artH,
    w: 0,
    h: 0,
  }))

  placeSideLabels(nodes, PLATE_INSET, PLATE_WIDTH, PLATE_TOP)

  return {
    width: PLATE_WIDTH,
    height,
    nodes,
    byId: new Map(nodes.map((node) => [node.id, node])),
    schematic: true,
    plate: { x: plateX, y: PLATE_TOP, w: artW, h: artH },
  }
}

export function layoutDiagram(block: Extract<DocBlock, { type: 'diagram' }>): DiagramLayout {
  if (block.plate || block.plateImage) return layoutPlate(block)
  if (block.diagram === 'schematic') return layoutSchematic(block)
  const count = block.nodes.length || 1
  const positioned = block.nodes.every((node) => typeof node.x === 'number' && typeof node.y === 'number')
  let height = 310

  if (block.diagram === 'flow' && !positioned) {
    height = Math.max(220, count * 76)
  } else if (block.diagram === 'cycle' && !positioned) {
    height = 340
  } else if (block.diagram === 'mindmap' && !positioned) {
    height = 340
  } else if (block.diagram === 'labeled' && !positioned) {
    height = Math.max(300, Math.ceil(count / 3) * 96)
  }
  if (positioned && block.diagram === 'labeled') height = 340

  const nodes: LaidOutNode[] = block.nodes.map((node, index) => {
    const providedW = typeof node.w === 'number' ? (node.w / 100) * WIDTH : undefined
    const providedH = typeof node.h === 'number' ? (node.h / 100) * height : undefined

    if (block.diagram === 'flow' && !positioned) {
      const boxW = providedW ?? 320
      const boxH = providedH ?? nodeHeightFor(node.label, boxW, 48)
      return {
        ...node,
        cx: WIDTH / 2,
        cy: 38 + index * 74,
        w: boxW,
        h: boxH,
      }
    }
    if (block.diagram === 'cycle' && !positioned) {
      const radiusX = 182
      const radiusY = 112
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2
      const w = 152
      return {
        ...node,
        cx: WIDTH / 2 + Math.cos(angle) * radiusX,
        cy: height / 2 + Math.sin(angle) * radiusY,
        w,
        h: nodeHeightFor(node.label, w, 46),
      }
    }
    if (block.diagram === 'mindmap' && !positioned) {
      if (index === 0) {
        const w = 178
        return { ...node, cx: WIDTH / 2, cy: height / 2, w, h: nodeHeightFor(node.label, w, 52) }
      }
      const ringCount = count - 1
      const angle = ((index - 1) / ringCount) * Math.PI * 2 - Math.PI / 2
      const w = 148
      return {
        ...node,
        cx: WIDTH / 2 + Math.cos(angle) * 190,
        cy: height / 2 + Math.sin(angle) * 118,
        w,
        h: nodeHeightFor(node.label, w, 46),
      }
    }
    if (typeof node.x === 'number' && typeof node.y === 'number') {
      const w = providedW ?? 132
      return {
        ...node,
        cx: (node.x / 100) * WIDTH,
        cy: (node.y / 100) * height,
        w,
        h: providedH ?? nodeHeightFor(node.label, w, 40),
      }
    }
    const perRow = 3
    const row = Math.floor(index / perRow)
    const col = index % perRow
    const w = 152
    return {
      ...node,
      cx: 94 + col * ((WIDTH - 188) / 2),
      cy: 48 + row * 78,
      w,
      h: nodeHeightFor(node.label, w, 42),
    }
  })

  return { width: WIDTH, height, nodes, byId: new Map(nodes.map((node) => [node.id, node])) }
}
