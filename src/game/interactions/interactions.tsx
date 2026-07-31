import { useEffect, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { runtime, registerInteractable } from '../../store/runtime'
import { frameInput, takeInteractPress } from '../input/frame'
import { useGame } from '../../store/gameStore'
import { audio } from '../../systems/audio/audio'
import type { Interactable, InteractionVerb } from '../../types'
import { clamp01 } from '../../utils/math'

/**
 * Proximity interaction system.
 *
 * Scenes register interactables declaratively with <Interactable/> or
 * `useInteractable`. Once per frame this picks the single best candidate —
 * nearest, weighted toward whatever she is facing — and publishes exactly one
 * prompt. Nothing else writes to the prompt, so the HUD can never stack up.
 */

export function useInteractable(item: Interactable | null, deps: unknown[] = []) {
  const ref = useRef(item)
  ref.current = item
  useEffect(() => {
    if (!item) return
    // Register a stable proxy so the callback can change without re-registering.
    return registerInteractable({
      ...item,
      enabled: () => ref.current?.enabled?.() ?? true,
      onInteract: () => ref.current?.onInteract(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, ...deps])
}

interface InteractableProps {
  id: string
  verb: InteractionVerb
  label?: string
  position: [number, number, number]
  radius?: number
  priority?: number
  enabled?: () => boolean
  onInteract: () => void
  children?: React.ReactNode
}

/** Declarative wrapper — put it around (or next to) the mesh it belongs to. */
export function Interactable({
  id,
  verb,
  label,
  position,
  radius = 2.2,
  priority = 0,
  enabled,
  onInteract,
  children,
}: InteractableProps) {
  const cb = useRef({ enabled, onInteract })
  cb.current = { enabled, onInteract }

  const item = useMemo<Interactable>(
    () => ({
      id,
      verb,
      label,
      position,
      radius,
      priority,
      enabled: () => cb.current.enabled?.() ?? true,
      onInteract: () => cb.current.onInteract(),
    }),
    [id, verb, label, position[0], position[1], position[2], radius, priority],
  )

  useEffect(() => registerInteractable(item), [item])
  return <>{children}</>
}

/** Mounted once per scene. Drives prompt selection and the press/hold. */
export function InteractionDriver() {
  const holdRef = useRef(0)
  const activeId = useRef<string | null>(null)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useGame.getState()

    if (s.phase !== 'playing' || s.dialogue || !runtime.playerControlEnabled) {
      if (activeId.current !== null) {
        activeId.current = null
        holdRef.current = 0
        s.setPrompt(null)
      }
      return
    }

    // ── pick the best candidate ─────────────────────────────────────────
    let best: Interactable | null = null
    let bestScore = Infinity
    const px = runtime.playerPos.x
    const pz = runtime.playerPos.z
    const fx = Math.sin(runtime.playerFacing)
    const fz = Math.cos(runtime.playerFacing)

    for (const item of runtime.interactables.values()) {
      if (item.enabled && !item.enabled()) continue
      const dx = item.position[0] - px
      const dz = item.position[2] - pz
      const dist = Math.hypot(dx, dz)
      if (dist > item.radius) continue

      // Facing bonus: something she is looking at wins over something behind her.
      const facing = dist > 0.001 ? (dx / dist) * fx + (dz / dist) * fz : 1
      const score = dist * (1.35 - clamp01(facing) * 0.45) + (item.priority ?? 0)
      if (score < bestScore) {
        bestScore = score
        best = item
      }
    }

    if (!best) {
      if (activeId.current !== null) {
        activeId.current = null
        holdRef.current = 0
        s.setPrompt(null)
      }
      return
    }

    if (activeId.current !== best.id) {
      activeId.current = best.id
      holdRef.current = 0
      audio.cue('ui')
    }

    // ── press or hold ───────────────────────────────────────────────────
    const holdMode = s.settings.holdToInteract
    let fired = false

    if (holdMode) {
      if (frameInput.interactHeld) {
        holdRef.current = clamp01(holdRef.current + dt / 0.5)
        if (holdRef.current >= 1) {
          fired = true
          holdRef.current = 0
        }
      } else {
        holdRef.current = Math.max(0, holdRef.current - dt / 0.25)
      }
      // Consume the edge so a tap does not also fire in hold mode.
      takeInteractPress()
    } else if (takeInteractPress()) {
      fired = true
    }

    s.setPrompt({ verb: best.verb, label: best.label, hold: holdRef.current })

    if (fired) {
      runtime.idleSeconds = 0
      const target = best
      // Clear first so a handler that opens dialogue is not fighting the prompt.
      s.setPrompt(null)
      activeId.current = null
      target.onInteract()
    }
  })

  return null
}

/**
 * A memory / progress collectible that removes itself once taken.
 * Returns a lookAt point so the camera emphasis can frame it.
 */
export function useCollected(id: string): boolean {
  return useGame((st) => st.save.memories.includes(id))
}
