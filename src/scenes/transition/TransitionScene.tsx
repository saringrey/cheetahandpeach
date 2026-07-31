import { useMemo, useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SceneKit, Trigger, useObjective, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import {
  TreeField,
  GrassField,
  FlowerField,
  MushroomField,
  BushField,
  FernField,
  RockField,
  LogField,
  LightShafts,
  type TreeSpec,
} from '../../systems/environment/nature'
import { SupercellStorm } from '../../systems/environment/Environment'
import {
  Lantern,
  Streetlight,
  BuildingSilhouette,
  GlowSign,
  Fence,
  Guardrail,
  StoneMarker,
  Bench,
  Signpost,
  Clutter,
  TelegraphPole,
} from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { Birds, Butterflies, PettableDog, APOLLO_NAME, Watcher } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES, mixPalette, type Palette } from '../../systems/environment/palettes'
import { mulberry32, fbm, distToPath, clamp01, smoothstep } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { director } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { APPROACH_SONG } from '../../content/finalMessage'
import { DESCENT_REASSURANCES } from '../../content/whispers'
import { audio } from '../../systems/audio/audio'
import { runtime } from '../../store/runtime'
import { geo } from '../../utils/assets'

const startPalette = PALETTES.mountain
const endPalette = PALETTES.parkingLot

/**
 * The descent. A single curved road ~310m long running north (fantasy)
 * to south (reality). Everything about the scene is a function of
 * progress along that road:
 *   fantasy trees → roadside trees, lanterns → streetlights, stone → cracked
 *   pavement, orchestral layers → thinning pad, fireflies → dust and moths,
 *   mountains behind → low buildings ahead.
 * No text explains it. She just walks.
 */

export const DESCENT_START_Z = 146
export const DESCENT_END_Z = -148

const ROAD: [number, number][] = [
  [0, DESCENT_START_Z],
  [-10, 124],
  [-4, 102],
  [10, 80],
  [14, 58],
  [5, 36],
  [-9, 14],
  [-13, -8],
  [-3, -30],
  [11, -52],
  [13, -74],
  [3, -96],
  [-9, -118],
  [-2, -136],
  [7, DESCENT_END_Z],
]

function progressOf(z: number) {
  return clamp01((DESCENT_START_Z - z) / (DESCENT_START_Z - DESCENT_END_Z))
}

/**
 * Telegraph poles down the real half of the road, wired to each other.
 *
 * They start where the streetlights do — the moment the world stops being
 * fantasy — and march ahead of her all the way to the town. The line of wire is
 * the thing that makes the empty half of this chapter read as going somewhere.
 */
const TELEGRAPH_POLES: [number, number][] = [
  [-16, 2],
  [-10, -20],
  [1, -42],
  [15, -64],
  [15, -86],
  [7, -108],
  [-7, -128],
  [-1, -144],
]

/**
 * Where each descent reassurance fires, north to south.
 *
 * Spaced unevenly on purpose: evenly spaced encouragement reads as a progress
 * bar, and the one thing this walk must not feel like is a progress bar.
 */
const DESCENT_REASSURANCE_POINTS: [number, number][] = [
  [-6, 112],
  [12, 66],
  [-11, 6],
  [12, -62],
  [-5, -124],
]

function transitionHeight(x: number, z: number) {
  const p = progressOf(z)
  // The mountain's foothills flatten into roadside verge.
  const descent = (1 - p) * (1 - p) * 26
  const rolling = fbm(x * 0.04 + 21, z * 0.03, 3) * 2.6 * (1 - p * 0.85)
  const roadD = distToPath(x, z, ROAD).dist
  const cut = Math.max(0, 1 - roadD / 3.4) * -0.9 * (1 - p * 0.4)
  const walls = Math.max(0, Math.abs(x) - 26) * (0.8 - p * 0.55)
  return descent + rolling * clamp01(roadD / 4) + cut + walls
}

function onRoad(x: number, z: number) {
  return distToPath(x, z, ROAD).dist < 2.8
}

/** Palette + score density follow her progress down the road. */
function TransitionDriver({ onPalette }: { onPalette: (p: Palette, t: number) => void }) {
  const last = useRef(-1)
  useFrame(() => {
    const p = smoothstep(progressOf(runtime.playerPos.z))
    if (Math.abs(p - last.current) > 0.035) {
      last.current = p
      onPalette(mixPalette(startPalette, endPalette, p), p)
      // The score sheds layers as the world grows ordinary.
      audio.setMusicIntensity(1 - p * 0.72)
    }
  })
  return null
}

/**
 * Old roots cross only the woodland half of the footpath. One instanced draw
 * call keeps them cheap; they are visual texture, never collision traps.
 */
function TrailRoots() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#514337'),
        roughness: 1,
        metalness: 0,
      }),
    [],
  )
  const roots = useMemo(
    () =>
      [
        [-8, 119, 1.25, 2.7],
        [-1, 98, 1.75, 2.2],
        [9, 77, 1.2, 3.1],
        [11, 56, 1.65, 2.5],
        [3, 35, 1.28, 2.8],
        [-8, 14, 1.8, 2.3],
        [-11, -7, 1.38, 2.6],
      ] as const,
    [],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < roots.length; i++) {
      const [x, z, rotation, length] = roots[i]
      dummy.position.set(x, transitionHeight(x, z) + 0.075, z)
      dummy.rotation.set(Math.PI / 2, rotation, 0)
      dummy.scale.set(0.16, length, 0.16)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [roots])

  useLayoutEffect(() => () => mat.dispose(), [mat])

  return (
    <instancedMesh
      ref={ref}
      args={[geo.cylinder(7), mat, roots.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

export function TransitionScene() {
  const [blend, setBlend] = useState<{ palette: Palette; t: number }>({ palette: startPalette, t: 0 })

  // The parking-lot song is decoded during the long descent so scene entry can
  // start it immediately instead of spending the arrival waiting on an MP3.
  useEffect(() => {
    void audio.preloadOptional(APPROACH_SONG)
  }, [])

  // Opens looking all the way down the road she is about to walk, then settles
  // behind her shoulder where the gameplay camera lives, so control coming back
  // is unmistakable.
  useSceneIntro(() => {
    void director.play(
      [
        {
          pos: [8, transitionHeight(8, 134) + 10, 134],
          look: [4, transitionHeight(4, 36) + 2, 36],
          duration: 0.1,
        },
        {
          pos: [1.6, transitionHeight(0, DESCENT_START_Z) + 2.3, DESCENT_START_Z + 4.5],
          look: [0, transitionHeight(0, DESCENT_START_Z - 4) + 1.2, DESCENT_START_Z - 4],
          duration: 3.8,
          ease: 'smoother',
        },
      ],
      { skipAfter: 0.6 },
    )
  }, 0.35)

  useObjective([7, 0, DESCENT_END_Z], 'the lights below')

  const onPalette = useCallback((palette: Palette, t: number) => setBlend({ palette, t }), [])

  const p = blend.t

  // ── population, all placed once, styled by their own road progress ──────
  const treeGroups = useMemo(() => {
    const rand = mulberry32(707)
    const pines: TreeSpec[] = []
    const oaks: TreeSpec[] = []
    const birches: TreeSpec[] = []
    const roadside: TreeSpec[] = []

    for (let i = 0; i < 740; i++) {
      const z = DESCENT_START_Z - rand() * (DESCENT_START_Z - DESCENT_END_Z + 8)
      const x = (rand() - 0.5) * 64
      // Keep the long tracking camera clear while the woods close in beyond it.
      if (distToPath(x, z, ROAD).dist < 4.7) continue
      const prog = progressOf(z)
      // Two breathing spaces: one turns back toward the storm, one opens toward
      // the first town lights. Everything else closes around the path.
      if (Math.hypot(x + 15, z - 84) < 11) continue
      if (Math.hypot(x - 14, z + 72) < 13) continue
      if (prog > 0.82 && rand() < 0.62) continue

      const tree: TreeSpec = {
        x,
        z,
        y: transitionHeight(x, z),
        scale: 0.72 + rand() * 1.18,
        rotation: rand() * Math.PI * 2,
      }

      if (prog > 0.6) {
        tree.style = 'roadside'
        tree.scale = 0.72 + rand() * 0.72
        roadside.push(tree)
      } else {
        const kind = rand()
        if (kind < 0.42) {
          tree.style = 'pine'
          pines.push(tree)
        } else if (kind < 0.82) {
          tree.style = 'round'
          tree.scale = (tree.scale ?? 1) * 1.08
          oaks.push(tree)
        } else {
          tree.style = 'round'
          tree.scale = (tree.scale ?? 1) * 0.82
          birches.push(tree)
        }
      }
    }
    return { pines, oaks, birches, roadside }
  }, [])

  // Lanterns for the first half, streetlights for the second.
  const lights = useMemo(() => {
    const out: { x: number; z: number; kind: 'lantern' | 'street' }[] = []
    for (let i = 0; i < ROAD.length - 1; i++) {
      const [x, z] = ROAD[i]
      const prog = progressOf(z)
      const side = i % 2 === 0 ? 3.4 : -3.4
      out.push({ x: x + side, z: z - 4, kind: prog > 0.52 ? 'street' : 'lantern' })
    }
    return out
  }, [])

  const accept = useCallback((x: number, z: number) => !onRoad(x, z), [])
  const acceptFantasy = useCallback(
    (x: number, z: number) => !onRoad(x, z) && progressOf(z) < 0.64,
    [],
  )
  const acceptReal = useCallback(
    (x: number, z: number) => !onRoad(x, z) && progressOf(z) > 0.52,
    [],
  )
  const acceptWildGrowth = useCallback(
    (x: number, z: number) => !onRoad(x, z) && progressOf(z) < 0.57,
    [],
  )
  const acceptRoadsideGrowth = useCallback(
    (x: number, z: number) => !onRoad(x, z) && progressOf(z) >= 0.57,
    [],
  )

  const shafts = useMemo<[number, number, number][]>(
    () => [
      [-7, transitionHeight(-7, 122), 122],
      [12, transitionHeight(12, 80), 80],
      [-10, transitionHeight(-10, 38), 38],
      [7, transitionHeight(7, 4), 4],
      [-8, transitionHeight(-8, -34), -34],
    ],
    [],
  )

  return (
    <SceneKit
      chapter="transition"
      palette={blend.palette}
      height={transitionHeight}
      bounds={{ minX: -34, maxX: 36, minZ: -154, maxZ: 152 }}
      spawn={{ position: [0, 0, DESCENT_START_Z - 2], facing: Math.PI }}
      ambience="transition"
      music="transition"
      stars={0.74 - p * 0.58}
      wind={1.1 - p * 0.5}
      surface={p > 0.62 ? 'asphalt' : 'gravel'}
      guideAfter={24}
      mist={1.55 - p * 0.62}
      mistHeight={1.35 - p * 0.42}
      mistColor={p > 0.58 ? '#121a2a' : '#1a2638'}
      shadowRadius={42}
      fogLayer={13 - p * 5}
      fogGround={0.72 - p * 0.26}
      volumetricLight={0.095}
    >
      <TransitionDriver onPalette={onPalette} />
      <CameraFraming distance={5.04} lookHeight={1.08} />

      <Terrain
        height={transitionHeight}
        width={74}
        depth={312}
        step={2}
        palette={startPalette}
        tint={transitionTint}
      />

      <TrailRoots />

      {/* A side opening keeps the mountain storm in the same world during the
          first third of the descent. Trees, not a UI beat, eventually hide it. */}
      <SupercellStorm position={[-58, 42, -42]} scale={0.78} seed={2907} thunder={false} />

      {/* fence on the fantasy half gives way to roadside guardrail on the real one */}
      <Fence points={[[-13, 122], [-8, 106], [1, 91]]} collide={false} />
      <Fence points={[[17, 60], [11, 44], [1, 31]]} collide={false} />
      <Guardrail points={[[-16, -10], [-11, -28], [0, -43]]} />
      <Guardrail points={[[14, -58], [14, -78], [7, -98]]} />
      <Guardrail points={[[5, -102], [-3, -120], [5, -138]]} />

      {lights.map((l, i) =>
        l.kind === 'lantern' ? (
          <Lantern key={i} position={[l.x, transitionHeight(l.x, l.z), l.z]} realLight={i % 3 === 0} intensity={3.4} />
        ) : (
          <Streetlight key={i} position={[l.x, transitionHeight(l.x, l.z), l.z]} on realLight={i % 3 === 0} intensity={14} color={endPalette.accentWarm} />
        ),
      )}

      {/* low buildings rise ahead as the mountains sink behind */}
      <BuildingSilhouette position={[-26, transitionHeight(-26, -126), -126]} width={18} height={7} litWindows={3} windowColor="#cfd8e8" />
      <BuildingSilhouette position={[24, transitionHeight(24, -118), -118]} width={13} height={5} litWindows={2} color="#2b3040" windowColor="#c8d2e4" />
      <BuildingSilhouette position={[-16, transitionHeight(-16, -142), -142]} width={10} height={9} litWindows={4} color="#3a404c" />
      {/* More of them, further out and dimmer, so the town ahead has depth
          instead of being three cut-outs on an empty plain. */}
      <BuildingSilhouette position={[34, transitionHeight(34, -140), -140]} width={15} height={6} litWindows={2} color="#252a35" windowColor="#b8c4da" />
      <BuildingSilhouette position={[-34, transitionHeight(-34, -112), -112]} width={11} height={4.5} litWindows={1} color="#22262f" />
      <BuildingSilhouette position={[7, transitionHeight(7, -160), -160]} width={38} height={6.6} litWindows={2} color="#202630" windowColor="#536073" />
      <group position={[7, transitionHeight(7, -160) + 4.7, -156.8]}>
        <GlowSign
          position={[0, 0, 0]}
          text="JEWEL"
          color="#ed1731"
          coreColor="#ff4052"
          width={5.4}
          height={1.2}
          light={false}
        />
      </group>

      {/* Roadside civilisation, arriving in the order you would actually meet
          it walking out of the mountains: a milestone, then a bench nobody
          waits at, then poles carrying wire, then a signpost that names the
          ordinary world. Each one is a beat of "someone else has been here". */}
      <StoneMarker position={[-6.6, transitionHeight(-6.6, 108), 108]} scale={1.1} />
      <StoneMarker position={[15.8, transitionHeight(15.8, 58), 58]} scale={0.9} />
      <Bench position={[-16.4, transitionHeight(-16.4, 82) + 0.06, 82]} rotation={1.42} />
      <Bench position={[-15.4, transitionHeight(-15.4, -18) + 0.06, -18]} rotation={1.35} />

      {TELEGRAPH_POLES.map(([x, z], i) => (
        <TelegraphPole
          key={i}
          position={[x, transitionHeight(x, z), z]}
          next={
            TELEGRAPH_POLES[i + 1]
              ? [
                  TELEGRAPH_POLES[i + 1][0],
                  transitionHeight(TELEGRAPH_POLES[i + 1][0], TELEGRAPH_POLES[i + 1][1]),
                  TELEGRAPH_POLES[i + 1][1],
                ]
              : null
          }
        />
      ))}

      <Signpost
        position={[17.6, transitionHeight(17.6, -78), -78]}
        rotation={-0.4}
        arms={[
          { text: 'Town  2 mi', angle: 0.35, height: 2.16 },
          { text: 'The mountain', angle: 2.9, height: 1.78 },
        ]}
      />
      <Clutter position={[-16.5, 0, -88]} rotation={0.7} seed={21} />
      <Clutter position={[16.5, 0, -112]} rotation={-1.1} seed={22} />

      {/* The last of them, standing at the roadside as she walks out of it. */}
      <Watcher position={[-11.5, transitionHeight(-11.5, 96), 96]} rotation={1.5} seed={41} appearance={{ top: '#2a2933' }} />
      <Watcher position={[13.2, transitionHeight(13.2, 30), 30]} rotation={-1.3} seed={42} appearance={{ top: '#302e38', height: 1.02 }} />
      <Watcher position={[-9.4, transitionHeight(-9.4, -28), -28]} rotation={0.7} seed={43} appearance={{ top: '#2d2b35' }} />

      {/* His voice, five times down the length of the road.
          They are `Trigger` volumes rather than a distance check so each one is
          tied to a place she can picture afterwards, and each fires once. The
          `once` default means walking back and forth cannot farm them. */}
      {DESCENT_REASSURANCE_POINTS.map(([x, z], i) => (
        <Trigger
          key={`reassure-${i}`}
          position={[x, 0, z]}
          radius={9}
          onEnter={() => {
            const s = useGame.getState()
            if (s.dialogue || s.cinematic) return
            s.showWhisper(DESCENT_REASSURANCES[i], 'love')
          }}
        />
      ))}

      {/* one ordinary wildflower, worth noticing */}
      <Interactable
        id="wildflower"
        verb="inspect"
        label="a roadside flower"
        position={[6, 0, -100]}
        radius={2}
        onInteract={() => useGame.getState().startDialogue(getDialogue('transition.wildflower'))}
      />
      <FlowerField count={5} center={[6, -100]} size={[2, 2]} height={transitionHeight} seed={151} colors={['#e8d8b0']} scale={0.8} />

      <Trigger
        position={[7, 0, DESCENT_END_Z]}
        radius={4}
        onEnter={() => {
          useGame.getState().transitionToChapter('parkingLot', '', { mode: 'dissolve' })
        }}
      />

      <TreeField trees={treeGroups.pines} palette={startPalette} style="pine" trunkColor="#554737" canopyA="#31453d" canopyB="#23372f" sway={0.065} />
      <TreeField trees={treeGroups.oaks} palette={startPalette} style="round" trunkColor="#5a493a" canopyA="#405444" canopyB="#2e4235" sway={0.052} />
      {/* Pale trunks in close clusters make the birches read immediately without
          adding unique geometry or texture fetches. */}
      <TreeField trees={treeGroups.birches} palette={startPalette} style="round" trunkColor="#c8c2ad" canopyA="#65735b" canopyB="#4f604a" collideRadius={0.42} sway={0.07} />
      <TreeField trees={treeGroups.roadside} palette={endPalette} style="roadside" trunkColor="#55504a" canopyA="#465548" canopyB="#354239" sway={0.036} />

      <PettableDog id="durk-transition" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[8.5, transitionHeight(8.5, 46), 46]} behavior="fireflies" roamRadius={1.15} seed={67} groundHeight={transitionHeight} />
      <PettableDog id="apollo-transition" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[-11.8, transitionHeight(-11.8, -70), -70]} behavior="sleep" rotation={0.8} seed={68} />
      <GrassField count={1250} center={[0, 63]} size={[66, 166]} height={transitionHeight} accept={acceptWildGrowth} colorA={startPalette.foliageA} colorB={startPalette.foliageB} seed={153} bladeHeight={0.48} />
      <GrassField count={650} center={[0, -84]} size={[66, 128]} height={transitionHeight} accept={acceptRoadsideGrowth} colorA={endPalette.foliageA} colorB={endPalette.foliageB} seed={154} bladeHeight={0.38} sway={0.1} />
      {/* magical flowers only on the fantasy half; plain verge on the real half */}
      <FlowerField count={170} center={[0, 64]} size={[58, 160]} height={transitionHeight} accept={acceptFantasy} seed={157} />
      <FlowerField count={85} center={[0, -82]} size={[60, 132]} height={transitionHeight} accept={acceptReal} seed={159} colors={['#d8cfa8', '#c9c0a0', '#b7af91']} scale={0.68} />
      <MushroomField count={120} center={[0, 58]} size={[60, 168]} height={transitionHeight} accept={acceptFantasy} seed={160} capColor="#8a5b53" glowColor="#99c8bd" />
      <BushField count={165} center={[0, 63]} size={[66, 166]} height={transitionHeight} accept={acceptWildGrowth} seed={161} colorA={startPalette.foliageA} colorB={startPalette.foliageB} />
      <BushField count={70} center={[0, -84]} size={[66, 128]} height={transitionHeight} accept={acceptRoadsideGrowth} seed={162} colorA={endPalette.foliageA} colorB={endPalette.foliageB} scale={0.84} />
      <FernField count={820} center={[0, 24]} size={[64, 252]} height={transitionHeight} accept={accept} seed={163} />
      <RockField count={54} center={[0, 58]} size={[64, 178]} height={transitionHeight} accept={acceptFantasy} seed={165} color="#596158" scale={1.08} />
      <RockField count={24} center={[0, -88]} size={[60, 116]} height={transitionHeight} accept={acceptReal} seed={166} color="#72736f" scale={0.72} collide={false} />
      <LogField count={28} center={[0, 54]} size={[62, 190]} height={transitionHeight} accept={acceptFantasy} seed={168} color="#4e4034" />
      <LightShafts positions={shafts} color="#b7c9ee" opacity={0.08} height={15} radius={2.1} tilt={0.24} />

      {/* fireflies thin out; dust and moths take over */}
      <Particles kind="firefly" count={Math.round(46 * (1 - p))} followPlayer center={[0, 1.2, 0]} size={[32, 3, 32]} seed={161} />
      <Particles kind="dust" count={Math.round(10 + 34 * p)} followPlayer center={[0, 1.6, 0]} size={[28, 4, 28]} seed={163} opacity={0.35} />
      <Particles kind="moth" count={Math.round(8 + 9 * (1 - p))} followPlayer center={[0, 2.3, 0]} size={[24, 4, 24]} seed={164} opacity={0.42} />
      <Particles kind="leaf" count={24} followPlayer center={[0, 5, 0]} size={[38, 8, 38]} color={p > 0.5 ? '#8f8468' : '#b8863f'} seed={167} />
      <Butterflies count={8} center={[-12, 0, 88]} radius={13} height={1.1} colors={['#c9b78e', '#d7c6a2', '#aeb99a']} seed={169} />
      <Birds count={9} center={[0, 0, -18]} altitude={34} radius={120} color="#30394a" seed={170} />
    </SceneKit>
  )
}

const stoneColor = new THREE.Color('#b0a690')
const asphaltColor = new THREE.Color('#5e5f63')
const TRANSITION_COLOR_STEPS = 32
const transitionGroundBands = Array.from({ length: TRANSITION_COLOR_STEPS + 1 }, (_, i) => {
  const palette = mixPalette(startPalette, endPalette, i / TRANSITION_COLOR_STEPS)
  const low = new THREE.Color(palette.groundB)
  const high = new THREE.Color(palette.groundA)
  return Array.from({ length: 12 }, (_unused, band) =>
    low.clone().lerp(high, band / 11),
  )
})
const transitionRoadColors = Array.from(
  { length: TRANSITION_COLOR_STEPS + 1 },
  (_, i) => stoneColor.clone().lerp(asphaltColor, i / TRANSITION_COLOR_STEPS),
)

// Ground and road change by geography, not by rebuilding every instanced field
// while the player walks. The world can stay behind her without changing skin.
function transitionTint(x: number, z: number, y: number) {
  const p = progressOf(z)
  const step = Math.round(p * TRANSITION_COLOR_STEPS)
  if (onRoad(x, z)) {
    const roadStep = Math.round(
      smoothstep((p - 0.34) / 0.4) * TRANSITION_COLOR_STEPS,
    )
    return transitionRoadColors[roadStep]
  }
  const heightBand = Math.round(clamp01(y / 14 + 0.35) * 11)
  return transitionGroundBands[step][heightBand]
}
