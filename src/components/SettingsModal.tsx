import { useEffect, useState } from 'react'
import { Button, Field, Modal, TextInput } from './ui'
import { AiError, listModels } from '../lib/ai'
import { PROVIDERS, providerPreset } from '../theme/presets'
import type { AppSettings, ProviderId } from '../types'

export function SettingsModal({
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
  const provider = settings.provider
  const preset = providerPreset(provider)
  const apiKey = settings.keys[provider]
  const currentModel = settings.models[provider]
  const catalog = settings.catalog[provider]
  const [reveal, setReveal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [customOverride, setCustomOverride] = useState(false)

  const known = catalog.some((model) => model.id === currentModel)
  const customMode = customOverride || !known

  useEffect(() => {
    setFeedback(null)
    setCustomOverride(false)
  }, [provider])

  const patch = (patchValue: Partial<AppSettings>) => onChange({ ...settings, ...patchValue })

  const setProvider = (next: ProviderId) => {
    if (next === provider) return
    patch({ provider: next })
  }

  const setKey = (value: string) => {
    patch({ keys: { ...settings.keys, [provider]: value } })
  }

  const setModel = (value: string) => {
    patch({ models: { ...settings.models, [provider]: value } })
  }

  const refreshModels = async () => {
    setRefreshing(true)
    setFeedback(null)
    try {
      const models = await listModels(provider, apiKey)
      const keep = models.some((model) => model.id === currentModel)
      onChange({
        ...settings,
        catalog: { ...settings.catalog, [provider]: models },
        models: { ...settings.models, [provider]: keep ? currentModel : models[0].id },
      })
      setFeedback({ tone: 'ok', text: `${models.length} models loaded from ${preset.name}.` })
    } catch (error) {
      const text =
        error instanceof AiError
          ? `${error.message}${error.hint ? ` ${error.hint}` : ''}`
          : error instanceof Error
            ? error.message
            : 'Could not load models.'
      setFeedback({ tone: 'error', text })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="API Settings"
      subtitle="Bring your own key. Requests go straight from this browser to the provider — there is no server in between."
      width={720}
      footer={
        <div className="modal__footer-row">
          <span className="modal__note">
            Stored in this browser only. Clear a key any time and it is gone.
          </span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="provider-grid">
        {PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`provider-card${provider === item.id ? ' is-active' : ''}`}
            onClick={() => setProvider(item.id)}
          >
            <span className="provider-card__head">
              <span className="provider-card__name">{item.name}</span>
              <span className={`provider-card__dot${settings.keys[item.id]?.trim() ? ' is-set' : ''}`} />
            </span>
            <span className="provider-card__note">{item.note}</span>
          </button>
        ))}
      </div>

      <Field label={preset.keyLabel} hint={preset.note}>
        <div className="key-row">
          <TextInput
            value={apiKey}
            onChange={setKey}
            type={reveal ? 'text' : 'password'}
            placeholder={`Paste your ${preset.short} key`}
            mono
          />
          <button type="button" className="icon-btn" onClick={() => setReveal(!reveal)} title={reveal ? 'Hide key' : 'Show key'}>
            {reveal ? 'Hide' : 'Show'}
          </button>
          {apiKey ? (
            <button type="button" className="icon-btn" onClick={() => setKey('')} title="Clear key">
              Clear
            </button>
          ) : null}
        </div>
      </Field>

      <p className="settings-hint">
        Get a key from{' '}
        <a href={preset.keyUrl} target="_blank" rel="noreferrer">
          {preset.name} console
        </a>
        . {provider === 'anthropic' ? 'Claude accepts direct browser calls with its browser-access header; organisations with zero data retention block them.' : 'Gemini accepts direct browser calls.'}
      </p>

      <Field label="Model" hint="Nothing is hardcoded — refresh from the provider or type any model id.">
        <div className="model-row">
          <select
            className="select"
            value={customMode ? '__custom__' : currentModel}
            onChange={(event) => {
              if (event.target.value === '__custom__') {
                setCustomOverride(true)
                return
              }
              setCustomOverride(false)
              setModel(event.target.value)
            }}
          >
            {catalog.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.id}
              </option>
            ))}
            <option value="__custom__">Custom model id…</option>
          </select>
          <Button variant="ghost" icon="refresh" onClick={refreshModels} disabled={refreshing || !apiKey.trim()}>
            {refreshing ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        {customMode ? (
          <div className="custom-model">
            <TextInput value={currentModel} onChange={setModel} placeholder="e.g. your-provider-model-id" mono />
          </div>
        ) : null}
      </Field>

      {feedback ? (
        <p className={`inline-error${feedback.tone === 'ok' ? ' inline-error--ok' : ' inline-error--box'}`}>
          {feedback.text}
        </p>
      ) : null}
    </Modal>
  )
}
