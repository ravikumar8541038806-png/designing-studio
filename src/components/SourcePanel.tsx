import { useRef } from 'react'
import { Button, Field, SectionLabel, Segmented, TextArea, Toggle } from './ui'
import { DEPTH_OPTIONS, DOC_FORMATS, LANGUAGES, SLIDE_FORMATS } from '../theme/presets'
import { detectInputMode } from '../lib/prompts'
import { proxyOn } from '../lib/proxy'
import type { AppSettings, InputModeId, StudioTab } from '../types'

const STARTER_PROMPTS: Record<StudioTab, { label: string; prompt: string }[]> = {
  pdf: [
    {
      label: 'Global Climate Change',
      prompt: 'Create a detailed, publication-grade PDF report on Global Climate Change covering drivers, temperature trends, ocean & cryosphere impacts, and clean energy solutions.',
    },
    {
      label: 'SaaS Client Proposal',
      prompt: 'Create a persuasive agency redesign & growth proposal for a B2B SaaS client with deliverables, timeline, ROI metrics, and pricing tiers.',
    },
    {
      label: 'Coaching Notes',
      prompt: 'Create structured coaching revision notes on Macroeconomics & Monetary Policy with key terms, comparison tables, and practice MCQs.',
    },
  ],
  carousel: [
    {
      label: 'Climate Facts Deck',
      prompt: 'Create a compelling visual carousel explaining 5 critical facts about Global Climate Change and the clean energy transition.',
    },
    {
      label: 'SaaS Pitch Deck',
      prompt: 'Create an executive 16:9 client pitch deck for a brand identity & digital product overhaul, highlighting problem, strategy, timeline, and ROI.',
    },
    {
      label: 'Freelance Pricing',
      prompt: '5 pricing mistakes that cap a freelance designer’s income — and how to switch to value-based retainers.',
    },
  ],
}

export function SourcePanel({
  mode,
  source,
  onSourceChange,
  settings,
  onPatch,
  generating,
  onGenerate,
  error,
  onOpenSettings,
  onExtractPdf,
  extracting,
  extracted,
  progress,
  onUseDirectMode,
}: {
  mode: StudioTab
  source: string
  onSourceChange: (value: string) => void
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => void
  generating: boolean
  onGenerate: () => void
  error: string | null
  onOpenSettings: () => void
  onExtractPdf: (file: File) => void
  extracting: { page: number; total: number } | null
  extracted: string | null
  progress?: number | null
  onUseDirectMode?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const hasKey =
    Boolean(settings.keys[settings.provider]?.trim()) || (proxyOn() && settings.provider === 'gemini')
  const words = source.trim() ? source.trim().split(/\s+/).length : 0
  const direct = settings.directMode
  const detectedMode = detectInputMode(source, settings.inputMode)

  const actionLabel = direct
    ? mode === 'pdf'
      ? 'Format Notes Instantly'
      : 'Build Slides Instantly'
    : mode === 'pdf'
      ? detectedMode === 'prompt'
        ? 'Create Publication PDF'
        : 'Design & Structure PDF'
      : settings.slideFormat === 'deck'
        ? 'Generate Pitch Deck'
        : 'Generate Carousel'

  return (
    <section className="source-block">
      <SectionLabel action={<span className="mini-counter">{words} words</span>}>
        Prompt or Source Notes
      </SectionLabel>

      <TextArea
        value={source}
        onChange={onSourceChange}
        rows={mode === 'pdf' ? 7 : 6}
        placeholder={
          mode === 'pdf'
            ? 'Write a prompt (e.g. “Create a detailed PDF on Global Climate Change”) OR paste your raw notes, transcript, or article…'
            : 'Describe your carousel / pitch deck topic OR paste your outline…'
        }
      />

      <div className="prompt-chips" aria-label="Quick starter prompts">
        {STARTER_PROMPTS[mode].map((item) => (
          <button
            key={item.label}
            type="button"
            className="prompt-chip"
            onClick={() => onSourceChange(item.prompt)}
            title={item.prompt}
          >
            ✦ {item.label}
          </button>
        ))}
      </div>

      <div className="pdf-row">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onExtractPdf(file)
            event.target.value = ''
          }}
        />
        <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()} disabled={Boolean(extracting)}>
          {extracting ? 'Reading…' : 'Import PDF text'}
        </Button>
        <span className="pdf-row__hint">
          {extracting
            ? `Page ${extracting.page} of ${extracting.total}`
            : extracted
              ? extracted
              : 'Runs locally in browser'}
        </span>
      </div>

      {mode === 'pdf' ? (
        <>
          <Field label="Input handling">
            <Segmented<InputModeId>
              ariaLabel="Input handling"
              value={settings.inputMode}
              onChange={(value) => onPatch({ inputMode: value })}
              options={[
                { value: 'auto', label: `Auto (${detectedMode === 'prompt' ? 'Brief' : 'Notes'})` },
                { value: 'prompt', label: 'Expand Prompt' },
                { value: 'source', label: 'Format Notes' },
              ]}
            />
          </Field>

          <Field label="Publication style">
            <select
              className="select"
              value={settings.docFormat}
              onChange={(event) => onPatch({ docFormat: event.target.value as AppSettings['docFormat'] })}
            >
              {DOC_FORMATS.map((fmt) => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.label} — {fmt.hint}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : (
        <Field label="Output format">
          <Segmented
            ariaLabel="Slide format"
            value={settings.slideFormat}
            onChange={(value) => onPatch({ slideFormat: value })}
            options={SLIDE_FORMATS.map((fmt) => ({ value: fmt.id, label: fmt.label }))}
          />
        </Field>
      )}

      <Field label="Language">
        <Segmented
          ariaLabel="Output language"
          value={settings.language}
          onChange={(value) => onPatch({ language: value })}
          options={LANGUAGES.map((language) => ({ value: language.id, label: language.label }))}
        />
      </Field>

      {mode === 'pdf' ? (
        <>
          <Field label="Content depth" hint={DEPTH_OPTIONS.find((option) => option.value === settings.depth)?.hint}>
            <Segmented
              ariaLabel="Content depth"
              value={settings.depth}
              onChange={(value) => onPatch({ depth: value })}
              options={DEPTH_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </Field>

          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.includeMcqs}
              onChange={(event) => onPatch({ includeMcqs: event.target.checked })}
            />
            <span>
              <strong>Practice MCQs + answer key</strong>
              <em>Ideal for coaching notes &amp; study guides.</em>
            </span>
          </label>
        </>
      ) : (
        <Field label={`Slides — ${settings.slideCount}`} hint="Hook, body and CTA are balanced to fit cleanly.">
          <div className="slider-row">
            <input
              type="range"
              min={5}
              max={10}
              step={1}
              value={settings.slideCount}
              onChange={(event) => onPatch({ slideCount: Number(event.target.value) })}
              aria-label="Slide count"
            />
            <span className="slider-row__value">{settings.slideCount}</span>
          </div>
        </Field>
      )}

      {!direct ? (
        <Toggle
          label="Auto-generate AI visuals & cover"
          description="Automatically renders planned hero cover art and section illustrations."
          checked={settings.autoVisuals}
          onChange={(value) => onPatch({ autoVisuals: value })}
        />
      ) : null}

      <div className="direct-row">
        <button
          type="button"
          role="switch"
          aria-checked={direct}
          className={`direct-toggle${direct ? ' is-on' : ''}`}
          onClick={() => onPatch({ directMode: !direct })}
          title="Format pasted text locally in this browser — zero API calls"
        >
          <span className="direct-toggle__dot" aria-hidden="true" />
          <span>Direct Mode (No AI)</span>
        </button>
        <span className="direct-row__hint">{direct ? 'Instant · offline' : 'Smart AI routing'}</span>
      </div>

      <div className="generate-block">
        <Button
          variant="primary"
          icon={direct ? 'arrow' : 'sparkles'}
          full
          onClick={onGenerate}
          disabled={generating || !source.trim() || (!direct && !hasKey)}
        >
          {generating
            ? direct
              ? 'Formatting…'
              : progress
                ? `Designing… ${progress.toLocaleString()} chars`
                : 'Drafting publication…'
            : actionLabel}
        </Button>
        {direct ? (
          <div className="generate-meta">
            <span className="generate-meta__ok">Offline formatter active</span>
            <button type="button" className="link-btn" onClick={onOpenSettings}>
              AI Settings
            </button>
          </div>
        ) : (
          <div className="generate-meta">
            <button type="button" className="link-btn" onClick={onOpenSettings}>
              {hasKey ? 'AI Auto-Routing active' : 'Connect AI key'}
            </button>
            {!hasKey ? (
              <button type="button" className="link-btn link-btn--warn" onClick={onOpenSettings}>
                Add API key
              </button>
            ) : (
              <span className="generate-meta__ok">Ready</span>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div className="inline-error inline-error--box error-box">
          <span>{error}</span>
          {onUseDirectMode ? (
            <button type="button" className="error-box__fix" onClick={onUseDirectMode}>
              Use Direct Mode Instantly
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
