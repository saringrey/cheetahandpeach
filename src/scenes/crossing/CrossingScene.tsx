import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SceneKit, Trigger, useObjective, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import { Clouds } from '../../systems/environment/Environment'
import { TreeField, GrassField, Water, Reeds, BushField, FernField, LogField, MushroomField, RockField, type TreeSpec } from '../../systems/environment/nature'
import { Lantern, PeachObject, Clutter } from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { Birds, PettableDog, APOLLO_NAME, Watcher } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES } from '../../systems/environment/palettes'
import { mulberry32, fbm, pointOnPath, clamp01, smoothstep } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { director } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { getMemory } from '../../content/memories'
import { audio } from '../../systems/audio/audio'
import { geo, storybook, glow } from '../../utils/assets'
import { runtime } from '../../store/runtime'
import { Girl, type PoseState } from '../../game/character/Girl'
import { sketchbookUi } from '../../ui/sketchbookState'
import { CharacterController } from '../../game/character/CharacterController'
import {
  checkpointIsAfterCrossing,
  CROSSING_ENTRY_SPAWN,
  CROSSING_LANDING_SPAWN,
  crossingCharacterOwner,
} from './crossingState'

const palette = PALETTES.crossing

/** Shared by the mooring posts and the upturned boat — one cached material. */
const mooringWood = storybook({ color: '#6b5039', roughness: 0.95, rim: 0.26, gradient: 0.28 })

/**
 * A lake between two shores. The near shore is west; the far jetty is east.
 * The raft ride is fully guided (~2 minutes): she boards, it glides along a
 * gentle S-curve, she can stand and look around, and it arrives on its own.
 */

const WATER_LEVEL = -0.4

const RAFT_ROUTE: [number, number][] = [
  [-26, 2],
  [-14, -6],
  [2, -2],
  [16, 6],
  [30, 2],
  [40, -1],
]

function crossingHeight(x: number, z: number) {
  // Two shores with a deep basin between them.
  const shoreW = Math.max(0, -x - 30) * 0.35
  const shoreE = Math.max(0, x - 42) * 0.35
  const basin = -2.6 * clamp01(1 - Math.abs(x - 6) / 38) * clamp01(1 - Math.abs(z) / 34)
  const rolling = fbm(x * 0.04 + 3, z * 0.04, 2) * 1.1
  return shoreW + shoreE + basin + rolling
}

/** A hand-sized, weather-softened field book that rides with the raft. */
function RaftSketchbookProp() {
  const cover = useMemo(
    () =>
      storybook({
        color: '#694332',
        roughness: 0.98,
        rim: 0.2,
        gradientColor: '#241b20',
      }),
    [],
  )
  const paper = useMemo(
    () => storybook({ color: '#d8c9ad', roughness: 1, rim: 0.14 }),
    [],
  )
  const binding = useMemo(
    () => storybook({ color: '#8d7358', roughness: 0.65, metalness: 0.08, rim: 0.16 }),
    [],
  )
  const mark = useMemo(
    () => storybook({ color: '#b58a54', roughness: 0.9, rim: 0.12 }),
    [],
  )

  return (
    <group position={[-0.67, 0.2, 0.53]} rotation={[-0.03, -0.2, -0.05]}>
      <mesh
        geometry={geo.softBox(0.055)}
        material={paper}
        position={[0, 0, 0]}
        scale={[0.46, 0.045, 0.58]}
        castShadow
      />
      <mesh
        geometry={geo.softBox(0.065)}
        material={cover}
        position={[0, 0.055, 0]}
        scale={[0.49, 0.035, 0.61]}
        castShadow
      />
      {[[-0.1, -0.08, 0.052], [0.08, 0.01, 0.065], [0.2, -0.14, 0.04]].map(
        ([x, z, scale], index) => (
          <mesh
            key={`mark-${index}`}
            geometry={geo.sphere(8)}
            material={mark}
            position={[x, 0.098, z]}
            scale={[scale, 0.012, scale]}
          />
        ),
      )}
      {[-0.38, -0.13, 0.13, 0.38].map((z) => (
        <mesh
          key={z}
          geometry={geo.torus(8)}
          material={binding}
          position={[-0.48, 0.07, z]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={0.055}
        />
      ))}
    </group>
  )
}

/** The raft ride owns the character while active. */
function RaftRide({ started, onArrived }: { started: boolean; onArrived: () => void }) {
  const raft = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const speedRef = useRef(0)
  const poseRef = useRef<PoseState>('idle')
  const arrived = useRef(false)
  const RIDE_SECONDS = 105

  const wood = useMemo(() => storybook({ color: '#8a6a4a', roughness: 0.94, rim: 0.26 }), [])
  const rope = useMemo(() => storybook({ color: '#c9b48a', roughness: 1, rim: 0.2 }), [])

  useFrame((state, rawDt) => {
    const g = raft.current
    if (!g) return
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime

    if (started && !arrived.current) {
      progress.current = Math.min(1, progress.current + dt / RIDE_SECONDS)
      if (progress.current >= 1) {
        arrived.current = true
        onArrived()
      }
    }

    const [x, z] = pointOnPath(RAFT_ROUTE, smoothstep(progress.current))
    const [nx, nz] = pointOnPath(RAFT_ROUTE, smoothstep(Math.min(1, progress.current + 0.01)))
    g.position.set(x, WATER_LEVEL + 0.18 + Math.sin(t * 0.8) * 0.045, z)
    g.rotation.y = Math.atan2(nx - x, nz - z)
    g.rotation.z = Math.sin(t * 0.6) * 0.014
    g.rotation.x = Math.cos(t * 0.7) * 0.012

    if (started) {
      // She rides the raft: the runtime position follows it so the camera and
      // ambience stay with her.
      runtime.playerPos.set(x, g.position.y + 0.1, z)
      runtime.playerFacing = g.rotation.y
      poseRef.current = progress.current > 0.9 ? 'lookUp' : 'idle'
    }
  })

  return (
    <group ref={raft} position={[RAFT_ROUTE[0][0], WATER_LEVEL + 0.18, RAFT_ROUTE[0][1]]}>
      {/* deck planks */}
      {[-0.9, -0.45, 0, 0.45, 0.9].map((dx) => (
        <mesh key={dx} geometry={geo.softBox(0.04)} material={wood} position={[dx, 0, 0]} scale={[0.42, 0.14, 2.6]} castShadow receiveShadow />
      ))}
      {/* cross beams + pole */}
      <mesh geometry={geo.box()} material={wood} position={[0, 0.1, 1.1]} scale={[2.2, 0.09, 0.14]} />
      <mesh geometry={geo.box()} material={wood} position={[0, 0.1, -1.1]} scale={[2.2, 0.09, 0.14]} />
      <mesh geometry={geo.cylinder(6)} material={wood} position={[0.95, 0.9, -0.9]} rotation={[0.18, 0, 0.12]} scale={[0.05, 1.9, 0.05]} castShadow />
      <mesh geometry={geo.torus(10)} material={rope} position={[-0.95, 0.16, 1.1]} rotation={[Math.PI / 2, 0, 0]} scale={0.24} />
      <RaftSketchbookProp />
      {/* a lantern on the raft, and her, once aboard */}
      <Lantern position={[-0.85, 0.08, -1.0]} style="hanging" height={0.9} realLight intensity={2.6} />
      {started ? (
        <group position={[0.1, 0.08, 0.2]}>
          <Girl speedRef={speedRef} poseRef={poseRef} castShadow />
        </group>
      ) : null}
    </group>
  )
}

export function CrossingScene() {
  const collectMemory = useGame((s) => s.collectMemory)
  const memories = useGame((s) => s.save.memories)
  const [riding, setRiding] = useState(false)
  const [landed, setLanded] = useState(() =>
    checkpointIsAfterCrossing(useGame.getState().save.checkpoint),
  )
  const boardingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boarding = useRef(false)

  useSceneIntro(() => {
    void director.play(
      [
        { pos: [-34, 4, 14], look: [-24, 0.5, 2], duration: 0.1 },
        { pos: [-28, 3, 10], look: [10, 0, 0], duration: 4.2 },
      ],
      { skipAfter: 0.6 },
    )
    void audio.music('crossing')
  }, 0.35)

  useObjective(
    landed ? [46, 0, -2] : riding ? null : [-26, 0, 2],
    landed ? 'the east path' : 'the raft',
  )

  useEffect(() => {
    sketchbookUi.setAvailable(riding)
    return () => sketchbookUi.setAvailable(false)
  }, [riding])

  useEffect(
    () => () => {
      if (boardingTimer.current) clearTimeout(boardingTimer.current)
      boardingTimer.current = null
      runtime.holdControl('raft', false)
      sketchbookUi.setAvailable(false)
    },
    [],
  )

  const boardRaft = useCallback(() => {
    if (boarding.current) return
    boarding.current = true
    const s = useGame.getState()
    runtime.holdControl('raft', true)
    s.startDialogue(getDialogue('crossing.raft'))
    boardingTimer.current = setTimeout(() => {
      boardingTimer.current = null
      setRiding(true)
      audio.cue('chime')
    }, 400)
  }, [])

  const onArrived = useCallback(() => {
    setRiding(false)
    setLanded(true)
    runtime.holdControl('raft', false)
    // Land her on the east jetty.
    runtime.playerPos.set(41, crossingHeight(41, -1), -1)
    runtime.playerFacing = Math.PI / 2
    audio.cue('chime')
  }, [])

  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(505)
    const out: TreeSpec[] = []
    for (let i = 0; i < 235; i++) {
      const x = (rand() - 0.5) * 140
      const z = (rand() - 0.5) * 90
      if (crossingHeight(x, z) < WATER_LEVEL + 0.5) continue
      out.push({
        x,
        z,
        y: crossingHeight(x, z),
        scale: 0.75 + rand() * 0.9,
        rotation: rand() * Math.PI * 2,
        style: rand() > 0.7 ? 'willow' : 'round',
      })
    }
    return out
  }, [])

  const aboveWater = useCallback(
    (x: number, z: number) => crossingHeight(x, z) > WATER_LEVEL + 0.35,
    [],
  )
  const nearWater = useCallback(
    (x: number, z: number) => {
      const h = crossingHeight(x, z)
      return h > WATER_LEVEL - 0.15 && h < WATER_LEVEL + 0.65
    },
    [],
  )

  const hasStone = memories.includes('river-stone')
  const characterOwner = crossingCharacterOwner(riding, landed)

  return (
    <SceneKit
      chapter="crossing"
      palette={palette}
      height={crossingHeight}
      bounds={{ minX: -40, maxX: 50, minZ: -36, maxZ: 36 }}
      spawn={CROSSING_ENTRY_SPAWN}
      ambience="water"
      music="crossing"
      stars={0.6}
      wind={0.7}
      withCharacter={characterOwner === 'scene'}
      guideAfter={15}
      mist={1.8} mistHeight={1.0}
    >
      <CameraFraming distance={riding ? 8.2 : 6.4} lookHeight={riding ? 1.18 : 1.15} />
      <Clouds count={12} height={58} spread={340} opacity={0.6} />

      <Terrain height={crossingHeight} width={140} depth={100} step={1.7} palette={palette} rockAt={0.7} />
      <Water width={120} depth={80} position={[5, WATER_LEVEL, 0]} shallow="#4a7f92" deep="#182a40" glint="#ffb27a" sunDir={palette.sunDir} amplitude={0.1} segments={64} />
      <Reeds count={200} center={[-24, 6]} size={[18, 42]} height={crossingHeight} accept={nearWater} seed={111} />
      <Reeds count={160} center={[38, -2]} size={[14, 40]} height={crossingHeight} accept={nearWater} seed={113} />

      {/* Two on the near shore, watching her decide to get on the raft. */}
      <Watcher position={[-33.5, crossingHeight(-33.5, 9.4), 9.4]} rotation={1.1} seed={21} appearance={{ top: '#2b303a' }} />
      <Watcher position={[-31.2, crossingHeight(-31.2, -6.8), -6.8]} rotation={2.0} seed={22} appearance={{ top: '#33313c', height: 1.03 }} />

      {/* west jetty */}
      <group position={[-26, WATER_LEVEL, 2]}>
        <mesh geometry={geo.softBox(0.04)} material={storybook({ color: '#7d5f42', roughness: 0.94, rim: 0.24 })} position={[1.2, 0.35, 0]} scale={[3.6, 0.16, 1.6]} receiveShadow castShadow />
        {[[-0.4, 0.6], [2.6, 0.6], [-0.4, -0.6], [2.6, -0.6]].map((p, i) => (
          <mesh key={i} geometry={geo.cylinder(6)} material={storybook({ color: '#6b5039', roughness: 0.95 })} position={[p[0], -0.1, p[1]]} scale={[0.12, 0.9, 0.12]} />
        ))}
        <Lantern position={[2.8, 0.42, 0.6]} height={1.4} realLight intensity={3} />
      </group>
      <PettableDog id="durk-crossing" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[-25.9, WATER_LEVEL + 0.45, 2.5]} rotation={-1.1} behavior="sleep" seed={41} />
      <PettableDog id="apollo-crossing" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[-32.4, crossingHeight(-32.4, 2.2), 2.2]} behavior="fireflies" roamRadius={1.3} seed={42} groundHeight={crossingHeight} />
      {/* east jetty */}
      <group position={[41.5, WATER_LEVEL, -1]}>
        <mesh geometry={geo.softBox(0.04)} material={storybook({ color: '#7d5f42', roughness: 0.94, rim: 0.24 })} position={[-1.2, 0.35, 0]} scale={[3.6, 0.16, 1.6]} receiveShadow castShadow />
        {/* The east jetty had a deck and nothing holding it up. */}
        {[[0.4, 0.6], [-2.6, 0.6], [0.4, -0.6], [-2.6, -0.6]].map((p, i) => (
          <mesh key={i} geometry={geo.cylinder(6)} material={storybook({ color: '#6b5039', roughness: 0.95 })} position={[p[0], -0.1, p[1]]} scale={[0.12, 0.9, 0.12]} />
        ))}
        <Lantern position={[-2.6, 0.42, 0.6]} height={1.4} realLight intensity={3} />
      </group>

      {/* Both shores were bare mud between the reeds and the trees. Mooring
          posts, a coil of rope, an upturned boat and a few crates say people
          cross here often — which is what makes one raft waiting for her feel
          like an invitation rather than a puzzle piece. */}
      {([
        [-27.6, 4.4, 0.35],
        [-27.2, -0.6, -0.2],
        [40.6, 2.2, 0.4],
        [42.4, -3.6, -0.3],
      ] as [number, number, number][]).map(([x, z, lean], i) => (
        <mesh
          key={`moor-${i}`}
          geometry={geo.cylinder(7)}
          material={mooringWood}
          position={[x, WATER_LEVEL + 0.35, z]}
          rotation={[lean * 0.12, 0, lean * 0.1]}
          scale={[0.17, 1.5, 0.17]}
          castShadow
        />
      ))}
      {/* An upturned rowing boat drawn up on the west shore. */}
      <group position={[-29.5, crossingHeight(-29.5, 8.5) + 0.28, 8.5]} rotation={[0, 0.7, Math.PI]}>
        <mesh geometry={geo.capsule(10)} material={mooringWood} rotation={[Math.PI / 2, 0, 0]} scale={[0.62, 1.5, 0.62]} castShadow receiveShadow />
        <mesh geometry={geo.softBox(0.04)} material={mooringWood} position={[0, 0, 0.2]} scale={[1.1, 0.07, 0.24]} />
      </group>
      <Clutter position={[-30.5, crossingHeight(-30.5, 4), 4]} rotation={0.5} seed={31} />
      <Clutter position={[44, crossingHeight(44, 2), 2]} rotation={-0.9} seed={32} />
      <Lantern position={[-30.2, crossingHeight(-30.2, 6.2), 6.2]} lit realLight intensity={4} />
      <Lantern position={[44.6, crossingHeight(44.6, -3), -3]} lit realLight intensity={4} />

      <RaftRide started={riding} onArrived={onArrived} />
      {characterOwner === 'landing' ? (
        <CharacterController spawn={CROSSING_LANDING_SPAWN} surface="grass" />
      ) : null}

      {!riding && !landed ? (
        <Interactable
          id="board-raft"
          verb="enter"
          label="the raft"
          position={[-25, 0, 2]}
          radius={2.6}
          onInteract={boardRaft}
        />
      ) : null}

      {/* optional memory on the west shore: a stone from the riverbed */}
      {!hasStone && !riding ? (
        <group position={[-28, crossingHeight(-28, 12), 12]}>
          <mesh
            geometry={geo.cylinder(16)}
            material={glow('#b8d8e0', 0.13, false)}
            position={[0, 0.035, 0]}
            scale={[1.25, 0.02, 1.25]}
          />
          <mesh
            geometry={geo.blob()}
            material={glow('#b8d8e0', 0.9)}
            position={[0, 0.2, 0]}
            scale={[0.38, 0.25, 0.33]}
          />
          <pointLight color="#b8d8e0" intensity={1.4} distance={4.5} decay={2} position={[0, 0.45, 0]} />
          <Interactable
            id="memory-river-stone"
            verb="collect"
            label="a smooth stone"
            position={[-28, 0, 12]}
            radius={2.7}
            onInteract={() => {
              const m = getMemory('river-stone')
              collectMemory('river-stone')
              audio.cue('memory')
              const s = useGame.getState()
              if (m) {
                s.setNarration(m.message)
                setTimeout(() => useGame.getState().setNarration(null), 4600)
              }
              s.showToast('Kept in the journal — J')
            }}
          />
        </group>
      ) : null}

      <Interactable
        id="crossing-reeds"
        verb="inspect"
        label="the reeds"
        position={[-24, 0, 8]}
        radius={2.4}
        enabled={() => !riding}
        onInteract={() => useGame.getState().startDialogue(getDialogue('crossing.reeds'))}
      />

      {/* fish jumps: tiny splashes of glow that pop up on the lake */}
      <FishJumps />

      {/* exit east */}
      <Trigger
        position={[47, 0, -2]}
        radius={3.2}
        enabled={landed}
        onEnter={() => {
          useGame.getState().transitionToChapter('mountain')
        }}
      />

      <TreeField trees={trees} palette={palette} />
      <GrassField count={700} center={[-28, 4]} size={[26, 60]} height={crossingHeight} accept={aboveWater} colorA={palette.foliageA} colorB={palette.foliageB} seed={115} />
      <GrassField count={500} center={[44, 0]} size={[18, 56]} height={crossingHeight} accept={aboveWater} colorA={palette.foliageA} colorB={palette.foliageB} seed={117} />

      <BushField count={70} center={[-28, 4]} size={[26, 62]} height={crossingHeight} accept={aboveWater} seed={125} colorA={palette.foliageA} colorB={palette.foliageB} />
      <BushField count={54} center={[44, 0]} size={[18, 58]} height={crossingHeight} accept={aboveWater} seed={127} colorA={palette.foliageA} colorB={palette.foliageB} />
      <FernField count={300} center={[-28, 4]} size={[26, 62]} height={crossingHeight} accept={aboveWater} seed={129} />
      <FernField count={220} center={[44, 0]} size={[18, 58]} height={crossingHeight} accept={aboveWater} seed={131} />
      <RockField count={26} center={[0, 0]} size={[120, 76]} height={crossingHeight} accept={nearWater} seed={133} color="#6f6a63" scale={0.8} collide={false} />
      {/* Damp shore mushrooms, waking along the walk down to the raft. */}
      <MushroomField count={34} center={[-30, 4]} size={[20, 40]} height={crossingHeight} accept={aboveWater} seed={87} glowColor="#9fd8e8" />

      <LogField count={6} center={[-28, 8]} size={[24, 50]} height={crossingHeight} accept={aboveWater} seed={135} />

      <PeachObject position={[44, crossingHeight(44, -2) + 1.6, -2]} scale={0.6} emissive float />
      <Particles kind="petal" count={26} center={[4, 3, 0]} size={[60, 4, 50]} seed={121} />
      <Particles kind="pollen" count={30} followPlayer center={[0, 1.4, 0]} size={[30, 3, 30]} seed={123} />
      <Birds count={7} center={[6, 0, 0]} altitude={26} radius={70} color="#5a5a66" />
    </SceneKit>
  )
}

/** Occasional fish jump: a small arc of glow + a ripple sound. */
function FishJumps() {
  const ref = useRef<THREE.Mesh>(null)
  const state = useRef({ next: 4, active: 0, x: 0, z: 0 })

  useFrame((frameState, dt) => {
    const s = state.current
    const m = ref.current
    if (!m) return
    if (s.active > 0) {
      s.active -= dt
      const t = 1 - s.active / 0.9
      m.visible = true
      m.position.set(s.x, WATER_LEVEL + Math.sin(t * Math.PI) * 0.6, s.z)
      m.scale.setScalar(0.12 * Math.sin(t * Math.PI) + 0.03)
      if (s.active <= 0) m.visible = false
    } else {
      s.next -= dt
      if (s.next <= 0) {
        s.next = 6 + Math.random() * 12
        s.active = 0.9
        s.x = -6 + Math.random() * 30
        s.z = -14 + Math.random() * 26
        audio.cue('water')
      }
    }
    void frameState
  })

  return <mesh ref={ref} geometry={geo.sphere(8)} material={glow('#b8d8d0', 0.85)} visible={false} />
}
