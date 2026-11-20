import { Modal } from './ui'
import { BrandPanel } from './BrandPanel'
import { initialsOf } from '../render/chrome'
import type { AppSettings } from '../types'

export function BrandVault({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean
  onClose: () => void
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Client Brand Vault"
      subtitle="Save a logo, palette and footer per client, then switch identities in one click."
      width={820}
    >
      <div className="vault-grid">
        {settings.brands.map((brand) => (
          <button
            key={brand.id}
            type="button"
            className={`vault-card${settings.activeBrandId === brand.id ? ' is-active' : ''}`}
            onClick={() => onChange({ ...settings, activeBrandId: brand.id })}
          >
            <span className="vault-card__logo">
              {brand.logo ? <img src={brand.logo} alt="" /> : initialsOf(brand.brandName)}
            </span>
            <span className="vault-card__body">
              <span className="vault-card__name">{brand.name}</span>
              <span className="vault-card__brand">{brand.brandName}</span>
              <span className="vault-card__swatches">
                <i style={{ background: brand.primary }} />
                <i style={{ background: brand.accent }} />
                <em>{brand.handle}</em>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="vault-editor">
        <BrandPanel settings={settings} onChange={onChange} variant="vault" />
      </div>
    </Modal>
  )
}
