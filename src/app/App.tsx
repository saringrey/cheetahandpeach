import { useEffect, useRef } from 'react'
import { GameCanvas } from './GameCanvas'
import { useGame } from '../store/gameStore'
import { audio } from '../systems/audio/audio'
import { exitPointerLock } from '../game/input/input'
import { LoadingScreen } from '../ui/LoadingScreen'
import { TitleMenu } from '../ui/TitleMenu'
import { Hud } from '../ui/Hud'
import { PauseMenu } from '../ui/PauseMenu'
import { Journal } from '../ui/Journal'
import { Credits } from '../ui/Credits'
import { EndingOverlay } from '../ui/EndingOverlay'
import { DebugPanel } from '../ui/DebugPanel'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Sketchbook } from '../ui/Sketchbook'

export function App() {
  const phase = useGame((s) => s.phase)
  const booted = useGame((s) => s.booted)
  const boot = useGame((s) => s.boot)
  const settings = useGame((s) => s.settings)
  const textScale = settings.textScale
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    boot()
  }, [boot])

  // Keep the audio engine's mix in step with the settings menu.
  useEffect(() => {
    audio.applySettings(settings)
  }, [settings])

  // Accessibility: text scale is a CSS custom property so every overlay follows it.
  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(textScale))
    document.documentElement.classList.toggle('high-contrast', settings.highContrastPrompts)
  }, [textScale, settings.highContrastPrompts])

  // Pointer lock follows the phase: locked while playing, released in every menu.
  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    if (phase !== 'playing') exitPointerLock()
  }, [phase])

  // The first click anywhere is the gesture that unlocks Web Audio.
  useEffect(() => {
    const start = () => {
      void audio.init()
    }
    window.addEventListener('pointerdown', start, { once: true })
    window.addEventListener('keydown', start, { once: true })
    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
  }, [])

  const onShellPointerDown = () => {
    // The view is turned by dragging, so the pointer is never captured.
    void audio.init()
  }

  return (
    <ErrorBoundary>
      <div className="shell" ref={shellRef} onPointerDown={onShellPointerDown}>
        <GameCanvas />

        {!booted || phase === 'boot' ? <LoadingScreen /> : null}
        {phase === 'title' ? <TitleMenu /> : null}
        {phase === 'playing' || phase === 'journal' || phase === 'paused' ? <Hud /> : null}
        {phase === 'paused' ? <PauseMenu /> : null}
        {phase === 'journal' ? <Journal /> : null}
        {phase === 'credits' ? <Credits /> : null}
        <Sketchbook />
        <EndingOverlay />
        <DebugPanel />
      </div>
    </ErrorBoundary>
  )
}
