import type { CSSProperties } from 'react'
import { fontPreset } from '../theme/presets'
import { themeFor } from '../theme/themes'
import type { AppSettings, BrandPreset } from '../types'

/**
 * Every page paints its own theme tokens inline. That keeps dark themes
 * full-bleed in the exported PDF and in the print preview, because the canvas
 * background travels with the node instead of depending on a stylesheet rule.
 */
export function paperVars(
  settings: AppSettings,
  brand: BrandPreset,
  surface: 'body' | 'cover' = 'body',
): CSSProperties {
  const font = fontPreset(settings.fontPairing)
  const theme = themeFor(settings, surface)
  return {
    '--brand': brand.primary,
    '--accent': brand.accent,
    '--font-head': font.headingStack,
    '--font-body': font.bodyStack,
    '--doc-font': `${settings.fontSize || 13.5}px`,
    '--doc-head-scale': String(settings.headingScale || 1),
    '--doc-leading': String(settings.lineHeight || 1.55),
    '--paper-pad': `${settings.pageMargin || 56}px`,
    '--paper-bg': theme.bg,
    '--paper-ink': theme.ink,
    '--paper-muted': theme.muted,
    '--paper-soft': theme.soft,
    '--paper-line': theme.line,
    '--paper-highlight': theme.highlight,
  } as CSSProperties
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = words.map((word) => word[0]).join('')
  return (letters || 'CF').toUpperCase()
}

export function BrandMark({ brand, compact = false }: { brand: BrandPreset; compact?: boolean }) {
  return (
    <div className={`brandmark${compact ? ' brandmark--compact' : ''}`}>
      {brand.logo ? (
        <img className="brandmark__logo" src={brand.logo} alt="" />
      ) : (
        <span className="brandmark__mono">{initialsOf(brand.brandName)}</span>
      )}
      {compact ? null : <span className="brandmark__name">{brand.brandName}</span>}
    </div>
  )
}

export function Watermark({ text }: { text: string }) {
  const label = (text || 'PREVIEW ONLY').toUpperCase()
  return (
    <div className="watermark" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <span key={index}>{label}</span>
      ))}
    </div>
  )
}
