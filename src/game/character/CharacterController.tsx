import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Girl, STRIDE_BASE, STRIDE_PER_SPEED, type PoseState } from './Girl'
import { runtime } from '../../store/runtime'
import { frameInput } from '../input/frame'
import { useGame } from '../../store/gameStore'
import { resolveCollisions, groundSlope, isSpawnSafe } from '../world/collision'
import { damp, dampAngle, clamp01 } from '../../utils/math'
import { audio } from '../../systems/audio/audio'

const WALK_SPEED = 2.15
const RUN_SPEED = 4.05
const ACCEL = 12
const DECEL = 14
const TURN_RATE = 11
const BODY_RADIUS = 0.34
const JUMP_SPEED = 4.7
const GRAVITY = 13.5

export interface SpawnConfig {
  position: [number, number, number]
  facing: number
}

interface Props {
  spawn: SpawnConfig
  /** Surface the player walks on for footstep sound selection. */
  surface?: 'grass' | 'wood' | 'stone' | 'gravel' | 'asphalt' | 'water'
  /** Forced pose, e.g. while sitting on a bench or riding the raft. */
  pose?: PoseState
  /** Disables movement without disabling the character (cinematics, raft rides). */
  frozen?: boolean
  /** Called once per frame with the resolved position. */
  onMove?: (pos: THREE.Vector3) => void
}

/**
 * Drives the player: camera-relative movement with smooth accel/decel, terrain
 * following, collision resolution, bounds recovery, and footstep audio.
 *
 * Writes to `runtime` (mutable) rather than the React store, so a full frame of
 * movement costs zero re-renders.
 */
export function CharacterController({ spawn, surface = 'grass', pose, frozen, onMove }: Props) {
  const group = useRef<THREE.Group>(null)
  const speedRef = useRef(0)
  const poseRef = useRef<PoseState>('idle')
  const lookAtRef = useRef<THREE.Vector3 | null>(null)
  const vel = useRef(new THREE.Vector2(0, 0))
  const verticalSpeed = useRef(0)
  const grounded = useRef(true)
  const footPhase = useRef(0)
  const spawned = useRef(false)
  const movementResetEpoch = useRef(runtime.movementResetEpoch)

  // Reset to the spawn point whenever the scene changes.
  //
  // The dependencies are the spawn VALUES, not the spawn object. Scenes pass an
  // object literal, so depending on its identity would re-run this on every
  // re-render — and any interaction that touches React state (petting the cat,
  // collecting a memory, finishing a task) would yank the player back to the
  // chapter entrance mid-play.
  const spawnX = spawn.position[0]
  const spawnY = spawn.position[1]
  const spawnZ = spawn.position[2]
  const spawnFacing = spawn.facing

  useEffect(() => {
    const safe = isSpawnSafe(spawnX, spawnY, spawnZ, runtime.bounds)
    const px = safe ? spawnX : 0
    const pz = safe ? spawnZ : 0
    const groundY = runtime.sampleHeight(px, pz)
    runtime.playerPos.set(px, Number.isFinite(groundY) ? groundY : 0, pz)
    runtime.playerFacing = spawnFacing
    runtime.playerSpeed = 0
    runtime.camYaw = spawnFacing + Math.PI
    vel.current.set(0, 0)
    verticalSpeed.current = 0
    grounded.current = true
    speedRef.current = 0
    movementResetEpoch.current = runtime.movementResetEpoch
    spawned.current = true
    if (group.current) {
      group.current.position.copy(runtime.playerPos)
      group.current.rotation.y = spawnFacing
    }
  }, [spawnX, spawnY, spawnZ, spawnFacing])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = group.current
    if (!g || !spawned.current) return

    if (movementResetEpoch.current !== runtime.movementResetEpoch) {
      movementResetEpoch.current = runtime.movementResetEpoch
      vel.current.set(0, 0)
      verticalSpeed.current = 0
      grounded.current = true
      footPhase.current = 0
      speedRef.current = 0
      runtime.playerSpeed = 0
      runtime.playerRunning = false

      // A recovery is not a respawn: preserve X/Z and facing. Only settle an
      // interrupted jump onto valid terrain so no hidden vertical velocity can
      // keep the controller in an invalid state.
      const groundY = runtime.sampleHeight(runtime.playerPos.x, runtime.playerPos.z)
      if (Number.isFinite(groundY)) runtime.playerPos.y = groundY
      g.position.copy(runtime.playerPos)
      g.rotation.y = runtime.playerFacing
    }

    const phase = useGame.getState().phase
    const dialogue = useGame.getState().dialogue
    const active = phase === 'playing' && !dialogue && runtime.playerControlEnabled && !frozen

    // ── desired direction, camera-relative ─────────────────────────────
    let wishX = 0
    let wishZ = 0
    let wantRun = false

    if (active) {
      const mv = frameInput.moveX
      const mf = frameInput.moveY
      wantRun = frameInput.run
      if (mv || mf) {
        // Camera yaw defines "forward" on screen. The camera SITS at
        // (sin yaw, cos yaw) from the player, so screen-forward — away from the
        // camera, into the picture — is the negation of that.
        const yaw = runtime.camYaw
        const fx = -Math.sin(yaw)
        const fz = -Math.cos(yaw)
        // Right = cross(forward, up), which reduces to (-fz, fx).
        const rx = -fz
        const rz = fx
        wishX = fx * mf + rx * mv
        wishZ = fz * mf + rz * mv
        const len = Math.hypot(wishX, wishZ)
        if (len > 1e-4) {
          wishX /= len
          wishZ /= len
        }
      }
    }

    const wishing = wishX !== 0 || wishZ !== 0
    const maxSpeed = wantRun ? RUN_SPEED : WALK_SPEED

    // ── velocity ────────────────────────────────────────────────────────
    const targetX = wishX * maxSpeed
    const targetZ = wishZ * maxSpeed
    const rate = wishing ? ACCEL : DECEL
    vel.current.x = damp(vel.current.x, targetX, rate, dt)
    vel.current.y = damp(vel.current.y, targetZ, rate, dt)
    if (!wishing && vel.current.lengthSq() < 0.0016) vel.current.set(0, 0)

    let nx = runtime.playerPos.x + vel.current.x * dt
    let nz = runtime.playerPos.z + vel.current.y * dt

    // ── slope: climbing steeply costs speed, so hills feel like hills ───
    const slope = groundSlope(runtime.sampleHeight, runtime.playerPos.x, runtime.playerPos.z)
    if (slope.steepness > 0.25 && wishing) {
      const uphill = -(slope.nx * wishX + slope.nz * wishZ)
      if (uphill > 0) {
        const drag = 1 - Math.min(0.42, uphill * 0.5)
        nx = runtime.playerPos.x + vel.current.x * dt * drag
        nz = runtime.playerPos.z + vel.current.y * dt * drag
      }
    }

    // ── collision + bounds ──────────────────────────────────────────────
    const res = resolveCollisions(nx, nz, BODY_RADIUS, runtime.colliders, runtime.bounds)
    if (res.hit) {
      // Kill the component of velocity that pushed into the obstacle, so she
      // slides along walls instead of vibrating against them.
      const dx = res.x - runtime.playerPos.x
      const dz = res.z - runtime.playerPos.z
      const moveLen = Math.hypot(dx, dz)
      if (moveLen > 1e-5) {
        const proj = (vel.current.x * dx + vel.current.y * dz) / moveLen
        vel.current.x = (dx / moveLen) * proj
        vel.current.y = (dz / moveLen) * proj
      } else {
        vel.current.multiplyScalar(0.3)
      }
    }

    runtime.playerPos.x = res.x
    runtime.playerPos.z = res.z

    // ── ground + jump ───────────────────────────────────────────────────
    let groundY = runtime.sampleHeight(res.x, res.z)
    if (!Number.isFinite(groundY)) groundY = runtime.playerPos.y

    if (active && grounded.current && frameInput.jumpPressed) {
      // Begin from terrain, not from the tiny smoothing offset accumulated on
      // slopes. Horizontal collision remains fully active while airborne.
      runtime.playerPos.y = Math.max(runtime.playerPos.y, groundY)
      verticalSpeed.current = JUMP_SPEED
      grounded.current = false
    }

    if (!grounded.current) {
      verticalSpeed.current -= GRAVITY * dt
      const nextY = runtime.playerPos.y + verticalSpeed.current * dt
      if (nextY <= groundY) {
        runtime.playerPos.y = groundY
        verticalSpeed.current = 0
        grounded.current = true
        audio.footstep(surface, 0.22)
      } else {
        runtime.playerPos.y = nextY
      }
    } else {
      // Snap hard when falling behind, ease across terrain changes, so steps
      // feel soft while never leaving her hovering or sunk into a slope.
      const dy = groundY - runtime.playerPos.y
      runtime.playerPos.y =
        Math.abs(dy) > 1.2 ? groundY : damp(runtime.playerPos.y, groundY, 18, dt)
    }

    const horizSpeed = Math.hypot(vel.current.x, vel.current.y)
    runtime.playerSpeed = horizSpeed
    runtime.playerRunning = wantRun && horizSpeed > 0.5
    speedRef.current = horizSpeed

    // ── facing ──────────────────────────────────────────────────────────
    if (horizSpeed > 0.12) {
      const targetFacing = Math.atan2(vel.current.x, vel.current.y)
      runtime.playerFacing = dampAngle(runtime.playerFacing, targetFacing, TURN_RATE, dt)
    }

    g.position.copy(runtime.playerPos)
    g.rotation.y = runtime.playerFacing

    // ── pose selection ──────────────────────────────────────────────────
    poseRef.current = pose ?? (horizSpeed > 2.6 ? 'run' : horizSpeed > 0.12 ? 'walk' : 'idle')

    // ── idle bookkeeping (drives the gentle nudge) ──────────────────────
    if (horizSpeed > 0.3) runtime.idleSeconds = 0
    else runtime.idleSeconds += dt
    runtime.chapterSeconds += dt

    // ── footsteps ───────────────────────────────────────────────────────
    if (horizSpeed > 0.35 && !frozen) {
      footPhase.current += (STRIDE_BASE + Math.min(horizSpeed, 5) * STRIDE_PER_SPEED) * dt
      if (footPhase.current >= Math.PI) {
        footPhase.current -= Math.PI
        audio.footstep(surface, clamp01(horizSpeed / RUN_SPEED))
      }
    } else {
      footPhase.current = 0
    }

    onMove?.(runtime.playerPos)
    void state
  })

  return (
    <group ref={group}>
      <Girl speedRef={speedRef} poseRef={poseRef} lookAtRef={lookAtRef} />
    </group>
  )
}
