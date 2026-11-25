import { useId } from 'react'
import type { ReactElement } from 'react'

/** Natural size of every anatomical plate; labels are positioned in its units. */
export const PLATE_VIEW = { w: 640, h: 560 }

/**
 * Human heart, anterior four-chamber cut-away. Each chamber is drawn as its own
 * anatomical region inside a muscle rim, so the plate reads like a printed
 * biology figure rather than a stack of geometry primitives.
 */
function HeartPlate(): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${name}-${uid}`

  const vessel = (d: string, width: number, tone: 'blue' | 'red') => (
    <g key={d}>
      <path
        d={d}
        fill="none"
        stroke={tone === 'blue' ? '#4a7396' : '#8d3b46'}
        strokeOpacity={0.45}
        strokeWidth={width + 3.5}
        strokeLinecap="round"
      />
      <path d={d} fill="none" stroke={`url(#${id(tone)})`} strokeWidth={width} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.34}
        strokeWidth={Math.max(2, width * 0.26)}
        strokeLinecap="round"
        transform={`translate(-2 ${-width * 0.18})`}
      />
    </g>
  )

  return (
    <g>
      <defs>
        <linearGradient id={id('muscle')} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#c98b93" />
          <stop offset="0.42" stopColor="#ac6472" />
          <stop offset="1" stopColor="#773846" />
        </linearGradient>
        <radialGradient id={id('cavity')} cx="0.34" cy="0.26" r="0.86">
          <stop offset="0" stopColor="#f6d6d7" />
          <stop offset="0.5" stopColor="#e2aeb2" />
          <stop offset="1" stopColor="#b9747f" />
        </radialGradient>
        <linearGradient id={id('blue')} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#dceffc" />
          <stop offset="0.4" stopColor="#93c1e5" />
          <stop offset="1" stopColor="#4579ac" />
        </linearGradient>
        <linearGradient id={id('red')} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#f8cbcb" />
          <stop offset="0.4" stopColor="#dc8f96" />
          <stop offset="1" stopColor="#a64550" />
        </linearGradient>
        <radialGradient id={id('sheen')} cx="0.3" cy="0.2" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={id('soft')} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#5b2a33" floodOpacity="0.2" />
        </filter>
        <marker
          id={id('arrowBlue')}
          viewBox="0 0 12 12"
          refX="8"
          refY="6"
          markerWidth="13"
          markerHeight="13"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M 1 1 L 11 6 L 1 11 z" fill="#2f6ba8" />
        </marker>
        <marker
          id={id('arrowRed')}
          viewBox="0 0 12 12"
          refX="8"
          refY="6"
          markerWidth="13"
          markerHeight="13"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M 1 1 L 11 6 L 1 11 z" fill="#a83640" />
        </marker>
      </defs>

      {/* Vessels running behind the heart */}
      {vessel('M 296 18 C 296 70 296 140 298 200', 26, 'blue')}
      {vessel('M 186 520 C 198 486 224 428 258 358', 26, 'blue')}
      {vessel('M 356 148 C 320 130 274 126 222 132', 17, 'blue')}
      {vessel('M 362 144 C 404 130 458 132 510 148', 17, 'blue')}
      {vessel('M 92 236 C 140 240 192 246 246 252', 12, 'red')}
      {vessel('M 92 268 C 140 268 194 266 244 264', 12, 'red')}
      {vessel('M 578 212 C 550 218 530 226 510 234', 12, 'red')}
      {vessel('M 578 250 C 548 252 528 250 508 248', 12, 'red')}
      {vessel('M 436 140 C 448 180 452 220 448 258', 22, 'red')}

      {/* Muscle rim */}
      <g filter={`url(#${id('soft')})`}>
        <path
          d="M 246 250 C 250 206 292 182 340 180 C 390 178 444 192 480 218 C 518 246 540 300 540 354 C 540 410 514 456 476 488 C 446 514 404 528 368 524 C 338 521 316 508 306 486 C 288 448 260 420 240 392 C 222 366 214 332 216 296 C 218 274 230 260 246 250 Z"
          fill={`url(#${id('muscle')})`}
          stroke="#7c3b46"
          strokeWidth={2.2}
        />
      </g>

      {/* Four chambers, each with a myocardial wall ring */}
      {[
        'M 262 212 C 286 196 320 200 336 220 C 352 242 344 270 320 282 C 292 296 264 284 256 260 C 250 242 254 222 262 212 Z',
        'M 428 206 C 452 192 490 198 504 220 C 516 242 504 268 478 276 C 452 284 428 270 422 246 C 418 228 420 214 428 206 Z',
        'M 268 300 C 300 286 340 294 356 326 C 372 362 366 416 344 452 C 326 480 296 486 280 470 C 262 452 254 406 256 362 C 258 332 260 310 268 300 Z',
        'M 408 296 C 446 288 482 310 490 350 C 498 396 482 452 452 480 C 430 500 400 496 390 474 C 378 450 384 402 390 360 C 394 326 398 304 408 296 Z',
      ].map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke="#b56b78" strokeWidth={12} strokeLinejoin="round" />
          <path d={d} fill={`url(#${id('cavity')})`} stroke="#93505c" strokeWidth={1.3} />
        </g>
      ))}

      {/* Septum between the ventricles */}
      <path
        d="M 372 300 C 376 344 376 400 372 446"
        fill="none"
        stroke="#b06874"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* AV groove */}
      <path
        d="M 246 290 C 300 268 400 268 500 292"
        fill="none"
        stroke="#8f4a55"
        strokeOpacity={0.22}
        strokeWidth={7}
        strokeLinecap="round"
      />

      <ellipse cx="340" cy="330" rx="150" ry="130" fill={`url(#${id('sheen')})`} />

      {/* Muscle striations */}
      <g fill="none" strokeLinecap="round">
        <path d="M 254 330 C 276 316 292 340 286 382" stroke="#5f2a35" strokeOpacity={0.08} strokeWidth={3} />
        <path d="M 262 408 C 282 402 296 420 294 446" stroke="#5f2a35" strokeOpacity={0.07} strokeWidth={3} />
        <path d="M 496 330 C 476 320 462 344 466 388" stroke="#5f2a35" strokeOpacity={0.08} strokeWidth={3} />
        <path d="M 486 420 C 466 416 452 436 454 458" stroke="#5f2a35" strokeOpacity={0.07} strokeWidth={3} />
        <path d="M 300 226 C 320 214 344 222 350 244" stroke="#ffffff" strokeOpacity={0.1} strokeWidth={3} />
        <path d="M 448 220 C 468 212 488 222 492 244" stroke="#ffffff" strokeOpacity={0.1} strokeWidth={3} />
      </g>

      {/* Great vessels emerging from the heart */}
      {vessel('M 430 132 C 424 94 400 70 368 72 C 340 74 322 92 318 116', 22, 'red')}
      {vessel('M 342 72 L 336 32', 10, 'red')}
      {vessel('M 366 68 L 364 28', 10, 'red')}
      {vessel('M 390 74 L 394 34', 10, 'red')}
      {vessel('M 432 288 C 436 240 436 176 430 132', 24, 'red')}
      {vessel('M 352 292 C 348 240 352 184 358 148', 26, 'blue')}

      {/* Valves at the four orifices */}
      <g fill="none" stroke="#fbeadb" strokeWidth={3.6} strokeLinecap="round">
        <path d="M 314 292 C 322 310 338 312 346 298" />
        <path d="M 420 292 C 428 310 446 312 454 298" />
        <path d="M 340 284 C 346 298 360 298 366 284" />
        <path d="M 416 284 C 422 298 436 298 442 284" />
      </g>

      {/* Coronary vessels in the grooves */}
      <g fill="none" stroke="#a03c47" strokeOpacity={0.45} strokeLinecap="round" strokeWidth={2.3}>
        <path d="M 376 306 C 386 350 384 404 374 452" />
        <path d="M 282 302 C 268 344 264 396 272 440" />
        <path d="M 380 340 C 404 348 424 370 434 398" />
      </g>

      {/* Traced blood flow */}
      <g fill="none" strokeLinecap="round" strokeOpacity={0.55} strokeWidth={9}>
        <path d="M 296 56 C 296 104 297 150 300 186" stroke="#2f6ba8" markerEnd={`url(#${id('arrowBlue')})`} />
        <path d="M 208 486 C 222 450 240 416 256 386" stroke="#2f6ba8" markerEnd={`url(#${id('arrowBlue')})`} />
        <path d="M 306 276 C 316 282 324 288 330 294" stroke="#2f6ba8" markerEnd={`url(#${id('arrowBlue')})`} />
        <path
          d="M 306 420 C 328 392 344 340 350 304"
          stroke="#2f6ba8"
          markerEnd={`url(#${id('arrowBlue')})`}
        />
        <path d="M 366 152 C 400 140 448 138 492 146" stroke="#2f6ba8" markerEnd={`url(#${id('arrowBlue')})`} />
        <path d="M 348 152 C 316 140 280 136 244 140" stroke="#2f6ba8" markerEnd={`url(#${id('arrowBlue')})`} />

        <path d="M 562 218 C 540 224 522 230 508 236" stroke="#a83640" markerEnd={`url(#${id('arrowRed')})`} />
        <path d="M 452 292 C 446 302 440 310 436 320" stroke="#a83640" markerEnd={`url(#${id('arrowRed')})`} />
        <path
          d="M 448 446 C 468 408 468 350 450 306"
          stroke="#a83640"
          markerEnd={`url(#${id('arrowRed')})`}
        />
        <path d="M 434 260 C 436 214 434 168 432 134" stroke="#a83640" markerEnd={`url(#${id('arrowRed')})`} />
      </g>
    </g>
  )
}

export const PLATES: Record<string, () => ReactElement> = {
  heart: HeartPlate,
}
