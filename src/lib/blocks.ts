import { uid } from './id'
import type { ChartKind, DocBlock, DocSection, PdfDoc, TimelineItem } from '../types'

export const CHART_KINDS: { id: ChartKind; label: string }[] = [
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'donut', label: 'Pie / Donut' },
  { id: 'hcompare', label: 'Horizontal' },
]

export const CALLOUT_PRESETS = [
  { id: 'exam', label: 'Exam Important', icon: 'spark' },
  { id: 'fact', label: 'Key Fact', icon: 'pin' },
  { id: 'tip', label: 'Pro Tip', icon: 'bulb' },
  { id: 'warning', label: 'Warning', icon: 'alert' },
  { id: 'quote', label: 'Quote', icon: 'quote' },
  { id: 'summary', label: 'Summary', icon: 'check' },
  { id: 'note', label: 'Note', icon: 'book' },
] as const

export const CALLOUT_LABELS: Record<string, string> = {
  exam: 'Exam Important',
  fact: 'Key Fact',
  tip: 'Pro Tip',
  warning: 'Warning',
  quote: 'Quote',
  summary: 'Summary',
  note: 'Note',
}

export function createImageBlock(): DocBlock {
  return {
    id: uid('img'),
    type: 'image',
    url: '',
    caption: 'Add a caption',
    width: 100,
    align: 'center',
    rounded: true,
  }
}

export function createChartBlock(): DocBlock {
  return {
    id: uid('chart'),
    type: 'chart',
    chart: 'bar',
    title: 'Market share by segment',
    labels: ['Segment A', 'Segment B', 'Segment C', 'Segment D'],
    values: [42, 28, 19, 11],
    accent: '#4f6bff',
    accent2: '#f59e0b',
  }
}

export function createTimelineBlock(): DocBlock {
  return {
    id: uid('tl'),
    type: 'timeline',
    title: 'Timeline',
    orientation: 'vertical',
    items: [
      { id: uid('ev'), date: '1857', title: 'First event', description: 'One line of context.' },
      { id: uid('ev'), date: '1919', title: 'Second event', description: 'What changed and why it matters.' },
    ],
  }
}

export function createCalloutBlock(): DocBlock {
  return {
    id: uid('co'),
    type: 'callout',
    kind: 'tip',
    icon: 'bulb',
    accent: '',
    title: 'Pro Tip',
    body: 'Write the one insight a reader should remember from this page.',
  }
}

export function newTimelineItem(): TimelineItem {
  return { id: uid('ev'), date: 'Year', title: 'Event', description: '' }
}

export function insertBlock(doc: PdfDoc, sectionId: string, block: DocBlock): PdfDoc {
  if (!doc.sections.length) {
    const section: DocSection = { id: uid('s'), heading: 'Visual blocks', blocks: [block] }
    return { ...doc, sections: [section] }
  }
  const target = doc.sections.some((section) => section.id === sectionId)
    ? sectionId
    : doc.sections[doc.sections.length - 1].id
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === target ? { ...section, blocks: [...section.blocks, block] } : section,
    ),
  }
}

export function findBlocks(doc: PdfDoc): { section: DocSection; index: number; block: DocBlock }[] {
  const out: { section: DocSection; index: number; block: DocBlock }[] = []
  doc.sections.forEach((section) => {
    section.blocks.forEach((block, index) => out.push({ section, index, block }))
  })
  return out
}

export function parseSeries(text: string): { labels: string[]; values: number[] } {
  const labels: string[] = []
  const values: number[] = []
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .forEach((line) => {
      const match = line.match(/^(.*?)[\s,:;|]+(-?\d+(?:\.\d+)?)\s*$/)
      if (match) {
        labels.push(match[1].trim() || `Item ${labels.length + 1}`)
        values.push(Number(match[2]))
      } else {
        labels.push(line)
        values.push(1)
      }
    })
  return { labels, values }
}

export function seriesText(labels: string[], values: number[]): string {
  return labels.map((label, index) => `${label}: ${values[index] ?? 0}`).join('\n')
}
