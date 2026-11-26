import { useState } from 'react'
import { BlockStudio } from './BlockStudio'
import { Button, Icon, SectionLabel, Segmented, Toggle } from './ui'
import {
  FONT_PAIRINGS,
  HEADER_STYLES,
  LAYOUTS,
  LAYOUT_GROUPS,
  SLIDE_FORMATS,
  SLIDE_LAYOUTS,
  fontPreset,
} from '../theme/presets'
import { PAGE_DIMS } from '../lib/pagination'
import { THEME_GROUPS, themeName, themeTokens } from '../theme/themes'
import type { AppSettings, PageSizeId, PdfDoc, StudioTab, ThemeId } from '../types'

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
  onExportDeckPdf,
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
  onExportDeckPdf?: () => void
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
  const slideFormatMeta = SLIDE_FORMATS.find((f) => f.id === settings.slideFormat) ?? SLIDE_FORMATS[0]

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
            description="Pick one canvas for the front cover and another for every body page."
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

      <SectionLabel
        action={
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              onPatch({
                fontSize: 13.5,
                headingScale: 1.0,
                lineHeight: 1.55,
                pageMargin: 56,
                pageSize: 'a4',
              })
            }
          >
            Reset
          </button>
        }
      >
        Typography &amp; Page Size
      </SectionLabel>
      <div className="typo-panel">
        <div className="bs-chips">
          {(
            [
              { label: 'Compact', fontSize: 11.5, headingScale: 0.9, lineHeight: 1.42, pageMargin: 44 },
              { label: 'Standard', fontSize: 13.5, headingScale: 1.0, lineHeight: 1.55, pageMargin: 56 },
              { label: 'Large', fontSize: 15.5, headingScale: 1.12, lineHeight: 1.65, pageMargin: 64 },
            ] as const
          ).map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`bs-chip${Math.abs((settings.fontSize || 13.5) - preset.fontSize) < 0.2 ? ' is-active' : ''}`}
              onClick={() =>
                onPatch({
                  fontSize: preset.fontSize,
                  headingScale: preset.headingScale,
                  lineHeight: preset.lineHeight,
                  pageMargin: preset.pageMargin,
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className="bs-field">
          <span className="bs-field__label">Body text size · {(settings.fontSize || 13.5).toFixed(1)} px</span>
          <input
            className="bs-range"
            type="range"
            min={10}
            max={18}
            step={0.5}
            value={settings.fontSize || 13.5}
            onChange={(event) => onPatch({ fontSize: Number(event.target.value) })}
          />
        </label>

        <label className="bs-field">
          <span className="bs-field__label">Heading scale · {Math.round((settings.headingScale || 1) * 100)}%</span>
          <input
            className="bs-range"
            type="range"
            min={0.8}
            max={1.35}
            step={0.05}
            value={settings.headingScale || 1}
            onChange={(event) => onPatch({ headingScale: Number(event.target.value) })}
          />
        </label>

        <label className="bs-field">
          <span className="bs-field__label">Line spacing · {(settings.lineHeight || 1.55).toFixed(2)}</span>
          <input
            className="bs-range"
            type="range"
            min={1.3}
            max={1.85}
            step={0.05}
            value={settings.lineHeight || 1.55}
            onChange={(event) => onPatch({ lineHeight: Number(event.target.value) })}
          />
        </label>

        {mode === 'pdf' ? (
          <>
            <label className="bs-field">
              <span className="bs-field__label">Page margins · {settings.pageMargin || 56} px</span>
              <input
                className="bs-range"
                type="range"
                min={36}
                max={80}
                step={4}
                value={settings.pageMargin || 56}
                onChange={(event) => onPatch({ pageMargin: Number(event.target.value) })}
              />
            </label>

            <div className="bs-field">
              <span className="bs-field__label">Paper format</span>
              <Segmented<PageSizeId>
                ariaLabel="Paper size"
                value={settings.pageSize || 'a4'}
                onChange={(value) => onPatch({ pageSize: value })}
                options={[
                  { value: 'a4', label: 'A4 (210×297mm)' },
                  { value: 'letter', label: 'US Letter' },
                ]}
              />
            </div>

            <Toggle
              checked={settings.showCoverToc !== false}
              onChange={(value) => onPatch({ showCoverToc: value })}
              label="Contents preview on cover"
              description="Displays a clean chapter index card on the cover page."
            />
          </>
        ) : null}
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

      <SectionLabel>{mode === 'pdf' ? 'Export PDF' : 'Export Carousel / Deck'}</SectionLabel>

      {mode === 'pdf' ? (
        <div className="export-block">
          <div className="export-stats">
            <span>{pageCount} {(PAGE_DIMS[settings.pageSize] ?? PAGE_DIMS.a4).label} pages</span>
            <span>2.5× Print-Ready</span>
          </div>
          <Button variant="primary" icon="download" full onClick={onExportPdf} disabled={Boolean(busy)}>
            {busy ?? 'Download Print-Ready PDF'}
          </Button>
          <p className="export-note export-note--strong">
            Instant 1-click download at crisp 2.5× resolution — zero edge clipping, full-bleed themes, and exact page breaks.
          </p>
          <Button variant="ghost" icon="print" full onClick={onPrint} disabled={Boolean(busy)}>
            Vector Print PDF (Print Dialog)
          </Button>
          <p className="export-note">
            Opens the browser print dialog for selectable vector text (choose Save as PDF, A4, Margins: None, Background graphics: On).
          </p>
        </div>
      ) : (
        <div className="export-block">
          <div className="export-stats">
            <span>{slideCount} slides</span>
            <span>{slideFormatMeta.dimensions}</span>
          </div>
          {onExportDeckPdf ? (
            <Button variant="primary" icon="download" full onClick={onExportDeckPdf} disabled={Boolean(busy)}>
              {busy ?? 'Download Deck as PDF'}
            </Button>
          ) : null}
          <Button variant={onExportDeckPdf ? 'ghost' : 'primary'} icon="download" full onClick={onExportZip} disabled={Boolean(busy)}>
            {busy ?? 'Download all slides (.zip PNG)'}
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
            Export as a crisp multi-page PDF pitch deck or high-res PNG slides in a single ZIP.
          </p>
        </div>
      )}
    </div>
  )
}
