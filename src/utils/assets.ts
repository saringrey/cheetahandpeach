import * as THREE from 'three'

/**
 * Shared geometry + material caches.
 *
 * Every prop in the game pulls from here, which is what keeps draw calls and
 * GPU memory low: a hundred lanterns are a hundred meshes over ONE geometry and
 * ONE material, and instanced props collapse to a single draw call.
 */

const geoCache = new Map<string, THREE.BufferGeometry>()

function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g as T
}

export const geo = {
  box: () => cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  plane: () => cachedGeo('plane', () => new THREE.PlaneGeometry(1, 1)),
  sphere: (seg = 16) =>
    cachedGeo(`sphere${seg}`, () => new THREE.SphereGeometry(0.5, seg, Math.max(6, seg / 2))),
  cylinder: (seg = 12) =>
    cachedGeo(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  cone: (seg = 12) => cachedGeo(`cone${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg)),
  capsule: (seg = 8) =>
    cachedGeo(`cap${seg}`, () => new THREE.CapsuleGeometry(0.5, 1, 3, seg)),
  torus: (seg = 12) =>
    cachedGeo(`torus${seg}`, () => new THREE.TorusGeometry(0.5, 0.16, 6, seg)),
  /** A rounded, slightly squashed box — the workhorse "soft clay" primitive. */
  softBox: (r = 0.18) =>
    cachedGeo(`soft${r}`, () => roundedBoxGeometry(1, 1, 1, r, 2)),
  /** Cone with a rounded tip, for stylized tree canopies. */
  blob: () => cachedGeo('blob', () => blobGeometry()),
}

/** A rounded box built by pushing a subdivided box out to a squircle-ish surface. */
export function roundedBoxGeometry(w: number, h: number, d: number, radius: number, steps = 2) {
  const g = new THREE.BoxGeometry(w, h, d, steps + 1, steps + 1, steps + 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  const half = new THREE.Vector3(w / 2, h / 2, d / 2)
  const r = Math.min(radius, Math.min(w, h, d) / 2)
  const inner = new THREE.Vector3(
    Math.max(0, half.x - r),
    Math.max(0, half.y - r),
    Math.max(0, half.z - r),
  )
  const v = new THREE.Vector3()
  const clamped = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    clamped.set(
      THREE.MathUtils.clamp(v.x, -inner.x, inner.x),
      THREE.MathUtils.clamp(v.y, -inner.y, inner.y),
      THREE.MathUtils.clamp(v.z, -inner.z, inner.z),
    )
    v.sub(clamped)
    if (v.lengthSq() > 1e-8) v.setLength(r)
    v.add(clamped)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** A soft irregular sphere — stylized canopy / bush / cloud. */
function blobGeometry() {
  const g = new THREE.SphereGeometry(0.5, 14, 10)
  const pos = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n =
      Math.sin(v.x * 6.1) * Math.cos(v.z * 5.3) * 0.06 + Math.sin(v.y * 4.7 + 1.3) * 0.045
    v.multiplyScalar(1 + n)
    // Flatten the underside so canopies read as sitting on their trunk.
    if (v.y < 0) v.y *= 0.78
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// ── Materials ───────────────────────────────────────────────────────────────

export interface StorybookOptions {
  color: string
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  /** Adds a soft light-wrap around silhouettes. 0 disables. */
  rim?: number
  rimColor?: string
  /** Tints the underside toward `gradientColor`, like ambient occlusion in gouache. */
  gradient?: number
  gradientColor?: string
  flatShading?: boolean
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  depthWrite?: boolean
  toneMapped?: boolean
  /** Multiply the base colour by the geometry's `color` attribute. */
  vertexColors?: boolean
}

/**
 * Shared height-fog controls, updated once per frame by <Lighting/>.
 *
 * three's fog is purely a function of distance from the camera, which is why it
 * reads as a flat grey curtain: every fragment at 40 m gets the same amount
 * whether it is a puddle or a treetop. These uniforms add the missing vertical
 * axis, so fog behaves like a layer of damp air lying on the ground — thick
 * around her knees, thin over the canopy. One object, shared by every material,
 * so a single write per frame updates the whole world.
 */
export const fogUniforms = {
  /** World Y the fog layer sits on. Tracks the ground under the player. */
  uFogFloor: { value: 0 },
  /** Metres over which the layer thins to nothing above the floor. */
  uFogLayer: { value: 11 },
  /** How much extra fog collects at the floor, 0..1. */
  uFogGround: { value: 0.6 },
}

/**
 * Height-graded fog, replacing three's flat `fog_fragment`.
 *
 * The distance term is three's own (so every palette's fogNear/fogFar still
 * means what it meant). On top of it, `sbLayer` biases the mix by altitude:
 * fragments near the floor fog out sooner and harder than fragments above it.
 * That single gradient is most of the difference between "grey wall at 40 m" and
 * "she is standing in mist".
 */
const FOG_LAYER_PATCH = /* glsl */ `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float sbFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float sbFog = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    float sbAlt = clamp( ( vSbWorld.y - uFogFloor ) / max( uFogLayer, 0.001 ), 0.0, 1.0 );
    float sbLayer = exp( -sbAlt * 2.6 );
    // Thin the fog aloft, thicken it near the floor. The second term is what
    // makes near-ground haze visible well before the far plane.
    sbFog = clamp(
      sbFog * mix( 1.0 - uFogGround * 0.5, 1.0, sbLayer )
        + ( 1.0 - sbFog ) * sbFog * sbLayer * uFogGround * 2.0,
      0.0, 1.0
    );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, sbFog );
  #endif
`

const matCache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * The one material everything in the world uses.
 *
 * It is a MeshStandardMaterial with a small injected term that adds (a) a wrap-around
 * rim and (b) a vertical gradient toward a cooler shadow tone. Those two things are
 * most of the difference between "grey primitives" and "painted clay".
 *
 * The injection anchors on `#include <opaque_fragment>`, verified present in three r185.
 */
export function storybook(opts: StorybookOptions): THREE.MeshStandardMaterial {
  const key = JSON.stringify(opts)
  const hit = matCache.get(key)
  if (hit) return hit

  const rim = opts.rim ?? 0.28
  const rimColor = new THREE.Color(opts.rimColor ?? '#ffe6c8')
  const gradient = opts.gradient ?? 0.22
  const gradientColor = new THREE.Color(opts.gradientColor ?? '#3d4f66')

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.color),
    roughness: opts.roughness ?? 0.88,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: opts.flatShading ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
    toneMapped: opts.toneMapped ?? true,
    vertexColors: opts.vertexColors ?? false,
  })

  // Always injected — the height-fog patch below applies to every surface in the
  // world, not just the ones with a rim.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim }
    shader.uniforms.uRimColor = { value: rimColor }
    shader.uniforms.uGradient = { value: gradient }
    shader.uniforms.uGradientColor = { value: gradientColor }
    shader.uniforms.uFogFloor = fogUniforms.uFogFloor
    shader.uniforms.uFogLayer = fogUniforms.uFogLayer
    shader.uniforms.uFogGround = fogUniforms.uFogGround

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vSbNormalW;
         varying vec3 vSbViewDir;
         varying vec3 vSbWorld;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vec4 sbWorld = modelMatrix * vec4( transformed, 1.0 );
         vSbWorld = sbWorld.xyz;
         vSbNormalW = normalize( mat3( modelMatrix ) * objectNormal );
         vSbViewDir = normalize( cameraPosition - sbWorld.xyz );`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uRim;
         uniform vec3 uRimColor;
         uniform float uGradient;
         uniform vec3 uGradientColor;
         uniform float uFogFloor;
         uniform float uFogLayer;
         uniform float uFogGround;
         varying vec3 vSbNormalW;
         varying vec3 vSbViewDir;
         varying vec3 vSbWorld;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         {
           // Soft downward gradient: surfaces facing down pick up a cool shadow tint.
           float sbDown = clamp( -vSbNormalW.y * 0.5 + 0.5, 0.0, 1.0 );
           gl_FragColor.rgb = mix( gl_FragColor.rgb, uGradientColor * (0.35 + 0.65 * gl_FragColor.rgb), uGradient * sbDown );
           // Wrap-around rim, strongest at grazing angles and on upward faces.
           float sbFres = pow( 1.0 - clamp( dot( normalize( vSbNormalW ), normalize( vSbViewDir ) ), 0.0, 1.0 ), 3.0 );
           float sbUp = clamp( vSbNormalW.y * 0.5 + 0.5, 0.0, 1.0 );
           gl_FragColor.rgb += uRimColor * sbFres * uRim * ( 0.45 + 0.55 * sbUp );
         }`,
      )
      // Replace three's flat distance fog with the height-graded version.
      .replace('#include <fog_fragment>', FOG_LAYER_PATCH)
  }
  // Every storybook material injects the same GLSL. Rim/gradient values are
  // per-material uniforms, so including them in the cache key compiled dozens
  // of identical WebGL programs and increased program switches in busy scenes.
  // Keep this versioned: bump it only when the injected shader source changes.
  mat.customProgramCacheKey = () => 'storybook-surface-v2'

  matCache.set(key, mat)
  return mat
}

/** Unlit emissive — lantern glass, firefly cores, dashboard light. */
const basicCache = new Map<string, THREE.MeshBasicMaterial>()
export function glow(colorHex: string, opacity = 1, depthWrite = true): THREE.MeshBasicMaterial {
  const key = `${colorHex}|${opacity}|${depthWrite}`
  let m = basicCache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: opacity < 1,
      opacity,
      depthWrite,
      toneMapped: false,
      fog: false,
    })
    basicCache.set(key, m)
  }
  return m
}

/** Frees every cached GPU resource. Called on unmount / context loss. */
export function disposeAssetCaches() {
  geoCache.forEach((g) => g.dispose())
  geoCache.clear()
  matCache.forEach((m) => m.dispose())
  matCache.clear()
  basicCache.forEach((m) => m.dispose())
  basicCache.clear()
}
