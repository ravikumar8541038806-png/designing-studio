import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Editable } from '../components/Editable'
import { updateSlide } from '../lib/docOps'
import { SLIDE_DIMS } from '../lib/pagination'
import { BrandMark, Watermark, paperVars } from './chrome'
import type { AppSettings, BrandPreset, Carousel, Slide } from '../types'

interface Props {
  carousel: Carousel
  settings: AppSettings
  brand: BrandPreset
  onChange: (carousel: Carousel) => void
  onRemoveSlide?: (index: number) => void
  onUploadSlideImage?: (index: number, file: File) => void
  onGenerateSlideImage?: (index: number) => void
  generatingSlideIndex?: number | null
  activeSlideIndex?: number
  onSelectSlide?: (index: number) => void
}

function SlideFrame({
  children,
  width,
  height,
}: {
  children: ReactNode
  width: number
  height: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      const clientW = host.clientWidth
      if (clientW > 0) setScale(clientW / width)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [width])

  return (
    <div className="slide-frame" ref={hostRef} style={{ height: height * scale }}>
      <div className="slide-scaler" style={{ width, height, transform: `scale(${scale})` }}>
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
  width,
  height,
  isGeneratingImage,
}: {
  slide: Slide
  index: number
  total: number
  settings: AppSettings
  brand: BrandPreset
  carousel: Carousel
  onChange: (carousel: Carousel) => void
  width: number
  height: number
  isGeneratingImage: boolean
}) {
  const vars = paperVars(settings, brand)
  const patch = (value: Partial<Slide>) => onChange(updateSlide(carousel, index, value))
  const imageLayout = slide.imageLayout ?? (slide.kind === 'hook' ? 'background' : 'split')
  const hasImg = Boolean(slide.image)
  const isBg = hasImg && imageLayout === 'background'
  const isSplit = (hasImg || isGeneratingImage) && imageLayout === 'split'
  const isTop = (hasImg || isGeneratingImage) && imageLayout === 'top'

  return (
    <article
      className={`slide slide--${slide.kind}${isBg ? ' slide--has-bg' : ''}`}
      data-slide={index}
      data-layout={settings.slideLayout}
      data-format={settings.slideFormat}
      data-header={settings.headerStyle}
      style={{ ...vars, width, height }}
    >
      <div className="slide__wash" aria-hidden="true" />
      <div className="slide__rings" aria-hidden="true" />

      {isBg ? (
        <div className="slide__bg-media" aria-hidden="true">
          <img src={slide.image} alt="" />
          <div className="slide__bg-scrim" />
        </div>
      ) : null}

      <header className={`slide__top slide__top--${settings.headerStyle}`}>
        <BrandMark brand={brand} />
        <span className="slide__count">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </header>

      <div
        className={`slide__content-wrap${isSplit ? ' slide__content-wrap--split' : isTop ? ' slide__content-wrap--top' : ''}`}
      >
        {isTop ? (
          <div className="slide__media">
            {hasImg ? (
              <img src={slide.image} alt={slide.headline || 'Slide visual'} />
            ) : (
              <div className="slide__img-loading no-export">Rendering slide visual…</div>
            )}
          </div>
        ) : null}

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

        {isSplit ? (
          <div className="slide__media">
            {hasImg ? (
              <img src={slide.image} alt={slide.headline || 'Slide visual'} />
            ) : (
              <div className="slide__img-loading no-export">Rendering slide visual…</div>
            )}
          </div>
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

export function SlideDeck({
  carousel,
  settings,
  brand,
  onChange,
  onRemoveSlide,
  onUploadSlideImage,
  onGenerateSlideImage,
  generatingSlideIndex,
  activeSlideIndex,
  onSelectSlide,
}: Props) {
  const dims = SLIDE_DIMS[settings.slideFormat] ?? SLIDE_DIMS.portrait
  const deckWidth = settings.slideFormat === 'deck' ? 'min(100%, 760px)' : 'min(100%, 560px)'

  const cycleLayout = (index: number, slide: Slide) => {
    const order: ('split' | 'top' | 'background')[] = ['split', 'top', 'background']
    const cur = slide.imageLayout ?? 'split'
    const next = order[(order.indexOf(cur) + 1) % order.length]
    onChange(updateSlide(carousel, index, { imageLayout: next }))
  }

  return (
    <div className="deck" style={{ width: deckWidth }}>
      {carousel.slides.map((slide, index) => (
        <div
          className={`deck-item${activeSlideIndex === index ? ' is-selected' : ''}`}
          key={slide.id}
          onClick={() => onSelectSlide?.(index)}
        >
          <div className="deck-item__bar no-export">
            <span className="deck-item__label">
              Slide {index + 1}
              <span className="deck-item__kind">{slide.kind}</span>
            </span>
            <div className="deck-item__actions">
              {onGenerateSlideImage ? (
                <button
                  type="button"
                  className="deck-item__btn"
                  disabled={generatingSlideIndex === index}
                  onClick={(e) => {
                    e.stopPropagation()
                    onGenerateSlideImage(index)
                  }}
                  title="Generate AI image for this slide"
                >
                  {generatingSlideIndex === index ? 'Rendering…' : slide.image ? '✦ Regen' : '✦ AI Image'}
                </button>
              ) : null}
              {onUploadSlideImage ? (
                <label className="deck-item__btn" title="Upload image to this slide" onClick={(e) => e.stopPropagation()}>
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onUploadSlideImage(index, file)
                      e.target.value = ''
                    }}
                  />
                </label>
              ) : null}
              {slide.image ? (
                <>
                  <button
                    type="button"
                    className="deck-item__btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      cycleLayout(index, slide)
                    }}
                    title="Cycle image placement (split / top / background)"
                  >
                    {slide.imageLayout ?? 'split'}
                  </button>
                  <button
                    type="button"
                    className="deck-item__btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onChange(updateSlide(carousel, index, { image: undefined }))
                    }}
                    title="Remove slide image"
                  >
                    Clear img
                  </button>
                </>
              ) : null}
              {onRemoveSlide ? (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveSlide(index)
                  }}
                  title="Remove slide"
                  aria-label={`Remove slide ${index + 1}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
          <SlideFrame width={dims.width} height={dims.height}>
            <SlideView
              slide={slide}
              index={index}
              total={carousel.slides.length}
              settings={settings}
              brand={brand}
              carousel={carousel}
              onChange={onChange}
              width={dims.width}
              height={dims.height}
              isGeneratingImage={generatingSlideIndex === index}
            />
          </SlideFrame>
        </div>
      ))}
    </div>
  )
}
