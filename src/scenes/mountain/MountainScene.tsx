import { useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SceneKit, Trigger, useObjective, useSceneIntro, CameraFraming } from '../SceneKit'
import { Terrain } from '../../systems/environment/Terrain'
import { SupercellStorm } from '../../systems/environment/Environment'
import { TreeField, GrassField, FlowerField, RockField, RockTrail, BushField, LogField, type TreeSpec } from '../../systems/environment/nature'
import { StoneMarker, WindChimes, Lantern, Bench, Fence } from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { PettableDog, APOLLO_NAME, Watcher } from '../../systems/environment/creatures'
import { Interactable } from '../../game/interactions/interactions'
import { PALETTES, mixPalette, type Palette } from '../../systems/environment/palettes'
import { mulberry32, fbm, distToPath, clamp01 } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { director } from '../../game/camera/director'
import { getDialogue } from '../../content/dialogue'
import { CONSTELLATIONS, CONNECT_HOLD_SECONDS, type Constellation } from '../../content/constellations'
import { audio } from '../../systems/audio/audio'
import { geo, glow } from '../../utils/assets'
import { runtime } from '../../store/runtime'
import { frameInput } from '../../game/input/frame'

const dayPalette = PALETTES.mountain

/**
 * A switchback path climbing south→north up the mountainside, with three
 * overlooks. The final overlook is the constellation terrace. Sunset deepens
 * into night as she climbs (palette blends on altitude). The descent path
 * unlocks after the third constellation.
 */

const TRAIL: [number, number][] = [
  [0, 44],
  [-10, 34],
  [-16, 22],
  [-8, 12],
  [6, 8],
  [16, 0],
  [10, -10],
  [-4, -14],
  [-14, -22],
  [-8, -32],
  [4, -36],
  [14, -40],
]

/** Overlook terrace + descent gate positions. */
const OVERLOOK_1: [number, number] = [-16, 22]
const OVERLOOK_2: [number, number] = [10, -10]
const TERRACE: [number, number] = [4, -36]
const DESCENT: [number, number] = [22, -44]
const STORM_POSITION: [number, number, number] = [-8, 28, -154]

function mountainHeight(x: number, z: number) {
  // Elevation rises northward along the trail; the massif looms west and east.
  const climb = clamp01((44 - z) / 88) * 26
  const trailD = distToPath(x, z, TRAIL).dist
  // Carve the trail into the slope so it reads as a ledge.
  const cut = Math.max(0, 1 - trailD / 3.2) * -1.6
  const massif = fbm(x * 0.045 + 11, z * 0.045, 3) * (3.5 + clamp01((44 - z) / 88) * 4)
  const wallW = Math.max(0, -x - 24) * 0.9
  const wallE = Math.max(0, x - 26) * 0.9
  return climb + cut * clamp01(trailD < 6 ? 1 : 0.4) + massif * clamp01(trailD / 5) + wallW + wallE
}

function onTrail(x: number, z: number) {
  return distToPath(x, z, TRAIL).dist < 2.6
}

/** Night falls as she climbs: blend the palette by her progress northward. */
function usePaletteByProgress(): { palette: Palette; night: number } {
  const [state, setState] = useState({ palette: dayPalette, night: 0 })
  const last = useRef(-1)
  useFrame(() => {
    const p = clamp01((44 - runtime.playerPos.z) / 82)
    const night = clamp01((p - 0.45) / 0.5)
    if (Math.abs(night - last.current) > 0.02) {
      last.current = night
      setState({ palette: mixPalette(dayPalette, PALETTES_NIGHT, night), night })
    }
  })
  return state
}

const PALETTES_NIGHT: Palette = {
  ...dayPalette,
  skyHorizon: '#11152c',
  skyZenith: '#02040f',
  skyGlow: '#2d304e',
  fog: '#11162b',
  fogNear: 14,
  fogFar: 100,
  sun: '#9ebce8',
  sunIntensity: 0.42,
  sunDir: [0.72, 0.42, -0.55],
  ambientSky: '#29365f',
  ambientGround: '#12141c',
  ambientIntensity: 0.3,
  groundA: '#2c322d',
  groundB: '#1e2520',
  accentWarm: '#ffb27a',
  bloomIntensity: 1.18,
  saturation: -0.12,
  exposure: 0.64,
  vignette: 0.72,
  brightness: -0.065,
  contrast: 0.22,
}

/* ────────────────────────────────────────────────────────────────────────────
 * Constellation sequence
 * Star points float above the terrace. She stands near the next point and
 * holds E; a line draws to it. No failure state exists.
 * ──────────────────────────────────────────────────────────────────────────── */

function ConstellationRig({
  constellation,
  active,
  onComplete,
}: {
  constellation: Constellation
  active: boolean
  onComplete: () => void
}) {
  const complete = useGame((s) => s.save.constellations.includes(constellation.id))
  const [connected, setConnected] = useState(complete ? constellation.points.length : 1)
  const hold = useRef(0)
  const lineRef = useRef<THREE.Line | null>(null)
  const starsRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Project the 2D points onto a dome section above the terrace.
  const worldPoints = useMemo(() => {
    const az = (constellation.azimuth * Math.PI) / 180
    const el = (constellation.elevation * Math.PI) / 180
    const spread = (constellation.spread * Math.PI) / 180
    const R = 130
    const cx = TERRACE[0]
    const cz = TERRACE[1]
    const baseY = mountainHeight(cx, cz)
    return constellation.points.map(([px, py]) => {
      const a = az + px * spread * 0.5
      const e = el + py * spread * 0.4
      return new THREE.Vector3(
        cx + Math.sin(a) * Math.cos(e) * R,
        baseY + Math.sin(e) * R * 0.62 + 6,
        cz - Math.cos(a) * Math.cos(e) * R,
      )
    })
  }, [constellation])

  const lineGeo = useMemo(() => new THREE.BufferGeometry(), [])
  const lineMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd0a8'), transparent: true, opacity: 0.9, fog: false }),
    [],
  )

  useFrame((state, dt) => {
    // Stars twinkle; connected ones glow steady and larger.
    const m = starsRef.current
    if (m) {
      const t = state.clock.elapsedTime
      worldPoints.forEach((p, i) => {
        const isConnected = i < connected
        const tw = isConnected ? 1 : 0.55 + 0.45 * Math.sin(t * 2 + i * 2.4)
        dummy.position.copy(p)
        dummy.scale.setScalar((isConnected ? 1.6 : 1.0) * tw)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
      })
      m.instanceMatrix.needsUpdate = true
    }

    // Line geometry follows the connection count.
    if (lineRef.current && connected >= 2) {
      lineGeo.setFromPoints(worldPoints.slice(0, connected))
    }

    if (!active || complete || connected >= worldPoints.length) return

    // Hold-to-connect from anywhere on the terrace.
    const dTerrace = Math.hypot(runtime.playerPos.x - TERRACE[0], runtime.playerPos.z - TERRACE[1])
    const s = useGame.getState()
    if (dTerrace < 9 && s.phase === 'playing' && !s.dialogue && !s.cinematic) {
      if (frameInput.interactHeld) {
        hold.current += dt
        s.setPrompt({ verb: 'reveal', label: constellation.name, hold: clamp01(hold.current / CONNECT_HOLD_SECONDS) })
        if (hold.current >= CONNECT_HOLD_SECONDS) {
          hold.current = 0
          audio.cue('constellation')
          setConnected((n) => {
            const next = n + 1
            if (next >= worldPoints.length) {
              setTimeout(onComplete, 700)
            }
            return next
          })
        }
      } else {
        hold.current = Math.max(0, hold.current - dt * 2)
        s.setPrompt({ verb: 'reveal', label: constellation.name, hold: clamp01(hold.current / CONNECT_HOLD_SECONDS) })
      }
    }
  })

  const lineObj = useMemo(() => {
    const l = new THREE.Line(lineGeo, lineMat)
    l.frustumCulled = false
    lineRef.current = l
    return l
  }, [lineGeo, lineMat])

  return (
    <group>
      <instancedMesh ref={starsRef} args={[geo.sphere(8), glow('#ffe8d0', 1, false), worldPoints.length]} frustumCulled={false} />
      <primitive object={lineObj} visible={connected >= 2} />
    </group>
  )
}

export function MountainScene() {
  const constellationsDone = useGame((s) => s.save.constellations)
  const completeConstellation = useGame((s) => s.completeConstellation)
  const { palette, night } = usePaletteByProgress()
  const [terraceReached, setTerraceReached] = useState(false)

  const doneCount = constellationsDone.length
  const allDone = doneCount >= CONSTELLATIONS.length
  const current = CONSTELLATIONS.find((c) => !constellationsDone.includes(c.id)) ?? null

  // This chapter is composed around a horizon landmark. Begin lower than the
  // usual elevated follow angle so the storm survives the handoff from the
  // intro, while still giving the player full camera control afterward.
  useLayoutEffect(() => {
    const previous = runtime.camPitch
    runtime.camPitch = -0.04
    return () => {
      if (Math.abs(runtime.camPitch + 0.04) < 0.001) runtime.camPitch = previous
    }
  }, [])

  // Opens on the massif she has to climb, then comes back down and settles
  // BEHIND her, roughly where the gameplay camera already is. Ending an arrival
  // cinematic on scenery leaves the player looking at a hillside with no idea
  // that control just came back; ending it on her hands the world over.
  useSceneIntro(() => {
    void director.play(
      [
        {
          pos: [9, mountainHeight(9, 40) + 12, 40],
          look: STORM_POSITION,
          duration: 0.1,
          fov: 58,
        },
        {
          pos: [9, mountainHeight(9, 40) + 12, 40],
          look: STORM_POSITION,
          duration: 1.8,
          ease: 'linear',
          fov: 58,
        },
        { pos: [3.2, mountainHeight(0, 50) + 2.4, 50.5], look: [0, mountainHeight(0, 46) + 1.2, 46], duration: 3.4, ease: 'smoother' },
      ],
      { skipAfter: 0.6 },
    )
  }, 0.35)

  useObjective(
    allDone ? [DESCENT[0], 0, DESCENT[1]] : terraceReached ? null : [TERRACE[0], 0, TERRACE[1]],
    allDone ? 'the way down' : 'the terrace',
  )

  const onConstellationDone = useCallback(
    (c: Constellation) => {
      completeConstellation(c.id)
      audio.cue('reveal')
      const s = useGame.getState()
      s.setNarration(c.message)
      setTimeout(() => useGame.getState().setNarration(null), 5200)
      s.showToast('Drawn into the journal — J')
      if (constellationsDone.length + 1 >= CONSTELLATIONS.length) {
        // The third reveals the descent: light it and show it.
        setTimeout(() => {
          void director.play(
            [
              { pos: [TERRACE[0] - 4, mountainHeight(TERRACE[0], TERRACE[1]) + 4, TERRACE[1] + 6], look: [DESCENT[0], mountainHeight(DESCENT[0], DESCENT[1]), DESCENT[1]], duration: 0.1 },
              { pos: [TERRACE[0] + 6, mountainHeight(TERRACE[0], TERRACE[1]) + 5, TERRACE[1] - 2], look: [DESCENT[0] + 6, mountainHeight(DESCENT[0], DESCENT[1]) - 4, DESCENT[1] - 8], duration: 4 },
            ],
            { skipAfter: 1 },
          )
        }, 5600)
      }
    },
    [completeConstellation, constellationsDone.length],
  )

  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(606)
    const out: TreeSpec[] = []
    for (let i = 0; i < 340; i++) {
      const x = (rand() - 0.5) * 60
      const z = (rand() - 0.5) * 100
      // The canopy is wider than its trunk; protect the playable switchbacks.
      if (distToPath(x, z, TRAIL).dist < 4.6) continue
      // Keep the trailhead clear. A canopy four metres from the spawn point
      // filled a third of the opening frame with an unlit black mass.
      if (Math.hypot(x, z - 46) < 9) continue
      // Sparser and more pine-like with altitude.
      const altitude = clamp01((44 - z) / 88)
      if (rand() < altitude * 0.65) continue
      out.push({
        x,
        z,
        y: mountainHeight(x, z),
        scale: (0.7 + rand() * 0.7) * (1 - altitude * 0.3),
        rotation: rand() * Math.PI * 2,
        style: altitude > 0.35 || rand() > 0.5 ? 'pine' : 'round',
      })
    }
    return out
  }, [])

  const accept = useCallback((x: number, z: number) => !onTrail(x, z), [])

  const th = (p: [number, number]) => mountainHeight(p[0], p[1])

  return (
    <SceneKit
      chapter="mountain"
      palette={palette}
      height={mountainHeight}
      bounds={{ minX: -30, maxX: 32, minZ: -48, maxZ: 54 }}
      spawn={{ position: [0, 0, 46], facing: Math.PI }}
      ambience="mountain"
      music={terraceReached ? 'stars' : 'mountain'}
      stars={night}
      wind={1.5}
      surface="gravel"
      guideAfter={14}
      mist={1.4} mistHeight={1.6}
      shadowRadius={40}
    >
      <CameraFraming distance={5.16} lookHeight={1.2} />

      {/* The moving palette belongs to sky, fog, and lights. Keeping terrain and
          instanced vegetation on one authored material set prevents a climb from
          rebuilding hundreds of instance programs as night falls. */}
      <Terrain height={mountainHeight} width={64} depth={106} step={1.4} palette={dayPalette} rockAt={0.75} rockColor="#8f8a80" tint={mountainTint} />

      {/* The storm never comes closer. It is weather as landscape: a huge,
          slowly evolving supercell with heat lightning buried inside it. */}
      <SupercellStorm position={STORM_POSITION} scale={1.14} seed={2907} />

      {/* stone markers pacing the climb */}
      <StoneMarker position={[TRAIL[1][0] + 2, th(TRAIL[1]), TRAIL[1][1]]} />
      <StoneMarker position={[TRAIL[4][0] - 2, th(TRAIL[4]), TRAIL[4][1]]} scale={1.2} />
      <StoneMarker position={[TRAIL[7][0] + 2, th(TRAIL[7]), TRAIL[7][1]]} scale={0.9} />
      <Interactable id="marker-1" verb="inspect" label="a stone marker" position={[TRAIL[1][0] + 2, 0, TRAIL[1][1]]} radius={2} onInteract={() => useGame.getState().startDialogue(getDialogue('mountain.marker1'))} />
      <Interactable id="marker-2" verb="inspect" label="a stone marker" position={[TRAIL[7][0] + 2, 0, TRAIL[7][1]]} radius={2} onInteract={() => useGame.getState().startDialogue(getDialogue('mountain.marker2'))} />

      {/* More markers, so the trail is paced the whole way up rather than in
          three places. Cairns are what a real path accumulates. */}
      <StoneMarker position={[TRAIL[2][0] + 2.4, th(TRAIL[2]), TRAIL[2][1] - 1.6]} scale={0.7} />
      <StoneMarker position={[TRAIL[5][0] - 2.6, th(TRAIL[5]), TRAIL[5][1] + 1.2]} scale={0.8} />
      <StoneMarker position={[TRAIL[9][0] - 2.2, th(TRAIL[9]), TRAIL[9][1] + 1.4]} scale={1.05} />
      <StoneMarker position={[TRAIL[10][0] + 3, th(TRAIL[10]), TRAIL[10][1] + 2.4]} scale={0.65} />

      {/* A scree border of loose stones down the whole ledge, so the switchbacks
          read as a made path from the overlooks above and give the climb a line
          to follow between the cairns. */}
      <RockTrail path={TRAIL} height={mountainHeight} edge={2.2} density={0.7} seed={73} color="#8b857b" />

      {/* Lanterns hung along the switchbacks. Looking back down the mountain and
          seeing the lights of the path you already walked is the whole point of a
          climb, and there was nothing to see before. */}
      {/* A lantern at the trailhead itself. She arrives at (0, 46) and the first
          light was thirteen metres away down the first switchback, which left the
          opening frame of the chapter as unlit rock. */}
      <Lantern position={[2.4, mountainHeight(2.4, 45), 45]} lit realLight intensity={5} color="#ffc98a" />

      {([TRAIL[1], TRAIL[3], TRAIL[5], TRAIL[6], TRAIL[8], TRAIL[9]] as [number, number][]).map(
        ([x, z], i) => (
          <Lantern
            key={`trail-${i}`}
            position={[x + (i % 2 ? 2.2 : -2.2), mountainHeight(x + (i % 2 ? 2.2 : -2.2), z), z]}
            style="hanging"
            height={2.3}
            lit
            realLight={i % 2 === 0}
            intensity={3.6}
            color="#ffc98a"
          />
        ),
      )}

      {/* A rope handrail on the outer edge of the two tightest switchbacks. It
          reads as "this is a long way down" without any actual danger. */}
      <Fence points={[[-19, 26], [-20, 20], [-16, 15]]} collide={false} />
      <Fence points={[[13, -8], [15, -13], [11, -17]]} collide={false} />

      {/* Two on the climb. Thinning out — she is getting above them. */}
      <Watcher position={[TRAIL[2][0] + 4.2, mountainHeight(TRAIL[2][0] + 4.2, TRAIL[2][1] + 2), TRAIL[2][1] + 2]} rotation={2.4} seed={31} appearance={{ top: '#2a2e38' }} />
      <Watcher position={[TRAIL[6][0] - 4.6, mountainHeight(TRAIL[6][0] - 4.6, TRAIL[6][1] - 1.5), TRAIL[6][1] - 1.5]} rotation={-1.1} seed={32} appearance={{ top: '#31303a', height: 0.98 }} />

      {/* wind chimes at overlook one */}
      <WindChimes position={[OVERLOOK_1[0] - 1.5, th(OVERLOOK_1), OVERLOOK_1[1] - 1]} />
      <WindChimes position={[TRAIL[8][0] + 2.6, th(TRAIL[8]), TRAIL[8][1] - 1.4]} />
      <Interactable id="chimes" verb="inspect" label="wind chimes" position={[OVERLOOK_1[0] - 1.5, 0, OVERLOOK_1[1] - 1]} radius={2.2} onInteract={() => useGame.getState().startDialogue(getDialogue('mountain.chimes'))} />

      {/* resting bench at overlook two, looking back over everywhere she has been */}
      <Bench position={[OVERLOOK_2[0] + 2, th(OVERLOOK_2) + 0.05, OVERLOOK_2[1]]} rotation={-2.2} />
      <PettableDog id="durk-mountain" dialogueId="dog.durk" dialogueAgainId="dog.durk.again" position={[OVERLOOK_2[0] + 3.1, th(OVERLOOK_2) + 0.06, OVERLOOK_2[1] - 0.8]} rotation={-2.1} behavior="sleep" seed={53} />
      <PettableDog id="apollo-mountain" name={APOLLO_NAME} coat="apollo" registerToCompass={false} dialogueId="dog.apollo" dialogueAgainId="dog.apollo.again" position={[OVERLOOK_1[0] + 2.4, th(OVERLOOK_1) + 0.06, OVERLOOK_1[1] + 1.6]} rotation={1.2} behavior="sleep" seed={54} />
      <Interactable
        id="rest"
        verb="sit"
        label="the overlook"
        position={[OVERLOOK_2[0] + 2, 0, OVERLOOK_2[1]]}
        radius={2}
        onInteract={() => {
          useGame.getState().startDialogue(getDialogue('mountain.rest'))
          void director.play(
            [
              { pos: [OVERLOOK_2[0] + 4, th(OVERLOOK_2) + 3, OVERLOOK_2[1] + 2], look: [0, th(OVERLOOK_2) - 4, 44], duration: 0.1 },
              { pos: [OVERLOOK_2[0] + 2, th(OVERLOOK_2) + 4, OVERLOOK_2[1] + 6], look: [-10, th(OVERLOOK_2) - 6, 50], duration: 4.5 },
            ],
            { skipAfter: 1 },
          )
        }}
      />

      {/* the terrace */}
      <group position={[TERRACE[0], th(TERRACE), TERRACE[1]]}>
        <mesh geometry={geo.cylinder(20)} material={glow('#2f3352', 0.4, false)} position={[0, 0.02, 0]} scale={[8.5, 0.04, 8.5]} />
        <Lantern position={[-5, 0, 3]} realLight={terraceReached} lit={terraceReached} intensity={3} color="#ffcf9a" />
        <Lantern position={[5, 0, 3]} realLight={terraceReached} lit={terraceReached} intensity={3} color="#ffcf9a" />
      </group>
      <Trigger
        position={[TERRACE[0], 0, TERRACE[1]]}
        radius={7}
        onEnter={() => {
          if (terraceReached) return
          setTerraceReached(true)
          void audio.music('stars')
          void director.play(
            [
              { pos: [TERRACE[0], th(TERRACE) + 2.2, TERRACE[1] + 8], look: [TERRACE[0], th(TERRACE) + 3, TERRACE[1]], duration: 0.1 },
              { pos: [TERRACE[0], th(TERRACE) + 3.4, TERRACE[1] + 10], look: [TERRACE[0] - 20, th(TERRACE) + 60, TERRACE[1] - 90], duration: 5.2 },
            ],
            { skipAfter: 1.4 },
          )
        }}
      />

      {/* constellations — only the current one accepts input */}
      {terraceReached
        ? CONSTELLATIONS.map((c) => (
            <ConstellationRig
              key={c.id}
              constellation={c}
              active={current?.id === c.id}
              onComplete={() => onConstellationDone(c)}
            />
          ))
        : null}

      {/* descent gate */}
      <Trigger
        position={[DESCENT[0], 0, DESCENT[1]]}
        radius={4}
        enabled={allDone}
        onEnter={() => {
          useGame.getState().transitionToChapter('transition')
        }}
      />
      {allDone ? (
        <Particles kind="firefly" count={26} center={[DESCENT[0] - 3, th(TERRACE) - 2, DESCENT[1] + 2]} size={[14, 4, 10]} color="#ffb877" seed={131} />
      ) : null}

      <TreeField trees={trees} palette={dayPalette} sway={0.07} />
      <GrassField count={600} center={[0, 10]} size={[56, 90]} height={mountainHeight} accept={accept} colorA={dayPalette.foliageA} colorB={dayPalette.foliageB} seed={133} bladeHeight={0.3} />
      <FlowerField count={70} center={[0, 0]} size={[50, 90]} height={mountainHeight} accept={accept} seed={137} colors={['#e9e4f2', '#d0d8f0', '#f2d8c9']} scale={0.8} />
      <RockField count={64} center={[0, 0]} size={[58, 100]} height={mountainHeight} accept={accept} seed={139} color="#8f8a80" scale={1.2} />
      <RockField count={40} center={[0, -10]} size={[56, 90]} height={mountainHeight} accept={accept} seed={141} color="#6f6a63" scale={0.6} collide={false} />
      <BushField count={54} center={[0, 14]} size={[54, 80]} height={mountainHeight} accept={accept} seed={143} colorA="#4a5c44" colorB="#33422f" scale={0.85} />
      <LogField count={9} center={[0, 6]} size={[52, 80]} height={mountainHeight} accept={accept} seed={145} color="#5f5a4e" />

      <Particles kind="dust" count={30} followPlayer center={[0, 2, 0]} size={[30, 5, 30]} seed={141} opacity={0.3} />
      <Particles kind="firefly" count={Math.round(14 * (1 - night))} followPlayer center={[0, 1.2, 0]} size={[26, 3, 26]} seed={143} />
    </SceneKit>
  )
}

const trailColor = new THREE.Color('#b0a690')

function mountainTint(x: number, z: number) {
  return onTrail(x, z) ? trailColor : null
}
