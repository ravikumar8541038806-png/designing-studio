import { uid } from './id'
import type { CalloutKind, Carousel, DocBlock, DocSection, McqItem, PdfDoc, Slide } from '../types'

/**
 * Direct Mode: turns pasted text into the studio's document / carousel shapes
 * entirely in the browser. No network, no model, deterministic and instant.
 * Handles English and Hindi (Devanagari) notes.
 */

const DEVANAGARI_DIGITS: Record<string, string> = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
}

function toAsciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS[digit] ?? digit)
}

interface SourceLine {
  text: string
  blank: boolean
}

function toLines(source: string): SourceLine[] {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((raw) => ({ text: raw.trim(), blank: !raw.trim() }))
}

/** Removes markdown noise while keeping the words intact. */
function cleanInline(raw: string): string {
  return raw
    .replace(/^\s*>\s?/, '')
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const BULLET_RE = /^\s*(?:[-•*·▪◦‣–—]|\(\d+\))\s+/
const NUMBERED_DONE_RE = /^\d{1,3}[.)]\s+\S/
const TABLE_SEPARATOR_CELL = /^:?-{2,}:?$/

const QUESTION_RE = /^(?:q(?:uestion)?|प्रश्न|प्र)\s*[.:\-–—]?\s*(\d{1,3})\s*[.):\-–—]\s*(.+)$/i
const OPTION_RE = /^\(?([a-dA-Dक-घ])\s*[).:：\-–—]\s+(.+)$/
const ANSWER_RE = /^(?:answer|ans|correct\s*answer|उत्तर|सही\s+उत्तर|जवाब)\s*[:：\-–—]?\s*(.+)$/i
const EXPLAIN_RE = /^(?:explanation|reason|why|व्याख्या|कारण|स्पष्टीकरण)\s*[:：\-–—]?\s*(.+)$/i

const CALLOUT_WORDS =
  /^(?:exam\s+important|exam\s+points?|important\s+(?:points?|questions?|notes?)|important|key\s+facts?|key\s+points?|key\s+takeaways?|must\s+remember|remember\s+this|note|notes|tip|caution|warning|fact|facts|महत्वपूर्ण\s+बिंदु|महत्वपूर्ण|परीक्षा\s+महत्वपूर्ण|परीक्षा\s+बिंदु|परीक्षा|मुख्य\s+बिंदु|याद\s+रखें|ध्यान\s+दें|नोट|तथ्य|परिभाषा|सारांश)$/i

const SECTION_WORDS =
  /^(?:introduction|overview|summary|conclusion|definition|definitions|features|characteristics|importance|types|classification|process|examples|advantages|disadvantages|uses|applications|structure|function|functions|causes|effects|notes|key\s+points|key\s+facts|main\s+points|परिचय|परिभाषा|विशेषताएँ|विशेषताएं|महत्व|महत्त्व|प्रकार|वर्गीकरण|प्रक्रिया|उदाहरण|लाभ|हानियाँ|उपयोग|संरचना|कार्य|कारण|प्रभाव|निष्कर्ष|सारांश|मुख्य\s+बिंदु|प्रश्न)$/i

function isTableRow(text: string): boolean {
  const value = cleanInline(text)
  return value.includes('|') && value.replace(/\|/g, '').trim().length > 0
}

function splitRow(text: string): string[] {
  return cleanInline(text)
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cleanInline(cell))
}

function isNumberedLine(text: string): boolean {
  return NUMBERED_DONE_RE.test(toAsciiDigits(cleanInline(text)))
}

function isNumberedRun(lines: SourceLine[], index: number): boolean {
  let count = 0
  let cursor = index
  while (cursor < lines.length && !lines[cursor].blank && isNumberedLine(lines[cursor].text)) {
    count += 1
    cursor += 1
  }
  return count >= 2
}

function matchCallout(text: string): { label: string; rest: string } | null {
  const value = cleanInline(text).replace(/\*\*/g, '').trim()
  const labelled = value.match(/^(.{2,40}?)\s*[:：]\s*(.*)$/)
  if (labelled && CALLOUT_WORDS.test(labelled[1].trim())) {
    return { label: labelled[1].trim(), rest: labelled[2].trim() }
  }
  if (CALLOUT_WORDS.test(value)) return { label: value, rest: '' }
  return null
}

function calloutKind(label: string): CalloutKind {
  const lower = label.toLowerCase()
  if (/exam|important|परीक्षा|महत्वपूर्ण|याद/.test(lower)) return 'exam'
  if (/note|tip|caution|warning|ध्यान|नोट/.test(lower)) return 'note'
  return 'fact'
}

function calloutTitle(label: string): string {
  const lower = label.toLowerCase().replace(/\s+/g, ' ').trim()
  if (/^(exam\s+important|exam\s+points?)$/.test(lower)) return 'Exam Important'
  if (/^important/.test(lower)) return 'Important'
  if (/^key\s+facts?$/.test(lower)) return 'Key Facts'
  if (/^key\s+points?$/.test(lower)) return 'Key Points'
  if (/^key\s+takeaways?$/.test(lower)) return 'Key Takeaways'
  if (/^(must\s+remember|remember\s+this|याद\s+रखें)$/.test(lower)) return 'Remember'
  if (/^(notes?|नोट)$/.test(lower)) return 'Note'
  if (/^(tip|caution|warning)$/.test(lower)) return 'Tip'
  return label.replace(/[:：\-–—]\s*$/, '').trim()
}

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return false
  if (/\p{Script=Devanagari}/u.test(letters)) return false
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase()
}

function headingFromText(raw: string, options: { numbered?: boolean } = {}): string | null {
  const hashed = /^\s{0,3}#{1,6}\s+\S/.test(raw)
  const text = cleanInline(raw)
  if (!text || text.length > 90) return null
  if (BULLET_RE.test(raw)) return null
  if (QUESTION_RE.test(text) || OPTION_RE.test(text) || ANSWER_RE.test(text) || EXPLAIN_RE.test(text)) return null
  if (matchCallout(text)) return null
  if (text.includes('|')) return null
  if (hashed) return text
  if (options.numbered) {
    const numbered = toAsciiDigits(text).match(/^\d{1,3}[.)]\s*(.+)$/)
    return numbered ? numbered[1].trim() : null
  }
  if (/^(?:section|chapter|part|unit|module|अध्याय|पाठ|इकाई|भाग)\s*[-–—]?\s*\d/i.test(text)) return text
  if (SECTION_WORDS.test(text.replace(/[:：\-–—]\s*$/, '').trim())) return text.replace(/[:：]\s*$/, '').trim()
  if (text.length <= 70 && /[:：]\s*$/.test(text)) return text.replace(/[:：]\s*$/, '').trim()
  if (text.length <= 64 && isAllCaps(text)) return text
  return null
}

function tableBlock(rows: string[][]): DocBlock | null {
  const width = Math.max(...rows.map((row) => row.length))
  if (rows.length < 2 || width < 2) return null
  const columns = rows[0].slice(0, 6)
  const body = rows
    .slice(1)
    .map((row) => {
      const cells = row.slice(0, columns.length)
      while (cells.length < columns.length) cells.push('')
      return cells
    })
    .filter((row) => row.some(Boolean))
  if (!body.length) return null
  return { id: uid('b'), type: 'table', caption: '', columns, rows: body }
}

function collectKeyTerms(lines: SourceLine[], index: number): { items: { term: string; definition: string }[]; next: number } {
  const items: { term: string; definition: string }[] = []
  let cursor = index
  while (cursor < lines.length && !lines[cursor].blank) {
    const raw = lines[cursor].text
    const text = cleanInline(raw)
    if (BULLET_RE.test(raw) || isTableRow(text) || isNumberedLine(text)) break
    const match = text.match(/^([^:：]{2,40})\s*[:：]\s*(.{2,})$/)
    if (!match) break
    const term = match[1].trim()
    if (/[.!?।]$/.test(term)) break
    items.push({ term, definition: match[2].trim() })
    cursor += 1
    if (items.length >= 6) break
  }
  if (items.length < 2) return { items: [], next: index }
  return { items, next: cursor }
}

function resolveAnswer(raw: string, options: string[]): string {
  const value = raw.trim()
  if (!value) return options[0] ?? ''
  const exact = options.find((option) => option.toLowerCase() === value.toLowerCase())
  if (exact) return exact

  const latinLetter = value.match(/^\(?([A-Da-d])\)?[.)]?$/)
  if (latinLetter) {
    const index = latinLetter[1].toUpperCase().charCodeAt(0) - 65
    return options[index] ?? value
  }
  const digit = toAsciiDigits(value).match(/^\(?([1-4])\)?[.)]?$/)
  if (digit) return options[Number(digit[1]) - 1] ?? value
  const hindiLetter = value.match(/^\(?([क-घ])\)?[.)]?$/)
  if (hindiLetter) return options['कखगघ'.indexOf(hindiLetter[1])] ?? value

  const partial = options.find(
    (option) => option.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(option.toLowerCase()),
  )
  return partial ?? value
}

function parseMcqs(lines: SourceLine[]): McqItem[] {
  const items: McqItem[] = []
  let question = ''
  let options: string[] = []
  let answer = ''
  let explanation = ''

  const flush = () => {
    if (question && options.length >= 2) {
      items.push({
        id: uid('q'),
        question,
        options: options.slice(0, 4),
        answer: resolveAnswer(answer, options),
        explanation,
      })
    }
    question = ''
    options = []
    answer = ''
    explanation = ''
  }

  for (const line of lines) {
    if (line.blank) continue
    const text = cleanInline(line.text)
    if (!text) continue

    const asked = text.match(QUESTION_RE)
    if (asked) {
      flush()
      question = asked[2].trim()
      continue
    }
    if (!question) continue

    const option = text.match(OPTION_RE)
    if (option && options.length < 5) {
      options.push(option[2].trim())
      continue
    }
    const ans = text.match(ANSWER_RE)
    if (ans) {
      answer = ans[1].trim()
      continue
    }
    const why = text.match(EXPLAIN_RE)
    if (why) {
      explanation = why[1].trim()
      continue
    }
    if (!options.length && !answer && !explanation && question.length < 240) {
      question = `${question} ${text}`.trim()
    } else if (explanation) {
      explanation = `${explanation} ${text}`.trim()
    }
  }
  flush()
  return items.slice(0, 12)
}

function findMcqStart(lines: SourceLine[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].blank) continue
    const text = cleanInline(lines[i].text)
    if (!QUESTION_RE.test(text)) continue
    const lookahead = lines.slice(i + 1, i + 8)
    if (lookahead.some((line) => !line.blank && OPTION_RE.test(cleanInline(line.text)))) return i
  }
  return -1
}

function parseSections(lines: SourceLine[], fallbackHeading: string): DocSection[] {
  const sections: DocSection[] = []
  let heading = ''
  let blocks: DocBlock[] = []

  const flush = () => {
    if (!blocks.length) return
    sections.push({ id: uid('s'), heading: heading || fallbackHeading, blocks })
    blocks = []
    heading = ''
  }

  let i = 0
  while (i < lines.length) {
    if (lines[i].blank) {
      i += 1
      continue
    }

    const raw = lines[i].text
    const text = cleanInline(raw)

    // Pipe tables (also covers "A | B" comparison blocks).
    if (isTableRow(text)) {
      const rows: string[][] = []
      while (i < lines.length && !lines[i].blank && isTableRow(lines[i].text)) {
        const cells = splitRow(lines[i].text)
        if (!cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell))) rows.push(cells)
        i += 1
      }
      const table = tableBlock(rows)
      if (table) blocks.push(table)
      else if (text) blocks.push({ id: uid('b'), type: 'paragraph', text })
      continue
    }

    // Callout boxes: "Exam Important:", "Key Facts", "महत्वपूर्ण", etc.
    const callout = matchCallout(text)
    if (callout) {
      const parts: string[] = callout.rest ? [callout.rest] : []
      i += 1
      // A one-line "Exam Important: …" is complete; only a bare label
      // collects the paragraph or bullets that follow it.
      if (!callout.rest) {
        while (i < lines.length && !lines[i].blank) {
          const nextRaw = lines[i].text
          const nextText = cleanInline(nextRaw)
          if (isTableRow(nextText) || matchCallout(nextText) || QUESTION_RE.test(nextText)) break
          if (headingFromText(nextRaw)) break
          const bodyLine = nextText.replace(BULLET_RE, '').trim()
          if (bodyLine) parts.push(bodyLine)
          i += 1
        }
      }
      blocks.push({
        id: uid('b'),
        type: 'callout',
        kind: calloutKind(callout.label),
        title: calloutTitle(callout.label),
        body: parts.join(' ').trim(),
      })
      continue
    }

    const terms = collectKeyTerms(lines, i)
    if (terms.items.length >= 2) {
      blocks.push({ id: uid('b'), type: 'keyterms', items: terms.items })
      i = terms.next
      continue
    }

    const numberedRun = isNumberedRun(lines, i)
    const numberedLone = !numberedRun && isNumberedLine(text)
    const headingText = headingFromText(raw, { numbered: numberedLone })
    if (headingText) {
      flush()
      heading = headingText
      i += 1
      continue
    }

    if (BULLET_RE.test(raw)) {
      const items: string[] = []
      while (i < lines.length && !lines[i].blank && BULLET_RE.test(lines[i].text)) {
        const item = cleanInline(lines[i].text).replace(BULLET_RE, '').trim()
        if (item) items.push(item)
        i += 1
      }
      if (items.length) blocks.push({ id: uid('b'), type: 'bullets', items: items.slice(0, 6) })
      continue
    }

    if (numberedRun) {
      const items: string[] = []
      while (i < lines.length && !lines[i].blank && isNumberedLine(lines[i].text)) {
        const match = toAsciiDigits(cleanInline(lines[i].text)).match(/^\d{1,3}[.)]\s*(.+)$/)
        if (match) items.push(match[1].trim())
        i += 1
      }
      if (items.length) blocks.push({ id: uid('b'), type: 'numbered', items: items.slice(0, 6) })
      continue
    }

    // Paragraph: join soft-wrapped lines until a blank line or a new block starts.
    const parts: string[] = []
    while (i < lines.length && !lines[i].blank) {
      const value = lines[i].text
      if (BULLET_RE.test(value) || isTableRow(value) || matchCallout(cleanInline(value))) break
      if (parts.length && (isNumberedLine(value) || headingFromText(value))) break
      const clean = cleanInline(value)
      if (clean) parts.push(clean)
      i += 1
    }
    if (parts.length) {
      blocks.push({ id: uid('b'), type: 'paragraph', text: parts.join(' ') })
    } else {
      i += 1
    }
  }

  flush()
  return sections
}

function extractTitle(raw: string): string {
  const text = cleanInline(raw).replace(/^(?:title|शीर्षक)\s*[:：\-–—]\s*/i, '').trim()
  return text || 'Untitled Notes'
}

/** Long, unstructured first paragraph → short title from its opening sentence. */
function deriveTitle(text: string): string {
  const sentence = text.split(/(?<=[.!?।])\s/)[0] ?? text
  const short = sentence.length > 72 ? `${sentence.slice(0, 69).trim()}…` : sentence
  return short || 'Untitled Notes'
}

/** Document/PDF direct parser. */
export function parseDocDirect(source: string): PdfDoc {
  const lines = toLines(source)
  const firstIndex = lines.findIndex((line) => !line.blank)
  if (firstIndex === -1) {
    throw new Error('Paste some notes first — Direct Mode needs text to structure.')
  }

  // A title is a short standalone line. A long opening paragraph stays in the body.
  const firstLine = lines[firstIndex].text
  const firstText = cleanInline(firstLine)
  const looksLikeTitle =
    firstText.length <= 90 &&
    !/[.!?।]$/.test(firstText) &&
    !BULLET_RE.test(firstLine) &&
    !isTableRow(firstText) &&
    !QUESTION_RE.test(firstText)
  const title = looksLikeTitle ? extractTitle(firstLine) : deriveTitle(firstText)
  let subtitle = ''
  let bodyStart = looksLikeTitle ? firstIndex + 1 : firstIndex

  if (looksLikeTitle) {
    for (let i = firstIndex + 1; i < lines.length; i += 1) {
      if (lines[i].blank) continue
      const candidate = cleanInline(lines[i].text)
      const nextIsBlank = i + 1 >= lines.length || lines[i + 1].blank
      const structural =
        BULLET_RE.test(lines[i].text) ||
        isTableRow(candidate) ||
        isNumberedLine(candidate) ||
        QUESTION_RE.test(candidate) ||
        Boolean(matchCallout(candidate)) ||
        Boolean(headingFromText(lines[i].text)) ||
        /[.!?।]$/.test(candidate)
      if (!structural && nextIsBlank && candidate.length <= 120) {
        subtitle = candidate
        bodyStart = i + 1
      }
      break
    }
  }

  const body = lines.slice(bodyStart)
  const mcqStart = findMcqStart(body)
  const docLines = mcqStart === -1 ? body : body.slice(0, mcqStart)
  const mcqLines = mcqStart === -1 ? [] : body.slice(mcqStart)
  const mcqs = parseMcqs(mcqLines)

  const sections = parseSections(docLines, 'Overview')

  if (!sections.length) {
    const fallback = subtitle || title
    sections.push({
      id: uid('s'),
      heading: 'Overview',
      blocks: [{ id: uid('b'), type: 'lead', text: fallback }],
    })
  }

  const opening = sections[0].blocks[0]
  if (opening?.type === 'paragraph') {
    sections[0].blocks[0] = { id: opening.id, type: 'lead', text: opening.text }
  }

  return {
    title,
    eyebrow: 'STUDY NOTES',
    subtitle: subtitle || `${sections.length} sections · Direct Mode`,
    sections,
    mcqs,
  }
}

const SLIDE_MARKER_RE = /^\s*(?:slide|स्लाइड)\s*[-–—#]?\s*\d{1,3}\s*(?:[:.)\-–—]\s*(.*)|\s*)$/i

function splitByBlank(lines: SourceLine[]): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.blank) {
      if (current.length) {
        chunks.push(current)
        current = []
      }
      continue
    }
    current.push(line.text)
  }
  if (current.length) chunks.push(current)
  return chunks
}

function truncate(text: string, limit: number): string {
  const value = text.trim()
  return value.length > limit ? `${value.slice(0, limit - 1).trim()}…` : value
}

function buildSlide(lines: string[], kind: Slide['kind'], handle: string): Slide {
  const cleaned = lines.map(cleanInline).filter(Boolean)
  let headline = ''
  let subhook = ''
  let eyebrow = ''
  let cta = ''
  let numbered = false
  const points: string[] = []

  for (const line of cleaned) {
    const ctaMatch = line.match(/^(?:cta|call\s*to\s*action|कॉल\s*टू\s*एक्शन)\s*[:：]\s*(.+)$/i)
    if (ctaMatch && !cta) {
      cta = ctaMatch[1].trim()
      continue
    }
    const eyebrowMatch = line.match(/^(?:eyebrow|label|kicker|लेबल)\s*[:：]\s*(.+)$/i)
    if (eyebrowMatch && !eyebrow) {
      eyebrow = eyebrowMatch[1].trim()
      continue
    }
    if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, '').trim()
      if (item) points.push(item)
      continue
    }
    const ordered = toAsciiDigits(line).match(/^\d{1,2}[.)]\s+(.+)$/)
    if (ordered && headline) {
      points.push(ordered[1].trim())
      numbered = true
      continue
    }
    if (!headline) {
      headline = line.replace(/^(?:hook|idea|headline)\s*[:：\-–—]\s*/i, '').trim()
      continue
    }
    if (!subhook) {
      subhook = line
      continue
    }
    if (points.length < 4) points.push(line)
  }

  if (!headline && points.length) headline = points.shift() ?? ''

  // Pasted prose has no short headline; keep the deck readable instead of
  // overflowing a 1080×1350 slide with a paragraph.
  if (headline.length > 90) {
    const sentence = headline.split(/(?<=[.!?।])\s/)[0] ?? headline
    const remainder = headline.slice(sentence.length).trim()
    headline = sentence.length > 90 ? `${sentence.slice(0, 87).trim()}…` : sentence
    if (!subhook && remainder) subhook = truncate(remainder, 190)
  }
  if (subhook.length > 190) subhook = truncate(subhook, 190)

  const capped = kind === 'hook' ? [] : points.slice(0, 4).map((point) => truncate(point, 130))
  return {
    id: uid('slide'),
    kind,
    eyebrow,
    headline: headline || 'Untitled slide',
    subhook: kind === 'cta' && !subhook ? handle : subhook,
    points: capped,
    numbered,
    cta: kind === 'cta' ? cta || 'Save this post' : '',
  }
}

/** Carousel direct parser: "Slide 1" markers, otherwise blank-line blocks. */
export function parseCarouselDirect(source: string, options: { handle?: string } = {}): Carousel {
  const lines = toLines(source)
  if (!lines.some((line) => !line.blank)) {
    throw new Error('Paste some text first — Direct Mode needs content to split into slides.')
  }

  const hasMarkers = lines.some((line) => !line.blank && SLIDE_MARKER_RE.test(line.text))
  let title = ''
  let chunks: string[][]

  if (hasMarkers) {
    chunks = []
    let current: string[] = []
    let seenMarker = false

    for (const line of lines) {
      if (line.blank) continue
      if (SLIDE_MARKER_RE.test(line.text)) {
        if (seenMarker && current.length) chunks.push(current)
        if (!seenMarker && current.length) {
          const preambleTitle = current.join(' ').match(/^(?:title|शीर्षक)\s*[:：]\s*(.+)$/i)
          title = preambleTitle ? preambleTitle[1].trim() : cleanInline(current[0])
        }
        seenMarker = true
        current = []
        const rest = line.text.replace(SLIDE_MARKER_RE, '$1').trim()
        if (rest) current.push(rest)
        continue
      }
      current.push(line.text)
    }
    if (current.length) chunks.push(current)
  } else {
    chunks = splitByBlank(lines)
    if (chunks.length && /^(?:title|शीर्षक)\s*[:：]/i.test(cleanInline(chunks[0][0]))) {
      title = cleanInline(chunks[0][0]).replace(/^(?:title|शीर्षक)\s*[:：]\s*/i, '').trim()
      chunks[0] = chunks[0].slice(1)
      if (!chunks[0].length) chunks = chunks.slice(1)
    }
  }

  chunks = chunks.filter((chunk) => chunk.some((line) => cleanInline(line))).slice(0, 10)
  if (!chunks.length) {
    throw new Error('No slide content found. Add "Slide 1" markers or separate slides with blank lines.')
  }

  const handle = options.handle?.trim() ?? ''
  const slides: Slide[] = chunks.map((chunk, index) => {
    const kind: Slide['kind'] = index === 0 ? 'hook' : index === chunks.length - 1 ? 'cta' : 'idea'
    return buildSlide(chunk, kind, handle)
  })

  if (slides.length === 1) slides[0].kind = 'hook'
  const last = slides[slides.length - 1]
  if (slides.length > 1 && last.kind === 'cta' && !last.subhook && handle) last.subhook = handle

  return {
    title: (title || slides[0]?.headline || 'Untitled Carousel').slice(0, 80),
    slides,
  }
}
