import { useState } from 'react'
import { BlockStudio } from './BlockStudio'
import { Button, Icon, SectionLabel, Toggle } from './ui'
import {
  FONT_PAIRINGS,
  HEADER_STYLES,
  LAYOUTS,
  LAYOUT_GROUPS,
  SLIDE_LAYOUTS,
  fontPreset,
} from '../theme/presets'
import { THEME_GROUPS, themeName, themeTokens } from '../theme/themes'
import type { AppSettings, PdfDoc, StudioTab, ThemeId } from '../types'

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
  doc,
  onDoc,
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
  doc?: PdfDoc
  onDoc?: (doc: PdfDoc) => void
}) {
  const [layoutGroup, setLayoutGroup] = useState(LAYOUT_GROUPS[0].id)
  const [themeGroup, setThemeGroup] = useState(THEME_GROUPS[0].id)
  const [themeTarget, setThemeTarget] = useState<'cover' | 'body'>('body')

  const layouts = LAYOUTS.filter((layout) =>
    LAYOUT_GROUPS.find((group) => group.id === layoutGroup)?.layouts.includes(layout.id),
  )
  const activeThemeGroup = THEME_GROUPS.find((group) => group.id === themeGroup) ?? THEME_GROUPS[0]
  const bodyTheme = themeTokens(settings.themeId)
  const coverTheme = themeTokens(settings.separateCoverTheme ? settings.coverThemeId : settings.themeId)

  const selectTheme = (id: ThemeId) => {
    if (!settings.separateCoverTheme) {
      onPatch({ themeId: id, coverThemeId: id })
      return
    }
    if (themeTarget === 'cover') onPatch({ coverThemeId: id })
    else onPatch({ themeId: id })
  }

  const themeValue = settings.separateCoverTheme && themeTarget === 'cover' ? coverTheme : bodyTheme

  return (
    <div className="design-pane">
      {mode === 'pdf' ? (
        <>
          <SectionLabel>Base layout</SectionLabel>
          <div className="cat-tabs" role="tablist" aria-label="Layout categories">
            {LAYOUT_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={layoutGroup === group.id}
                className={`cat-tab${layoutGroup === group.id ? ' is-active' : ''}`}
                onClick={() => setLayoutGroup(group.id)}
                title={group.blurb}
              >
                {group.name.split(' ')[0]}
              </button>
            ))}
          </div>
          <p className="cat-blurb">
            {LAYOUT_GROUPS.find((group) => group.id === layoutGroup)?.blurb}
          </p>
          <div className="layout-grid">
            {layouts.map((layout) => (
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

          <SectionLabel>Theme · colour &amp; mood</SectionLabel>
          <Toggle
            checked={settings.separateCoverTheme}
            onChange={(value) => onPatch({ separateCoverTheme: value })}
            label="Separate cover page theme"
            description="Pick one canvas for the front cover and another for every body page. Brand marks, fonts and accents stay shared."
          />

          {settings.separateCoverTheme ? (
            <>
              <div className="theme-surfaces">
                {(['cover', 'body'] as const).map((surface) => {
                  const theme = surface === 'cover' ? coverTheme : bodyTheme
                  return (
                    <button
                      key={surface}
                      type="button"
                      className={`theme-surface${themeTarget === surface ? ' is-active' : ''}`}
                      onClick={() => setThemeTarget(surface)}
                    >
                      <span className="theme-surface__label">
                        {surface === 'cover' ? 'Front / Cover' : 'Body pages'}
                      </span>
                      <span
                        className="theme-surface__chip"
                        style={{ background: theme.bg, color: theme.ink, borderColor: theme.line }}
                      >
                        Aa
                      </span>
                      <span className="theme-surface__name">{theme.name}</span>
                    </button>
                  )
                })}
              </div>
              <p className="cat-blurb">
                Editing the <strong>{themeTarget === 'cover' ? 'cover' : 'body'}</strong> theme — pick a
                swatch below.
              </p>
            </>
          ) : (
            <p className="cat-blurb">
              One theme for the whole PDF. Current: <strong>{bodyTheme.name}</strong>
            </p>
          )}

          <div className="cat-tabs" role="tablist" aria-label="Theme categories">
            {THEME_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={themeGroup === group.id}
                className={`cat-tab${themeGroup === group.id ? ' is-active' : ''}`}
                onClick={() => setThemeGroup(group.id)}
                title={group.blurb}
              >
                {group.name.split(' ')[0]}
              </button>
            ))}
          </div>

          <div className="theme-grid">
            {activeThemeGroup.themes.map((id) => {
              const theme = themeTokens(id)
              return (
                <button
                  key={id}
                  type="button"
                  className={`theme-card${themeValue.id === id ? ' is-active' : ''}`}
                  onClick={() => selectTheme(id)}
                  title={`${themeName(id)}${theme.dark ? ' · dark' : ''}`}
                >
                  <span className="theme-card__swatch" style={{ background: theme.bg }}>
                    <span className="theme-card__ink" style={{ background: theme.ink }} />
                    <span className="theme-card__soft" style={{ background: theme.soft }} />
                    <span className="theme-card__line" style={{ background: theme.line }} />
                  </span>
                  <span className="theme-card__name">{theme.name}</span>
                  {themeValue.id === id ? (
                    <span className="theme-card__check" aria-hidden="true">
                      <Icon name="check" size={11} />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <SectionLabel>Slide layout</SectionLabel>
          <div className="layout-grid">
            {SLIDE_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                type="button"
                className={`layout-card${settings.slideLayout === layout.id ? ' is-active' : ''}`}
                onClick={() => onPatch({ slideLayout: layout.id })}
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
        </>
      )}

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

      {mode === 'pdf' && doc && onDoc ? (
        <>
          <SectionLabel>Visual blocks</SectionLabel>
          <BlockStudio doc={doc} onChange={onDoc} />
        </>
      ) : null}

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
            <span>Vector text</span>
          </div>
          <Button variant="primary" icon="print" full onClick={onPrint} disabled={Boolean(busy)}>
            {busy ?? 'Export vector PDF'}
          </Button>
          <p className="export-note export-note--strong">
            Opens the print dialog. Choose <strong>Save as PDF</strong>, paper <strong>A4</strong>, margins{' '}
            <strong>None</strong>, background graphics <strong>on</strong>. Text stays selectable and every
            diagram, chart and table edge stays vector-sharp.
          </p>
          <Button variant="ghost" icon="download" full onClick={onExportPdf} disabled={Boolean(busy)}>
            Raster PDF (fallback)
          </Button>
          <p className="export-note">
            The image-based 2× PDF renders even in browsers that block the print dialog. Use the vector
            export above for client delivery.
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
