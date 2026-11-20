import { useRef, useState } from 'react'
import { Button, ColorField, Field, SectionLabel, TextInput } from './ui'
import { addBrand, duplicateBrand, patchBrand, removeBrand } from '../lib/brands'
import { createBrand } from '../lib/storage'
import type { AppSettings, BrandPreset } from '../types'

const MAX_LOGO_BYTES = 1_500_000

export function BrandPanel({
  settings,
  onChange,
  variant = 'pane',
}: {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
  variant?: 'pane' | 'vault'
}) {
  const brand = settings.brands.find((item) => item.id === settings.activeBrandId) ?? settings.brands[0]
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const patch = (value: Partial<BrandPreset>) => onChange(patchBrand(settings, value))

  const handleLogo = (file: File | undefined) => {
    setLogoError(null)
    if (!file) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      setLogoError('Use a PNG, JPG, WebP or SVG file.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo must be under 1.5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => patch({ logo: String(reader.result) })
    reader.onerror = () => setLogoError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  return (
    <section className="brand-block">
      <SectionLabel
        action={
          <button type="button" className="link-btn" onClick={() => onChange(addBrand(settings, createBrand({ name: 'New preset', brandName: 'New Client' })))}>
            New preset
          </button>
        }
      >
        Client brand
      </SectionLabel>

      <Field label="Preset" hint="Saved presets apply to both studios instantly.">
        <div className="select-row">
          <select
            className="select"
            value={brand?.id ?? ''}
            onChange={(event) => onChange({ ...settings, activeBrandId: event.target.value })}
          >
            {settings.brands.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            title="Duplicate preset"
            aria-label="Duplicate preset"
            onClick={() => brand && onChange(duplicateBrand(settings, brand.id))}
          >
            ⧉
          </button>
        </div>
      </Field>

      <Field label="Preset name">
        <TextInput value={brand?.name ?? ''} onChange={(value) => patch({ name: value })} />
      </Field>

      <div className="brand-logo">
        <div className="brand-logo__preview">
          {brand?.logo ? (
            <img src={brand.logo} alt={`${brand.brandName} logo`} />
          ) : (
            <span>{brand?.brandName?.slice(0, 2).toUpperCase() || 'CF'}</span>
          )}
        </div>
        <div className="brand-logo__actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={(event) => handleLogo(event.target.files?.[0])}
          />
          <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>
            {brand?.logo ? 'Replace logo' : 'Upload logo'}
          </Button>
          {brand?.logo ? (
            <button type="button" className="link-btn" onClick={() => patch({ logo: null })}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {logoError ? <p className="inline-error">{logoError}</p> : null}

      <Field label="Brand / channel name">
        <TextInput value={brand?.brandName ?? ''} onChange={(value) => patch({ brandName: value })} />
      </Field>

      <div className="color-grid">
        <ColorField label="Primary" value={brand?.primary ?? '#3b5bdb'} onChange={(value) => patch({ primary: value })} />
        <ColorField label="Accent" value={brand?.accent ?? '#f59e0b'} onChange={(value) => patch({ accent: value })} />
      </div>

      <Field label="Footer text">
        <TextInput
          value={brand?.footer ?? ''}
          placeholder="Prepared for client review"
          onChange={(value) => patch({ footer: value })}
        />
      </Field>

      <Field label="Social handle / channel">
        <TextInput value={brand?.handle ?? ''} placeholder="@yourhandle" onChange={(value) => patch({ handle: value })} />
      </Field>

      <Field label="Watermark text" hint="Used when the payment lock is on.">
        <TextInput
          value={brand?.watermark ?? ''}
          placeholder="PREVIEW ONLY"
          onChange={(value) => patch({ watermark: value })}
        />
      </Field>

      {variant === 'vault' && settings.brands.length > 1 ? (
        <div className="vault-danger">
          <Button
            variant="danger"
            icon="trash"
            onClick={() => brand && onChange(removeBrand(settings, brand.id))}
          >
            Delete this preset
          </Button>
        </div>
      ) : null}
    </section>
  )
}
