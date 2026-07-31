import { useEffect, useState } from 'react'
import { Emblem } from './Emblem'
import { TITLE } from '../content/gameContent'
import { useGame } from '../store/gameStore'

/**
 * A deliberate few-second hold so the emblem and title land as a moment rather
 * than a flash — the game should feel like it is taking a breath before it
 * begins, not stalling.
 */
export const LOADING_HOLD_MS = 3200
export const LOADING_FADE_MS = 1050

/**
 * Boot screen. The progress bar reflects real work — waiting for the first
 * rendered frame — rather than a fabricated percentage, so it only shows a bar
 * at all once there is something honest to show.
 */
export function LoadingScreen() {
  const setPhase = useGame((s) => s.setPhase)
  const booted = useGame((s) => s.booted)
  const [ready, setReady] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!booted) return
    // Wait for two animation frames so the canvas has actually presented once,
    // then hold briefly so the emblem is not a flash. The timeout fallback
    // covers hidden/occluded tabs, where rAF never fires.
    let raf1 = 0
    let raf2 = 0
    const t = setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setReady(true))
      })
    }, LOADING_HOLD_MS)
    const fallback = setTimeout(() => setReady(true), LOADING_HOLD_MS + 1600)
    return () => {
      clearTimeout(t)
      clearTimeout(fallback)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [booted])

  useEffect(() => {
    if (!ready) return
    setLeaving(true)
    const t = setTimeout(() => setPhase('title'), LOADING_FADE_MS)
    return () => clearTimeout(t)
  }, [ready, setPhase])

  const progress = ready ? 100 : 35

  return (
    <div className="loading" style={{ opacity: leaving ? 0 : 1 }}>
      <div className="loading__inner">
        <Emblem className="emblem" stroke="#ffffff" />
        <h1 className="loading__title">{TITLE.main}</h1>
        <p className="loading__line">{TITLE.loadingLine}</p>
        <div
          className="loading__bar"
          role="progressbar"
          aria-label="Loading game"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i aria-hidden="true" style={{ width: `${progress}%` }} />
          <span
            className="loading__peach"
            aria-hidden="true"
            style={{ left: `${progress}%` }}
          >
            🍑
          </span>
        </div>
      </div>
    </div>
  )
}
