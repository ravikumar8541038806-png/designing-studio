import type { CSSProperties } from 'react'
import { fontPreset } from '../theme/presets'
import type { AppSettings, BrandPreset } from '../types'

export function paperVars(settings: AppSettings, brand: BrandPreset): CSSProperties {
  const font = fontPreset(settings.fontPairing)
  return {
    '--brand': brand.primary,
    '--accent': brand.accent,
    '--font-head': font.headingStack,
    '--font-body': font.bodyStack,
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
