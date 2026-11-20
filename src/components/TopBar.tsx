import { Icon } from './ui'
import { modelLabelFor } from '../lib/brands'
import { providerPreset } from '../theme/presets'
import type { AppSettings, StudioTab } from '../types'

const TITLES: Record<StudioTab, { title: string; sub: string }> = {
  pdf: {
    title: 'PDF Notes & eBook Studio',
    sub: 'Transcript → structured A4 document',
  },
  carousel: {
    title: 'Social Carousel Studio',
    sub: 'Source → 1080 × 1350 slide deck',
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

        <button type="button" className="chip" onClick={onOpenSettings} title="Change provider or model">
          <Icon name="sparkles" size={14} />
          <span className="chip__text">
            {provider.short} · {modelLabelFor(settings)}
          </span>
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

        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Open API settings">
          <Icon name="settings" size={17} />
        </button>
      </div>
    </header>
  )
}
