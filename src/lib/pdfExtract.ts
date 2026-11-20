import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_PAGES = 80
const MAX_CHARS = 60_000

export interface ExtractedPdf {
  name: string
  pages: number
  text: string
  truncated: boolean
}

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedPdf> {
  const data = new Uint8Array(await file.arrayBuffer())
  const loading = pdfjs.getDocument({ data })
  const pdf = await loading.promise
  const total = Math.min(pdf.numPages, MAX_PAGES)
  const chunks: string[] = []
  let length = 0
  let truncated = pdf.numPages > MAX_PAGES

  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) {
        chunks.push(line.trim())
        length += line.length + 1
        line = ''
      } else {
        line += ' '
      }
    }
    if (line.trim()) {
      chunks.push(line.trim())
      length += line.length + 1
    }
    onProgress?.(pageNumber, total)
    if (length >= MAX_CHARS) {
      truncated = true
      break
    }
  }

  await pdf.destroy()
  const text = chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return {
    name: file.name,
    pages: pdf.numPages,
    text: text.slice(0, MAX_CHARS),
    truncated,
  }
}
