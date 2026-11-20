import { Button, Icon, SectionLabel, Toggle } from './ui'
import { FONT_PAIRINGS, HEADER_STYLES, LAYOUTS, fontPreset } from '../theme/presets'
import type { AppSettings, StudioTab } from '../types'

export function DesignPane({
  mode,
  settings,
  onPatch,
  pageCount,
  slideCount,
  busy,
  onExportPdf,
  onPrint,
  onExportZip,
  onExportSlide,
  onAddSlide,
}: {
  mode: StudioTab
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => void
  pageCount: number
  slideCount: number
  busy: string | null
  onExportPdf: () => void
  onPrint: () => void
  onExportZip: () => void
  onExportSlide: (index: number) => void
  onAddSlide: () => void
}) {
  return (
    <div className="design-pane">
      <SectionLabel>Base layout</SectionLabel>
      <div className="layout-grid">
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            className={`layout-card${settings.layout === layout.id ? ' is-active' : ''}`}
            onClick={() => onPatch({ layout: layout.id })}
            title={layout.description}
          >
            <span
              className="layout-card__preview"
              style={{ background: layout.swatch[0], color: layout.swatch[1] }}
              aria-hidden="true"
            >
              <span className="lp-head" style={{ background: layout.swatch[2] }} />
              <span className="lp-title" />
              <span className="lp-line" />
              <span className="lp-line lp-line--short" />
              <span className="lp-block" style={{ background: layout.swatch[2] }} />
            </span>
            <span className="layout-card__name">{layout.name}</span>
          </button>
        ))}
      </div>

      <SectionLabel>Header style</SectionLabel>
      <div className="header-grid">
        {HEADER_STYLES.map((header) => (
          <button
            key={header.id}
            type="button"
            className={`header-card${settings.headerStyle === header.id ? ' is-active' : ''}`}
            onClick={() => onPatch({ headerStyle: header.id })}
            title={header.description}
          >
            <span className={`header-card__strip header-card__strip--${header.id}`} aria-hidden="true" />
            <span className="header-card__name">{header.name}</span>
          </button>
        ))}
      </div>

      <SectionLabel>Font pairing</SectionLabel>
      <div className="font-list">
        {FONT_PAIRINGS.map((font) => (
          <button
            key={font.id}
            type="button"
            className={`font-card${settings.fontPairing === font.id ? ' is-active' : ''}`}
            onClick={() => onPatch({ fontPairing: font.id })}
            title={font.note}
          >
            <span className="font-card__sample" style={{ fontFamily: font.headingStack }}>
              Aa<span style={{ fontFamily: font.bodyStack }}>अ</span>
            </span>
            <span className="font-card__text">
              <span className="font-card__name">{font.name}</span>
              <span className="font-card__note">{font.note}</span>
            </span>
          </button>
        ))}
      </div>

      <SectionLabel>Delivery</SectionLabel>
      <div className="lock-card">
        <Toggle
          checked={settings.paymentLock}
          onChange={(value) => onPatch({ paymentLock: value })}
          label="Payment lock / draft watermark"
          description="Stamps every page and slide with a diagonal watermark for client approval."
        />
        <div className={`lock-card__preview${settings.paymentLock ? ' is-on' : ''}`} aria-hidden="true">
          <span>{settings.paymentLock ? 'PREVIEW ONLY' : `${fontPreset(settings.fontPairing).name} active`}</span>
        </div>
      </div>

      <SectionLabel>{mode === 'pdf' ? 'Export PDF' : 'Export carousel'}</SectionLabel>

      {mode === 'pdf' ? (
        <div className="export-block">
          <div className="export-stats">
            <span>{pageCount} A4 pages</span>
            <span>Cover + body</span>
          </div>
          <Button variant="primary" icon="download" full onClick={onExportPdf} disabled={Boolean(busy)}>
            {busy ?? 'Download print-ready PDF'}
          </Button>
          <Button variant="ghost" icon="print" full onClick={onPrint} disabled={Boolean(busy)}>
            Print / vector PDF
          </Button>
          <p className="export-note">
            Pages are placed on a measured A4 grid, so tables, callouts and MCQs never split across a page break.
          </p>
        </div>
      ) : (
        <div className="export-block">
          <div className="export-stats">
            <span>{slideCount} slides</span>
            <span>1080 × 1350 · 2×</span>
          </div>
          <Button variant="primary" icon="download" full onClick={onExportZip} disabled={Boolean(busy)}>
            {busy ?? 'Download all slides (.zip)'}
          </Button>
          <div className="slide-downloads">
            {Array.from({ length: slideCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                className="slide-downloads__item"
                onClick={() => onExportSlide(index)}
                disabled={Boolean(busy)}
                title={`Download slide ${index + 1} as PNG`}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <Icon name="download" size={13} />
              </button>
            ))}
          </div>
          <Button variant="quiet" icon="plus" full onClick={onAddSlide}>
            Add a slide
          </Button>
          <p className="export-note">
            PNGs render at 2160 × 2700 (2× the 1080 × 1350 canvas) and land in one ZIP folder.
          </p>
        </div>
      )}
    </div>
  )
}
