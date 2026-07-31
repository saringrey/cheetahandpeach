import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { runtime } from '../../store/runtime'
import { frameInput } from '../input/frame'
import { useGame } from '../../store/gameStore'
import { director } from './director'
import { damp, clamp } from '../../utils/math'

const PITCH_MIN = -0.42
const PITCH_MAX = 1.02
const LOOK_SCALE = 0.0022

const _desired = new THREE.Vector3()
const _target = new THREE.Vector3()
const _probe = new THREE.Vector3()
const _dir = new THREE.Vector3()

/**
 * Third-person follow camera.
 *
 * Deliberately not OrbitControls: this owns its own damping, obstruction
 * handling and contextual framing, and hands control cleanly to the cinematic
 * director and back.
 */
export function FollowCamera() {
  const { camera } = useThree()
  const smoothPos = useRef(new THREE.Vector3())
  const smoothLook = useRef(new THREE.Vector3())
  const lookAhead = useRef(new THREE.Vector3())
  const initialised = useRef(false)
  const currentDist = useRef(runtime.camDistance)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useGame.getState()
    const settings = s.settings
    const cam = camera as THREE.PerspectiveCamera

    director.update(dt)

    // ── mouse / stick look ──────────────────────────────────────────────
    const canLook = s.phase === 'playing' && !s.dialogue && !director.isActive()
    if (canLook) {
      const sens = settings.mouseSensitivity * LOOK_SCALE
      runtime.camYaw -= frameInput.lookX * sens
      const pitchDelta = frameInput.lookY * sens * (settings.invertY ? -1 : 1)
      runtime.camPitch = clamp(runtime.camPitch + pitchDelta, PITCH_MIN, PITCH_MAX)
    }

    // ── target point ────────────────────────────────────────────────────
    // A small velocity-weighted lead lets the composition acknowledge where
    // she is going. It is intentionally absent in reduced-motion modes.
    const calm = settings.reduceCameraMotion || settings.reduceMotion
    const lead = calm ? 0 : Math.min(0.58, runtime.playerSpeed * 0.135)
    lookAhead.current.x = damp(
      lookAhead.current.x,
      Math.sin(runtime.playerFacing) * lead,
      5.5,
      dt,
    )
    lookAhead.current.z = damp(
      lookAhead.current.z,
      Math.cos(runtime.playerFacing) * lead,
      5.5,
      dt,
    )
    _target.set(
      runtime.playerPos.x + lookAhead.current.x,
      runtime.playerPos.y + runtime.camLookHeight,
      runtime.playerPos.z + lookAhead.current.z,
    )

    // Contextual distance: pull in slightly when running so the frame stays
    // intimate. The old addition did the opposite and made her smaller.
    const runPull = runtime.playerRunning && !calm ? 0.38 : 0
    runtime.camDistance = damp(runtime.camDistance, runtime.camDistanceTarget - runPull, 2.5, dt)

    const pitch = runtime.camPitch
    const yaw = runtime.camYaw
    const horiz = Math.cos(pitch) * runtime.camDistance
    const bump = 0.35 * Math.min(1, runtime.camDistance / 5)
    _desired.set(
      _target.x + Math.sin(yaw) * horiz,
      _target.y + Math.sin(pitch) * runtime.camDistance + bump,
      _target.z + Math.cos(yaw) * horiz,
    )

    // ── obstruction: pull the camera in rather than clipping through ────
    // March the ray from the player outward; stop at terrain or a collider.
    let allowed = runtime.camDistance
    _dir.copy(_desired).sub(_target)
    const fullLen = _dir.length()
    if (fullLen > 0.001) {
      _dir.divideScalar(fullLen)
      const steps = 10
      for (let i = 1; i <= steps; i++) {
        const d = (fullLen * i) / steps
        _probe.copy(_target).addScaledVector(_dir, d)
        const ground = runtime.sampleHeight(_probe.x, _probe.z)
        let blocked = Number.isFinite(ground) && _probe.y < ground + 0.55
        if (!blocked) {
          for (let c = 0; c < runtime.colliders.length; c++) {
            const col = runtime.colliders[c]
            if (col.noCam) continue
            if (col.kind === 'circle') {
              const dx = _probe.x - col.x
              const dz = _probe.z - col.z
              if (dx * dx + dz * dz < (col.r + 0.3) * (col.r + 0.3)) {
                blocked = true
                break
              }
            } else {
              const cos = Math.cos(-col.rot)
              const sin = Math.sin(-col.rot)
              const rx = (_probe.x - col.x) * cos - (_probe.z - col.z) * sin
              const rz = (_probe.x - col.x) * sin + (_probe.z - col.z) * cos
              if (Math.abs(rx) < col.hw + 0.3 && Math.abs(rz) < col.hd + 0.3) {
                blocked = true
                break
              }
            }
          }
        }
        if (blocked) {
          allowed = Math.max(2.0, d - fullLen / steps)
          break
        }
      }
    }

    if (allowed < runtime.camDistance) {
      // Snap in fast (so nothing clips), ease back out slowly (so it is calm).
      currentDist.current = Math.min(currentDist.current, allowed)
    }
    currentDist.current = damp(currentDist.current, Math.min(allowed, runtime.camDistance), 4.5, dt)

    const usedHoriz = Math.cos(pitch) * currentDist.current
    const usedBump = 0.35 * Math.min(1, currentDist.current / 5)
    _desired.set(
      _target.x + Math.sin(yaw) * usedHoriz,
      _target.y + Math.sin(pitch) * currentDist.current + usedBump,
      _target.z + Math.cos(yaw) * usedHoriz,
    )
    // Never let the camera end up under the ground.
    const camGround = runtime.sampleHeight(_desired.x, _desired.z)
    if (Number.isFinite(camGround) && _desired.y < camGround + 0.5) _desired.y = camGround + 0.5

    // ── damping ─────────────────────────────────────────────────────────
    if (!initialised.current) {
      smoothPos.current.copy(_desired)
      smoothLook.current.copy(_target)
      initialised.current = true
    }

    const posRate = calm ? 14 : 7.5
    const lookRate = calm ? 16 : 11

    smoothPos.current.x = damp(smoothPos.current.x, _desired.x, posRate, dt)
    smoothPos.current.y = damp(smoothPos.current.y, _desired.y, posRate * 0.85, dt)
    smoothPos.current.z = damp(smoothPos.current.z, _desired.z, posRate, dt)
    smoothLook.current.x = damp(smoothLook.current.x, _target.x, lookRate, dt)
    smoothLook.current.y = damp(smoothLook.current.y, _target.y, lookRate, dt)
    smoothLook.current.z = damp(smoothLook.current.z, _target.z, lookRate, dt)

    // ── hand over to the director when a cinematic is running ───────────
    const b = director.blend
    if (b > 0.001) {
      cam.position.lerpVectors(smoothPos.current, director.pos, b)
      _probe.lerpVectors(smoothLook.current, director.look, b)
      cam.lookAt(_probe)
      const targetFov = director.fov ?? 55
      cam.fov = damp(cam.fov, 55 + (targetFov - 55) * b, 6, dt)
      cam.updateProjectionMatrix()
    } else {
      cam.position.copy(smoothPos.current)
      cam.lookAt(smoothLook.current)
      if (Math.abs(cam.fov - 55) > 0.01) {
        cam.fov = damp(cam.fov, 55, 6, dt)
        cam.updateProjectionMatrix()
      }
    }
  })

  return null
}
