import type { Carousel, DocBlock, McqItem, PdfDoc, Slide } from '../types'

export function updateBlock(
  doc: PdfDoc,
  sectionIndex: number,
  blockIndex: number,
  updater: (block: DocBlock) => DocBlock,
): PdfDoc {
  return {
    ...doc,
    sections: doc.sections.map((section, si) =>
      si !== sectionIndex
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block, bi) => (bi === blockIndex ? updater(block) : block)),
          },
    ),
  }
}

export function setSectionHeading(doc: PdfDoc, sectionIndex: number, heading: string): PdfDoc {
  return {
    ...doc,
    sections: doc.sections.map((section, index) =>
      index === sectionIndex ? { ...section, heading } : section,
    ),
  }
}

export function setBlockText(doc: PdfDoc, sectionIndex: number, blockIndex: number, text: string): PdfDoc {
  return updateBlock(doc, sectionIndex, blockIndex, (block) => {
    if (block.type === 'bullets' || block.type === 'numbered' || block.type === 'keyterms') return block
    if (block.type === 'table') return block
    return { ...block, text }
  })
}

export function updateMcq(doc: PdfDoc, mcqIndex: number, patch: Partial<McqItem>): PdfDoc {
  return {
    ...doc,
    mcqs: doc.mcqs.map((item, index) => (index === mcqIndex ? { ...item, ...patch } : item)),
  }
}

export function updateSlide(carousel: Carousel, index: number, patch: Partial<Slide>): Carousel {
  return {
    ...carousel,
    slides: carousel.slides.map((slide, si) => (si === index ? { ...slide, ...patch } : slide)),
  }
}

export function addSlide(carousel: Carousel, at: number): Carousel {
  const total = Math.min(carousel.slides.length + 1, 10)
  const slide: Slide = {
    id: `slide_new_${Date.now().toString(36)}`,
    kind: 'idea',
    eyebrow: 'NEW SLIDE',
    headline: 'One idea per slide',
    subhook: '',
    points: [],
    numbered: false,
    cta: '',
  }
  const next = [...carousel.slides]
  next.splice(Math.max(0, Math.min(at, next.length)), 0, slide)
  return normalizeKinds({ ...carousel, slides: next.slice(0, total) })
}

export function removeSlide(carousel: Carousel, index: number): Carousel {
  if (carousel.slides.length <= 1) return carousel
  const next = carousel.slides.filter((_, si) => si !== index)
  return normalizeKinds({ ...carousel, slides: next })
}

export function normalizeKinds(carousel: Carousel): Carousel {
  return {
    ...carousel,
    slides: carousel.slides.map((slide, index) => ({
      ...slide,
      kind:
        index === 0
          ? 'hook'
          : index === carousel.slides.length - 1
            ? 'cta'
            : slide.kind === 'hook' || slide.kind === 'cta'
              ? 'idea'
              : slide.kind,
    })),
  }
}
