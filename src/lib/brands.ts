import { uid } from './id'
import type { AppSettings, BrandPreset } from '../types'

export function patchBrand(settings: AppSettings, patch: Partial<BrandPreset>): AppSettings {
  const targetId = settings.activeBrandId ?? settings.brands[0]?.id ?? null
  if (!targetId) return settings
  return {
    ...settings,
    brands: settings.brands.map((brand) =>
      brand.id === targetId ? { ...brand, ...patch, updatedAt: Date.now() } : brand,
    ),
  }
}

export function addBrand(settings: AppSettings, brand: BrandPreset): AppSettings {
  return { ...settings, brands: [...settings.brands, brand], activeBrandId: brand.id }
}

export function duplicateBrand(settings: AppSettings, id: string): AppSettings {
  const source = settings.brands.find((brand) => brand.id === id)
  if (!source) return settings
  const copy: BrandPreset = {
    ...source,
    id: uid('brand'),
    name: `${source.name} copy`,
    updatedAt: Date.now(),
  }
  return addBrand(settings, copy)
}

export function removeBrand(settings: AppSettings, id: string): AppSettings {
  if (settings.brands.length <= 1) return settings
  const brands = settings.brands.filter((brand) => brand.id !== id)
  return {
    ...settings,
    brands,
    activeBrandId: settings.activeBrandId === id ? brands[0].id : settings.activeBrandId,
  }
}

export function modelLabelFor(settings: AppSettings): string {
  const id = settings.models[settings.provider]
  const match = settings.catalog[settings.provider].find((model) => model.id === id)
  return match?.label ?? id ?? 'No model'
}
