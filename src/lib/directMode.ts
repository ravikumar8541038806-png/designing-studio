import { uid } from './id'
import type { CalloutKind, Carousel, DocBlock, DocSection, McqItem, PdfDoc, Slide } from '../types'

/**
 * Direct Mode: turns pasted notes (including ChatGPT/Gemini/Google AI math
 * copies, tab-separated tables, markdown, and Hindi/Devanagari notes) into
 * clean, publication-grade document & carousel structures in the browser.
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

/** Converts Unicode Mathematical Alphanumeric symbols (𝐴–𝑍, 𝑎–𝑧, 𝟎–𝟗) to ASCII. */
function normalizeMathUnicode(input: string): string {
  let out = ''
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0
    // Mathematical Bold/Italic/Sans Capitals & Lowercase ranges
    if (cp === 0x210e) {
      out += 'h'
    } else if (cp === 0x2218 || cp === 0x00b0) {
      out += '°'
    } else if (cp >= 0x1d400 && cp <= 0x1d419) {
      out += String.fromCharCode(65 + (cp - 0x1d400))
    } else if (cp >= 0x1d41a && cp <= 0x1d433) {
      out += String.fromCharCode(97 + (cp - 0x1d41a))
    } else if (cp >= 0x1d434 && cp <= 0x1d44d) {
      out += String.fromCharCode(65 + (cp - 0x1d434))
    } else if (cp >= 0x1d44e && cp <= 0x1d467) {
      out += String.fromCharCode(97 + (cp - 0x1d44e))
    } else if (cp >= 0x1d468 && cp <= 0x1d481) {
      out += String.fromCharCode(65 + (cp - 0x1d468))
    } else if (cp >= 0x1d482 && cp <= 0x1d49b) {
      out += String.fromCharCode(97 + (cp - 0x1d482))
    } else if (cp >= 0x1d5d4 && cp <= 0x1d5ed) {
      out += String.fromCharCode(65 + (cp - 0x1d5d4))
    } else if (cp >= 0x1d5ee && cp <= 0x1d607) {
      out += String.fromCharCode(97 + (cp - 0x1d5ee))
    } else if (cp >= 0x1d608 && cp <= 0x1d621) {
      out += String.fromCharCode(65 + (cp - 0x1d608))
    } else if (cp >= 0x1d622 && cp <= 0x1d63b) {
      out += String.fromCharCode(97 + (cp - 0x1d622))
    } else if (cp >= 0x1d7ce && cp <= 0x1d7d7) {
      out += String.fromCharCode(48 + (cp - 0x1d7ce))
    } else {
      out += ch
    }
  }
  return out
}

function collapseInlineMathDup(text: string): string {
  // Collapse "<expr with = or + or -> <same expr without spaces>"
  let s = text
  s = s.replace(
    /([A-Za-z0-9_()]+(?:\s*(?:[=+−\-×/]|greater than|less than)\s*[A-Za-z0-9_()[\]\s]{1,36}){1,8})\s+([A-Za-z0-9_()[\]=+−\-×/\s]{4,140})/g,
    (full, a: string, b: string) => {
      const cleanA = a.trim()
      const normA = cleanA.replace(/\s+/g, '').toLowerCase()
      const normB = b.replace(/\s+/g, '').toLowerCase()
      if (normA.length >= 4 && normB.startsWith(normA)) {
        const consumed = b.slice(0, findMatchEnd(b, normA))
        return `${cleanA}${b.slice(consumed.length)}`
      }
      return full
    },
  )
  // Collapse duplicated single/short tokens like "Savings S S" or "Imports (M M)" or "4 % 4%"
  s = s.replace(/\(\s*([A-Za-z]{1,4}|[A-Za-z]_[A-Za-z0-9]+)\s+\1\s*\)/g, '($1)')
  s = s.replace(/\b([A-Za-z]{1,3}\d?)\s+\1\b(?=\s*(?:[,.;:)]|$|\band\b|\bact\b|\bis\b|\bare\b|\bas\b|\bof\b|\bwith\b))/g, '$1')
  s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  s = s.replace(/([±]?\d+(?:\.\d+)?)\s*%\s+\1\s*%/g, '$1%')
  s = s.replace(/([±]?\d+(?:\.\d+)?)\s+%/g, '$1%')
  s = s.replace(/±\s+(\d)/g, '±$1')
  s = s.replace(/\s+°/g, '°')
  return s
}

/** Removes duplicated adjacent KaTeX formula clauses (e.g., "S+T=I+G S+T=I+G" or "FC + Tax FC+Tax"). */
function dedupeInlineClauses(text: string): string {
  // Run twice in case nested duplicates appear on one joined line (e.g. NDP=...; NNP=...)
  return collapseInlineMathDup(collapseInlineMathDup(text))
}

function findMatchEnd(str: string, compactTarget: string): number {
  let matched = 0
  for (let i = 0; i < str.length; i += 1) {
    if (/\s/.test(str[i])) continue
    if (str[i].toLowerCase() === compactTarget[matched]) {
      matched += 1
      if (matched === compactTarget.length) return i + 1
    } else {
      break
    }
  }
  return 0
}

/**
 * Cleans up KaTeX DOM copy-paste artifacts:
 * - Multi-line MathML + HTML inline tokens ("Savings \nS\nS", "4\n%\n4%", "M\n0\n\nM \n0")
 * - Multi-line block equations collapsed into "@@MATH: ...@@"
 * - Web citation chips ("Source: Made with Google AI", "+ 1")
 */
function preprocessSource(raw: string): string {
  let text = normalizeMathUnicode(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')

  // Strip "Source: Made with Google AI" and standalone "+ 1" citation badges
  text = text.replace(/\.?\s*Source:\s*Made with Google AI\b/gi, '.')
  text = text.replace(/^Made with Google AI\s*$/gim, '')
  text = text.replace(/\n[^\n]{2,80}\n\+\s*\d{1,2}\s*(?=\n|$)/g, '')
  text = text.replace(/\n\+\s*\d{1,2}\s*(?=\n|$)/g, '')

  // Fix multi-line subscripted tokens (e.g. M\n0\n\nM \n0 -> M_0, NNP\nF\nC\nNNP \nFC -> NNP_FC)
  text = text.replace(
    /\b([A-Za-z]{1,4})\s*\n\s*([0-4]|MP|FC|BP)\s*\n+\s*\1\s*\n+\s*\2\b/g,
    '$1_$2',
  )
  text = text.replace(/\bNNP\s*\n\s*F\s*\n\s*C\s*\n\s*NNP\s*\n\s*FC\b/g, 'NNP_FC')
  text = text.replace(/\bGDP\s*\n\s*M\s*\n\s*P\b(?=\s*\n+\s*(?:=|GDP\s*MP))/g, 'GDP_MP')
  text = text.replace(/\bGDP\s*\n+\s*MP\b/g, 'GDP_MP')

  // Fix multi-line comparisons ("REER greater than \n100\nREER greater than 100")
  text = text.replace(/([A-Za-z]+\s+(?:greater|less)\s+than)\s*\n\s*(\d+(?:\.\d+)?)\s*\n\s*\1\s+\2\b/gi, '$1 $2')

  // Fix multi-line percentage / degree tokens ("4\n%\n4%", "±\n2\n%\n±2%", "45 \n°\n line")
  text = text.replace(/([(\s,])\n([±]?\d+(?:\.\d+)?)\n%\n\2%/g, '$1$2%')
  text = text.replace(/([(\s,])\n±\n(\d+(?:\.\d+)?)\n%\n±\2%/g, '$1±$2%')
  text = text.replace(/\n([±]?\d+(?:\.\d+)?)\n%\n\1%/g, ' $1%')
  text = text.replace(/\n±\n(\d+(?:\.\d+)?)\n%\n±\1%/g, ' ±$1%')
  text = text.replace(/(\d+(?:\.\d+)?)\s*\n\s*°\s*\n+\s*/g, '$1° ')
  text = text.replace(/(\d+)\s*\n\s*°/g, '$1°')

  // Fix multi-line inline variable duplicates: "(\nM\nM)" or "Savings \nS\nS" or "Ratio (\nm\nm)"
  text = text.replace(/\(\s*\n\s*([A-Za-z]{1,4})\s*\n\s*\1\s*\n*\s*\)/g, '($1)')
  text = text.replace(/([A-Za-z\s(])\n([A-Za-z]{1,4}|[A-Za-z]_[A-Za-z0-9]+)\n\2(?=[)\s.,;:—–\n]|$)/g, '$1$2')
  text = text.replace(/\n([A-Za-z]{1,3})\n\1\s*\n/g, ' $1 ')

  // Collapse known multi-line display equation shapes into clean @@MATH: ...@@ lines
  // 1) GDP Deflator fraction block
  text = text.replace(
    /GDP\s+Deflator\s*\n=\s*\n\(\s*\nNominal\s+GDP\s*\nReal\s+GDP\s*\n\)\s*\n×\s*\n100[\s\S]{0,120}?×\s*100/gi,
    '\n@@MATH: \\text{GDP Deflator} = \\left(\\frac{\\text{Nominal GDP}}{\\text{Real GDP}}\\right) \\times 100@@\n',
  )
  // 2) Money Multiplier fraction block
  text = text.replace(
    /m\s*\n=\s*\nM\s*\n3\s*\nM\s*\n0\s*\n=\s*\n1\s*\n\+\s*\nc\s*\nr\s*\n\+\s*\nc[\s\S]{0,120}?1\s*\+\s*c/gi,
    '\n@@MATH: m = \\frac{M_3}{M_0} = \\frac{1 + c}{r + c}@@\n',
  )

  // Rejoin lines fractured around KaTeX MathML operators (=, +, −, ×, (, ), %, ±)
  const rawLines = text.split('\n')
  const mergedLines: string[] = []
  const OP_ONLY_RE = /^(?:[=+−\-×/()±%]|°)$/
  const STARTS_OP_RE = /^[=+−\-×)]/
  const ENDS_UNCLOSED_OP_RE = /(?:[=+−\-×(]|GDP_MP)\s*$/

  const isMathOpWrapped = (idx: number): boolean => {
    const cur = rawLines[idx]?.trim() ?? ''
    if (!cur || rawLines[idx].includes('\t')) return false
    if (cur.startsWith('@@MATH:')) return false
    const next = rawLines[idx + 1]?.trim() ?? ''
    const next2 = rawLines[idx + 2]?.trim() ?? ''
    const openParens = (cur.match(/\(/g)?.length ?? 0) - (cur.match(/\)/g)?.length ?? 0)
    if (openParens > 0 && next && !rawLines[idx + 1].includes('\t')) return true
    if (OP_ONLY_RE.test(cur)) return true
    if (ENDS_UNCLOSED_OP_RE.test(cur) && next && !rawLines[idx + 1].includes('\t')) return true
    if (next && (OP_ONLY_RE.test(next) || STARTS_OP_RE.test(next)) && !rawLines[idx + 1].includes('\t')) return true
    if (!next && next2 && STARTS_OP_RE.test(next2) && !rawLines[idx + 2].includes('\t')) return true
    return false
  }

  let i = 0
  while (i < rawLines.length) {
    if (isMathOpWrapped(i)) {
      let buf = rawLines[i].trim()
      i += 1
      while (i < rawLines.length) {
        const cur = rawLines[i]
        const trimmed = cur.trim()
        if (cur.includes('\t')) break
        if (!trimmed) {
          // Bridge blank line only if next non-blank line continues with operator or closing paren
          const nextNonBlank = rawLines[i + 1]?.trim() ?? ''
          if (STARTS_OP_RE.test(nextNonBlank) || OP_ONLY_RE.test(nextNonBlank)) {
            i += 1
            continue
          }
          break
        }
        const needBridge =
          OP_ONLY_RE.test(trimmed) ||
          STARTS_OP_RE.test(trimmed) ||
          ENDS_UNCLOSED_OP_RE.test(buf) ||
          OP_ONLY_RE.test(buf.slice(-1)) ||
          (buf.split('(').length > buf.split(')').length && trimmed.length <= 90)
        if (!needBridge && !(trimmed.includes('=') && trimmed.length <= 120) && !(/^[A-Za-z0-9_]+[-+−=×]/.test(trimmed) && buf.length < 240)) {
          break
        }
        const joiner =
          buf.endsWith('(') || /^[),.;:%]/.test(trimmed) ? '' : ' '
        buf = `${buf}${joiner}${trimmed}`
        i += 1
        // Once a sentence closes cleanly outside parentheses, stop merging
        if (/[.!?)]$/.test(buf) && buf.split('(').length <= buf.split(')').length && !ENDS_UNCLOSED_OP_RE.test(buf)) {
          const peek = rawLines[i]?.trim() ?? ''
          if (!OP_ONLY_RE.test(peek) && !STARTS_OP_RE.test(peek)) break
        }
      }
      const cleaned = dedupeInlineClauses(buf)
        .replace(/\s*\.\s*$/, (m) => m.trim())
        .replace(/^(@@MATH:.*?@@)$/i, '$1')
      // Promote clean standalone equation lines (without colon prose) to @@MATH: ...@@
      if (
        !cleaned.startsWith('@@MATH:') &&
        !/^[^:]{2,52}:/.test(cleaned) &&
        !/^\(Where\b/i.test(cleaned) &&
        !/^\([^)]+\)\.?$/.test(cleaned) &&
        cleaned.length <= 96 &&
        cleaned.split(/\s+/).length <= 16 &&
        (/[=×]/.test(cleaned) ||
          (/^(?:[A-Za-z0-9_()]+(?:\s+[A-Za-z0-9_()]+){0,4})\s*[−-]\s*(?:\(?[A-Za-z0-9_()]+(?:\s+[A-Za-z0-9_()]+){0,6}\)?)$/.test(cleaned) &&
            !cleaned.includes('.')))
      ) {
        mergedLines.push(`@@MATH: ${formatEquation(cleaned.replace(/\s*[;.]$/, ''))}@@`)
      } else {
        mergedLines.push(cleaned)
      }
      continue
    }

    mergedLines.push(dedupeInlineClauses(rawLines[i]))
    i += 1
  }

  let joined = mergedLines.join('\n')
  joined = joined.replace(/\(\s*\n+\s*([^)\n]{1,30})\s*\n+\s*\)/g, '($1)')
  joined = joined.replace(/\n{3,}/g, '\n\n')
  return joined
}

function formatEquation(raw: string): string {
  return raw
    .replace(/\s*=\s*/g, ' = ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s*[−-]\s*/g, ' - ')
    .replace(/\s*×\s*/g, ' × ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toLatex(expr: string): string {
  if (expr.includes('\\frac') || expr.includes('\\text')) return expr
  return expr
    .replace(/×/g, '\\times ')
    .replace(/±/g, '\\pm ')
    .replace(/−/g, '-')
    .replace(/\b([A-Za-z]+)_([A-Za-z0-9]+)\b/g, '$1_{$2}')
    .replace(/\bM([0-4])\b/g, 'M_{$1}')
    .replace(/\bNNP\s*FC\b/g, '\\text{NNP}_{FC}')
    .replace(/\bGDP\s*MP\b/g, '\\text{GDP}_{MP}')
    .replace(/\b(Nominal GDP|Real GDP|Gross Value Added|Value of Output|Intermediate Consumption|Compensation of Employees|Operating Surplus|Mixed Income|Revenue Expenditure|Revenue Receipts|Total Expenditure|Fiscal Deficit|Interest Payments|Net Product Taxes|Production Taxes|Production Subsidies|Product Taxes|Product Subsidies|GVA at Basic Prices|GDP at Market Prices|Depreciation)\b/g, '\\text{$1}')
}

interface SourceLine {
  raw: string
  text: string
  blank: boolean
  hasTab: boolean
}

function toLines(source: string): SourceLine[] {
  return source.split('\n').map((raw) => {
    const trimmed = raw.trim()
    return {
      raw,
      text: trimmed,
      blank: !trimmed,
      hasTab: raw.includes('\t'),
    }
  })
}

function cleanInline(raw: string): string {
  return raw
    .replace(/^\s*>\s?/, '')
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

const BULLET_RE = /^\s*(?:[-•*·▪◦‣–—]|\(\d+\))\s+/
const NUMBERED_DONE_RE = /^\d{1,3}[.)]\s+\S/
const CHAPTER_HEAD_RE = /^\s*(?:(?:#{1,3}\s+)|(?:\d{1,2}\.\s+[A-Z\p{L}]))/u
const TABLE_SEPARATOR_CELL = /^:?-{2,}:?$/

const QUESTION_RE = /^(?:q(?:uestion)?|प्रश्न|प्र)\s*[.:\-–—]?\s*(\d{1,3})\s*[.):\-–—]\s*(.+)$/i
const OPTION_RE = /^\(?([a-dA-Dक-घ])\s*[).:：\-–—]\s+(.+)$/
const ANSWER_RE = /^(?:answer|ans|correct\s*answer|उत्तर|सही\s+उत्तर|जवाब)\s*[:：\-–—]?\s*(.+)$/i
const EXPLAIN_RE = /^(?:explanation|reason|why|व्याख्या|कारण|स्पष्टीकरण)\s*[:：\-–—]?\s*(.+)$/i

const CALLOUT_WORDS =
  /^(?:exam\s+important|exam\s+points?|important\s+(?:points?|questions?|notes?)|important|key\s+facts?|key\s+points?|key\s+takeaways?|must\s+remember|remember\s+this|prelims\s+trap|upsc\s+current\s+update(?:\s*\([^)]+\))?|pro\s+tip|note|notes|tip|caution|warning|fact|facts|summary|महत्वपूर्ण\s+बिंदु|महत्वपूर्ण|परीक्षा\s+महत्वपूर्ण|परीक्षा\s+बिंदु|परीक्षा|मुख्य\s+बिंदु|याद\s+रखें|ध्यान\s+दें|नोट|तथ्य|परिभाषा|सारांश)$/i

function isPipeTableRow(text: string): boolean {
  const value = cleanInline(text)
  return value.includes('|') && value.replace(/\|/g, '').trim().length > 0
}

function splitPipeRow(text: string): string[] {
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
  if (value.startsWith('@@MATH:')) return null
  const labelled = value.match(/^(.{2,54}?)\s*[:：]\s*(.+)$/)
  if (labelled && CALLOUT_WORDS.test(labelled[1].trim())) {
    return { label: labelled[1].trim(), rest: labelled[2].trim() }
  }
  if (CALLOUT_WORDS.test(value)) return { label: value, rest: '' }
  return null
}

function calloutKind(label: string): CalloutKind {
  const lower = label.toLowerCase()
  if (/prelims|exam|upsc|परीक्षा|महत्वपूर्ण|याद/.test(lower)) return 'exam'
  if (/warn|trap|caution/.test(lower)) return 'warning'
  if (/tip|ध्यान/.test(lower)) return 'tip'
  if (/note|नोट/.test(lower)) return 'note'
  if (/summary|सारांश/.test(lower)) return 'summary'
  return 'fact'
}

function calloutTitle(label: string): string {
  const lower = label.toLowerCase().replace(/\s+/g, ' ').trim()
  if (/prelims\s+trap/.test(lower)) return 'Prelims Trap'
  if (/upsc\s+current\s+update/.test(lower)) return label.trim()
  if (/^(exam\s+important|exam\s+points?)$/.test(lower)) return 'Exam Important'
  if (/^important/.test(lower)) return 'Important'
  if (/^key\s+facts?$/.test(lower)) return 'Key Facts'
  if (/^key\s+points?$/.test(lower)) return 'Key Points'
  if (/^key\s+takeaways?$/.test(lower)) return 'Key Takeaways'
  if (/^(must\s+remember|remember\s+this|याद\s+रखें)$/.test(lower)) return 'Remember'
  if (/^(notes?|नोट)$/.test(lower)) return 'Note'
  if (/^(tip|pro\s+tip|caution|warning)$/.test(lower)) return 'Tip'
  return label.replace(/[:：\-–—]\s*$/, '').trim()
}

function isChapterHeading(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 96) return null
  if (trimmed.includes('\t') || trimmed.includes('|')) return null
  if (/^\s*#{1,3}\s+\S/.test(trimmed)) return cleanInline(trimmed)
  const numberedChapter = toAsciiDigits(trimmed).match(/^(\d{1,2}\.\s+[A-Z\p{L}].{2,80})$/u)
  if (numberedChapter && !/[.,;!?]$/.test(trimmed)) {
    return cleanInline(numberedChapter[1])
  }
  return null
}

/**
 * Detects a true standalone subheading (e.g. "Circular Flow of Income",
 * "Core Macroeconomic Aggregates", "Phillips Curve"), strictly rejecting
 * equations, single symbols, short acronyms, and trailing punctuation.
 */
function isSubheading(lines: SourceLine[], index: number): string | null {
  const line = lines[index]
  if (line.blank || line.hasTab) return null
  const raw = line.raw
  const text = cleanInline(line.text)
  if (!text || text.length < 4 || text.length > 82) return null
  if (text.startsWith('@@MATH:') || BULLET_RE.test(raw) || isPipeTableRow(text)) return null
  if (QUESTION_RE.test(text) || OPTION_RE.test(text) || ANSWER_RE.test(text) || EXPLAIN_RE.test(text)) return null
  if (matchCallout(text)) return null

  // Reject equations, math fragments, stray punctuation, and single short acronyms (GNP, GDP, NNP)
  if (/[=+*/<>]/.test(text)) return null
  if (/^[^A-Za-z\p{L}]+$/u.test(text)) return null
  if (/^[A-Z0-9_]{1,6}$/.test(text)) return null
  if (/[.!?।,;]$/.test(text)) return null
  if (isNumberedLine(text)) return null

  // Reject "Term: Definition" lines (anything with a colon followed by > 28 chars)
  const colonIdx = text.indexOf(':')
  if (colonIdx > 0 && text.length - colonIdx > 24) return null

  // Must look like a title (at least 2 words or a known single-word heading, starting with uppercase/Devanagari)
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2 && text.length < 8) return null
  if (!/^[A-Z\p{Script=Devanagari}]/u.test(text)) return null

  // Must be followed by content (or separated by a blank line from content)
  const next = lines.slice(index + 1, index + 3).find((l) => !l.blank)
  if (!next) return null
  if (next.text.length <= 3) return null

  return text.replace(/[:：]\s*$/, '').trim()
}

function isStandaloneEquation(text: string): string | null {
  const clean = text.trim()
  if (clean.startsWith('@@MATH:') && clean.endsWith('@@')) {
    return clean.slice(7, -2).trim()
  }
  if (clean.length >= 5 && clean.length <= 90 && !/[.!?]$/.test(clean) && /=/.test(clean) && !/:/.test(clean)) {
    // Exclude plain prose sentences containing '='
    const words = clean.split(/\s+/).length
    if (words <= 14) return clean
  }
  return null
}

function tableBlock(columns: string[], bodyRows: string[][], caption = ''): DocBlock | null {
  if (columns.length < 2 || !bodyRows.length) return null
  const width = Math.min(columns.length, 6)
  const cleanCols = columns.slice(0, width)
  const cleanRows = bodyRows
    .map((row) => {
      const cells = row.slice(0, width)
      while (cells.length < width) cells.push('')
      return cells
    })
    .filter((row) => row.some(Boolean))
  if (!cleanRows.length) return null
  return { id: uid('b'), type: 'table', caption, columns: cleanCols, rows: cleanRows.slice(0, 16) }
}

/**
 * Parses tab-separated tables including rowspan continuation rows
 * (rows with width - 1 columns) and multi-line cell paragraphs.
 */
function parseTabTable(
  lines: SourceLine[],
  startIndex: number,
  caption: string,
): { block: DocBlock | null; nextIndex: number } {
  const headerCells = lines[startIndex].raw.split('\t').map((c) => cleanInline(c)).filter((c, i, arr) => i < arr.length - 1 || Boolean(c))
  const width = headerCells.length
  if (width < 2) return { block: null, nextIndex: startIndex + 1 }

  const rows: string[][] = []
  let i = startIndex + 1
  let lastCategory = ''

  while (i < lines.length) {
    const line = lines[i]
    if (line.blank) {
      // Look ahead past blank lines: if next non-blank line is part of an active multi-line cell (e.g. "2. Invisibles:")
      let look = i + 1
      while (look < lines.length && lines[look].blank) look += 1
      if (look >= lines.length) break
      const nextLine = lines[look]
      const curRow = rows[rows.length - 1]
      const inIncompleteNumberedRow = Boolean(curRow && curRow[width - 1] === '' && /^\d+\.\s/.test(nextLine.text))
      if (!inIncompleteNumberedRow && isChapterHeading(nextLine.text)) break
      // If next line has tabs, continue parsing rows; if it starts with a numbered sub-item or continues an open row
      if (nextLine.hasTab) {
        i = look
        continue
      }
      if (inIncompleteNumberedRow || (curRow && curRow[width - 1] === '' && !isSubheading(lines, look))) {
        i = look
        continue
      }
      break
    }

    const curRowCheck = rows[rows.length - 1]
    const inIncompleteNumberedLine = Boolean(curRowCheck && curRowCheck[width - 1] === '' && /^\d+\.\s/.test(line.text))
    if (!inIncompleteNumberedLine && isChapterHeading(line.text)) break

    if (line.hasTab) {
      const rawParts = line.raw.split('\t').map((c) => cleanInline(c))
      // Handle trailing tab where the rest of the cell sits on subsequent lines
      if (rawParts.length === width - 1 && !line.raw.endsWith('\t')) {
        // Merged first-column continuation row (like Quantitative (General) spanning multiple rows)
        rows.push([lastCategory ? '' : '', ...rawParts])
      } else {
        const padded = rawParts.slice(0, width)
        while (padded.length < width) padded.push('')
        if (padded[0]) lastCategory = padded[0]
        rows.push(padded)
      }
      i += 1
      continue
    }

    // Line has no tab: check if it's a subheading ending the table, or continuation text for the previous row's open cell
    if (isSubheading(lines, i) && rows.length > 0 && rows[rows.length - 1].every((c) => Boolean(c))) {
      break
    }
    if (rows.length > 0) {
      const curRow = rows[rows.length - 1]
      // Numbered cell items (1. Visible..., 2. Invisibles..., 4. RTP...) belong inside column 1!
      if (width >= 3 && /^\d+\.\s/.test(line.text)) {
        curRow[1] = curRow[1] ? `${curRow[1]}\n${line.text}` : line.text
      } else if (width === 3 && curRow[1] && !curRow[2]) {
        // Notes/commentary line fills the third column when empty
        curRow[2] = line.text
      } else {
        const emptyIdx = curRow.findIndex((c, idx) => idx > 0 && !c)
        const targetIdx = emptyIdx !== -1 ? emptyIdx : width - 1
        curRow[targetIdx] = curRow[targetIdx] ? `${curRow[targetIdx]}\n${line.text}` : line.text
      }
      i += 1
      continue
    }
    break
  }

  return { block: tableBlock(headerCells, rows, caption), nextIndex: i }
}

/** Collects consecutive short "Term: Definition" lines into a clean glossary card. */
function collectKeyTerms(lines: SourceLine[], index: number): { items: { term: string; definition: string }[]; next: number } {
  const items: { term: string; definition: string }[] = []
  let cursor = index
  while (cursor < lines.length) {
    if (lines[cursor].blank) {
      // Allow single blank line between consecutive Term: Definition paragraphs
      if (cursor + 1 < lines.length && !lines[cursor + 1].blank) {
        cursor += 1
      } else {
        break
      }
    }
    const raw = lines[cursor].raw
    const text = cleanInline(lines[cursor].text)
    if (text.startsWith('@@MATH:')) break
    if (BULLET_RE.test(raw) || lines[cursor].hasTab || isPipeTableRow(text) || isNumberedLine(text) || matchCallout(text)) break
    const match = text.match(/^([^:：]{2,48})\s*[:：]\s*(.{6,})$/)
    if (!match) break
    const term = match[1].trim()
    const def = match[2].trim()
    if (/[.!?।]$/.test(term) || def.length > 260) break
    items.push({ term, definition: def })
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

function formatLeadTerm(text: string): string {
  if (text.startsWith('@@MATH:')) return text
  const m = text.match(/^([^:：]{2,52})\s*[:：]\s*(.+)$/)
  if (m && !/[.!?]$/.test(m[1])) {
    return `**${m[1].trim()}:** ${m[2].trim()}`
  }
  return text
}

/** Collects blank-separated short single-line list items right after a colon-ended lead paragraph (e.g. "Impossible Trinity: ... all three:"). */
function collectSparseList(lines: SourceLine[], index: number, prevBlock: DocBlock | undefined): { items: string[]; next: number } {
  if (prevBlock?.type !== 'paragraph' || !prevBlock.text.trim().endsWith(':')) {
    return { items: [], next: index }
  }
  const items: string[] = []
  let cursor = index
  while (cursor < lines.length) {
    if (lines[cursor].blank) {
      cursor += 1
      continue
    }
    const text = cleanInline(lines[cursor].text)
    if (
      !text ||
      text.length > 64 ||
      /[.!?]$/.test(text) ||
      text.startsWith('(') ||
      text.startsWith('@@MATH:') ||
      lines[cursor].hasTab ||
      isPipeTableRow(text) ||
      Boolean(isChapterHeading(lines[cursor].text)) ||
      Boolean(matchCallout(text))
    ) {
      break
    }
    items.push(text)
    cursor += 1
    if (items.length >= 6) break
  }
  if (items.length < 2) return { items: [], next: index }
  return { items, next: cursor }
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

    const raw = lines[i].raw
    const text = cleanInline(lines[i].text)

    // 1. Major chapter heading -> starts a new DocSection
    const chapter = isChapterHeading(lines[i].text)
    if (chapter) {
      flush()
      heading = chapter
      i += 1
      continue
    }

    // 2. Tab-separated table (with optional preceding subheading used as caption)
    if (lines[i].hasTab) {
      let caption = ''
      const prev = blocks[blocks.length - 1]
      if (prev?.type === 'subheading') {
        caption = prev.text
      }
      const { block, nextIndex } = parseTabTable(lines, i, caption)
      if (block) {
        blocks.push(block)
        i = nextIndex
        continue
      }
    }

    // 3. Pipe tables
    if (isPipeTableRow(text)) {
      const rows: string[][] = []
      while (i < lines.length && !lines[i].blank && isPipeTableRow(lines[i].text)) {
        const cells = splitPipeRow(lines[i].text)
        if (!cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell))) rows.push(cells)
        i += 1
      }
      const table = rows.length >= 2 ? tableBlock(rows[0], rows.slice(1)) : null
      if (table) blocks.push(table)
      else if (text) blocks.push({ id: uid('b'), type: 'paragraph', text })
      continue
    }

    // 4. Equations -> crisp KaTeX math block (deduplicate back-to-back identical formulas)
    const eq = isStandaloneEquation(text)
    if (eq) {
      const latex = toLatex(eq)
      const prevBlock = blocks[blocks.length - 1]
      const norm = (v: string) => v.replace(/\\text\{([^}]*)\}/g, '$1').replace(/[\s{}().]+/g, '').toLowerCase()
      if (prevBlock?.type !== 'math' || norm(prevBlock.latex) !== norm(latex)) {
        blocks.push({
          id: uid('math'),
          type: 'math',
          title: '',
          latex,
          note: '',
          layout: 'card',
          items: [{ id: uid('f'), label: '', latex }],
        })
      }
      i += 1
      continue
    }

    // 5. Callouts ("Prelims Trap:", "UPSC Current Update", "Exam Important:")
    const callout = matchCallout(text)
    if (callout) {
      const parts: string[] = callout.rest ? [callout.rest] : []
      i += 1
      if (!callout.rest) {
        while (i < lines.length && !lines[i].blank) {
          const nextText = cleanInline(lines[i].text)
          if (lines[i].hasTab || isPipeTableRow(nextText) || matchCallout(nextText) || isChapterHeading(lines[i].text)) break
          if (isSubheading(lines, i)) break
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

    // 6. Sparse list right after a colon-ended intro ("...all three:")
    const sparse = collectSparseList(lines, i, blocks[blocks.length - 1])
    if (sparse.items.length >= 2) {
      blocks.push({ id: uid('b'), type: 'bullets', items: sparse.items })
      i = sparse.next
      continue
    }

    // 7. Subheadings inside the current section
    const subheading = isSubheading(lines, i)
    if (subheading) {
      // If no section has started yet and this is the very first line, promote it to section heading
      if (!heading && !blocks.length && !sections.length) {
        heading = subheading
      } else {
        blocks.push({ id: uid('b'), type: 'subheading', text: subheading })
      }
      i += 1
      continue
    }

    // 7. Key terms glossary card (2+ consecutive "Term: Definition" lines)
    const terms = collectKeyTerms(lines, i)
    if (terms.items.length >= 2) {
      blocks.push({ id: uid('b'), type: 'keyterms', items: terms.items })
      i = terms.next
      continue
    }

    // 8. Bullet lists
    if (BULLET_RE.test(raw)) {
      const items: string[] = []
      while (i < lines.length && !lines[i].blank && BULLET_RE.test(lines[i].raw)) {
        const item = cleanInline(lines[i].text).replace(BULLET_RE, '').trim()
        if (item) items.push(item)
        i += 1
      }
      if (items.length) blocks.push({ id: uid('b'), type: 'bullets', items: items.slice(0, 8) })
      continue
    }

    // 9. Numbered lists
    if (isNumberedRun(lines, i)) {
      const items: string[] = []
      while (i < lines.length && !lines[i].blank && isNumberedLine(lines[i].text)) {
        const match = toAsciiDigits(cleanInline(lines[i].text)).match(/^\d{1,3}[.)]\s*(.+)$/)
        if (match) items.push(match[1].trim())
        i += 1
      }
      if (items.length) blocks.push({ id: uid('b'), type: 'numbered', items: items.slice(0, 8) })
      continue
    }

    // 10. Regular paragraph (with bolded Term: prefix when present)
    const parts: string[] = []
    while (i < lines.length && !lines[i].blank) {
      const line = lines[i]
      if (
        line.hasTab ||
        BULLET_RE.test(line.raw) ||
        isPipeTableRow(line.text) ||
        matchCallout(cleanInline(line.text)) ||
        isChapterHeading(line.text) ||
        isStandaloneEquation(line.text)
      ) {
        break
      }
      if (parts.length && (isNumberedLine(line.text) || isSubheading(lines, i))) break
      const clean = cleanInline(line.text)
      if (clean) parts.push(clean)
      i += 1
    }
    if (parts.length) {
      const joined = formatLeadTerm(parts.join(' '))
      blocks.push({ id: uid('b'), type: 'paragraph', text: joined })
    } else {
      i += 1
    }
  }

  flush()
  return sections
}

function inferDocumentTitle(source: string, sections: DocSection[]): { title: string; eyebrow: string; subtitle: string } {
  const sample = `${source.slice(0, 2500)} ${sections.map((s) => s.heading).join(' ')}`
  const chapterCount = sections.length

  if (/\b(national income|gdp|monetary policy|inflation|budget|balance of payments|macroeconomic)\b/i.test(sample)) {
    return {
      title: 'Macroeconomics & Indian Economy',
      eyebrow: 'REVISION COMPENDIUM',
      subtitle: `${chapterCount} Chapters · Concepts, Formulas & High-Yield Reference Tables`,
    }
  }
  if (/\b(climate change|global warming|greenhouse|carbon|renewable)\b/i.test(sample)) {
    return {
      title: 'Global Climate Change & Sustainability',
      eyebrow: 'RESEARCH BRIEF',
      subtitle: `${chapterCount} Sections · Drivers, Impacts & Policy Solutions`,
    }
  }
  if (chapterCount > 1) {
    const first = sections[0].heading.replace(/^\d+\.\s*/, '')
    const last = sections[sections.length - 1].heading.replace(/^\d+\.\s*/, '')
    return {
      title: `${first} & Core Modules`,
      eyebrow: 'STUDY GUIDE',
      subtitle: `${chapterCount} Sections · From ${first} to ${last}`,
    }
  }
  const firstHeading = sections[0]?.heading || 'Structured Notes'
  return {
    title: firstHeading.replace(/^\d+\.\s*/, ''),
    eyebrow: 'STUDY NOTES',
    subtitle: `${sections.length} structured sections · Key takeaways & reference`,
  }
}

function extractTitle(raw: string): string {
  const text = cleanInline(raw).replace(/^(?:title|शीर्षक)\s*[:：\-–—]\s*/i, '').trim()
  return text || 'Untitled Notes'
}

function deriveTitle(text: string): string {
  const sentence = text.split(/(?<=[.!?।])\s/)[0] ?? text
  const short = sentence.length > 72 ? `${sentence.slice(0, 69).trim()}…` : sentence
  return short || 'Untitled Notes'
}

/** Document/PDF direct parser. */
export function parseDocDirect(source: string): PdfDoc {
  const preprocessed = preprocessSource(source)
  const lines = toLines(preprocessed)
  const firstIndex = lines.findIndex((line) => !line.blank)
  if (firstIndex === -1) {
    throw new Error('Paste some notes first — Direct Mode needs text to structure.')
  }

  const firstLine = lines[firstIndex].text
  const firstChapter = isChapterHeading(firstLine)
  const hasMultipleChapters = lines.filter((l) => !l.blank && Boolean(isChapterHeading(l.text))).length >= 2

  let title = ''
  let subtitle = ''
  let eyebrow = 'STUDY NOTES'
  let bodyStart = firstIndex

  // If the pasted notes start straight into numbered chapters ("1. National Income Accounting"),
  // keep chapter 1 in the body and synthesize an overarching document title!
  if (!hasMultipleChapters && !firstChapter) {
    const firstText = cleanInline(firstLine)
    const looksLikeTitle =
      firstText.length <= 90 &&
      !/[.!?।]$/.test(firstText) &&
      !BULLET_RE.test(lines[firstIndex].raw) &&
      !lines[firstIndex].hasTab &&
      !isPipeTableRow(firstText) &&
      !QUESTION_RE.test(firstText)
    title = looksLikeTitle ? extractTitle(firstLine) : deriveTitle(firstText)
    bodyStart = looksLikeTitle ? firstIndex + 1 : firstIndex

    if (looksLikeTitle) {
      for (let i = firstIndex + 1; i < lines.length; i += 1) {
        if (lines[i].blank) continue
        const candidate = cleanInline(lines[i].text)
        const nextIsBlank = i + 1 >= lines.length || lines[i + 1].blank
        const structural =
          BULLET_RE.test(lines[i].raw) ||
          lines[i].hasTab ||
          isPipeTableRow(candidate) ||
          isNumberedLine(candidate) ||
          QUESTION_RE.test(candidate) ||
          Boolean(matchCallout(candidate)) ||
          Boolean(isChapterHeading(lines[i].text)) ||
          /[.!?।]$/.test(candidate)
        if (!structural && nextIsBlank && candidate.length <= 120) {
          subtitle = candidate
          bodyStart = i + 1
        }
        break
      }
    }
  }

  const body = lines.slice(bodyStart)
  const mcqStart = findMcqStart(body)
  const docLines = mcqStart === -1 ? body : body.slice(0, mcqStart)
  const mcqLines = mcqStart === -1 ? [] : body.slice(mcqStart)
  const mcqs = parseMcqs(mcqLines)

  const sections = parseSections(docLines, 'Overview')

  if (!sections.length) {
    const fallback = subtitle || title || 'Paste notes to format.'
    sections.push({
      id: uid('s'),
      heading: 'Overview',
      blocks: [{ id: uid('b'), type: 'lead', text: fallback }],
    })
  }

  // Promote opening paragraph of section 1 to a crisp lead block
  const opening = sections[0].blocks[0]
  if (opening?.type === 'paragraph') {
    sections[0].blocks[0] = { id: opening.id, type: 'lead', text: opening.text }
  }

  if (!title) {
    const inferred = inferDocumentTitle(preprocessed, sections)
    title = inferred.title
    eyebrow = inferred.eyebrow
    subtitle = inferred.subtitle
  } else if (!subtitle) {
    subtitle = `${sections.length} structured sections · Key takeaways & tables`
  }

  return {
    title,
    eyebrow,
    subtitle,
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

export function parseCarouselDirect(source: string, options: { handle?: string } = {}): Carousel {
  const preprocessed = preprocessSource(source)
  const lines = toLines(preprocessed)
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
