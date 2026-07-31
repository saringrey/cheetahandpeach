import { useRef, useMemo, memo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { geo, storybook, glow } from '../../utils/assets'
import { GIRL } from '../../content/characters'
import { damp, dampAngle, clamp, clamp01 } from '../../utils/math'

export type PoseState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'interact'
  | 'inspect'
  | 'sit'
  | 'lookUp'
  | 'enterCar'

export interface GirlHandle {
  group: THREE.Group | null
}

interface GirlProps {
  /** Horizontal speed in m/s — drives the walk/run blend automatically. */
  speedRef: React.MutableRefObject<number>
  /** Explicit pose override. 'idle' lets speed decide. */
  poseRef: React.MutableRefObject<PoseState>
  /** Optional world point she turns her head toward. */
  lookAtRef?: React.MutableRefObject<THREE.Vector3 | null>
  castShadow?: boolean
}

/**
 * The player character.
 *
 * Built entirely from cached primitives — no model file, no loader, no fetch.
 * The silhouette is the point: a big round head on a small body, soft bob of
 * hair, and clearly separated limbs so the walk reads from the follow camera.
 *
 * Animation is procedural. A single phase accumulator drives the gait; every
 * other motion is a damped offset layered on top of it.
 */
export const Girl = memo(function Girl({ speedRef, poseRef, lookAtRef, castShadow = true }: GirlProps) {
  const root = useRef<THREE.Group>(null)
  const hips = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const skirt = useRef<THREE.Group>(null)
  const hairTail = useRef<THREE.Group>(null)
  const eyeL = useRef<THREE.Mesh>(null)
  const eyeR = useRef<THREE.Mesh>(null)

  const phase = useRef(0)
  const blend = useRef(0)
  const lean = useRef(0)
  const idleTimer = useRef(0)
  const glance = useRef(new THREE.Vector2(0, 0))
  const glanceTarget = useRef(new THREE.Vector2(0, 0))
  const poseWeight = useRef({ sit: 0, interact: 0, up: 0 })
  const blink = useRef({ next: 2.4, age: 1 })

  const mats = useMemo(
    () => ({
      skin: storybook({ color: GIRL.skin, roughness: 0.92, rim: 0.32, gradient: 0.2 }),
      hair: storybook({ color: GIRL.hair, roughness: 0.82, rim: 0.4, gradient: 0.26 }),
      hairShadow: storybook({ color: GIRL.hairShadow, roughness: 0.85, rim: 0.22 }),
      shirt: storybook({ color: GIRL.shirt, roughness: 0.9, rim: 0.3, gradient: 0.24 }),
      spots: storybook({ color: GIRL.shirtSpots, roughness: 0.85, rim: 0.12 }),
      pants: storybook({ color: GIRL.pants, roughness: 0.92, rim: 0.24, gradient: 0.28 }),
      shoes: storybook({ color: GIRL.shoes, roughness: 0.8, rim: 0.24 }),
      eye: storybook({ color: '#3a2a26', roughness: 0.5, rim: 0 }),
      blush: glow('#f3a58c', 0.4),
      accent: GIRL.hairAccent ? storybook({ color: GIRL.hairAccent, roughness: 0.7, rim: 0.5 }) : null,
    }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const speed = speedRef.current
    const pose = poseRef.current
    const t = state.clock.elapsedTime

    // ── gait ────────────────────────────────────────────────────────────
    const moving = speed > 0.08 && pose !== 'sit' && pose !== 'enterCar'
    // Stride frequency rises with speed but compresses at a run so it does not scramble.
    const freq = moving ? STRIDE_BASE + Math.min(speed, 5) * STRIDE_PER_SPEED : 0
    phase.current += freq * dt
    blend.current = damp(blend.current, moving ? clamp01(speed / 2.6) : 0, 9, dt)
    lean.current = damp(lean.current, moving ? clamp(speed * 0.035, 0, 0.16) : 0, 5, dt)

    const w = blend.current
    const swing = Math.sin(phase.current)
    const bob = Math.abs(Math.sin(phase.current)) // two bobs per stride

    // ── pose weights ─────────────────────────────────────────────────────
    const pw = poseWeight.current
    pw.sit = damp(pw.sit, pose === 'sit' || pose === 'enterCar' ? 1 : 0, 6, dt)
    pw.interact = damp(pw.interact, pose === 'interact' || pose === 'inspect' ? 1 : 0, 8, dt)
    pw.up = damp(pw.up, pose === 'lookUp' ? 1 : 0, 5, dt)

    // ── contextual idle ──────────────────────────────────────────────────
    // Every few seconds while standing still she shifts her weight and glances
    // at something — a butterfly, a flower, the mountain.
    if (!moving && pose === 'idle') {
      idleTimer.current -= dt
      if (idleTimer.current <= 0) {
        idleTimer.current = 3.2 + Math.random() * 4.5
        glanceTarget.current.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.32) * 0.5)
      }
    } else {
      idleTimer.current = 1.5
      glanceTarget.current.set(0, 0)
    }
    glance.current.x = damp(glance.current.x, glanceTarget.current.x, 2.2, dt)
    glance.current.y = damp(glance.current.y, glanceTarget.current.y, 2.2, dt)

    const breathe = Math.sin(t * 1.25) * 0.5 + 0.5
    const idleShift = Math.sin(t * 0.55) * (1 - w)

    // A real blink, not a looping squash: long irregular rests make the rare
    // close-up feel inhabited without calling attention to the animation.
    const b = blink.current
    b.next -= dt
    b.age += dt
    if (b.next <= 0) {
      b.next = 3.1 + Math.random() * 4.8
      b.age = 0
    }
    const closed = b.age < 0.16 ? Math.sin((b.age / 0.16) * Math.PI) : 0
    const eyeHeight = 0.062 * (1 - closed * 0.84)
    if (eyeL.current) eyeL.current.scale.y = eyeHeight
    if (eyeR.current) eyeR.current.scale.y = eyeHeight

    // ── hips ─────────────────────────────────────────────────────────────
    if (hips.current) {
      const sitDrop = pw.sit * 0.17
      hips.current.position.y = HIP_Y - sitDrop + w * bob * 0.026 + (1 - w) * breathe * 0.004
      hips.current.rotation.z = swing * 0.05 * w + idleShift * 0.018
      hips.current.rotation.y = -swing * 0.12 * w
    }

    // ── torso ────────────────────────────────────────────────────────────
    if (torso.current) {
      torso.current.rotation.x = lean.current + pw.interact * 0.22 - pw.up * 0.14 + pw.sit * 0.05
      torso.current.rotation.y = swing * 0.1 * w
      torso.current.rotation.z = idleShift * 0.022
      torso.current.scale.y = 1 + (1 - w) * breathe * 0.012
    }

    // ── head ─────────────────────────────────────────────────────────────
    if (head.current) {
      let yaw = glance.current.x * 0.5
      let pitch = glance.current.y * 0.35 - lean.current * 0.6 + pw.interact * 0.3 - pw.up * 0.95

      const lookAt = lookAtRef?.current
      if (lookAt && root.current) {
        // Turn toward a world point, but only within a believable neck range.
        const wp = root.current.getWorldPosition(_v1)
        const dx = lookAt.x - wp.x
        const dz = lookAt.z - wp.z
        const worldYaw = Math.atan2(dx, dz)
        let rel = worldYaw - root.current.rotation.y
        while (rel > Math.PI) rel -= Math.PI * 2
        while (rel < -Math.PI) rel += Math.PI * 2
        yaw = clamp(rel, -0.95, 0.95)
        const dy = lookAt.y - (wp.y + HIP_Y + HEAD_Y)
        pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.7, 0.6)
      }

      head.current.rotation.y = dampAngle(head.current.rotation.y, yaw, 6, dt)
      head.current.rotation.x = damp(head.current.rotation.x, pitch, 6, dt)
      head.current.rotation.z = damp(head.current.rotation.z, glance.current.x * 0.1, 4, dt)
      head.current.position.y = HEAD_Y + (1 - w) * breathe * 0.005
    }

    // ── arms ─────────────────────────────────────────────────────────────
    // Arms counter-swing the legs. At a run they lift and bend more.
    const armSwing = swing * (0.55 + w * 0.5) * w
    const armBend = -0.12 - w * 0.5
    if (armL.current) {
      armL.current.rotation.x = -armSwing + armBend * w + pw.interact * 0.9 + pw.sit * 0.35 - pw.up * 0.1
      armL.current.rotation.z = 0.13 + w * 0.06 + pw.sit * 0.12
    }
    if (armR.current) {
      armR.current.rotation.x = armSwing + armBend * w + pw.interact * 1.25 + pw.sit * 0.35 - pw.up * 0.1
      armR.current.rotation.z = -0.13 - w * 0.06 - pw.sit * 0.12
    }

    // ── legs ─────────────────────────────────────────────────────────────
    if (legL.current) {
      legL.current.rotation.x = swing * 0.7 * w - pw.sit * 1.45
      legL.current.rotation.z = pw.sit * 0.06
    }
    if (legR.current) {
      legR.current.rotation.x = -swing * 0.7 * w - pw.sit * 1.45
      legR.current.rotation.z = -pw.sit * 0.06
    }

    // ── secondary motion: skirt + hair lag behind the body ───────────────
    if (skirt.current) {
      skirt.current.rotation.x = damp(skirt.current.rotation.x, -lean.current * 0.8 - w * 0.06, 7, dt)
      skirt.current.rotation.z = damp(skirt.current.rotation.z, -swing * 0.07 * w, 7, dt)
      skirt.current.scale.x = 1 + w * 0.03
    }
    if (hairTail.current) {
      hairTail.current.rotation.x = damp(
        hairTail.current.rotation.x,
        -lean.current * 1.4 - w * 0.22 + Math.sin(t * 1.6) * 0.02,
        6,
        dt,
      )
      hairTail.current.rotation.z = damp(hairTail.current.rotation.z, swing * 0.09 * w, 6, dt)
    }
  })

  const longHair = GIRL.hairStyle === 'long' || GIRL.hairStyle === 'ponytail'

  return (
    <group ref={root} name="girl">
      <group ref={hips} position={[0, HIP_Y, 0]}>
        {/* ── torso: short and soft, a child's barrel ─────────────────── */}
        <group ref={torso}>
          {/* waistband + tucked lower shirt — wide for its height, not narrow */}
          <group ref={skirt}>
            <mesh
              geometry={geo.capsule(10)}
              material={mats.pants}
              position={[0, 0.04, 0]}
              scale={[0.145, 0.1, 0.12]}
              castShadow={castShadow}
            />
            <mesh
              geometry={geo.capsule(10)}
              material={mats.shirt}
              position={[0, 0.15, 0]}
              scale={[0.155, 0.115, 0.125]}
              castShadow={castShadow}
            />
          </group>
          {/* chest — the cheetah shirt */}
          <mesh
            geometry={geo.capsule(12)}
            material={mats.shirt}
            position={[0, 0.285, 0]}
            scale={[0.175, 0.13, 0.135]}
            castShadow={castShadow}
          />
          {/* loose rosettes scattered across the front — reads as cheetah print */}
          {CHEETAH_SPOTS.map(([x, y, z, s], i) => (
            <mesh
              key={i}
              geometry={geo.sphere(8)}
              material={mats.spots}
              position={[x, y, z]}
              scale={[0.03 * s, 0.038 * s, 0.012]}
            />
          ))}
          {/* neck — short, so the head sits down on the shoulders */}
          <mesh geometry={geo.cylinder(10)} material={mats.skin} position={[0, 0.375, 0]} scale={[0.046, 0.055, 0.046]} />

          {/* ── arms: short and rounded, sleeves to mid-upper-arm ───────── */}
          <group ref={armL} position={[0.155, 0.315, 0]}>
            <mesh geometry={geo.capsule(8)} material={mats.shirt} position={[0, -0.08, 0]} scale={[0.058, 0.09, 0.058]} />
            <mesh geometry={geo.capsule(8)} material={mats.skin} position={[0, -0.225, 0]} scale={[0.05, 0.09, 0.05]} castShadow={castShadow} />
            <mesh geometry={geo.sphere(10)} material={mats.skin} position={[0, -0.335, 0]} scale={0.055} />
          </group>
          <group ref={armR} position={[-0.155, 0.315, 0]}>
            <mesh geometry={geo.capsule(8)} material={mats.shirt} position={[0, -0.08, 0]} scale={[0.058, 0.09, 0.058]} />
            <mesh geometry={geo.capsule(8)} material={mats.skin} position={[0, -0.225, 0]} scale={[0.05, 0.09, 0.05]} castShadow={castShadow} />
            <mesh geometry={geo.sphere(10)} material={mats.skin} position={[0, -0.335, 0]} scale={0.055} />
          </group>

          {/* ── head: a child's — nearly full size on a much smaller body ─ */}
          <group ref={head} position={[0, HEAD_Y, 0]}>
            {/* skull */}
            <mesh geometry={geo.sphere(20)} material={mats.skin} scale={[0.215, 0.235, 0.22]} castShadow={castShadow} />
            {/* hair cap, only slightly proud of the skull */}
            <mesh geometry={geo.sphere(18)} material={mats.hair} position={[0, 0.018, -0.013]} scale={[0.228, 0.243, 0.232]} castShadow={castShadow} />
            {/* fringe across the brow */}
            <mesh geometry={geo.sphere(14)} material={mats.hair} position={[0, 0.056, 0.072]} scale={[0.194, 0.096, 0.162]} />
            {/* face plate carved back out of the hair */}
            <mesh geometry={geo.sphere(16)} material={mats.skin} position={[0, -0.026, 0.033]} scale={[0.19, 0.182, 0.199]} />

            {/* eyes — set low and wide, the way a child's face reads */}
            <mesh ref={eyeL} geometry={geo.sphere(10)} material={mats.eye} position={[0.062, -0.014, 0.117]} scale={[0.033, 0.042, 0.023]} />
            <mesh ref={eyeR} geometry={geo.sphere(10)} material={mats.eye} position={[-0.062, -0.014, 0.117]} scale={[0.033, 0.042, 0.023]} />
            <mesh geometry={geo.sphere(8)} material={mats.blush} position={[0.096, -0.06, 0.093]} scale={[0.043, 0.025, 0.013]} />
            <mesh geometry={geo.sphere(8)} material={mats.blush} position={[-0.096, -0.06, 0.093]} scale={[0.043, 0.025, 0.013]} />

            {/* ── hair below the cap, hung so it lags on turns ─────────── */}
            {longHair && (
              <group ref={hairTail} position={[0, 0.014, -0.075]}>
                <mesh geometry={geo.capsule(10)} material={mats.hair} position={[0, -0.145, -0.011]} scale={[0.14, 0.155, 0.108]} castShadow={castShadow} />
                <mesh geometry={geo.capsule(8)} material={mats.hairShadow} position={[0.107, -0.16, 0.022]} scale={[0.052, 0.135, 0.05]} />
                <mesh geometry={geo.capsule(8)} material={mats.hairShadow} position={[-0.107, -0.16, 0.022]} scale={[0.052, 0.135, 0.05]} />
              </group>
            )}
            {GIRL.hairStyle === 'bun' && (
              <mesh geometry={geo.sphere(12)} material={mats.hair} position={[0, 0.172, -0.118]} scale={0.115} />
            )}
            {mats.accent && (
              <mesh geometry={geo.sphere(10)} material={mats.accent} position={[0.137, 0.105, 0.055]} scale={[0.054, 0.054, 0.035]} />
            )}
          </group>
        </group>

        {/* ── legs: short and sturdy (trousers) ───────────────────────── */}
        <group ref={legL} position={[0.078, -0.02, 0]}>
          <mesh geometry={geo.capsule(8)} material={mats.pants} position={[0, -0.115, 0]} scale={[0.082, 0.12, 0.082]} castShadow={castShadow} />
          <mesh geometry={geo.capsule(8)} material={mats.pants} position={[0, -0.34, 0]} scale={[0.068, 0.13, 0.068]} castShadow={castShadow} />
          <mesh geometry={geo.softBox(0.05)} material={mats.shoes} position={[0, -0.48, 0.045]} scale={[0.096, 0.068, 0.172]} castShadow={castShadow} />
        </group>
        <group ref={legR} position={[-0.078, -0.02, 0]}>
          <mesh geometry={geo.capsule(8)} material={mats.pants} position={[0, -0.115, 0]} scale={[0.082, 0.12, 0.082]} castShadow={castShadow} />
          <mesh geometry={geo.capsule(8)} material={mats.pants} position={[0, -0.34, 0]} scale={[0.068, 0.13, 0.068]} castShadow={castShadow} />
          <mesh geometry={geo.softBox(0.05)} material={mats.shoes} position={[0, -0.48, 0.045]} scale={[0.096, 0.068, 0.172]} castShadow={castShadow} />
        </group>
      </group>
    </group>
  )
})

/**
 * Proportions. A little girl — about 1.1 units to the top of her head, roughly
 * five heads tall. The head barely shrank from the adult version; everything
 * under it did, which is the whole trick: a child is not a small adult, she is
 * a normal head on a short body with short legs. Every joint offset above is
 * relative to these two.
 */
const HIP_Y = 0.52
const HEAD_Y = 0.44

/**
 * Stride frequency for her leg length: short legs take quicker, smaller steps.
 * Exported because footsteps must be struck on the same phase the legs swing
 * on — two copies of these numbers would drift apart the moment either is tuned.
 */
export const STRIDE_BASE = 2.45
export const STRIDE_PER_SPEED = 0.86

/**
 * Loose cheetah rosettes across the front of the shirt: [x, y, z, scale].
 * Simple filled spots read unmistakably as "cheetah print" from the follow
 * camera without the cost of a texture the storybook material would not carry.
 */
const CHEETAH_SPOTS: [number, number, number, number][] = [
  [0.019, 0.346, 0.122, 0.85],
  [-0.085, 0.323, 0.108, 0.7],
  [0.104, 0.308, 0.098, 0.78],
  [-0.028, 0.277, 0.13, 0.92],
  [0.076, 0.247, 0.122, 0.74],
  [-0.104, 0.239, 0.098, 0.78],
  [0.123, 0.217, 0.084, 0.7],
  [-0.057, 0.201, 0.126, 0.85],
  [0.028, 0.179, 0.122, 0.78],
  [-0.114, 0.163, 0.088, 0.65],
  [0.095, 0.148, 0.102, 0.74],
  [-0.019, 0.133, 0.118, 0.7],
  [0.147, 0.285, 0.054, 0.6],
  [-0.147, 0.3, 0.054, 0.6],
]

const _v1 = new THREE.Vector3()
