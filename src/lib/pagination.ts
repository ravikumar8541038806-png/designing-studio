export const A4 = { width: 794, height: 1123 }
export const SLIDE = { width: 1080, height: 1350 }

/**
 * Vertical budget of an A4 sheet:
 * 96px running header, 50px footer, 40px bottom margin, 16px body/footer gap.
 */
export const PAPER = {
  padX: 64,
  headerHeight: 96,
  footerHeight: 50,
  bottomMargin: 40,
  bodyGap: 16,
}

export const CONTENT_WIDTH = A4.width - PAPER.padX * 2

export const CONTENT_HEIGHT =
  A4.height - PAPER.headerHeight - PAPER.footerHeight - PAPER.bottomMargin - PAPER.bodyGap

export const FLOW_GAP = 14

export interface FlowItem {
  key: string
  sticky: boolean
  kind: 'section' | 'block' | 'mcq-head' | 'mcq'
  sectionIndex?: number
  blockIndex?: number
  mcqIndex?: number
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
    // Never leave a section heading or the MCQ heading orphaned at the foot of a page.
    if (sticky[index] && index + 1 < heights.length) {
      needed += gap + Math.max(heights[index + 1] || 0, 1)
    }
    if (current.length && used + needed > contentHeight) flush()
    if (current.length) used += gap
    current.push(index)
    used += height
  }
  flush()
  return pages
}
