import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Editable } from '../components/Editable'
import { updateSlide } from '../lib/docOps'
import { SLIDE } from '../lib/pagination'
import { BrandMark, Watermark, paperVars } from './chrome'
import type { AppSettings, BrandPreset, Carousel, Slide } from '../types'

interface Props {
  carousel: Carousel
  settings: AppSettings
  brand: BrandPreset
  onChange: (carousel: Carousel) => void
  onRemoveSlide?: (index: number) => void
}

function SlideFrame({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      const width = host.clientWidth
      if (width > 0) setScale(width / SLIDE.width)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="slide-frame" ref={hostRef} style={{ height: SLIDE.height * scale }}>
      <div className="slide-scaler" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

function SlideView({
  slide,
  index,
  total,
  settings,
  brand,
  carousel,
  onChange,
}: {
  slide: Slide
  index: number
  total: number
  settings: AppSettings
  brand: BrandPreset
  carousel: Carousel
  onChange: (carousel: Carousel) => void
}) {
  const vars = paperVars(settings, brand)
  const patch = (value: Partial<Slide>) => onChange(updateSlide(carousel, index, value))

  return (
    <article
      className={`slide slide--${slide.kind}`}
      data-slide={index}
      data-layout={settings.slideLayout}
      data-header={settings.headerStyle}
      style={vars}
    >
      <div className="slide__wash" aria-hidden="true" />
      <div className="slide__rings" aria-hidden="true" />

      <header className={`slide__top slide__top--${settings.headerStyle}`}>
        <BrandMark brand={brand} />
        <span className="slide__count">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </header>

      <div className="slide__body">
        <Editable
          as="span"
          className="slide__eyebrow"
          value={slide.eyebrow}
          placeholder="LABEL"
          onChange={(value) => patch({ eyebrow: value })}
        />
        <Editable
          as="h2"
          className="slide__headline"
          value={slide.headline}
          multiline
          placeholder="Headline"
          onChange={(value) => patch({ headline: value })}
        />
        {slide.subhook || slide.kind !== 'cta' ? (
          <Editable
            as="p"
            className="slide__subhook"
            value={slide.subhook}
            multiline
            placeholder="Supporting line"
            onChange={(value) => patch({ subhook: value })}
          />
        ) : null}

        {slide.points.length ? (
          slide.numbered ? (
            <ol className="slide__points slide__points--numbered">
              {slide.points.map((point, pointIndex) => (
                <li key={pointIndex}>
                  <span className="slide__point-num">{String(pointIndex + 1).padStart(2, '0')}</span>
                  <Editable
                    as="span"
                    value={point}
                    multiline
                    onChange={(value) =>
                      patch({ points: slide.points.map((p, i) => (i === pointIndex ? value : p)) })
                    }
                  />
                </li>
              ))}
            </ol>
          ) : (
            <ul className="slide__points">
              {slide.points.map((point, pointIndex) => (
                <li key={pointIndex}>
                  <span className="slide__point-dot" aria-hidden="true" />
                  <Editable
                    as="span"
                    value={point}
                    multiline
                    onChange={(value) =>
                      patch({ points: slide.points.map((p, i) => (i === pointIndex ? value : p)) })
                    }
                  />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {slide.kind === 'cta' ? (
          <span className="slide__cta">
            <Editable
              as="span"
              value={slide.cta}
              placeholder="Call to action"
              onChange={(value) => patch({ cta: value })}
            />
            <span className="slide__cta-arrow" aria-hidden="true">
              →
            </span>
          </span>
        ) : null}
      </div>

      <footer className="slide__foot">
        <span className="slide__foot-name">{brand.brandName}</span>
        <span className="slide__foot-handle">{brand.handle}</span>
      </footer>

      {settings.paymentLock ? <Watermark text={brand.watermark} /> : null}
    </article>
  )
}

export function SlideDeck({ carousel, settings, brand, onChange, onRemoveSlide }: Props) {
  return (
    <div className="deck">
      {carousel.slides.map((slide, index) => (
        <div className="deck-item" key={slide.id}>
          <div className="deck-item__bar">
            <span className="deck-item__label">
              Slide {index + 1}
              <span className="deck-item__kind">{slide.kind}</span>
            </span>
            {onRemoveSlide ? (
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                onClick={() => onRemoveSlide(index)}
                title="Remove slide"
                aria-label={`Remove slide ${index + 1}`}
              >
                ×
              </button>
            ) : null}
          </div>
          <SlideFrame>
            <SlideView
              slide={slide}
              index={index}
              total={carousel.slides.length}
              settings={settings}
              brand={brand}
              carousel={carousel}
              onChange={onChange}
            />
          </SlideFrame>
        </div>
      ))}
    </div>
  )
}
