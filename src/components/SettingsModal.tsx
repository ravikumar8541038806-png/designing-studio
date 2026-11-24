import { useEffect, useRef, useState } from 'react'
import { Button, Field, Modal, TextInput } from './ui'
import { AiError, listModels, pickDefaultModel, testModel } from '../lib/ai'
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
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fetchedFor = useRef('')

  const known = catalog.some((model) => model.id === currentModel)

  useEffect(() => {
    if (!open) {
      fetchedFor.current = ''
      return
    }
    const key = apiKey.trim()
    if (!key) return
    const token = `${provider}:${key}`
    if (token === fetchedFor.current) return
    // Opening the panel, or pasting a key, reads the live list so no stale
    // hardcoded default is ever used.
    const timer = window.setTimeout(() => {
      fetchedFor.current = token
      void refreshModels()
    }, 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider, apiKey])

  const patch = (patchValue: Partial<AppSettings>) => onChange({ ...settings, ...patchValue })

  const setProvider = (next: ProviderId) => {
    if (next === provider) return
    patch({ provider: next })
  }

  const setKey = (value: string) => {
    patch({ keys: { ...settings.keys, [provider]: value } })
  }

  const setModel = (value: string) => {
    setTestResult(null)
    patch({ models: { ...settings.models, [provider]: value } })
  }

  /** Two-second ping: proves the model answers before a real generation waits. */
  const runTest = async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const ms = await testModel(provider, apiKey, currentModel)
      setTestResult({ tone: 'ok', text: `✓ Ready (${(ms / 1000).toFixed(1)}s)` })
    } catch (error) {
      const text =
        error instanceof AiError
          ? `${error.message}${error.hint ? ` ${error.hint}` : ''}`
          : error instanceof Error
            ? error.message
            : 'Test failed.'
      setTestResult({ tone: 'error', text })
    } finally {
      setTesting(false)
    }
  }

  const refreshModels = async () => {
    if (!apiKey.trim()) {
      setFeedback({ tone: 'error', text: 'Add an API key first — the list is read from your account.' })
      return
    }
    setRefreshing(true)
    setFeedback(null)
    try {
      const models = await listModels(provider, apiKey)
      const listed = models.some((model) => model.id === currentModel)
      const wasCatalogued = catalog.some((model) => model.id === currentModel)
      // Keep a hand-typed id; replace anything that the account no longer offers.
      const nextModel = listed || (!wasCatalogued && currentModel.trim()) ? currentModel : pickDefaultModel(models)
      onChange({
        ...settings,
        catalog: { ...settings.catalog, [provider]: models },
        models: { ...settings.models, [provider]: nextModel },
      })
      setFeedback({
        tone: 'ok',
        text: `${models.length} models loaded · using ${nextModel}`,
      })
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

      <Field
        label="Model"
        hint={
          provider === 'gemini'
            ? 'Live from your account, fast stable Flash models first. Nothing is hardcoded.'
            : 'Refresh to read the models your key can use.'
        }
      >
        <div className="model-row">
          <select
            className="select"
            value={known ? currentModel : '__custom__'}
            onChange={(event) => {
              if (event.target.value === '__custom__') return
              setModel(event.target.value)
            }}
          >
            {catalog.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.id}
              </option>
            ))}
            <option value="__custom__">Custom model ID…</option>
          </select>
          <Button variant="ghost" icon="refresh" onClick={refreshModels} disabled={refreshing || !apiKey.trim()}>
            {refreshing ? 'Loading…' : 'Refresh'}
          </Button>
          <Button
            variant="ghost"
            onClick={runTest}
            disabled={testing || !apiKey.trim() || !currentModel.trim()}
            title="Send a tiny “Reply OK” ping and time the answer"
          >
            {testing ? 'Testing…' : 'Test'}
          </Button>
        </div>
        {testResult ? (
          <p className={`inline-error${testResult.tone === 'ok' ? ' inline-error--ok' : ' inline-error--box'}`}>
            {testResult.text}
          </p>
        ) : null}
        {known ? (
          <span className="model-note">{catalog.find((model) => model.id === currentModel)?.note ?? ''}</span>
        ) : null}
        <div className="custom-model">
          <TextInput
            value={currentModel}
            onChange={setModel}
            placeholder="Custom Model ID — e.g. gemini-flash-latest"
            mono
          />
        </div>
      </Field>

      {feedback ? (
        <p className={`inline-error${feedback.tone === 'ok' ? ' inline-error--ok' : ' inline-error--box'}`}>
          {feedback.text}
        </p>
      ) : null}
    </Modal>
  )
}
