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
  { id: 'schematic', label: 'Schematic', note: 'Anatomy, apparatus: colour-coded structures with leader-line labels' },
  { id: 'labeled', label: 'Labeled diagram', note: 'Anatomy, apparatus, maps' },
  { id: 'flow', label: 'Flowchart', note: 'Process and transmission steps' },
  { id: 'cycle', label: 'Cycle loop', note: 'Cycles and feedback loops' },
  { id: 'mindmap', label: 'Mindmap', note: 'Concept trees and revision maps' },
]

const SHAPES: DiagramShape[] = ['box', 'pill', 'ellipse', 'diamond', 'circle', 'note']
const TONES: DiagramTone[] = ['oxygenated', 'deoxygenated', 'tissue', 'highlight', 'neutral']
const SIDES: DiagramSide[] = ['inside', 'left', 'right']

export function diagramLabel(kind: DiagramKind): string {
  return DIAGRAM_KINDS.find((entry) => entry.id === kind)?.label ?? 'Diagram'
}

function bindPreset(preset: DiagramPreset, title: string): DocBlock {
  const nodes = preset.nodes.map((node) => ({ ...node, id: uid('n') }))
  // Preset edges are authored with node labels; remap them to the fresh ids.
  // Figure labels wrap onto a second line, so the first line is an alias too.
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
      preset.kind === 'schematic'
        ? 'Schematic — red = oxygenated, blue = deoxygenated'
        : 'Flowchart — edit any label in place',
    nodes,
    edges,
    accent: '',
    plate: preset.plate,
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
  const kind: DiagramKind = (['flow', 'cycle', 'mindmap', 'labeled', 'schematic'] as const).includes(
    rawKind as DiagramKind,
  )
    ? (rawKind as DiagramKind)
    : fallbackKind

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
   Local presets — the Visual Studio works with no API key at all.
   ------------------------------------------------------------------------- */

export interface DiagramPreset {
  id: string
  name: string
  subject: string
  kind: DiagramKind
  keywords: RegExp
  nodes: Omit<DiagramNode, 'id'>[]
  edges: DiagramEdge[]
  /** Named anatomical artwork drawn behind the labels. */
  plate?: string
}

export const DIAGRAM_PRESETS: DiagramPreset[] = [
  {
    id: 'heart',
    name: 'Human heart — pathway of blood flow',
    subject: 'Biology',
    kind: 'schematic',
    plate: 'heart',
    keywords: /heart|cardiac|atrium|ventricle|circulat|blood flow|aorta|vena cava/i,
    nodes: [
      {
        label: 'Superior vena cava\n(from upper body)',
        tone: 'deoxygenated', side: 'left', badge: 1, anchorX: 47, anchorY: 21,
      },
      {
        label: 'Right pulmonary artery\n(to right lung)',
        tone: 'deoxygenated', side: 'left', anchorX: 39, anchorY: 24,
      },
      {
        label: 'Right pulmonary veins\n(from right lung)',
        tone: 'oxygenated', side: 'left', anchorX: 25, anchorY: 44,
      },
      { label: 'Right atrium', tone: 'tissue', side: 'left', anchorX: 46, anchorY: 44 },
      {
        label: 'Right AV valve',
        tone: 'highlight', side: 'left', badge: 3, anchorX: 52, anchorY: 53,
      },
      {
        label: 'Pulmonary valve',
        tone: 'highlight', side: 'left', anchorX: 55, anchorY: 48,
      },
      { label: 'Right ventricle', tone: 'tissue', side: 'left', anchorX: 48, anchorY: 68 },
      {
        label: 'Inferior vena cava\n(from lower body)',
        tone: 'deoxygenated', side: 'left', badge: 2, anchorX: 34, anchorY: 84,
      },
      {
        label: 'Left pulmonary artery\n(to left lung)',
        tone: 'deoxygenated', side: 'right', badge: 5, anchorX: 78, anchorY: 26,
      },
      {
        label: 'Aorta\n(to body)',
        tone: 'oxygenated', side: 'right', badge: 10, anchorX: 62, anchorY: 16,
      },
      { label: 'Aortic valve', tone: 'highlight', side: 'right', anchorX: 67, anchorY: 48 },
      { label: 'Left atrium', tone: 'tissue', side: 'right', anchorX: 72, anchorY: 43 },
      {
        label: 'Left pulmonary veins\n(from left lung)',
        tone: 'oxygenated', side: 'right', anchorX: 85, anchorY: 41,
      },
      { label: 'Left AV valve', tone: 'highlight', side: 'right', anchorX: 67, anchorY: 53 },
      { label: 'Left ventricle', tone: 'tissue', side: 'right', anchorX: 68, anchorY: 68 },
      { label: 'Septum', tone: 'neutral', side: 'right', anchorX: 58, anchorY: 68 },
    ],
    edges: [],
  },
  {
    id: 'neuron',
    name: 'Neuron — signal pathway',
    subject: 'Biology',
    kind: 'schematic',
    keywords: /neuron|nerve|synapse|axon|dendrit|myelin/i,
    nodes: [
      {
        label: 'Dendrites\n(receive impulses)',
        shape: 'ellipse', tone: 'tissue', side: 'left', x: 16, y: 24, w: 16, h: 12,
      },
      { label: 'Cell body (soma)', shape: 'ellipse', tone: 'tissue', side: 'left', x: 37, y: 50, w: 18, h: 20 },
      { label: 'Nucleus', shape: 'circle', tone: 'highlight', side: 'left', x: 37, y: 50, w: 8, h: 10 },
      { label: 'Axon', shape: 'pill', tone: 'tissue', side: 'right', x: 75, y: 50, w: 26, h: 4 },
      { label: 'Myelin sheath', shape: 'pill', tone: 'neutral', side: 'right', x: 64, y: 50, w: 12, h: 10 },
      { label: 'Node of Ranvier', shape: 'pill', tone: 'highlight', side: 'right', x: 55, y: 50, w: 4, h: 7 },
      { label: 'Synaptic terminals', shape: 'ellipse', tone: 'highlight', side: 'right', x: 87, y: 50, w: 11, h: 9 },
    ],
    edges: [
      { from: 'Dendrites', to: 'Cell body (soma)', tone: 'highlight', curve: 6 },
      { from: 'Cell body (soma)', to: 'Axon', tone: 'highlight', curve: -6 },
      { from: 'Axon', to: 'Synaptic terminals', tone: 'highlight', curve: -4 },
    ],
  },
  {
    id: 'plant-cell',
    name: 'Plant cell',
    subject: 'Biology',
    kind: 'labeled',
    keywords: /plant cell|chloroplast|vacuole|cell wall|organelle/i,
    nodes: [
      { label: 'Cell wall', x: 50, y: 9, shape: 'note', w: 18 },
      { label: 'Cell membrane', x: 22, y: 24, shape: 'box', w: 24 },
      { label: 'Chloroplast', x: 74, y: 28, shape: 'ellipse', w: 20 },
      { label: 'Nucleus', x: 42, y: 44, shape: 'circle', w: 16 },
      { label: 'Vacuole', x: 66, y: 58, shape: 'ellipse', w: 22 },
      { label: 'Mitochondria', x: 26, y: 64, shape: 'ellipse', w: 22 },
      { label: 'Cytoplasm', x: 50, y: 80, shape: 'note', w: 20 },
    ],
    edges: [
      { from: 'Cell wall', to: 'Cell membrane', label: 'outer layer' },
      { from: 'Nucleus', to: 'Cytoplasm', dashed: true },
      { from: 'Chloroplast', to: 'Vacuole', label: 'glucose storage', dashed: true },
    ],
  },
  {
    id: 'photosynthesis',
    name: 'Photosynthesis cycle',
    subject: 'Biology',
    kind: 'cycle',
    keywords: /photosynth|calvin|light reaction|chlorophyll/i,
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
    id: 'optics',
    name: 'Concave mirror ray diagram',
    subject: 'Physics',
    kind: 'labeled',
    keywords: /mirror|lens|ray|optics|refract|reflect/i,
    nodes: [
      { label: 'Object AB', x: 24, y: 34, shape: 'note', w: 18 },
      { label: 'Principal axis', x: 50, y: 52, shape: 'box', w: 22 },
      { label: 'Centre of curvature C', x: 70, y: 40, shape: 'circle', w: 20 },
      { label: 'Focus F', x: 56, y: 40, shape: 'circle', w: 12 },
      { label: 'Pole P', x: 86, y: 40, shape: 'circle', w: 12 },
      { label: 'Ray 1 ∥ axis', x: 38, y: 20, shape: 'note', w: 20 },
      { label: 'Ray 2 through F', x: 36, y: 70, shape: 'note', w: 22 },
      { label: 'Image A′B′', x: 14, y: 62, shape: 'note', w: 18 },
    ],
    edges: [
      { from: 'Object AB', to: 'Centre of curvature C' },
      { from: 'Ray 1 ∥ axis', to: 'Focus F', label: 'reflects through F' },
      { from: 'Ray 2 through F', to: 'Pole P', label: 'reflects parallel' },
      { from: 'Image A′B′', to: 'Pole P', dashed: true },
    ],
  },
  {
    id: 'circuit',
    name: 'Series electric circuit',
    subject: 'Physics',
    kind: 'flow',
    keywords: /circuit|resistor|voltage|current|ohm/i,
    nodes: [
      { label: 'Cell / battery 12 V', shape: 'box' },
      { label: 'Switch', shape: 'pill' },
      { label: 'Resistor R₁ = 4 Ω', shape: 'box' },
      { label: 'Resistor R₂ = 6 Ω', shape: 'box' },
      { label: 'Ammeter reads 1.2 A', shape: 'note' },
    ],
    edges: [
      { from: 'Cell / battery 12 V', to: 'Switch' },
      { from: 'Switch', to: 'Resistor R₁ = 4 Ω' },
      { from: 'Resistor R₁ = 4 Ω', to: 'Resistor R₂ = 6 Ω' },
      { from: 'Resistor R₂ = 6 Ω', to: 'Ammeter reads 1.2 A' },
      { from: 'Ammeter reads 1.2 A', to: 'Cell / battery 12 V', label: 'return' },
    ],
  },
  {
    id: 'demand-supply',
    name: 'Demand & supply equilibrium',
    subject: 'Economics',
    kind: 'labeled',
    keywords: /demand|supply|equilibrium|elastic|market/i,
    nodes: [
      { label: 'Price (P)', x: 10, y: 16, shape: 'note', w: 16 },
      { label: 'Quantity (Q)', x: 82, y: 84, shape: 'note', w: 18 },
      { label: 'Demand curve D', x: 30, y: 62, shape: 'box', w: 22 },
      { label: 'Supply curve S', x: 64, y: 34, shape: 'box', w: 22 },
      { label: 'Equilibrium E (P*, Q*)', x: 48, y: 48, shape: 'circle', w: 26 },
      { label: 'Excess supply', x: 70, y: 16, shape: 'note', w: 20 },
      { label: 'Excess demand', x: 22, y: 84, shape: 'note', w: 20 },
    ],
    edges: [
      { from: 'Demand curve D', to: 'Equilibrium E (P*, Q*)', label: 'slopes down' },
      { from: 'Supply curve S', to: 'Equilibrium E (P*, Q*)', label: 'slopes up' },
      { from: 'Price (P)', to: 'Equilibrium E (P*, Q*)', dashed: true },
      { from: 'Quantity (Q)', to: 'Equilibrium E (P*, Q*)', dashed: true },
    ],
  },
  {
    id: 'monetary',
    name: 'Monetary transmission',
    subject: 'Economics',
    kind: 'flow',
    keywords: /monetary|repo|mpc|hawkish|dovish|inflation|rbi|interest rate/i,
    nodes: [
      { label: 'RBI policy rate change', shape: 'pill' },
      { label: 'MPC decision: repo rate ±25 bps', shape: 'box' },
      { label: 'Bank lending & deposit rates adjust', shape: 'box' },
      { label: 'Credit offtake and investment shift', shape: 'box' },
      { label: 'Aggregate demand moves', shape: 'box' },
      { label: 'Inflation and growth respond', shape: 'note' },
    ],
    edges: [
      { from: 'RBI policy rate change', to: 'MPC decision: repo rate ±25 bps' },
      { from: 'MPC decision: repo rate ±25 bps', to: 'Bank lending & deposit rates adjust' },
      { from: 'Bank lending & deposit rates adjust', to: 'Credit offtake and investment shift' },
      { from: 'Credit offtake and investment shift', to: 'Aggregate demand moves' },
      { from: 'Aggregate demand moves', to: 'Inflation and growth respond' },
    ],
  },
  {
    id: 'water-cycle',
    name: 'Water cycle',
    subject: 'Geography',
    kind: 'cycle',
    keywords: /water cycle|evaporat|condensat|precipitat|hydrolog/i,
    nodes: [
      { label: 'Evaporation from oceans' },
      { label: 'Transpiration from plants' },
      { label: 'Condensation into clouds' },
      { label: 'Precipitation (rain, snow)' },
      { label: 'Surface runoff & infiltration' },
      { label: 'Groundwater storage' },
    ],
    edges: [
      { from: 'Evaporation from oceans', to: 'Condensation into clouds' },
      { from: 'Transpiration from plants', to: 'Condensation into clouds' },
      { from: 'Condensation into clouds', to: 'Precipitation (rain, snow)' },
      { from: 'Precipitation (rain, snow)', to: 'Surface runoff & infiltration' },
      { from: 'Surface runoff & infiltration', to: 'Groundwater storage' },
      { from: 'Groundwater storage', to: 'Evaporation from oceans' },
    ],
  },
  {
    id: 'process',
    name: 'Four-step process',
    subject: 'Business',
    kind: 'flow',
    keywords: /process|workflow|funnel|onboarding|strategy/i,
    nodes: [
      { label: 'Diagnose the problem', shape: 'pill' },
      { label: 'Design the intervention', shape: 'box' },
      { label: 'Deliver with owners and dates', shape: 'box' },
      { label: 'Measure and iterate', shape: 'note' },
    ],
    edges: [
      { from: 'Diagnose the problem', to: 'Design the intervention' },
      { from: 'Design the intervention', to: 'Deliver with owners and dates' },
      { from: 'Deliver with owners and dates', to: 'Measure and iterate' },
    ],
  },
]

export function presetForPrompt(prompt: string, kind?: DiagramKind): DiagramPreset | null {
  const matches = DIAGRAM_PRESETS.filter((preset) => preset.keywords.test(prompt))
  return matches.find((preset) => preset.kind === kind) ?? matches[0] ?? null
}

export function blockFromPreset(preset: DiagramPreset, title?: string): DocBlock {
  return bindPreset(preset, title || preset.name)
}

/**
 * Wraps a real illustration (uploaded or AI-generated) in the same labelling
 * system as the vector plates: text in the gutters, leader lines to the art.
 */
export function labeledFigureBlock(
  url: string,
  aspect: number,
  title = 'Labelled figure',
): DocBlock {
  const starters: { label: string; side: 'left' | 'right'; x: number; y: number }[] = [
    { label: 'Structure A', side: 'left', x: 30, y: 28 },
    { label: 'Structure B', side: 'left', x: 30, y: 58 },
    { label: 'Structure C', side: 'right', x: 70, y: 34 },
    { label: 'Structure D', side: 'right', x: 70, y: 64 },
  ]
  return {
    id: uid('dia'),
    type: 'diagram',
    diagram: 'schematic',
    plateImage: url,
    plateAspect: aspect > 0 ? aspect : 0.78,
    title: title.replace(/^fig(?:ure)?\.?\s*\d+(?:\.\d+)?\s*[:.–—-]\s*/i, '').trim() || 'Labelled figure',
    caption: 'Labelled figure — rename each label and drag its position',
    accent: '',
    edges: [],
    nodes: starters.map((entry) => ({
      id: uid('n'),
      label: entry.label,
      side: entry.side,
      anchorX: entry.x,
      anchorY: entry.y,
    })),
  }
}

/* ---------------------------------------------------------------------------
   Geometry — one canvas, viewBox 0 0 560 H, positioned nodes in percent.
   ------------------------------------------------------------------------- */

export interface LaidOutNode extends DiagramNode {
  cx: number
  cy: number
  w: number
  h: number
  /** Schematic side labels: resolved column, wrapped lines and top edge. */
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
  /** Box the anatomical plate is painted into, in canvas units. */
  plate?: { x: number; y: number; w: number; h: number }
}

const WIDTH = 560

/* Scientific schematics use a wider stage with gutters for leader-line labels. */
export const SCHEMATIC_WIDTH = 690
const SCHEMATIC_HEIGHT = 440
const SCHEMATIC_INSET = 128
const SCHEMATIC_TOP = 16
const SCHEMATIC_BOTTOM = 38

/** Wraps a label on explicit line breaks, then on width — shared by layout and paint. */
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

/**
 * Textbook figure layout: structures stay on the stage, labels sit in the
 * left/right gutters with a leader line back to the structure they name.
 */
function layoutSchematic(block: Extract<DocBlock, { type: 'diagram' }>): DiagramLayout {
  const hasSideLabels = block.nodes.some((node) => node.side === 'left' || node.side === 'right')
  const inset = hasSideLabels ? SCHEMATIC_INSET : 26
  const stageW = SCHEMATIC_WIDTH - inset * 2
  const stageH = SCHEMATIC_HEIGHT - SCHEMATIC_TOP - SCHEMATIC_BOTTOM
  const total = Math.max(1, block.nodes.length)

  const nodes: LaidOutNode[] = block.nodes.map((node, index) => {
    // Unpositioned structures fall on a ring so nothing stacks in one spot.
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2
    const px = typeof node.x === 'number' ? node.x : 50 + Math.cos(angle) * 26
    const py = typeof node.y === 'number' ? node.y : 50 + Math.sin(angle) * 28
    return {
      ...node,
      cx: inset + (px / 100) * stageW,
      cy: SCHEMATIC_TOP + (py / 100) * stageH,
      w: typeof node.w === 'number' ? (node.w / 100) * stageW : 96,
      h: typeof node.h === 'number' ? (node.h / 100) * stageH : 44,
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

/** Stacks gutter labels by vertical order and keeps a readable gap between them. */
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
const PLATE_INSET = 132
const PLATE_TOP = 10
const PLATE_RATIO = 560 / 640
const PLATE_LEGEND = 28

/** Anatomical plate: art fills the centre stage, labels sit in the gutters. */
function layoutPlate(block: Extract<DocBlock, { type: 'diagram' }>): DiagramLayout {
  const aspect = block.plateAspect && block.plateAspect > 0 ? block.plateAspect : PLATE_RATIO
  let artW = PLATE_WIDTH - PLATE_INSET * 2
  let artH = Math.round(artW * aspect)
  // Very tall uploads shrink instead of overflowing the page block.
  const maxArtH = 540
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
  let height = 300

  if (block.diagram === 'flow' && !positioned) {
    height = Math.max(220, count * 74)
  } else if (block.diagram === 'cycle' && !positioned) {
    height = 330
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
      const boxW = 300
      const boxH = 48
      return {
        ...node,
        cx: WIDTH / 2,
        cy: 38 + index * 74,
        w: providedW ?? boxW,
        h: providedH ?? boxH,
      }
    }
    if (block.diagram === 'cycle' && !positioned) {
      const radiusX = 178
      const radiusY = 108
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2
      return {
        ...node,
        cx: WIDTH / 2 + Math.cos(angle) * radiusX,
        cy: height / 2 + Math.sin(angle) * radiusY,
        w: 148,
        h: 46,
      }
    }
    if (block.diagram === 'mindmap' && !positioned) {
      if (index === 0) return { ...node, cx: WIDTH / 2, cy: height / 2, w: 176, h: 52 }
      const ringCount = count - 1
      const angle = ((index - 1) / ringCount) * Math.PI * 2 - Math.PI / 2
      return {
        ...node,
        cx: WIDTH / 2 + Math.cos(angle) * 190,
        cy: height / 2 + Math.sin(angle) * 118,
        w: 140,
        h: 46,
      }
    }
    // Labeled diagrams: either explicit percent coordinates or a tidy grid.
    if (typeof node.x === 'number' && typeof node.y === 'number') {
      return {
        ...node,
        cx: (node.x / 100) * WIDTH,
        cy: (node.y / 100) * height,
        w: providedW ?? 126,
        h: providedH ?? 38,
      }
    }
    const perRow = 3
    const row = Math.floor(index / perRow)
    const col = index % perRow
    return {
      ...node,
      cx: 94 + col * ((WIDTH - 188) / 2),
      cy: 48 + row * 76,
      w: 148,
      h: 40,
    }
  })

  return { width: WIDTH, height, nodes, byId: new Map(nodes.map((node) => [node.id, node])) }
}
