import { useMemo, useState, useCallback, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { SceneKit, Trigger, useObjective, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import { Clouds } from '../../systems/environment/Environment'
import {
  TreeField,
  GrassField,
  FlowerField,
  RockField,
  BushField,
  FernField,
  LogField,
  MushroomField,
  LightShafts,
  type TreeSpec,
} from '../../systems/environment/nature'
import {
  Silhouette,
  Lantern,
  Woodpile,
  Clutter,
  Planter,
  Fence,
  Bed,
  Desk,
  CurtainWindow,
  PictureFrame,
  PeachObject,
  CheetahFigure,
  useColliders,
} from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { Birds, Butterflies, PettableDog, APOLLO_NAME } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES } from '../../systems/environment/palettes'
import { mulberry32, fbm, distToPath } from '../../utils/math'
import { runtime } from '../../store/runtime'
import { useGame } from '../../store/gameStore'
import { director } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { OPENING_LINE, CHAPTER_TITLES } from '../../content/gameContent'
import { audio } from '../../systems/audio/audio'
import { geo, storybook, glow } from '../../utils/assets'

const palette = PALETTES.cottage

/** How long she is alone in the yard before the figure comes. */
const SILHOUETTE_DELAY_MS = 20_000

/**
 * Layout: the bedroom interior sits at the origin. The yard is south (+Z), and
 * the road to town runs east (+X) toward the trigger at x≈46.
 */

const PATH: [number, number][] = [
  [3.2, 8],
  [12, 10],
  [24, 9],
  [36, 7.5],
  [48, 7],
]

type StaticBox = {
  position: [number, number, number]
  scale: [number, number, number]
  rotation?: [number, number, number]
}

const box = (
  position: [number, number, number],
  scale: [number, number, number],
  rotation?: [number, number, number],
): StaticBox => ({ position, scale, rotation })

const FLOOR_PLANKS_A = Array.from({ length: 7 }, (_, i) =>
  box([-2.875 + i * 0.88, 0.105, (i % 3 - 1) * 0.018], [0.415, 0.012, 6.28]),
)
const FLOOR_PLANKS_B = Array.from({ length: 7 }, (_, i) =>
  box([-2.435 + i * 0.88, 0.105, ((i + 1) % 3 - 1) * 0.018], [0.415, 0.012, 6.28]),
)

const WALL_PANELS: StaticBox[] = [
  box([0, 0.57, -3.045], [6.12, 0.9, 0.045]),
  box([-3.045, 0.57, 0], [0.045, 0.9, 6.12]),
  box([3.045, 0.57, 0], [0.045, 0.9, 6.12]),
  box([-2.025, 0.57, 3.045], [2.42, 0.9, 0.045]),
  box([2.025, 0.57, 3.045], [2.42, 0.9, 0.045]),
]

const WALL_TRIM: StaticBox[] = [
  // Baseboard, chair rail, and crown around the full interior.
  ...[0.15, 1.02, 2.88].flatMap((y) => [
    box([0, y, -3.01], [6.2, y === 2.88 ? 0.12 : 0.09, 0.075]),
    box([-3.01, y, 0], [0.075, y === 2.88 ? 0.12 : 0.09, 6.2]),
    box([3.01, y, 0], [0.075, y === 2.88 ? 0.12 : 0.09, 6.2]),
    box([-2.025, y, 3.01], [2.45, y === 2.88 ? 0.12 : 0.09, 0.075]),
    box([2.025, y, 3.01], [2.45, y === 2.88 ? 0.12 : 0.09, 0.075]),
  ]),
  // Shallow wainscot stiles.
  ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => box([x, 0.57, -2.995], [0.055, 0.74, 0.055])),
  ...[-2.2, -1.1, 0, 1.1, 2.2].flatMap((z) => [
    box([-2.995, 0.57, z], [0.055, 0.74, 0.055]),
    box([2.995, 0.57, z], [0.055, 0.74, 0.055]),
  ]),
  ...[-2.62, -1.48, 1.48, 2.62].map((x) => box([x, 0.57, 2.995], [0.055, 0.74, 0.055])),
  // Door casing and a worn threshold. Opening dimensions remain unchanged.
  box([-0.82, 1.38, 2.99], [0.14, 2.64, 0.19]),
  box([0.82, 1.38, 2.99], [0.14, 2.64, 0.19]),
  box([0, 2.72, 2.99], [1.78, 0.15, 0.19]),
  box([0, 0.115, 3.04], [1.5, 0.07, 0.32]),
]

const CEILING_BEAMS: StaticBox[] = [-2.25, -0.75, 0.75, 2.25].map((z) =>
  box([0, 2.93, z], [6.18, 0.13, 0.14]),
)

const FURNITURE_WOOD: StaticBox[] = [
  // Low dresser beneath the peach ornament.
  box([0.4, 0.43, -2.62], [1.42, 0.76, 0.52]),
  box([0.4, 0.84, -2.6], [1.52, 0.08, 0.62]),
  box([-0.17, 0.08, -2.62], [0.09, 0.16, 0.38]),
  box([0.97, 0.08, -2.62], [0.09, 0.16, 0.38]),
  // Bedside cabinet tucked into the existing bed footprint.
  box([-2.72, 0.38, -0.56], [0.52, 0.66, 0.48]),
  box([-2.72, 0.74, -0.56], [0.6, 0.08, 0.56]),
]

const DRAWER_FACES: StaticBox[] = [
  box([0.4, 0.27, -2.345], [1.22, 0.2, 0.035]),
  box([0.4, 0.53, -2.345], [1.22, 0.2, 0.035]),
  box([0.4, 0.75, -2.345], [1.22, 0.14, 0.035]),
  box([-2.72, 0.38, -0.305], [0.4, 0.42, 0.035]),
]

const BOOKS_WARM: StaticBox[] = [
  box([-2.38, 1.82, -2.98], [0.16, 0.24, 0.32], [0, 0, -0.04]),
  box([-2.17, 1.79, -2.98], [0.12, 0.18, 0.3], [0, 0, 0.07]),
  box([-0.04, 0.91, -2.55], [0.34, 0.055, 0.42], [0, 0.18, 0]),
]

const BOOKS_COOL: StaticBox[] = [
  box([-2.55, 1.8, -2.98], [0.12, 0.2, 0.3], [0, 0, 0.03]),
  box([-2.05, 1.84, -2.98], [0.1, 0.28, 0.3], [0, 0, -0.03]),
  box([-0.03, 0.96, -2.54], [0.3, 0.045, 0.38], [0, -0.12, 0]),
  // Books on the new east-wall shelves, leaning against each other.
  box([2.86, 1.53, 0.72], [0.24, 0.26, 0.13], [0, 0, 0.05]),
  box([2.86, 1.5, 0.9], [0.24, 0.2, 0.11], [0, 0, -0.06]),
  box([2.86, 2.05, -0.38], [0.24, 0.24, 0.12], [0, 0, 0.03]),
]

/**
 * The east wall and the south-west corner were bare floor and blank panelling —
 * the two things the camera spends most of the opening looking at. A wardrobe, a
 * pair of shelves, a chair and a wash stand give the room a life that predates
 * the player, without narrowing any route she has to walk.
 */
const EAST_WALL_FURNITURE: StaticBox[] = [
  // Wardrobe, flush to the east wall between the desk and the door.
  box([2.72, 1.02, 0.26], [0.62, 1.94, 1.5]),
  box([2.72, 2.06, 0.26], [0.7, 0.14, 1.6]),
  box([2.4, 1.0, 0.26], [0.04, 1.7, 1.34]),
  // Two open shelves further along, one above the other.
  box([2.86, 1.38, 0.55], [0.44, 0.05, 1.0]),
  box([2.86, 1.9, -0.55], [0.44, 0.05, 1.0]),
  box([2.86, 1.64, 0.05], [0.44, 0.05, 0.04]),
  // Wash stand in the south-west corner, with a splash board.
  box([-2.74, 0.42, 2.3], [0.56, 0.74, 0.66]),
  box([-2.74, 0.81, 2.3], [0.64, 0.06, 0.74]),
  box([-3.0, 1.12, 2.3], [0.05, 0.56, 0.7]),
  // A plain chair pulled out from the desk.
  box([1.28, 0.44, -1.5], [0.44, 0.05, 0.44]),
  box([1.28, 0.75, -1.7], [0.44, 0.58, 0.05], [0.06, 0, 0]),
  ...([
    [1.1, -1.32],
    [1.46, -1.32],
    [1.1, -1.68],
    [1.46, -1.68],
  ] as [number, number][]).map(([x, z]) => box([x, 0.22, z], [0.05, 0.44, 0.05])),
]

/** Doors, drawer faces and the quilt: the softer, lighter set. */
const EAST_WALL_PANELS: StaticBox[] = [
  box([2.4, 1.0, -0.06], [0.03, 1.62, 0.6]),
  box([2.4, 1.0, 0.58], [0.03, 1.62, 0.6]),
  // Folded quilt at the foot of the bed.
  box([-1.86, 0.62, -0.42], [1.36, 0.16, 0.52], [0, 0.12, 0]),
  box([-1.86, 0.72, -0.44], [1.28, 0.1, 0.44], [0, 0.1, 0]),
]

function StaticBoxes({
  items,
  material,
  castShadow = false,
  receiveShadow = false,
}: {
  items: StaticBox[]
  material: THREE.Material
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    items.forEach((item, i) => {
      dummy.position.set(...item.position)
      dummy.rotation.set(...(item.rotation ?? [0, 0, 0]))
      dummy.scale.set(...item.scale)
      dummy.updateMatrix()
      target.setMatrixAt(i, dummy.matrix)
    })
    target.instanceMatrix.needsUpdate = true
    target.computeBoundingSphere()
  }, [dummy, items])

  return (
    <instancedMesh
      ref={mesh}
      args={[geo.box(), material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  )
}

function BedroomArchitecture() {
  const mats = useMemo(
    () => ({
      floorA: storybook({ color: '#936f4c', roughness: 0.98, rim: 0.14, gradient: 0.22 }),
      floorB: storybook({ color: '#9d7952', roughness: 0.98, rim: 0.16, gradient: 0.2 }),
      panel: storybook({ color: '#b4a896', roughness: 0.98, rim: 0.2, gradient: 0.26 }),
      trim: storybook({ color: '#8e684b', roughness: 0.92, rim: 0.32, gradient: 0.28 }),
      beam: storybook({ color: '#684b39', roughness: 0.94, rim: 0.3, gradient: 0.32 }),
      sill: storybook({ color: '#a47a56', roughness: 0.9, rim: 0.36 }),
      rugEdge: storybook({ color: '#934f50', roughness: 1, rim: 0.3 }),
      mat: storybook({ color: '#8f624b', roughness: 1, rim: 0.24, gradient: 0.36 }),
    }),
    [],
  )

  return (
    <>
      <StaticBoxes items={FLOOR_PLANKS_A} material={mats.floorA} receiveShadow />
      <StaticBoxes items={FLOOR_PLANKS_B} material={mats.floorB} receiveShadow />
      <StaticBoxes items={WALL_PANELS} material={mats.panel} receiveShadow />
      <StaticBoxes items={WALL_TRIM} material={mats.trim} castShadow />
      <StaticBoxes items={CEILING_BEAMS} material={mats.beam} castShadow />

      {/* Woven rug edging and a softened threshold runner. */}
      <mesh
        geometry={geo.cylinder(24)}
        material={mats.rugEdge}
        position={[0, 0.105, 0.6]}
        scale={[2.5, 0.018, 2.0]}
        receiveShadow
      />
      <mesh
        geometry={geo.softBox(0.04)}
        material={mats.mat}
        position={[0, 0.135, 2.62]}
        scale={[1.28, 0.025, 0.62]}
        receiveShadow
      />

      {/* Deep sill gives the animated window a believable wall thickness. */}
      <mesh
        geometry={geo.softBox(0.04)}
        material={mats.sill}
        position={[-2.91, 0.58, 1.4]}
        scale={[0.42, 0.13, 1.82]}
        castShadow
      />
    </>
  )
}

function BedroomStillLife() {
  const mats = useMemo(
    () => ({
      wood: storybook({ color: '#845f46', roughness: 0.93, rim: 0.3, gradient: 0.28 }),
      drawer: storybook({ color: '#a77b59', roughness: 0.92, rim: 0.3 }),
      metal: storybook({ color: '#b5a88f', roughness: 0.4, metalness: 0.46, rim: 0.5 }),
      shade: glow('#ffc884', 0.62),
      pot: storybook({ color: '#bd765f', roughness: 0.96, rim: 0.3 }),
      leafA: storybook({ color: '#667957', roughness: 0.94, rim: 0.36 }),
      leafB: storybook({ color: '#81906b', roughness: 0.94, rim: 0.36 }),
      bookWarm: storybook({ color: '#a75f58', roughness: 0.96, rim: 0.28 }),
      bookCool: storybook({ color: '#536b77', roughness: 0.96, rim: 0.3 }),
      boot: storybook({ color: '#3b302d', roughness: 0.98, rim: 0.22 }),
      fabric: storybook({ color: '#c8796f', roughness: 1, rim: 0.34 }),
      linen: storybook({ color: '#ddd0b8', roughness: 1, rim: 0.36 }),
    }),
    [],
  )

  return (
    <>
      <StaticBoxes items={FURNITURE_WOOD} material={mats.wood} castShadow receiveShadow />
      <StaticBoxes items={EAST_WALL_FURNITURE} material={mats.wood} castShadow receiveShadow />
      <StaticBoxes items={EAST_WALL_PANELS} material={mats.drawer} castShadow />
      <StaticBoxes items={DRAWER_FACES} material={mats.drawer} castShadow />
      <StaticBoxes items={BOOKS_WARM} material={mats.bookWarm} castShadow />
      <StaticBoxes items={BOOKS_COOL} material={mats.bookCool} castShadow />

      {/* Wardrobe handles, and the basin and pitcher on the wash stand. */}
      {[-0.06, 0.58].map((z) => (
        <mesh key={z} geometry={geo.sphere(8)} material={mats.metal} position={[2.37, 1.06, z]} scale={0.05} />
      ))}
      <mesh geometry={geo.cylinder(14)} material={mats.pot} position={[-2.74, 0.9, 2.36]} scale={[0.42, 0.14, 0.42]} castShadow />
      <mesh geometry={geo.cylinder(12)} material={mats.metal} position={[-2.62, 0.98, 2.02]} scale={[0.17, 0.3, 0.17]} castShadow />
      <mesh geometry={geo.torus(10)} material={mats.metal} position={[-2.46, 1.0, 2.02]} rotation={[0, Math.PI / 2, 0]} scale={0.13} />
      {/* A towel over the splash board, and a candle stub on the wardrobe top. */}
      <mesh geometry={geo.softBox(0.05)} material={mats.fabric} position={[-2.9, 1.06, 2.52]} rotation={[0, 0, 0.04]} scale={[0.1, 0.62, 0.3]} castShadow />
      <mesh geometry={geo.cylinder(10)} material={mats.drawer} position={[2.72, 2.2, 0.62]} scale={[0.1, 0.16, 0.1]} />
      <mesh geometry={geo.sphere(6)} material={mats.shade} position={[2.72, 2.31, 0.62]} scale={[0.05, 0.08, 0.05]} />

      {/* A line of washing used to hang across the north-west corner and it never
          read: suspended cloth this small, lit from below and seen against a wall
          1.6 m behind it, looks like paint strokes on the plaster no matter how
          wide the slabs are made. The room is furnished enough without it, and a
          prop that reads as a mistake is worse than an empty corner. Deliberately
          not replaced. */}

      {/* Dresser hardware: repeated glints make the peach feel intentionally kept. */}
      {[0.27, 0.53, 0.75].map((y) => (
        <mesh key={y} geometry={geo.sphere(8)} material={mats.metal} position={[0.4, y, -2.305]} scale={0.055} />
      ))}
      <mesh geometry={geo.sphere(8)} material={mats.metal} position={[-2.72, 0.38, -0.265]} scale={0.05} />

      {/* Bedside lamp: emissive shade plus one restrained local pool. */}
      <group position={[-2.72, 0.78, -0.56]}>
        <mesh geometry={geo.cylinder(10)} material={mats.metal} position={[0, 0.13, 0]} scale={[0.12, 0.08, 0.12]} />
        <mesh geometry={geo.cylinder(8)} material={mats.metal} position={[0, 0.34, 0]} scale={[0.035, 0.42, 0.035]} />
        <mesh geometry={geo.cone(12)} material={mats.shade} position={[0, 0.58, 0]} scale={[0.4, 0.42, 0.4]} />
        <pointLight color="#ffc784" intensity={0.75} distance={3.2} decay={2} position={[0, 0.5, 0.08]} castShadow={false} />
      </group>

      {/* Small plant leaning into the moving curtains. */}
      <group position={[-2.78, 0.62, 1.92]}>
        <mesh geometry={geo.cylinder(10)} material={mats.pot} position={[0, 0.13, 0]} scale={[0.24, 0.26, 0.24]} castShadow />
        {([
          [0, 0.48, 0, 0.2, 0],
          [0.05, 0.58, 0.02, -0.42, 0.4],
          [-0.04, 0.43, 0.04, 0.48, -0.3],
          [0.02, 0.7, -0.02, -0.15, 0.8],
          [-0.02, 0.61, -0.04, 0.28, -0.75],
        ] as [number, number, number, number, number][]).map(([x, y, z, rx, rz], i) => (
          <mesh
            key={i}
            geometry={geo.sphere(8)}
            material={i % 2 ? mats.leafA : mats.leafB}
            position={[x, y, z]}
            rotation={[rx, 0, rz]}
            scale={[0.18, 0.34, 0.08]}
            castShadow
          />
        ))}
      </group>

      {/* Three imperfectly matched family frames above the low dresser. */}
      <PictureFrame position={[-0.48, 1.82, -3.035]} rotation={0.02} scale={0.72} tint="#c78f78" />
      <PictureFrame position={[0.18, 1.98, -3.035]} rotation={-0.025} scale={0.9} tint="#a7b3aa" />
      <PictureFrame position={[0.91, 1.78, -3.035]} rotation={0.035} scale={0.68} tint="#d2b477" />

      {/* Boots and a scarf by the door imply a life beyond the room. */}
      {([
        [1.27, 2.52, -0.22],
        [1.59, 2.67, -0.06],
      ] as [number, number, number][]).map(([x, z, rotation]) => (
        <group key={x} position={[x, 0, z]} rotation={[0, rotation, 0]}>
          <mesh
            geometry={geo.softBox(0.08)}
            material={mats.boot}
            position={[0, 0.13, 0.08]}
            scale={[0.23, 0.18, 0.42]}
            castShadow
          />
          <mesh
            geometry={geo.softBox(0.07)}
            material={mats.boot}
            position={[0, 0.28, -0.08]}
            rotation={[0.08, 0, 0]}
            scale={[0.21, 0.35, 0.23]}
            castShadow
          />
        </group>
      ))}
      <group position={[2.1, 1.85, 3.01]}>
        <mesh geometry={geo.softBox(0.035)} material={mats.wood} position={[0, 0.25, -0.08]} scale={[0.7, 0.11, 0.08]} />
        <mesh geometry={geo.sphere(8)} material={mats.metal} position={[0, 0.25, -0.07]} scale={0.06} />
        <mesh geometry={geo.sphere(8)} material={mats.fabric} position={[0, 0.12, -0.1]} scale={[0.13, 0.1, 0.055]} />
        <mesh geometry={geo.capsule(8)} material={mats.fabric} position={[-0.05, -0.18, -0.09]} rotation={[0, 0, 0.1]} scale={[0.11, 0.28, 0.045]} />
        <mesh geometry={geo.capsule(8)} material={mats.fabric} position={[0.1, -0.36, -0.09]} rotation={[0, 0, -0.15]} scale={[0.09, 0.23, 0.04]} />
      </group>
    </>
  )
}

function cottageHeight(x: number, z: number) {
  // Flat around the cottage, gentle meadow beyond, hills at the far edges.
  const d = Math.hypot(x, z)
  const flat = Math.min(1, Math.max(0, (d - 14) / 22))
  const rolling = fbm(x * 0.03, z * 0.03, 3) * 2.4 * flat
  const rim = Math.max(0, d - 52) * 0.3
  return rolling + rim
}

function isOnPath(x: number, z: number) {
  return distToPath(x, z, PATH).dist < 2.1
}

export function CottageScene() {
  const [left, setLeft] = useState(false)
  const [figure, setFigure] = useState(0)
  /** Where the figure stands, decided when it appears. See `revealFigure`. */
  const [figureAt, setFigureAt] = useState<[number, number]>([1.6, 9.5])
  const [figureFacing, setFigureFacing] = useState(Math.PI)

  /**
   * Put the figure on the road ahead of her, then make it present.
   *
   * It used to stand at a fixed spot beside the cottage door and appear twenty
   * seconds after the reveal cinematic — by which time she has almost always
   * walked well east down the road, so the whole beat happened behind her back
   * and was never seen. Choosing the spot at reveal time costs nothing and
   * guarantees the one thing the beat needs: that she is looking at it.
   */
  const revealFigure = useCallback(() => {
    const px = runtime.playerPos.x
    const pz = runtime.playerPos.z
    // Ahead along the road (east), far enough to be a shape rather than a face.
    const x = Math.min(42, px + 9)
    const z = pz + (px < 6 ? 2.4 : 0.6)
    setFigureAt([x, z])
    // Turned to face her.
    setFigureFacing(Math.atan2(px - x, pz - z))
    setFigure(1)
  }, [])

  // ── the bedroom is its own tiny interior, walled with colliders ──────────
  useColliders(
    () => [
      // Bedroom walls (opening on the south side = the door).
      { kind: 'box', x: 0, z: -3.1, hw: 3.2, hd: 0.25, rot: 0 }, // north
      { kind: 'box', x: -3.1, z: 0, hw: 0.25, hd: 3.2, rot: 0 }, // west
      { kind: 'box', x: 3.1, z: 0, hw: 0.25, hd: 3.2, rot: 0 }, // east
      { kind: 'box', x: -2.025, z: 3.1, hw: 1.275, hd: 0.25, rot: 0 }, // south, left of door
      { kind: 'box', x: 2.025, z: 3.1, hw: 1.275, hd: 0.25, rot: 0 }, // south, right of door
      // Furniture she should not walk through. Kept flush to the walls so the
      // usable floor — and the route from the bed to the door — is unchanged.
      { kind: 'box', x: 2.72, z: 0.26, hw: 0.31, hd: 0.75, rot: 0 }, // wardrobe
      { kind: 'box', x: -2.74, z: 2.3, hw: 0.28, hd: 0.33, rot: 0 }, // wash stand
      { kind: 'box', x: 1.28, z: -1.5, hw: 0.24, hd: 0.24, rot: 0 }, // chair
    ],
    [],
  )

  useObjective(left ? [46, 0, 7] : [0, 0, 6], left ? 'the path east' : 'the front door')

  // Opening cinematic: drift down through the bedroom to her by the bed.
  useSceneIntro(() => {
    const s = useGame.getState()
    s.setNarration(OPENING_LINE)
    void director
      .play(
        [
          { pos: [-2.2, 1.9, 1.6], look: [-1.9, 0.7, -1.7], duration: 0.1 },
          { pos: [-1.2, 1.6, -0.8], look: [0.3, 0.8, -0.4], duration: 5.2 },
          { pos: [0.2, 1.7, -2.6], look: [0.2, 1.0, 1.6], duration: 3.6 },
        ],
        { skipAfter: 1.5, returnTime: 1.1 },
      )
      .then((result) => {
        if (result === 'cancelled') return
        s.setNarration(null)
        const card = CHAPTER_TITLES.cottage
        s.showChapterCard(card.title, card.subtitle)
      })
  }, 0.9)

  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(202)
    const out: TreeSpec[] = []
    for (let i = 0; i < 270; i++) {
      const x = (rand() - 0.5) * 130
      const z = (rand() - 0.5) * 130
      const d = Math.hypot(x, z)
      if (d < 16) continue
      // Keep the trunks and full canopy radius outside the walking corridor.
      if (distToPath(x, z, PATH).dist < 4.6) continue
      if (Math.abs(x - 46) < 8 && Math.abs(z - 7) < 8) continue
      out.push({
        x,
        z,
        y: cottageHeight(x, z),
        scale: 0.8 + rand() * 0.9,
        rotation: rand() * Math.PI * 2,
      })
    }
    return out
  }, [])

  const floorMat = useMemo(
    () => storybook({ color: '#9b7654', roughness: 0.95, rim: 0.14, gradient: 0.18 }),
    [],
  )
  const wallMat = useMemo(
    () => storybook({ color: '#c1b9ad', roughness: 0.97, rim: 0.18, gradient: 0.22 }),
    [],
  )
  const rugMat = useMemo(() => storybook({ color: '#9d625e', roughness: 1, rim: 0.28 }), [])
  const jarMat = useMemo(() => glow('#fff4dc', 0.5), [])

  const accept = useCallback(
    (x: number, z: number) => Math.hypot(x, z) > 9 && !isOnPath(x, z),
    [],
  )

  const talk = (id: string) => () => {
    useGame.getState().startDialogue(getDialogue(id))
    audio.cue('ui')
  }

  return (
    <SceneKit
      chapter="cottage"
      palette={palette}
      height={cottageHeight}
      bounds={{ minX: -60, maxX: 55, minZ: -60, maxZ: 60 }}
      spawn={{ position: [0.2, 0, -0.4], facing: 0 }}
      ambience="bedroom"
      music="cottage"
      stars={0.55}
      surface="grass"
      mist={0.72}
      mistHeight={0.9}
      mistColor="#151d30"
      fogLayer={10}
      fogGround={0.68}
      volumetricLight={0.08}
      volumetricColor="#9ebce8"
    >
      <CameraFraming distance={2.88} lookHeight={0.92} />
      <Clouds count={10} height={64} spread={320} />

      <Terrain
        height={cottageHeight}
        width={130}
        depth={130}
        step={1.8}
        palette={palette}
        tint={cottageTint}
      />

      {/* ── the bedroom + cottage shell ────────────────────────────────── */}
      <group>
        {/* floor */}
        <mesh geometry={geo.box()} material={floorMat} position={[0, 0.03, 0]} scale={[6.6, 0.14, 6.6]} receiveShadow />
        <mesh geometry={geo.cylinder(16)} material={rugMat} position={[0, 0.115, 0.6]} scale={[2.4, 0.03, 1.9]} receiveShadow />
        {/* walls — visual shells over the colliders; the roof is high enough to walk under */}
        <mesh geometry={geo.box()} material={wallMat} position={[0, 1.5, -3.2]} scale={[6.6, 3, 0.25]} castShadow receiveShadow />
        <mesh geometry={geo.box()} material={wallMat} position={[-3.2, 1.5, 0]} scale={[0.25, 3, 6.6]} castShadow receiveShadow />
        <mesh geometry={geo.box()} material={wallMat} position={[3.2, 1.5, 0]} scale={[0.25, 3, 6.6]} castShadow receiveShadow />
        <mesh geometry={geo.box()} material={wallMat} position={[-2.025, 1.5, 3.2]} scale={[2.55, 3, 0.25]} castShadow />
        <mesh geometry={geo.box()} material={wallMat} position={[2.025, 1.5, 3.2]} scale={[2.55, 3, 0.25]} castShadow />
        {/* lintel above the door */}
        <mesh geometry={geo.box()} material={wallMat} position={[0, 2.6, 3.2]} scale={[1.55, 0.8, 0.25]} />
        {/* roof */}
        <mesh
          geometry={geo.cone(4)}
          material={storybook({ color: '#b06b52', roughness: 0.92, rim: 0.3, gradient: 0.28 })}
          position={[0, 4.1, 0]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[5.6, 2.2, 5.6]}
          castShadow
        />

        <BedroomArchitecture />
        <Bed position={[-1.9, 0, -1.7]} rotation={0.12} />
        <Desk position={[2.1, 0, -2.3]} rotation={-0.2} />
        <CurtainWindow
          position={[-3.05, 1.5, 1.4]}
          rotation={Math.PI / 2}
          curtain="#ead8c5"
          glowColor="#a8c7e6"
        />
        <BedroomStillLife />

        {/* desk dressing: journal, jar of flowers, frame */}
        <mesh
          geometry={geo.softBox(0.03)}
          material={storybook({ color: '#8a5a4a', roughness: 0.9, rim: 0.3 })}
          position={[1.8, 0.86, -2.3]}
          rotation={[0, 0.4, 0]}
          scale={[0.34, 0.07, 0.44]}
          castShadow
        />
        <mesh geometry={geo.cylinder(10)} material={jarMat} position={[2.6, 0.94, -2.4]} scale={[0.14, 0.28, 0.14]} />
        <FlowerField count={3} center={[2.6, -2.4]} size={[0.14, 0.14]} height={() => 1.05} seed={3} scale={0.8} />
        <PictureFrame position={[2.35, 1.02, -2.15]} rotation={-0.3} scale={0.8} />

        {/* the stuffed cheetah on a shelf, and the peach ornament */}
        <mesh geometry={geo.box()} material={floorMat} position={[-2.7, 1.7, -3.0]} scale={[1.2, 0.06, 0.5]} />
        <CheetahFigure position={[-2.7, 1.73, -3.0]} rotation={0.7} scale={0.42} />
        <PeachObject position={[0.4, 0.92, -2.35]} scale={0.7} />

        {/* Warm room light, cool window wash, and a faint doorway rim.
            Tuned twice. A single dim ceiling pool left the floor and the far
            corners as featureless brown — all that furniture was there and none
            of it read. Lifting everything then blew the room out into warm
            daylight, which is worse: this is meant to be one lamp in a dark
            house. What works is one pool that falls off inside the room, a small
            fill that only just picks the wardrobe out of the shadow on the east
            wall, and no bounce off the floor at all — a floor light reads as a
            spotlight under her feet, not as light. */}
        <pointLight color="#ffd2a0" intensity={2.2} distance={6.2} decay={2} position={[0, 2.4, -0.2]} castShadow={false} />
        <pointLight color="#f0c092" intensity={0.4} distance={3.0} decay={2} position={[2.35, 1.7, 0.3]} castShadow={false} />
        <pointLight color="#a8c7e6" intensity={1.85} distance={5.8} decay={2} position={[-1.8, 1.55, 1.3]} castShadow={false} />
        <pointLight color="#8fa9cc" intensity={0.45} distance={4.2} decay={2} position={[0, 1.45, 3.15]} castShadow={false} />

        {/* One authored shaft from the west window. The same cheap open-volume
            shader used beneath the forest canopy gives the room an actual
            moon direction without adding a shadow-casting light. */}
        <LightShafts
          positions={[[-2.5, 0.08, 1.4]]}
          color="#abc9ee"
          opacity={0.075}
          height={3.2}
          radius={0.62}
          tilt={0.78}
          azimuth={Math.PI / 2}
        />

        {/* One pooled draw call; motion follows global reduced-motion settings. */}
        <Particles
          kind="dust"
          count={18}
          center={[0, 0.18, 0]}
          size={[5.8, 2.55, 5.8]}
          color="#f3dfc3"
          scale={0.018}
          opacity={0.24}
          seed={47}
        />

        {/* ── bedroom inspections ──────────────────────────────────────── */}
        <Interactable id="bedroom-journal" verb="inspect" label="her journal" position={[1.8, 0.9, -2.3]} radius={1.6} onInteract={talk('bedroom.journal')} />
        <Interactable id="bedroom-window" verb="inspect" label="the window" position={[-2.9, 1.2, 1.4]} radius={1.7} onInteract={talk('bedroom.window')} />
        <Interactable id="bedroom-cheetah" verb="inspect" label="the little cheetah" position={[-2.7, 1.7, -2.9]} radius={1.7} onInteract={talk('bedroom.cheetah')} />
        <Interactable id="bedroom-peach" verb="inspect" label="the peach" position={[0.4, 0.9, -2.35]} radius={1.5} onInteract={talk('bedroom.peach')} />
        <Interactable id="bedroom-frame" verb="inspect" label="the photograph" position={[2.35, 1.0, -2.15]} radius={1.5} onInteract={talk('bedroom.frame')} />
        <Interactable id="bedroom-flowers" verb="inspect" label="the flowers" position={[2.6, 0.95, -2.4]} radius={1.4} onInteract={talk('bedroom.flowers')} />
      </group>

      {/* Something without features, waiting on the road ahead of her.
          Its spot is chosen at the moment it appears rather than authored, so it
          is always in front of her — see `revealFigure`. */}
      <Silhouette
        position={[figureAt[0], cottageHeight(figureAt[0], figureAt[1]), figureAt[1]]}
        rotation={figureFacing}
        presence={figure}
        approachFrom={5}
      />

      {/* ── the yard ───────────────────────────────────────────────────── */}
      <Fence points={[[-6, 12], [-6, 5], [-7, -4]]} />
      <Fence points={[[6.5, 13], [10, 13.5], [16, 12.5]]} />
      <Lantern position={[0, 2.74, 3.42]} style="hanging" height={0} color="#ffc27c" />
      <Lantern position={[3.4, cottageHeight(3.4, 6.4), 6.4]} realLight intensity={4} />
      <Lantern position={[14, cottageHeight(14, 10.8), 10.8]} />
      <Lantern position={[30, cottageHeight(30, 8.6), 8.6]} />
      <PettableDog id="durk-cottage" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[2.05, cottageHeight(2.05, 4.35), 4.35]} rotation={-0.8} behavior="sleep" seed={11} />
      {/* Apollo, white, awake, chasing something invisible near the fence. */}
      <PettableDog id="apollo-cottage" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[-3.6, cottageHeight(-3.6, 8.2), 8.2]} behavior="fireflies" roamRadius={1.4} seed={12} groundHeight={cottageHeight} />

      <Interactable
        id="cottage-sign"
        verb="inspect"
        label="the road sign"
        position={[10, 0, 11.2]}
        radius={2}
        onInteract={talk('cottage.sign')}
      />

      {/* Leaving the doorway for the first time: the reveal cinematic. */}
      <Trigger
        position={[0, 0, 5.4]}
        radius={2.2}
        onEnter={() => {
          if (left) return
          setLeft(true)
          audio.ambience('cottage', 2.5)
          void director
            .play(
              [
                { pos: [0, 1.8, 8.5], look: [0, 1.2, 0], duration: 0.1 },
                { pos: [-4, 3.2, 13], look: [18, 1.5, 6], duration: 3.4 },
                { pos: [-6, 4.4, 15], look: [40, 3, 0], duration: 3.2 },
              ],
              { skipAfter: 1.2 },
            )
            .then((result) => {
              if (result === 'cancelled') return
              // It lets her have the yard to herself for a while first.
              setTimeout(revealFigure, SILHOUETTE_DELAY_MS)
              setTimeout(() => {
                useGame.getState().startDialogue([
                  { speaker: null, text: 'I was nothing when I met you.' },
                ])
              }, SILHOUETTE_DELAY_MS + 3200)
              // It does not wait to be answered.
              setTimeout(() => setFigure(0), SILHOUETTE_DELAY_MS + 11000)
            })
        }}
      />

      {/* Path to town → next chapter. */}
      <Trigger
        position={[47, 0, 7]}
        radius={3.4}
        onEnter={() => {
          useGame.getState().transitionToChapter('town')
        }}
      />

      <TreeField trees={trees} palette={palette} />
      <GrassField count={1100} center={[6, 6]} size={[110, 110]} height={cottageHeight} accept={accept} colorA={palette.foliageA} colorB={palette.foliageB} seed={23} />
      <FlowerField count={130} center={[8, 10]} size={[70, 60]} height={cottageHeight} accept={accept} seed={29} />
      <RockField count={16} center={[0, 0]} size={[100, 100]} height={cottageHeight} accept={accept} seed={31} scale={0.8} />
      <BushField count={70} center={[4, 6]} size={[100, 100]} height={cottageHeight} accept={accept} seed={33} colorA={palette.foliageA} colorB={palette.foliageB} />
      <FernField count={260} center={[4, 6]} size={[95, 95]} height={cottageHeight} accept={accept} seed={35} />
      {/* A few mushrooms by the fence line. They light as she walks out for the
          first time, which is the earliest the game shows her that the world
          answers to her being in it. */}
      <MushroomField count={26} center={[6, 9]} size={[26, 12]} height={cottageHeight} accept={accept} seed={88} glowColor="#a8e8d0" />

      <LogField count={7} center={[0, -8]} size={[80, 70]} height={cottageHeight} accept={accept} seed={37} />

      {/* the yard, lived in */}
      <Woodpile position={[-4.6, cottageHeight(-4.6, 1.2), 1.2]} rotation={0.25} />
      <Clutter position={[4.4, cottageHeight(4.4, 2.4), 2.4]} rotation={-0.4} seed={3} />
      <Planter position={[-1.9, cottageHeight(-1.9, 4.4), 4.4]} rotation={0.1} />
      <Planter position={[2.2, cottageHeight(2.2, 4.5), 4.5]} rotation={-0.14} bloom="#f0c07a" />

      {/* peach-colored lights guiding the first route */}
      <Particles kind="firefly" count={26} center={[16, 1.2, 9]} size={[34, 2.5, 8]} color={palette.accentWarm} seed={41} />
      <Particles kind="pollen" count={30} center={[8, 1.5, 8]} size={[40, 4, 30]} seed={43} />
      <Butterflies count={6} center={[10, 0, 10]} radius={10} />
      <Birds count={6} center={[0, 0, -30]} altitude={40} radius={80} />
    </SceneKit>
  )
}

const pathColor = new THREE.Color('#d2b590')

function cottageTint(x: number, z: number) {
  return isOnPath(x, z) ? pathColor : null
}
