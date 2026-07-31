import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { runtime, type Bounds } from '../store/runtime'
import { useGame } from '../store/gameStore'
import { audio, type AmbienceId, type MusicId } from '../systems/audio/audio'
import {
  SkyDome,
  Lighting,
  Mist,
  AtmosphericBeams,
} from '../systems/environment/Environment'
import { WindDriver } from '../systems/environment/nature'
import { CharacterController } from '../game/character/CharacterController'
import { FollowCamera } from '../game/camera/FollowCamera'
import { InteractionDriver } from '../game/interactions/interactions'
import { GuideWisps } from '../systems/particles/Particles'
import { director } from '../game/camera/director'
import { LOVE_WHISPERS, LOVE_WHISPER_AT } from '../content/whispers'
import type { Palette } from '../systems/environment/palettes'
import type { ChapterId } from '../types'
import { damp } from '../utils/math'

/**
 * Installs the scene's ground and play area BEFORE any child registers a
 * collider. It is rendered as the first child so its layout effect runs first —
 * React fires layout effects depth-first in tree order.
 */
function WorldSetup({
  height,
  bounds,
}: {
  height: (x: number, z: number) => number
  bounds: Bounds
}) {
  // The dependencies are the bounds VALUES, not the bounds object. Scenes pass
  // an object literal, so depending on its identity would re-run this on every
  // re-render — and this effect CLEARS every collider and interactable in the
  // scene. Children register theirs once on mount and never re-register, so a
  // single re-render (petting the cat, finishing a task, a stage change) would
  // silently empty the world: solid things stop being solid and prompts vanish.
  const { minX, maxX, minZ, maxZ } = bounds

  useLayoutEffect(() => {
    runtime.sampleHeight = height
    runtime.bounds = { minX, maxX, minZ, maxZ }
    runtime.colliders = []
    runtime.interactables.clear()
    runtime.idleSeconds = 0
    runtime.chapterSeconds = 0
    runtime.objective = null
    return () => {
      runtime.colliders = []
      runtime.interactables.clear()
      runtime.sampleHeight = () => 0
    }
  }, [height, minX, maxX, minZ, maxZ])
  return null
}

/**
 * Last line of defence against a leaked control hold.
 *
 * Control is held by name and every holder releases its own (see
 * `runtime.holdControl`). If one ever fails to — a cinematic promise that never
 * settles, a scene torn down mid-beat, a timer cancelled by a reload — the
 * player is stranded on a world she cannot walk in, with no way out but a
 * refresh. This notices that the disabled flag disagrees with an empty hold set
 * and hands control back.
 *
 * It can only ever RESTORE control, never take it, so it cannot fight a
 * legitimate hold.
 */
function ControlWatchdog() {
  useFrame(() => {
    if (!runtime.playerControlEnabled && runtime.controlHolds.size === 0) {
      runtime.playerControlEnabled = true
    }
  })
  return null
}

/** Fades the screen in from black when a chapter starts. */
function FadeIn({ seconds = 1.4 }: { seconds?: number }) {
  const t = useRef(0)
  useEffect(() => {
    useGame.getState().setFade(1)
  }, [])
  useFrame((_, rawDt) => {
    if (t.current >= seconds) return
    t.current += Math.min(rawDt, 0.05)
    useGame.getState().setFade(1 - Math.min(1, t.current / seconds))
  })
  return null
}

/** Autosaves the player's position at a sensible cadence, never per frame. */
/**
 * His voice, once, at the middle of the chapter.
 *
 * "Halfway" is measured as distance travelled toward the objective rather than
 * elapsed time, because a player who lingers has not got halfway anywhere — and
 * a whisper that fires while she is still reading the chapter card is a whisper
 * nobody hears. It arms only once she has actually started moving, waits for a
 * quiet moment (no dialogue, no cinematic, no murmur on screen), and fires once
 * per chapter.
 */
function LoveWhisper({ chapter }: { chapter: ChapterId }) {
  const fired = useRef(false)
  const start = useRef<{ x: number; z: number } | null>(null)
  const startDistance = useRef(0)

  useFrame(() => {
    if (fired.current) return
    const line = LOVE_WHISPERS[chapter]
    if (!line) return

    const objective = runtime.objective
    if (!objective) return

    // Anchor on the first frame she has an objective and is actually walking.
    if (!start.current) {
      if (runtime.playerSpeed < 0.4) return
      start.current = { x: runtime.playerPos.x, z: runtime.playerPos.z }
      startDistance.current = Math.hypot(
        objective.x - runtime.playerPos.x,
        objective.z - runtime.playerPos.z,
      )
      // A chapter that begins on top of its objective has no midpoint to find.
      if (startDistance.current < 8) start.current = null
      return
    }

    const remaining = Math.hypot(
      objective.x - runtime.playerPos.x,
      objective.z - runtime.playerPos.z,
    )
    const progress = 1 - remaining / startDistance.current
    if (progress < LOVE_WHISPER_AT) return

    const s = useGame.getState()
    if (s.phase !== 'playing' || s.dialogue || s.cinematic) return
    fired.current = true
    s.showWhisper(line, 'love')
  })

  return null
}

function CheckpointSaver({ every = 12 }: { every?: number }) {
  const acc = useRef(0)
  const lastPos = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const s = useGame.getState()
    if (s.phase !== 'playing' || s.cinematic) return
    acc.current += dt
    if (acc.current < every) return
    acc.current = 0
    // Only write if she has actually gone somewhere.
    if (lastPos.current.distanceTo(runtime.playerPos) < 3) return
    lastPos.current.copy(runtime.playerPos)
    s.setCheckpoint(
      [runtime.playerPos.x, runtime.playerPos.y, runtime.playerPos.z],
      runtime.playerFacing,
    )
    s.persist()
  })
  return null
}

/** Smoothly steers the follow distance for contextual framing. */
export function CameraFraming({ distance = 5.2, lookHeight = 0.82 }: { distance?: number; lookHeight?: number }) {
  useFrame((_, dt) => {
    runtime.camDistanceTarget = distance
    runtime.camLookHeight = damp(runtime.camLookHeight, lookHeight, 3, dt)
  })
  return null
}

export interface SceneKitProps {
  chapter: ChapterId
  palette: Palette
  height: (x: number, z: number) => number
  bounds: Bounds
  spawn: { position: [number, number, number]; facing: number }
  ambience: AmbienceId
  music: MusicId
  /** Star intensity on the sky dome, 0..1. */
  stars?: number
  /** Wind strength for grass, canopies and chimes. */
  wind?: number
  surface?: 'grass' | 'wood' | 'stone' | 'gravel' | 'asphalt' | 'water'
  /** Set false in scenes that place the character themselves (e.g. the raft). */
  withCharacter?: boolean
  /** Show the gentle guide lights after this many idle seconds. 0 disables them. */
  guideAfter?: number
  guideColor?: string
  shadowRadius?: number
  /** Ground mist density. 0 disables it (interiors, the car). */
  mist?: number
  mistColor?: string
  mistHeight?: number
  /** Metres of air the ground-hugging height fog fills. Bigger = deeper murk. */
  fogLayer?: number
  /** How much extra fog collects at ground level, 0..1. */
  fogGround?: number
  /** Light caught in the mist. One instanced draw call; 0 disables it. */
  volumetricLight?: number
  volumetricColor?: string
  children?: ReactNode
}

/**
 * Everything every chapter needs: world registration, sky, lighting, wind, the
 * player, the camera, interactions, the guide, autosave and the opening fade.
 */
export function SceneKit({
  chapter,
  palette,
  height,
  bounds,
  spawn,
  ambience,
  music,
  stars = 0,
  wind = 1,
  surface = 'grass',
  withCharacter = true,
  guideAfter = 16,
  guideColor,
  shadowRadius = 34,
  mist = 1,
  mistColor,
  mistHeight = 1.1,
  fogLayer = 14,
  fogGround = 0.72,
  volumetricLight = 0.085,
  volumetricColor,
  children,
}: SceneKitProps) {
  // A checkpoint from this chapter wins over the authored spawn point — but it
  // is read exactly ONCE per scene mount, not subscribed to.
  //
  // Autosave rewrites the checkpoint every 12 seconds. Reading it reactively
  // therefore changed the spawn position mid-play, which re-ran the character
  // controller's respawn effect: her velocity was zeroed and the camera snapped
  // back behind her every twelve seconds, mid-stride. The scene is remounted by
  // key on every chapter change, so a mount-time read is always current.
  const spawnRef = useRef<{ position: [number, number, number]; facing: number } | null>(null)
  if (!spawnRef.current) {
    const cp = useGame.getState().save.checkpoint
    spawnRef.current =
      cp && cp.chapter === chapter ? { position: cp.position, facing: cp.facing } : spawn
  }
  const resolvedSpawn = spawnRef.current

  useEffect(() => {
    void audio.ambience(ambience)
    void audio.music(music)
  }, [ambience, music])

  // Any cinematic still running belongs to the scene we just left.
  useEffect(() => {
    return () => {
      director.cancel()
      useGame.getState().setNarration(null)
      // Scene-owned control holds ('raft', 'ending', …) die with the scene that
      // took them. The chapter-transition hold deliberately spans the unmount,
      // so it is the one thing left alone.
      for (const reason of [...runtime.controlHolds]) {
        if (reason !== 'transition') runtime.holdControl(reason, false)
      }
    }
  }, [chapter])

  return (
    <>
      <WorldSetup height={height} bounds={bounds} />
      <FadeIn />
      <WindDriver strength={wind} />
      <SkyDome palette={palette} stars={stars} />
      <Lighting palette={palette} shadowRadius={shadowRadius} fogLayer={fogLayer} fogGround={fogGround} />
      {mist > 0 ? (
        <Mist
          count={Math.round(32 * mist)}
          color={mistColor ?? palette.fog}
          opacity={0.14 * Math.min(1.5, mist)}
          height={mistHeight}
          moonDir={palette.sunDir}
          moonColor={palette.sun}
        />
      ) : null}
      {volumetricLight > 0 ? (
        <AtmosphericBeams
          color={volumetricColor ?? palette.sun}
          opacity={volumetricLight}
          count={6}
          slant={palette.sunDir[0] * 0.22}
        />
      ) : null}

      {children}

      {withCharacter ? <CharacterController spawn={resolvedSpawn} surface={surface} /> : null}
      <FollowCamera />
      <ControlWatchdog />
      <InteractionDriver />
      {guideAfter > 0 ? <GuideWisps after={guideAfter} color={guideColor ?? palette.accentWarm} /> : null}
      <LoveWhisper chapter={chapter} />
      <CheckpointSaver />
    </>
  )
}

/**
 * Drives a scene's objective marker for the guide lights and the compass.
 *
 * `label` is what the compass says she is looking for. Keep it in the game's
 * voice — "the bench at the top", not "OBJECTIVE: BENCH".
 */
export function useObjective(point: [number, number, number] | null, label?: string | null) {
  useEffect(() => {
    runtime.objective = point ? new THREE.Vector3(...point) : null
    runtime.objectiveLabel = point ? (label ?? null) : null
    return () => {
      runtime.objective = null
      runtime.objectiveLabel = null
    }
  }, [point?.[0], point?.[1], point?.[2], label])
}

interface TriggerProps {
  position: [number, number, number]
  radius: number
  onEnter: () => void
  /** Only fires while this returns true. */
  enabled?: boolean
  once?: boolean
  /** Repeating triggers wait this many seconds after leaving before re-arming. */
  cooldown?: number
}

/**
 * A proximity trigger volume. Used for chapter exits and authored beats.
 *
 * A repeating trigger (`once={false}`) only re-arms once the player has actually
 * LEFT the volume, plus a cooldown. Without that it re-fires on the very next
 * frame after its dialogue is dismissed, which reads as being locked in place
 * with a message that will not go away.
 */
export function Trigger({
  position,
  radius,
  onEnter,
  enabled = true,
  once = true,
  cooldown = 2.5,
}: TriggerProps) {
  const fired = useRef(false)
  const armed = useRef(true)
  const cool = useRef(0)
  const cb = useRef(onEnter)
  cb.current = onEnter

  useFrame((_, dt) => {
    if (!enabled) return
    if (once && fired.current) return

    const dx = runtime.playerPos.x - position[0]
    const dz = runtime.playerPos.z - position[2]
    const inside = dx * dx + dz * dz <= radius * radius

    // Re-arm only after leaving the volume and waiting out the cooldown.
    if (!inside) {
      if (cool.current > 0) cool.current -= Math.min(dt, 0.05)
      else armed.current = true
      return
    }

    if (!armed.current) return

    const s = useGame.getState()
    if (s.phase !== 'playing' || s.cinematic || s.dialogue) return

    fired.current = true
    armed.current = false
    cool.current = cooldown
    cb.current()
  })

  return null
}

/**
 * Runs a callback once, after the scene has settled. Used for opening
 * cinematics so they do not fight the fade-in.
 *
 * A `ran` ref guard looks right here and is badly wrong: StrictMode mounts every
 * effect twice in development (mount → cleanup → mount). The first pass set the
 * guard and scheduled the timer, the cleanup cancelled the timer, and the second
 * pass bailed on the guard — so the callback NEVER FIRED in dev, while firing
 * normally in the production build the launcher serves. Every opening cinematic
 * in the game was therefore untested. The timer is now simply owned by the
 * effect: scheduled on mount, cancelled on unmount, no guard.
 */
export function useSceneIntro(fn: () => void, delaySeconds = 0.4) {
  const cb = useRef(fn)
  cb.current = fn
  useEffect(() => {
    const t = setTimeout(() => cb.current(), delaySeconds * 1000)
    return () => clearTimeout(t)
  }, [delaySeconds])
}
