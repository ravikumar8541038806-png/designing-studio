import type { BrandPreset, DocFormatId, InputModeId, LanguageId, SlideFormatId } from '../types'
import { DOC_FORMATS, languagePreset, SLIDE_FORMATS } from '../theme/presets'

/**
 * Determines whether the user typed a short creative brief/prompt
 * (e.g. "Create a detailed PDF on Global Climate Change") vs raw source notes.
 */
export function detectInputMode(source: string, preference: InputModeId = 'auto'): 'prompt' | 'source' {
  if (preference === 'prompt') return 'prompt'
  if (preference === 'source') return 'source'

  const trimmed = source.trim()
  if (!trimmed) return 'prompt'
  const words = trimmed.split(/\s+/).length
  const lines = trimmed.split(/\n+/).filter((line) => line.trim()).length

  const imperativePrompt =
    /^(?:create|make|write|generate|design|build|draft|prepare|craft|explain|give me|outline)\b/i.test(trimmed)

  if (imperativePrompt && words <= 140) return 'prompt'
  if (words <= 65 && lines <= 4) return 'prompt'
  return 'source'
}

const PDF_SCHEMA = `{
  "title": "string — compelling publication title, max 12 words",
  "eyebrow": "string — 2 to 4 words in CAPS, e.g. EXECUTIVE REPORT, STUDY GUIDE, CLIENT BRIEF",
  "subtitle": "string — one crisp line of context, max 18 words",
  "coverImagePrompt": "string — optional visual art direction for a cinematic hero cover image (pure visual scene, NO text/letters)",
  "sections": [
    {
      "heading": "string — section title, max 8 words",
      "blocks": [ Block, ... ]
    }
  ],
  "mcqs": [ Mcq, ... ]
}`

const BLOCK_SCHEMA = `Block is EXACTLY one of these objects:
{"type":"lead","text":"string — 1 to 3 sentence high-impact opening line"}
{"type":"paragraph","text":"string — 1 to 3 crisp sentences; wrap 1 to 3 key terms in **double asterisks**"}
{"type":"subheading","text":"string — short sub-topic label"}
{"type":"bullets","items":["string","string"]}
{"type":"numbered","items":["string","string"]}
{"type":"keyterms","items":[{"term":"string","definition":"string"}]}
{"type":"table","caption":"string","columns":["string"],"rows":[["string"]]}
{"type":"callout","kind":"fact|exam|note|tip|warning|summary","title":"string","body":"string"}
{"type":"quote","text":"string","cite":"string"}
{"type":"stats","title":"string — 2 to 5 words","items":[{"value":"e.g. +1.45°C or 42%","label":"3 to 5 word metric label","delta":"optional e.g. +18% YoY"}]}
{"type":"chart","chart":"bar|bar3d|line|donut|hcompare|area|compare","title":"string","labels":["short label"],"values":[12,34],"values2":[10,28],"unit":"optional e.g. % or °C or $M","seriesA":"optional","seriesB":"optional","note":"one-line takeaway"}
{"type":"timeline","title":"string","orientation":"vertical|horizontal","items":[{"date":"Year or Phase","title":"short title","description":"one sentence"}]}
{"type":"diagram","diagram":"flow|cycle|mindmap","title":"string","caption":"string","nodes":[{"id":"n1","label":"max 5 words","shape":"box|pill|ellipse|diamond"}],"edges":[{"from":"n1","to":"n2","label":"optional"}]}
{"type":"image","prompt":"detailed art direction for an AI image generator (subject, lighting, composition — NEVER include text, letters or labels in the prompt)","style":"photorealistic|3d-illustration|2d-vector|textbook-diagram","aspect":"16:9|4:3|1:1","caption":"Fig X: crisp editorial caption"}`

const MCQ_SCHEMA = `Mcq is: {"question":"string","options":["four distinct option strings"],"answer":"the exact text of the correct option","explanation":"string — one or two sentences"}`

export function docSystemPrompt(mode: 'prompt' | 'source' = 'source'): string {
  if (mode === 'prompt') {
    return [
      'You are an award-winning editorial director, subject-matter expert, and publication designer.',
      'The user gives you a topic or creative brief. Research and author a deeply informative, publication-grade document ready to deliver to a high-ticket client.',
      'Combine authoritative writing with visual variety: lead summaries, KPI stat cards, real data charts, comparison tables, process flowcharts, timelines, callout boxes, and strategic AI image prompts.',
      'CRITICAL: Never use a "diagram" block for real-world scenes (mountains, oceans, Earth, forests, portraits, products). Use an "image" block with a rich visual prompt instead; reserve "diagram" strictly for flowcharts, cycles, and mindmaps.',
      'Answer with one valid JSON object only — no prose, no markdown fences, no comments, no trailing commas.',
    ].join(' ')
  }
  return [
    'You are a senior publication editor producing client-ready, print-grade documents.',
    'Structure the supplied text faithfully and concisely: keep its order, facts and terminology, and transform dense text into scannable blocks (leads, tables, key terms, callouts, charts/diagrams when data or processes exist).',
    'Never invent fake numbers for pasted notes — only create charts or stats when numbers exist in the source or are clearly illustrative.',
    'Answer with one valid JSON object and nothing else: no prose, no markdown fences, no comments, no trailing commas.',
  ].join(' ')
}

export function docUserPrompt(input: {
  source: string
  language: LanguageId
  depth: number
  includeMcqs: boolean
  brand: BrandPreset
  docFormat?: DocFormatId
  inputMode?: InputModeId
  autoVisuals?: boolean
}): string {
  const resolvedMode = detectInputMode(input.source, input.inputMode)
  const formatMeta = DOC_FORMATS.find((f) => f.id === input.docFormat) ?? DOC_FORMATS[0]

  const depthRules =
    input.depth <= 1
      ? 'DEPTH: crisp executive brief / revision sheet. 3 to 5 sections, 2 to 4 high-impact blocks per section.'
      : input.depth >= 3
        ? 'DEPTH: comprehensive publication / teaching chapter. 5 to 8 rich sections, 3 to 5 varied blocks per section.'
        : 'DEPTH: balanced client-ready guide. 4 to 6 sections, 3 to 4 varied blocks per section.'

  const formatRule =
    input.docFormat && input.docFormat !== 'auto'
      ? `DOCUMENT ARCHETYPE: ${formatMeta.label} (${formatMeta.hint}). Tailor the eyebrow, tone, and block selection to match this format.`
      : 'DOCUMENT ARCHETYPE: Choose the most fitting editorial tone (e.g. Executive Report, Study Guide, Client Playbook, or Case Study) from the topic.'

  const visualRule =
    input.autoVisuals !== false
      ? `VISUAL & GRAPHICS DESIGN (IMPORTANT):
- Include a compelling "coverImagePrompt" on the cover (pure visual scene, cinematic lighting, NO text/words).
- Include 1 to 2 "image" blocks inside sections where real-world photography, 3D renders, or editorial illustrations elevate comprehension. Write rich art-directed prompts (lighting, mood, subject) with ZERO text/words inside the image.
- Include at least one "stats" block (3-4 crisp metric cards) and one "chart" block (use "bar", "bar3d", "line", "area", "donut", or "compare" with clean data) wherever quantitative trends or metrics belong.
- Use "diagram" ("flow", "cycle", or "mindmap") ONLY for abstract workflows, feedback loops, or concept maps.`
      : `VISUALS: Keep visuals structural (tables, callouts, and optional flow/cycle diagrams); omit "image" blocks and "coverImagePrompt".`

  const mcqRule = input.includeMcqs
    ? 'Include 4 to 6 high-value MCQs / comprehension checks in "mcqs" with exactly four options each. Put the exact correct option text in "answer" (not a letter).'
    : 'Set "mcqs" to an empty array [].'

  const modeDirective =
    resolvedMode === 'prompt'
      ? `CREATIVE BRIEF MODE: Expand the user's prompt below into a thorough, accurate, authoritative publication. Include concrete real-world facts, structured insights, and visual richness.`
      : `SOURCE STRUCTURING MODE: Transform the pasted source material below into a clean, scannable publication while preserving its facts, order, and terminology.`

  return `${modeDirective}

OUTPUT FORMAT — return only JSON matching this schema:
${PDF_SCHEMA}

${BLOCK_SCHEMA}

${MCQ_SCHEMA}

STRUCTURE & DESIGN RULES
- ${formatRule}
- ${depthRules}
- Section 1 must open with a "lead" block that frames why this topic matters.
- Vary block types across sections so no two consecutive pages look like a wall of text.
- Use a "table" block whenever comparing items, categories, phases, or specifications (2 to 5 columns, 3 to 7 rows).
- Use "callout" blocks ("fact", "tip", "exam", "warning", "summary") for memorable insights and takeaways.
- Use "keyterms" for 2 to 5 vocabulary pairs where definitions help.
- Use "numbered" for real sequences; "bullets" otherwise (2 to 5 concise items).
- Bold 1 to 3 key terms per paragraph using **double asterisks**. Never bold whole sentences.
- ${visualRule}
- ${mcqRule}
- Do not repeat the document title inside the sections.
- Client brand is "${input.brand.brandName}" (applied automatically by the studio — do not put watermarks or footers in JSON).

LANGUAGE
${languagePreset(input.language).instruction}

${resolvedMode === 'prompt' ? 'TOPIC / PROMPT' : 'SOURCE MATERIAL'}
"""
${input.source.slice(0, 24000)}
"""
`
}

export function carouselSystemPrompt(slideFormat: SlideFormatId = 'portrait'): string {
  const isDeck = slideFormat === 'deck'
  return [
    isDeck
      ? 'You are a principal presentation designer creating high-converting 16:9 client pitch decks and keynote slides.'
      : 'You are a social content director who writes high-retention Instagram and LinkedIn carousels for client brands.',
    'You always answer with a single valid JSON object and nothing else: no prose, no markdown, no code fences.',
    isDeck
      ? 'Every slide must be crisp, executive-ready, and fit cleanly inside a 1920 by 1080 widescreen slide.'
      : 'Every line you write must be short enough to sit on a social slide without overflow.',
  ].join(' ')
}

export function carouselUserPrompt(input: {
  source: string
  language: LanguageId
  slideCount: number
  brand: BrandPreset
  slideFormat?: SlideFormatId
  autoVisuals?: boolean
}): string {
  const format = input.slideFormat ?? 'portrait'
  const formatMeta = SLIDE_FORMATS.find((f) => f.id === format) ?? SLIDE_FORMATS[0]
  const isDeck = format === 'deck'

  const visualInstruction =
    input.autoVisuals !== false
      ? `- Optionally include "imagePrompt" (pure visual art direction, NO text/letters) and "imageLayout" ("background" on hook slide, "split" or "top" on 1–2 key slides) where an editorial photo or 3D visual elevates the slide. Leave "imagePrompt" "" on text-focused slides.`
      : `- Omit "imagePrompt" (set to "").`

  return `Turn the BRIEF / SOURCE MATERIAL below into a publication-grade ${formatMeta.label} (${formatMeta.dimensions}) of exactly ${input.slideCount} slides.

OUTPUT FORMAT — return only JSON matching this schema:
{
  "title": "string — internal working title, max 8 words",
  "slides": [ Slide, ... ]
}

Slide is: {
  "kind": "hook" | "idea" | "cta",
  "eyebrow": "string — 2 to 4 words, optional context label",
  "headline": "string — the one core message on this slide",
  "subhook": "string — supporting line, empty string when not needed",
  "points": ["string — crisp bullets"],
  "numbered": true,
  "cta": "string — call to action, only on the final slide",
  "imagePrompt": "string — optional visual scene description with NO text/words",
  "imageLayout": "top" | "split" | "background"
}

RULES
- Slide 1: kind "hook". Headline is a high-impact title/hook (${isDeck ? 'max 10 words' : 'max 9 words'}). Subhook adds tension or promise (max 16 words). No bullets. "cta" must be "".
- Middle slides: kind "idea". Exactly one crisp idea per slide. Headline at most ${isDeck ? '9' : '8'} words. Either 2 to 4 short bullets (each at most ${isDeck ? '12' : '9'} words) or one subhook line (or both in 16:9 deck split layout if concise). Set "numbered" true when sequential, otherwise false.
- Final slide: kind "cta". Strong closing headline (max 8 words), "cta" is a 2 to 4 word button label (e.g. "${isDeck ? 'Schedule a review' : 'Save this post'}"), points is empty, and "subhook" carries the brand handle ${input.brand.handle}.
- Exactly ${input.slideCount} slides in the array. Slide 1 is "hook", the last is "cta".
${visualInstruction}
- Never use placeholder text like "Lorem" or "Optional".
- No hashtags, no emoji spam, no "Slide 1 of N" text.

LANGUAGE
${languagePreset(input.language).instruction}

CLIENT BRAND
Brand: ${input.brand.brandName}. Handle: ${input.brand.handle}.

BRIEF / SOURCE MATERIAL
"""
${input.source.slice(0, 24000)}
"""
`
}
