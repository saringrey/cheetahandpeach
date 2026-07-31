import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/gameStore'
import { runtime } from '../store/runtime'
import { recoverPlayerMovement } from '../game/character/movementRecovery'
import { MEMORIES } from '../content/memories'
import { CONSTELLATIONS } from '../content/constellations'
import { CHAPTER_ORDER } from '../game/save/save'
import type { ChapterId } from '../types'

const ENABLED = import.meta.env.VITE_ENABLE_DEBUG_TOOLS === 'true'

/**
 * Development-only tools. Stripped from the normal production build: the whole
 * component short-circuits on a compile-time constant, so bundlers drop it.
 */
export function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [recoveryStatus, setRecoveryStatus] = useState('')
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, force] = useState(0)
  const setChapter = useGame((s) => s.setChapter)
  const collectMemory = useGame((s) => s.collectMemory)
  const completeTownTask = useGame((s) => s.completeTownTask)
  const completeConstellation = useGame((s) => s.completeConstellation)
  const setEndingActive = useGame((s) => s.setEndingActive)
  const resetProgress = useGame((s) => s.resetProgress)
  const newGame = useGame((s) => s.newGame)
  const updateSettings = useGame((s) => s.updateSettings)
  const phase = useGame((s) => s.phase)

  // Debug-only probes for the end-to-end tests. `playerPos` is mutated in place,
  // so this is a live reference rather than a snapshot. Never present in a
  // normal build — ENABLED is a compile-time constant.
  useEffect(() => {
    if (!ENABLED) return
    const w = window as unknown as Record<string, unknown>
    w.__cp = runtime.playerPos
    w.__cpRuntime = runtime
    w.__cpStore = useGame.getState()
    const unsub = useGame.subscribe((st) => {
      w.__cpStore = st
    })
    return () => {
      unsub()
      delete w.__cp
      delete w.__cpStore
    }
  }, [])

  useEffect(() => {
    if (!ENABLED) return
    const onKey = (e: KeyboardEvent) => {
      // Shift + ~ , so a stray backtick during play cannot open it.
      if (e.code === 'Backquote' && e.shiftKey) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!ENABLED || !open) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [open])

  useEffect(
    () => () => {
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current)
    },
    [],
  )

  if (!ENABLED) return null

  if (!open) {
    return (
      <button
        type="button"
        className="debug"
        style={{ width: 'auto', padding: '4px 8px' }}
        onClick={() => setOpen(true)}
      >
        debug ⇧`
      </button>
    )
  }

  const jump = (c: ChapterId) => {
    if (phase !== 'playing') newGame()
    setTimeout(() => setChapter(c), 30)
  }

  const recoverMovement = () => {
    const result = recoverPlayerMovement()
    const detail = result.releasedHolds.length
      ? `released ${result.releasedHolds.join(', ')}`
      : 'controls cleared'
    setRecoveryStatus(`Movement reset — ${detail}`)
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current)
    recoveryTimer.current = setTimeout(() => setRecoveryStatus(''), 2600)
  }

  return (
    <div className="debug" data-testid="debug-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>DEBUG</strong>
        <button style={{ width: 'auto' }} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <h4>Performance</h4>
      <div className="debug__stat">
        <span>fps</span>
        <span>{runtime.fps.toFixed(0)}</span>
      </div>
      <div className="debug__stat">
        <span>frame</span>
        <span>{runtime.frameMs.toFixed(1)} ms</span>
      </div>
      <div className="debug__stat">
        <span>draws</span>
        <span>{runtime.drawCalls}</span>
      </div>
      <div className="debug__stat">
        <span>tris</span>
        <span>{(runtime.triangles / 1000).toFixed(0)}k</span>
      </div>
      <div className="debug__stat">
        <span>programs</span>
        <span>{runtime.shaderPrograms}</span>
      </div>
      <div className="debug__stat">
        <span>buffer</span>
        <span>
          {runtime.framebufferWidth}x{runtime.framebufferHeight} @{runtime.effectiveDpr.toFixed(2)}
        </span>
      </div>
      <div className="debug__stat" title={runtime.rendererName}>
        <span>renderer</span>
        <span>{runtime.rendererName.includes('Metal') ? 'Metal' : runtime.rendererName || '—'}</span>
      </div>
      <div className="debug__stat">
        <span>quality</span>
        <span>{runtime.activeQuality}</span>
      </div>
      <div className="debug__stat">
        <span>colliders</span>
        <span>{runtime.colliders.length}</span>
      </div>
      <div className="debug__stat">
        <span>pos</span>
        <span>
          {runtime.playerPos.x.toFixed(0)},{runtime.playerPos.y.toFixed(0)},
          {runtime.playerPos.z.toFixed(0)}
        </span>
      </div>

      <h4>Recovery</h4>
      <button data-testid="debug-reset-movement" onClick={recoverMovement}>
        Reset movement
      </button>
      {recoveryStatus ? (
        <div className="debug__notice" role="status">
          {recoveryStatus}
        </div>
      ) : null}

      <h4>Teleport</h4>
      {CHAPTER_ORDER.filter((c) => c !== 'ending').map((c) => (
        <button key={c} data-testid={`debug-jump-${c}`} onClick={() => jump(c)}>
          → {c}
        </button>
      ))}

      <h4>Progress</h4>
      <button
        data-testid="debug-unlock-memories"
        onClick={() => MEMORIES.forEach((m) => collectMemory(m.id))}
      >
        Unlock all memories
      </button>
      <button onClick={() => ['recipe', 'flowers', 'letter'].forEach(completeTownTask)}>
        Complete town tasks
      </button>
      <button onClick={() => CONSTELLATIONS.forEach((c) => completeConstellation(c.id))}>
        Complete constellations
      </button>
      <button data-testid="debug-ending" onClick={() => setEndingActive(true)}>
        Show ending overlay
      </button>
      <button onClick={resetProgress}>Reset save</button>

      <h4>Quality</h4>
      {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
        <button key={q} onClick={() => updateSettings({ quality: q })}>
          {q}
        </button>
      ))}
    </div>
  )
}
