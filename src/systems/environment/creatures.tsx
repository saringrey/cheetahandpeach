import { useRef, useMemo, useState, useEffect, useCallback, useLayoutEffect, memo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { geo, glow, storybook } from '../../utils/assets'
import { mulberry32, damp, dampAngle } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { runtime } from '../../store/runtime'
import { GIRL } from '../../content/characters'
import { WATCHER_MURMURS } from '../../content/whispers'
import { getDialogue } from '../../content/dialogue'
import { audio } from '../audio/audio'
import { Interactable } from '../../game/interactions/interactions'
import { useQualityProfile } from '../performance/useQualityProfile'

/**
 * Small living things.
 *
 * They exist so the world keeps moving when the player stands still. All of
 * them are idle-animated only — nothing here has AI, pathfinding or state.
 */

/* ── Durk ────────────────────────────────────────────────────────────────── */

export const DURK_NAME = 'Durk'
export const APOLLO_NAME = 'Apollo'
export type DurkBehavior = 'sleep' | 'fireflies'

/**
 * Seconds a greeted dog stays excited.
 *
 * Long enough that the tail is clearly going when the dialogue line is on
 * screen, short enough that he settles again before she has walked away.
 */
const DOG_GREET_SECONDS = 4.5

/**
 * Both dogs share one rig and one set of materials.
 *
 * Apollo is not a second dog component — he is Durk's geometry with a white
 * coat, which is why `coat` exists. Two near-identical 40-mesh components would
 * be two shader programs and two material sets for a difference nobody can name.
 */
export type DogCoat = 'durk' | 'apollo'

const durkMats = {
  brown: storybook({
    color: '#6b422b',
    roughness: 0.96,
    rim: 0.3,
    rimColor: '#d5a06d',
    gradient: 0.28,
  }),
  black: storybook({
    color: '#211c1a',
    roughness: 0.94,
    rim: 0.2,
    rimColor: '#75665c',
    gradient: 0.18,
  }),
  eye: storybook({ color: '#0c0908', roughness: 0.45, rim: 0 }),
  firefly: glow('#ffd27a', 0.8, false),
  // Apollo: white all over, warm rather than blue, so he reads as a dog in
  // moonlight and not as a ghost.
  white: storybook({
    color: '#e8e2d8',
    roughness: 0.95,
    rim: 0.34,
    rimColor: '#fff2dc',
    gradient: 0.26,
  }),
  whiteShade: storybook({
    color: '#cdc5b8',
    roughness: 0.95,
    rim: 0.28,
    rimColor: '#f2e6d2',
    gradient: 0.22,
  }),
}

/**
 * Durk is background life, never an objective. Sleeping placements barely
 * breathe; firefly placements trace a small lazy loop around their anchor.
 * Geometry/materials come from shared caches and all motion mutates refs.
 */
export const Durk = memo(function Durk({
  position,
  rotation = 0,
  behavior = 'sleep',
  roamRadius = 1.25,
  seed = 0,
  groundHeight,
  coat = 'durk',
  name = DURK_NAME,
  greeting = 0,
  registerToCompass = true,
}: {
  position: [number, number, number]
  rotation?: number
  behavior?: DurkBehavior
  roamRadius?: number
  seed?: number
  groundHeight?: (x: number, z: number) => number
  /** Which dog this is. Apollo is the same rig in a white coat. */
  coat?: DogCoat
  /** His name, used by the interaction prompt. */
  name?: string
  /** Rises to 1 when she greets him and decays back down. */
  greeting?: number
  /** Set false on the second dog so the compass keeps pointing at Durk. */
  registerToCompass?: boolean
}) {
  const reduceMotion = useGame((s) => s.settings.reduceMotion)
  const isApollo = coat === 'apollo'
  const fur = isApollo ? durkMats.white : durkMats.brown
  const furDark = isApollo ? durkMats.whiteShade : durkMats.black
  const greet = useRef(0)
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const legs = useRef<THREE.Group[]>([])
  const fireflies = useRef<THREE.Group>(null)
  const phase = seed * 0.731

  /**
   * Tell the compass where he is.
   *
   * Still no marker, prompt, collider or gameplay effect — this is one vector so
   * the paper star can point him out to a player who wants to find him. He roams
   * at most a metre or two, so his anchor is close enough and costs one write per
   * mount rather than one per frame.
   */
  useLayoutEffect(() => {
    if (!registerToCompass) return
    runtime.durkPosition = new THREE.Vector3(...position)
    return () => {
      runtime.durkPosition = null
    }
  }, [position[0], position[1], position[2], registerToCompass])

  useFrame((state, rawDt) => {
    const dog = root.current
    if (!dog) return

    const motion = reduceMotion ? 0 : 1
    const t = state.clock.elapsedTime

    // Greeting decays on its own clock so the caller only has to say "yes".
    greet.current = greeting > greet.current
      ? greeting
      : Math.max(0, greet.current - Math.min(rawDt, 0.05) / DOG_GREET_SECONDS)
    const g = greet.current

    if (behavior === 'sleep') {
      dog.position.set(0, 0, 0)
      dog.rotation.y = rotation
      // Greeted, he lifts his head and thumps his tail without getting up —
      // which is exactly what a dog who was asleep two seconds ago does.
      if (body.current) body.current.scale.y = 1 + Math.sin(t * (0.78 + g * 2.4) + phase) * (0.012 + g * 0.022) * motion
      if (head.current) {
        head.current.rotation.z = Math.sin(t * 0.31 + phase) * 0.018 * motion
        head.current.rotation.x = -g * 0.3
      }
      if (tail.current) {
        tail.current.rotation.y =
          -0.3 + Math.sin(t * (0.19 + g * 26) + phase) * (0.06 + g * 0.55) * motion
      }
      return
    }

    const a = t * 0.22 * motion + phase
    const x = Math.sin(a) * roamRadius
    const z = Math.cos(a * 1.07) * roamRadius * 0.62
    const nextA = a + 0.015
    const nextX = Math.sin(nextA) * roamRadius
    const nextZ = Math.cos(nextA * 1.07) * roamRadius * 0.62
    const worldY = groundHeight?.(position[0] + x, position[2] + z) ?? position[1]

    dog.position.set(x, worldY - position[1], z)
    dog.rotation.y = motion ? Math.atan2(nextX - x, nextZ - z) : rotation
    if (body.current) body.current.position.y = Math.sin(t * 3.1 + phase) * 0.014 * motion
    if (head.current) {
      head.current.rotation.x = -0.04 + Math.sin(t * 1.15 + phase) * 0.05 * motion
      head.current.rotation.y = Math.sin(t * 0.72 + phase) * 0.12 * motion
    }
    if (tail.current) {
      tail.current.rotation.x =
        -0.5 + Math.sin(t * (2.25 + g * 22) + phase) * (0.26 + g * 0.5) * motion
    }
    legs.current.forEach((leg, i) => {
      leg.rotation.x = Math.sin(t * 3.1 + phase + (i % 2) * Math.PI) * 0.22 * motion
    })

    if (fireflies.current) {
      const ahead = a + 0.68
      fireflies.current.position.set(
        Math.sin(ahead) * roamRadius * 1.05,
        0.72 + Math.sin(t * 1.7 + phase) * 0.16 * motion,
        Math.cos(ahead * 1.07) * roamRadius * 0.68,
      )
    }
  })

  const sleeping = behavior === 'sleep'

  return (
    <group name={name} position={position}>
      <group ref={root} rotation={[0, rotation, 0]}>
        <group ref={body}>
          <mesh
            geometry={geo.capsule(9)}
            material={fur}
            position={[0, sleeping ? 0.3 : 0.62, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.3, 0.42, 0.28]}
            castShadow
          />
          {/* Black saddle marking across his shoulders. */}
          <mesh
            geometry={geo.capsule(8)}
            material={furDark}
            position={[0, sleeping ? 0.385 : 0.715, -0.08]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.235, 0.23, 0.23]}
            castShadow
          />

          <group
            ref={head}
            position={[0, sleeping ? 0.3 : 0.78, sleeping ? 0.48 : 0.45]}
            rotation={[sleeping ? 0.18 : 0, 0, sleeping ? -0.08 : 0]}
          >
            <mesh geometry={geo.sphere(12)} material={fur} scale={[0.25, 0.23, 0.24]} castShadow />
            <mesh geometry={geo.capsule(7)} material={furDark} position={[0, -0.025, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[0.12, 0.12, 0.1]} />
            {[-0.145, 0.145].map((x) => (
              <mesh
                key={x}
                geometry={geo.cone(5)}
                material={furDark}
                position={[x, 0.17, -0.015]}
                rotation={[0.04, 0, x < 0 ? 0.2 : -0.2]}
                scale={[0.11, 0.2, 0.075]}
                castShadow
              />
            ))}
            {[-0.075, 0.075].map((x) => (
              <mesh key={x} geometry={geo.sphere(6)} material={durkMats.eye} position={[x, 0.035, 0.215]} scale={[0.026, 0.03, 0.018]} />
            ))}
            <mesh geometry={geo.sphere(6)} material={durkMats.eye} position={[0, -0.035, 0.305]} scale={[0.055, 0.04, 0.032]} />
          </group>

          {(sleeping
            ? ([
                [-0.15, 0.09, 0.43],
                [0.15, 0.09, 0.43],
                [-0.18, 0.12, -0.28],
                [0.18, 0.12, -0.28],
              ] as [number, number, number][])
            : ([
                [-0.18, 0.27, 0.27],
                [0.18, 0.27, 0.27],
                [-0.18, 0.27, -0.27],
                [0.18, 0.27, -0.27],
              ] as [number, number, number][])).map(([x, y, z], i) => (
            <group
              key={i}
              ref={(node) => {
                if (node) legs.current[i] = node
              }}
              position={[x, y, z]}
            >
              <mesh
                geometry={geo.capsule(6)}
                material={i > 1 ? furDark : fur}
                rotation={sleeping ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
                scale={[0.065, sleeping ? 0.15 : 0.2, 0.065]}
                castShadow
              />
            </group>
          ))}

          <group ref={tail} position={[0, sleeping ? 0.25 : 0.64, -0.42]} rotation={[-0.5, -0.3, 0]}>
            <mesh geometry={geo.capsule(6)} material={furDark} position={[0, 0.12, -0.08]} rotation={[0.5, 0, 0]} scale={[0.065, 0.24, 0.065]} castShadow />
          </group>
        </group>
      </group>

      {behavior === 'fireflies' ? (
        <group ref={fireflies} position={[0, 0.72, 0.8]}>
          <mesh geometry={geo.sphere(6)} material={durkMats.firefly} scale={0.045} />
          <mesh geometry={geo.sphere(6)} material={durkMats.firefly} position={[0.22, 0.16, -0.12]} scale={0.028} />
        </group>
      ) : null}
    </group>
  )
})

/* ── Cat ─────────────────────────────────────────────────────────────────── */

export const Cat = memo(function Cat({
  position,
  rotation = 0,
  color = '#c99a63',
  /** Rises when petted. */
  content = 0,
  /** Metres she wanders from her anchor. 0 keeps her sitting still. */
  roamRadius = 2.6,
  seed = 0,
  groundHeight,
}: {
  position: [number, number, number]
  rotation?: number
  color?: string
  content?: number
  roamRadius?: number
  seed?: number
  groundHeight?: (x: number, z: number) => number
}) {
  const reduceMotion = useGame((s) => s.settings.reduceMotion)
  const root = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const phase = seed * 1.317
  const mats = useMemo(
    () => ({
      fur: storybook({ color, roughness: 0.95, rim: 0.45, rimColor: '#ffe6c0' }),
      dark: storybook({ color: '#4a3a2c', roughness: 0.9 }),
    }),
    [color],
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const motion = reduceMotion ? 0 : 1

    // She wanders a slow figure-of-eight around her spot, and stops wandering
    // while she is being petted — a cat that walks off mid-scratch is a cat
    // nobody is petting.
    const g = root.current
    if (g && roamRadius > 0) {
      const settle = 1 - Math.min(1, content) * 0.92
      const a = t * 0.09 * motion * settle + phase
      const x = Math.sin(a) * roamRadius
      const z = Math.sin(a * 2) * roamRadius * 0.5
      const nx = Math.sin(a + 0.02) * roamRadius
      const nz = Math.sin((a + 0.02) * 2) * roamRadius * 0.5
      const worldY = groundHeight?.(position[0] + x, position[2] + z) ?? position[1]
      g.position.set(x, worldY - position[1], z)
      // Only turn while actually travelling, or she spins on the spot.
      if (motion && settle > 0.25) g.rotation.y = Math.atan2(nx - x, nz - z)
    }

    if (tail.current) tail.current.rotation.x = -0.6 + Math.sin(t * (1.1 + content * 1.4)) * (0.22 + content * 0.3)
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.35) * 0.22
      head.current.rotation.z = content * 0.12
    }
    // The purr made visible: a fast shallow tremor through the body.
    if (body.current) {
      body.current.scale.y =
        1 + Math.sin(t * 1.4) * 0.014 + Math.sin(t * 34) * 0.006 * Math.min(1, content) * motion
    }
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={root}>
      <group ref={body}>
        {/* loaf shape — sitting */}
        <mesh geometry={geo.capsule(9)} material={mats.fur} position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.14, 0.16, 0.14]} castShadow />
        <group ref={head} position={[0, 0.3, 0.14]}>
          <mesh geometry={geo.sphere(12)} material={mats.fur} scale={[0.12, 0.11, 0.11]} castShadow />
          {[-0.06, 0.06].map((x) => (
            <mesh key={x} geometry={geo.cone(4)} material={mats.fur} position={[x, 0.09, -0.01]} scale={[0.06, 0.08, 0.04]} />
          ))}
          <mesh geometry={geo.sphere(6)} material={mats.dark} position={[0.045, 0.005, 0.1]} scale={[0.022, 0.026, 0.012]} />
          <mesh geometry={geo.sphere(6)} material={mats.dark} position={[-0.045, 0.005, 0.1]} scale={[0.022, 0.026, 0.012]} />
        </group>
        <group ref={tail} position={[0, 0.14, -0.16]}>
          <mesh geometry={geo.capsule(5)} material={mats.fur} position={[0, 0.06, -0.08]} rotation={[0.5, 0, 0]} scale={[0.03, 0.13, 0.03]} />
        </group>
      </group>
      </group>
    </group>
  )
})

/* ── Duck ────────────────────────────────────────────────────────────────── */

export const Ducks = memo(function Ducks({
  path,
  count = 4,
  waterLevel = 0,
  speed = 0.018,
}: {
  /** Loop the ducks paddle around. */
  path: [number, number][]
  count?: number
  waterLevel?: number
  speed?: number
}) {
  const group = useRef<THREE.Group>(null)
  const refs = useRef<THREE.Group[]>([])
  const mats = useMemo(
    () => ({
      body: storybook({ color: '#f2ede2', roughness: 0.95, rim: 0.45 }),
      head: storybook({ color: '#4f6b46', roughness: 0.9, rim: 0.4 }),
      bill: storybook({ color: '#e8b04a', roughness: 0.85, rim: 0.4 }),
    }),
    [],
  )

  const sample = (t: number): [number, number] => {
    const n = path.length
    const f = ((t % 1) + 1) % 1
    const i = Math.floor(f * n)
    const j = (i + 1) % n
    const k = f * n - i
    return [
      path[i][0] + (path[j][0] - path[i][0]) * k,
      path[i][1] + (path[j][1] - path[i][1]) * k,
    ]
  }

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed
    for (let i = 0; i < count; i++) {
      const g = refs.current[i]
      if (!g) continue
      const at = t - i * 0.035
      const [x, z] = sample(at)
      const [nx, nz] = sample(at + 0.01)
      g.position.set(x, waterLevel + 0.08 + Math.sin(state.clock.elapsedTime * 1.6 + i) * 0.015, z)
      g.rotation.y = Math.atan2(nx - x, nz - z)
    }
  })

  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el
          }}
        >
          <mesh geometry={geo.capsule(8)} material={mats.body} rotation={[Math.PI / 2, 0, 0]} scale={[0.1, 0.11, 0.09]} castShadow />
          <mesh geometry={geo.sphere(10)} material={mats.head} position={[0, 0.13, 0.09]} scale={[0.07, 0.075, 0.07]} />
          <mesh geometry={geo.cone(6)} material={mats.bill} position={[0, 0.12, 0.16]} rotation={[Math.PI / 2, 0, 0]} scale={[0.04, 0.07, 0.03]} />
          <mesh geometry={geo.sphere(6)} material={mats.body} position={[0, 0.06, -0.13]} scale={[0.05, 0.05, 0.07]} />
        </group>
      ))}
    </group>
  )
})

/* ── Deer ────────────────────────────────────────────────────────────────── */

export const Deer = memo(function Deer({
  position,
  rotation = 0,
  color = '#b08658',
  /** Looks at the player when she is close. */
  alertRadius = 9,
}: {
  position: [number, number, number]
  rotation?: number
  color?: string
  alertRadius?: number
}) {
  const head = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const alert = useRef(0)
  const mats = useMemo(
    () => ({
      coat: storybook({ color, roughness: 0.94, rim: 0.42, rimColor: '#ffe0b8' }),
      belly: storybook({ color: '#e8d5b8', roughness: 0.95, rim: 0.3 }),
      dark: storybook({ color: '#3a2c22', roughness: 0.9 }),
    }),
    [color],
  )

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const d = Math.hypot(runtime.playerPos.x - position[0], runtime.playerPos.z - position[2])
    alert.current = damp(alert.current, d < alertRadius ? 1 : 0, 3, dt)

    if (head.current) {
      // Grazing when calm, head up and turned toward her when she is near.
      const graze = (1 - alert.current) * (0.75 + Math.sin(t * 0.5) * 0.12)
      head.current.rotation.x = graze
      const toPlayer = Math.atan2(
        runtime.playerPos.x - position[0],
        runtime.playerPos.z - position[2],
      ) - rotation
      head.current.rotation.y = alert.current * Math.max(-1.1, Math.min(1.1, toPlayer))
    }
    if (body.current) body.current.position.y = Math.sin(t * 1.1) * 0.008
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={body}>
        <mesh geometry={geo.capsule(9)} material={mats.coat} position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.26, 0.4, 0.26]} castShadow />
        <mesh geometry={geo.capsule(7)} material={mats.belly} position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.32, 0.16]} />
        {/* neck */}
        <mesh geometry={geo.capsule(7)} material={mats.coat} position={[0, 0.95, 0.34]} rotation={[0.8, 0, 0]} scale={[0.11, 0.24, 0.11]} castShadow />
        <group ref={head} position={[0, 1.16, 0.5]}>
          <mesh geometry={geo.capsule(8)} material={mats.coat} position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} scale={[0.09, 0.14, 0.09]} castShadow />
          {[-0.06, 0.06].map((x) => (
            <mesh key={x} geometry={geo.cone(5)} material={mats.coat} position={[x, 0.08, -0.02]} scale={[0.06, 0.1, 0.03]} />
          ))}
          <mesh geometry={geo.sphere(6)} material={mats.dark} position={[0.05, 0.0, 0.15]} scale={[0.022, 0.026, 0.014]} />
          <mesh geometry={geo.sphere(6)} material={mats.dark} position={[-0.05, 0.0, 0.15]} scale={[0.022, 0.026, 0.014]} />
        </group>
        {/* legs */}
        {([[0.14, 0.24], [-0.14, 0.24], [0.14, -0.24], [-0.14, -0.24]] as [number, number][]).map((p, i) => (
          <mesh key={i} geometry={geo.capsule(5)} material={mats.coat} position={[p[0], 0.3, p[1]]} scale={[0.05, 0.2, 0.05]} castShadow />
        ))}
        <mesh geometry={geo.sphere(6)} material={mats.belly} position={[0, 0.82, -0.4]} scale={0.07} />
      </group>
    </group>
  )
})

/* ── Butterflies ─────────────────────────────────────────────────────────── */

export const Butterflies = memo(function Butterflies({
  count = 8,
  center = [0, 0, 0],
  radius = 12,
  height = 1.2,
  colors = ['#ffd9a0', '#f6a8b8', '#e9e4f2'],
  seed = 314,
}: {
  count?: number
  center?: [number, number, number]
  radius?: number
  height?: number
  colors?: string[]
  seed?: number
}) {
  const { particles: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const refs = useRef<THREE.Group[]>([])
  const wingsL = useRef<THREE.Mesh[]>([])
  const wingsR = useRef<THREE.Mesh[]>([])

  const paths = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: n }, () => ({
      cx: center[0] + (rand() - 0.5) * radius * 2,
      cz: center[2] + (rand() - 0.5) * radius * 2,
      r: 0.9 + rand() * 2.4,
      speed: 0.35 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      bob: 0.2 + rand() * 0.5,
      color: colors[Math.floor(rand() * colors.length)],
      flap: 9 + rand() * 6,
    }))
  }, [n, center[0], center[2], radius, seed])

  const mats = useMemo(() => {
    const map = new Map<string, THREE.MeshStandardMaterial>()
    for (const c of colors) {
      map.set(
        c,
        storybook({
          color: c,
          roughness: 0.95,
          rim: 0.5,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
        }),
      )
    }
    return map
  }, [colors])

  const wingGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.13, 0.1)
    g.translate(0.065, 0, 0)
    return g
  }, [])
  useLayoutEffect(() => () => wingGeo.dispose(), [wingGeo])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i]
      const g = refs.current[i]
      if (!g) continue
      const a = t * p.speed + p.phase
      const x = p.cx + Math.sin(a) * p.r + Math.sin(a * 2.3) * 0.4
      const z = p.cz + Math.cos(a * 1.13) * p.r
      const ground = runtime.sampleHeight(x, z)
      g.position.set(
        x,
        (Number.isFinite(ground) ? ground : 0) + height + Math.sin(a * 1.9) * p.bob,
        z,
      )
      g.rotation.y = -a
      const flap = Math.sin(t * p.flap + p.phase) * 1.0
      const l = wingsL.current[i]
      const r = wingsR.current[i]
      if (l) l.rotation.y = flap
      if (r) r.rotation.y = Math.PI - flap
    }
  })

  if (n === 0) return null

  return (
    <group>
      {paths.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el
          }}
        >
          <mesh
            geometry={wingGeo}
            material={mats.get(p.color)!}
            ref={(el) => {
              if (el) wingsL.current[i] = el
            }}
          />
          <mesh
            geometry={wingGeo}
            material={mats.get(p.color)!}
            ref={(el) => {
              if (el) wingsR.current[i] = el
            }}
            rotation={[0, Math.PI, 0]}
          />
        </group>
      ))}
    </group>
  )
})

/* ── Distant birds ───────────────────────────────────────────────────────── */

export const Birds = memo(function Birds({
  count = 9,
  center = [0, 0, 0],
  altitude = 42,
  radius = 90,
  color = '#4a4a52',
  seed = 808,
}: {
  count?: number
  center?: [number, number, number]
  altitude?: number
  radius?: number
  color?: string
  seed?: number
}) {
  const { particles: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const mat = useMemo(
    () => storybook({ color, roughness: 1, rim: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    [color],
  )
  // A shallow V — reads as a bird from any distance and costs 2 triangles.
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const v = new Float32Array([-0.5, 0, 0, 0, 0.12, 0, 0.5, 0, 0, 0, 0.12, 0, -0.5, 0, 0, 0, -0.02, 0.18])
    g.setAttribute('position', new THREE.BufferAttribute(v, 3))
    g.computeVertexNormals()
    return g
  }, [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const flock = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: n }, () => ({
      r: radius * (0.5 + rand() * 0.5),
      speed: 0.035 + rand() * 0.03,
      phase: rand() * Math.PI * 2,
      y: altitude + (rand() - 0.5) * 14,
      scale: 1.2 + rand() * 1.4,
      flap: 5 + rand() * 4,
    }))
  }, [n, radius, altitude, seed])

  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const t = state.clock.elapsedTime
    flock.forEach((b, i) => {
      const a = t * b.speed + b.phase
      dummy.position.set(center[0] + Math.sin(a) * b.r, b.y + Math.sin(a * 3) * 2.5, center[2] + Math.cos(a) * b.r)
      dummy.rotation.set(Math.sin(t * b.flap + b.phase) * 0.4, -a, 0)
      dummy.scale.setScalar(b.scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  if (n === 0) return null
  return <instancedMesh ref={ref} args={[geometry, mat, n]} frustumCulled={false} />
})

/* ── Townsfolk ───────────────────────────────────────────────────────────── */

export interface NpcAppearance {
  skin?: string
  hair?: string
  top?: string
  bottom?: string
  /** Slightly different heights read as different people at a glance. */
  height?: number
  apron?: string
}

export const Npc = memo(function Npc({
  position,
  rotation = 0,
  look = GIRL.skin,
  appearance = {},
  /** Turns to face the player when she is close enough to talk. */
  faceRadius = 4,
  busy = false,
}: {
  position: [number, number, number]
  rotation?: number
  look?: string
  appearance?: NpcAppearance
  faceRadius?: number
  busy?: boolean
}) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const facing = useRef(rotation)

  const a = {
    skin: appearance.skin ?? look,
    hair: appearance.hair ?? '#4a352a',
    top: appearance.top ?? '#8a9ab0',
    bottom: appearance.bottom ?? '#5d6472',
    height: appearance.height ?? 1,
    apron: appearance.apron,
  }

  const mats = useMemo(
    () => ({
      skin: storybook({ color: a.skin, roughness: 0.92, rim: 0.32 }),
      hair: storybook({ color: a.hair, roughness: 0.85, rim: 0.4 }),
      top: storybook({ color: a.top, roughness: 0.95, rim: 0.3, gradient: 0.24 }),
      bottom: storybook({ color: a.bottom, roughness: 0.95, rim: 0.26 }),
      apron: a.apron ? storybook({ color: a.apron, roughness: 0.97, rim: 0.34 }) : null,
      eye: storybook({ color: '#3a2a26', roughness: 0.5, rim: 0 }),
    }),
    [a.skin, a.hair, a.top, a.bottom, a.apron],
  )

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const d = Math.hypot(runtime.playerPos.x - position[0], runtime.playerPos.z - position[2])
    const want =
      d < faceRadius
        ? Math.atan2(runtime.playerPos.x - position[0], runtime.playerPos.z - position[2])
        : rotation
    let delta = want - facing.current
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    facing.current += delta * Math.min(1, dt * 3)
    if (root.current) root.current.rotation.y = facing.current

    // Idle: weight shift and breathing. If busy, the arms work at something.
    if (torso.current) {
      torso.current.rotation.z = Math.sin(t * 0.5 + position[0]) * 0.025
      torso.current.scale.y = 1 + Math.sin(t * 1.2 + position[2]) * 0.012
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.33 + position[0]) * 0.2
      head.current.rotation.x = Math.sin(t * 0.27) * 0.05
    }
    if (busy) {
      if (armL.current) armL.current.rotation.x = -0.9 + Math.sin(t * 2.4) * 0.35
      if (armR.current) armR.current.rotation.x = -0.9 + Math.sin(t * 2.4 + 1.1) * 0.35
    } else {
      if (armL.current) armL.current.rotation.x = Math.sin(t * 0.6) * 0.06
      if (armR.current) armR.current.rotation.x = Math.sin(t * 0.6 + 0.6) * 0.06
    }
  })

  const h = a.height

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={[1, h, 1]}>
      <group ref={torso} position={[0, 0.52, 0]}>
        <mesh geometry={geo.capsule(9)} material={mats.top} position={[0, 0.26, 0]} scale={[0.3, 0.26, 0.24]} castShadow />
        {mats.apron && (
          <mesh geometry={geo.plane()} material={mats.apron} position={[0, 0.14, 0.14]} scale={[0.36, 0.55, 1]} />
        )}
        <group ref={armL} position={[0.2, 0.4, 0]}>
          <mesh geometry={geo.capsule(6)} material={mats.top} position={[0, -0.16, 0]} scale={[0.09, 0.16, 0.09]} />
          <mesh geometry={geo.sphere(8)} material={mats.skin} position={[0, -0.34, 0]} scale={0.085} />
        </group>
        <group ref={armR} position={[-0.2, 0.4, 0]}>
          <mesh geometry={geo.capsule(6)} material={mats.top} position={[0, -0.16, 0]} scale={[0.09, 0.16, 0.09]} />
          <mesh geometry={geo.sphere(8)} material={mats.skin} position={[0, -0.34, 0]} scale={0.085} />
        </group>
        <group ref={head} position={[0, 0.66, 0]}>
          <mesh geometry={geo.cylinder(7)} material={mats.skin} position={[0, -0.11, 0]} scale={[0.07, 0.12, 0.07]} />
          <mesh geometry={geo.sphere(16)} material={mats.skin} scale={[0.38, 0.4, 0.37]} castShadow />
          <mesh geometry={geo.sphere(14)} material={mats.hair} position={[0, 0.04, -0.03]} scale={[0.4, 0.4, 0.39]} />
          <mesh geometry={geo.sphere(6)} material={mats.eye} position={[0.095, 0, 0.17]} scale={[0.042, 0.05, 0.026]} />
          <mesh geometry={geo.sphere(6)} material={mats.eye} position={[-0.095, 0, 0.17]} scale={[0.042, 0.05, 0.026]} />
        </group>
      </group>
      {/* legs */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} geometry={geo.capsule(6)} material={mats.bottom} position={[x, 0.28, 0]} scale={[0.1, 0.2, 0.1]} castShadow />
      ))}
    </group>
  )
})

/* ── Watchers ────────────────────────────────────────────────────────────── */

/**
 * Someone standing where she has to walk past.
 *
 * They do nothing. They do not block, they cannot be talked to, and they never
 * follow. All they do is turn their head to track her the whole way past, and
 * murmur half a sentence about her once she is close enough to hear it and not
 * close enough to answer.
 *
 * That is the entire design, and it is deliberate: the thing being modelled is
 * not a threat, it is the specific tiredness of being watched and discussed by
 * people who were never going to say it to your face. A watcher who confronted
 * her would be a smaller, more ordinary kind of bad.
 *
 * The murmur is picked per instance from `WATCHER_MURMURS` and never repeats
 * back-to-back within a chapter, because hearing the same line twice turns them
 * from people into a machine.
 */
export const Watcher = memo(function Watcher({
  position,
  rotation = 0,
  appearance = {},
  /** Metres at which the head starts tracking her. */
  watchRadius = 16,
  /** Metres at which the murmur fires. */
  murmurRadius = 7,
  seed = 0,
}: {
  position: [number, number, number]
  rotation?: number
  appearance?: NpcAppearance
  watchRadius?: number
  murmurRadius?: number
  seed?: number
}) {
  const reduceMotion = useGame((s) => s.settings.reduceMotion)
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const facing = useRef(rotation)
  /** True while she is inside the murmur radius; re-arms when she leaves. */
  const armed = useRef(true)
  const rand = useMemo(() => mulberry32(seed * 7919 + 13), [seed])
  const phase = useMemo(() => rand() * Math.PI * 2, [rand])

  const a = {
    skin: appearance.skin ?? '#8d7a6b',
    hair: appearance.hair ?? '#241c18',
    top: appearance.top ?? '#3a3742',
    bottom: appearance.bottom ?? '#2a2830',
    height: appearance.height ?? 1,
  }

  const mats = useMemo(
    () => ({
      // Deliberately desaturated and dim: they should read as figures rather
      // than as characters, and never pull focus from anything lit.
      skin: storybook({ color: a.skin, roughness: 0.96, rim: 0.22, rimColor: '#8fa0bd' }),
      hair: storybook({ color: a.hair, roughness: 0.92, rim: 0.24, rimColor: '#7f8ba3' }),
      top: storybook({ color: a.top, roughness: 0.97, rim: 0.2, gradient: 0.3 }),
      bottom: storybook({ color: a.bottom, roughness: 0.97, rim: 0.18 }),
      eye: storybook({ color: '#0b0a0c', roughness: 0.4, rim: 0 }),
    }),
    [a.skin, a.hair, a.top, a.bottom],
  )

  useFrame((state, rawDt) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const motion = reduceMotion ? 0 : 1

    const dx = runtime.playerPos.x - position[0]
    const dz = runtime.playerPos.z - position[2]
    const dist = Math.hypot(dx, dz)

    // Track her with the head and shoulders, not the feet. Someone who turns
    // their whole body to follow you is menacing; someone whose head follows you
    // while they carry on standing there is worse.
    if (dist < watchRadius) {
      const want = Math.atan2(dx, dz)
      facing.current = dampAngle(facing.current, want, 2.4, dt)
    }
    if (head.current) {
      head.current.rotation.y = (facing.current - rotation) * 0.72
      head.current.rotation.x = Math.sin(t * 0.5 + phase) * 0.02 * motion
    }
    if (torso.current) {
      torso.current.rotation.y = (facing.current - rotation) * 0.24
      torso.current.scale.y = 1 + Math.sin(t * 0.7 + phase) * 0.009 * motion
    }

    if (dist > murmurRadius * 1.5) {
      armed.current = true
      return
    }
    if (!armed.current || dist > murmurRadius) return

    const s = useGame.getState()
    if (s.phase !== 'playing' || s.dialogue || s.cinematic) return
    armed.current = false
    s.showWhisper(nextMurmur(), 'murmur')
  })

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={a.height}>
      <group ref={torso}>
        <mesh geometry={geo.capsule(8)} material={mats.top} position={[0, 0.86, 0]} scale={[0.19, 0.24, 0.15]} castShadow />
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} geometry={geo.capsule(6)} material={mats.top} position={[x, 0.84, 0]} scale={[0.062, 0.2, 0.062]} castShadow />
        ))}
        <group ref={head} position={[0, 1.24, 0]}>
          <mesh geometry={geo.sphere(12)} material={mats.skin} scale={[0.115, 0.13, 0.115]} castShadow />
          <mesh geometry={geo.sphere(10)} material={mats.hair} position={[0, 0.035, -0.012]} scale={[0.125, 0.115, 0.125]} />
          {[-0.045, 0.045].map((x) => (
            <mesh key={x} geometry={geo.sphere(6)} material={mats.eye} position={[x, 0.012, 0.098]} scale={[0.017, 0.022, 0.01]} />
          ))}
        </group>
      </group>
      {[-0.075, 0.075].map((x) => (
        <mesh key={x} geometry={geo.capsule(6)} material={mats.bottom} position={[x, 0.3, 0]} scale={[0.085, 0.22, 0.085]} castShadow />
      ))}
    </group>
  )
})

/**
 * Next murmur, never the same one twice in a row.
 *
 * Module-level rather than per-instance on purpose: two watchers ten metres
 * apart repeating each other reads as a bug, not as a crowd.
 */
let lastMurmur = -1
function nextMurmur(): string {
  let i = Math.floor(Math.random() * WATCHER_MURMURS.length)
  if (i === lastMurmur) i = (i + 1) % WATCHER_MURMURS.length
  lastMurmur = i
  return WATCHER_MURMURS[i]
}

/* ── A dog you can say hello to ──────────────────────────────────────────── */

/**
 * `Durk` plus the one thing he was always missing: a way to say hello.
 *
 * Kept as a wrapper rather than folded into `Durk` so the plain background dog
 * still exists for places where an interaction prompt would be intrusive — and
 * so this owns the greeting state, which is React state and therefore has no
 * business inside a component that runs a frame loop for the whole rig.
 *
 * Petting is deliberately unlimited and rewards nothing. He is a dog.
 */
export const PettableDog = memo(function PettableDog({
  id,
  name = DURK_NAME,
  coat = 'durk',
  position,
  rotation = 0,
  behavior = 'sleep',
  roamRadius = 1.25,
  seed = 0,
  groundHeight,
  registerToCompass = true,
  dialogueId,
  dialogueAgainId,
}: {
  /** Unique interaction id, e.g. `durk-town`. */
  id: string
  name?: string
  coat?: DogCoat
  position: [number, number, number]
  rotation?: number
  behavior?: DurkBehavior
  roamRadius?: number
  seed?: number
  groundHeight?: (x: number, z: number) => number
  registerToCompass?: boolean
  dialogueId: string
  dialogueAgainId: string
}) {
  const [greeting, setGreeting] = useState(0)
  const pets = useRef(0)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current)
    },
    [],
  )

  const onPet = useCallback(() => {
    pets.current += 1
    setGreeting(1)
    audio.cue('bark')
    // Ride the same clock the rig decays on, then let React agree with it.
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => setGreeting(0), 4500)
    useGame.getState().startDialogue(
      getDialogue(pets.current > 1 ? dialogueAgainId : dialogueId),
    )
  }, [dialogueId, dialogueAgainId])

  return (
    <>
      <Durk
        position={position}
        rotation={rotation}
        behavior={behavior}
        roamRadius={roamRadius}
        seed={seed}
        groundHeight={groundHeight}
        coat={coat}
        name={name}
        greeting={greeting}
        registerToCompass={registerToCompass}
      />
      <Interactable
        id={id}
        verb="pet"
        label={name}
        position={[position[0], 0, position[2]]}
        radius={2.6}
        onInteract={onPet}
      />
    </>
  )
})
