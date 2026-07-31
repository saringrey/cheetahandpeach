import { useMemo, useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SceneKit, Trigger, useObjective, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import {
  TreeField,
  GrassField,
  FlowerField,
  MushroomField,
  RockField,
  RockTrail,
  BushField,
  FernField,
  LogField,
  LightShafts,
  Water,
  type TreeSpec,
} from '../../systems/environment/nature'
import { Bench, Lantern, MugPair, PeachObject, CheetahFigure } from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { Birds, Butterflies, Deer, PettableDog, APOLLO_NAME, Watcher } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES } from '../../systems/environment/palettes'
import { mulberry32, fbm, distToPath, } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { director, orbitAround } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { FOREST_MEMORIES, getMemory } from '../../content/memories'
import { audio } from '../../systems/audio/audio'
import { geo, storybook, glow } from '../../utils/assets'
import { runtime } from '../../store/runtime'

const palette = PALETTES.forest

/**
 * The richest region. One winding main path west→east with three loops.
 * Landmarks: the big mother-tree at the centre, the stream along the south,
 * the hidden clearing north-east. Exit east at x≈52 to the crossing.
 */

const MAIN_PATH: [number, number][] = [
  [-46, 0],
  [-32, -3],
  [-18, 2],
  [-6, -2],
  [6, 3],
  [18, -2],
  [30, 4],
  [42, 1],
  [52, 3],
]

const CLEARING_PATH: [number, number][] = [
  [18, -2],
  [22, -10],
  [28, -16],
]

/**
 * Lanterns beside the main path: x, z, and 1 if it casts a real light.
 *
 * Offset alternately either side of the path and deliberately unevenly spaced,
 * so they read as hung by somebody over years rather than installed.
 */
const PATH_LANTERNS: [number, number, 0 | 1][] = [
  [-41, -2.6, 1],
  [-33.5, 0.4, 0],
  [-25, -0.8, 1],
  [-17.5, 4.6, 0],
  [-10, -4.4, 0],
  [-2.5, 1.2, 1],
  [4, 5.6, 0],
  [12, -0.4, 0],
  [20.5, -4.6, 1],
  [27, 6.4, 0],
  [35, 1.4, 0],
  [44, 3.6, 1],
]

const STREAM: [number, number][] = [
  [-40, 16],
  [-22, 13],
  [-4, 15],
  [14, 12],
  [34, 15],
  [50, 13],
]

function forestHeight(x: number, z: number) {
  const rolling = fbm(x * 0.035, z * 0.035, 3) * 2.8
  const rim = Math.max(0, Math.hypot(x * 0.75, z) - 52) * 0.4
  const streamD = distToPath(x, z, STREAM).dist
  const bed = Math.max(0, 1 - streamD / 3.4) * -1.3
  return rolling + rim + bed
}

const WATER_LEVEL = forestHeight(0, 14.6) + 0.28

function onPath(x: number, z: number) {
  return distToPath(x, z, MAIN_PATH).dist < 2 || distToPath(x, z, CLEARING_PATH).dist < 1.8
}

/** Positions for the five memories, spread across the region's loops. */
const MEMORY_SPOTS: Record<string, { pos: [number, number, number]; label: string }> = {
  'pressed-flower': { pos: [-26, 0, -8], label: 'a pressed flower between stones' },
  photograph: { pos: [-8, 0, 10], label: 'a photograph by the stream' },
  ticket: { pos: [8, 0, -10], label: 'a paper ticket tucked into bark' },
  'music-box': { pos: [28, 0, -17], label: 'a small music box in the clearing' },
  'peach-charm': { pos: [38, 0, 8], label: 'a peach-shaped charm glinting' },
}

/** A memory pickup: glowing plinth + the object, with a full pickup sequence. */
function MemoryPickup({ id, onCollected }: { id: string; onCollected: (id: string) => void }) {
  const collected = useGame((s) => s.save.memories.includes(id))
  const spot = MEMORY_SPOTS[id]
  const memory = getMemory(id)
  const group = useRef<THREE.Group>(null)
  const y = forestHeight(spot.pos[0], spot.pos[2])

  useFrame((state) => {
    if (!group.current || collected) return
    const t = state.clock.elapsedTime
    group.current.position.y = y + 0.65 + Math.sin(t * 1.1 + spot.pos[0]) * 0.07
    group.current.rotation.y = t * 0.5
  })

  if (collected || !memory) return null

  const shape = memory.shape

  return (
    <group>
      {/* soft ground glow */}
      <mesh geometry={geo.cylinder(16)} material={glow('#ffd08a', 0.16, false)} position={[spot.pos[0], y + 0.04, spot.pos[2]]} scale={[2, 0.02, 2]} />
      <group ref={group} position={[spot.pos[0], y + 0.65, spot.pos[2]]} scale={1.15}>
        {shape === 'flower' && (
          <>
            <mesh geometry={geo.sphere(10)} material={storybook({ color: '#f6a8b8', roughness: 0.85, rim: 0.5 })} scale={[0.16, 0.09, 0.16]} />
            <mesh geometry={geo.sphere(8)} material={glow('#ffe0a8', 0.9)} scale={0.06} />
          </>
        )}
        {shape === 'photo' && (
          <mesh geometry={geo.plane()} material={storybook({ color: '#f2ead8', roughness: 0.9, rim: 0.4, side: THREE.DoubleSide })} scale={[0.34, 0.28, 1]} />
        )}
        {shape === 'ticket' && (
          <mesh geometry={geo.plane()} material={storybook({ color: '#e8c987', roughness: 0.9, rim: 0.4, side: THREE.DoubleSide })} scale={[0.36, 0.16, 1]} />
        )}
        {shape === 'musicbox' && (
          <mesh geometry={geo.softBox(0.04)} material={storybook({ color: '#8a5a4a', roughness: 0.8, rim: 0.4 })} scale={[0.26, 0.18, 0.2]} />
        )}
        {shape === 'charm' && <PeachObject position={[0, 0, 0]} scale={0.55} emissive />}
        <pointLight color="#ffd08a" intensity={2.4} distance={6.5} decay={2} />
      </group>
      <Interactable
        id={`memory-${id}`}
        verb="collect"
        label={spot.label}
        position={[spot.pos[0], y, spot.pos[2]]}
        radius={2.8}
        onInteract={() => onCollected(id)}
      />
    </group>
  )
}

export function ForestScene() {
  const memories = useGame((s) => s.save.memories)
  const collectMemory = useGame((s) => s.collectMemory)
  const forestFound = FOREST_MEMORIES.filter((m) => memories.includes(m.id)).length
  const allFound = forestFound >= FOREST_MEMORIES.length
  const [reaction, setReaction] = useState(0) // bumps per pickup for the reaction burst
  const [spiritSeen, setSpiritSeen] = useState(false)

  useSceneIntro(() => {
    void director.play(
      [
        { pos: [-44, 5.5, 10], look: [-30, 2, 0], duration: 0.1 },
        { pos: [-36, 3.4, 6], look: [-10, 3, 0], duration: 3.8 },
      ],
      { skipAfter: 0.6 },
    )
  }, 0.35)

  const nextMemory = FOREST_MEMORIES.find((m) => !memories.includes(m.id))
  useObjective(
    allFound
      ? [52, 0, 3]
      : nextMemory
        ? MEMORY_SPOTS[nextMemory.id].pos
        : [52, 0, 3],
    allFound || !nextMemory
      ? 'the far edge of the trees'
      : MEMORY_SPOTS[nextMemory.id].label,
  )

  const onCollected = useCallback(
    (id: string) => {
      const memory = getMemory(id)
      if (!memory) return
      const spot = MEMORY_SPOTS[id]
      const y = forestHeight(spot.pos[0], spot.pos[2])
      const s = useGame.getState()

      audio.cue('memory')
      setReaction((n) => n + 1)

      // Camera emphasis: a slow half-orbit of the spot while the message shows.
      void director
        .play(orbitAround([spot.pos[0], y + 1, spot.pos[2]], 3.4, runtime.camYaw + Math.PI, 1.15, 1.4, 4.6), {
          skipAfter: 1.4,
          returnTime: 1.0,
        })
        .then((result) => {
          if (result === 'cancelled') return
          collectMemory(id)
          s.showToast('Kept in the journal — J')
        })

      setTimeout(() => {
        s.setNarration(memory.message)
        setTimeout(() => useGame.getState().setNarration(null), 4600)
      }, 900)
    },
    [collectMemory],
  )

  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(404)
    const out: TreeSpec[] = []
    // Dense layered clusters, thinned along paths, the stream and the clearing.
    for (let i = 0; i < 860; i++) {
      const x = (rand() - 0.5) * 130
      const z = (rand() - 0.5) * 96
      // Leave a deliberate camera-width tunnel; density belongs beyond it.
      if (
        distToPath(x, z, MAIN_PATH).dist < 4.8 ||
        distToPath(x, z, CLEARING_PATH).dist < 4.2
      ) continue
      if (distToPath(x, z, STREAM).dist < 3.4) continue
      if (Math.hypot(x - 28, z + 17) < 7) continue // hidden clearing
      if (Math.hypot(x - 6, z - 1) < 5) continue // mother tree glade
      out.push({
        x,
        z,
        y: forestHeight(x, z),
        scale: 0.75 + rand() * 1.15,
        rotation: rand() * Math.PI * 2,
        style: rand() > 0.82 ? 'pine' : 'round',
      })
    }
    return out
  }, [])

  const accept = useCallback(
    (x: number, z: number) =>
      !onPath(x, z) && distToPath(x, z, STREAM).dist > 3 && Math.hypot(x - 6, z - 1) > 3,
    [],
  )

  const shafts = useMemo<[number, number, number][]>(
    () => [
      [-18, forestHeight(-18, 4), 4],
      [6, forestHeight(6, 1) + 1, 1],
      [24, forestHeight(24, -12), -12],
      [40, forestHeight(40, 4), 4],
    ],
    [],
  )

  return (
    <SceneKit
      chapter="forest"
      palette={palette}
      height={forestHeight}
      bounds={{ minX: -52, maxX: 58, minZ: -42, maxZ: 34 }}
      spawn={{ position: [-44, 0, 0], facing: Math.PI / 2 }}
      ambience="forest"
      music="forest"
      stars={0.35}
      surface="grass"
      wind={0.85}
      guideAfter={13}
      // Mist tinted toward the forest's own fog rather than its ambient sky: the
      // default ambient teal was brighter than the sky above it, so the bank of
      // mist between the trunks glowed instead of receding.
      mist={1.5}
      mistHeight={1.4}
      mistColor="#0c2226"
    >
      <CameraFraming distance={4.96} lookHeight={1.06} />

      <Terrain
        height={forestHeight}
        width={130}
        depth={100}
        step={1.5}
        palette={palette}
        tint={forestTint}
      />

      <Water width={124} depth={7} position={[2, WATER_LEVEL, 14]} shallow="#2f6b6a" deep="#122a2e" glint={palette.accentWarm} sunDir={palette.sunDir} amplitude={0.05} />

      {/* stepping stones across the stream at the photograph loop */}
      {[-1.2, 0.4, 2].map((dz, i) => (
        <mesh
          key={i}
          geometry={geo.blob()}
          material={storybook({ color: '#8c8a84', roughness: 0.98, rim: 0.24, flatShading: true })}
          position={[-4 + i * 1.4, WATER_LEVEL + 0.18, 13.4 + dz]}
          scale={[1.1, 0.5, 1.0]}
          receiveShadow
          castShadow
        />
      ))}

      {/* the mother tree — the region's central landmark */}
      <group position={[6, forestHeight(6, 1), 1]}>
        <mesh geometry={geo.cylinder(9)} material={storybook({ color: '#5d4432', roughness: 0.95, rim: 0.24 })} position={[0, 2.6, 0]} scale={[1.5, 5.2, 1.5]} castShadow />
        <mesh geometry={geo.blob()} material={storybook({ color: palette.foliageA, roughness: 0.95, rim: 0.36, gradient: 0.3 })} position={[0, 7.2, 0]} scale={[9.5, 6.4, 9.2]} castShadow />
        <mesh geometry={geo.blob()} material={storybook({ color: palette.foliageB, roughness: 0.95, rim: 0.3 })} position={[2.8, 6, 1.6]} scale={[5.4, 4, 5.2]} />
        <pointLight color="#ffc46b" intensity={allFound ? 7 : 2} distance={17} decay={2} position={[0, 4, 0]} />
      </group>

      {/* Lanterns hung from branches along the main path.
          With 340 trees and a moonlit palette the forest floor was legible only
          as darkness — beautiful for two seconds and then just hard to be in.
          These give the path a shape you can follow from a distance, and the
          gaps between them are what make the dark parts feel chosen. */}
      {PATH_LANTERNS.map(([x, z, real], i) => (
        <Lantern
          key={`path-${i}`}
          position={[x, forestHeight(x, z), z]}
          style="hanging"
          height={2.6}
          lit
          realLight={real === 1}
          intensity={4.2}
          color="#ffc98a"
        />
      ))}

      {/* hidden clearing dressing */}
      <Lantern position={[26.4, forestHeight(26.4, -14.8), -14.8]} realLight intensity={3.5} />
      <FlowerField count={40} center={[28, -17]} size={[10, 8]} height={forestHeight} seed={81} bloom={1} colors={['#ffd98a', '#f6a8b8', '#c9a8e8']} />

      {/* sitting spot by the stream */}
      <Bench position={[0.5, forestHeight(0.5, 10.6) + 0.05, 10.6]} rotation={0.2} />
      <Interactable
        id="forest-sit"
        verb="sit"
        label="by the stream"
        position={[0.5, 0, 10.6]}
        radius={1.9}
        onInteract={() => useGame.getState().startDialogue(getDialogue('forest.sit'))}
      />

      {/* Nothing happens here. Two mugs simply overlook the early river bend. */}
      <Bench position={[-36, forestHeight(-36, 8.8) + 0.05, 8.8]} rotation={0} color="#6f5039" />
      <MugPair position={[-36, forestHeight(-36, 8.8) + 0.55, 8.8]} scale={0.84} />

      {/* Three of them in the trees, off the path, watching her go by. */}
      <Watcher position={[-24.5, forestHeight(-24.5, -8.4), -8.4]} rotation={1.2} seed={11} appearance={{ top: '#2c303a', height: 1.02 }} />
      <Watcher position={[6.8, forestHeight(6.8, 9.6), 9.6]} rotation={-2.7} seed={12} appearance={{ top: '#262b33', hair: '#3a2f26' }} />
      <Watcher position={[33.2, forestHeight(33.2, -6.2), -6.2]} rotation={2.9} seed={13} appearance={{ top: '#2f333d', height: 0.96 }} />

      {/* the deer */}
      <Deer position={[-14, forestHeight(-14, -12), -12]} rotation={1.1} />
      <Interactable
        id="forest-deer"
        verb="inspect"
        label="a deer"
        position={[-14, 0, -12]}
        radius={4}
        onInteract={() => useGame.getState().startDialogue(getDialogue('forest.deer'))}
      />

      {/* the cheetah spirit crosses the path once, deeper in */}
      {!spiritSeen && forestFound >= 2 ? (
        <Trigger
          position={[18, 0, -2]}
          radius={4}
          onEnter={() => {
            setSpiritSeen(true)
            useGame.getState().startDialogue(getDialogue('forest.spirit'))
          }}
        />
      ) : null}
      {spiritSeen ? (
        <CheetahFigure position={[22, forestHeight(22, -7), -7]} rotation={-0.9} scale={1.1} emissive animate />
      ) : null}

      {/* ── the five memories ──────────────────────────────────────────── */}
      {FOREST_MEMORIES.map((m) => (
        <MemoryPickup key={m.id} id={m.id} onCollected={onCollected} />
      ))}

      {/* reaction burst: peach particles rise near the latest pickup */}
      {reaction > 0 ? (
        <Particles
          key={reaction}
          kind="ember"
          count={26}
          center={[runtime.playerPos.x, 0.5, runtime.playerPos.z]}
          size={[7, 5, 7]}
          color={palette.accentWarm}
          seed={reaction * 17}
        />
      ) : null}

      {/* exit east once all five are found; a soft thought otherwise */}
      <Trigger
        position={[53, 0, 3]}
        radius={3.4}
        enabled={allFound}
        onEnter={() => {
          useGame.getState().transitionToChapter('crossing')
        }}
      />
      <Trigger
        position={[47, 0, 2]}
        radius={3}
        enabled={!allFound}
        once={false}
        onEnter={() => {
          const s = useGame.getState()
          if (!s.dialogue) {
            s.startDialogue([
              {
                speaker: null,
                text: `Something is still waiting among the trees. ${forestFound} of ${FOREST_MEMORIES.length} memories found.`,
              },
            ])
          }
        }}
      />

      <TreeField trees={trees} palette={palette} sway={0.05} />
      <GrassField count={1780} center={[0, -4]} size={[120, 80]} height={forestHeight} accept={accept} colorA="#4f7a45" colorB="#355830" seed={83} />
      <FlowerField count={140} center={[0, 0]} size={[110, 80]} height={forestHeight} accept={accept} seed={87} colors={['#f6a8b8', '#ffd98a', '#c9a8e8', '#8fd0d8']} />
      {/* Mushrooms wake as she passes. Two patches, so the effect is found
          rather than looked for: a sparse scatter along the whole path and a
          dense ring around the mother-tree where she is certain to walk. */}
      <MushroomField count={90} center={[-8, -6]} size={[100, 70]} height={forestHeight} accept={accept} seed={89} />
      <MushroomField count={38} center={[0, -2]} size={[16, 14]} height={forestHeight} accept={accept} seed={90} capColor="#b45f7a" glowColor="#a8d8ff" />
      <RockField count={26} center={[0, 0]} size={[110, 80]} height={forestHeight} accept={accept} seed={91} />
      {/* A loose stone border down both trails, so the route reads at a glance
          from anywhere in the wood — navigation help that also dresses the dirt. */}
      <RockTrail path={MAIN_PATH} height={forestHeight} seed={71} color="#8a7d6a" />
      <RockTrail path={CLEARING_PATH} height={forestHeight} edge={1.6} seed={72} color="#8a7d6a" />
      <BushField count={214} center={[0, -4]} size={[120, 84]} height={forestHeight} accept={accept} seed={93} colorA="#2f4d2b" colorB="#1e3520" scale={1.15} />
      <FernField count={604} center={[0, -4]} size={[118, 82]} height={forestHeight} accept={accept} seed={95} />
      <LogField count={18} center={[0, -4]} size={[112, 78]} height={forestHeight} accept={accept} seed={97} />

      <LightShafts positions={shafts} opacity={0.09} />
      <PettableDog id="durk-forest" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[9, forestHeight(9, 9.5), 9.5]} behavior="fireflies" roamRadius={1.35} seed={37} groundHeight={forestHeight} />
      <PettableDog id="apollo-forest" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[-19.5, forestHeight(-19.5, 6.4), 6.4]} behavior="fireflies" roamRadius={1.5} seed={38} groundHeight={forestHeight} />
      <Particles kind="firefly" count={70} followPlayer center={[0, 1.2, 0]} size={[36, 3.5, 36]} seed={93} />
      <Particles kind="pollen" count={50} followPlayer center={[0, 1.8, 0]} size={[30, 4, 30]} seed={95} />
      <Particles kind="leaf" count={26} followPlayer center={[0, 7, 0]} size={[40, 9, 40]} color="#b8863f" seed={97} />
      <Butterflies count={9} center={[6, 0, 0]} radius={22} />
      <Birds count={5} center={[0, 0, -10]} altitude={30} radius={70} color="#3a4238" />
    </SceneKit>
  )
}

const pathLight = new THREE.Color('#8c7550')
const pathDark = new THREE.Color('#5c4a31')
const bankColor = new THREE.Color('#6b6b4a')
const dirtTmp = new THREE.Color()

function forestTint(x: number, z: number) {
  if (onPath(x, z)) {
    // Packed-earth mottling: two dirt browns blended by low-frequency noise, so
    // the trail reads as trodden ground with ruts and dry patches rather than a
    // flat painted stripe. Kept near the old average value so it stays legible
    // under the moonlight and lanterns.
    const n = fbm(x * 0.4, z * 0.4, 2) * 0.5 + 0.5
    return dirtTmp.copy(pathDark).lerp(pathLight, n)
  }
  if (distToPath(x, z, STREAM).dist < 3.4) return bankColor
  return null
}
