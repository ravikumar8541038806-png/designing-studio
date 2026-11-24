import type { BrandPreset, LanguageId } from '../types'
import { languagePreset } from '../theme/presets'

const PDF_SCHEMA = `{
  "title": "string — document title, max 12 words",
  "eyebrow": "string — 2 to 4 words in CAPS, e.g. STUDY NOTES",
  "subtitle": "string — one line of context, max 18 words",
  "sections": [
    {
      "heading": "string — section title, max 8 words",
      "blocks": [ Block, ... ]
    }
  ],
  "mcqs": [ Mcq, ... ]
}`

const BLOCK_SCHEMA = `Block is EXACTLY one of these objects:
{"type":"lead","text":"string — 1 to 3 sentence opening line for a section"}
{"type":"paragraph","text":"string — wrap 1 to 3 key terms in **double asterisks**"}
{"type":"subheading","text":"string — short sub-topic label"}
{"type":"bullets","items":["string","string"]}
{"type":"numbered","items":["string","string"]}
{"type":"keyterms","items":[{"term":"string","definition":"string"}]}
{"type":"table","caption":"string","columns":["string"],"rows":[["string"]]}
{"type":"callout","kind":"fact|exam|note","title":"string","body":"string"}
{"type":"quote","text":"string","cite":"string"}`

const MCQ_SCHEMA = `Mcq is: {"question":"string","options":["four distinct option strings"],"answer":"the exact text of the correct option","explanation":"string — one or two sentences"}`

export function docSystemPrompt(): string {
  return [
    'You are a senior academic editor producing print-ready study notes.',
    'Structure the supplied text faithfully and concisely: keep its order, facts and terminology, and do not pad, editorialise, or rewrite every paragraph into a long essay.',
    'Compress, never expand — each paragraph is 1 to 3 short sentences, and a table, bullet list or key-term block replaces prose wherever it says the same thing.',
    'Answer with one valid JSON object and nothing else: no prose, no markdown fences, no comments, no trailing commas. Never invent citations, page numbers or statistics.',
  ].join(' ')
}

export function docUserPrompt(input: {
  source: string
  language: LanguageId
  depth: number
  includeMcqs: boolean
  brand: BrandPreset
}): string {
  const depthRules =
    input.depth <= 1
      ? 'DEPTH: revision sheet. 3 to 5 sections, 2 to 4 short blocks per section.'
      : input.depth >= 3
        ? 'DEPTH: teaching chapter. 5 to 7 sections, 3 to 5 blocks per section, one worked example only where it earns its space.'
        : 'DEPTH: balanced chapter. 4 to 6 sections, 2 to 5 short blocks per section.'

  const mcqRule = input.includeMcqs
    ? 'Include 4 to 8 MCQs in "mcqs" with exactly four options each. Put the exact correct option text in "answer" (not a letter). Every question must be answerable from the notes.'
    : 'Set "mcqs" to an empty array [].'

  return `Convert the SOURCE MATERIAL into a structured, print-ready study document.

OUTPUT FORMAT — return only JSON matching this schema:
${PDF_SCHEMA}

${BLOCK_SCHEMA}

${MCQ_SCHEMA}

STRUCTURE RULES
- ${depthRules}
- Section 1 must open with a "lead" block that frames why this topic matters.
- Organise the source into its own logical sections. Do not use generic headings like "Introduction" or "Conclusion" unless the source is truly introductory.
- Use a "table" block whenever the material contains anything comparative, numeric, staged or grouped. 2 to 6 columns and 2 to 8 rows only.
- Use "callout" blocks for memorable facts and exam-critical points. "${'fact'}" for surprising facts, "${'exam'}" for marks-scoring points, "${'note'}" for cautions. Include at least one "fact" callout and, for academic material, at least two "exam" callouts.
- Use "keyterms" for 2 to 5 term/definition pairs per section where vocabulary matters.
- Use "numbered" only for real sequences (stages, steps, processes). Use "bullets" otherwise, with 2 to 5 items.
- Bold between one and three key terms per paragraph using **double asterisks**, and never bold whole sentences.
- ${mcqRule}
- Do not repeat the document title inside the sections.
- Never leave a field empty. Omit an optional block rather than returning placeholder text.

WRITING STYLE
- Compress, never expand: reuse the source's own wording, keep every paragraph to 1 to 3 short sentences, and never restate a point in two blocks.
- Teach, do not summarise: declarative sentences, concrete examples, no filler like "In this section we will explore".
- Headings are noun phrases, not questions.
- The client brand is "${input.brand.brandName}". Do not add brand names, watermarks or footers into the JSON; the studio applies those.

LANGUAGE
${languagePreset(input.language).instruction}

SOURCE MATERIAL
"""
${input.source.slice(0, 24000)}
"""
`
}

export function carouselSystemPrompt(): string {
  return [
    'You are a social content director who writes high-retention Instagram and LinkedIn carousels for client brands.',
    'You always answer with a single valid JSON object and nothing else: no prose, no markdown, no code fences.',
    'Every line you write must be short enough to sit on a 1080 by 1350 slide without overflow.',
  ].join(' ')
}

export function carouselUserPrompt(input: {
  source: string
  language: LanguageId
  slideCount: number
  brand: BrandPreset
}): string {
  return `Turn the SOURCE MATERIAL into a swipe-stopping social carousel of exactly ${input.slideCount} slides.

OUTPUT FORMAT — return only JSON matching this schema:
{
  "title": "string — internal working title, max 8 words",
  "slides": [ Slide, ... ]
}

Slide is: {
  "kind": "hook" | "idea" | "cta",
  "eyebrow": "string — 2 to 4 words, optional context label",
  "headline": "string — the one idea on this slide",
  "subhook": "string — one supporting line, empty string when not needed",
  "points": ["string — optional short bullets"],
  "numbered": true,
  "cta": "string — call to action, only on the final slide"
}

RULES
- Slide 1: kind "hook". Headline is a high-impact hook of at most 9 words. Subhook adds tension or a promise, at most 16 words. No bullets. "cta" must be "".
- Middle slides: kind "idea". Exactly one crisp idea per slide. Headline at most 8 words. Either 2 to 4 short bullets (each at most 9 words) or one subhook line, never both. Set "numbered" true when the bullets are a sequence, otherwise false.
- Final slide: kind "cta". Headline is a strong call to action of at most 8 words, "cta" is a 2 to 4 word button label (e.g. "Save this post"), points is empty, and "subhook" carries the brand handle ${input.brand.handle}.
- Exactly ${input.slideCount} slides in the array. Slide 1 is the hook, the last is the CTA.
- "eyebrow" and "subhook" may be "" but never use placeholder text like "Lorem" or "Optional".
- Do not put emojis at the start of every line. At most one emoji in the entire carousel, and only if the source tone suits it.
- No hashtags, no emoji spam, no "Slide 1 of N" text.
- Write for a client audience: specific, confident, zero generic advice.

LANGUAGE
${languagePreset(input.language).instruction}

CLIENT BRAND
Brand: ${input.brand.brandName}. Handle: ${input.brand.handle}.

SOURCE MATERIAL
"""
${input.source.slice(0, 24000)}
"""
`
}
