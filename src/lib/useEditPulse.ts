import { useCallback, useEffect, useRef, useState } from 'react'

/** Debounced "Edited → Saved" signal for the preview header badge. */
export function useEditPulse() {
  const [state, setState] = useState<'idle' | 'editing' | 'saved'>('idle')
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const pulse = useCallback(() => {
    setState('editing')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('saved'), 850)
  }, [])

  return { state, pulse }
}
