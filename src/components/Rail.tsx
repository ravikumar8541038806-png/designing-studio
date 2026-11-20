import { Icon } from './ui'
import type { StudioTab } from '../types'

const TABS: { id: StudioTab; label: string; icon: 'doc' | 'slides'; hint: string }[] = [
  { id: 'pdf', label: 'PDF Notes & eBooks', icon: 'doc', hint: 'A4 study notes and chapters' },
  { id: 'carousel', label: 'Social Carousels', icon: 'slides', hint: '1080 × 1350 slide decks' },
]

export function Rail({
  tab,
  onTab,
  onOpenVault,
  onOpenSettings,
  brandName,
}: {
  tab: StudioTab
  onTab: (tab: StudioTab) => void
  onOpenVault: () => void
  onOpenSettings: () => void
  brandName: string
}) {
  return (
    <aside className="rail glass">
      <div className="rail__brand">
        <span className="rail__logo">
          <Icon name="sparkles" size={18} />
        </span>
        <span className="rail__wordmark">
          ClientForge
          <em>Studio</em>
        </span>
      </div>

      <nav className="rail__nav" aria-label="Studios">
        <span className="rail__label">Production</span>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail__item${tab === item.id ? ' is-active' : ''}`}
            onClick={() => onTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            title={item.hint}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}

        <span className="rail__label rail__label--spaced">Workspace</span>
        <button type="button" className="rail__item" onClick={onOpenVault}>
          <Icon name="vault" size={17} />
          <span>Client Brand Vault</span>
        </button>
        <button type="button" className="rail__item" onClick={onOpenSettings}>
          <Icon name="settings" size={17} />
          <span>API Settings</span>
        </button>
      </nav>

      <div className="rail__foot">
        <div className="rail__active-brand">
          <span className="rail__active-label">Active brand</span>
          <span className="rail__active-name">{brandName}</span>
        </div>
        <p className="rail__note">Keys and drafts stay in this browser. No server, no uploads.</p>
        <span className="rail__version">V1 · Cloudflare ready</span>
      </div>
    </aside>
  )
}
