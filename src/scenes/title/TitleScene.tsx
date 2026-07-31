import { useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { SkyDome, Lighting, Clouds } from '../../systems/environment/Environment'
import { WindDriver, TreeField, GrassField, FlowerField, type TreeSpec } from '../../systems/environment/nature'
import { Terrain } from '../../systems/environment/Terrain'
import { House, Lantern, PeachObject, CheetahFigure, Fence } from '../../systems/environment/props'
import { Particles } from '../../systems/particles/Particles'
import { Birds } from '../../systems/environment/creatures'
import { PALETTES } from '../../systems/environment/palettes'
import { mulberry32, fbm } from '../../utils/math'
import { geo, glow } from '../../utils/assets'
import { audio } from '../../systems/audio/audio'
import { CONSTELLATIONS } from '../../content/constellations'

const palette = PALETTES.title

/**
 * `RectAreaLight` needs its BRDF lookup tables uploaded before the first one is
 * rendered, or it lights nothing at all. Doing it once at module scope is
 * cheapest and cannot race a mount.
 */
RectAreaLightUniformsLib.init()

/**
 * The cottage's lit front wall, as an actual area of light.
 *
 * The rectangle is placed just off the wall facing out into the meadow, matched
 * to the cottage's rotation so the wash runs down the wall it belongs to. A
 * second, dimmer rectangle lies flat above the grass to catch the ground —
 * `RectAreaLight` is one-sided, so the downward spill has to be its own light.
 *
 * Neither casts shadows (`RectAreaLight` cannot), which is exactly what is wanted
 * here: soft light with no hard edges, at no shadow-map cost.
 */
function CottageWindowLight() {
  const y = titleHeight(8, -26)
  return (
    <group position={[8, y, -26]} rotation={[0, 0.35, 0]}>
      {/* Out of the windows, across the yard.
          `RectAreaLight` intensity is radiance, not an arbitrary scale, and it is
          multiplied by the emitter's area — so the numbers here are far smaller
          than the point lights beside them. At 26 this 8 m² rectangle turned the
          whole front wall into a blown-out white panel. */}
      <rectAreaLight
        color="#ffc98a"
        intensity={2.1}
        width={4.4}
        height={1.9}
        position={[0, 1.75, 2.45]}
        rotation={[0, 0, 0]}
      />
      {/* A softer pool on the grass directly beneath the windows. */}
      <rectAreaLight
        color="#ffb877"
        intensity={0.85}
        width={6.5}
        height={5.5}
        position={[0, 1.1, 3.6]}
        rotation={[-Math.PI / 2.35, 0, 0]}
      />
    </group>
  )
}

function titleHeight(x: number, z: number) {
  // Rolling meadow falling away toward the camera, hills behind.
  const rolling = fbm(x * 0.02, z * 0.02, 3) * 3
  const hillsBack = Math.max(0, -z - 40) * 0.24
  return rolling + hillsBack
}

/**
 * The title constellations belong to the sky, not to the menu DOM.
 *
 * They reuse the same point data as the mountain drawing sequence, but live as
 * distant world-space geometry. The slow title camera therefore gives them
 * parallax with the cottage and treeline instead of pinning them to the glass.
 */
function TitleConstellationSky() {
  const starsRef = useRef<THREE.InstancedMesh>(null)

  const layout = useMemo(() => {
    const stars: THREE.Vector3[] = []
    const segments: THREE.Vector3[] = []

    for (const constellation of CONSTELLATIONS) {
      const centerX = constellation.azimuth * 1.58
      const centerY = 26 + constellation.elevation
      const spread = constellation.spread * 1.08
      const points = constellation.points.map(
        ([x, y]) =>
          new THREE.Vector3(
            centerX + x * spread,
            centerY + y * spread * 0.72,
            -158,
          ),
      )

      points.forEach((point, index) => {
        if (
          points.findIndex((other) => other.distanceToSquared(point) < 0.01) === index
        ) {
          stars.push(point)
        }
        if (index > 0) segments.push(points[index - 1], point)
      })
    }

    return { stars, segments }
  }, [])

  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(layout.segments)
    const material = new THREE.LineBasicMaterial({
      color: '#f9eee6',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      fog: false,
    })
    const object = new THREE.LineSegments(geometry, material)
    object.renderOrder = -20
    object.frustumCulled = false
    return object
  }, [layout.segments])

  useLayoutEffect(() => {
    const mesh = starsRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    layout.stars.forEach((position, index) => {
      const size = 0.62 + ((index * 17) % 7) * 0.08
      dummy.position.copy(position)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [layout.stars])

  useLayoutEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    },
    [line],
  )

  return (
    <group>
      <primitive object={line} />
      <instancedMesh
        ref={starsRef}
        args={[undefined, undefined, layout.stars.length]}
        geometry={geo.sphere(8)}
        material={glow('#fff4e8', 0.92, false)}
        renderOrder={-19}
        frustumCulled={false}
      />
    </group>
  )
}

/**
 * Title scene: a scenic distant view of the cottage under an idle drifting
 * camera. The menu is DOM on top. The world here is the same cottage-yard
 * region the game opens on, seen from further away.
 */
export function TitleScene() {
  const camRig = useRef<THREE.Group>(null)

  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(101)
    const out: TreeSpec[] = []
    for (let i = 0; i < 210; i++) {
      const x = (rand() - 0.5) * 180
      const z = -20 - rand() * 120
      // Keep the view corridor toward the cottage clear.
      if (Math.abs(x - 8) < 14 && z > -70) continue
      out.push({ x, z, y: titleHeight(x, z), scale: 0.85 + rand() * 0.8, rotation: rand() * Math.PI * 2 })
    }
    for (let i = 0; i < 38; i++) {
      const x = (rand() - 0.5) * 160
      const z = 40 + rand() * 30
      // Keep every foreground tree well clear of the drifting camera ellipse.
      if (Math.abs(x - 14) < 40) continue
      out.push({ x, z, y: titleHeight(x, z), scale: 0.7 + rand() * 0.6, rotation: rand() * Math.PI * 2 })
    }
    return out
  }, [])

  useFrame((state) => {
    // Slow drifting camera: an ellipse around the meadow, always looking at the cottage.
    const t = state.clock.elapsedTime * 0.032
    const cam = state.camera
    const x = Math.sin(t) * 16 + 14
    const z = 26 + Math.cos(t * 0.8) * 5
    const y = 4.6 + Math.sin(t * 1.7) * 0.6 + titleHeight(x, z) * 0.3
    cam.position.lerp(new THREE.Vector3(x, y, z), 0.02)
    cam.lookAt(8, 3.4 + titleHeight(8, -26) * 0.5, -30)
  })

  useEffect(() => {
    // Harmless no-ops until the first user gesture unlocks the context.
    void audio.ambience('forest', 3)
    void audio.music('title', 4)
  }, [])

  return (
    <group ref={camRig}>
      <WindDriver strength={0.8} />
      <SkyDome palette={palette} stars={0.85} />
      <TitleConstellationSky />
      <Lighting palette={palette} shadowRadius={50} />
      <Clouds count={9} height={72} spread={380} color="#4a4468" opacity={0.5} />

      <Terrain height={titleHeight} width={280} depth={240} center={[0, -30]} step={2.5} palette={palette} />

      {/* The cottage, seen from across the meadow. */}
      <House
        position={[8, titleHeight(8, -26), -26]}
        rotation={0.35}
        width={5.4}
        depth={4.6}
        height={3.3}
        wall="#f2e3c8"
        roof="#b06b52"
        windowsLit
        collide={false}
      />
      <Fence points={[[2, -20], [14, -21.5], [15.5, -30]]} collide={false} />
      {/* With the meadow this dark, the practicals do all the work: they are the
          only warm thing on screen and the only reason the cottage reads at all.
          Pushed hard on purpose — the contrast is the atmosphere. */}
      <Lantern position={[4.5, titleHeight(4.5, -21), -21]} realLight intensity={15} />
      <Lantern position={[12.5, titleHeight(12.5, -22), -22]} realLight intensity={10} />
      <Lantern position={[-4, titleHeight(-4, -14), -14]} realLight intensity={7} />

      {/* An area light across the cottage's front wall.
          A point light radiates equally in all directions, so the window glow it
          produced was a round hotspot that sat on the wall rather than coming out
          of it. A rectangle the size and shape of the lit face throws a soft,
          directional wash down the wall and across the grass in front — light
          with an edge to it, which is the difference between "a lamp is on
          somewhere" and "that window is lit". Two draw-call-free lights, and the
          uniforms library is initialised once at module scope. */}
      <CottageWindowLight />

      {/* the remaining warmth from inside, spilling further out */}
      <pointLight color="#ffb877" intensity={9} distance={22} decay={2} position={[8, titleHeight(8, -26) + 1.6, -26.5]} />

      <TreeField trees={trees} palette={palette} collide={false} />
      <GrassField
        count={1500}
        center={[10, -20]}
        size={[150, 110]}
        height={titleHeight}
        // Moonlit, not daylit. The old bright greens went muddy rather than dark
        // once the palette dropped, because a saturated hue at low exposure reads
        // as sludge; desaturated cool greens stay legible as grass.
        colorA="#3f5238"
        colorB="#2c3d2b"
        seed={11}
      />
      <FlowerField count={160} center={[10, -12]} size={[110, 70]} height={titleHeight} seed={17} />

      {/* Motifs, quietly present: a distant cheetah silhouette, a peach glow by the door. */}
      <CheetahFigure position={[-26, titleHeight(-26, -44), -44]} rotation={0.7} scale={1.5} animate />
      <PeachObject position={[6.4, titleHeight(6.6, -23.4) + 1.1, -23.4]} scale={0.8} emissive float />

      <Particles kind="firefly" count={90} center={[6, 1.5, -16]} size={[70, 6, 44]} seed={5} />
      <Particles kind="leaf" count={16} center={[0, 6, -10]} size={[80, 8, 60]} color="#8a7048" seed={9} />
      <Birds count={4} center={[0, 0, -60]} altitude={46} radius={110} color="#2a2a38" />
    </group>
  )
}
