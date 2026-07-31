import { useMemo, useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SceneKit, Trigger, useObjective, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import { Clouds } from '../../systems/environment/Environment'
import { TreeField, GrassField, FlowerField, Water, BushField, FernField, type TreeSpec } from '../../systems/environment/nature'
import {
  House,
  Lantern,
  Streetlight,
  Fence,
  Bench,
  Bridge,
  Stall,
  PeachObject,
  ParkSign,
  Clutter,
  Planter,
  StringLights,
  Well,
  Signpost,
} from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { Birds, Butterflies, Cat, Ducks, PettableDog, APOLLO_NAME, Npc, Watcher } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES } from '../../systems/environment/palettes'
import { mulberry32, fbm, distToPath, clamp01, damp } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { director } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { audio } from '../../systems/audio/audio'
import { geo, storybook } from '../../utils/assets'

const palette = PALETTES.town

/**
 * Layout. She arrives from the west (x≈-38). The square is at the origin,
 * ringed by the bakery (N), flower stall (E), bookshop (S). A stream runs
 * along the east edge with the bridge at (20, 12); the quiet man waits across
 * it. The forest path leaves north-east at (30, -24).
 */

const ROAD: [number, number][] = [
  [-40, 2],
  [-24, 1],
  [-10, 0],
  [0, 0],
  [10, 4],
  [19, 11],
  [26, 14],
]

const FOREST_PATH: [number, number][] = [
  [4, -6],
  [14, -14],
  [24, -20],
  [32, -25],
]

/** Ty Warner Park: a big rounded hill on the town's west side. */
const HILL = { x: -41, z: -32, radius: 24, height: 16 }

/**
 * The way out of town is over the hill.
 *
 * Lanterns pace the climb, one street lamp stands on the summit — the last
 * electric light before the trees — and a bench beside it looks back down at the
 * square. The chapter exit sits a few paces past the lamp, on the far shoulder,
 * so leaving is a decision she walks into rather than a line she trips over.
 */
const HILL_CLIMB: [number, number][] = [
  [-25, -18],
  [-30, -23],
  [-35, -27],
]
const HILL_LAMP: [number, number] = [-40, -31]
const HILL_BENCH: [number, number] = [-43.4, -30.2]
/** Facing back down the slope, toward the square. */
const HILL_BENCH_ROT = Math.atan2(0 - HILL_BENCH[0], 0 - HILL_BENCH[1]) + Math.PI
/** A few paces past the summit lamp, on the far shoulder. */
const HILL_EXIT: [number, number] = [-45.5, -35.5]

function hillAt(x: number, z: number) {
  const d = Math.hypot(x - HILL.x, z - HILL.z) / HILL.radius
  if (d >= 1) return 0
  // A smooth dome, so it is a walkable hill rather than a cliff.
  const k = Math.cos(d * Math.PI * 0.5)
  return HILL.height * k * k
}

function townHeight(x: number, z: number) {
  const d = Math.hypot(x * 0.85, z)
  const flat = Math.min(1, Math.max(0, (d - 26) / 26))
  const rolling = fbm(x * 0.03 + 7, z * 0.03, 3) * 2.2 * flat
  const rim = Math.max(0, d - 60) * 0.35
  // The stream bed: a shallow channel along x≈21..27 for z > 4.
  const stream = z > 2 ? Math.max(0, 1 - Math.abs(x - 23.5) / 3.2) * -1.15 : 0
  return rolling + rim + stream + hillAt(x, z)
}

const WATER_LEVEL = -0.55

function onRoad(x: number, z: number) {
  return distToPath(x, z, ROAD).dist < 2.4 || distToPath(x, z, FOREST_PATH).dist < 1.9
}

/** Progressive lighting: each finished kindness lights another ring of the town. */
function TownGlow({ litCount }: { litCount: number }) {
  const target = useRef(0)
  const level = useRef(0)
  const lightRef = useRef<THREE.PointLight>(null)
  target.current = litCount / 3

  useFrame((_, dt) => {
    level.current = damp(level.current, target.current, 1.2, dt)
    if (lightRef.current) lightRef.current.intensity = level.current * 7
  })

  return <pointLight ref={lightRef} color="#ffb877" intensity={0} distance={40} decay={1.6} position={[0, 7, 0]} />
}

type TaskId = 'recipe' | 'flowers' | 'letter'

export function TownScene() {
  const townTasks = useGame((s) => s.save.townTasks)
  const completeTownTask = useGame((s) => s.completeTownTask)

  const done = useCallback((id: TaskId) => townTasks.includes(id), [townTasks])
  const doneCount = (['recipe', 'flowers', 'letter'] as TaskId[]).filter(done).length
  const allDone = doneCount === 3

  // Sub-state for multi-step tasks (not saved — they are 30-second errands).
  const [hasRecipe, setHasRecipe] = useState(false)
  const [hasLetter, setHasLetter] = useState(false)
  const [wateredAt, setWateredAt] = useState(0)
  const [catPets, setCatPets] = useState(0)

  useSceneIntro(() => {
    void director.play(
      [
        { pos: [-34, 6, 14], look: [-20, 1.5, 2], duration: 0.1 },
        { pos: [-20, 4.2, 16], look: [0, 1.5, 0], duration: 3.6 },
        { pos: [-12, 3.2, 12], look: [4, 1.8, -2], duration: 2.8 },
      ],
      { skipAfter: 0.6 },
    )
  }, 0.35)

  useObjective(
    allDone
      ? [HILL_LAMP[0], 0, HILL_LAMP[1]]
      : !done('recipe')
        ? hasRecipe
          ? [0, 0, -10]
          : [-9, 0, -7]
        : !done('flowers')
          ? [12.5, 0, 2.5]
          : hasLetter
            ? [27.5, 0, 16]
            : [2, 0, 9],
    allDone
      ? 'the lamp on the hill'
      : !done('recipe')
        ? hasRecipe
          ? 'the bakery window'
          : 'the baker'
        : !done('flowers')
          ? 'the flower stall'
          : hasLetter
            ? 'the man by the bridge'
            : 'the bookseller',
  )

  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(303)
    const out: TreeSpec[] = []
    for (let i = 0; i < 245; i++) {
      const x = (rand() - 0.5) * 150
      const z = (rand() - 0.5) * 150
      if (Math.hypot(x, z) < 24 && Math.abs(x - 23.5) > 5) continue
      // Dense town-edge woods, but never branches filling the road camera.
      if (
        distToPath(x, z, ROAD).dist < 4.8 ||
        distToPath(x, z, FOREST_PATH).dist < 4.2
      ) continue
      if (Math.abs(x - 23.5) < 4.5 && z > 2) continue
      out.push({ x, z, y: townHeight(x, z), scale: 0.8 + rand() * 0.9, rotation: rand() * Math.PI * 2 })
    }
    return out
  }, [])

  const accept = useCallback(
    (x: number, z: number) => !onRoad(x, z) && !(Math.abs(x - 23.5) < 5 && z > 2) && Math.hypot(x, z) > 6,
    [],
  )

  const talk = (id: string) => useGame.getState().startDialogue(getDialogue(id))

  const squareStone = useMemo(() => storybook({ color: '#c9b493', roughness: 0.97, rim: 0.16, gradient: 0.16 }), [])
  const bellBronze = useMemo(() => storybook({ color: '#a8814f', roughness: 0.45, metalness: 0.5, rim: 0.55 }), [])
  const paper = useMemo(() => storybook({ color: '#f6ecd8', roughness: 0.95, rim: 0.4 }), [])
  const wilted = useMemo(() => storybook({ color: '#a89a6b', roughness: 1, rim: 0.2 }), [])

  const flowersBloom = done('flowers') ? 1 : 0.999 * clamp01(wateredAt)

  return (
    <SceneKit
      chapter="town"
      palette={palette}
      height={townHeight}
      bounds={{ minX: -68, maxX: 48, minZ: -58, maxZ: 42 }}
      spawn={{ position: [-36, 0, 2], facing: Math.PI / 2 }}
      ambience="town"
      music="town"
      stars={0.5}
      surface="stone"
      mist={1.1} mistHeight={1.2}
    >
      <CameraFraming distance={4.96} lookHeight={1.04} />
      <Clouds count={10} height={62} spread={320} />
      <TownGlow litCount={doneCount} />

      <Terrain
        height={townHeight}
        center={[-14, -10]}
        width={180}
        depth={175}
        step={1.6}
        palette={palette}
        tint={townTint}
      />

      {/* the stream + ducks */}
      <Water width={9} depth={38} position={[23.5, WATER_LEVEL, 22]} shallow="#40706c" deep="#1c3a3c" glint={palette.accentWarm} sunDir={palette.sunDir} />
      <Ducks path={[[22, 10], [24.5, 16], [23, 24], [21.5, 18]]} waterLevel={WATER_LEVEL} />
      <Bridge position={[23.5, 0.1, 12]} rotation={Math.PI / 2} length={9} arch={0.7} />

      {/* ── buildings ──────────────────────────────────────────────────── */}
      <House position={[-6, 0, -13]} rotation={0.12} width={6.4} depth={5} height={3.6} wall="#e8cfa8" roof="#a8624c" windowsLit={done('recipe')} />
      <House position={[8, 0, -14]} rotation={-0.2} width={5} depth={4.4} height={3.2} wall="#e0b894" roof="#8a5a48" windowsLit={done('recipe')} roofStyle="hip" />
      <House position={[-16, 0, -6]} rotation={0.5} width={4.6} depth={4.2} height={3} wall="#d9c4a0" roof="#7a6b52" windowsLit={done('flowers')} />
      <House position={[-13, 0, 10]} rotation={2.6} width={5.2} depth={4.4} height={3.3} wall="#e8d5b0" roof="#a87a52" windowsLit={done('flowers')} />
      <House position={[2, 0, 16]} rotation={3.3} width={5.8} depth={4.6} height={3.4} wall="#e0c9a4" roof="#93604a" windowsLit={done('letter')} />
      <House position={[14, 0, -22]} rotation={-0.5} width={4.4} depth={4} height={2.9} wall="#d9bd96" roof="#86564a" windowsLit={done('letter')} roofStyle="hip" />

      {/* stalls: bakery counter, flowers, books */}
      <Stall position={[-9, 0, -7]} rotation={0.35} goods="bread" awningA="#d9705e" />
      <Stall position={[12.5, 0, 2.5]} rotation={-1.1} goods="flowers" awningA="#6fb3ae" />
      <Stall position={[2, 0, 9]} rotation={2.9} goods="books" awningA="#c9a052" />

      {/* ── Ty Warner Park ─────────────────────────────────────────────── */}
      <ParkSign
        position={[-30, townHeight(-30, -13), -13]}
        rotation={Math.PI * 0.72}
        scale={1.1}
        text="Ty Warner Park"
        lit
      />
      <Interactable
        id="park-sign"
        verb="inspect"
        label="the park sign"
        position={[-30, 0, -13]}
        radius={2.8}
        onInteract={() => talk('town.parkSign')}
      />
      <Lantern position={[-27, townHeight(-27, -9), -9]} lit realLight intensity={7} />
      <Lantern position={[-20, townHeight(-20, -16), -16]} lit />

      {/* The climb. Lanterns pace the slope so the summit reads as somewhere to
          go rather than just high ground; they light once the town is whole. */}
      {HILL_CLIMB.map(([x, z], i) => (
        <Lantern
          key={`climb-${i}`}
          position={[x, townHeight(x, z), z]}
          lit={allDone}
          realLight={allDone && i % 2 === 1}
          intensity={5.5}
        />
      ))}

      {/* ── The summit: the last light pole in the world she is leaving ────
          Past this lamp there is no more town, and the trees begin. The bench
          faces back down at the square she just lit, so the last thing the
          chapter offers is a place to sit and look at what she did. */}
      <Streetlight
        position={[HILL_LAMP[0], townHeight(HILL_LAMP[0], HILL_LAMP[1]), HILL_LAMP[1]]}
        color={palette.accentWarm}
        height={6.4}
        on
        realLight
        intensity={26}
        flicker={false}
      />
      <Bench
        position={[HILL_BENCH[0], townHeight(HILL_BENCH[0], HILL_BENCH[1]) + 0.08, HILL_BENCH[1]]}
        rotation={HILL_BENCH_ROT}
      />
      <Interactable
        id="hill-bench"
        verb="sit"
        label="the bench at the top"
        position={[HILL_BENCH[0], 0, HILL_BENCH[1]]}
        radius={2.6}
        onInteract={() => {
          talk('town.hillBench')
          const y = townHeight(HILL_BENCH[0], HILL_BENCH[1])
          void director.play(
            [
              { pos: [HILL_BENCH[0] - 2.4, y + 1.9, HILL_BENCH[1] + 2.2], look: [HILL_BENCH[0], y + 1.1, HILL_BENCH[1]], duration: 0.1 },
              { pos: [HILL_BENCH[0] + 3.2, y + 2.6, HILL_BENCH[1] + 4.4], look: [0, 1.2, 0], duration: 5.4, ease: 'smoother' },
            ],
            { skipAfter: 0.8 },
          )
        }}
      />
      {/* fireflies gather at the summit lamp once the town is lit */}
      <Particles
        kind="firefly"
        count={allDone ? 26 : 8}
        center={[HILL_LAMP[0], townHeight(HILL_LAMP[0], HILL_LAMP[1]) + 1.6, HILL_LAMP[1]]}
        size={[12, 3, 12]}
        color={palette.accentWarm}
        seed={79}
      />

      {/* a town that has been lived in: crates behind the stalls, planters
          along the square, more houses closing the streets in */}
      <House position={[-24, 0, 4]} rotation={1.5} width={5} depth={4.4} height={3.1} wall="#dcc49c" roof="#8a5a48" windowsLit={done('flowers')} />
      <House position={[18, 0, -6]} rotation={-1.3} width={4.8} depth={4.2} height={3} wall="#e0c9a4" roof="#7a6b52" windowsLit={done('recipe')} roofStyle="hip" />
      <House position={[10, 0, 20]} rotation={3.0} width={5.4} depth={4.4} height={3.2} wall="#d9bd96" roof="#93604a" windowsLit={done('letter')} />
      <House position={[-6, 0, 24]} rotation={2.8} width={4.6} depth={4} height={2.9} wall="#e8d5b0" roof="#a8624c" windowsLit={done('letter')} roofStyle="hip" />

      <Clutter position={[-11.5, 0, -9.5]} rotation={0.4} seed={1} />
      <Clutter position={[15, 0, 1.5]} rotation={-0.8} seed={2} />
      <Clutter position={[3.6, 0, 11.5]} rotation={1.9} seed={4} />
      <Clutter position={[-18, 0, -2]} rotation={-0.3} seed={5} />

      <Planter position={[-7.5, 0, 3.5]} rotation={0.2} />
      <Planter position={[7.5, 0, 2.5]} rotation={-0.3} bloom="#f0c07a" />
      <Planter position={[-2, 0, -7.5]} rotation={1.6} bloom="#c9a8e8" />
      <Planter position={[5.5, 0, 7]} rotation={-1.4} />

      {/* more lantern light through the streets */}
      <Lantern position={[-14, townHeight(-14, 3), 3]} lit={done('flowers')} />
      <Lantern position={[13, townHeight(13, -4), -4]} lit={done('recipe')} />
      <Lantern position={[4, townHeight(4, 14), 14]} lit={done('letter')} />

      {/* square dressing */}
      <mesh geometry={geo.cylinder(24)} material={squareStone} position={[0, 0.05, 0]} scale={[19, 0.1, 19]} receiveShadow />
      <Bench position={[-4.5, 0.1, 4.5]} rotation={2.4} />
      <Bench position={[5.5, 0.1, -4.5]} rotation={-0.8} />
      <Bench position={[-6.2, 0.1, -3.2]} rotation={0.9} />
      <Bench position={[7.2, 0.1, 5.2]} rotation={-2.1} />
      <Fence points={[[-26, 8], [-30, 2], [-30, -6]]} />

      {/* Bulbs strung across the square in a rough triangle. Overhead light is
          what makes an open space feel enclosed and cared for — the square read
          as an empty plaza without it. They come on with the kindnesses. */}
      <StringLights from={[-8.5, -6.5]} to={[8.5, -6]} height={4.6} sag={1.1} count={13} color={palette.accentWarm} lit={doneCount >= 1} />
      <StringLights from={[8.5, -6]} to={[6.5, 8]} height={4.4} sag={1.0} count={11} color={palette.accentWarm} lit={doneCount >= 2} />
      <StringLights from={[6.5, 8]} to={[-8.5, -6.5]} height={4.5} sag={1.3} count={15} color={palette.accentWarm} lit={doneCount >= 3} />

      {/* The well: something for the square to be arranged around, and a reason
          for the benches to face where they face. */}
      <Well position={[-3.4, 0.1, -1.2]} rotation={0.4} />

      {/* Fingerpost where the road meets the square, pointing at the three
          errands and at the hill. It is scenery, not a marker — the compass is
          the navigation aid — but it makes the layout legible on arrival. */}
      <Signpost
        position={[-13.5, townHeight(-13.5, 4.2), 4.2]}
        rotation={0.25}
        arms={[
          { text: 'Square', angle: -0.35, height: 2.18 },
          { text: 'Ty Warner Park', angle: 2.5, height: 1.82 },
          { text: 'The Bridge', angle: 0.75, height: 1.46 },
        ]}
      />

      {/* ── the western approach ────────────────────────────────────────────
          She arrives at x ≈ -36 and the first thing she used to see was forty
          metres of empty ground with a town somewhere beyond it. A fence running
          beside the road, a lamp at the town limit and a milestone give the walk
          in a middle distance, and tell her she is arriving somewhere. */}
      <Fence points={[[-44, 6.5], [-34, 5.5], [-26, 5]]} collide={false} />
      <Fence points={[[-44, -3], [-34, -3.5], [-27, -3]]} collide={false} />
      <Lantern position={[-31, townHeight(-31, 4.2), 4.2]} lit realLight intensity={6} />
      <Lantern position={[-22.5, townHeight(-22.5, -2.6), -2.6]} lit />
      <ParkSign
        position={[-34.5, townHeight(-34.5, -3.6), -3.6]}
        rotation={Math.PI * 0.52}
        scale={0.8}
        text="Lantern Town"
      />
      <Clutter position={[-28.5, 0, 6.2]} rotation={-0.8} seed={13} />
      <Planter position={[-25, 0, 4.4]} rotation={0.5} bloom="#e8a0b0" />

      {/* Two handcarts and more crates, so the market reads as packed up for the
          night rather than never having existed. */}
      <Clutter position={[-8.2, 0, 5.6]} rotation={1.2} seed={7} />
      <Clutter position={[9.4, 0, -7.2]} rotation={-1.9} seed={8} />
      <Clutter position={[-2.4, 0, 13.2]} rotation={0.6} seed={9} />
      <Clutter position={[-20.5, 0, 7.4]} rotation={-0.5} seed={11} />
      <Clutter position={[16.5, 0, 8.6]} rotation={2.2} seed={12} />
      <Planter position={[-11.5, 0, -2.5]} rotation={0.9} bloom="#e8a0b0" />
      <Planter position={[11.5, 0, -1.5]} rotation={-0.6} />
      <Planter position={[-1.5, 0, 8.5]} rotation={2.3} bloom="#f0c07a" />

      {/* the bell */}
      <group position={[0, 0, -2]}>
        <mesh geometry={geo.cylinder(8)} material={squareStone} position={[0, 1.5, 0]} scale={[0.3, 3, 0.3]} castShadow />
        <mesh geometry={geo.cone(10)} material={bellBronze} position={[0, 3.15, 0]} scale={[0.55, 0.6, 0.55]} castShadow />
        <Interactable
          id="town-bell"
          verb="ring"
          label="the bell"
          position={[0, 1, -2]}
          radius={2}
          onInteract={() => {
            audio.cue('bell')
            talk('town.bell')
          }}
        />
      </group>

      {/* lanterns — they light up as kindnesses are done */}
      {/* TownGlow supplies the progressive pool of warm light. These task
          lanterns stay visibly emissive without adding three full-scene point
          light loops once every kindness is complete. */}
      <Lantern position={[-6, townHeight(-6, -8.5), -8.5]} lit={done('recipe')} />
      <Lantern position={[6, townHeight(6, -9), -9]} lit={done('recipe')} />
      <Lantern position={[10.5, townHeight(10.5, 6), 6]} lit={done('flowers')} />
      <Lantern position={[-10, townHeight(-10, 7), 7]} lit={done('flowers')} />
      <Lantern position={[20, townHeight(20, 11), 11]} lit={done('letter')} />
      <Lantern position={[8, townHeight(8, -13), -13]} lit={done('letter')} />
      {/* forest gate lanterns — the third kindness lights the way onward */}
      <Lantern position={[14, townHeight(14, -14.5), -14.5]} lit={allDone} realLight={allDone} />
      <Lantern position={[24, townHeight(24, -20.5), -20.5]} lit={allDone} />

      {/* ── NPCs ───────────────────────────────────────────────────────── */}
      {/* The people who were never kind to her. They stand where she has to walk
          past, watch her the whole way, and say half a sentence each. None of
          them can be spoken to; that is the point. */}
      <Watcher position={[-28.5, townHeight(-28.5, 4.6), 4.6]} rotation={1.4} seed={1} appearance={{ top: '#463f4c', height: 1.04 }} />
      <Watcher position={[-17.2, townHeight(-17.2, -3.4), -3.4]} rotation={2.2} seed={2} appearance={{ top: '#33313d', hair: '#3b3128', height: 0.97 }} />
      <Watcher position={[8.6, townHeight(8.6, 12.4), 12.4]} rotation={-2.4} seed={3} appearance={{ top: '#3d3a44', hair: '#5a4436' }} />
      <Watcher position={[-4.2, townHeight(-4.2, -12.6), -12.6]} rotation={0.5} seed={4} appearance={{ top: '#2f2d38', height: 1.06 }} />
      <Watcher position={[19.4, townHeight(19.4, -9.2), -9.2]} rotation={-0.9} seed={5} appearance={{ top: '#413c48', hair: '#7a6a58', height: 0.95 }} />

      <Npc position={[-9.8, 0, -6]} rotation={2.6} appearance={{ hair: '#6b5039', top: '#c9a475', apron: '#f2e6d0', height: 1.05 }} busy={!done('recipe')} />
      <Npc position={[13.4, 0, 3.4]} rotation={-2.2} appearance={{ hair: '#8a6a52', top: '#7da893', height: 0.95 }} busy={!done('flowers')} />
      <Npc position={[1.2, 0, 9.9]} rotation={0.3} appearance={{ hair: '#4a4a52', top: '#8a92b0', height: 1.0 }} />
      <Npc position={[27.5, 0, 16.5]} rotation={-1.8} appearance={{ hair: '#9a9a94', top: '#5d6472', height: 0.98 }} faceRadius={3} />

      {/* cats + butterflies */}
      <Cat position={[4.8, 0.12, -4.2]} rotation={1.2} content={catPets > 0 ? 1 : 0} />
      <Cat position={[-12.5, 0.12, 8.4]} rotation={-0.6} color="#8a8a8e" />
      <Interactable
        id="town-cat"
        verb="pet"
        label="June"
        position={[4.8, 0, -4.2]}
        radius={1.6}
        onInteract={() => {
          setCatPets((n) => n + 1)
          audio.cue('pet')
          talk('town.cat')
        }}
      />
      <Interactable id="town-ducks" verb="inspect" label="the ducks" position={[22.5, 0, 14]} radius={3} onInteract={() => talk('town.ducks')} />
      <Interactable id="town-bench" verb="sit" label="a warm bench" position={[-4.5, 0, 4.5]} radius={1.8} onInteract={() => talk('town.bench')} />

      {/* ═══ TASK 1 — the baker's recipe page ═══════════════════════════ */}
      <Interactable
        id="baker"
        verb="talk"
        label="the baker"
        position={[-9.8, 0, -6]}
        radius={2.4}
        priority={-1}
        enabled={() => !done('recipe')}
        onInteract={() => {
          if (hasRecipe) {
            completeTownTask('recipe')
            audio.cue('chime')
            talk('town.baker.after')
          } else {
            talk('town.baker.before')
          }
        }}
      />
      {/* the page, fluttering against the fence north of the square */}
      {!hasRecipe && !done('recipe') ? (
        <group position={[-1.5, 0, -10.5]}>
          <mesh geometry={geo.plane()} material={paper} position={[0, 0.7, 0]} rotation={[0.3, 0.5, 0.2]} scale={[0.32, 0.42, 1]} castShadow />
          <Interactable
            id="recipe-page"
            verb="collect"
            label="a fluttering page"
            position={[-1.5, 0, -10.5]}
            radius={1.8}
            onInteract={() => {
              setHasRecipe(true)
              audio.cue('memory')
              talk('town.recipe.found')
            }}
          />
        </group>
      ) : null}

      {/* ═══ TASK 2 — water the wilted flowers ══════════════════════════ */}
      {/* watering can beside the stall */}
      <mesh
        geometry={geo.cylinder(10)}
        material={storybook({ color: '#7d8a94', roughness: 0.6, metalness: 0.3, rim: 0.4 })}
        position={[11.2, 0.22, 4.4]}
        scale={[0.24, 0.44, 0.24]}
        castShadow
      />
      {/* the wilted bed */}
      <group position={[15.5, 0, 5.5]}>
        {!done('flowers') && flowersBloom < 0.05 ? (
          Array.from({ length: 5 }, (_, i) => (
            <mesh
              key={i}
              geometry={geo.capsule(5)}
              material={wilted}
              position={[(i - 2) * 0.3, 0.14, (i % 2) * 0.2]}
              rotation={[0.9, i, 0.4]}
              scale={[0.03, 0.12, 0.03]}
            />
          ))
        ) : (
          <FlowerField count={14} center={[0, 0]} size={[1.8, 1.2]} height={() => 0} seed={57} bloom={Math.max(0.2, flowersBloom)} />
        )}
      </group>
      <Interactable
        id="florist"
        verb="talk"
        label="the florist"
        position={[13.4, 0, 3.4]}
        radius={2.2}
        priority={-1}
        enabled={() => !done('flowers')}
        onInteract={() => talk('town.florist.before')}
      />
      <Interactable
        id="water-flowers"
        verb="water"
        label="the wilted bed"
        position={[15.5, 0, 5.5]}
        radius={2}
        enabled={() => !done('flowers')}
        onInteract={() => {
          setWateredAt(1)
          completeTownTask('flowers')
          audio.cue('water')
          talk('town.flowers.watered')
          setTimeout(() => talk('town.florist.after'), 2600)
        }}
      />

      {/* ═══ TASK 3 — the sealed letter ═════════════════════════════════ */}
      <Interactable
        id="bookseller"
        verb="talk"
        label="the bookseller"
        position={[1.2, 0, 9.9]}
        radius={2.2}
        priority={-1}
        enabled={() => !done('letter') && !hasLetter}
        onInteract={() => {
          setHasLetter(true)
          audio.cue('memory')
          talk('town.letter.pickup')
        }}
      />
      <Interactable
        id="quiet-man"
        verb="deliver"
        label="the man by the bridge"
        position={[27.5, 0, 16.5]}
        radius={2.4}
        priority={-1}
        enabled={() => hasLetter && !done('letter')}
        onInteract={() => {
          completeTownTask('letter')
          audio.cue('chime')
          talk('town.letter.deliver')
          // The third kindness lights the climb — pan across the square and up
          // the hill to the lamp that now marks the way out.
          setTimeout(() => {
            const lampY = townHeight(HILL_LAMP[0], HILL_LAMP[1])
            void director.play(
              [
                { pos: [-6, 5.4, 6], look: [-18, 2, -10], duration: 0.1 },
                {
                  pos: [-22, 8.6, -4],
                  look: [HILL_LAMP[0], lampY + 3.4, HILL_LAMP[1]],
                  duration: 4.2,
                  ease: 'smoother',
                },
              ],
              { skipAfter: 0.8 },
            )
          }, 3400)
        }}
      />

      {/* Forest exit — over the hill, a few paces past the summit lamp, and only
          once the third kindness has lit the town behind her. */}
      <Trigger
        position={[HILL_EXIT[0], 0, HILL_EXIT[1]]}
        radius={3.4}
        enabled={allDone}
        onEnter={() => {
          useGame.getState().transitionToChapter('forest')
        }}
      />
      {/* Gentle wall if she climbs early: turn her around with a thought. */}
      <Trigger
        position={[-35, 0, -27]}
        radius={3.2}
        enabled={!allDone}
        once={false}
        onEnter={() => {
          const s = useGame.getState()
          if (!s.dialogue) {
            s.startDialogue([
              {
                speaker: null,
                text: 'Little Light. I know it\u2019s hard and confusing. Stay with me. Here.',
              },
            ])
          }
        }}
      />

      <TreeField trees={trees} palette={palette} />
      <GrassField count={900} center={[0, 0]} size={[130, 120]} height={townHeight} accept={accept} colorA={palette.foliageA} colorB={palette.foliageB} seed={61} />
      <FlowerField count={110} center={[-6, 14]} size={[80, 60]} height={townHeight} accept={accept} seed={63} />
      <BushField count={90} center={[-14, 0]} size={[130, 120]} height={townHeight} accept={accept} seed={65} colorA={palette.foliageA} colorB={palette.foliageB} />
      <FernField count={340} center={[-14, 0]} size={[130, 120]} height={townHeight} accept={accept} seed={67} />

      <PeachObject position={[0, townHeight(0, 0) + 3.9, -2]} scale={0.5} emissive={allDone} float />
      <PettableDog id="durk-town" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[20, townHeight(20, -16), -16]} behavior="fireflies" roamRadius={1.1} seed={23} groundHeight={townHeight} />
      <PettableDog id="apollo-town" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[-16.4, townHeight(-16.4, 10.6), 10.6]} behavior="fireflies" roamRadius={1.45} seed={24} groundHeight={townHeight} />
      <Particles kind="pollen" count={36} center={[0, 2, 0]} size={[44, 4, 40]} seed={71} />
      <Particles kind="firefly" count={allDone ? 40 : 12} center={[20, 1.4, -16]} size={[24, 3, 18]} color={palette.accentWarm} seed={73} />
      <Butterflies count={7} center={[8, 0, 6]} radius={14} />
      <Birds count={8} center={[0, 0, -20]} altitude={38} radius={90} />
    </SceneKit>
  )
}

const squareColor = new THREE.Color('#c9b493')
const roadColor = new THREE.Color('#c5a17c')

function townTint(x: number, z: number) {
  if (Math.hypot(x, z) < 9.5) return squareColor
  if (onRoad(x, z)) return roadColor
  return null
}
