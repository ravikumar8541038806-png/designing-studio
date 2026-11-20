import { createElement, useEffect, useRef } from 'react'
import type { KeyboardEvent, ClipboardEvent, CSSProperties } from 'react'

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ESCAPE_MAP[char] ?? char)
}

/** Renders `**bold**` markup and newlines to safe inline HTML. */
export function inlineHtml(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => {
      const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4
      const body = bold ? part.slice(2, -2) : part
      const safe = escapeHtml(body).replace(/\n/g, '<br>')
      return bold ? `<strong>${safe}</strong>` : safe
    })
    .join('')
}

/** Reads edited DOM back into `**bold**` plain text. */
export function readEditable(root: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
      return
    }
    if (!(node instanceof HTMLElement)) return
    const tag = node.tagName
    if (tag === 'BR') {
      out += '\n'
      return
    }
    if (tag === 'STRONG' || tag === 'B') {
      const inner = (node.textContent ?? '').trim()
      out += inner ? `**${inner}**` : ''
      return
    }
    const isBlock = tag === 'DIV' || tag === 'P'
    if (isBlock && out && !out.endsWith('\n')) out += '\n'
    node.childNodes.forEach(walk)
  }
  root.childNodes.forEach(walk)
  return out.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export interface EditableProps {
  value: string
  onChange: (value: string) => void
  as?: 'div' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'li' | 'figcaption' | 'cite'
  className?: string
  placeholder?: string
  multiline?: boolean
  style?: CSSProperties
  ariaLabel?: string
}

export function Editable({
  value,
  onChange,
  as = 'div',
  className = '',
  placeholder = 'Click to edit',
  multiline = false,
  style,
  ariaLabel,
}: EditableProps) {
  const ref = useRef<HTMLElement | null>(null)
  const focused = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || focused.current) return
    const html = inlineHtml(value)
    if (el.innerHTML !== html) el.innerHTML = html
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (el) el.setAttribute('data-placeholder', placeholder)
  }, [placeholder])

  const handleBlur = () => {
    focused.current = false
    const el = ref.current
    if (!el) return
    const next = readEditable(el)
    if (next !== value) onChange(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Enter' && (!multiline || (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  return createElement(as, {
    ref,
    className: `cf-edit ${className}`.trim(),
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    role: 'textbox',
    'aria-label': ariaLabel || placeholder,
    style,
    onFocus: () => {
      focused.current = true
    },
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onPaste: handlePaste,
  })
}
