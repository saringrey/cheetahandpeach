import { useMemo, useRef, useLayoutEffect, memo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Palette } from './palettes'
import { useGame } from '../../store/gameStore'
import { mulberry32 } from '../../utils/math'
import { runtime } from '../../store/runtime'
import { geo, storybook, fogUniforms } from '../../utils/assets'
import { audio } from '../audio/audio'
import { useQualityProfile } from '../performance/useQualityProfile'

/* ────────────────────────────────────────────────────────────────────────────
 * Sky dome
 * A single inverted sphere. Horizon→zenith gradient, a restrained atmospheric
 * lobe and moon disk in the key-light direction, and an optional star layer.
 * One draw call, no textures.
 * ──────────────────────────────────────────────────────────────────────────── */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize( position );
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mv;
  }
`

const SKY_FRAG = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uGlow;
  uniform vec3 uSunDir;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  // Hash for the star field.
  float hash31( vec3 p ) {
    p = fract( p * 0.3183099 + vec3( 0.1, 0.2, 0.3 ) );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
  }

  void main() {
    vec3 dir = normalize( vDir );
    float h = clamp( dir.y * 0.5 + 0.5, 0.0, 1.0 );

    // Bias the gradient toward the horizon so the warm band is generous.
    float t = pow( clamp( dir.y, 0.0, 1.0 ), 0.55 );
    vec3 col = mix( uHorizon, uZenith, t );

    // Below the horizon, settle to a slightly darker version of the horizon color.
    col = mix( uHorizon * 0.72, col, smoothstep( -0.12, 0.06, dir.y ) );

    // Atmospheric lobe around the moon direction.
    float sunAmount = max( dot( dir, normalize( uSunDir ) ), 0.0 );
    col += uGlow * pow( sunAmount, 5.0 ) * 0.55;
    col += uGlow * pow( sunAmount, 60.0 ) * 0.55;

    // A visible source makes the cool directional key read as moonlight rather
    // than as unexplained blue fill. The tight disk and broad weak halo are
    // analytic, so this costs no texture or extra draw call.
    float moonHalo = pow( sunAmount, 96.0 );
    float moonDisk = smoothstep( 0.9991, 0.99978, sunAmount );
    vec3 moonColor = vec3( 0.67, 0.78, 1.0 );
    float moonStrength = 0.42 + uStars * 0.58;
    col += moonColor * ( moonHalo * 0.16 + moonDisk * 1.08 ) * moonStrength;

    // A faint 22-degree ice halo: the classic ring of moonlight refracted by
    // cold, humid air. cos(22°) ≈ 0.927, so the ring lives where the view
    // direction's dot with the moon crosses that value. Purely analytic.
    float haloRing = exp( -pow( ( sunAmount - 0.927 ) * 46.0, 2.0 ) );
    col += moonColor * haloRing * 0.05 * moonStrength;

    // Stars: sparse, twinkling, only above the horizon, only when uStars > 0.
    if ( uStars > 0.001 ) {
      vec3 sp = dir * 140.0;
      vec3 cell = floor( sp );
      float r = hash31( cell );
      float star = step( 0.9955, r );
      if ( star > 0.0 ) {
        vec3 offs = fract( sp ) - 0.5;
        float d = length( offs );
        float tw = 0.65 + 0.35 * sin( uTime * 1.7 + r * 63.0 );
        float bright = smoothstep( 0.34, 0.0, d ) * tw;
        // Peach-tinted starlight, as specified for the overlook.
        vec3 starCol = mix( vec3( 1.0, 0.92, 0.86 ), vec3( 1.0, 0.78, 0.66 ), hash31( cell + 7.0 ) );
        col += starCol * bright * uStars * smoothstep( 0.0, 0.22, dir.y );
      }

      // A second, finer layer of dim stars gives the sky depth without
      // brightening it: the thousands behind the hundreds.
      vec3 sp2 = dir * 262.0;
      vec3 cell2 = floor( sp2 );
      float r2 = hash31( cell2 );
      if ( r2 > 0.9972 ) {
        vec3 offs2 = fract( sp2 ) - 0.5;
        float bright2 = smoothstep( 0.3, 0.0, length( offs2 ) )
          * ( 0.55 + 0.45 * sin( uTime * 1.1 + r2 * 91.0 ) );
        col += vec3( 0.82, 0.88, 1.0 ) * bright2 * 0.34 * uStars * smoothstep( 0.0, 0.22, dir.y );
      }

      // A shooting star every so often: one analytic streak, no geometry, no
      // extra draw call. Most windows stay empty so it remains a small event
      // the player feels lucky to catch.
      float meteorEpoch = floor( uTime / 19.0 );
      float meteorPhase = fract( uTime / 19.0 );
      float meteorRand = hash31( vec3( meteorEpoch, 3.7, 9.1 ) );
      if ( meteorPhase < 0.09 && meteorRand > 0.36 ) {
        float az = meteorRand * 6.2831;
        float el = 0.62 + hash31( vec3( meteorEpoch, 1.3, 4.4 ) ) * 0.55;
        vec3 mStart = vec3( cos( el ) * cos( az ), sin( el ), cos( el ) * sin( az ) );
        vec3 mTravel = normalize( cross( mStart, vec3( 0.0, 1.0, 0.0 ) ) - vec3( 0.0, 0.62, 0.0 ) );
        float prog = meteorPhase / 0.09;
        vec3 mHead = normalize( mStart + mTravel * prog * 0.42 );
        vec3 mTail = normalize( mStart + mTravel * max( prog - 0.22, 0.0 ) * 0.42 );
        vec3 pa = dir - mTail;
        vec3 ba = mHead - mTail;
        float seg = clamp( dot( pa, ba ) / max( dot( ba, ba ), 1e-5 ), 0.0, 1.0 );
        float distToStreak = length( pa - ba * seg );
        float streak = exp( -distToStreak * 620.0 ) * sin( prog * 3.14159 );
        col += vec3( 0.92, 0.96, 1.0 ) * streak * mix( 0.2, 1.0, seg ) * uStars * 0.9;
      }
    }

    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

interface SkyProps {
  palette: Palette
  stars?: number
}

const SkyDome = memo(function SkyDome({ palette, stars = 0 }: SkyProps) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color(palette.skyHorizon) },
          uZenith: { value: new THREE.Color(palette.skyZenith) },
          uGlow: { value: new THREE.Color(palette.skyGlow) },
          uSunDir: { value: new THREE.Vector3(...palette.sunDir).normalize() },
          uStars: { value: stars },
          uTime: { value: 0 },
        },
      }),
    // Recreated only when the shader itself would change; colors update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useLayoutEffect(() => () => mat.dispose(), [mat])

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 20), [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const ref = useRef<THREE.Mesh>(null)
  const targetHorizon = useMemo(() => new THREE.Color(palette.skyHorizon), [palette.skyHorizon])
  const targetZenith = useMemo(() => new THREE.Color(palette.skyZenith), [palette.skyZenith])
  const targetGlow = useMemo(() => new THREE.Color(palette.skyGlow), [palette.skyGlow])
  const targetSunDirection = useMemo(
    () => new THREE.Vector3(...palette.sunDir).normalize(),
    [palette.sunDir],
  )

  useFrame((state, dt) => {
    const u = mat.uniforms
    // Smoothly chase the palette so transition scenes can morph the sky.
    ;(u.uHorizon.value as THREE.Color).lerp(targetHorizon, Math.min(1, dt * 3))
    ;(u.uZenith.value as THREE.Color).lerp(targetZenith, Math.min(1, dt * 3))
    ;(u.uGlow.value as THREE.Color).lerp(targetGlow, Math.min(1, dt * 3))
    ;(u.uSunDir.value as THREE.Vector3).lerp(
      targetSunDirection,
      Math.min(1, dt * 3),
    )
    u.uStars.value += (stars - (u.uStars.value as number)) * Math.min(1, dt * 1.5)
    u.uTime.value = state.clock.elapsedTime
    // Keep the dome centered on the camera so it never clips.
    if (ref.current) ref.current.position.copy(state.camera.position)
  })

  return <mesh ref={ref} geometry={geometry} material={mat} scale={600} renderOrder={-1000} frustumCulled={false} />
})

/* ────────────────────────────────────────────────────────────────────────────
 * Lighting rig
 * One shadow-casting key light, a hemisphere fill, and a dim cool back light
 * that does most of the work selling the clay-figure look.
 * ──────────────────────────────────────────────────────────────────────────── */

interface LightingProps {
  palette: Palette
  /** World point the shadow frustum should center on (usually the player). */
  target?: THREE.Vector3
  shadowRadius?: number
  /** Metres of air the ground-hugging fog layer fills. */
  fogLayer?: number
  /** How much extra fog collects at ground level, 0..1. */
  fogGround?: number
}

function Lighting({ palette, shadowRadius = 34, fogLayer = 11, fogGround = 0.6 }: LightingProps) {
  const { profile } = useQualityProfile()
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)
  const { scene } = useThree()

  const shadowsOn = profile.shadows !== 'off'
  const mapSize = profile.shadows === 'high' ? 2048 : 1024
  const targetFogColor = useMemo(() => new THREE.Color(palette.fog), [palette.fog])
  const targetSunColor = useMemo(() => new THREE.Color(palette.sun), [palette.sun])
  const targetSunPosition = useMemo(
    () => new THREE.Vector3(...palette.sunDir).normalize().multiplyScalar(48),
    [palette.sunDir],
  )

  // Fog is a scene-level property, so it is set imperatively.
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 3)
    if (!scene.fog || !(scene.fog instanceof THREE.Fog)) {
      scene.fog = new THREE.Fog(targetFogColor.clone(), palette.fogNear, palette.fogFar)
    } else {
      scene.fog.color.lerp(targetFogColor, k)
      scene.fog.near += (palette.fogNear - scene.fog.near) * k
      scene.fog.far += (palette.fogFar - scene.fog.far) * k
    }

    // The height-fog layer rides on the ground beneath her, so walking downhill
    // into a hollow puts her deeper into the mist and cresting a ridge lifts her
    // out of it. Damped, because a hard snap would make the fog pump.
    const ground = runtime.sampleHeight(runtime.playerPos.x, runtime.playerPos.z)
    const floor = Number.isFinite(ground) ? ground : 0
    fogUniforms.uFogFloor.value += (floor - fogUniforms.uFogFloor.value) * Math.min(1, dt * 1.6)
    fogUniforms.uFogLayer.value += (fogLayer - fogUniforms.uFogLayer.value) * k
    fogUniforms.uFogGround.value += (fogGround - fogUniforms.uFogGround.value) * k

    const sun = sunRef.current
    if (sun) {
      sun.color.lerp(targetSunColor, k)
      sun.intensity += (palette.sunIntensity - sun.intensity) * k
      sun.position.lerp(targetSunPosition, k)
    }
  })

  useLayoutEffect(() => {
    return () => {
      scene.fog = null
    }
  }, [scene])

  return (
    <>
      <object3D ref={targetRef} position={[0, 0, 0]} />
      <directionalLight
        ref={sunRef}
        castShadow={shadowsOn}
        color={palette.sun}
        intensity={palette.sunIntensity}
        position={[
          palette.sunDir[0] * 48,
          palette.sunDir[1] * 48,
          palette.sunDir[2] * 48,
        ]}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-bias={-0.0009}
        shadow-normalBias={0.035}
      />
      <hemisphereLight
        color={palette.ambientSky}
        groundColor={palette.ambientGround}
        intensity={palette.ambientIntensity}
      />
      {/* Cool back-fill: separates silhouettes from the fog without flattening them. */}
      <directionalLight
        color={palette.ambientSky}
        intensity={Math.min(0.16, palette.ambientIntensity * 0.5)}
        position={[-palette.sunDir[0] * 30, 14, -palette.sunDir[2] * 30]}
      />
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Clouds — slow instanced blobs, high up, no shadows.
 * ──────────────────────────────────────────────────────────────────────────── */

const Clouds = memo(function Clouds({
  count = 14,
  color = '#fff6ea',
  height = 60,
  spread = 340,
  opacity = 0.75,
  speed = 0.35,
}: {
  count?: number
  color?: string
  height?: number
  spread?: number
  opacity?: number
  speed?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const puffs = useMemo(() => {
    const rand = mulberry32(9182)
    const out: { x: number; y: number; z: number; sx: number; sy: number; sz: number; drift: number }[] = []
    for (let i = 0; i < count; i++) {
      const cx = (rand() - 0.5) * spread
      const cz = (rand() - 0.5) * spread
      const cy = height + (rand() - 0.5) * 18
      const lobes = 3 + Math.floor(rand() * 3)
      for (let j = 0; j < lobes; j++) {
        const s = 12 + rand() * 16
        out.push({
          x: cx + (rand() - 0.5) * 26,
          y: cy + (rand() - 0.5) * 5,
          z: cz + (rand() - 0.5) * 20,
          sx: s,
          sy: s * (0.42 + rand() * 0.16),
          sz: s * (0.75 + rand() * 0.3),
          drift: rand(),
        })
      }
    }
    return out
  }, [count, spread, height])

  const mat = useMemo(
    () =>
      storybook({
        color,
        roughness: 1,
        transparent: true,
        opacity,
        rim: 0.4,
        rimColor: '#ffffff',
        gradient: 0.34,
        gradientColor: '#8fa6c4',
        depthWrite: false,
      }),
    [color, opacity],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    puffs.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        q,
        new THREE.Vector3(p.sx, p.sy, p.sz),
      )
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [puffs])

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    // Drift the whole layer rather than each puff: one uniform update, no per-instance cost.
    mesh.position.x = ((state.clock.elapsedTime * speed) % spread) - spread / 2
  })

  return (
    <instancedMesh
      ref={ref}
      args={[geo.blob(), mat, puffs.length]}
      frustumCulled={false}
      renderOrder={-900}
    />
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Distant supercell
 *
 * Three instanced cloud layers build one enormous silhouette: a low shelf, a
 * rotating middle deck, and a tall anvil. Internal heat lightning changes only
 * material/light uniforms. React never receives flash state.
 * ──────────────────────────────────────────────────────────────────────────── */

interface SupercellStormProps {
  position?: [number, number, number]
  scale?: number
  seed?: number
  /** Mountain storm speaks; transition-view storm stays visually distant. */
  thunder?: boolean
}

interface StormPuff {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

export const SupercellStorm = memo(function SupercellStorm({
  position = [0, 48, -185],
  scale = 1,
  seed = 2907,
  thunder = true,
}: SupercellStormProps) {
  const root = useRef<THREE.Group>(null)
  const shell = useRef<THREE.InstancedMesh>(null)
  const middle = useRef<THREE.InstancedMesh>(null)
  const core = useRef<THREE.InstancedMesh>(null)
  const flashLight = useRef<THREE.DirectionalLight>(null)
  const flashTarget = useRef<THREE.Object3D>(null)

  const layers = useMemo(() => {
    const rand = mulberry32(seed)
    const shelf: StormPuff[] = []
    const tower: StormPuff[] = []
    const heat: StormPuff[] = []

    // Broad low shelf: the horizon-spanning part of the supercell.
    for (let i = 0; i < 58; i++) {
      const x = (rand() - 0.5) * 150
      const edge = Math.abs(x) / 75
      shelf.push({
        x,
        y: (rand() - 0.5) * 10 - edge * 4,
        z: (rand() - 0.5) * 28,
        sx: 13 + rand() * 19,
        sy: 5 + rand() * 7,
        sz: 12 + rand() * 18,
      })
    }

    // Rising rotating tower and wide anvil crown.
    for (let i = 0; i < 38; i++) {
      const h = rand()
      const radius = 34 * (1 - h * 0.42)
      const angle = rand() * Math.PI * 2
      const crown = h > 0.72 ? 1.8 : 1
      tower.push({
        x: Math.cos(angle) * radius * rand() * crown + 10,
        y: 4 + h * 64,
        z: Math.sin(angle) * radius * rand(),
        sx: (11 + rand() * 17) * crown,
        sy: 7 + rand() * 12,
        sz: (10 + rand() * 15) * crown,
      })
    }
    // The spreading anvil is what makes this read as a supercell instead of a
    // vertical pile of ordinary clouds.
    for (let i = 0; i < 18; i++) {
      tower.push({
        x: (rand() - 0.5) * 116 + 8,
        y: 54 + (rand() - 0.5) * 13,
        z: (rand() - 0.5) * 30,
        sx: 20 + rand() * 31,
        sy: 5 + rand() * 7,
        sz: 14 + rand() * 18,
      })
    }

    // Smaller shapes buried inside. Only these bloom during heat lightning.
    for (let i = 0; i < 24; i++) {
      const h = rand()
      heat.push({
        x: (rand() - 0.5) * (72 - h * 28) + 9,
        y: 2 + h * 48,
        z: (rand() - 0.5) * 24,
        sx: 7 + rand() * 12,
        sy: 4 + rand() * 8,
        sz: 7 + rand() * 11,
      })
    }
    return { shelf, tower, heat }
  }, [seed])

  const mats = useMemo(
    () => ({
      shell: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#1a233c'),
        emissive: new THREE.Color('#647aa5'),
        emissiveIntensity: 0.06,
        roughness: 1,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        // This is a horizon object beyond chapter fogFar. Ordinary fog would
        // clamp it to 100% fog and erase the entire storm.
        fog: false,
      }),
      middle: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#293657'),
        emissive: new THREE.Color('#7185ae'),
        emissiveIntensity: 0.08,
        roughness: 1,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        fog: false,
      }),
      core: new THREE.MeshBasicMaterial({
        color: new THREE.Color('#93aad2'),
        transparent: true,
        opacity: 0.018,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: true,
        fog: false,
      }),
    }),
    [],
  )

  useLayoutEffect(
    () => () => {
      mats.shell.dispose()
      mats.middle.dispose()
      mats.core.dispose()
    },
    [mats],
  )

  useLayoutEffect(() => {
    const write = (mesh: THREE.InstancedMesh | null, puffs: StormPuff[]) => {
      if (!mesh) return
      const matrix = new THREE.Matrix4()
      const quaternion = new THREE.Quaternion()
      for (let i = 0; i < puffs.length; i++) {
        const puff = puffs[i]
        matrix.compose(
          new THREE.Vector3(puff.x, puff.y, puff.z),
          quaternion,
          new THREE.Vector3(puff.sx, puff.sy, puff.sz),
        )
        mesh.setMatrixAt(i, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
    }
    write(shell.current, layers.shelf)
    write(middle.current, layers.tower)
    write(core.current, layers.heat)
  }, [layers])

  useLayoutEffect(() => {
    if (!flashLight.current || !flashTarget.current) return
    flashLight.current.target = flashTarget.current
    flashTarget.current.updateMatrixWorld()
  }, [])

  const storm = useRef({
    // The first pulse lands during the authored mountain reveal; later waits
    // stretch out so lightning remains weather, never a repeating effect.
    nextFlash: 1.15,
    flashAge: 99,
    thunderDelay: -1,
    sequence: 0,
  })

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = storm.current
    s.nextFlash -= dt
    s.flashAge += dt

    if (s.nextFlash <= 0) {
      s.sequence += 1
      s.flashAge = 0
      // Long, irregular waits. This remains a landscape, never an attack.
      s.nextFlash = 12 + ((s.sequence * 7.3) % 11) + Math.random() * 8
      // Roughly one in three flashes stays silent.
      s.thunderDelay =
        thunder && s.sequence % 3 !== 0
          ? 3.2 + ((s.sequence * 1.17) % 2.8)
          : -1
    }

    if (s.thunderDelay > 0) {
      s.thunderDelay -= dt
      if (s.thunderDelay <= 0) audio.distantThunder(0.72 + (s.sequence % 3) * 0.07)
    }

    // Two soft internal pulses; no bolt, no white strobe.
    const first = Math.max(0, 1 - Math.abs(s.flashAge - 0.1) / 0.1)
    const second = Math.max(0, 1 - Math.abs(s.flashAge - 0.31) / 0.14) * 0.68
    const flash = Math.max(first, second)
    mats.shell.emissiveIntensity = 0.06 + flash * 0.28
    mats.middle.emissiveIntensity = 0.08 + flash * 0.72
    mats.core.opacity = 0.018 + flash * 0.28
    if (flashLight.current) flashLight.current.intensity = flash * 1.65

    const group = root.current
    if (group) {
      const t = state.clock.elapsedTime
      group.position.x = position[0] + Math.sin(t * 0.012 + seed) * 2.8
      group.position.y = position[1] + Math.sin(t * 0.019 + seed * 0.1) * 0.8
    }
  })

  return (
    <group ref={root} position={position} scale={scale}>
      <instancedMesh
        ref={shell}
        args={[geo.blob(), mats.shell, layers.shelf.length]}
        renderOrder={-880}
      />
      <instancedMesh
        ref={middle}
        args={[geo.blob(), mats.middle, layers.tower.length]}
        renderOrder={-879}
      />
      <instancedMesh
        ref={core}
        args={[geo.blob(), mats.core, layers.heat.length]}
        renderOrder={-878}
      />
      <object3D ref={flashTarget} position={[0, 0, 40]} />
      <directionalLight
        ref={flashLight}
        color="#a9c4ff"
        intensity={0}
        position={[18, 42, -24]}
      />
    </group>
  )
})


/* ────────────────────────────────────────────────────────────────────────────
 * Ground mist — volumetric
 *
 * The old version was instanced flat PlaneGeometry with a MeshBasicMaterial.
 * That is what "the fog looks 2D and blocky" was: you could see the rectangles,
 * their hard edges cutting through tree trunks and the ground, all of them
 * lying at the same angle.
 *
 * This one is a small pool of camera-facing billboards whose ALPHA is
 * raymarched: each fragment steps a short ray through a world-space 3D noise
 * field and accumulates density. Because the noise is sampled in world
 * coordinates the structure stays put as the camera moves, which is what sells
 * it as volume rather than as a sprite. The billboard's own edges are erased by
 * a radial falloff and a height falloff, so there is no polygon boundary to see
 * anywhere — and where a puff meets the ground or a trunk, density tapers
 * instead of cutting.
 *
 * Still one instanced draw call, no shadows, no depth writes, no textures.
 * ──────────────────────────────────────────────────────────────────────────── */

const MIST_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;

  void main() {
    vUv = uv;
    // Billboard: take the instance's world translation, then build the quad in
    // view space so it always faces the camera and never shows an edge-on sliver.
    vec4 origin = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
    // Instance scale, recovered from the matrix columns.
    float sx = length( instanceMatrix[0].xyz );
    float sy = length( instanceMatrix[1].xyz );
    vSeed = fract( sx * 0.317 + origin.x * 0.019 + origin.z * 0.023 );

    vec4 viewOrigin = viewMatrix * origin;
    vec3 viewPos = viewOrigin.xyz + vec3( position.x * sx, position.y * sy, 0.0 );
    // World position of THIS fragment's corner, for noise lookup and height fade.
    vWorld = origin.xyz + vec3( position.x * sx, position.y * sy, 0.0 );

    vFogDepth = - viewPos.z;
    gl_Position = projectionMatrix * vec4( viewPos, 1.0 );
  }
`

const MIST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFloor;
  uniform float uThickness;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColor;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;

  // Cheap 3D value noise. Hash → trilinear blend; two octaves is plenty at
  // this scale and keeps the shader affordable on integrated GPUs.
  float hash13( vec3 p ) {
    p = fract( p * 0.1031 );
    p += dot( p, p.yzx + 33.33 );
    return fract( ( p.x + p.y ) * p.z );
  }

  float noise3( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n000 = hash13( i );
    float n100 = hash13( i + vec3( 1.0, 0.0, 0.0 ) );
    float n010 = hash13( i + vec3( 0.0, 1.0, 0.0 ) );
    float n110 = hash13( i + vec3( 1.0, 1.0, 0.0 ) );
    float n001 = hash13( i + vec3( 0.0, 0.0, 1.0 ) );
    float n101 = hash13( i + vec3( 1.0, 0.0, 1.0 ) );
    float n011 = hash13( i + vec3( 0.0, 1.0, 1.0 ) );
    float n111 = hash13( i + vec3( 1.0, 1.0, 1.0 ) );
    return mix(
      mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
      mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ),
      f.z
    );
  }

  float fbm3( vec3 p ) {
    return noise3( p ) * 0.62 + noise3( p * 2.13 + 19.7 ) * 0.28;
  }

  void main() {
    // Radial falloff erases the quad. Nothing here has a straight edge.
    vec2 d = vUv * 2.0 - 1.0;
    float r = length( d );
    float shape = 1.0 - smoothstep( 0.25, 1.0, r );
    if ( shape <= 0.001 ) discard;

    // Three steps along +Y through the puff. Marching vertically rather than
    // along the view ray costs nothing and reads correctly for a ground layer:
    // looking down into it you see through more of it than looking across it.
    float drift = uTime * 0.035;
    vec3 p = vWorld * 0.075 + vec3( drift, vSeed * 10.0, drift * 0.6 );
    float density = 0.0;
    for ( int i = 0; i < 3; i++ ) {
      float k = float( i ) * 0.3333;
      density += fbm3( p + vec3( 0.0, k * 1.4, 0.0 ) ) * ( 1.0 - k * 0.45 );
    }
    // Compensates for the removed sample, preserving the authored opacity.
    density *= 0.44;

    // Height falloff: thickest on the floor, gone by uThickness above it.
    float alt = clamp( ( vWorld.y - uFloor ) / max( uThickness, 0.001 ), 0.0, 1.0 );
    float layer = exp( -alt * 2.1 );

    float a = min( shape * layer * smoothstep( 0.18, 0.62, density ) * uOpacity, 0.5 );
    if ( a <= 0.002 ) discard;

    // Forward scattering: mist looked at against the moon catches a silver
    // lining, exactly as damp night air does. The lobe is broad and weak so it
    // grades the fog rather than painting a hotspot on it.
    vec3 viewDir = normalize( vWorld - cameraPosition );
    float scatter = pow( max( dot( viewDir, normalize( uMoonDir ) ), 0.0 ), 3.5 );
    vec3 lit = uColor + uMoonColor * scatter * ( 0.32 + 0.1 * density );

    gl_FragColor = vec4( lit, a );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const Mist = memo(function Mist({
  count = 26,
  color = '#9fb0d0',
  opacity = 0.075,
  height = 1.1,
  spread = 130,
  scale = 26,
  speed = 0.5,
  seed = 5150,
  moonDir,
  moonColor,
}: {
  count?: number
  color?: string
  opacity?: number
  /** How high above the ground the layer reaches. */
  height?: number
  spread?: number
  scale?: number
  speed?: number
  seed?: number
  /** Direction of the moon key light, for the fog's silver lining. */
  moonDir?: [number, number, number]
  /** Color the silver lining borrows from the key light. */
  moonColor?: string
}) {
  const { particles: density } = useQualityProfile().profile
  const reduceMotion = useGame((s) => s.settings.reduceMotion)
  const n = Math.max(0, Math.round(count * density))
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lastMatrixUpdate = useRef(Number.NEGATIVE_INFINITY)

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        // The billboard is built in the vertex shader, so no `fog_vertex` chunk —
        // but `vFogDepth` still has to be declared and written, or the fragment
        // chunk will not link. Custom ShaderMaterials get nothing for free.
        vertexShader: `varying float vFogDepth;\n${MIST_VERT}`,
        fragmentShader: `#include <fog_pars_fragment>\n${MIST_FRAG}`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          // The raymarched alpha averages well below 1, so the authored opacity
          // is scaled up — but capped hard. Puffs overlap several deep, so a
          // per-billboard alpha near 1 accumulates into a flat opaque band that
          // out-glows the sky and reads as the 2D wall this was built to replace.
          uOpacity: { value: Math.min(0.42, opacity * 2.6) },
          uTime: { value: 0 },
          uFloor: { value: 0 },
          uThickness: { value: Math.max(1.4, height * 2.6) },
          uMoonDir: { value: new THREE.Vector3(0.5, 0.7, 0.4) },
          uMoonColor: { value: new THREE.Color('#9db6e4') },
          // Injected by three when `fog: true`, but declaring them keeps the
          // uniform object honest if the material is ever inspected.
          fogColor: { value: new THREE.Color('#000000') },
          fogNear: { value: 1 },
          fogFar: { value: 100 },
        },
      }),
    [color, opacity, height],
  )
  useLayoutEffect(() => () => mat.dispose(), [mat])

  // The scattering uniforms chase their palette targets imperatively, so a
  // chapter's palette swap never rebuilds the shader.
  useLayoutEffect(() => {
    if (moonDir) {
      ;(mat.uniforms.uMoonDir.value as THREE.Vector3).set(...moonDir).normalize()
    }
    if (moonColor) {
      ;(mat.uniforms.uMoonColor.value as THREE.Color).set(moonColor)
    }
  }, [mat, moonDir, moonColor])

  const banks = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: n }, () => ({
      x: (rand() - 0.5) * spread,
      z: (rand() - 0.5) * spread,
      y: rand() * height * 0.7,
      // Billboards are square-ish; the shape comes from the noise, not the quad.
      s: scale * (0.5 + rand() * 0.8),
      sy: 0.5 + rand() * 0.55,
      phase: rand() * Math.PI * 2,
      drift: 0.4 + rand() * 0.9,
    }))
  }, [n, spread, scale, height, seed])

  useFrame((state) => {
    const m = ref.current
    if (!m || n === 0) return
    const t = state.clock.elapsedTime * (reduceMotion ? 0.3 : 1)
    mat.uniforms.uTime.value = t
    // Follow the player so a small pool of puffs covers the whole region.
    const cx = runtime.playerPos.x
    const cz = runtime.playerPos.z
    const ground = runtime.sampleHeight(cx, cz)
    mat.uniforms.uFloor.value = Number.isFinite(ground) ? ground : 0
    // The volume drifts at a glacial pace. Rewriting every instance matrix 60
    // times a second spends CPU and uploads buffers without producing visible
    // motion; 20 Hz remains far above the mist's actual animation frequency.
    if (state.clock.elapsedTime - lastMatrixUpdate.current < 1 / 20) return
    lastMatrixUpdate.current = state.clock.elapsedTime
    const half = spread / 2

    banks.forEach((b, i) => {
      let x = b.x + Math.sin(t * 0.05 * b.drift + b.phase) * 8 + t * speed * b.drift
      let z = b.z + Math.cos(t * 0.04 * b.drift + b.phase) * 6
      // Wrap around the player.
      x = ((((x - cx + half) % spread) + spread) % spread) - half + cx
      z = ((((z - cz + half) % spread) + spread) % spread) - half + cz
      const g = runtime.sampleHeight(x, z)
      dummy.position.set(x, (Number.isFinite(g) ? g : 0) + b.y + 0.1, z)
      // Rotation is irrelevant — the vertex shader re-orients each quad to the
      // camera — but scale is read out of the matrix, so it must be set.
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(b.s, b.s * b.sy, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  if (n === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, mat, n]}
      frustumCulled={false}
      renderOrder={6}
    />
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Atmospheric light shafts
 *
 * A tiny, snapped pool of camera-facing volume slices follows the current
 * region. Five instances share one geometry/material/draw call. Soft edges,
 * additive blending, depth testing, and fog-colored grading make them read as
 * light caught in damp air rather than transparent polygons.
 * ──────────────────────────────────────────────────────────────────────────── */

const BEAM_VERT = /* glsl */ `
  uniform float uSlant;
  varying vec2 vUv;
  varying float vSeed;

  void main() {
    vUv = uv;
    vec4 origin = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
    float sx = length( instanceMatrix[0].xyz );
    float sy = length( instanceMatrix[1].xyz );
    vSeed = fract( origin.x * 0.071 + origin.z * 0.053 + sx * 0.17 );

    vec4 viewOrigin = viewMatrix * origin;
    vec3 viewPos = viewOrigin.xyz + vec3(
      position.x * sx + ( position.y + 0.5 ) * sy * uSlant,
      position.y * sy,
      0.0
    );
    gl_Position = projectionMatrix * vec4( viewPos, 1.0 );
  }
`

const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;

  float hash21( vec2 p ) {
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
  }

  void main() {
    float x = abs( vUv.x - 0.5 ) * 2.0;
    float side = 1.0 - smoothstep( 0.18, 1.0, x );
    // A soft hot core: real shafts are brightest along their axis, and the
    // extra centre weight is what makes them read as depth of lit air rather
    // than as a flat gradient card.
    float core = 1.0 + 0.55 * ( 1.0 - smoothstep( 0.0, 0.42, x ) );
    // The top fade starts low and is long. Light in air is thickest near the
    // ground and should be gone well before the skyline: fading only over the
    // last quarter left a bright column standing up into the sky, which read as
    // a rendering artefact rather than as atmosphere.
    float ends = smoothstep( 0.0, 0.14, vUv.y ) * ( 1.0 - smoothstep( 0.22, 0.78, vUv.y ) );
    float grain = hash21( floor( vec2( vUv.x * 13.0, vUv.y * 23.0 + uTime * 0.12 + vSeed * 17.0 ) ) );
    float veil = 0.72 + grain * 0.28;
    // Slow shimmer: dust drifting through the beam. Each shaft breathes on its
    // own phase, so the pool never pulses in unison.
    float shimmer = 0.86 + 0.14 * sin( uTime * 0.45 + vSeed * 31.0 + vUv.y * 5.0 );
    float alpha = side * side * core * ends * veil * shimmer * uOpacity;
    if ( alpha <= 0.002 ) discard;
    gl_FragColor = vec4( uColor, alpha );
  }
`

const AtmosphericBeams = memo(function AtmosphericBeams({
  color,
  opacity = 0.06,
  count = 5,
  seed = 90210,
  slant = 0,
}: {
  color: string
  opacity?: number
  count?: number
  seed?: number
  /** Screen-space lean inherited from the moon direction. */
  slant?: number
}) {
  const { particles: density } = useQualityProfile().profile
  const reduceMotion = useGame((s) => s.settings.reduceMotion)
  const n = Math.max(0, Math.round(count * density))
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastCell = useRef({ x: Number.NaN, z: Number.NaN })
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color('#ffffff') },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uSlant: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useLayoutEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    material.uniforms.uColor.value.set(color)
    material.uniforms.uOpacity.value = opacity
    material.uniforms.uSlant.value = slant
  }, [material, color, opacity, slant])
  const placements = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: n }, () => ({
      x: (rand() - 0.5) * 42,
      z: (rand() - 0.5) * 38,
      width: 2.2 + rand() * 3.8,
      // Shorter than they were (11–22): a beam taller than the treeline has
      // nothing left to be caught in.
      height: 7 + rand() * 6,
    }))
  }, [n, seed])
  useLayoutEffect(() => {
    lastCell.current = { x: Number.NaN, z: Number.NaN }
  }, [placements])

  useFrame((state) => {
    material.uniforms.uTime.value = reduceMotion ? 0 : state.clock.elapsedTime
    const mesh = ref.current
    if (!mesh || n === 0) return
    const cellX = Math.round(runtime.playerPos.x / 24) * 24
    const cellZ = Math.round(runtime.playerPos.z / 24) * 24
    if (cellX === lastCell.current.x && cellZ === lastCell.current.z) return
    lastCell.current = { x: cellX, z: cellZ }

    placements.forEach((beam, i) => {
      const x = cellX + beam.x
      const z = cellZ + beam.z
      const sampled = runtime.sampleHeight(x, z)
      const ground = Number.isFinite(sampled) ? sampled : 0
      dummy.position.set(x, ground + beam.height * 0.5, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(beam.width, beam.height, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  if (n === 0 || opacity <= 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, n]}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={7}
    />
  )
})

export { SkyDome, Lighting, Clouds, Mist, AtmosphericBeams }
