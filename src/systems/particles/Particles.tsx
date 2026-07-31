import { useRef, useMemo, useLayoutEffect, memo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mulberry32, clamp01 } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { runtime } from '../../store/runtime'
import { glow } from '../../utils/assets'
import { useQualityProfile } from '../performance/useQualityProfile'

/**
 * One pooled, instanced particle system used for every drifting thing in the
 * game: fireflies, pollen, falling leaves, dust, moths, insects at a lamp.
 *
 * Everything is a single InstancedMesh with one matrix upload per frame. No
 * per-particle React components, no allocation in the update loop.
 */

export type ParticleKind = 'firefly' | 'pollen' | 'leaf' | 'dust' | 'moth' | 'ember' | 'petal' | 'rain'

interface ParticlesProps {
  kind: ParticleKind
  count: number
  /** Box the particles live inside, centred on `center`. */
  center?: [number, number, number]
  size?: [number, number, number]
  color?: string
  scale?: number
  /** Follows the player so a small pool covers a large region. */
  followPlayer?: boolean
  opacity?: number
  seed?: number
}

const KIND_DEFAULTS: Record<
  ParticleKind,
  { color: string; scale: number; speed: number; rise: number; flicker: number; opacity: number }
> = {
  firefly: { color: '#ffd08a', scale: 0.055, speed: 0.35, rise: 0.05, flicker: 1, opacity: 1 },
  pollen: { color: '#ffeec8', scale: 0.032, speed: 0.18, rise: 0.08, flicker: 0.25, opacity: 0.75 },
  leaf: { color: '#d09a52', scale: 0.11, speed: 0.75, rise: -0.55, flicker: 0, opacity: 1 },
  dust: { color: '#cfd4dd', scale: 0.028, speed: 0.14, rise: 0.02, flicker: 0.15, opacity: 0.5 },
  moth: { color: '#e8dcc4', scale: 0.06, speed: 0.9, rise: 0, flicker: 0.4, opacity: 0.9 },
  ember: { color: '#ffb066', scale: 0.04, speed: 0.25, rise: 0.4, flicker: 0.8, opacity: 0.9 },
  petal: { color: '#ffc9c2', scale: 0.075, speed: 0.4, rise: -0.22, flicker: 0, opacity: 0.95 },
  rain: { color: '#9fb2cd', scale: 0.9, speed: 0.12, rise: -7.5, flicker: 0, opacity: 0.3 },
}

export const Particles = memo(function Particles({
  kind,
  count,
  center = [0, 0, 0],
  size = [40, 6, 40],
  color,
  scale,
  followPlayer = false,
  opacity,
  seed = 1234,
}: ParticlesProps) {
  const def = KIND_DEFAULTS[kind]
  const { particles: density } = useQualityProfile().profile
  const reduceMotion = useGame((s) => s.settings.reduceMotion)
  const n = Math.max(0, Math.round(count * density))

  const mesh = useRef<THREE.InstancedMesh>(null)
  const haloMesh = useRef<THREE.InstancedMesh>(null)
  const anchor = useRef(new THREE.Vector3(...center))

  const data = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: n }, () => ({
      x: (rand() - 0.5) * size[0],
      y: rand() * size[1],
      z: (rand() - 0.5) * size[2],
      phase: rand() * Math.PI * 2,
      speed: 0.6 + rand() * 0.9,
      wobble: 0.4 + rand() * 1.4,
      spin: (rand() - 0.5) * 2.4,
      scaleJitter: 0.7 + rand() * 0.7,
    }))
  }, [n, size[0], size[1], size[2], seed])

  const geometry = useMemo(() => {
    if (kind === 'leaf' || kind === 'petal') {
      const g = new THREE.PlaneGeometry(1, 0.62)
      return g
    }
    if (kind === 'rain') {
      // A thin vertical streak; falling fast, it reads as drizzle.
      return new THREE.PlaneGeometry(0.02, 0.42)
    }
    return new THREE.SphereGeometry(0.5, 6, 4)
  }, [kind])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => {
    const c = color ?? def.color
    const o = opacity ?? def.opacity
    const lit = kind === 'firefly' || kind === 'ember'
    if (lit) return glow(c, o, false)
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(c),
      transparent: true,
      opacity: o,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: true,
    })
  }, [color, opacity, kind])

  // Fireflies and embers throw a soft additive halo around their hot core, so
  // they read as tiny light sources even on quality tiers with bloom off.
  // Purely cosmetic: it shares the same instance transforms, scaled up.
  const isLit = kind === 'firefly' || kind === 'ember'
  const haloMaterial = useMemo(() => {
    if (!isLit) return null
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color ?? def.color),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    })
  }, [isLit, color, def.color])
  useLayoutEffect(() => () => haloMaterial?.dispose(), [haloMaterial])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state, rawDt) => {
    const m = mesh.current
    if (!m || n === 0) return
    if (useGame.getState().phase === 'paused') return

    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const motion = reduceMotion ? 0.35 : 1

    if (followPlayer) {
      // Re-centre on the player, wrapping particles that fall behind.
      anchor.current.x = runtime.playerPos.x
      anchor.current.z = runtime.playerPos.z
      anchor.current.y = center[1] + runtime.playerPos.y
    }

    const ax = anchor.current.x
    const ay = anchor.current.y
    const az = anchor.current.z
    const hw = size[0] / 2
    const hd = size[2] / 2

    for (let i = 0; i < n; i++) {
      const p = data[i]

      if (kind === 'firefly' || kind === 'moth') {
        // Lazy figure-of-eight drift.
        p.x += Math.sin(t * 0.4 * p.speed + p.phase) * def.speed * dt * p.wobble * motion
        p.z += Math.cos(t * 0.31 * p.speed + p.phase * 1.7) * def.speed * dt * p.wobble * motion
        p.y += Math.sin(t * 0.6 * p.speed + p.phase * 0.6) * def.speed * 0.5 * dt * motion
      } else if (kind === 'leaf' || kind === 'petal') {
        // Falling with a lateral flutter; respawns at the top.
        p.y += def.rise * dt * p.speed * motion
        p.x += Math.sin(t * 1.1 * p.speed + p.phase) * def.speed * dt * motion
        p.z += Math.cos(t * 0.8 * p.speed + p.phase) * def.speed * 0.6 * dt * motion
        if (p.y < 0) {
          p.y = size[1]
          p.x = (Math.random() - 0.5) * size[0]
          p.z = (Math.random() - 0.5) * size[2]
        }
      } else if (kind === 'rain') {
        // Falls straight and fast with only the faintest wind drift.
        p.y += def.rise * dt * p.speed * motion
        p.x += Math.sin(p.phase) * def.speed * dt * motion
        if (p.y < 0) {
          p.y = size[1]
          p.x = (Math.random() - 0.5) * size[0]
          p.z = (Math.random() - 0.5) * size[2]
        }
      } else {
        p.y += def.rise * dt * p.speed * motion
        p.x += Math.sin(t * 0.5 * p.speed + p.phase) * def.speed * dt * motion
        p.z += Math.cos(t * 0.43 * p.speed + p.phase) * def.speed * dt * motion
        if (p.y > size[1]) p.y = 0
        if (p.y < 0) p.y = size[1]
      }

      // Wrap inside the box so the pool never drifts away.
      if (p.x > hw) p.x -= size[0]
      else if (p.x < -hw) p.x += size[0]
      if (p.z > hd) p.z -= size[2]
      else if (p.z < -hd) p.z += size[2]

      dummy.position.set(ax + p.x, ay + p.y, az + p.z)

      let s = (scale ?? def.scale) * p.scaleJitter
      if (def.flicker > 0) {
        // Fireflies pulse rather than glow steadily.
        const pulse = 0.5 + 0.5 * Math.sin(t * (1.4 + p.speed) + p.phase * 3)
        s *= 1 - def.flicker * 0.55 * (1 - pulse)
      }
      dummy.scale.setScalar(Math.max(0.0001, s))

      if (kind === 'leaf' || kind === 'petal') {
        dummy.rotation.set(t * p.spin * 0.7, t * p.spin, p.phase)
      } else {
        dummy.rotation.set(0, 0, 0)
      }

      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)

      // Same transform, blown up: the halo breathes with the core's flicker.
      const halo = haloMesh.current
      if (halo) {
        dummy.scale.multiplyScalar(3.1)
        dummy.updateMatrix()
        halo.setMatrixAt(i, dummy.matrix)
      }
    }
    m.instanceMatrix.needsUpdate = true
    if (haloMesh.current) haloMesh.current.instanceMatrix.needsUpdate = true
  })

  if (n === 0) return null

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, n]}
        frustumCulled={false}
        renderOrder={kind === 'firefly' || kind === 'ember' ? 10 : 5}
      />
      {haloMaterial ? (
        <instancedMesh
          ref={haloMesh}
          args={[geometry, haloMaterial, n]}
          frustumCulled={false}
          renderOrder={9}
        />
      ) : null}
    </>
  )
})

/**
 * The guide: a small cluster of peach-colored lights that drifts toward the
 * current objective.
 *
 * Two things summon it. The idle timer, which decides on her behalf that she is
 * lost; and the paper star (Q), which is her asking. The star's clock wins, and
 * is counted down here — the wisps are the only thing that runs every frame and
 * cares about it.
 */
export function GuideWisps({
  color = '#ffb877',
  count = 7,
  /** Seconds of not-progressing before they appear. */
  after = 14,
}: {
  color?: string
  count?: number
  after?: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const strength = useRef(0)
  const pos = useRef(new THREE.Vector3())
  const started = useRef(false)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const geometry = useMemo(() => new THREE.SphereGeometry(0.5, 6, 4), [])
  const material = useMemo(() => glow(color, 1, false), [color])
  const offsets = useMemo(() => {
    const rand = mulberry32(4242)
    return Array.from({ length: count }, () => ({
      phase: rand() * Math.PI * 2,
      speed: 0.7 + rand() * 0.8,
      radius: 0.25 + rand() * 0.6,
      height: rand() * 0.7,
    }))
  }, [count])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, rawDt) => {
    const m = mesh.current
    if (!m) return
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const s = useGame.getState()

    const playable = s.phase === 'playing' && !s.dialogue && !s.cinematic
    if (runtime.questGuideSeconds > 0 && playable) {
      runtime.questGuideSeconds = Math.max(0, runtime.questGuideSeconds - dt)
    }

    const objective = runtime.objective
    const summoned = runtime.questGuideSeconds > 0
    const shouldShow =
      playable && objective !== null && (summoned || runtime.idleSeconds > after)

    // A summoned guide arrives briskly; an idle-triggered one still fades in
    // gently, so it never feels like the game shouting at her.
    const rate = summoned ? 4 : 1.2
    strength.current += (clamp01(shouldShow ? 1 : 0) - strength.current) * Math.min(1, dt * rate)

    if (strength.current < 0.01) {
      m.visible = false
      started.current = false
      return
    }
    m.visible = true

    // They set out from beside the player and drift toward the objective,
    // looping back once they arrive.
    if (!started.current) {
      pos.current.set(runtime.playerPos.x, runtime.playerPos.y + 1.1, runtime.playerPos.z)
      started.current = true
    }
    if (objective) {
      const dx = objective.x - pos.current.x
      const dz = objective.z - pos.current.z
      const d = Math.hypot(dx, dz)
      if (d < 1.4) {
        // Arrived — restart from the player so the trail reads as a path.
        pos.current.set(runtime.playerPos.x, runtime.playerPos.y + 1.1, runtime.playerPos.z)
      } else {
        const speed = 2.6
        pos.current.x += (dx / d) * speed * dt
        pos.current.z += (dz / d) * speed * dt
        const ground = runtime.sampleHeight(pos.current.x, pos.current.z)
        const targetY = (Number.isFinite(ground) ? ground : 0) + 1.05
        pos.current.y += (targetY - pos.current.y) * Math.min(1, dt * 3)
      }
    }

    for (let i = 0; i < offsets.length; i++) {
      const o = offsets[i]
      const a = t * o.speed + o.phase
      dummy.position.set(
        pos.current.x + Math.sin(a) * o.radius,
        pos.current.y + o.height + Math.sin(a * 1.7) * 0.18,
        pos.current.z + Math.cos(a * 1.3) * o.radius,
      )
      const pulse = 0.6 + 0.4 * Math.sin(t * 2.1 + o.phase * 2)
      dummy.scale.setScalar(0.075 * pulse * strength.current)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      frustumCulled={false}
      renderOrder={20}
    />
  )
}
