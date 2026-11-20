import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { SLIDE } from './pagination'

export type ProgressFn = (done: number, total: number, label: string) => void

export async function waitForFonts(): Promise<void> {
  try {
    await document.fonts.ready
  } catch {
    /* fonts API unavailable — continue with what is loaded */
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
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function exportPdf(
  pages: HTMLElement[],
  fileName: string,
  onProgress?: ProgressFn,
): Promise<void> {
  if (!pages.length) throw new Error('Nothing to export yet — generate or load a document first.')
  await waitForFonts()
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pages.length; index += 1) {
    onProgress?.(index, pages.length, `Rendering page ${index + 1} of ${pages.length}`)
    const dataUrl = await toPng(pages[index], {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipAutoScale: true,
    })
    if (index > 0) pdf.addPage()
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  onProgress?.(pages.length, pages.length, 'Saving PDF')
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}

/**
 * Slides live inside a scaled preview frame, so capture a clean full-size clone
 * offscreen instead of the transformed live node.
 */
async function captureSlide(node: HTMLElement): Promise<string> {
  await waitForFonts()
  const host = document.createElement('div')
  host.setAttribute('data-capture-host', 'true')
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${SLIDE.width}px;height:${SLIDE.height}px;pointer-events:none;z-index:-1;`
  const clone = node.cloneNode(true) as HTMLElement
  clone.style.transform = 'none'
  clone.style.width = `${SLIDE.width}px`
  clone.style.height = `${SLIDE.height}px`
  clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable')
    el.removeAttribute('tabindex')
  })
  host.appendChild(clone)
  document.body.appendChild(host)

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return await toPng(clone, {
      pixelRatio: 2,
      width: SLIDE.width,
      height: SLIDE.height,
      backgroundColor: '#ffffff',
      skipAutoScale: true,
    })
  } finally {
    host.remove()
  }
}

export async function exportSlidesZip(
  slides: HTMLElement[],
  baseName: string,
  onProgress?: ProgressFn,
): Promise<void> {
  if (!slides.length) throw new Error('Nothing to export yet — generate a carousel first.')
  const zip = new JSZip()
  const folder = zip.folder(baseName) ?? zip

  for (let index = 0; index < slides.length; index += 1) {
    onProgress?.(index, slides.length, `Rendering slide ${index + 1} of ${slides.length}`)
    const dataUrl = await captureSlide(slides[index])
    folder.file(`${baseName}-slide-${String(index + 1).padStart(2, '0')}.png`, dataUrlToBytes(dataUrl), {
      binary: true,
    })
  }

  onProgress?.(slides.length, slides.length, 'Packing ZIP')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  downloadBlob(blob, `${baseName}.zip`)
}

export async function exportSingleSlide(
  slide: HTMLElement,
  fileName: string,
  onProgress?: ProgressFn,
): Promise<void> {
  onProgress?.(0, 1, 'Rendering slide')
  const dataUrl = await captureSlide(slide)
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  downloadBlob(blob, fileName.endsWith('.png') ? fileName : `${fileName}.png`)
}
