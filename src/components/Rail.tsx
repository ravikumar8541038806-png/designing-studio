import { Icon } from './ui'
import type { StudioTab } from '../types'

const TABS: { id: StudioTab; label: string; icon: 'doc' | 'slides'; hint: string }[] = [
  { id: 'pdf', label: 'PDFs & eBooks', icon: 'doc', hint: 'A4 reports, notes, eBooks and proposals' },
  { id: 'carousel', label: 'Carousels & Decks', icon: 'slides', hint: '4:5 carousels, 1:1 posts & 16:9 pitch decks' },
]

export function Rail({
  tab,
  onTab,
  onOpenVault,
  onOpenSettings,
  brandName,
  compact,
  onToggleCompact,
}: {
  tab: StudioTab
  onTab: (tab: StudioTab) => void
  onOpenVault: () => void
  onOpenSettings: () => void
  brandName: string
  compact?: boolean
  onToggleCompact?: () => void
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
        {onToggleCompact ? (
          <button
            type="button"
            className="rail__collapse"
            onClick={onToggleCompact}
            title={compact ? 'Expand sidebar' : 'Collapse sidebar for wider preview'}
            aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {compact ? '›' : '‹'}
          </button>
        ) : null}
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
        <button type="button" className="rail__item" onClick={onOpenVault} title="Client Brand Vault">
          <Icon name="vault" size={17} />
          <span>Client Brand Vault</span>
        </button>
        <button type="button" className="rail__item" onClick={onOpenSettings} title="AI Settings">
          <Icon name="settings" size={17} />
          <span>AI Settings</span>
        </button>
      </nav>

      <div className="rail__foot">
        <div className="rail__active-brand">
          <span className="rail__active-label">Active brand</span>
          <span className="rail__active-name">{brandName}</span>
        </div>
        <p className="rail__note">Drafts &amp; assets saved locally in IndexedDB.</p>
        <span className="rail__version">Studio V2 · Ready</span>
      </div>
    </aside>
  )
}
