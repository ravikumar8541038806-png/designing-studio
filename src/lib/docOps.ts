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
    if (block.type === 'lead' || block.type === 'paragraph' || block.type === 'subheading') {
      return { ...block, text }
    }
    if (block.type === 'quote') return { ...block, text }
    return block
  })
}

export function updateBlockById(
  doc: PdfDoc,
  sectionId: string,
  blockId: string,
  updater: (block: DocBlock) => DocBlock,
): PdfDoc {
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id !== sectionId
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block) => (block.id === blockId ? updater(block) : block)),
          },
    ),
  }
}

export function removeBlockById(doc: PdfDoc, sectionId: string, blockId: string): PdfDoc {
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id !== sectionId
        ? section
        : { ...section, blocks: section.blocks.filter((block) => block.id !== blockId) },
    ),
  }
}

export function moveBlockById(
  doc: PdfDoc,
  sectionId: string,
  blockId: string,
  direction: -1 | 1,
): PdfDoc {
  return {
    ...doc,
    sections: doc.sections.map((section) => {
      if (section.id !== sectionId) return section
      const index = section.blocks.findIndex((block) => block.id === blockId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= section.blocks.length) return section
      const blocks = [...section.blocks]
      const [moved] = blocks.splice(index, 1)
      blocks.splice(target, 0, moved)
      return { ...section, blocks }
    }),
  }
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
