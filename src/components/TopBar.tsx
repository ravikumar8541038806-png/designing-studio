import { Icon } from './ui'
import { hasAi } from '../lib/visuals'
import { proxyOn } from '../lib/proxy'
import { providerPreset } from '../theme/presets'
import type { AppSettings, StudioTab } from '../types'

const TITLES: Record<StudioTab, { title: string; sub: string }> = {
  pdf: {
    title: 'PDF Notes, Reports & eBook Studio',
    sub: 'Prompt or notes → publication-grade A4 document',
  },
  carousel: {
    title: 'Carousels & Pitch Deck Studio',
    sub: 'Brief → social carousel or 16:9 client deck',
  },
}

export function TopBar({
  tab,
  settings,
  onPatch,
  onOpenSettings,
  brandLabel,
}: {
  tab: StudioTab
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => void
  onOpenSettings: () => void
  brandLabel: string
}) {
  const copy = TITLES[tab]
  const provider = providerPreset(settings.provider)
  const aiReady = hasAi(settings)

  const statusLabel = settings.directMode
    ? 'Direct Mode (Offline)'
    : proxyOn() && settings.provider === 'gemini'
      ? 'Cloud Proxy · Auto'
      : aiReady
        ? settings.autoModel
          ? `${provider.short} · Smart Auto`
          : `${provider.short} · Ready`
        : 'Connect AI'

  return (
    <header className="topbar glass">
      <div className="topbar__title">
        <span className="topbar__eyebrow">{copy.sub}</span>
        <h1 className="topbar__h">{copy.title}</h1>
      </div>

      <div className="topbar__right">
        <span className="topbar__brand" title={`Active brand: ${brandLabel}`}>
          <span className="topbar__dot" />
          {brandLabel}
        </span>

        <button type="button" className="chip" onClick={onOpenSettings} title="AI routing and connection settings">
          <Icon name="sparkles" size={14} />
          <span className="chip__text">{statusLabel}</span>
        </button>

        <button
          type="button"
          className={`lock-pill${settings.paymentLock ? ' is-on' : ''}`}
          onClick={() => onPatch({ paymentLock: !settings.paymentLock })}
          title="Toggle the draft watermark on every page and slide"
        >
          <Icon name={settings.paymentLock ? 'lock' : 'unlock'} size={14} />
          {settings.paymentLock ? 'Payment lock on' : 'Payment lock off'}
        </button>

        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Open AI settings">
          <Icon name="settings" size={17} />
        </button>
      </div>
    </header>
  )
}
