import { useEffect, useRef, useState } from 'react'
import { Button, Field, Modal, TextInput, Toggle } from './ui'
import { AiError, listModels, pickDefaultModel, testModel } from '../lib/ai'
import { proxyOn, testProxy } from '../lib/proxy'
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
  const [proxyTesting, setProxyTesting] = useState(false)
  const [proxyResult, setProxyResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fetchedFor = useRef('')

  const known = catalog.some((model) => model.id === currentModel)
  const canConnect = Boolean(apiKey.trim()) || (settings.proxyEnabled && provider === 'gemini')

  useEffect(() => {
    if (!open) {
      fetchedFor.current = ''
      return
    }
    if (!canConnect) return
    const token = `${provider}:${apiKey.trim()}:${settings.proxyEnabled ? settings.proxyUrl : ''}`
    if (token === fetchedFor.current) return
    const timer = window.setTimeout(() => {
      fetchedFor.current = token
      void refreshModels()
    }, 650)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider, apiKey, settings.proxyEnabled, settings.proxyUrl])

  const patch = (patchValue: Partial<AppSettings>) => onChange({ ...settings, ...patchValue })

  const setProvider = (next: ProviderId) => {
    if (next === provider) return
    setTestResult(null)
    setFeedback(null)
    patch({ provider: next })
  }

  const setKey = (value: string) => {
    patch({ keys: { ...settings.keys, [provider]: value } })
  }

  const setModel = (value: string) => {
    setTestResult(null)
    patch({ models: { ...settings.models, [provider]: value } })
  }

  const runTest = async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const targetModel = settings.autoModel ? (catalog[0]?.id ?? currentModel) : currentModel
      const ms = await testModel(provider, apiKey, targetModel)
      setTestResult({ tone: 'ok', text: `✓ Connected and ready (${(ms / 1000).toFixed(1)}s)` })
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

  const runProxyTest = async () => {
    if (proxyTesting) return
    setProxyTesting(true)
    setProxyResult(null)
    const result = await testProxy()
    setProxyResult({ tone: result.ok ? 'ok' : 'error', text: result.message })
    setProxyTesting(false)
  }

  const refreshModels = async () => {
    if (!apiKey.trim() && !(proxyOn() && provider === 'gemini')) {
      setFeedback({ tone: 'error', text: 'Add an API key first — or enable the Cloudflare proxy.' })
      return
    }
    setRefreshing(true)
    setFeedback(null)
    try {
      const models = await listModels(provider, apiKey)
      const listed = models.some((model) => model.id === currentModel)
      const wasCatalogued = catalog.some((model) => model.id === currentModel)
      const nextModel =
        settings.autoModel || (!listed && wasCatalogued) || !currentModel.trim()
          ? pickDefaultModel(models)
          : currentModel
      onChange({
        ...settings,
        catalog: { ...settings.catalog, [provider]: models },
        models: { ...settings.models, [provider]: nextModel },
      })
      setFeedback({
        tone: 'ok',
        text: `${models.length} live models synced · auto-routing ready`,
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
      title="AI & Connection Settings"
      subtitle="Zero-friction routing: ClientForge automatically picks the fastest healthy model and silently fails over if one is busy."
      width={720}
      footer={
        <div className="modal__footer-row">
          <span className="modal__note">
            Keys stay in this browser (or on your Cloudflare Worker). Never uploaded anywhere else.
          </span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="modal__footer-row">
        <span className={`status-badge${canConnect ? '' : ' status-badge--warn'}`}>
          {settings.proxyEnabled && provider === 'gemini'
            ? '● Cloud Proxy active'
            : canConnect
              ? `● ${preset.short} connected`
              : '○ Add key or use Direct Mode'}
        </span>
        {canConnect ? (
          <Button variant="ghost" onClick={runTest} disabled={testing}>
            {testing ? 'Checking…' : 'Test connection'}
          </Button>
        ) : null}
      </div>

      {testResult ? (
        <p className={`inline-error${testResult.tone === 'ok' ? ' inline-error--ok' : ' inline-error--box'}`}>
          {testResult.text}
        </p>
      ) : null}

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
              <span
                className={`provider-card__dot${
                  settings.keys[item.id]?.trim() || (settings.proxyEnabled && item.id === 'gemini') ? ' is-set' : ''
                }`}
              />
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

      <Toggle
        label="Auto-Select Best Model & Silent Failover (Recommended)"
        description="Automatically uses the fastest stable model for writing and switches seamlessly if a model hits rate limits."
        checked={settings.autoModel}
        onChange={(next) => patch({ autoModel: next })}
      />

      <Toggle
        label="Keep the key on Cloudflare Proxy"
        description="Requests go through your Worker's /api/ai proxy. Nothing secret is stored in this browser."
        checked={settings.proxyEnabled}
        onChange={(next) => patch({ proxyEnabled: next })}
      />

      {settings.proxyEnabled ? (
        <div className="proxy-block">
          <Field
            label="Proxy URL"
            hint="Leave empty when this app is deployed on the same Worker (same origin)."
          >
            <TextInput
              value={settings.proxyUrl}
              onChange={(value) => patch({ proxyUrl: value })}
              placeholder="/api/ai or https://your-worker.workers.dev/api/ai"
              mono
            />
          </Field>
          <Field
            label="Proxy token (optional)"
            hint="Only if you set the PROXY_TOKEN secret on the Worker."
          >
            <TextInput
              value={settings.proxyToken}
              onChange={(value) => patch({ proxyToken: value })}
              type="password"
              placeholder="Shared token"
              mono
            />
          </Field>
          <div className="model-row">
            <Button variant="ghost" onClick={runProxyTest} disabled={proxyTesting}>
              {proxyTesting ? 'Testing…' : 'Test proxy'}
            </Button>
            {proxyResult ? (
              <span className={`inline-error${proxyResult.tone === 'ok' ? ' inline-error--ok' : ''}`}>
                {proxyResult.text}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="settings-hint">
        Need a key? Get one from{' '}
        <a href={preset.keyUrl} target="_blank" rel="noreferrer">
          {preset.name} console
        </a>
        . {provider === 'gemini' ? 'Gemini also powers AI images & 3D illustrations.' : 'Use Gemini for AI image generation, or paste/upload your own visuals.'}
      </p>

      <details className="settings-details" open={!settings.autoModel}>
        <summary>Advanced: manual model selection ({catalog.length} models)</summary>
        <Field label="Preferred model">
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
            <Button variant="ghost" icon="refresh" onClick={refreshModels} disabled={refreshing || !canConnect}>
              {refreshing ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          {known ? (
            <span className="model-note">{catalog.find((model) => model.id === currentModel)?.note ?? ''}</span>
          ) : null}
          <div className="custom-model">
            <TextInput
              value={currentModel}
              onChange={setModel}
              placeholder="Custom Model ID — e.g. gemini-2.5-flash"
              mono
            />
          </div>
        </Field>
      </details>

      {feedback ? (
        <p className={`inline-error${feedback.tone === 'ok' ? ' inline-error--ok' : ' inline-error--box'}`}>
          {feedback.text}
        </p>
      ) : null}
    </Modal>
  )
}
