import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2
const STEP = 0.1
const FIT_FLOOR = 0.12

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))

interface Props {
  /** Intrinsic page/slide width in CSS pixels (794 for A4, 1080 for slides). */
  naturalWidth: number
  /** Selector used to walk preview items for page navigation. */
  itemSelector: string
  /** "Page" or "Slide" — shown in the navigator. */
  itemLabel: string
  children: ReactNode
}

export function PreviewStage({ naturalWidth, itemSelector, itemLabel, children }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<number | null>(null)
  const [scale, setScale] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [autoFit, setAutoFit] = useState(true)
  const [contentHeight, setContentHeight] = useState(0)
  const [count, setCount] = useState(1)
  const [current, setCurrent] = useState(0)
  const [focus, setFocus] = useState(false)

  /* Fit-to-width: measure the real viewport, never assume a panel size. */
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => {
      const style = getComputedStyle(viewport)
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const available = Math.max(viewport.clientWidth - padding, 80)
      const next = Math.min(1, Math.max(FIT_FLOOR, available / naturalWidth))
      setFitScale(next)
      if (autoFit) setScale(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
    // contentHeight is a dependency so a scrollbar appearing after the first
    // paint re-measures against the real content box instead of a stale width.
  }, [naturalWidth, autoFit, focus, contentHeight])

  /* Natural (unscaled) content height drives the scroll box so nothing is clipped. */
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => setContentHeight(content.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [itemSelector])

  useEffect(() => {
    const total = contentRef.current?.querySelectorAll(itemSelector).length ?? 0
    const next = Math.max(total, 1)
    if (next !== count) setCount(next)
    if (current > next - 1) setCurrent(0)
  })

  const items = useCallback(
    () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []),
    [itemSelector],
  )

  /* Keep the page counter in sync while the user scrolls. */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const sync = () => {
      const nodes = items()
      if (!nodes.length) return
      const line = viewport.getBoundingClientRect().top + 40
      let index = 0
      nodes.forEach((node, nodeIndex) => {
        if (node.getBoundingClientRect().top <= line) index = nodeIndex
      })
      setCurrent(index)
    }
    const onScroll = () => sync()
    viewport.addEventListener('scroll', onScroll, { passive: true })
    // Narrow layouts let the whole page scroll instead of the pane.
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [items])

  const zoomTo = useCallback((next: number) => {
    setAutoFit(false)
    setScale(clampZoom(next))
  }, [])

  const fitToWidth = useCallback(() => {
    setAutoFit(true)
    setScale(fitScale)
  }, [fitScale])

  /* Timer-driven scroll so page navigation stays smooth even in embedded or
     occluded browsers where requestAnimationFrame is paused. */
  const glide = useCallback((to: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const inner = viewport.scrollHeight > viewport.clientHeight + 4
    const read = () => (inner ? viewport.scrollTop : window.scrollY)
    const write = (value: number) => {
      if (inner) viewport.scrollTop = value
      else window.scrollTo(0, value)
    }
    const start = read()
    const distance = to - start
    if (Math.abs(distance) < 1) return
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
    const duration = Math.min(560, Math.max(240, Math.abs(distance) * 0.45))
    const started = performance.now()
    const step = () => {
      const progress = Math.min(1, (performance.now() - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      write(start + distance * eased)
      scrollTimer.current = progress < 1 ? window.setTimeout(step, 16) : null
    }
    step()
  }, [])

  useEffect(
    () => () => {
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current)
    },
    [],
  )

  const goTo = useCallback(
    (index: number) => {
      const viewport = viewportRef.current
      const nodes = items()
      if (!viewport || !nodes.length) return
      const target = nodes[Math.min(Math.max(index, 0), nodes.length - 1)]
      if (!target) return
      const inner = viewport.scrollHeight > viewport.clientHeight + 4
      const delta = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      const from = inner ? viewport.scrollTop : window.scrollY
      const max = inner
        ? viewport.scrollHeight - viewport.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight
      glide(Math.min(Math.max(from + delta - 14, 0), Math.max(max, 0)))
      setCurrent(nodes.indexOf(target))
    },
    [items, glide],
  )

  /* Ctrl / Cmd + wheel zooms like Figma instead of scrolling. */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setAutoFit(false)
      setScale((value) => clampZoom(value + (event.deltaY < 0 ? STEP : -STEP)))
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  /* Keyboard: ⌘/Ctrl +, −, 0 (fit), 1 (100%), Esc leaves focus mode. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (event.key === 'Escape' && focus) {
        setFocus(false)
        return
      }
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        zoomTo(scale + STEP)
      } else if (event.key === '-') {
        event.preventDefault()
        zoomTo(scale - STEP)
      } else if (event.key === '0') {
        event.preventDefault()
        fitToWidth()
      } else if (event.key === '1') {
        event.preventDefault()
        zoomTo(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, scale, zoomTo, fitToWidth])

  const percent = Math.round(scale * 100)
  const frameWidth = naturalWidth * scale
  const contentStyle = {
    width: naturalWidth,
    transform: `translateX(-50%) scale(${scale})`,
    '--pv-inv': String(1 / scale),
  } as CSSProperties

  return (
    <div className={`preview-stage${focus ? ' is-focus' : ''}`}>
      <div className="preview-scroll" ref={viewportRef}>
        <div
          className="zoom-frame"
          style={{ width: frameWidth, height: contentHeight ? contentHeight * scale : undefined }}
        >
          <div className="zoom-content" ref={contentRef} style={contentStyle}>
            {children}
          </div>
        </div>
      </div>

      <div className="preview-toolbar glass" role="toolbar" aria-label="Preview zoom and page controls">
        <button
          type="button"
          className="ptool ptool--icon"
          onClick={() => zoomTo(scale - STEP)}
          disabled={scale <= MIN_ZOOM}
          data-tip="Zoom out · ⌘−"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="ptool ptool--value"
          onClick={() => zoomTo(1)}
          data-tip="Actual size · ⌘1"
          aria-label={`Zoom ${percent} percent, reset to actual size`}
        >
          {percent}%
        </button>
        <button
          type="button"
          className="ptool ptool--icon"
          onClick={() => zoomTo(scale + STEP)}
          disabled={scale >= MAX_ZOOM}
          data-tip="Zoom in · ⌘+"
          aria-label="Zoom in"
        >
          +
        </button>

        <span className="preview-toolbar__sep" aria-hidden="true" />

        <button
          type="button"
          className={`ptool${autoFit ? ' is-active' : ''}`}
          onClick={fitToWidth}
          data-tip="Fit to width · ⌘0"
        >
          Fit
        </button>
        <button
          type="button"
          className="ptool"
          onClick={() => zoomTo(1)}
          data-tip="Actual size"
        >
          100%
        </button>

        <span className="preview-toolbar__sep" aria-hidden="true" />

        <button
          type="button"
          className="ptool ptool--icon"
          onClick={() => goTo(current - 1)}
          disabled={current <= 0}
          data-tip={`Previous ${itemLabel.toLowerCase()}`}
          aria-label={`Previous ${itemLabel.toLowerCase()}`}
        >
          ‹
        </button>
        <span className="ptool__count" aria-live="polite">
          {itemLabel} {current + 1} / {count}
        </span>
        <button
          type="button"
          className="ptool ptool--icon"
          onClick={() => goTo(current + 1)}
          disabled={current >= count - 1}
          data-tip={`Next ${itemLabel.toLowerCase()}`}
          aria-label={`Next ${itemLabel.toLowerCase()}`}
        >
          ›
        </button>

        <span className="preview-toolbar__sep" aria-hidden="true" />

        <button
          type="button"
          className={`ptool ptool--wide${focus ? ' is-active' : ''}`}
          onClick={() => setFocus((value) => !value)}
          data-tip={focus ? 'Exit focus · Esc' : 'Focus the preview'}
          aria-pressed={focus}
        >
          {focus ? 'Exit' : 'Focus'}
        </button>
      </div>
    </div>
  )
}
