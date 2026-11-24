import { useState } from 'react'
import { Button, Icon, SectionLabel } from './ui'
import { CATEGORY_LABELS, executeSuggestion, scanSuggestions } from '../lib/suggestions'
import type { Suggestion } from '../lib/suggestions'
import { inferSubject } from '../lib/suggestions'
import type { AppSettings, PdfDoc } from '../types'

const ACTION_LABELS: Record<Suggestion['action']['kind'], string> = {
  diagram: 'Generate & Add diagram',
  chart: 'Generate & Add chart',
  formula: 'Generate & Add formula box',
  table: 'Generate & Add table',
  callout: 'Generate & Add callout',
  process: 'Convert to steps',
}

export function SuggestionBox({
  settings,
  doc,
  onChange,
  notify,
}: {
  settings: AppSettings
  doc: PdfDoc
  onChange: (doc: PdfDoc) => void
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [scanning, setScanning] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [undo, setUndo] = useState<{ doc: PdfDoc; label: string }[]>([])
  const [scanned, setScanned] = useState(false)

  const scan = async () => {
    if (scanning) return
    if (!doc.sections.length) {
      notify('Generate a document first — the advisor reads its sections.', 'error')
      return
    }
    setScanning(true)
    try {
      const result = await scanSuggestions(settings, doc)
      setItems(result.items)
      setScanned(true)
      notify(
        result.local
          ? `${result.items.length} suggestions from the offline reviewer`
          : `${result.items.length} AI suggestions ready`,
        'success',
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not scan this document.', 'error')
    } finally {
      setScanning(false)
    }
  }

  const apply = async (suggestion: Suggestion) => {
    if (busyId) return
    setBusyId(suggestion.id)
    try {
      const result = await executeSuggestion(settings, doc, suggestion)
      setUndo((stack) => [{ doc, label: suggestion.title }, ...stack].slice(0, 8))
      onChange(result.doc)
      setItems((list) => list.filter((entry) => entry.id !== suggestion.id))
      notify(result.local ? 'Added a draft you can refine' : 'Added to the PDF', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not add that visual.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const undoLast = () => {
    const last = undo[0]
    if (!last) return
    onChange(last.doc)
    setUndo((stack) => stack.slice(1))
    notify('Insert undone', 'info')
  }

  return (
    <div className="suggest-box">
      <SectionLabel
        action={
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Collapse smart suggestions' : 'Expand smart suggestions'}
            title={open ? 'Collapse' : 'Expand'}
          >
            <span className={`sb-chevron${open ? ' is-open' : ''}`}>
              <Icon name="chevron" size={12} />
            </span>
          </button>
        }
      >
        Smart suggestions
      </SectionLabel>

      {open ? (
        <>
          <p className="sb-context">
            Reading: <strong>{inferSubject(doc)}</strong> · {doc.sections.length} sections ·{' '}
            {doc.mcqs.length ? `${doc.mcqs.length} MCQs` : 'no MCQs'}
          </p>
          <Button
            variant="primary"
            icon="sparkles"
            full
            onClick={scan}
            disabled={scanning}
            title="Analyse sections, subject and audience and return improvements"
          >
            {scanning ? 'Scanning the document…' : scanned ? 'Scan again' : 'Scan & suggest improvements'}
          </Button>

          {undo.length ? (
            <div className="sb-undo">
              <span>
                <strong>{undo[0].label}</strong> added
              </span>
              <button type="button" className="sb-undo__btn" onClick={undoLast}>
                Undo
              </button>
            </div>
          ) : null}

          {items.length ? (
            <ul className="sb-list">
              {items.map((suggestion) => (
                <li key={suggestion.id} className={`sb-card sb-card--${suggestion.category}`}>
                  <div className="sb-card__head">
                    <span className="sb-card__cat">{CATEGORY_LABELS[suggestion.category]}</span>
                    <span className="sb-card__section">{suggestion.sectionHeading}</span>
                  </div>
                  <h4 className="sb-card__title">{suggestion.title}</h4>
                  <p className="sb-card__detail">{suggestion.detail}</p>
                  <Button
                    variant="ghost"
                    icon="sparkles"
                    full
                    onClick={() => apply(suggestion)}
                    disabled={Boolean(busyId)}
                  >
                    {busyId === suggestion.id ? 'Generating…' : ACTION_LABELS[suggestion.action.kind]}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sb-empty">
              {scanned
                ? 'No further improvements found — the structure is strong.'
                : 'Scan the document to get section-specific visuals, exam boosters and clarity fixes.'}
            </p>
          )}
        </>
      ) : (
        <p className="sb-empty">Collapsed. Expand to scan the document.</p>
      )}
    </div>
  )
}
