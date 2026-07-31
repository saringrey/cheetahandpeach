import { useRef, useMemo, useLayoutEffect, memo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { geo, storybook, glow, roundedBoxGeometry } from '../../utils/assets'
import { runtime, type Collider } from '../../store/runtime'
import { CAR, PERSON } from '../../content/characters'
import { windUniforms } from './nature'
import { mulberry32 } from '../../utils/math'

/**
 * Structures and objects.
 *
 * Everything is built from the cached primitives in `utils/assets`, so a whole
 * town shares a handful of geometries and materials. Anything solid registers
 * its own collider on mount and removes it on unmount.
 */

/** Registers colliders for the lifetime of a component. */
export function useColliders(make: () => Collider[], deps: unknown[]) {
  useLayoutEffect(() => {
    const cols = make()
    if (!cols.length) return
    runtime.colliders.push(...cols)
    return () => {
      runtime.colliders = runtime.colliders.filter((c) => !cols.includes(c))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lanterns and lights
 * ──────────────────────────────────────────────────────────────────────────── */

export const Lantern = memo(function Lantern({
  position,
  color = '#ffb877',
  lit = true,
  height = 2.6,
  style = 'post',
  /** Only a couple of lanterns per scene should cast a real light. */
  realLight = false,
  intensity = 10,
}: {
  position: [number, number, number]
  color?: string
  lit?: boolean
  height?: number
  style?: 'post' | 'hanging' | 'floating'
  realLight?: boolean
  intensity?: number
}) {
  const glassRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const mats = useMemo(
    () => ({
      wood: storybook({ color: '#5d4636', roughness: 0.9, rim: 0.24 }),
      metal: storybook({ color: '#3f3830', roughness: 0.6, metalness: 0.3, rim: 0.4 }),
      glass: glow(color, lit ? 1 : 0.25),
    }),
    [color, lit],
  )

  useFrame((state) => {
    if (!lit) return
    // Lanterns breathe rather than flicker — a slow, warm pulse.
    const p = 0.88 + Math.sin(state.clock.elapsedTime * 1.3 + position[0] * 2.1) * 0.12
    if (glassRef.current) glassRef.current.scale.setScalar(0.34 * p)
    if (lightRef.current) lightRef.current.intensity = intensity * p
  })

  useColliders(
    () => (style === 'post' ? [{ kind: 'circle', x: position[0], z: position[2], r: 0.22 }] : []),
    [position[0], position[2], style],
  )

  return (
    <group position={position}>
      {style === 'post' && (
        <>
          <mesh geometry={geo.cylinder(7)} material={mats.wood} position={[0, height / 2, 0]} scale={[0.11, height, 0.11]} castShadow />
          <mesh geometry={geo.box()} material={mats.metal} position={[0, height, 0.14]} scale={[0.06, 0.06, 0.3]} />
        </>
      )}
      {style === 'hanging' && (
        <mesh geometry={geo.cylinder(5)} material={mats.metal} position={[0, height + 0.2, 0]} scale={[0.02, 0.4, 0.02]} />
      )}

      {/* cap */}
      <mesh
        geometry={geo.cone(7)}
        material={mats.metal}
        position={[0, height + (style === 'post' ? 0.32 : 0), style === 'post' ? 0.28 : 0]}
        scale={[0.42, 0.24, 0.42]}
        castShadow
      />
      {/* glass */}
      <mesh
        ref={glassRef}
        geometry={geo.sphere(10)}
        material={mats.glass}
        position={[0, height + (style === 'post' ? 0.1 : -0.22), style === 'post' ? 0.28 : 0]}
        scale={0.34}
      />
      {lit ? (
        <Glint
          position={[0, height + (style === 'post' ? 0.1 : -0.22), style === 'post' ? 0.28 : 0]}
          color={color}
          size={2.2}
        />
      ) : null}
      {realLight && lit ? (
        <pointLight
          ref={lightRef}
          color={color}
          intensity={intensity}
          distance={13}
          decay={2}
          position={[0, height + (style === 'post' ? 0.1 : -0.22), style === 'post' ? 0.28 : 0]}
        />
      ) : null}
    </group>
  )
})


/** Radial falloff painted once and shared by every glare card. */
let _glareTex: THREE.Texture | null = null
function glareTexture() {
  if (_glareTex) return _glareTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.42)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  _glareTex = new THREE.CanvasTexture(c)
  _glareTex.colorSpace = THREE.SRGBColorSpace
  return _glareTex
}

const glareMats = new Map<string, THREE.SpriteMaterial>()
function glareMaterial(color: string) {
  let m = glareMats.get(color)
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: glareTexture(),
      color: new THREE.Color(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    })
    glareMats.set(color, m)
  }
  return m
}

/**
 * The soft bloom around a light source. A sprite always faces the camera, so
 * this reads correctly from every angle without a per-frame billboard update.
 */
export const Glint = memo(function Glint({
  position,
  color = '#ffb877',
  size = 1.6,
  intensity = 1,
}: {
  position: [number, number, number]
  color?: string
  size?: number
  intensity?: number
}) {
  const ref = useRef<THREE.Sprite>(null)
  const worldPosition = useMemo(() => new THREE.Vector3(), [])
  // Opacity changes per light and per frame. Sharing the cached base material
  // made the last-updated lamp silently control every lamp of the same color.
  const mat = useMemo(() => glareMaterial(color).clone(), [color])

  useLayoutEffect(() => () => mat.dispose(), [mat])

  useFrame((state) => {
    const sp = ref.current
    if (!sp) return
    // Breathe with the lamp, and swell a little as the camera gets close —
    // which is what makes it feel like light in air rather than a decal.
    const t = state.clock.elapsedTime
    const pulse = 0.9 + Math.sin(t * 1.4 + position[0] * 2.3) * 0.1
    sp.getWorldPosition(worldPosition)
    const d = state.camera.position.distanceTo(worldPosition)
    const near = 1 + Math.max(0, 1 - d / 14) * 0.5
    const s = size * pulse * near * intensity
    sp.scale.set(s, s, s)
    mat.opacity = 0.38 * intensity * pulse
  })

  return <sprite ref={ref} position={position} material={mat} renderOrder={12} />
})

/* ────────────────────────────────────────────────────────────────────────────
 * Buildings
 * ──────────────────────────────────────────────────────────────────────────── */

interface BuildingProps {
  position: [number, number, number]
  rotation?: number
  width?: number
  depth?: number
  height?: number
  wall?: string
  roof?: string
  trim?: string
  /** Lit windows. */
  windowsLit?: boolean
  windowColor?: string
  roofStyle?: 'gable' | 'flat' | 'hip'
  collide?: boolean
}

export const House = memo(function House({
  position,
  rotation = 0,
  width = 5,
  depth = 4.5,
  height = 3.2,
  wall = '#e8d3b4',
  roof = '#a8624c',
  trim = '#7d5a45',
  windowsLit = false,
  windowColor = '#ffcf8f',
  roofStyle = 'gable',
  collide = true,
}: BuildingProps) {
  const mats = useMemo(
    () => ({
      wall: storybook({ color: wall, roughness: 0.95, rim: 0.24, gradient: 0.24 }),
      roof: storybook({ color: roof, roughness: 0.92, rim: 0.3, gradient: 0.28 }),
      trim: storybook({ color: trim, roughness: 0.9, rim: 0.26 }),
      glass: glow(windowColor, windowsLit ? 1 : 0.16),
      dark: storybook({ color: '#4a3a30', roughness: 0.9 }),
    }),
    [wall, roof, trim, windowColor, windowsLit],
  )

  const bodyGeo = useMemo(() => roundedBoxGeometry(1, 1, 1, 0.09, 1), [])
  useLayoutEffect(() => () => bodyGeo.dispose(), [bodyGeo])

  useColliders(
    () =>
      collide
        ? [
            {
              kind: 'box',
              x: position[0],
              z: position[2],
              hw: width / 2,
              hd: depth / 2,
              rot: rotation,
            },
          ]
        : [],
    [position[0], position[2], width, depth, rotation, collide],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* body */}
      <mesh
        geometry={bodyGeo}
        material={mats.wall}
        position={[0, height / 2, 0]}
        scale={[width, height, depth]}
        castShadow
        receiveShadow
      />

      {/* roof */}
      {roofStyle === 'gable' ? (
        <mesh
          geometry={geo.cone(4)}
          material={mats.roof}
          position={[0, height + width * 0.22, 0]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[width * 0.86, width * 0.46, depth * 0.98]}
          castShadow
        />
      ) : roofStyle === 'hip' ? (
        <mesh
          geometry={geo.cone(4)}
          material={mats.roof}
          position={[0, height + width * 0.16, 0]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[width * 0.92, width * 0.34, depth * 1.02]}
          castShadow
        />
      ) : (
        <mesh
          geometry={bodyGeo}
          material={mats.roof}
          position={[0, height + 0.09, 0]}
          scale={[width * 1.06, 0.2, depth * 1.06]}
          castShadow
        />
      )}

      {/* door */}
      <mesh
        geometry={geo.box()}
        material={mats.dark}
        position={[0, 0.72, depth / 2 + 0.02]}
        scale={[0.78, 1.44, 0.08]}
      />
      <mesh
        geometry={geo.box()}
        material={mats.trim}
        position={[0, 1.48, depth / 2 + 0.04]}
        scale={[0.94, 0.1, 0.12]}
      />

      {/* windows */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            geometry={geo.box()}
            material={mats.glass}
            position={[s * width * 0.28, height * 0.62, depth / 2 + 0.03]}
            scale={[0.72, 0.72, 0.06]}
          />
          <mesh
            geometry={geo.box()}
            material={mats.trim}
            position={[s * width * 0.28, height * 0.62, depth / 2 + 0.05]}
            scale={[0.82, 0.07, 0.07]}
          />
          <mesh
            geometry={geo.box()}
            material={mats.trim}
            position={[s * width * 0.28, height * 0.62, depth / 2 + 0.05]}
            scale={[0.07, 0.82, 0.07]}
          />
        </group>
      ))}

      {/* side window */}
      <mesh
        geometry={geo.box()}
        material={mats.glass}
        position={[width / 2 + 0.03, height * 0.6, 0]}
        scale={[0.06, 0.66, 0.66]}
      />
    </group>
  )
})

/** Flat, distant building silhouettes for the reality chapters. */
export const BuildingSilhouette = memo(function BuildingSilhouette({
  position,
  width = 14,
  height = 6,
  depth = 10,
  color = '#3f4550',
  litWindows = 0,
  windowColor = '#ffd39a',
}: {
  position: [number, number, number]
  width?: number
  height?: number
  depth?: number
  color?: string
  litWindows?: number
  windowColor?: string
}) {
  const mat = useMemo(() => storybook({ color, roughness: 0.95, rim: 0.16, gradient: 0.2 }), [color])
  // These are distant, ordinary windows—not UI-bright beacons. Keeping them
  // inside tone mapping and the scene fog gives the reality half real depth.
  const winMat = useMemo(
    () =>
      storybook({
        color: windowColor,
        emissive: windowColor,
        emissiveIntensity: 0.82,
        roughness: 0.72,
        rim: 0.04,
        gradient: 0,
      }),
    [windowColor],
  )
  const windows = useMemo(() => {
    const out: [number, number][] = []
    const cols = Math.floor(width / 2.4)
    const rows = Math.floor(height / 2.2)
    let placed = 0
    for (let r = 0; r < rows && placed < litWindows; r++) {
      for (let c = 0; c < cols && placed < litWindows; c++) {
        // Deterministic scatter so the same windows are lit every run.
        if (((r * 7 + c * 13) % 5) < 2) {
          out.push([(c - (cols - 1) / 2) * 2.4, 1.6 + r * 2.2])
          placed++
        }
      }
    }
    return out
  }, [width, height, litWindows])

  return (
    <group position={position}>
      <mesh
        geometry={geo.box()}
        material={mat}
        position={[0, height / 2, 0]}
        scale={[width, height, depth]}
        castShadow
        receiveShadow
      />
      {windows.map((w, i) => (
        <mesh
          key={i}
          geometry={geo.box()}
          material={winMat}
          position={[w[0], w[1], depth / 2 + 0.05]}
          scale={[1.0, 1.1, 0.06]}
        />
      ))}
    </group>
  )
})


/* ────────────────────────────────────────────────────────────────────────────
 * A strip mall, and the sign above it.
 * ──────────────────────────────────────────────────────────────────────────── */

const signTextures = new Map<string, THREE.Texture>()
function signTexture(text: string, color: string, coreColor: string) {
  const key = text + color + coreColor
  let t = signTextures.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.font = "600 168px ui-serif, 'Iowan Old Style', Palatino, Georgia, serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // A soft halo under the letters so the sign glows rather than just being lit.
  ctx.shadowColor = color
  ctx.shadowBlur = 46
  ctx.fillStyle = color
  ctx.fillText(text, c.width / 2, c.height / 2 + 6)
  ctx.shadowBlur = 22
  ctx.fillStyle = coreColor
  ctx.fillText(text, c.width / 2, c.height / 2 + 6)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  signTextures.set(key, t)
  return t
}

/** Illuminated storefront lettering. Unlit and untonemapped, so bloom takes it. */
export const GlowSign = memo(function GlowSign({
  position,
  rotation = 0,
  text,
  color = '#ffd9a0',
  width = 12,
  height = 3,
  light = true,
  coreColor = '#ffffff',
}: {
  position: [number, number, number]
  rotation?: number
  text: string
  color?: string
  width?: number
  height?: number
  light?: boolean
  /** Letter core; defaults white for existing signs. Set to red for neon-red text. */
  coreColor?: string
}) {
  const map = useMemo(() => signTexture(text, color, coreColor), [text, color, coreColor])
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
        // A glowing sign reads THROUGH the haze; fogging it would erase it at
        // exactly the distance it is meant to be seen from.
        fog: false,
      }),
    [map],
  )
  useLayoutEffect(() => () => mat.dispose(), [mat])

  const lightRef = useRef<THREE.PointLight>(null)
  useFrame((state) => {
    if (!lightRef.current) return
    // A tired ballast: mostly steady, with a slow shallow waver.
    const t = state.clock.elapsedTime
    lightRef.current.intensity = 26 * (0.93 + Math.sin(t * 2.1) * 0.05 + Math.sin(t * 0.7) * 0.02)
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.plane()} material={mat} scale={[width, height, 1]} renderOrder={11} />
      {light ? (
        <pointLight ref={lightRef} color={color} intensity={26} distance={34} decay={2} position={[0, -1, 2]} />
      ) : null}
    </group>
  )
})

/**
 * A single low strip-mall block: dark brick, a run of storefront glass under a
 * flat canopy, and a sign over the middle unit.
 */
export const Stripmall = memo(function Stripmall({
  position,
  rotation = 0,
  width = 44,
  height = 6.5,
  depth = 14,
  wall = '#2a2730',
  glass = '#c8b98a',
  signText = '',
  signColor = '#ffd9a0',
  closed = false,
}: {
  position: [number, number, number]
  rotation?: number
  width?: number
  height?: number
  depth?: number
  wall?: string
  glass?: string
  signText?: string
  signColor?: string
  /** Darkens the shopfront and adds a visibly secured central entrance. */
  closed?: boolean
}) {
  const mats = useMemo(
    () => ({
      wall: storybook({ color: wall, roughness: 0.96, rim: 0.18, gradient: 0.2 }),
      band: storybook({ color: '#1d1b24', roughness: 0.9, rim: 0.22 }),
      glass: closed
        ? storybook({
            color: '#080d16',
            roughness: 0.28,
            metalness: 0.16,
            rim: 0.38,
            rimColor: '#64748b',
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          })
        : glow(glass, 0.62),
      frame: storybook({ color: '#15141a', roughness: 0.85, rim: 0.3 }),
      vestibule: storybook({
        color: '#05080e',
        roughness: 0.22,
        metalness: 0.22,
        rim: 0.34,
        rimColor: '#7a8596',
      }),
      hardware: storybook({ color: '#5c626a', roughness: 0.38, metalness: 0.62, rim: 0.5 }),
      lock: glow('#9f2934', 0.72),
    }),
    [wall, glass, closed],
  )

  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: width / 2, hd: depth / 2, rot: rotation }],
    [position[0], position[2], width, depth, rotation],
  )

  // A run of lit shopfronts along the front face.
  const bays = Math.max(3, Math.round(width / 5.5))

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* block */}
      <mesh
        geometry={geo.box()}
        material={mats.wall}
        position={[0, height / 2, 0]}
        scale={[width, height, depth]}
        castShadow
        receiveShadow
      />
      {/* parapet */}
      <mesh
        geometry={geo.box()}
        material={mats.band}
        position={[0, height + 0.35, 0]}
        scale={[width + 0.5, 0.7, depth + 0.5]}
        castShadow
      />
      {/* canopy over the walkway */}
      <mesh
        geometry={geo.box()}
        material={mats.band}
        position={[0, 3.5, depth / 2 + 1.3]}
        scale={[width, 0.28, 2.6]}
        castShadow
      />
      {/* shopfronts */}
      {Array.from({ length: bays }, (_, i) => {
        const x = (i - (bays - 1) / 2) * (width / bays)
        return (
          <group key={i} position={[x, 0, depth / 2 + 0.06]}>
            <mesh geometry={geo.box()} material={mats.glass} position={[0, 1.6, 0]} scale={[width / bays - 0.7, 2.9, 0.08]} />
            <mesh geometry={geo.box()} material={mats.frame} position={[0, 1.6, 0.07]} scale={[0.16, 2.9, 0.1]} />
            <mesh geometry={geo.box()} material={mats.frame} position={[0, 3.1, 0.07]} scale={[width / bays - 0.7, 0.18, 0.12]} />
            {closed ? (
              <mesh
                geometry={geo.box()}
                material={mats.frame}
                position={[0, 1.54, 0.08]}
                scale={[width / bays - 0.82, 0.055, 0.11]}
              />
            ) : null}
          </group>
        )
      })}
      {closed ? (
        <group position={[0, 0, depth / 2 + 0.18]}>
          {/* Recessed double doors, crossbar, and small night lock. */}
          {[-0.62, 0.62].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh
                geometry={geo.box()}
                material={mats.vestibule}
                position={[0, 1.48, 0]}
                scale={[1.12, 2.72, 0.1]}
              />
              <mesh
                geometry={geo.box()}
                material={mats.frame}
                position={[0, 2.87, 0.04]}
                scale={[1.18, 0.12, 0.12]}
              />
              <mesh
                geometry={geo.box()}
                material={mats.hardware}
                position={[x < 0 ? 0.4 : -0.4, 1.42, 0.09]}
                scale={[0.045, 0.52, 0.05]}
              />
            </group>
          ))}
          <mesh geometry={geo.box()} material={mats.frame} position={[0, 1.5, 0.05]} scale={[0.14, 2.9, 0.14]} />
          <mesh geometry={geo.box()} material={mats.hardware} position={[0, 1.32, 0.11]} scale={[1.7, 0.07, 0.06]} />
          <mesh geometry={geo.softBox(0.03)} material={mats.lock} position={[0, 1.18, 0.16]} scale={[0.18, 0.23, 0.07]} />
        </group>
      ) : null}
      {signText ? (
        <GlowSign
          position={[0, height * 0.78, depth / 2 + 0.35]}
          text={signText}
          color={signColor}
          width={Math.min(width * 0.3, 13)}
          height={Math.min(width * 0.3, 13) / 4}
        />
      ) : null}
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Small furniture and scenery
 * ──────────────────────────────────────────────────────────────────────────── */

export const Bench = memo(function Bench({
  position,
  rotation = 0,
  color = '#8a6547',
}: {
  position: [number, number, number]
  rotation?: number
  color?: string
}) {
  const wood = useMemo(() => storybook({ color, roughness: 0.92, rim: 0.28 }), [color])
  const iron = useMemo(() => storybook({ color: '#40382f', roughness: 0.7, metalness: 0.25 }), [])
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 0.9, hd: 0.35, rot: rotation }],
    [position[0], position[2], rotation],
  )
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.softBox(0.05)} material={wood} position={[0, 0.45, 0]} scale={[1.8, 0.1, 0.55]} castShadow receiveShadow />
      <mesh geometry={geo.softBox(0.05)} material={wood} position={[0, 0.78, -0.24]} rotation={[0.22, 0, 0]} scale={[1.8, 0.1, 0.42]} castShadow />
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} geometry={geo.box()} material={iron} position={[x, 0.22, 0]} scale={[0.09, 0.45, 0.5]} castShadow />
      ))}
    </group>
  )
})

/**
 * The same two imperfect mugs appear twice: once quietly beside the river and
 * once on the final dashboard. They share geometry, materials, and proportions
 * so the callback reads without a caption.
 */
export const MugPair = memo(function MugPair({
  position,
  rotation = 0,
  scale = 1,
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
}) {
  const mats = useMemo(
    () => ({
      peach: storybook({ color: '#b96f5d', roughness: 0.9, rim: 0.34, gradient: 0.22 }),
      blue: storybook({ color: '#526777', roughness: 0.9, rim: 0.34, gradient: 0.24 }),
      coffee: storybook({ color: '#251713', roughness: 0.72, rim: 0.08 }),
    }),
    [],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {([
        [-0.17, -0.08, mats.peach],
        [0.17, 0.1, mats.blue],
      ] as [number, number, THREE.Material][]).map(([x, turn, material], i) => (
        <group key={x} position={[x, 0, i * -0.025]} rotation={[0, turn, 0]}>
          <mesh
            geometry={geo.cylinder(14)}
            material={material}
            position={[0, 0.14, 0]}
            scale={[0.15, 0.28, 0.15]}
            castShadow
          />
          <mesh
            geometry={geo.torus(12)}
            material={material}
            position={[i === 0 ? -0.15 : 0.15, 0.16, 0]}
            scale={[0.13, 0.13, 0.55]}
            castShadow
          />
          <mesh
            geometry={geo.cylinder(14)}
            material={mats.coffee}
            position={[0, 0.284, 0]}
            scale={[0.125, 0.012, 0.125]}
          />
        </group>
      ))}
    </group>
  )
})

export const Fence = memo(function Fence({
  points,
  color = '#8f7355',
  height = 1.0,
  spacing = 1.3,
  collide = true,
}: {
  points: [number, number][]
  color?: string
  height?: number
  spacing?: number
  collide?: boolean
}) {
  const mat = useMemo(() => storybook({ color, roughness: 0.95, rim: 0.26 }), [color])
  const postRef = useRef<THREE.InstancedMesh>(null)
  const railRef = useRef<THREE.InstancedMesh>(null)

  const { posts, rails } = useMemo(() => {
    const posts: { x: number; z: number }[] = []
    const rails: { x: number; z: number; len: number; rot: number }[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i]
      const [bx, bz] = points[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const n = Math.max(1, Math.round(len / spacing))
      const rot = Math.atan2(bx - ax, bz - az)
      for (let j = 0; j < n; j++) {
        const t = j / n
        posts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t })
      }
      rails.push({ x: (ax + bx) / 2, z: (az + bz) / 2, len, rot })
    }
    const last = points[points.length - 1]
    posts.push({ x: last[0], z: last[1] })
    return { posts, rails }
  }, [points, spacing])

  useColliders(
    () =>
      collide
        ? rails.map((r) => ({
            kind: 'box' as const,
            x: r.x,
            z: r.z,
            hw: 0.1,
            hd: r.len / 2,
            rot: r.rot,
          }))
        : [],
    [rails, collide],
  )

  useLayoutEffect(() => {
    const p = postRef.current
    const r = railRef.current
    if (!p || !r) return
    const d = new THREE.Object3D()
    posts.forEach((pt, i) => {
      d.position.set(pt.x, height / 2, pt.z)
      d.rotation.set(0, 0, 0)
      d.scale.set(0.1, height, 0.1)
      d.updateMatrix()
      p.setMatrixAt(i, d.matrix)
    })
    p.instanceMatrix.needsUpdate = true
    rails.forEach((rl, i) => {
      d.position.set(rl.x, height * 0.66, rl.z)
      d.rotation.set(0, rl.rot, 0)
      d.scale.set(0.06, 0.09, rl.len)
      d.updateMatrix()
      r.setMatrixAt(i, d.matrix)
    })
    r.instanceMatrix.needsUpdate = true
  }, [posts, rails, height])

  if (!posts.length) return null
  return (
    <group>
      <instancedMesh ref={postRef} args={[geo.box(), mat, posts.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={railRef} args={[geo.box(), mat, rails.length]} castShadow frustumCulled={false} />
    </group>
  )
})

export const Bridge = memo(function Bridge({
  position,
  rotation = 0,
  length = 7,
  width = 2.6,
  color = '#8a6a4a',
  arch = 0.5,
}: {
  position: [number, number, number]
  rotation?: number
  length?: number
  width?: number
  color?: string
  arch?: number
}) {
  const wood = useMemo(() => storybook({ color, roughness: 0.94, rim: 0.26 }), [color])
  const planks = Math.round(length / 0.5)
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    for (let i = 0; i < planks; i++) {
      const t = i / (planks - 1)
      const z = (t - 0.5) * length
      const y = Math.sin(t * Math.PI) * arch
      d.position.set(0, y, z)
      d.rotation.set(Math.cos(t * Math.PI) * arch * 0.28, 0, 0)
      d.scale.set(width, 0.12, 0.42)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [planks, length, width, arch])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <instancedMesh ref={ref} args={[geo.softBox(0.04), wood, planks]} castShadow receiveShadow frustumCulled={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          {Array.from({ length: 5 }, (_, i) => {
            const t = i / 4
            const z = (t - 0.5) * length * 0.9
            const y = Math.sin(t * Math.PI) * arch
            return (
              <mesh
                key={i}
                geometry={geo.box()}
                material={wood}
                position={[(s * width) / 2, y + 0.45, z]}
                scale={[0.09, 0.85, 0.09]}
                castShadow
              />
            )
          })}
          <mesh
            geometry={geo.box()}
            material={wood}
            position={[(s * width) / 2, arch * 0.6 + 0.86, 0]}
            rotation={[0, 0, 0]}
            scale={[0.08, 0.08, length * 0.92]}
            castShadow
          />
        </group>
      ))}
    </group>
  )
})

export const Stall = memo(function Stall({
  position,
  rotation = 0,
  awningA = '#d9705e',
  awningB = '#f2e2c8',
  wood = '#8a6547',
  /** What sits on the counter. */
  goods = 'bread' as 'bread' | 'flowers' | 'books',
}: {
  position: [number, number, number]
  rotation?: number
  awningA?: string
  awningB?: string
  wood?: string
  goods?: 'bread' | 'flowers' | 'books'
}) {
  const mats = useMemo(
    () => ({
      wood: storybook({ color: wood, roughness: 0.93, rim: 0.26 }),
      a: storybook({ color: awningA, roughness: 0.95, rim: 0.34 }),
      b: storybook({ color: awningB, roughness: 0.95, rim: 0.34 }),
      bread: storybook({ color: '#d9a35f', roughness: 0.9, rim: 0.3 }),
      leaf: storybook({ color: '#5d8544', roughness: 0.95 }),
    }),
    [wood, awningA, awningB],
  )

  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 1.5, hd: 0.6, rot: rotation }],
    [position[0], position[2], rotation],
  )

  const flowerColors = ['#f6a8b8', '#ffd98a', '#e9e4f2', '#ff9e7d', '#c9a8e8']

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* counter */}
      <mesh geometry={geo.softBox(0.05)} material={mats.wood} position={[0, 0.5, 0]} scale={[3, 0.14, 1.1]} castShadow receiveShadow />
      <mesh geometry={geo.box()} material={mats.wood} position={[0, 0.22, 0]} scale={[2.8, 0.44, 0.9]} castShadow />

      {/* posts + awning stripes */}
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} geometry={geo.cylinder(6)} material={mats.wood} position={[x, 1.1, -0.3]} scale={[0.08, 2.2, 0.08]} castShadow />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          geometry={geo.box()}
          material={i % 2 === 0 ? mats.a : mats.b}
          position={[-1.29 + i * 0.43, 2.05, 0.28]}
          rotation={[0.42, 0, 0]}
          scale={[0.43, 0.06, 1.5]}
          castShadow
        />
      ))}

      {/* goods */}
      {goods === 'bread' &&
        Array.from({ length: 6 }, (_, i) => (
          <mesh
            key={i}
            geometry={geo.capsule(7)}
            material={mats.bread}
            position={[-1.1 + i * 0.44, 0.63, (i % 2) * 0.24 - 0.12]}
            rotation={[0, i * 0.6, Math.PI / 2]}
            scale={[0.1, 0.13, 0.1]}
            castShadow
          />
        ))}
      {goods === 'flowers' &&
        flowerColors.map((c, i) => (
          <group key={c} position={[-1.1 + i * 0.55, 0.57, 0]}>
            <mesh geometry={geo.cylinder(7)} material={mats.wood} scale={[0.19, 0.3, 0.19]} position={[0, 0.15, 0]} castShadow />
            {Array.from({ length: 4 }, (_, j) => (
              <group key={j}>
                <mesh geometry={geo.cylinder(4)} material={mats.leaf} position={[(j - 1.5) * 0.06, 0.42, 0]} scale={[0.014, 0.32, 0.014]} />
                <mesh
                  geometry={geo.sphere(7)}
                  material={storybook({ color: c, roughness: 0.9, rim: 0.45 })}
                  position={[(j - 1.5) * 0.06, 0.58, 0]}
                  scale={[0.1, 0.07, 0.1]}
                />
              </group>
            ))}
          </group>
        ))}
      {goods === 'books' &&
        Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            geometry={geo.box()}
            material={storybook({
              color: ['#8a5a4a', '#4a6a7a', '#6a5a8a', '#7a7a4a'][i % 4],
              roughness: 0.92,
              rim: 0.28,
            })}
            position={[-1.2 + i * 0.32, 0.64, i % 2 === 0 ? -0.1 : 0.15]}
            rotation={[0, i * 0.3, 0]}
            scale={[0.24, 0.14, 0.34]}
            castShadow
          />
        ))}
    </group>
  )
})


/* ────────────────────────────────────────────────────────────────────────────
 * Small clutter. Crates, barrels, planters, woodpiles, guardrails — the things
 * that make a place look lived in rather than laid out.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A stack of crates and a barrel or two, leaning against something. */
export const Clutter = memo(function Clutter({
  position,
  rotation = 0,
  seed = 1,
  wood = '#7d5f42',
  wood2 = '#8f6f4e',
}: {
  position: [number, number, number]
  rotation?: number
  seed?: number
  wood?: string
  wood2?: string
}) {
  const mats = useMemo(
    () => ({
      a: storybook({ color: wood, roughness: 0.96, rim: 0.26, gradient: 0.28 }),
      b: storybook({ color: wood2, roughness: 0.96, rim: 0.3, gradient: 0.28 }),
      hoop: storybook({ color: '#4a4038', roughness: 0.7, metalness: 0.3, rim: 0.4 }),
    }),
    [wood, wood2],
  )
  const rand = useMemo(() => mulberry32(seed * 977), [seed])
  const pieces = useMemo(() => {
    const out: { kind: 'crate' | 'barrel'; x: number; y: number; z: number; s: number; r: number }[] = []
    const n = 2 + Math.floor(rand() * 3)
    let stackY = 0
    for (let i = 0; i < n; i++) {
      const kind = rand() > 0.55 ? 'barrel' : 'crate'
      const sc = 0.45 + rand() * 0.3
      if (kind === 'crate' && rand() > 0.5 && i > 0) {
        // stack it on the last one
        out.push({ kind, x: (rand() - 0.5) * 0.14, y: stackY + sc / 2, z: (rand() - 0.5) * 0.14, s: sc, r: rand() * 0.7 })
        stackY += sc
      } else {
        out.push({ kind, x: (rand() - 0.5) * 1.5, y: sc / 2, z: (rand() - 0.5) * 1.2, s: sc, r: rand() * Math.PI })
        stackY = sc
      }
    }
    return out
  }, [rand])

  useColliders(
    () => [{ kind: 'circle', x: position[0], z: position[2], r: 0.85 }],
    [position[0], position[2]],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {pieces.map((p, i) =>
        p.kind === 'crate' ? (
          <mesh
            key={i}
            geometry={geo.softBox(0.04)}
            material={i % 2 ? mats.a : mats.b}
            position={[p.x, p.y, p.z]}
            rotation={[0, p.r, 0]}
            scale={[p.s, p.s, p.s]}
            castShadow
            receiveShadow
          />
        ) : (
          <group key={i} position={[p.x, p.y, p.z]} rotation={[0, p.r, 0]}>
            <mesh geometry={geo.cylinder(12)} material={mats.b} scale={[p.s * 0.82, p.s, p.s * 0.82]} castShadow receiveShadow />
            <mesh geometry={geo.cylinder(12)} material={mats.hoop} position={[0, p.s * 0.26, 0]} scale={[p.s * 0.86, p.s * 0.08, p.s * 0.86]} />
            <mesh geometry={geo.cylinder(12)} material={mats.hoop} position={[0, -p.s * 0.26, 0]} scale={[p.s * 0.86, p.s * 0.08, p.s * 0.86]} />
          </group>
        ),
      )}
    </group>
  )
})

/** A planter box with something growing out of it. */
export const Planter = memo(function Planter({
  position,
  rotation = 0,
  wood = '#6b5039',
  leaf = '#4a6b3c',
  bloom = '#e8a0a8',
}: {
  position: [number, number, number]
  rotation?: number
  wood?: string
  leaf?: string
  bloom?: string
}) {
  const mats = useMemo(
    () => ({
      box: storybook({ color: wood, roughness: 0.95, rim: 0.28 }),
      soil: storybook({ color: '#3a2c22', roughness: 1, rim: 0.1 }),
      leaf: storybook({ color: leaf, roughness: 0.97, rim: 0.32 }),
      bloom: storybook({ color: bloom, roughness: 0.9, rim: 0.44 }),
    }),
    [wood, leaf, bloom],
  )
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 0.62, hd: 0.34, rot: rotation }],
    [position[0], position[2], rotation],
  )
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.softBox(0.04)} material={mats.box} position={[0, 0.24, 0]} scale={[1.2, 0.48, 0.62]} castShadow receiveShadow />
      <mesh geometry={geo.box()} material={mats.soil} position={[0, 0.47, 0]} scale={[1.06, 0.06, 0.5]} />
      {[-0.36, 0, 0.36].map((x, i) => (
        <group key={x} position={[x, 0.5, (i % 2 ? 0.08 : -0.08)]}>
          <mesh geometry={geo.blob()} material={mats.leaf} position={[0, 0.16, 0]} scale={[0.42, 0.3, 0.36]} castShadow />
          <mesh geometry={geo.sphere(8)} material={mats.bloom} position={[0.1, 0.3, 0.05]} scale={[0.11, 0.08, 0.11]} />
          <mesh geometry={geo.sphere(8)} material={mats.bloom} position={[-0.08, 0.27, -0.04]} scale={[0.09, 0.07, 0.09]} />
        </group>
      ))}
    </group>
  )
})

/** A stack of split logs against a wall. */
export const Woodpile = memo(function Woodpile({
  position,
  rotation = 0,
  color = '#6b5039',
  rows = 3,
  perRow = 5,
}: {
  position: [number, number, number]
  rotation?: number
  color?: string
  rows?: number
  perRow?: number
}) {
  const mat = useMemo(() => storybook({ color, roughness: 0.98, rim: 0.26, gradient: 0.3 }), [color])
  const end = useMemo(() => storybook({ color: '#c9a87c', roughness: 0.95, rim: 0.3 }), [])
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: (perRow * 0.24) / 2 + 0.1, hd: 0.5, rot: rotation }],
    [position[0], position[2], rotation, perRow],
  )
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: perRow - (r % 2) }, (_, c) => {
          const x = (c - (perRow - 1 - (r % 2)) / 2) * 0.24 + (r % 2 ? 0.12 : 0)
          const y = 0.12 + r * 0.22
          return (
            <group key={`${r}-${c}`} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh geometry={geo.cylinder(8)} material={mat} scale={[0.21, 0.9, 0.21]} castShadow receiveShadow />
              <mesh geometry={geo.cylinder(8)} material={end} position={[0, 0.451, 0]} scale={[0.19, 0.02, 0.19]} />
            </group>
          )
        }),
      )}
    </group>
  )
})

/** Roadside guardrail — a run of posts with a rail across them. */
export const Guardrail = memo(function Guardrail({
  points,
  color = '#8a8d92',
  height = 0.72,
  spacing = 3.2,
}: {
  points: [number, number][]
  color?: string
  height?: number
  spacing?: number
}) {
  const mat = useMemo(
    () => storybook({ color, roughness: 0.6, metalness: 0.35, rim: 0.45 }),
    [color],
  )
  const postRef = useRef<THREE.InstancedMesh>(null)
  const railRef = useRef<THREE.InstancedMesh>(null)

  const { posts, rails } = useMemo(() => {
    const posts: { x: number; z: number; y: number }[] = []
    const rails: { x: number; z: number; y: number; len: number; rot: number }[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i]
      const [bx, bz] = points[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const n = Math.max(1, Math.round(len / spacing))
      const rot = Math.atan2(bx - ax, bz - az)
      for (let j = 0; j < n; j++) {
        const t = j / n
        const x = ax + (bx - ax) * t
        const z = az + (bz - az) * t
        posts.push({ x, z, y: runtime.sampleHeight(x, z) })
      }
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      rails.push({ x: mx, z: mz, y: runtime.sampleHeight(mx, mz), len, rot })
    }
    const last = points[points.length - 1]
    posts.push({ x: last[0], z: last[1], y: runtime.sampleHeight(last[0], last[1]) })
    return { posts, rails }
  }, [points, spacing])

  useLayoutEffect(() => {
    const p = postRef.current
    const r = railRef.current
    if (!p || !r) return
    const d = new THREE.Object3D()
    posts.forEach((pt, i) => {
      d.position.set(pt.x, pt.y + height / 2, pt.z)
      d.rotation.set(0, 0, 0)
      d.scale.set(0.1, height, 0.1)
      d.updateMatrix()
      p.setMatrixAt(i, d.matrix)
    })
    p.instanceMatrix.needsUpdate = true
    rails.forEach((rl, i) => {
      d.position.set(rl.x, rl.y + height * 0.88, rl.z)
      d.rotation.set(0, rl.rot, 0)
      d.scale.set(0.07, 0.3, rl.len)
      d.updateMatrix()
      r.setMatrixAt(i, d.matrix)
    })
    r.instanceMatrix.needsUpdate = true
  }, [posts, rails, height])

  if (!posts.length) return null
  return (
    <group>
      <instancedMesh ref={postRef} args={[geo.box(), mat, posts.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={railRef} args={[geo.softBox(0.05), mat, rails.length]} castShadow frustumCulled={false} />
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Motifs — the cheetah and the peach, appearing as objects
 * ──────────────────────────────────────────────────────────────────────────── */

export const PeachObject = memo(function PeachObject({
  position,
  scale = 1,
  color = '#f6a488',
  emissive = false,
  float = false,
}: {
  position: [number, number, number]
  scale?: number
  color?: string
  emissive?: boolean
  float?: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const mats = useMemo(
    () => ({
      flesh: emissive
        ? glow(color, 0.95)
        : storybook({
            color,
            roughness: 0.85,
            rim: 0.5,
            rimColor: '#ffe0c8',
            gradient: 0.28,
            gradientColor: '#c9604a',
          }),
      leaf: storybook({ color: '#5d8544', roughness: 0.9, rim: 0.4 }),
      stem: storybook({ color: '#6b4a35', roughness: 0.95 }),
    }),
    [color, emissive],
  )

  useFrame((state) => {
    if (!float || !ref.current) return
    const t = state.clock.elapsedTime
    ref.current.position.y = position[1] + Math.sin(t * 0.9) * 0.09
    ref.current.rotation.y = t * 0.35
  })

  return (
    <group ref={ref} position={position} scale={scale}>
      {/* two lobes with a cleft, which is what makes it read as a peach */}
      <mesh geometry={geo.sphere(14)} material={mats.flesh} position={[-0.045, 0, 0]} scale={[0.3, 0.3, 0.3]} castShadow />
      <mesh geometry={geo.sphere(14)} material={mats.flesh} position={[0.045, 0, 0]} scale={[0.3, 0.3, 0.3]} castShadow />
      <mesh geometry={geo.cylinder(5)} material={mats.stem} position={[0, 0.17, 0]} scale={[0.018, 0.09, 0.018]} />
      <mesh geometry={geo.sphere(8)} material={mats.leaf} position={[0.09, 0.19, 0.02]} rotation={[0, 0, -0.5]} scale={[0.12, 0.025, 0.06]} />
    </group>
  )
})

export const CheetahFigure = memo(function CheetahFigure({
  position,
  rotation = 0,
  scale = 1,
  color = '#e8a13c',
  spots = '#4a3520',
  emissive = false,
  /** Trots gently in place, for the spirit version. */
  animate = false,
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  color?: string
  spots?: string
  emissive?: boolean
  animate?: boolean
}) {
  const legs = useRef<THREE.Group[]>([])
  const body = useRef<THREE.Group>(null)
  const mats = useMemo(
    () => ({
      coat: emissive
        ? glow(color, 0.9)
        : storybook({ color, roughness: 0.9, rim: 0.45, rimColor: '#ffe6bc', gradient: 0.24 }),
      spot: emissive ? glow(color, 0.6) : storybook({ color: spots, roughness: 0.9, rim: 0.2 }),
    }),
    [color, spots, emissive],
  )

  useFrame((state) => {
    if (!animate) return
    const t = state.clock.elapsedTime
    legs.current.forEach((l, i) => {
      if (l) l.rotation.x = Math.sin(t * 6 + i * Math.PI * 0.5) * 0.5
    })
    if (body.current) body.current.position.y = Math.abs(Math.sin(t * 6)) * 0.035
  })

  const spotPositions: [number, number, number][] = [
    [0.1, 0.12, 0.1], [-0.14, 0.1, -0.06], [0.18, 0.06, -0.12],
    [-0.05, 0.14, 0.18], [0.02, 0.08, -0.2],
  ]

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <group ref={body}>
        {/* torso */}
        <mesh geometry={geo.capsule(9)} material={mats.coat} position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.17, 0.32, 0.17]} castShadow />
        {/* haunch + shoulder */}
        <mesh geometry={geo.sphere(10)} material={mats.coat} position={[0, 0.4, -0.24]} scale={[0.2, 0.2, 0.2]} castShadow />
        <mesh geometry={geo.sphere(10)} material={mats.coat} position={[0, 0.39, 0.22]} scale={[0.18, 0.18, 0.18]} />
        {/* neck + head */}
        <mesh geometry={geo.capsule(8)} material={mats.coat} position={[0, 0.47, 0.36]} rotation={[1.15, 0, 0]} scale={[0.09, 0.12, 0.09]} />
        <mesh geometry={geo.sphere(12)} material={mats.coat} position={[0, 0.54, 0.47]} scale={[0.13, 0.12, 0.15]} castShadow />
        {/* muzzle */}
        <mesh geometry={geo.sphere(8)} material={mats.coat} position={[0, 0.5, 0.57]} scale={[0.07, 0.06, 0.08]} />
        {/* ears */}
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} geometry={geo.sphere(6)} material={mats.coat} position={[x, 0.62, 0.44]} scale={[0.045, 0.05, 0.02]} />
        ))}
        {/* tail */}
        <mesh geometry={geo.capsule(6)} material={mats.coat} position={[0, 0.44, -0.44]} rotation={[-0.9, 0, 0]} scale={[0.035, 0.16, 0.035]} />
        {/* spots */}
        {!emissive &&
          spotPositions.map((p, i) => (
            <mesh key={i} geometry={geo.sphere(5)} material={mats.spot} position={[p[0], 0.36 + p[1], p[2]]} scale={0.035} />
          ))}
      </group>
      {/* legs */}
      {([[0.1, 0.2], [-0.1, 0.2], [0.1, -0.2], [-0.1, -0.2]] as [number, number][]).map((p, i) => (
        <group
          key={i}
          position={[p[0], 0.3, p[1]]}
          ref={(el) => {
            if (el) legs.current[i] = el
          }}
        >
          <mesh geometry={geo.capsule(5)} material={mats.coat} position={[0, -0.14, 0]} scale={[0.04, 0.11, 0.04]} castShadow />
        </group>
      ))}
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Bedroom furniture
 * ──────────────────────────────────────────────────────────────────────────── */

export const Bed = memo(function Bed({
  position,
  rotation = 0,
  frame = '#9c7550',
  sheet = '#f7ece0',
  blanket = '#f0a084',
}: {
  position: [number, number, number]
  rotation?: number
  frame?: string
  sheet?: string
  blanket?: string
}) {
  const mats = useMemo(
    () => ({
      frame: storybook({ color: frame, roughness: 0.92, rim: 0.28 }),
      sheet: storybook({ color: sheet, roughness: 1, rim: 0.32 }),
      blanket: storybook({ color: blanket, roughness: 1, rim: 0.34, gradient: 0.28 }),
      pillow: storybook({ color: '#fffaf2', roughness: 1, rim: 0.4 }),
    }),
    [frame, sheet, blanket],
  )
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 0.75, hd: 1.1, rot: rotation }],
    [position[0], position[2], rotation],
  )
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.softBox(0.06)} material={mats.frame} position={[0, 0.22, 0]} scale={[1.5, 0.32, 2.2]} castShadow receiveShadow />
      <mesh geometry={geo.softBox(0.08)} material={mats.sheet} position={[0, 0.44, 0]} scale={[1.44, 0.18, 2.1]} castShadow />
      <mesh geometry={geo.softBox(0.1)} material={mats.blanket} position={[0, 0.5, -0.35]} scale={[1.46, 0.16, 1.3]} castShadow />
      <mesh geometry={geo.softBox(0.12)} material={mats.pillow} position={[0, 0.58, 0.82]} scale={[0.86, 0.22, 0.42]} castShadow />
      <mesh geometry={geo.softBox(0.05)} material={mats.frame} position={[0, 0.72, 1.14]} scale={[1.5, 0.9, 0.12]} castShadow />
    </group>
  )
})

export const Desk = memo(function Desk({
  position,
  rotation = 0,
  color = '#9c7550',
}: {
  position: [number, number, number]
  rotation?: number
  color?: string
}) {
  const mat = useMemo(() => storybook({ color, roughness: 0.92, rim: 0.28 }), [color])
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 0.7, hd: 0.35, rot: rotation }],
    [position[0], position[2], rotation],
  )
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.softBox(0.04)} material={mat} position={[0, 0.76, 0]} scale={[1.4, 0.08, 0.66]} castShadow receiveShadow />
      {([[-0.62, -0.26], [0.62, -0.26], [-0.62, 0.26], [0.62, 0.26]] as [number, number][]).map((p, i) => (
        <mesh key={i} geometry={geo.box()} material={mat} position={[p[0], 0.38, p[1]]} scale={[0.08, 0.76, 0.08]} castShadow />
      ))}
    </group>
  )
})

/** A window with a curtain that moves in the draught. */
export const CurtainWindow = memo(function CurtainWindow({
  position,
  rotation = 0,
  width = 1.5,
  height = 1.7,
  curtain = '#f7ece0',
  glowColor = '#fff0d0',
}: {
  position: [number, number, number]
  rotation?: number
  width?: number
  height?: number
  curtain?: string
  glowColor?: string
}) {
  const left = useRef<THREE.Mesh>(null)
  const right = useRef<THREE.Mesh>(null)
  const mats = useMemo(
    () => ({
      frame: storybook({ color: '#e8dcc8', roughness: 0.9, rim: 0.3 }),
      curtain: storybook({ color: curtain, roughness: 1, rim: 0.42, transparent: true, opacity: 0.94 }),
      light: glow(glowColor, 0.9),
    }),
    [curtain, glowColor],
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const w = windUniforms.uWind.value
    // The curtain breathes: a slow billow with a faster ripple on top.
    const s = (Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.4) * 0.1 * w
    if (left.current) {
      left.current.rotation.z = -0.05 + s
      left.current.position.z = 0.06 + Math.abs(s) * 0.5
    }
    if (right.current) {
      right.current.rotation.z = 0.05 - s * 0.8
      right.current.position.z = 0.06 + Math.abs(s) * 0.4
    }
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* the bright outside */}
      <mesh geometry={geo.plane()} material={mats.light} position={[0, 0, -0.04]} scale={[width, height, 1]} />
      {/* frame */}
      <mesh geometry={geo.box()} material={mats.frame} position={[0, height / 2 + 0.05, 0]} scale={[width + 0.2, 0.1, 0.14]} />
      <mesh geometry={geo.box()} material={mats.frame} position={[0, -height / 2 - 0.05, 0]} scale={[width + 0.2, 0.1, 0.16]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.box()} material={mats.frame} position={[(s * (width + 0.1)) / 2, 0, 0]} scale={[0.1, height + 0.2, 0.14]} />
      ))}
      <mesh geometry={geo.box()} material={mats.frame} position={[0, 0, 0]} scale={[0.06, height, 0.1]} />
      {/* curtains, hinged at the top corners */}
      <mesh
        ref={left}
        geometry={geo.plane()}
        material={mats.curtain}
        position={[-width * 0.3, -height * 0.06, 0.06]}
        scale={[width * 0.52, height * 1.05, 1]}
      />
      <mesh
        ref={right}
        geometry={geo.plane()}
        material={mats.curtain}
        position={[width * 0.3, -height * 0.06, 0.06]}
        scale={[width * 0.52, height * 1.05, 1]}
      />
    </group>
  )
})

export const PictureFrame = memo(function PictureFrame({
  position,
  rotation = 0,
  scale = 1,
  image = null,
  tint = '#c9a88a',
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  image?: string | null
  tint?: string
}) {
  const mats = useMemo(
    () => ({
      wood: storybook({ color: '#8a6547', roughness: 0.9, rim: 0.3 }),
      plate: storybook({ color: tint, roughness: 0.95, rim: 0.22 }),
    }),
    [tint],
  )
  const texture = useMemo(() => {
    if (!image) return null
    const loader = new THREE.TextureLoader()
    // Failure is silent: the plate simply stays blank.
    return loader.load(image, undefined, undefined, () => {})
  }, [image])

  const photoMat = useMemo(() => {
    if (!texture) return null
    return new THREE.MeshBasicMaterial({ map: texture, toneMapped: true })
  }, [texture])

  useLayoutEffect(() => () => photoMat?.dispose(), [photoMat])

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={geo.box()} material={mats.wood} scale={[0.52, 0.42, 0.04]} castShadow />
      <mesh
        geometry={geo.plane()}
        material={photoMat ?? mats.plate}
        position={[0, 0, 0.025]}
        scale={[0.42, 0.32, 1]}
      />
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Mountain & road furniture
 * ──────────────────────────────────────────────────────────────────────────── */

export const StoneMarker = memo(function StoneMarker({
  position,
  scale = 1,
  color = '#a8a294',
}: {
  position: [number, number, number]
  scale?: number
  color?: string
}) {
  const mat = useMemo(
    () => storybook({ color, roughness: 0.98, rim: 0.26, flatShading: true }),
    [color],
  )
  useColliders(
    () => [{ kind: 'circle', x: position[0], z: position[2], r: 0.4 * scale }],
    [position[0], position[2], scale],
  )
  return (
    <group position={position} scale={scale}>
      {[0.62, 0.46, 0.34, 0.24].map((s, i) => (
        <mesh
          key={i}
          geometry={geo.blob()}
          material={mat}
          position={[Math.sin(i * 2.1) * 0.05, 0.16 + i * 0.28, Math.cos(i * 1.7) * 0.05]}
          rotation={[0, i * 0.9, 0]}
          scale={[s, s * 0.62, s * 0.85]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
})

export const WindChimes = memo(function WindChimes({
  position,
  color = '#c8b48a',
}: {
  position: [number, number, number]
  color?: string
}) {
  const group = useRef<THREE.Group>(null)
  const mats = useMemo(
    () => ({
      wood: storybook({ color: '#6b5039', roughness: 0.94 }),
      metal: storybook({ color, roughness: 0.4, metalness: 0.55, rim: 0.6 }),
    }),
    [color],
  )
  useFrame((state) => {
    if (!group.current) return
    const t = state.clock.elapsedTime
    const w = windUniforms.uWind.value
    group.current.rotation.z = Math.sin(t * 1.6) * 0.13 * w
    group.current.rotation.x = Math.cos(t * 1.1) * 0.09 * w
  })
  useColliders(() => [{ kind: 'circle', x: position[0], z: position[2], r: 0.2 }], [position[0], position[2]])
  return (
    <group position={position}>
      <mesh geometry={geo.cylinder(6)} material={mats.wood} position={[0, 1.3, 0]} scale={[0.07, 2.6, 0.07]} castShadow />
      <mesh geometry={geo.box()} material={mats.wood} position={[0, 2.6, 0.2]} scale={[0.06, 0.06, 0.44]} />
      <group ref={group} position={[0, 2.55, 0.4]}>
        {[-0.12, -0.04, 0.04, 0.12].map((x, i) => (
          <mesh
            key={x}
            geometry={geo.cylinder(6)}
            material={mats.metal}
            position={[x, -0.22 - i * 0.03, 0]}
            scale={[0.022, 0.4 - i * 0.05, 0.022]}
            castShadow
          />
        ))}
      </group>
    </group>
  )
})

export const Streetlight = memo(function Streetlight({
  position,
  color = '#ffb15e',
  height = 7,
  on = true,
  realLight = false,
  intensity = 34,
  flicker = true,
}: {
  position: [number, number, number]
  color?: string
  height?: number
  on?: boolean
  realLight?: boolean
  intensity?: number
  /** Defaults to the original sodium-lamp stutter. False keeps output stable. */
  flicker?: boolean
}) {
  const mats = useMemo(
    () => ({
      pole: storybook({ color: '#4a4d52', roughness: 0.7, metalness: 0.25, rim: 0.3 }),
      lamp: glow(color, on ? 1 : 0.12),
    }),
    [color, on],
  )
  const lampRef = useRef<THREE.PointLight>(null)
  const lampMesh = useRef<THREE.Mesh>(null)
  const flickerState = useRef({ next: 3 + Math.abs(position[0]) % 7, active: 0, level: 1 })

  useFrame((state, dt) => {
    if (!on) return
    const t = state.clock.elapsedTime
    const f = flickerState.current

    // Old sodium lamps buzz continuously and, every so often, stutter.
    if (flicker) {
      if (f.active > 0) {
        f.active -= dt
        // A stutter is a few fast dips, not a strobe.
        const k = Math.sin(t * 47 + position[0]) * Math.sin(t * 19.3)
        f.level = k > 0.1 ? 0.18 + Math.random() * 0.25 : 1
        if (f.active <= 0) f.level = 1
      } else {
        f.next -= dt
        if (f.next <= 0) {
          f.next = 6 + Math.random() * 16
          f.active = 0.18 + Math.random() * 0.5
        }
        f.level = 1
      }
    } else {
      f.active = 0
      f.level = 1
    }

    const buzz = flicker ? 0.94 + Math.sin(t * 7.3 + position[0]) * 0.06 : 1
    const level = f.level * buzz
    if (lampRef.current) lampRef.current.intensity = intensity * level
    if (lampMesh.current) {
      const m = lampMesh.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.35 + 0.65 * level
      m.transparent = true
    }
  })
  useColliders(() => [{ kind: 'circle', x: position[0], z: position[2], r: 0.22 }], [position[0], position[2]])
  return (
    <group position={position}>
      <mesh geometry={geo.cylinder(8)} material={mats.pole} position={[0, height / 2, 0]} scale={[0.16, height, 0.16]} castShadow />
      <mesh geometry={geo.cylinder(8)} material={mats.pole} position={[0.5, height - 0.1, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 1.1, 0.1]} castShadow />
      <mesh geometry={geo.softBox(0.1)} material={mats.pole} position={[1.0, height - 0.22, 0]} scale={[0.72, 0.2, 0.4]} castShadow />
      <mesh ref={lampMesh} geometry={geo.softBox(0.06)} material={mats.lamp.clone()} position={[1.0, height - 0.34, 0]} scale={[0.6, 0.1, 0.32]} />
      {on ? <Glint position={[1.0, height - 0.36, 0]} color={color} size={flicker ? 4.2 : 2.8} /> : null}
      {realLight && on ? (
        <pointLight ref={lampRef} color={color} intensity={intensity} distance={26} decay={2} position={[1.0, height - 0.4, 0]} />
      ) : null}
    </group>
  )
})

export const ShoppingCart = memo(function ShoppingCart({
  position,
  rotation = 0,
}: {
  position: [number, number, number]
  rotation?: number
}) {
  const group = useRef<THREE.Group>(null)
  const windSeed = Math.abs(position[0] * 0.71 + position[2] * 0.43 + rotation * 2.9)
  const windPhase = windSeed % (Math.PI * 2)
  const windRate = 0.68 + (windSeed % 0.27)
  const windAmplitude = 0.008 + (windSeed % 0.006)
  const mat = useMemo(() => storybook({ color: '#9aa0a6', roughness: 0.5, metalness: 0.4, rim: 0.5 }), [])
  useFrame((state) => {
    // Each loose cart answers the wind on its own slightly different rhythm.
    if (group.current) {
      group.current.rotation.z =
        Math.sin(state.clock.elapsedTime * windRate + windPhase) * windAmplitude
    }
  })
  useColliders(() => [{ kind: 'circle', x: position[0], z: position[2], r: 0.45 }], [position[0], position[2]])
  return (
    <group ref={group} position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.softBox(0.04)} material={mat} position={[0, 0.62, 0]} scale={[0.62, 0.5, 0.86]} castShadow />
      <mesh geometry={geo.box()} material={mat} position={[0, 0.92, -0.46]} scale={[0.62, 0.06, 0.06]} />
      {([[-0.26, 0.36], [0.26, 0.36], [-0.26, -0.36], [0.26, -0.36]] as [number, number][]).map((p, i) => (
        <mesh key={i} geometry={geo.cylinder(6)} material={mat} position={[p[0], 0.09, p[1]]} rotation={[0, 0, Math.PI / 2]} scale={[0.16, 0.06, 0.16]} />
      ))}
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * The car
 * ──────────────────────────────────────────────────────────────────────────── */

export const Car = memo(function Car({
  position,
  rotation = 0,
  interiorLightOn = false,
  passengerDoorOpen = 0,
  driverDoorOpen = 0,
  showDashboardPeach = true,
  showMirrorCharm = true,
  instrumentGlow = true,
  dashboardGlowColor = CAR.dashboardLight,
  showDashboardMugs = false,
}: {
  position: [number, number, number]
  rotation?: number
  interiorLightOn?: boolean
  /** 0..1 — how far the passenger door has swung open. */
  passengerDoorOpen?: number
  /** 0..1 — how far the driver door has swung open. Driver side is local -X. */
  driverDoorOpen?: number
  showDashboardPeach?: boolean
  showMirrorCharm?: boolean
  instrumentGlow?: boolean
  dashboardGlowColor?: string
  showDashboardMugs?: boolean
}) {
  const passengerDoorRef = useRef<THREE.Group>(null)
  const driverDoorRef = useRef<THREE.Group>(null)
  const domeRef = useRef<THREE.PointLight>(null)
  const dashRef = useRef<THREE.Mesh>(null)

  const dims = useMemo(() => {
    switch (CAR.style) {
      case 'sedan':
        return { len: 4.5, width: 1.85, cabinLen: 2.2, cabinBack: -0.1 }
      case 'wagon':
        return { len: 4.6, width: 1.9, cabinLen: 2.7, cabinBack: -0.3 }
      default:
        return { len: 4.0, width: 1.8, cabinLen: 2.0, cabinBack: -0.15 }
    }
  }, [])

  const mats = useMemo(
    () => ({
      body: storybook({
        color: CAR.body,
        roughness: 0.42,
        metalness: 0.18,
        rim: 0.55,
        rimColor: '#ffd9b0',
        gradient: 0.26,
      }),
      roof: storybook({ color: CAR.roof, roughness: 0.42, metalness: 0.18, rim: 0.5 }),
      trim: storybook({ color: CAR.trim, roughness: 0.6, metalness: 0.1, rim: 0.3 }),
      glass: storybook({
        color: CAR.glassTint,
        roughness: 0.12,
        metalness: 0.05,
        rim: 0.75,
        rimColor: '#cfe2f5',
        transparent: true,
        opacity: 0.62,
      }),
      tyre: storybook({ color: '#22201f', roughness: 0.95, rim: 0.2 }),
      rim: storybook({ color: '#b8bcc0', roughness: 0.4, metalness: 0.5, rim: 0.5 }),
      seat: storybook({ color: CAR.seats, roughness: 0.95, rim: 0.28 }),
      seatInset: storybook({ color: '#81766f', roughness: 0.98, rim: 0.18, gradient: 0.3 }),
      interior: storybook({ color: CAR.interior, roughness: 0.95, rim: 0.22 }),
      console: storybook({ color: '#252a31', roughness: 0.78, metalness: 0.08, rim: 0.3 }),
      mirror: storybook({
        color: '#16202b',
        roughness: 0.14,
        metalness: 0.64,
        rim: 0.62,
        rimColor: '#b9d2e7',
      }),
      dash: glow(dashboardGlowColor, instrumentGlow ? 0.9 : 0.08).clone(),
      lamp: glow('#ffdcae', 0.55),
      tail: glow('#ff6a5c', 0.8),
    }),
    [dashboardGlowColor, instrumentGlow],
  )

  const bodyGeo = useMemo(() => roundedBoxGeometry(1, 1, 1, 0.22, 3), [])
  const cabinGeo = useMemo(() => roundedBoxGeometry(1, 1, 1, 0.3, 3), [])
  useLayoutEffect(() => {
    return () => {
      bodyGeo.dispose()
      cabinGeo.dispose()
      mats.dash.dispose()
    }
  }, [bodyGeo, cabinGeo, mats.dash])

  useFrame((_, dt) => {
    if (passengerDoorRef.current) {
      const target = -passengerDoorOpen * 1.05
      passengerDoorRef.current.rotation.y +=
        (target - passengerDoorRef.current.rotation.y) * Math.min(1, dt * 4)
    }
    if (driverDoorRef.current) {
      const target = driverDoorOpen * 1.05
      driverDoorRef.current.rotation.y +=
        (target - driverDoorRef.current.rotation.y) * Math.min(1, dt * 4)
    }
    if (domeRef.current) {
      // A parked car at night has no cabin light on — the dome only lifts while
      // a door is open, then falls back to a whisper of warm fill (dashboard
      // bounce and moonlight) so the interior reads as dim and intimate rather
      // than lit. Close first-person framing puts Peach well inside the
      // falloff, so this stays practical without bleaching his face.
      const target = interiorLightOn ? 0.32 : 0.08
      domeRef.current.intensity += (target - domeRef.current.intensity) * Math.min(1, dt * 2.4)
    }
    if (dashRef.current) {
      const m = dashRef.current.material as THREE.MeshBasicMaterial
      const target = instrumentGlow ? (interiorLightOn ? 0.95 : 0.35) : 0.08
      m.opacity += (target - m.opacity) * Math.min(1, dt * 2)
    }
  })

  useColliders(
    () => [
      { kind: 'box', x: position[0], z: position[2], hw: dims.width / 2 + 0.15, hd: dims.len / 2 + 0.15, rot: rotation },
    ],
    [position[0], position[2], rotation, dims],
  )

  const wheelPositions: [number, number][] = [
    [dims.width / 2, dims.len / 2 - 0.85],
    [-dims.width / 2, dims.len / 2 - 0.85],
    [dims.width / 2, -dims.len / 2 + 0.8],
    [-dims.width / 2, -dims.len / 2 + 0.8],
  ]

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* lower body */}
      <mesh geometry={bodyGeo} material={mats.body} position={[0, 0.68, 0]} scale={[dims.width, 0.72, dims.len]} castShadow receiveShadow />
      {/* sills */}
      <mesh geometry={bodyGeo} material={mats.trim} position={[0, 0.36, 0]} scale={[dims.width * 0.98, 0.3, dims.len * 0.96]} castShadow />
      {/* bonnet taper */}
      <mesh geometry={bodyGeo} material={mats.body} position={[0, 0.92, dims.len / 2 - 0.62]} scale={[dims.width * 0.94, 0.3, 1.2]} castShadow />

      {/* cabin */}
      <mesh
        geometry={cabinGeo}
        material={mats.roof}
        position={[0, 1.34, dims.cabinBack]}
        scale={[dims.width * 0.9, 0.78, dims.cabinLen]}
        castShadow
      />
      {/* windscreen + side glass, inset slightly so the roof reads as metal */}
      <mesh
        geometry={cabinGeo}
        material={mats.glass}
        position={[0, 1.3, dims.cabinBack]}
        scale={[dims.width * 0.92, 0.62, dims.cabinLen * 1.01]}
      />
      {/* Window rails and pillars keep the glass from reading as one plastic bubble. */}
      {[-1, 1].map((side) => (
        <group key={`window-trim-${side}`}>
          <mesh
            geometry={geo.box()}
            material={mats.trim}
            position={[side * dims.width * 0.455, 1.07, dims.cabinBack]}
            scale={[0.045, 0.055, dims.cabinLen * 0.95]}
          />
          {[dims.cabinBack - dims.cabinLen * 0.28, dims.cabinBack + dims.cabinLen * 0.25].map((z) => (
            <mesh
              key={z}
              geometry={geo.box()}
              material={mats.trim}
              position={[side * dims.width * 0.46, 1.36, z]}
              scale={[0.05, 0.62, 0.1]}
            />
          ))}
        </group>
      ))}

      {/* interior: seats, dash, and the two motifs */}
      <group position={[0, 0.95, dims.cabinBack]}>
        <mesh geometry={geo.softBox(0.08)} material={mats.interior} position={[0, -0.06, 0]} scale={[dims.width * 0.82, 0.1, dims.cabinLen * 0.92]} />
        {[-0.42, 0.42].map((x) => (
          <group key={x} position={[x, 0.14, -0.24]}>
            <mesh geometry={geo.softBox(0.06)} material={mats.seat} scale={[0.56, 0.14, 0.6]} />
            <mesh geometry={geo.softBox(0.08)} material={mats.seat} position={[0, 0.18, -0.28]} rotation={[0.14, 0, 0]} scale={[0.56, 0.28, 0.14]} />
            <mesh geometry={geo.softBox(0.025)} material={mats.seatInset} position={[0, 0.085, 0.02]} scale={[0.4, 0.035, 0.42]} />
            <mesh
              geometry={geo.softBox(0.025)}
              material={mats.seatInset}
              position={[0, 0.18, -0.195]}
              rotation={[0.14, 0, 0]}
              scale={[0.4, 0.18, 0.025]}
            />
            <mesh geometry={geo.softBox(0.06)} material={mats.seat} position={[0, 0.38, -0.34]} scale={[0.25, 0.12, 0.12]} />
          </group>
        ))}
        {/* Layered dashboard and lower fascia. */}
        <mesh geometry={geo.softBox(0.06)} material={mats.interior} position={[0, 0.16, dims.cabinLen / 2 - 0.12]} scale={[dims.width * 0.8, 0.26, 0.34]} />
        <mesh
          geometry={geo.softBox(0.04)}
          material={mats.console}
          position={[0, -0.02, dims.cabinLen / 2 - 0.24]}
          scale={[dims.width * 0.72, 0.16, 0.18]}
        />
        <mesh
          geometry={geo.softBox(0.04)}
          material={mats.console}
          position={[-0.4, 0.31, dims.cabinLen / 2 - 0.18]}
          scale={[0.58, 0.18, 0.22]}
        />
        <mesh
          ref={dashRef}
          geometry={geo.softBox(0.03)}
          material={mats.dash}
          position={[-0.4, 0.31, dims.cabinLen / 2 - 0.3]}
          scale={[0.4, 0.075, 0.06]}
        />
        {[-0.49, -0.31].map((x) => (
          <mesh
            key={`instrument-${x}`}
            geometry={geo.cylinder(12)}
            material={mats.dash}
            position={[x, 0.31, dims.cabinLen / 2 - 0.325]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.095, 0.018, 0.095]}
          />
        ))}
        <mesh
          geometry={geo.softBox(0.025)}
          material={mats.dash}
          position={[0.03, 0.23, dims.cabinLen / 2 - 0.32]}
          scale={[0.18, 0.13, 0.035]}
        />
        {/* Driver controls. Car front is local +Z; driver sits on local -X. */}
        <group position={[-0.42, 0.34, dims.cabinLen / 2 - 0.53]} rotation={[-0.2, 0, 0]}>
          <mesh geometry={geo.torus(16)} material={mats.console} scale={[0.34, 0.34, 0.5]} />
          <mesh geometry={geo.cylinder(10)} material={mats.rim} rotation={[Math.PI / 2, 0, 0]} scale={[0.1, 0.08, 0.1]} />
          {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
            <mesh
              key={angle}
              geometry={geo.box()}
              material={mats.console}
              position={[Math.cos(angle) * 0.105, Math.sin(angle) * 0.105, 0]}
              rotation={[0, 0, angle]}
              scale={[0.22, 0.035, 0.035]}
            />
          ))}
          <mesh
            geometry={geo.cylinder(8)}
            material={mats.console}
            position={[0, 0, 0.16]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.05, 0.34, 0.05]}
          />
        </group>
        {/* Center console, selector, and paired cup wells. */}
        <mesh geometry={geo.softBox(0.05)} material={mats.console} position={[0, 0.08, 0.08]} scale={[0.28, 0.18, 0.82]} />
        <mesh geometry={geo.cylinder(8)} material={mats.rim} position={[0, 0.23, 0.24]} rotation={[0.18, 0, 0]} scale={[0.035, 0.22, 0.035]} />
        <mesh geometry={geo.sphere(8)} material={mats.console} position={[0, 0.34, 0.2]} scale={0.075} />
        {[-0.1, 0.1].map((x) => (
          <mesh
            key={`cup-${x}`}
            geometry={geo.torus(12)}
            material={mats.rim}
            position={[x, 0.19, -0.09]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.095, 0.095, 0.24]}
          />
        ))}
        {/* Headliner, dome housing, and rear-view mirror. */}
        <mesh geometry={geo.softBox(0.04)} material={mats.interior} position={[0, 0.72, -0.08]} scale={[dims.width * 0.72, 0.045, dims.cabinLen * 0.72]} />
        <mesh geometry={geo.softBox(0.025)} material={mats.lamp} position={[0, 0.69, -0.04]} scale={[0.28, 0.035, 0.18]} />
        <group position={[0, 0.62, dims.cabinLen / 2 - 0.38]}>
          <mesh geometry={geo.box()} material={mats.console} position={[0, 0.16, 0.08]} scale={[0.045, 0.24, 0.045]} />
          <mesh geometry={geo.softBox(0.035)} material={mats.console} scale={[0.58, 0.2, 0.09]} />
          <mesh
            geometry={geo.plane()}
            material={mats.mirror}
            position={[0, 0, -0.051]}
            rotation={[0, Math.PI, 0]}
            scale={[0.48, 0.13, 1]}
          />
        </group>
        {/* the peach on the dashboard, and the cheetah charm on the mirror */}
        {showDashboardPeach ? (
          <PeachObject position={[0.42, 0.3, dims.cabinLen / 2 - 0.18]} scale={0.55} color={CAR.dashCharmColor} />
        ) : null}
        {showMirrorCharm ? (
          <group position={[0, 0.57, dims.cabinLen / 2 - 0.42]}>
            <mesh geometry={geo.cylinder(4)} material={mats.interior} position={[0, -0.09, 0]} scale={[0.008, 0.18, 0.008]} />
            <CheetahFigure position={[0, -0.32, 0]} scale={0.24} color={CAR.mirrorCharmColor} />
          </group>
        ) : null}
        {showDashboardMugs ? (
          <MugPair
            position={[0.1, 0.38, dims.cabinLen / 2 - 0.16]}
            rotation={Math.PI}
            scale={0.46}
          />
        ) : null}
        <pointLight ref={domeRef} color="#ffe0b8" intensity={0} distance={3.2} decay={2} position={[0, 0.5, -0.15]} />
      </group>

      {/* passenger door — hinged at the front edge, on +X */}
      <group ref={passengerDoorRef} position={[dims.width / 2 - 0.06, 0.75, dims.cabinBack + dims.cabinLen / 2 - 0.1]}>
        <mesh geometry={bodyGeo} material={mats.body} position={[0.04, 0, -0.6]} scale={[0.14, 0.86, 1.25]} castShadow />
        <mesh geometry={geo.softBox(0.04)} material={mats.trim} position={[0.1, -0.1, -0.6]} scale={[0.06, 0.12, 1.0]} />
        <mesh geometry={geo.box()} material={mats.glass} position={[0.03, 0.55, -0.6]} scale={[0.055, 0.42, 0.96]} />
        <mesh geometry={geo.box()} material={mats.trim} position={[0.04, 0.34, -0.6]} scale={[0.07, 0.06, 1.04]} />
        <mesh geometry={geo.softBox(0.025)} material={mats.trim} position={[0.11, 0.04, -0.34]} scale={[0.04, 0.08, 0.28]} />
      </group>

      {/* driver door — mirrored hinge on local -X */}
      <group ref={driverDoorRef} position={[-dims.width / 2 + 0.06, 0.75, dims.cabinBack + dims.cabinLen / 2 - 0.1]}>
        <mesh geometry={bodyGeo} material={mats.body} position={[-0.04, 0, -0.6]} scale={[0.14, 0.86, 1.25]} castShadow />
        <mesh geometry={geo.softBox(0.04)} material={mats.trim} position={[-0.1, -0.1, -0.6]} scale={[0.06, 0.12, 1.0]} />
        <mesh geometry={geo.box()} material={mats.glass} position={[-0.03, 0.55, -0.6]} scale={[0.055, 0.42, 0.96]} />
        <mesh geometry={geo.box()} material={mats.trim} position={[-0.04, 0.34, -0.6]} scale={[0.07, 0.06, 1.04]} />
        <mesh geometry={geo.softBox(0.025)} material={mats.trim} position={[-0.11, 0.04, -0.34]} scale={[0.04, 0.08, 0.28]} />
      </group>

      {/* wheels */}
      {wheelPositions.map((p, i) => (
        <group key={i} position={[p[0], 0.36, p[1]]} rotation={[0, 0, Math.PI / 2]}>
          <mesh geometry={geo.cylinder(14)} material={mats.tyre} scale={[0.72, 0.24, 0.72]} castShadow />
          <mesh geometry={geo.cylinder(10)} material={mats.rim} scale={[0.44, 0.26, 0.44]} />
        </group>
      ))}

      {/* lamps */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.softBox(0.04)} material={mats.lamp} position={[s * dims.width * 0.33, 0.85, dims.len / 2 + 0.02]} scale={[0.4, 0.18, 0.06]} />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`t${s}`} geometry={geo.softBox(0.03)} material={mats.tail} position={[s * dims.width * 0.36, 0.88, -dims.len / 2 - 0.02]} scale={[0.28, 0.14, 0.05]} />
      ))}
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * The other character — seated, inside the car
 * ──────────────────────────────────────────────────────────────────────────── */

export const SeatedPerson = memo(function SeatedPerson({
  position,
  rotation = 0,
  /** 0 = facing forward, 1 = turned toward the passenger seat. */
  turnToward = 0,
  /** 0 = neutral, 1 = a small settled smile. */
  warmth = 0,
}: {
  position: [number, number, number]
  rotation?: number
  turnToward?: number
  warmth?: number
}) {
  const head = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const mouth = useRef<THREE.Group>(null)
  const turn = useRef(0)
  const smile = useRef(0)
  const blink = useRef({ next: 2.8, age: 1 })

  const mats = useMemo(
    () => ({
      skin: storybook({ color: PERSON.skin, roughness: 0.92, rim: 0.24 }),
      hair: storybook({ color: PERSON.hair, roughness: 0.85, rim: 0.4 }),
      hairShadow: storybook({ color: PERSON.hairShadow, roughness: 0.88, rim: 0.24 }),
      shirt: storybook({ color: PERSON.shirt, roughness: 0.95, rim: 0.3 }),
      jacket: storybook({ color: PERSON.jacket, roughness: 0.92, rim: 0.34, gradient: 0.26 }),
      eye: storybook({ color: '#2e2320', roughness: 0.5, rim: 0 }),
      mouth: storybook({ color: '#5d3732', roughness: 0.82, rim: 0.08 }),
      glasses: storybook({ color: PERSON.glassesColor, roughness: 0.3, metalness: 0.4, rim: 0.6 }),
      facial: storybook({ color: PERSON.facialHairColor, roughness: 0.9, rim: 0.2 }),
    }),
    [],
  )

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const cycle = (t + 4.2) % 21
    const roadGlance =
      cycle < 4.6
        ? 1
        : cycle < 6.4
          ? 1 - (cycle - 4.6) / 1.8
          : cycle > 18.5
            ? (cycle - 18.5) / 2.5
            : 0
    const targetTurn = turnToward * (1 - roadGlance * 0.72)
    turn.current += (targetTurn - turn.current) * Math.min(1, dt * 1.65)
    smile.current += (warmth - smile.current) * Math.min(1, dt * 1.1)

    if (head.current) {
      head.current.rotation.y = turn.current * 0.85 + Math.sin(t * 0.31) * 0.018
      head.current.rotation.x = Math.sin(t * 0.43) * 0.014 - turn.current * 0.05
    }
    if (torso.current) {
      torso.current.rotation.y = turn.current * 0.28
      torso.current.rotation.z = Math.sin(t * 0.13 + 1.4) * 0.009
      torso.current.position.y = Math.sin(t * 0.17 + 0.8) * 0.006
      // breathing
      torso.current.scale.y = 1 + Math.sin(t * 1.1) * 0.008
    }

    const b = blink.current
    if (b.age < 0.16) {
      b.age += dt
    } else {
      b.next -= dt
      if (b.next <= 0) {
        b.age = 0
        b.next = 2.7 + ((Math.sin(t * 12.7) + 1) * 0.5) * 3.9
      }
    }
    if (eyes.current) {
      const close = b.age < 0.16 ? Math.sin((b.age / 0.16) * Math.PI) : 0
      eyes.current.scale.y = Math.max(0.08, 1 - close * 0.94)
      eyes.current.position.x = roadGlance * 0.012
    }
    if (mouth.current) {
      mouth.current.scale.y = 0.45 + smile.current * 0.9
      mouth.current.position.y = -0.115 + smile.current * 0.008
    }
  })

  const outer = PERSON.wearsJacket ? mats.jacket : mats.shirt

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={torso}>
        {/* seated torso */}
        <mesh geometry={geo.capsule(10)} material={outer} position={[0, 0.3, 0]} scale={[0.34, 0.26, 0.28]} castShadow />
        {PERSON.wearsJacket && (
          <mesh geometry={geo.capsule(10)} material={mats.shirt} position={[0, 0.28, 0.06]} scale={[0.2, 0.22, 0.2]} />
        )}
        {/* thighs, going forward */}
        {[-0.14, 0.14].map((x) => (
          <mesh key={x} geometry={geo.capsule(7)} material={outer} position={[x, 0.06, 0.26]} rotation={[Math.PI / 2, 0, 0]} scale={[0.12, 0.24, 0.12]} />
        ))}
        {/* arms, resting */}
        {[-0.32, 0.32].map((x) => (
          <mesh key={x} geometry={geo.capsule(7)} material={outer} position={[x, 0.22, 0.1]} rotation={[0.7, 0, 0]} scale={[0.1, 0.2, 0.1]} />
        ))}
        {[-0.3, 0.3].map((x) => (
          <mesh key={`h${x}`} geometry={geo.sphere(8)} material={mats.skin} position={[x, 0.06, 0.3]} scale={0.09} />
        ))}

        {/* head */}
        <group ref={head} position={[0, 0.66, 0]}>
          <mesh geometry={geo.cylinder(8)} material={mats.skin} position={[0, -0.12, 0]} scale={[0.08, 0.14, 0.08]} />
          <mesh geometry={geo.sphere(18)} material={mats.skin} scale={[0.4, 0.44, 0.4]} castShadow />
          <mesh
            geometry={geo.sphere(16)}
            material={mats.hair}
            position={[0, 0.05, -0.02]}
            scale={
              PERSON.hairStyle === 'curly'
                ? [0.45, 0.44, 0.44]
                : PERSON.hairStyle === 'buzzed'
                  ? [0.41, 0.42, 0.41]
                  : [0.42, 0.43, 0.42]
            }
            castShadow
          />
          {PERSON.hairStyle !== 'buzzed' && (
            <mesh geometry={geo.sphere(12)} material={mats.hairShadow} position={[0, 0.1, -0.16]} scale={[0.33, 0.26, 0.22]} />
          )}
          {/* Eyes blink on their own uneven clock. Head motion handles the rare
              look toward the road; eye motion stays almost imperceptible. */}
          <group ref={eyes}>
            <mesh geometry={geo.sphere(8)} material={mats.eye} position={[0.105, 0.01, 0.19]} scale={[0.05, 0.055, 0.03]} />
            <mesh geometry={geo.sphere(8)} material={mats.eye} position={[-0.105, 0.01, 0.19]} scale={[0.05, 0.055, 0.03]} />
          </group>
          <group ref={mouth} position={[0, -0.115, 0.205]}>
            <mesh geometry={geo.box()} material={mats.mouth} position={[-0.028, 0, 0]} rotation={[0, 0, -0.2]} scale={[0.065, 0.012, 0.018]} />
            <mesh geometry={geo.box()} material={mats.mouth} position={[0.028, 0, 0]} rotation={[0, 0, 0.2]} scale={[0.065, 0.012, 0.018]} />
          </group>
          {PERSON.glasses && (
            <group position={[0, 0.01, 0.2]}>
              {[-0.105, 0.105].map((x) => (
                <mesh key={x} geometry={geo.torus(12)} material={mats.glasses} position={[x, 0, 0]} scale={[0.17, 0.17, 0.5]} />
              ))}
              <mesh geometry={geo.box()} material={mats.glasses} scale={[0.08, 0.012, 0.012]} />
            </group>
          )}
          {PERSON.facialHair && (
            <mesh geometry={geo.sphere(10)} material={mats.facial} position={[0, -0.16, 0.16]} scale={[0.2, 0.11, 0.13]} />
          )}
        </group>
      </group>
    </group>
  )
})


/* ────────────────────────────────────────────────────────────────────────────
 * A figure with no features — a shape the light does not land on.
 * Used once, outside the cottage. It approaches, speaks, and is gone.
 * ──────────────────────────────────────────────────────────────────────────── */

export const Silhouette = memo(function Silhouette({
  position,
  rotation = 0,
  /** 0 = not there, 1 = fully present. */
  presence = 1,
  /** Walks toward this point as `presence` rises. */
  approachFrom = 0,
  scale = 1,
}: {
  position: [number, number, number]
  rotation?: number
  presence?: number
  approachFrom?: number
  scale?: number
}) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const shown = useRef(0)

  /**
   * Unlit black, with a cool rim along its edge.
   *
   * A pure `#05050a` figure was the original art direction and it was invisible:
   * once the chapters went properly moonlit there was nothing for near-black to
   * be darker *than*, so the beat played to an empty yard. The rim is the fix —
   * a thin cold edge where the surface turns away from the camera, which is what
   * moonlight actually does to a person standing in the dark. The interior stays
   * absolutely featureless, so it still reads as an absence rather than a body.
   */
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#05050a'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    })
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSilN;
           varying vec3 vSilV;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 silWorld = modelMatrix * vec4( transformed, 1.0 );
           vSilN = normalize( mat3( modelMatrix ) * normal );
           vSilV = normalize( cameraPosition - silWorld.xyz );`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSilN;
           varying vec3 vSilV;`,
        )
        .replace(
          '#include <fog_fragment>',
          `{
             float silRim = pow( 1.0 - clamp( dot( normalize( vSilN ), normalize( vSilV ) ), 0.0, 1.0 ), 3.4 );
             gl_FragColor.rgb += vec3( 0.34, 0.4, 0.56 ) * silRim * 0.85;
           }
           #include <fog_fragment>`,
        )
    }
    m.customProgramCacheKey = () => 'silhouette-rim'
    return m
  }, [])
  useLayoutEffect(() => () => mat.dispose(), [mat])

  useFrame((state, dt) => {
    shown.current += (presence - shown.current) * Math.min(1, dt * 1.6)
    mat.opacity = shown.current * 0.94

    const g = root.current
    if (g) {
      // Drifts in from further back as it becomes present.
      g.position.set(
        position[0],
        position[1],
        position[2] - approachFrom * (1 - shown.current),
      )
      g.rotation.y = rotation
      g.visible = shown.current > 0.01
    }
    if (body.current) {
      const t = state.clock.elapsedTime
      // Barely breathing. Just enough that it is not a statue.
      body.current.position.y = Math.sin(t * 0.9) * 0.015
      body.current.rotation.z = Math.sin(t * 0.45) * 0.012
    }
  })

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={scale}>
      <group ref={body}>
        <mesh geometry={geo.capsule(10)} material={mat} position={[0, 0.78, 0]} scale={[0.26, 0.3, 0.22]} />
        <mesh geometry={geo.sphere(16)} material={mat} position={[0, 1.32, 0]} scale={[0.34, 0.38, 0.33]} />
        {[-0.26, 0.26].map((x) => (
          <mesh key={x} geometry={geo.capsule(7)} material={mat} position={[x, 0.86, 0]} scale={[0.09, 0.2, 0.09]} />
        ))}
        {[-0.11, 0.11].map((x) => (
          <mesh key={`l${x}`} geometry={geo.capsule(7)} material={mat} position={[x, 0.3, 0]} scale={[0.1, 0.22, 0.1]} />
        ))}
      </group>
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * A wooden park sign.
 * ──────────────────────────────────────────────────────────────────────────── */

export const ParkSign = memo(function ParkSign({
  position,
  rotation = 0,
  scale = 1,
  wood = '#6b5039',
  face = '#c9b088',
  text = '',
  lit = false,
  lightColor = '#ffd29a',
}: {
  position: [number, number, number]
  rotation?: number
  scale?: number
  wood?: string
  face?: string
  /** Carved into the board. Drawn to a canvas, so no font file is fetched. */
  text?: string
  /** A small local lamp for signs that must remain readable after dark. */
  lit?: boolean
  lightColor?: string
}) {
  // The lettering is painted into a CanvasTexture with the same system serif the
  // interface uses. No loader, no network, no font asset.
  const lettering = useMemo(() => {
    if (!text) return null
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 256
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = face
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#4a3524'
    ctx.font = "600 104px ui-serif, 'Iowan Old Style', Palatino, Georgia, serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, c.width / 2, c.height / 2 + 4)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [text, face])

  useLayoutEffect(() => () => lettering?.dispose(), [lettering])

  const mats = useMemo(
    () => ({
      post: storybook({ color: wood, roughness: 0.95, rim: 0.26 }),
      face: storybook({ color: face, roughness: 0.94, rim: 0.4, gradient: 0.24 }),
      lamp: storybook({ color: '#3f3830', roughness: 0.62, metalness: 0.25, rim: 0.3 }),
      bulb: glow(lightColor, 0.74),
    }),
    [wood, face, lightColor],
  )

  const boardMat = useMemo(() => {
    if (!lettering) return null
    return new THREE.MeshStandardMaterial({
      map: lettering,
      roughness: 0.94,
      metalness: 0,
      emissive: lit ? new THREE.Color(lightColor) : new THREE.Color(0x000000),
      emissiveMap: lit ? lettering : null,
      emissiveIntensity: lit ? 0.38 : 0,
    })
  }, [lettering, lit, lightColor])
  useLayoutEffect(() => () => boardMat?.dispose(), [boardMat])
  useColliders(
    () => [{ kind: 'circle', x: position[0], z: position[2], r: 0.5 * scale }],
    [position[0], position[2], scale],
  )
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} geometry={geo.cylinder(7)} material={mats.post} position={[x, 0.85, 0]} scale={[0.13, 1.7, 0.13]} castShadow />
      ))}
      <mesh geometry={geo.softBox(0.05)} material={mats.face} position={[0, 1.5, 0]} scale={[2.0, 0.72, 0.12]} castShadow receiveShadow />
      {/* a routed border, which is what makes it read as a park sign */}
      <mesh geometry={geo.softBox(0.04)} material={mats.post} position={[0, 1.5, 0.07]} scale={[1.82, 0.56, 0.02]} />
      <mesh
        geometry={geo.plane()}
        material={boardMat ?? mats.face}
        position={[0, 1.5, 0.086]}
        scale={[1.7, 0.44, 1]}
      />
      <mesh geometry={geo.cone(6)} material={mats.post} position={[0, 1.95, 0]} scale={[0.36, 0.22, 0.16]} />
      {lit ? (
        <>
          <mesh
            geometry={geo.cylinder(6)}
            material={mats.lamp}
            position={[0, 2.14, 0.28]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.035, 0.42, 0.035]}
          />
          <mesh
            geometry={geo.sphere(8)}
            material={mats.bulb}
            position={[0, 2.14, 0.69]}
            scale={0.09}
          />
        </>
      ) : null}
    </group>
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Set dressing
 *
 * Three props that do most of the work of making an outdoor space look inhabited
 * rather than staged: a strung line of bulbs overhead, something to gather
 * around, and something that tells you where you are. All share the cached
 * geometry and instance their repeated parts, so each is one or two draw calls.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A catenary of small bulbs between two points.
 *
 * The sag is the whole effect: a straight line of lights reads as a diagram, a
 * hanging one reads as something somebody put up. Bulbs are instanced, so a
 * hundred of them across a square cost one draw call plus the two posts.
 */
export const StringLights = memo(function StringLights({
  from,
  to,
  height = 4.2,
  sag = 0.9,
  count = 11,
  color = '#ffc98a',
  lit = true,
  posts = true,
}: {
  from: [number, number]
  to: [number, number]
  /** Height of both ends above ground. */
  height?: number
  /** How far the middle of the line droops below the ends. */
  sag?: number
  count?: number
  color?: string
  lit?: boolean
  /** Draw a supporting post at each end. Off when hanging between buildings. */
  posts?: boolean
}) {
  const bulbs = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const mats = useMemo(
    () => ({
      wire: storybook({ color: '#2a2620', roughness: 0.9, rim: 0.1 }),
      post: storybook({ color: '#6b5039', roughness: 0.94, rim: 0.28 }),
      bulb: glow(color, lit ? 1 : 0.22, false),
    }),
    [color, lit],
  )

  /** Points along the curve, plus the short wire segments that join them. */
  const { points, segments } = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      const k = count === 1 ? 0.5 : i / (count - 1)
      // A parabola is indistinguishable from a catenary at this scale and is
      // one multiply instead of a cosh.
      const droop = sag * 4 * k * (1 - k)
      pts.push(
        new THREE.Vector3(
          from[0] + (to[0] - from[0]) * k,
          height - droop,
          from[1] + (to[1] - from[1]) * k,
        ),
      )
    }
    const segs = pts.slice(0, -1).map((p, i) => {
      const q = pts[i + 1]
      const mid = p.clone().lerp(q, 0.5)
      return { mid, len: p.distanceTo(q), dir: q.clone().sub(p).normalize() }
    })
    return { points: pts, segments: segs }
  }, [from, to, height, sag, count])

  useLayoutEffect(() => {
    const mesh = bulbs.current
    if (!mesh) return
    points.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.1, p.z)
      dummy.rotation.set(0, 0, 0)
      // Alternate sizes so the line has a rhythm instead of a beat.
      dummy.scale.setScalar(i % 2 === 0 ? 0.13 : 0.1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [dummy, points])

  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  return (
    <group>
      {segments.map((s, i) => (
        <mesh
          key={i}
          geometry={geo.cylinder(5)}
          material={mats.wire}
          position={[s.mid.x, s.mid.y, s.mid.z]}
          quaternion={new THREE.Quaternion().setFromUnitVectors(up, s.dir)}
          scale={[0.018, s.len, 0.018]}
        />
      ))}
      <instancedMesh ref={bulbs} args={[geo.sphere(8), mats.bulb, points.length]} frustumCulled={false} />
      {lit ? (
        <pointLight
          color={color}
          intensity={5}
          distance={14}
          decay={2}
          position={[(from[0] + to[0]) / 2, height - sag, (from[1] + to[1]) / 2]}
        />
      ) : null}
      {posts
        ? ([from, to] as [number, number][]).map((p, i) => (
            <mesh
              key={`post-${i}`}
              geometry={geo.cylinder(7)}
              material={mats.post}
              position={[p[0], height / 2, p[1]]}
              scale={[0.09, height, 0.09]}
              castShadow
            />
          ))
        : null}
    </group>
  )
})

/** A low stone well. Something for a square to be arranged around. */
export const Well = memo(function Well({
  position,
  rotation = 0,
}: {
  position: [number, number, number]
  rotation?: number
}) {
  const mats = useMemo(
    () => ({
      stone: storybook({ color: '#9a9083', roughness: 0.98, rim: 0.22, gradient: 0.3 }),
      wood: storybook({ color: '#6b5039', roughness: 0.94, rim: 0.28 }),
      rope: storybook({ color: '#c9b48a', roughness: 1, rim: 0.2 }),
      water: storybook({ color: '#1d2a38', roughness: 0.25, metalness: 0.3, rim: 0.5, rimColor: '#8fb0e0' }),
    }),
    [],
  )
  useColliders(
    () => [{ kind: 'circle', x: position[0], z: position[2], r: 1.05 }],
    [position[0], position[2]],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.cylinder(16)} material={mats.stone} position={[0, 0.42, 0]} scale={[1.9, 0.84, 1.9]} castShadow receiveShadow />
      {/* Dark water, set well down inside the shaft. */}
      <mesh geometry={geo.cylinder(14)} material={mats.water} position={[0, 0.6, 0]} scale={[1.5, 0.02, 1.5]} />
      <mesh geometry={geo.cylinder(16)} material={mats.stone} position={[0, 0.86, 0]} scale={[2.0, 0.14, 2.0]} castShadow />
      {/* Two uprights, a crossbeam, a winch and a bucket on a rope. */}
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} geometry={geo.softBox(0.04)} material={mats.wood} position={[x, 1.7, 0]} scale={[0.14, 1.6, 0.14]} castShadow />
      ))}
      <mesh geometry={geo.softBox(0.05)} material={mats.wood} position={[0, 2.5, 0]} rotation={[0, 0, 0]} scale={[1.9, 0.16, 0.5]} castShadow />
      <mesh geometry={geo.cylinder(10)} material={mats.wood} position={[0, 2.24, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.11, 1.5, 0.11]} />
      <mesh geometry={geo.cylinder(5)} material={mats.rope} position={[0.3, 1.78, 0]} scale={[0.02, 0.9, 0.02]} />
      <mesh geometry={geo.cylinder(10)} material={mats.wood} position={[0.3, 1.24, 0]} scale={[0.26, 0.28, 0.26]} castShadow />
    </group>
  )
})

/**
 * A fingerpost. Arms point wherever the scene needs the player to look, and the
 * lettering is drawn to a canvas — the same trick `ParkSign` uses, so there is
 * still no font asset anywhere in the build.
 */
export const Signpost = memo(function Signpost({
  position,
  rotation = 0,
  arms,
  wood = '#6b5039',
  face = '#c9b088',
}: {
  position: [number, number, number]
  rotation?: number
  /** Each arm's text, its bearing in radians, and its height up the post. */
  arms: { text: string; angle: number; height: number }[]
  wood?: string
  face?: string
}) {
  const mats = useMemo(
    () => ({
      post: storybook({ color: wood, roughness: 0.94, rim: 0.3, gradient: 0.28 }),
      face: storybook({ color: face, roughness: 0.96, rim: 0.34 }),
    }),
    [wood, face],
  )

  const boards = useMemo(
    () =>
      arms.map((arm) => {
        const c = document.createElement('canvas')
        c.width = 256
        c.height = 64
        const ctx = c.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = face
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.fillStyle = 'rgba(60, 42, 30, 0.86)'
        ctx.font = '600 30px ui-serif, Georgia, serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(arm.text, c.width / 2, c.height / 2 + 1)
        const tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
      }),
    [arms, face],
  )

  useLayoutEffect(
    () => () => {
      boards.forEach((m) => {
        m?.map?.dispose()
        m?.dispose()
      })
    },
    [boards],
  )

  useColliders(
    () => [{ kind: 'circle', x: position[0], z: position[2], r: 0.28 }],
    [position[0], position[2]],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.cylinder(8)} material={mats.post} position={[0, 1.3, 0]} scale={[0.16, 2.6, 0.16]} castShadow />
      <mesh geometry={geo.cone(8)} material={mats.post} position={[0, 2.68, 0]} scale={[0.26, 0.24, 0.26]} />
      {arms.map((arm, i) => (
        <group key={i} rotation={[0, arm.angle, 0]}>
          <mesh
            geometry={geo.softBox(0.04)}
            material={mats.face}
            position={[0.62, arm.height, 0]}
            scale={[1.16, 0.3, 0.06]}
            castShadow
          />
          {/* A pointed end, so it reads as directional at a glance. */}
          <mesh
            geometry={geo.cone(4)}
            material={mats.face}
            position={[1.26, arm.height, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            scale={[0.3, 0.22, 0.06]}
          />
          {boards[i] ? (
            <mesh
              geometry={geo.plane()}
              material={boards[i]!}
              position={[0.62, arm.height, 0.032]}
              scale={[1.04, 0.22, 1]}
            />
          ) : null}
        </group>
      ))}
    </group>
  )
})

/**
 * A telegraph pole, optionally strung to the next one along.
 *
 * Wires are the cheapest way to make an empty road read as a road to somewhere:
 * they give the eye a line to follow into the distance and they imply a town at
 * the end of it. Each pole draws its own two spans as thin sagging cylinders,
 * built the same way `StringLights` builds its catenary.
 */
export const TelegraphPole = memo(function TelegraphPole({
  position,
  next,
  height = 7.4,
}: {
  position: [number, number, number]
  /** World position of the following pole, or null at the end of the line. */
  next: [number, number, number] | null
  height?: number
}) {
  const mats = useMemo(
    () => ({
      pole: storybook({ color: '#4a3f34', roughness: 0.96, rim: 0.24, gradient: 0.3 }),
      wire: storybook({ color: '#1d1a20', roughness: 0.9, rim: 0.08 }),
    }),
    [],
  )

  useColliders(
    () => [{ kind: 'circle', x: position[0], z: position[2], r: 0.3 }],
    [position[0], position[2]],
  )

  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  /** Two wires, each sagging, split into a few segments so the droop shows. */
  const spans = useMemo(() => {
    if (!next) return []
    const STEPS = 5
    const SAG = 0.85
    const out: { mid: THREE.Vector3; len: number; dir: THREE.Vector3 }[] = []
    for (const offset of [-0.62, 0.62]) {
      const a = new THREE.Vector3(position[0] + offset, position[1] + height - 0.5, position[2])
      const b = new THREE.Vector3(next[0] + offset, next[1] + height - 0.5, next[2])
      let prev = a.clone()
      for (let i = 1; i <= STEPS; i++) {
        const k = i / STEPS
        const p = a.clone().lerp(b, k)
        p.y -= SAG * 4 * k * (1 - k)
        out.push({
          mid: prev.clone().lerp(p, 0.5),
          len: prev.distanceTo(p),
          dir: p.clone().sub(prev).normalize(),
        })
        prev = p
      }
    }
    return out
  }, [position, next, height])

  return (
    <group>
      <mesh
        geometry={geo.cylinder(8)}
        material={mats.pole}
        position={[position[0], position[1] + height / 2, position[2]]}
        scale={[0.19, height, 0.19]}
        castShadow
      />
      {/* Crossarm, and the two insulator stubs the wires leave from. */}
      <mesh
        geometry={geo.softBox(0.04)}
        material={mats.pole}
        position={[position[0], position[1] + height - 0.5, position[2]]}
        scale={[1.5, 0.13, 0.13]}
        castShadow
      />
      {[-0.62, 0.62].map((x) => (
        <mesh
          key={x}
          geometry={geo.cylinder(6)}
          material={mats.pole}
          position={[position[0] + x, position[1] + height - 0.36, position[2]]}
          scale={[0.07, 0.2, 0.07]}
        />
      ))}
      {spans.map((s, i) => (
        <mesh
          key={i}
          geometry={geo.cylinder(4)}
          material={mats.wire}
          position={[s.mid.x, s.mid.y, s.mid.z]}
          quaternion={new THREE.Quaternion().setFromUnitVectors(up, s.dir)}
          scale={[0.022, s.len, 0.022]}
        />
      ))}
    </group>
  )
})

export { roundedBoxGeometry }
