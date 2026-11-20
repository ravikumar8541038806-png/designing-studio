import { useRef } from 'react'
import { Button, Field, SectionLabel, Segmented, TextArea } from './ui'
import { DEPTH_OPTIONS, LANGUAGES, providerPreset } from '../theme/presets'
import type { AppSettings, StudioTab } from '../types'

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
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const provider = providerPreset(settings.provider)
  const hasKey = Boolean(settings.keys[settings.provider]?.trim())
  const words = source.trim() ? source.trim().split(/\s+/).length : 0

  return (
    <section className="source-block">
      <SectionLabel action={<span className="mini-counter">{words} words</span>}>Source material</SectionLabel>

      <TextArea
        value={source}
        onChange={onSourceChange}
        rows={mode === 'pdf' ? 9 : 7}
        placeholder={
          mode === 'pdf'
            ? 'Paste a transcript, lecture notes, a chapter or raw research…'
            : 'Paste the topic, transcript or article you want turned into slides…'
        }
      />

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
          {extracting ? 'Reading…' : 'Extract PDF text'}
        </Button>
        <span className="pdf-row__hint">
          {extracting
            ? `Page ${extracting.page} of ${extracting.total}`
            : extracted
              ? extracted
              : 'Runs in your browser'}
        </span>
      </div>

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
              <em>Adds a question section at the end of the document.</em>
            </span>
          </label>
        </>
      ) : (
        <Field label={`Slides — ${settings.slideCount}`} hint="Hook, body and CTA are generated to fit exactly.">
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

      <div className="generate-block">
        <Button variant="primary" icon="sparkles" full onClick={onGenerate} disabled={generating || !source.trim() || !hasKey}>
          {generating ? 'Structuring…' : mode === 'pdf' ? 'Structure document' : 'Generate carousel'}
        </Button>
        <div className="generate-meta">
          <button type="button" className="link-btn" onClick={onOpenSettings}>
            {provider.short} · {settings.models[settings.provider] || 'no model'}
          </button>
          {!hasKey ? (
            <button type="button" className="link-btn link-btn--warn" onClick={onOpenSettings}>
              Add API key
            </button>
          ) : (
            <span className="generate-meta__ok">Key saved locally</span>
          )}
        </div>
      </div>

      {error ? <p className="inline-error inline-error--box">{error}</p> : null}
    </section>
  )
}
