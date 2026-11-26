import type { PageSizeId, SlideFormatId } from '../types'

export const PAGE_DIMS: Record<PageSizeId, { width: number; height: number; label: string }> = {
  a4: { width: 794, height: 1123, label: 'A4' },
  letter: { width: 816, height: 1056, label: 'US Letter' },
}

export const A4 = PAGE_DIMS.a4

export const SLIDE_DIMS: Record<SlideFormatId, { width: number; height: number; label: string }> = {
  portrait: { width: 1080, height: 1350, label: '1080 × 1350' },
  square: { width: 1080, height: 1080, label: '1080 × 1080' },
  deck: { width: 1920, height: 1080, label: '1920 × 1080' },
}

export const SLIDE = SLIDE_DIMS.portrait

/**
 * Vertical budget of a printed sheet:
 * 96px running header, 50px footer, 40px bottom margin, 16px body/footer gap.
 */
export const PAPER = {
  padX: 56,
  headerHeight: 96,
  footerHeight: 50,
  bottomMargin: 40,
  bodyGap: 16,
}

export const CONTENT_WIDTH = A4.width - PAPER.padX * 2

export const CONTENT_HEIGHT =
  A4.height - PAPER.headerHeight - PAPER.footerHeight - PAPER.bottomMargin - PAPER.bodyGap

export function pageBudget(pageSize: PageSizeId = 'a4', margin: number = PAPER.padX) {
  const dims = PAGE_DIMS[pageSize] ?? PAGE_DIMS.a4
  const padX = Math.min(80, Math.max(36, margin || PAPER.padX))
  return {
    width: dims.width,
    height: dims.height,
    label: dims.label,
    padX,
    contentWidth: dims.width - padX * 2,
    contentHeight:
      dims.height - PAPER.headerHeight - PAPER.footerHeight - PAPER.bottomMargin - PAPER.bodyGap,
  }
}

export const FLOW_GAP = 14

export interface FlowItem {
  key: string
  sticky: boolean
  kind: 'section' | 'block' | 'mcq-head' | 'mcq'
  sectionIndex?: number
  blockIndex?: number
  mcqIndex?: number
  /** For auto-split large tables: inclusive start / exclusive end row indices. */
  rowStart?: number
  rowEnd?: number
  isContinuation?: boolean
}

export function paginate(
  heights: number[],
  contentHeight: number = CONTENT_HEIGHT,
  sticky: boolean[] = [],
  gap: number = FLOW_GAP,
): number[][] {
  const pages: number[][] = []
  let current: number[] = []
  let used = 0

  const flush = () => {
    if (current.length) pages.push(current)
    current = []
    used = 0
  }

  for (let index = 0; index < heights.length; index += 1) {
    const height = Math.max(heights[index] || 0, 1)
    let needed = (current.length ? gap : 0) + height
    if (sticky[index] && index + 1 < heights.length) {
      let lookahead = index + 1
      while (lookahead < heights.length) {
        needed += gap + Math.max(heights[lookahead] || 0, 1)
        if (!sticky[lookahead]) break
        lookahead += 1
      }
    }
    if (current.length && used + needed > contentHeight) flush()
    if (current.length) used += gap
    current.push(index)
    used += height
  }
  flush()
  return pages
}
