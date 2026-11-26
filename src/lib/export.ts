import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { A4, SLIDE_DIMS } from './pagination'
import type { SlideFormatId } from '../types'

export type ProgressFn = (done: number, total: number, label: string) => void

export async function waitForFonts(): Promise<void> {
  try {
    await document.fonts.ready
  } catch {
    /* fonts API unavailable — continue with loaded fonts */
  }
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'clientforge'
  )
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function pageBackground(node: HTMLElement): string {
  const bg = getComputedStyle(node).backgroundColor
  if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return '#ffffff'
  return bg
}

function rgbTuple(color: string): [number, number, number] {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])]
  const hex = color.replace('#', '')
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }
  return [255, 255, 255]
}

const urlCache = new Map<string, string>()

async function toDataUrl(src: string): Promise<string> {
  if (!src || src.startsWith('data:')) return src
  const cached = urlCache.get(src)
  if (cached) return cached

  try {
    const response = await fetch(src, { mode: 'cors' })
    if (!response.ok) return src
    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? src))
      reader.onerror = () => resolve(src)
      reader.readAsDataURL(blob)
    })
    urlCache.set(src, dataUrl)
    return dataUrl
  } catch {
    return src
  }
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const htmlImgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  const svgImgs = Array.from(root.querySelectorAll<SVGImageElement>('image'))

  await Promise.all([
    ...htmlImgs.map(async (img) => {
      const src = img.getAttribute('src') || ''
      if (src && !src.startsWith('data:')) {
        img.setAttribute('src', await toDataUrl(src))
      }
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      }
      try {
        await img.decode()
      } catch {
        /* ignore decode errors on broken images */
      }
    }),
    ...svgImgs.map(async (img) => {
      const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
      if (href && !href.startsWith('data:')) {
        const dataUrl = await toDataUrl(href)
        img.setAttribute('href', dataUrl)
      }
    }),
  ])
}

/**
 * Captures any A4 page or Slide at exact 1:1 natural dimensions inside an
 * isolated offscreen host so parent zoom transforms, scrollbars, hover controls,
 * or relative assets can never clip or corrupt the output.
 */
async function captureNode(node: HTMLElement, width: number, height: number): Promise<string> {
  await waitForFonts()
  const background = pageBackground(node)
  const host = document.createElement('div')
  host.setAttribute('data-capture-host', 'true')
  host.style.cssText = `position:fixed;left:-26000px;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:-1;overflow:hidden;`

  const clone = node.cloneNode(true) as HTMLElement
  clone.style.margin = '0'
  clone.style.transform = 'none'
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.boxShadow = 'none'
  clone.style.borderRadius = '0'

  clone.querySelectorAll('.no-export').forEach((el) => el.remove())
  clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable')
    el.removeAttribute('tabindex')
    el.removeAttribute('data-placeholder')
  })

  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await waitForImages(clone)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const opts = {
      width,
      height,
      backgroundColor: background,
      skipAutoScale: true,
      cacheBust: false,
      style: { margin: '0', transform: 'none', printColorAdjust: 'exact' } as Record<string, string>,
    }

    try {
      return await toPng(clone, { ...opts, pixelRatio: 2.5 })
    } catch {
      try {
        return await toPng(clone, { ...opts, pixelRatio: 2 })
      } catch {
        // Fallback when external stylesheet rules block font embedding.
        return await toPng(clone, { ...opts, pixelRatio: 2, skipFonts: true })
      }
    }
  } finally {
    host.remove()
  }
}

/**
 * Native vector export via the browser print pipeline.
 * Keeps text selectable and vector SVG/KaTeX razor sharp.
 */
export async function printVectorPdf(fileName: string, title?: string): Promise<void> {
  await waitForFonts()
  const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-pdf-page]'))
  await Promise.all(
    pages.flatMap((page) =>
      Array.from(page.querySelectorAll<HTMLImageElement>('img')).map((img) =>
        img.decode ? img.decode().catch(() => undefined) : Promise.resolve(),
      ),
    ),
  )

  const previousTitle = document.title
  document.title = title || fileName
  document.body.classList.add('printing')
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const cleanup = () => {
    document.body.classList.remove('printing')
    document.title = previousTitle
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  try {
    window.print()
  } finally {
    window.setTimeout(cleanup, 1500)
  }
}

/**
 * Bulletproof print-ready PDF download.
 * Captures every page offscreen at 2.5× DPI with full-bleed background fidelity,
 * zero edge clipping, and zero browser print-dialog friction.
 */
export async function exportPdf(pages: HTMLElement[], fileName: string, onProgress?: ProgressFn): Promise<void> {
  if (!pages.length) throw new Error('Nothing to export yet — generate or load a document first.')
  await waitForFonts()
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pages.length; index += 1) {
    onProgress?.(index, pages.length, `Rendering page ${index + 1} of ${pages.length}`)
    const node = pages[index]
    const background = pageBackground(node)
    let dataUrl: string
    try {
      dataUrl = await captureNode(node, A4.width, A4.height)
    } catch {
      throw new Error(`Page ${index + 1} could not be rendered. Try Vector Print PDF instead.`)
    }
    if (index > 0) pdf.addPage()
    const [r, g, b] = rgbTuple(background)
    pdf.setFillColor(r, g, b)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  onProgress?.(pages.length, pages.length, 'Saving PDF')
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}

export async function exportSlidesZip(
  slides: HTMLElement[],
  baseName: string,
  onProgress?: ProgressFn,
  format: SlideFormatId = 'portrait',
): Promise<void> {
  if (!slides.length) throw new Error('Nothing to export yet — generate a deck first.')
  const dims = SLIDE_DIMS[format] ?? SLIDE_DIMS.portrait
  const zip = new JSZip()
  const folder = zip.folder(baseName) ?? zip

  for (let index = 0; index < slides.length; index += 1) {
    onProgress?.(index, slides.length, `Rendering slide ${index + 1} of ${slides.length}`)
    const dataUrl = await captureNode(slides[index], dims.width, dims.height)
    folder.file(`${baseName}-slide-${String(index + 1).padStart(2, '0')}.png`, dataUrlToBytes(dataUrl), {
      binary: true,
    })
  }

  onProgress?.(slides.length, slides.length, 'Packing ZIP')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  downloadBlob(blob, `${baseName}.zip`)
}

export async function exportSlidesPdf(
  slides: HTMLElement[],
  fileName: string,
  format: SlideFormatId = 'portrait',
  onProgress?: ProgressFn,
): Promise<void> {
  if (!slides.length) throw new Error('Nothing to export yet — generate a deck first.')
  await waitForFonts()
  const dims = SLIDE_DIMS[format] ?? SLIDE_DIMS.portrait
  const orientation = dims.width > dims.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    unit: 'px',
    format: [dims.width, dims.height],
    orientation,
    hotfixes: ['px_scaling'],
    compress: true,
  })

  for (let index = 0; index < slides.length; index += 1) {
    onProgress?.(index, slides.length, `Rendering slide ${index + 1} of ${slides.length}`)
    const node = slides[index]
    const background = pageBackground(node)
    const dataUrl = await captureNode(node, dims.width, dims.height)
    if (index > 0) pdf.addPage([dims.width, dims.height], orientation)
    const [r, g, b] = rgbTuple(background)
    pdf.setFillColor(r, g, b)
    pdf.rect(0, 0, dims.width, dims.height, 'F')
    pdf.addImage(dataUrl, 'PNG', 0, 0, dims.width, dims.height, undefined, 'FAST')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  onProgress?.(slides.length, slides.length, 'Saving Deck PDF')
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}

export async function exportSingleSlide(
  slide: HTMLElement,
  fileName: string,
  onProgress?: ProgressFn,
  format: SlideFormatId = 'portrait',
): Promise<void> {
  const dims = SLIDE_DIMS[format] ?? SLIDE_DIMS.portrait
  onProgress?.(0, 1, 'Rendering slide')
  const dataUrl = await captureNode(slide, dims.width, dims.height)
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  downloadBlob(blob, fileName.endsWith('.png') ? fileName : `${fileName}.png`)
}
