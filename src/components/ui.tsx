import { useEffect, useId, type ReactNode } from 'react'

type IconName =
  | 'doc'
  | 'slides'
  | 'vault'
  | 'settings'
  | 'download'
  | 'print'
  | 'lock'
  | 'unlock'
  | 'plus'
  | 'trash'
  | 'x'
  | 'check'
  | 'sparkles'
  | 'refresh'
  | 'upload'
  | 'image'
  | 'arrow'
  | 'copy'
  | 'chevron'

const PATHS: Record<IconName, ReactNode> = {
  doc: (
    <>
      <path d="M7 3h6l4 4v14H7z" />
      <path d="M13 3v5h5" />
      <path d="M9.5 12h5M9.5 15.5h5M9.5 8.5h2" />
    </>
  ),
  slides: (
    <>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M18 8.5v7.5a3 3 0 0 1-3 3H9" />
      <path d="M6.5 12h5M6.5 15h3" />
    </>
  ),
  vault: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8V7.4M12 16.6v-1.4M8.8 12H7.4M16.6 12h-1.4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h3M11 17h9" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="7" rx="2" />
      <path d="M7 13h10v7H7z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.6-1.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  sparkles: (
    <>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
      <path d="M18.5 16.5 19.2 19l2.3.7-2.3.7-.7 2.3" transform="translate(0,-2)" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19 4.5V9h-4.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20V9" />
      <path d="m7.5 13.5 4.5-4.5 4.5 4.5" />
      <path d="M5 4h14" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17 4.6-4.6 3.4 3.4 2.6-2.4 4.4 4.2" />
    </>
  ),
  arrow: <path d="M5 12h13m0 0-5-5m5 5-5 5" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
    </>
  ),
  chevron: <path d="m8 5 7 7-7 7" />,
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
    >
      {PATHS[name]}
    </svg>
  )
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  icon,
  disabled,
  type = 'button',
  full,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger'
  icon?: IconName
  disabled?: boolean
  type?: 'button' | 'submit'
  full?: boolean
  title?: string
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${full ? ' btn--full' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{children}</span>
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string
  hint?: string
  children: ReactNode
  id?: string
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  mono?: boolean
}) {
  return (
    <input
      className={`input${mono ? ' input--mono' : ''}`}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 8,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      className="textarea"
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; hint?: string }[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.hint}
          className={`segmented__item${option.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  const id = useId()
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <label htmlFor={id} className="toggle-row__label">
          {label}
        </label>
        {description ? <p className="toggle-row__desc">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  )
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b5bdb'
  return (
    <div className="color-field">
      <span className="field__label">{label}</span>
      <div className="color-field__row">
        <label className="color-field__swatch" style={{ background: safe }} htmlFor={id}>
          <input
            id={id}
            type="color"
            value={safe}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} colour picker`}
          />
        </label>
        <input
          className="input input--mono color-field__hex"
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 720,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="modal glass-strong" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <header className="modal__head">
          <div>
            <h2 className="modal__title">{title}</h2>
            {subtitle ? <p className="modal__sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={17} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {action}
    </div>
  )
}
