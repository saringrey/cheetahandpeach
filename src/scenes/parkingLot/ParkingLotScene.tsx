import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SceneKit, Trigger, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import { GrassField } from '../../systems/environment/nature'
import {
  Car,
  Clutter,
  GlowSign,
  SeatedPerson,
  ShoppingCart,
  Streetlight,
  StringLights,
  Stripmall,
  useColliders,
} from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { PettableDog, APOLLO_NAME } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES } from '../../systems/environment/palettes'
import { fbm, clamp01 } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { director } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { CAR_MEMORY, PARKING_LOT, PERSON, type CarMemoryVec3 } from '../../content/characters'
import { APPROACH_SONG, PEACHY_GREETING } from '../../content/finalMessage'
import { audio } from '../../systems/audio/audio'
import { geo, storybook, glow } from '../../utils/assets'
import { runtime } from '../../store/runtime'

const palette = {
  ...PALETTES.parkingLot,
  skyHorizon: PARKING_LOT.skyHorizon,
  skyZenith: PARKING_LOT.skyZenith,
  skyGlow: '#070c19',
  fog: '#08101f',
  fogNear: 12,
  fogFar: 62,
  ambientSky: '#1b2944',
  ambientGround: '#0b0f16',
  ambientIntensity: 0.2,
  sun: '#7898c8',
  sunIntensity: 0.2,
  accentWarm: PARKING_LOT.storeSignColor,
  accentCool: '#89a7d0',
  bloomIntensity: 1.16,
  saturation: -0.16,
}

const LOT_X = 0
const SPACE_W = 3.4
const CAR_SPACE_X = LOT_X - 12 + PARKING_LOT.carSpace * SPACE_W + SPACE_W / 2
const CAR_ROT = 0.16
const CAR_POS: [number, number, number] = [CAR_SPACE_X, 0, CAR_MEMORY.layout.carZ]
const STORE_Z = CAR_MEMORY.layout.storeZ
const ROAD_Z = CAR_MEMORY.layout.roadZ
const STORE_DEPTH = 14
const STORE_HEIGHT = 6.8

/** Transform a point from car-local space into world space. Car front is +Z. */
function carPoint(lx: number, lz: number): [number, number, number] {
  const c = Math.cos(CAR_ROT)
  const sn = Math.sin(CAR_ROT)
  return [CAR_POS[0] + lx * c + lz * sn, 0, CAR_POS[2] - lx * sn + lz * c]
}

function carWorld(point: CarMemoryVec3): [number, number, number] {
  const p = carPoint(point[0], point[2])
  return [p[0], point[1], p[2]]
}

/** Driver door is local -X. */
const DOOR_POS = carPoint(-1.72, 0.18)
const APPROACH_ANGLE = 0.28
const SPAWN_Z = 3.6
const SPAWN_POS: [number, number, number] = [
  DOOR_POS[0] - (SPAWN_Z - DOOR_POS[2]) * Math.tan(APPROACH_ANGLE),
  0,
  SPAWN_Z,
]
// Character facing follows atan2(dx, dz), so 0 points +Z. This points from the
// left-side arrival position diagonally toward the driver door.
const SPAWN_FACING = Math.PI - APPROACH_ANGLE

function inAsphalt(x: number, z: number) {
  return Math.abs(x - LOT_X) < 22 && z < 9.6 && z > -23.2
}

function lotHeight(x: number, z: number) {
  const developed = Math.abs(x) < 31 && z > -40 && z < 22
  if (developed) return 0
  const d = Math.max(0, Math.hypot(x * 0.78, z + 7) - 29)
  return fbm(x * 0.045 + 31, z * 0.045, 2) * 0.72 * clamp01(d / 9) + d * 0.035
}

/** Sparse, tired verge grass around the developed lot and road shoulder. */
function acceptLotGrass(x: number, z: number) {
  const sideVerge = Math.abs(x - LOT_X) > 24.5 && z > -38 && z < 24
  const roadShoulder = z > ROAD_Z + 6.5 && Math.abs(x) > 16
  return sideVerge || roadShoulder
}

const asphaltTints = [
  new THREE.Color('#303640'),
  new THREE.Color('#343a45'),
  new THREE.Color('#3a404a'),
  new THREE.Color('#2c323c'),
]

function lotTint(x: number, z: number) {
  if (!inAsphalt(x, z)) return null
  const n = fbm(x * 0.12 + 19, z * 0.12 - 7, 2)
  return asphaltTints[Math.min(asphaltTints.length - 1, Math.floor(n * asphaltTints.length))]
}

function ParkingLines() {
  const mat = useMemo(() => {
    const m = glow('#d7d4c9', 0.26, false).clone()
    m.transparent = true
    m.opacity = 0.48
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -2
    return m
  }, [])
  const stripes = useMemo(() => {
    const out: { x: number; z: number; rot: number; len: number; width: number }[] = []
    for (let i = 0; i <= 8; i++) {
      out.push({
        x: LOT_X - 12 + i * SPACE_W,
        z: CAR_POS[2],
        rot: 0,
        len: 6.25,
        width: 0.1,
      })
    }
    out.push({ x: LOT_X + 1.6, z: CAR_POS[2] - 3.08, rot: Math.PI / 2, len: 27.5, width: 0.09 })
    return out
  }, [])

  return (
    <group>
      {stripes.map((stripe, i) => (
        <mesh
          key={i}
          geometry={geo.box()}
          material={mat}
          position={[stripe.x, 0.045, stripe.z]}
          rotation={[0, stripe.rot, 0]}
          scale={[stripe.width, 0.01, stripe.len]}
        />
      ))}
    </group>
  )
}

/** Subtle repairs, oil ghosts, and aggregate variation keep asphalt from reading flat. */
function AsphaltDetails() {
  const mats = useMemo(
    () => ({
      patch: storybook({ color: '#252b34', roughness: 1, rim: 0.05 }),
      patchSoft: storybook({ color: '#3e4248', roughness: 1, rim: 0.05 }),
      oil: storybook({ color: '#171d26', roughness: 0.72, metalness: 0.08, rim: 0.08 }),
      sheen: storybook({
        color: '#334052',
        roughness: 0.24,
        metalness: 0.12,
        rim: 0.5,
        rimColor: '#9db4cc',
        transparent: true,
        opacity: 0.36,
      }),
    }),
    [],
  )
  const marks = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => {
        const x = -19 + ((i * 11.7) % 38)
        const z = -20 + ((i * 8.9) % 27)
        return {
          x,
          z,
          w: 0.45 + ((i * 0.37) % 1.5),
          d: 0.28 + ((i * 0.23) % 1.1),
          rot: ((i * 1.71) % 2.4) - 1.2,
          kind:
            i % 7 === 0
              ? 'sheen'
              : i % 6 === 0
                ? 'oil'
                : i % 3 === 0
                  ? 'patchSoft'
                  : 'patch',
        } as const
      }),
    [],
  )

  return (
    <group>
      {marks.map((mark, i) => (
        <mesh
          key={i}
          geometry={geo.softBox(0.08)}
          material={mats[mark.kind]}
          position={[mark.x, 0.025, mark.z]}
          rotation={[0, mark.rot, 0]}
          scale={[mark.w, 0.012, mark.d]}
          receiveShadow
        />
      ))}
    </group>
  )
}

function PlantedIsland({
  position,
  rotation = 0,
}: {
  position: [number, number, number]
  rotation?: number
}) {
  const mats = useMemo(
    () => ({
      curb: storybook({ color: '#85878a', roughness: 0.96, rim: 0.2 }),
      soil: storybook({ color: '#211d19', roughness: 1, rim: 0.08 }),
      shrubA: storybook({ color: '#243d32', roughness: 0.96, rim: 0.24 }),
      shrubB: storybook({ color: '#31483a', roughness: 0.96, rim: 0.26 }),
    }),
    [],
  )
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 2.15, hd: 0.85, rot: rotation }],
    [position[0], position[2], rotation],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={geo.softBox(0.18)} material={mats.curb} position={[0, 0.13, 0]} scale={[4.5, 0.26, 1.9]} castShadow receiveShadow />
      <mesh geometry={geo.softBox(0.2)} material={mats.soil} position={[0, 0.27, 0]} scale={[4.05, 0.12, 1.5]} receiveShadow />
      {[-1.25, -0.45, 0.42, 1.22].map((x, i) => (
        <group key={x} position={[x, 0.38, (i % 2 ? -1 : 1) * 0.18]}>
          <mesh geometry={geo.blob()} material={i % 2 ? mats.shrubA : mats.shrubB} position={[0, 0.22, 0]} scale={[0.52, 0.42, 0.48]} castShadow />
          <mesh geometry={geo.blob()} material={i % 2 ? mats.shrubB : mats.shrubA} position={[0.2, 0.38, 0.06]} scale={[0.34, 0.35, 0.32]} castShadow />
        </group>
      ))}
    </group>
  )
}

function CartCorral() {
  const position: [number, number, number] = [14.6, 0, -14.2]
  const mat = useMemo(
    () => storybook({ color: '#707a87', roughness: 0.42, metalness: 0.48, rim: 0.52 }),
    [],
  )
  useColliders(
    () => [{ kind: 'box', x: position[0], z: position[2], hw: 2.5, hd: 1.45, rot: 0 }],
    [position[0], position[2]],
  )

  return (
    <group position={position}>
      {[-2.35, 2.35].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh geometry={geo.cylinder(8)} material={mat} position={[0, 0.7, -1.25]} scale={[0.07, 1.4, 0.07]} castShadow />
          <mesh geometry={geo.cylinder(8)} material={mat} position={[0, 0.7, 1.25]} scale={[0.07, 1.4, 0.07]} castShadow />
          <mesh geometry={geo.box()} material={mat} position={[0, 0.76, 0]} scale={[0.08, 0.08, 2.5]} castShadow />
        </group>
      ))}
      <mesh geometry={geo.box()} material={mat} position={[0, 1.25, -1.25]} scale={[4.8, 0.08, 0.08]} castShadow />
      <mesh geometry={geo.softBox(0.06)} material={glow('#395678', 0.2, false)} position={[0, 1.55, -1.24]} scale={[1.8, 0.42, 0.05]} />
      <ShoppingCart position={[-1.1, 0, 0.25]} rotation={0.04} />
      <ShoppingCart position={[-0.25, 0, 0.16]} rotation={-0.02} />
      <ShoppingCart position={[0.62, 0, 0.08]} rotation={0.03} />
      <ShoppingCart position={[1.42, 0, -0.02]} rotation={-0.04} />
    </group>
  )
}

function StoreRoofDetails() {
  const mats = useMemo(
    () => ({
      hvac: storybook({ color: '#4b525c', roughness: 0.8, metalness: 0.24, rim: 0.2 }),
      vent: storybook({ color: '#252a31', roughness: 0.72, metalness: 0.32, rim: 0.18 }),
    }),
    [],
  )

  return (
    <group position={[0, 0, STORE_Z]}>
      {[
        [-12, 7.35, -1.8, 3.6, 1.05, 2.4],
        [8.5, 7.2, 1.4, 3.1, 0.82, 2.2],
        [15.5, 7.1, -2.7, 2.3, 0.68, 1.8],
      ].map(([x, y, z, w, h, d], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh geometry={geo.softBox(0.08)} material={mats.hvac} scale={[w, h, d]} castShadow />
          <mesh geometry={geo.cylinder(12)} material={mats.vent} position={[0, h * 0.56, 0]} scale={[0.55, 0.08, 0.55]} />
          {[-0.5, 0, 0.5].map((bar) => (
            <mesh key={bar} geometry={geo.box()} material={mats.vent} position={[bar, h * 0.57 + 0.02, 0]} scale={[0.035, 0.035, 0.9]} />
          ))}
        </group>
      ))}
    </group>
  )
}

function JewelSign() {
  const backing = useMemo(
    () => storybook({ color: '#10090d', roughness: 0.82, metalness: 0.08, rim: 0.12 }),
    [],
  )
  return (
    <group position={[0, STORE_HEIGHT * 0.76, STORE_Z + STORE_DEPTH / 2 + 0.38]}>
      <mesh geometry={geo.softBox(0.06)} material={backing} position={[0, 0, -0.05]} scale={[9.2, 2.25, 0.18]} />
      <GlowSign
        position={[0, 0, 0.08]}
        text={PARKING_LOT.storeSign}
        color={PARKING_LOT.storeSignColor}
        coreColor="#ff4052"
        width={7.7}
        height={1.75}
        light={false}
      />
      <pointLight color={PARKING_LOT.storeSignColor} intensity={3.2} distance={13} decay={2} position={[0, -0.2, 2.2]} />
    </group>
  )
}

function StoreForecourt() {
  const mats = useMemo(
    () => ({
      concrete: storybook({ color: '#5b6067', roughness: 0.98, rim: 0.16 }),
      curb: storybook({ color: '#85888b', roughness: 0.96, rim: 0.2 }),
      bollard: storybook({ color: '#6f2228', roughness: 0.78, metalness: 0.12, rim: 0.22 }),
    }),
    [],
  )
  return (
    <group>
      <mesh geometry={geo.box()} material={mats.concrete} position={[0, 0.045, -23.65]} scale={[45, 0.08, 3.1]} receiveShadow />
      <mesh geometry={geo.softBox(0.1)} material={mats.curb} position={[0, 0.13, -22.05]} scale={[45, 0.25, 0.42]} castShadow receiveShadow />
      {[-2.2, -1.1, 1.1, 2.2].map((x) => (
        <mesh key={x} geometry={geo.cylinder(8)} material={mats.bollard} position={[x, 0.5, -24.2]} scale={[0.14, 1, 0.14]} castShadow />
      ))}
    </group>
  )
}

function RoadAndHorizon() {
  const mats = useMemo(
    () => ({
      road: storybook({ color: '#101722', roughness: 0.97, rim: 0.04 }),
      curb: storybook({ color: '#6e7379', roughness: 0.95, rim: 0.18 }),
      line: glow('#858b91', 0.16, false),
      silhouette: storybook({ color: '#08101b', roughness: 1, rim: 0.02 }),
      window: glow('#5e7188', 0.13, false),
    }),
    [],
  )
  useColliders(() => [{ kind: 'box', x: 0, z: 9.25, hw: 24, hd: 0.25, rot: 0, noCam: true }], [])

  return (
    <group>
      <mesh geometry={geo.box()} material={mats.curb} position={[0, 0.14, 9.4]} scale={[48, 0.27, 0.5]} castShadow receiveShadow />
      <mesh geometry={geo.box()} material={mats.road} position={[0, 0.015, ROAD_Z]} scale={[116, 0.04, 10.8]} receiveShadow />
      {Array.from({ length: 18 }, (_, i) => (
        <mesh
          key={i}
          geometry={geo.box()}
          material={mats.line}
          position={[-51 + i * 6, 0.05, ROAD_Z]}
          scale={[3.2, 0.01, 0.08]}
        />
      ))}
      <mesh geometry={geo.box()} material={mats.curb} position={[0, 0.12, 20.55]} scale={[116, 0.22, 0.36]} />

      {/* Low, nearly black silhouettes make road scale legible without stealing focus. */}
      {[
        [-30, 24.2, 16, 4.8],
        [-9, 24.8, 20, 5.8],
        [14, 24.5, 17, 5.1],
        [34, 24.1, 19, 4.5],
      ].map(([x, z, w, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={geo.box()} material={mats.silhouette} position={[0, h / 2, 0]} scale={[w, h, 5]} />
          {[-0.28, 0, 0.28].map((k) => (
            <mesh key={k} geometry={geo.box()} material={mats.window} position={[k * w, h * 0.58, -2.52]} scale={[1.1, 0.18, 0.04]} />
          ))}
        </group>
      ))}
    </group>
  )
}

/** A couple of ordinary cars left under the closed-store lights. */
function ParkedVehicle({
  position,
  rotation = 0,
  color,
  size = 'sedan',
}: {
  position: [number, number, number]
  rotation?: number
  color: string
  size?: 'compact' | 'sedan'
}) {
  const dims = size === 'compact'
    ? { width: 1.68, length: 3.55, height: 0.54 }
    : { width: 1.84, length: 4.25, height: 0.62 }
  const mats = useMemo(
    () => ({
      body: storybook({ color, roughness: 0.58, metalness: 0.18, rim: 0.28 }),
      glass: storybook({
        color: '#111a25',
        roughness: 0.16,
        metalness: 0.08,
        rim: 0.48,
        rimColor: '#70839a',
      }),
      tyre: storybook({ color: '#101216', roughness: 0.98, rim: 0.06 }),
    }),
    [color],
  )
  useColliders(
    () => [{
      kind: 'box',
      x: position[0],
      z: position[2],
      hw: dims.width * 0.54,
      hd: dims.length * 0.54,
      rot: rotation,
    }],
    [position[0], position[2], rotation, dims.width, dims.length],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh
        geometry={geo.softBox(0.12)}
        material={mats.body}
        position={[0, 0.62, 0]}
        scale={[dims.width, dims.height, dims.length]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={geo.softBox(0.16)}
        material={mats.glass}
        position={[0, 1.02, -0.08]}
        scale={[dims.width * 0.76, dims.height * 0.68, dims.length * 0.46]}
      />
      {[-1, 1].flatMap((side) =>
        [-1, 1].map((end) => (
          <mesh
            key={`${side}-${end}`}
            geometry={geo.cylinder(10)}
            material={mats.tyre}
            position={[side * dims.width * 0.5, 0.32, end * dims.length * 0.31]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[0.3, 0.14, 0.3]}
          />
        )),
      )}
    </group>
  )
}

interface TrafficVehicleState {
  active: boolean
  x: number
  speed: number
  dir: -1 | 1
  audioStarted: boolean
  reported: boolean
}

const TRAFFIC_SHAPES = [
  { width: 1.7, length: 3.6, height: 0.55, cabin: 1.7, color: '#26364c', head: '#f3f7ff', tail: '#f0444e' },
  { width: 1.9, length: 4.3, height: 0.68, cabin: 2.1, color: '#3b3035', head: '#fff1cf', tail: '#df2838' },
  { width: 1.76, length: 3.9, height: 0.6, cabin: 1.85, color: '#303b37', head: '#dbe8ff', tail: '#ff5960' },
  { width: 2.02, length: 4.7, height: 0.8, cabin: 2.45, color: '#242a33', head: '#f8e8c8', tail: '#c92835' },
] as const

/** Seconds the camera spends travelling to the windshield in the callback. */
const WINDSHIELD_MOVE_SECONDS = 1.8
/** Extra grace after the move before a pass may count, so the frame is calm. */
const WINDSHIELD_SETTLE_MS = 420
/** Quiet inside-car hold before Peach may speak, even if traffic arrives early. */
export const OPENING_SILENCE_MS = 6_200
/** Start the stereo pass before screen center so sound and picture arrive together. */
const TRAFFIC_AUDIO_LEAD_X = 18

/** Fixed pool: refs mutate in useFrame; React never receives frame state. */
function RoadTraffic({
  inside,
  callbackFocus,
  callbackArmed,
  onInteriorPass,
}: {
  inside: boolean
  callbackFocus: boolean
  /** True once the windshield camera has settled and a pass may be counted. */
  callbackArmed: boolean
  onInteriorPass: () => void
}) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const states = useRef<TrafficVehicleState[]>(
    TRAFFIC_SHAPES.map(() => ({
      active: false,
      x: 0,
      speed: 0,
      dir: 1,
      audioStarted: false,
      reported: false,
    })),
  )
  const logic = useRef({ inside, next: 0.35, sequence: 0, cursor: 0, runUp: 42 })
  const passCallback = useRef(onInteriorPass)
  passCallback.current = onInteriorPass

  const mats = useMemo(
    () => ({
      bodies: TRAFFIC_SHAPES.map((shape) =>
        storybook({ color: shape.color, roughness: 0.62, metalness: 0.18, rim: 0.28 }),
      ),
      glass: storybook({ color: '#111c2a', roughness: 0.12, metalness: 0.08, rim: 0.58, rimColor: '#7388a2' }),
      tyre: storybook({ color: '#101216', roughness: 0.96, rim: 0.08 }),
      heads: TRAFFIC_SHAPES.map((shape, i) => glow(shape.head, 0.72 + i * 0.08)),
      tails: TRAFFIC_SHAPES.map((shape, i) => glow(shape.tail, 0.68 + i * 0.07)),
    }),
    [],
  )

  useEffect(() => {
    const current = logic.current
    const enteringCabin = inside && !current.inside
    current.inside = inside
    if (!enteringCabin) return
    // Do not reset the road when the camera crosses the door. A car already in
    // flight remains in flight, and another starts close enough to be present
    // during the first silence inside.
    current.next = Math.min(current.next, 0.18)
    current.runUp = 28
  }, [inside])

  useEffect(() => {
    runtime.trafficPasses = 0
  }, [])

  // Entering the callback clears the road completely and stops spawning. Any car
  // still crossing belongs to the previous beat, and letting it finish would end
  // the shot before the camera had even arrived.
  useEffect(() => {
    if (!callbackFocus || !logic.current.inside) return
    states.current.forEach((vehicle, i) => {
      vehicle.active = false
      vehicle.audioStarted = false
      vehicle.reported = false
      const group = refs.current[i]
      if (group) group.visible = false
    })
    logic.current.next = Number.POSITIVE_INFINITY
  }, [callbackFocus])

  // Armed: send exactly one car, from a short run-up so it arrives while the
  // shot is still fresh rather than several seconds into a static frame.
  useEffect(() => {
    if (!callbackArmed || !logic.current.inside) return
    logic.current.runUp = 30
    logic.current.next = 0.3
  }, [callbackArmed])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const current = logic.current

    states.current.forEach((vehicle, i) => {
      if (!vehicle.active) return
      const group = refs.current[i]
      if (!group) return
      vehicle.x += vehicle.speed * vehicle.dir * dt
      group.position.x = vehicle.x

      const reachedAudioLead =
        !vehicle.audioStarted &&
        ((vehicle.dir === 1 && vehicle.x >= -TRAFFIC_AUDIO_LEAD_X) ||
          (vehicle.dir === -1 && vehicle.x <= TRAFFIC_AUDIO_LEAD_X))
      if (reachedAudioLead) {
        vehicle.audioStarted = true
        audio.trafficPass({
          direction: vehicle.dir,
          distance: current.inside ? 0.38 : 0.7,
          speed: vehicle.speed / 12,
        })
      }

      const reachedCenter =
        !vehicle.reported &&
        ((vehicle.dir === 1 && vehicle.x >= 0) || (vehicle.dir === -1 && vehicle.x <= 0))
      if (reachedCenter) {
        vehicle.reported = true
        runtime.trafficPasses += 1
        if (current.inside) passCallback.current()
      }

      if (Math.abs(vehicle.x) > 58) {
        vehicle.active = false
        group.visible = false
      }
    })

    current.next -= dt
    if (current.next > 0) return

    let slot = -1
    for (let offset = 0; offset < states.current.length; offset++) {
      const i = (current.cursor + offset) % states.current.length
      if (!states.current[i].active) {
        slot = i
        break
      }
    }
    if (slot < 0) {
      current.next = 1.2
      return
    }

    current.cursor = (slot + 1) % states.current.length
    const vehicle = states.current[slot]
    const group = refs.current[slot]
    const dir: -1 | 1 =
      current.sequence < 2 ? (current.sequence % 2 === 0 ? 1 : -1) : Math.random() > 0.5 ? 1 : -1
    const runUp = current.runUp
    current.runUp = 54
    vehicle.active = true
    vehicle.dir = dir
    vehicle.x = dir === 1 ? -runUp : runUp
    vehicle.speed = 10.5 + ((slot * 2.7 + Math.random() * 4.2) % 7.5)
    vehicle.audioStarted = false
    vehicle.reported = false

    if (group) {
      group.visible = true
      group.position.set(vehicle.x, 0.56, ROAD_Z + (dir === 1 ? -1.65 : 1.65))
      group.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2
    }

    current.sequence += 1
    current.next = current.inside
      ? current.sequence === 1
        ? 5.2
        : 13 + Math.random() * 18
      : 10 + Math.random() * 17
  })

  return (
    <group>
      {TRAFFIC_SHAPES.map((shape, i) => (
        <group
          key={i}
          ref={(node) => {
            refs.current[i] = node
          }}
          visible={false}
        >
          <mesh geometry={geo.softBox(0.12)} material={mats.bodies[i]} position={[0, 0, 0]} scale={[shape.width, shape.height, shape.length]} />
          <mesh geometry={geo.softBox(0.18)} material={mats.glass} position={[0, shape.height * 0.72, -0.1]} scale={[shape.width * 0.78, shape.height * 0.72, shape.cabin]} />
          {[-1, 1].flatMap((side) =>
            [-1, 1].map((end) => (
              <mesh
                key={`wheel-${side}-${end}`}
                geometry={geo.cylinder(10)}
                material={mats.tyre}
                position={[side * shape.width * 0.5, -shape.height * 0.3, end * shape.length * 0.3]}
                rotation={[0, 0, Math.PI / 2]}
                scale={[0.33, 0.16, 0.33]}
              />
            )),
          )}
          {[-1, 1].map((side) => (
            <mesh
              key={`head-${side}`}
              geometry={geo.softBox(0.03)}
              material={mats.heads[i]}
              position={[side * shape.width * 0.3, 0.04, shape.length * 0.51]}
              scale={[0.28, 0.12, 0.04]}
            />
          ))}
          {[-1, 1].map((side) => (
            <mesh
              key={`tail-${side}`}
              geometry={geo.softBox(0.03)}
              material={mats.tails[i]}
              position={[side * shape.width * 0.3, 0.04, -shape.length * 0.51]}
              scale={[0.24, 0.11, 0.04]}
            />
          ))}
        </group>
      ))}
    </group>
  )
}

/** A folded newspaper catches tiny gusts, then quietly loops beyond the frame. */
function DriftingNewspaper() {
  const ref = useRef<THREE.Group>(null)
  const elapsed = useRef(Math.random() * 20)
  const mat = useMemo(
    () => storybook({ color: '#c9cbd0', roughness: 0.96, rim: 0.3, side: THREE.DoubleSide }),
    [],
  )
  useFrame((state, rawDt) => {
    const paper = ref.current
    if (!paper) return
    elapsed.current += Math.min(rawDt, 0.05)
    const k = (elapsed.current % 28) / 28
    paper.position.set(-18 + k * 37, 0.08 + Math.abs(Math.sin(k * 38)) * 0.14, -2.2 - k * 3.4)
    paper.rotation.set(state.clock.elapsedTime * 1.7, k * 8.5, 0.36)
  })
  return (
    <group ref={ref}>
      <mesh geometry={geo.plane()} material={mat} rotation={[0, 0.08, -0.06]} scale={[0.32, 0.24, 1]} />
      <mesh geometry={geo.plane()} material={mat} position={[0.21, 0.01, 0]} rotation={[0, -0.12, 0.08]} scale={[0.26, 0.22, 1]} />
    </group>
  )
}

type EndingStage =
  | 'roam'
  | 'noticed'
  | 'entering'
  | 'quietInterior'
  | 'conversation'
  | 'message'
  | 'afterglow'

function isInteriorStage(stage: EndingStage) {
  return (
    stage === 'quietInterior' ||
    stage === 'conversation' ||
    stage === 'message' ||
    stage === 'afterglow'
  )
}

function parkingScoreIntensity(stage: EndingStage, approachPlaying: boolean) {
  if (approachPlaying) return isInteriorStage(stage) ? 0.24 : 0.12
  return isInteriorStage(stage) ? 0.78 : 1
}

export function ParkingLotScene() {
  const markReachedParkingLot = useGame((state) => state.markReachedParkingLot)
  const setEndingActive = useGame((state) => state.setEndingActive)
  const endingCallbackReady = useGame((state) => state.endingCallbackReady)
  const endingCallbackDone = useGame((state) => state.endingCallbackDone)
  const setEndingCallbackDone = useGame((state) => state.setEndingCallbackDone)
  const persist = useGame((state) => state.persist)
  const dialogue = useGame((state) => state.dialogue)

  const [stage, setStage] = useState<EndingStage>('roam')
  const [doorOpen, setDoorOpen] = useState(0)
  const [offering, setOffering] = useState(false)
  const [trafficPasses, setTrafficPasses] = useState(0)
  const [openingSilenceReady, setOpeningSilenceReady] = useState(false)
  const [conversationClosed, setConversationClosed] = useState(false)
  const [callbackFocus, setCallbackFocus] = useState(false)
  const [drizzle, setDrizzle] = useState(false)
  /**
   * Counting is armed separately from the camera move.
   *
   * A car already in flight when the callback began used to cross the road
   * centre and be counted as "the" pass, cutting the 1.8 s windshield move short
   * — the whole point of the shot is that she sees the mugs on the dash AND a car
   * go by, and that needs the camera to have arrived first.
   */
  const [callbackArmed, setCallbackArmed] = useState(false)

  const alive = useRef(true)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const conversationStarted = useRef(false)
  const callbackStarted = useRef(false)
  const callbackReturning = useRef(false)
  const callbackPassStart = useRef(0)
  /** Same count as `trafficPasses`, readable synchronously when arming. */
  const trafficPassCount = useRef(0)
  const openingPassStart = useRef(0)
  const conversationPassStart = useRef(0)
  const stageRef = useRef<EndingStage>(stage)
  const approachPlaying = useRef(false)
  stageRef.current = stage

  const inside = isInteriorStage(stage)

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id)
      if (alive.current) fn()
    }, delayMs)
    timers.current.add(id)
    return id
  }, [])

  useEffect(() => {
    alive.current = true
    const ownedTimers = timers.current
    return () => {
      alive.current = false
      ownedTimers.forEach(clearTimeout)
      ownedTimers.clear()
      runtime.holdControl('ending', false)
      if (conversationStarted.current) useGame.getState().endDialogue()
    }
  }, [])

  const syncApproachMix = useCallback((playing: boolean) => {
    approachPlaying.current = playing
    audio.setMusicIntensity(parkingScoreIntensity(stageRef.current, playing))
  }, [])

  // Audio owns the instant of arrival. The camera intro deliberately waits
  // 350 ms, but APPROACH begins as soon as this scene mounts. The keyed audio
  // engine makes StrictMode's repeated effect setup harmless. The song plays
  // as the car's radio: born muffled, opened up by the proximity drive below.
  useEffect(() => {
    let entryActive = true
    void audio.music('lot')
    void audio.playOptional(APPROACH_SONG, 'music', {
      radio: true,
      loop: true,
      onEnded: () => {
        if (alive.current) syncApproachMix(false)
      },
    }).then((played) => {
      if (entryActive && alive.current) syncApproachMix(played)
    })
    return () => {
      entryActive = false
    }
  }, [syncApproachMix])

  // The radio sounds like a radio: across the lot it is a dull murmur behind
  // glass, and every step toward the car opens the filter until, inside, the
  // song is simply present in the cabin with her.
  useFrame(() => {
    const dx = runtime.playerPos.x - CAR_POS[0]
    const dz = runtime.playerPos.z - CAR_POS[2]
    const distance = Math.hypot(dx, dz)
    const proximity =
      isInteriorStage(stageRef.current) || stageRef.current === 'entering'
        ? 1
        : 1 - clamp01((distance - 4) / 34)
    audio.setOptionalProximity(APPROACH_SONG, 'music', proximity)
  })

  // Ten quiet seconds after arrival, a drizzle starts — the sky agreeing that
  // this is the kind of night it is.
  useEffect(() => {
    schedule(() => setDrizzle(true), 10_000)
  }, [schedule])

  useSceneIntro(() => {
    markReachedParkingLot()
    persist()
    void director.play(
      [
        { pos: [10.5, 5.2, 11.5], look: [0, 2.1, -17], duration: 0.1, fov: 52 },
        {
          pos: [SPAWN_POS[0] - 2.2, 3.15, SPAWN_POS[2] + 6.6],
          look: [CAR_POS[0], 1.2, CAR_POS[2] - 1],
          duration: 3.4,
          ease: 'smoother',
          fov: 55,
        },
      ],
      { skipAfter: 0.65 },
    )
  }, 0.35)

  const onNoticed = useCallback(() => {
    if (stage !== 'roam') return
    setStage('noticed')
    audio.cue('chime')
  }, [stage])

  const onGetIn = useCallback(() => {
    if (stage === 'entering' || inside) return
    setStage('entering')
    runtime.holdControl('ending', true)
    useGame.getState().setPrompt(null)

    const conversationCamera = CAR_MEMORY.cameras.conversation
    const conversationPos = carWorld(conversationCamera.position)
    const conversationLook = carWorld(conversationCamera.lookAt)

    schedule(() => {
      setDoorOpen(1)
      audio.cue('carDoor')
    }, 520)
    schedule(() => {
      setDoorOpen(0)
      audio.cue('doorClose')
    }, 4_350)

    void director
      .play(
        [
          {
            pos: carWorld([-3.8, 1.72, 1.55]),
            look: carWorld([-0.65, 1.08, 0.1]),
            duration: 0.1,
            fov: 52,
          },
          {
            pos: carWorld([-2.35, 1.48, 0.72]),
            look: carWorld([-0.54, 1.1, -0.1]),
            duration: 1.45,
            ease: 'smoother',
            fov: 49,
          },
          {
            pos: carWorld([-1.18, 1.42, -0.12]),
            look: carWorld([-0.2, 1.22, 0.5]),
            duration: 1.55,
            ease: 'smoother',
            fov: 47,
          },
          {
            pos: conversationPos,
            look: conversationLook,
            duration: 2.2,
            ease: 'smoother',
            fov: conversationCamera.fov,
          },
        ],
        { unskippable: true, returnTime: 0.5 },
      )
      .then((result) => {
        if (result === 'cancelled') return
        if (!alive.current) return
        openingPassStart.current = trafficPassCount.current
        setStage('quietInterior')
        void audio.ambience('car', 2.4)
        void audio.music('ending', 6, approachPlaying.current ? 0.24 : 0.78)

        // She is in, beside him. The camera simply stays here — looking at
        // Peach — for the whole conversation and note. No mid-scene reframe:
        // the one thing this moment should not do is move around.
        void director.play(
          [
            {
              pos: conversationPos,
              look: conversationLook,
              duration: 0.1,
              fov: conversationCamera.fov,
            },
            {
              pos: conversationPos,
              look: conversationLook,
              duration: 300,
              ease: 'linear',
              fov: conversationCamera.fov,
            },
          ],
          { unskippable: true, returnTime: 1.2 },
        )

        schedule(() => {
          setOpeningSilenceReady(true)
        }, OPENING_SILENCE_MS)
      })
  }, [inside, schedule, stage])

  useEffect(() => {
    if (
      stage !== 'quietInterior' ||
      !openingSilenceReady ||
      trafficPasses <= openingPassStart.current ||
      conversationStarted.current
    ) {
      return
    }
    conversationStarted.current = true
    conversationPassStart.current = trafficPassCount.current
    setStage('conversation')
    useGame.getState().startDialogue(
      PEACHY_GREETING.map((text) => ({ speaker: PERSON.displayName, text })),
    )
  }, [openingSilenceReady, stage, trafficPasses])

  useEffect(() => {
    if (stage !== 'conversation' || !conversationStarted.current || dialogue) return
    setConversationClosed(true)
  }, [dialogue, stage])

  useEffect(() => {
    if (
      stage !== 'conversation' ||
      !conversationClosed ||
      trafficPasses <= conversationPassStart.current
    ) {
      return
    }
    setStage('message')
    setOffering(true)
    audio.cue('memory')
    setEndingActive(true)
  }, [conversationClosed, setEndingActive, stage, trafficPasses])

  useEffect(() => {
    if (
      !endingCallbackReady ||
      endingCallbackDone ||
      stage !== 'message' ||
      callbackStarted.current
    ) {
      return
    }

    callbackStarted.current = true
    setStage('afterglow')
    setCallbackFocus(true)

    const final = CAR_MEMORY.cameras.final
    const finalPos = carWorld(final.position)
    const finalLook = carWorld(final.lookAt)
    const windshieldPos = carWorld([0, 1.43, -0.72])
    const roadLook = carWorld([0, 1.05, 12])
    void director.play(
      [
        { pos: finalPos, look: finalLook, duration: 0.1, fov: final.fov },
        {
          pos: windshieldPos,
          look: roadLook,
          duration: WINDSHIELD_MOVE_SECONDS,
          ease: 'smoother',
          fov: 68,
        },
        { pos: windshieldPos, look: roadLook, duration: 300, ease: 'linear', fov: 68 },
      ],
      { unskippable: true, returnTime: 0.4 },
    )

    // Arm only once the windshield framing has settled, and take the pass
    // baseline THEN — not now — so a car that was already halfway across when
    // the callback started cannot be mistaken for the one she watches go by.
    schedule(() => {
      callbackPassStart.current = trafficPassCount.current
      setCallbackArmed(true)
    }, WINDSHIELD_MOVE_SECONDS * 1000 + WINDSHIELD_SETTLE_MS)
  }, [endingCallbackDone, endingCallbackReady, schedule, stage])

  useEffect(() => {
    if (
      !callbackFocus ||
      !callbackArmed ||
      endingCallbackDone ||
      trafficPasses <= callbackPassStart.current ||
      callbackReturning.current
    ) {
      return
    }

    callbackReturning.current = true
    const final = CAR_MEMORY.cameras.final
    const finalPos = carWorld(final.position)
    const finalLook = carWorld(final.lookAt)
    const windshieldPos = carWorld([0, 1.43, -0.72])
    const roadLook = carWorld([0, 1.05, 12])

    void director
      .play(
        [
          { pos: windshieldPos, look: roadLook, duration: 0.1, fov: 68 },
          { pos: windshieldPos, look: roadLook, duration: 2.2, ease: 'linear', fov: 68 },
          { pos: finalPos, look: finalLook, duration: 2.6, ease: 'smoother', fov: final.fov },
        ],
        { unskippable: true, returnTime: 0.08 },
      )
      .then((result) => {
        if (result === 'cancelled') return
        if (!alive.current) return
        setCallbackFocus(false)
        setEndingCallbackDone(true)
        void director.play(
          [
            { pos: finalPos, look: finalLook, duration: 0.1, fov: final.fov },
            { pos: finalPos, look: finalLook, duration: 300, ease: 'linear', fov: final.fov },
          ],
          { unskippable: true, returnTime: 0.4 },
        )
      })
  }, [
    callbackArmed,
    callbackFocus,
    endingCallbackDone,
    setEndingCallbackDone,
    trafficPasses,
  ])

  const noticedOrLater = stage !== 'roam'

  return (
    <SceneKit
      chapter="parkingLot"
      palette={palette}
      height={lotHeight}
      bounds={{ minX: -23, maxX: 23, minZ: -24.6, maxZ: 9.05 }}
      spawn={{ position: SPAWN_POS, facing: SPAWN_FACING }}
      ambience="parkingLot"
      music="lot"
      stars={0.94}
      wind={0.28}
      surface="asphalt"
      withCharacter={!inside && stage !== 'entering'}
      guideAfter={0}
      mist={0.72}
      mistColor="#111c30"
      mistHeight={0.62}
      shadowRadius={42}
      fogLayer={12}
      fogGround={0.58}
      volumetricLight={0.075}
    >
      <CameraFraming distance={inside ? 5.2 : 5.48} lookHeight={inside ? 0.9 : 1.23} />

      <Terrain
        height={lotHeight}
        width={120}
        depth={74}
        center={[0, -5]}
        step={1.7}
        palette={palette}
        tint={lotTint}
      />
      <GrassField
        count={900}
        center={[0, -5]}
        size={[108, 66]}
        height={lotHeight}
        accept={acceptLotGrass}
        colorA="#586452"
        colorB="#38443b"
        seed={191}
        bladeHeight={0.3}
        sway={0.08}
      />
      <AsphaltDetails />
      <ParkingLines />
      <StoreForecourt />
      <RoadAndHorizon />

      <Stripmall
        position={[LOT_X, 0, STORE_Z]}
        width={46}
        height={STORE_HEIGHT}
        depth={STORE_DEPTH}
        wall="#202630"
        glass="#101827"
        signText=""
        signColor={PARKING_LOT.storeSignColor}
        closed
      />
      <JewelSign />
      <StoreRoofDetails />

      <PlantedIsland position={[-15.7, 0, -1.5]} rotation={0.04} />
      <PlantedIsland position={[15.6, 0, 1.1]} rotation={-0.05} />
      <CartCorral />
      <ParkedVehicle position={[-19.1, 0, -20]} rotation={0.05} color="#313843" />
      <ParkedVehicle position={[19.2, 0, -9.2]} rotation={-0.08} color="#4b3738" size="compact" />
      <PettableDog id="durk-lot" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[11.2, 0, -15.8]} rotation={1.35} behavior="sleep" seed={79} />
      <PettableDog id="apollo-lot" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[-12.6, 0, -18.4]} rotation={-0.6} behavior="sleep" seed={80} />

      <Streetlight position={[-12.2, 0, 1.8]} color={PARKING_LOT.lampColor} on realLight intensity={26} flicker={false} />
      <Streetlight position={[6.8, 0, -7]} color={PARKING_LOT.lampColor} on realLight intensity={30} flicker={false} />
      <Streetlight position={[17.2, 0, -16.4]} color={PARKING_LOT.lampColor} on />
      <Streetlight position={[-17.8, 0, -17.2]} color={PARKING_LOT.lampColor} on flicker={false} />
      <Streetlight position={[-18.6, 0, 12.4]} color="#c7d7ee" on realLight intensity={11} flicker={false} />
      <Streetlight position={[18.2, 0, 18.1]} color="#c7d7ee" on />
      <Streetlight position={[-9.4, 0, 14.6]} color="#c7d7ee" on flicker={false} />
      <Streetlight position={[9.8, 0, 15.2]} color={PARKING_LOT.lampColor} on />

      {/* A lot that has been used: a second corral of carts drifted out of line,
          bins against the storefront, stacked pallets, a cart abandoned in a bay.
          None of it is interactive — it is here so the last place in the game is
          somewhere real rather than a stage with one car on it. */}
      {/* Well out of the arrival sightline. At (-6.2, 4.8) this cart sat seven
          metres in front of her the moment the chapter opened and, catching the
          rim light side-on, read as a bright slab floating over the asphalt — the
          first thing anyone saw in the last chapter of the game. */}
      <ShoppingCart position={[-15.2, 0, 6.4]} rotation={1.9} />
      <ShoppingCart position={[12.6, 0, -8.4]} rotation={-0.7} />
      <ShoppingCart position={[-11.4, 0, -12.2]} rotation={2.6} />
      <Clutter position={[-19.2, 0, -9.6]} rotation={0.4} seed={41} />
      <Clutter position={[19.4, 0, -6.2]} rotation={-1.3} seed={42} />
      <Clutter position={[-4.4, 0, STORE_Z + 8.6]} rotation={1.6} seed={43} />
      <Clutter position={[6.8, 0, STORE_Z + 8.2]} rotation={-0.5} seed={44} />

      {/* Bulbs still strung along the shopfront canopy from some promotion that
          ended. Half of them are dead, which is the point. */}
      <StringLights from={[-13, STORE_Z + 8.9]} to={[-1, STORE_Z + 8.9]} height={4.1} sag={0.5} count={9} color="#e8d9c0" lit={false} posts={false} />
      <StringLights from={[1, STORE_Z + 8.9]} to={[13, STORE_Z + 8.9]} height={4.1} sag={0.5} count={9} color="#ffd8a0" posts={false} />

      <Particles kind="moth" count={6} center={[8.7, 6.4, -1.2]} size={[3, 1.4, 3]} seed={171} />
      <Particles kind="dust" count={18} center={[0, 1.25, -5]} size={[42, 2.5, 29]} seed={179} opacity={0.2} />
      <Particles kind="leaf" count={7} center={[0, 1.1, -6]} size={[34, 2, 25]} color="#5a5560" seed={177} />
      {drizzle ? (
        <Particles
          kind="rain"
          count={240}
          followPlayer
          center={[0, 4.5, 0]}
          size={[30, 12, 30]}
          seed={183}
          opacity={0.26}
        />
      ) : null}

      <RoadTraffic
        inside={inside}
        callbackFocus={callbackFocus}
        callbackArmed={callbackArmed}
        onInteriorPass={() => {
          trafficPassCount.current += 1
          setTrafficPasses((count) => count + 1)
        }}
      />
      <DriftingNewspaper />

      <Interactable
        id="lot-lamp"
        verb="inspect"
        label="the streetlight"
        position={[6.8, 0, -7]}
        radius={2.4}
        enabled={() => !inside}
        onInteract={() => useGame.getState().startDialogue(getDialogue('lot.lamp'))}
      />

      {/* Empty outside. Cheetah appears driver-side only after cabin transition. */}
      <Car
        position={CAR_POS}
        rotation={CAR_ROT}
        interiorLightOn={doorOpen > 0.05}
        driverDoorOpen={doorOpen}
        showDashboardPeach={CAR_MEMORY.dashboard.showPeach}
        showMirrorCharm={CAR_MEMORY.mirror.showCharm}
        instrumentGlow={CAR_MEMORY.dashboard.instrumentGlow}
        dashboardGlowColor={CAR_MEMORY.dashboard.glowColor}
        showDashboardMugs={stage === 'afterglow'}
      />

      {inside ? (
        <group position={[CAR_POS[0], 0.72, CAR_POS[2]]} rotation={[0, CAR_ROT, 0]}>
          {/* Cheetah is now the camera. Rendering her whole seated model would put
              geometry inside the first-person eye line and turn the sit-down into
              an invisible back-seat shot. */}
          <group
            position={[
              (CAR_MEMORY.driver === 'person' ? -1 : 1) *
                Math.abs(CAR_MEMORY.seats.person.position[0]),
              CAR_MEMORY.seats.person.position[1],
              CAR_MEMORY.seats.person.position[2],
            ]}
            rotation={[0, CAR_MEMORY.seats.person.rotation, 0]}
            scale={0.66}
          >
            <SeatedPerson
              position={[0, 0, 0]}
              turnToward={
                stage === 'quietInterior'
                  ? -0.16
                  : stage === 'conversation'
                    ? -0.84
                    : -0.56
              }
              warmth={
                stage === 'conversation'
                  ? 0.72
                  : stage === 'message' || stage === 'afterglow'
                    ? 0.42
                    : 0.08
              }
            />
          </group>

          {offering ? (
            <mesh
              geometry={geo.softBox(0.02)}
              material={glow('#f6ecd8', 0.88)}
              position={[0.12, 0.91, 0.16]}
              rotation={[0.48, -0.15, -0.1]}
              scale={[0.26, 0.018, 0.19]}
            />
          ) : null}

          {CAR_MEMORY.mirror.showReflection ? (
            <group position={[0, 0.86, 0.53]} rotation={[0, Math.PI, 0]} scale={[0.065, 0.065, 0.065]}>
              <GlowSign
                position={[0, 0, 0]}
                text={
                  CAR_MEMORY.mirror.reverseText
                    ? CAR_MEMORY.mirror.reflectionText.split('').reverse().join('')
                    : CAR_MEMORY.mirror.reflectionText
                }
                color={PARKING_LOT.storeSignColor}
                coreColor="#ff4052"
                width={6.4}
                height={1.45}
                light={false}
              />
            </group>
          ) : null}
        </group>
      ) : null}

      <Trigger
        position={[CAR_POS[0], 0, CAR_POS[2]]}
        radius={8.8}
        enabled={stage === 'roam'}
        onEnter={onNoticed}
      />

      <Interactable
        id="get-in"
        verb="enter"
        position={DOOR_POS}
        radius={3.6}
        priority={-2}
        enabled={() => noticedOrLater && !inside && stage !== 'entering'}
        onInteract={onGetIn}
      />

      {stage === 'message' || stage === 'afterglow' ? <WindshieldConstellation /> : null}
    </SceneKit>
  )
}

function WindshieldConstellation() {
  const mat = useMemo(() => glow('#ffd9b8', 0.34, false), [])
  const points = useMemo(() => {
    const cheetah: [number, number][] = [
      [-0.95, 0.15],
      [-0.62, 0.3],
      [-0.2, 0.42],
      [0.28, 0.36],
      [0.66, 0.5],
      [0.95, 0.78],
    ]
    return cheetah.map(([x, y]) => {
      const local = carPoint(x * 0.55, 1.35)
      return [local[0], 1.45 + y * 0.2, local[2]] as [number, number, number]
    })
  }, [])

  return (
    <group>
      {points.map((point, i) => (
        <mesh key={i} geometry={geo.sphere(6)} material={mat} position={point} scale={0.022} />
      ))}
    </group>
  )
}
