import { Suspense, useMemo, useRef, useLayoutEffect, memo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { geo, storybook, roundedBoxGeometry } from '../../utils/assets'
import { mulberry32, clamp01 } from '../../utils/math'
import { useGame } from '../../store/gameStore'
import { runtime, type Collider } from '../../store/runtime'
import { audio } from '../audio/audio'
import { useQualityProfile } from '../performance/useQualityProfile'
import type { Palette } from './palettes'

/* ────────────────────────────────────────────────────────────────────────────
 * Wind
 * A single shared uniform object drives every swaying thing in the scene, so
 * canopies, grass and flowers all move in the same gust.
 * ──────────────────────────────────────────────────────────────────────────── */

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
}

export function WindDriver({ strength = 1 }: { strength?: number }) {
  useFrame((state) => {
    windUniforms.uTime.value = state.clock.elapsedTime
    const reduce = useGame.getState().settings.reduceMotion
    windUniforms.uWind.value = strength * (reduce ? 0.3 : 1)
  })
  return null
}

/**
 * Adds vertex sway to any MeshStandardMaterial while keeping three's lighting
 * and fog intact. Anchors on `begin_vertex`, which is stable across releases.
 *
 * `bendPower` shapes how the bend falls off toward the base: 1 = whole object
 * leans, 2+ = only the top moves.
 */
function applySway(
  mat: THREE.MeshStandardMaterial,
  amount: number,
  bendPower: number,
  frequency: number,
  instanced: boolean,
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uWind = windUniforms.uWind
    shader.uniforms.uAmount = { value: amount }
    shader.uniforms.uPower = { value: bendPower }
    shader.uniforms.uFreq = { value: frequency }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWind;
         uniform float uAmount;
         uniform float uPower;
         uniform float uFreq;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           #ifdef USE_INSTANCING
             vec3 swayOrigin = instanceMatrix[3].xyz;
           #else
             vec3 swayOrigin = vec3( modelMatrix[3].xyz );
           #endif
           // Height above the object's own base drives how much it bends.
           float swayH = max( transformed.y, 0.0 );
           float swayW = pow( clamp( swayH / max( uAmount * 0.0001 + 2.0, 0.001 ), 0.0, 1.0 ), uPower );
           float ph = swayOrigin.x * 0.35 + swayOrigin.z * 0.27;
           // Two frequencies: a slow lean plus a faster rustle.
           float gust = sin( uTime * uFreq * 0.55 + ph ) * 0.7
                      + sin( uTime * uFreq * 1.63 + ph * 2.1 ) * 0.3;
           float amp = uAmount * uWind * swayW * swayH;
           transformed.x += gust * amp;
           transformed.z += cos( uTime * uFreq * 0.47 + ph * 1.4 ) * amp * 0.55;
         }`,
      )
  }
  mat.customProgramCacheKey = () => `sway-${amount}-${bendPower}-${frequency}-${instanced ? 1 : 0}`
  mat.needsUpdate = true
}

/** Refresh static instance bounds so Three can cull whole off-screen fields. */
function refreshInstanceBounds(...meshes: (THREE.InstancedMesh | null)[]) {
  for (const mesh of meshes) {
    if (!mesh) continue
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    // Vertex sway happens after CPU bounds are calculated.
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Trees
 * Instanced trunks + instanced canopies. A "forest" of 300 trees is 2 draw
 * calls plus one per extra canopy layer.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TreeStyle = 'round' | 'pine' | 'willow' | 'roadside' | 'bare' | 'palmless'

export interface TreeSpec {
  x: number
  z: number
  y?: number
  scale?: number
  rotation?: number
  style?: TreeStyle
}

type TexturedTreeVariant = 'tree01' | 'tree04' | 'pine01' | 'birch01' | 'dead01'

const TEXTURED_TREE_STRIDE = 5

const TREE_ASSET_URLS = {
  tree01: '/models/trees/quaternius/tree-01.glb',
  tree04: '/models/trees/quaternius/tree-04.glb',
  pine01: '/models/trees/quaternius/pine-01.glb',
  birch01: '/models/trees/quaternius/birch-01.glb',
  dead01: '/models/trees/quaternius/dead-tree-01.glb',
  bark: '/models/trees/quaternius/textures/Tree_Bark.jpg',
  leaves: '/models/trees/quaternius/textures/Tree_Leaves.png',
  pineLeaves: '/models/trees/quaternius/textures/Pine_Leaves.png',
  birchBark: '/models/trees/quaternius/textures/Birch_Bark.png',
  birchLeaves: '/models/trees/quaternius/textures/Birch_Leaves_Green.png',
} as const

function texturedTreeVariant(tree: TreeSpec, index: number, fallback: TreeStyle): TexturedTreeVariant {
  const style = tree.style ?? fallback
  if (style === 'pine') return 'pine01'
  if (style === 'roadside') return 'birch01'
  if (style === 'bare' || style === 'palmless') return 'dead01'
  if (style === 'willow') return 'tree04'
  return index % (TEXTURED_TREE_STRIDE * 2) === 2 ? 'tree04' : 'tree01'
}

function usesTexturedTree(tree: TreeSpec, index: number, fallback: TreeStyle) {
  return index % TEXTURED_TREE_STRIDE === 2 && (tree.style ?? fallback) !== 'palmless'
}

interface TreeFieldProps {
  trees: TreeSpec[]
  palette: Palette
  style?: TreeStyle
  trunkColor?: string
  canopyA?: string
  canopyB?: string
  /** Registers trunk colliders so she cannot walk through them. */
  collide?: boolean
  collideRadius?: number
  castShadow?: boolean
  sway?: number
}

export const TreeField = memo(function TreeField({
  trees,
  palette,
  style = 'round',
  trunkColor = '#6b5039',
  canopyA,
  canopyB,
  collide = true,
  collideRadius = 0.6,
  castShadow = true,
  sway = 0.045,
}: TreeFieldProps) {
  const { foliage: density } = useQualityProfile().profile
  const list = useMemo(() => {
    if (density >= 1) return trees
    const keep = Math.max(1, Math.round(trees.length * clamp01(density)))
    // Deterministic thinning: keep an even stride so the shape of the wood survives.
    const stride = trees.length / keep
    return Array.from({ length: keep }, (_, i) => trees[Math.floor(i * stride)])
  }, [trees, density])

  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopy1 = useRef<THREE.InstancedMesh>(null)
  const canopy2 = useRef<THREE.InstancedMesh>(null)
  const canopy3 = useRef<THREE.InstancedMesh>(null)

  const mats = useMemo(() => {
    const trunk = storybook({ color: trunkColor, roughness: 0.95, rim: 0.2 })
    const leafA = storybook({
      color: canopyA ?? palette.foliageA,
      roughness: 0.95,
      rim: 0.34,
      gradient: 0.3,
      gradientColor: palette.ambientGround,
    })
    const leafB = storybook({
      color: canopyB ?? palette.foliageB,
      roughness: 0.95,
      rim: 0.28,
      gradient: 0.3,
      gradientColor: palette.ambientGround,
    })
    return { trunk, leafA, leafB }
  }, [trunkColor, canopyA, canopyB, palette])

  // Canopies sway; trunks stay put.
  useLayoutEffect(() => {
    if (sway > 0) {
      applySway(mats.leafA, sway, 1.35, 0.55, true)
      applySway(mats.leafB, sway * 0.85, 1.35, 0.62, true)
    }
  }, [mats, sway])

  const canopyGeo = useMemo(() => {
    if (style === 'pine') return geo.cone(9)
    return geo.blob()
  }, [style])

  useLayoutEffect(() => {
    const t = trunkRef.current
    const c1 = canopy1.current
    const c2 = canopy2.current
    const c3 = canopy3.current
    if (!t || !c1) return

    const d = new THREE.Object3D()
    const cols: Collider[] = []

    list.forEach((tree, i) => {
      const s = tree.scale ?? 1
      const y = tree.y ?? 0
      const rot = tree.rotation ?? 0
      const st = tree.style ?? style

      // A fifth of the population uses the supplied Quaternius models. Hide
      // those procedural instances rather than stacking two trees at one point.
      if (usesTexturedTree(tree, i, style)) {
        d.position.set(tree.x, y - 50, tree.z)
        d.rotation.set(0, rot, 0)
        d.scale.setScalar(0.001)
        d.updateMatrix()
        t.setMatrixAt(i, d.matrix)
        c1.setMatrixAt(i, d.matrix)
        c2?.setMatrixAt(i, d.matrix)
        c3?.setMatrixAt(i, d.matrix)
        if (collide) cols.push({ kind: 'circle', x: tree.x, z: tree.z, r: collideRadius * s })
        return
      }

      // ── trunk ──
      const trunkH = st === 'pine' ? 2.1 * s : st === 'roadside' ? 3.0 * s : 2.4 * s
      const trunkR = (st === 'pine' ? 0.16 : 0.2) * s
      d.position.set(tree.x, y + trunkH / 2, tree.z)
      d.rotation.set(0, rot, 0)
      d.scale.set(trunkR * 2, trunkH, trunkR * 2)
      d.updateMatrix()
      t.setMatrixAt(i, d.matrix)

      // ── canopy ──
      if (st === 'pine') {
        d.position.set(tree.x, y + trunkH * 0.72, tree.z)
        d.rotation.set(0, rot, 0)
        d.scale.set(2.5 * s, 4.2 * s, 2.5 * s)
      } else if (st === 'willow') {
        d.position.set(tree.x, y + trunkH + 0.5 * s, tree.z)
        d.rotation.set(0, rot, 0)
        d.scale.set(4.4 * s, 2.6 * s, 4.4 * s)
      } else if (st === 'roadside') {
        d.position.set(tree.x, y + trunkH + 0.9 * s, tree.z)
        d.rotation.set(0, rot, 0)
        d.scale.set(3.1 * s, 3.4 * s, 3.0 * s)
      } else if (st === 'bare') {
        d.position.set(tree.x, y - 50, tree.z) // hidden
        d.scale.setScalar(0.001)
      } else {
        d.position.set(tree.x, y + trunkH + 0.75 * s, tree.z)
        d.rotation.set(0, rot, 0)
        d.scale.set(3.5 * s, 3.0 * s, 3.4 * s)
      }
      d.updateMatrix()
      c1.setMatrixAt(i, d.matrix)

      // ── second canopy lobe, offset, for a fuller silhouette ──
      if (c2) {
        if (st === 'pine') {
          d.position.set(tree.x, y + trunkH * 1.35, tree.z)
          d.scale.set(1.7 * s, 3.0 * s, 1.7 * s)
        } else if (st === 'bare') {
          d.position.set(tree.x, y - 50, tree.z)
          d.scale.setScalar(0.001)
        } else {
          const a = rot * 1.7 + i
          d.position.set(
            tree.x + Math.sin(a) * 0.85 * s,
            y + trunkH + 1.5 * s,
            tree.z + Math.cos(a) * 0.7 * s,
          )
          d.scale.set(2.5 * s, 2.1 * s, 2.4 * s)
        }
        d.rotation.set(0, rot * 1.4, 0)
        d.updateMatrix()
        c2.setMatrixAt(i, d.matrix)
      }

      // A smaller counter-lobe breaks the remaining stacked-sphere silhouette.
      if (c3) {
        if (st === 'pine') {
          d.position.set(tree.x, y + trunkH * 0.42, tree.z)
          d.scale.set(3.05 * s, 2.45 * s, 3.05 * s)
        } else if (st === 'bare') {
          d.position.set(tree.x, y - 50, tree.z)
          d.scale.setScalar(0.001)
        } else {
          const a = rot * 1.23 - i * 0.73
          d.position.set(
            tree.x - Math.sin(a) * 0.78 * s,
            y + trunkH + 0.98 * s,
            tree.z - Math.cos(a) * 0.68 * s,
          )
          d.scale.set(2.15 * s, (st === 'willow' ? 2.45 : 1.8) * s, 2.05 * s)
        }
        d.rotation.set(0, rot * 0.82, 0)
        d.updateMatrix()
        c3.setMatrixAt(i, d.matrix)
      }

      if (collide) cols.push({ kind: 'circle', x: tree.x, z: tree.z, r: collideRadius * s })
    })

    refreshInstanceBounds(t, c1, c2, c3)

    if (collide && cols.length) {
      runtime.colliders.push(...cols)
      return () => {
        runtime.colliders = runtime.colliders.filter((c) => !cols.includes(c))
      }
    }
  }, [list, style, collide, collideRadius])

  if (list.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, list.length]}
        geometry={geo.cylinder(10)}
        material={mats.trunk}
        castShadow={castShadow}
        receiveShadow
      />
      <instancedMesh
        ref={canopy1}
        args={[undefined, undefined, list.length]}
        geometry={canopyGeo}
        material={mats.leafA}
        castShadow={castShadow}
        receiveShadow
      />
      <instancedMesh
        ref={canopy2}
        args={[undefined, undefined, list.length]}
        geometry={canopyGeo}
        material={mats.leafB}
        castShadow={false}
        receiveShadow
      />
      <instancedMesh
        ref={canopy3}
        args={[undefined, undefined, list.length]}
        geometry={canopyGeo}
        material={mats.leafA}
        castShadow={false}
        receiveShadow
      />
      <Suspense fallback={null}>
        <TexturedTreeAccents
          trees={list}
          palette={palette}
          style={style}
          trunkColor={trunkColor}
          canopyA={canopyA}
          canopyB={canopyB}
          sway={sway}
        />
      </Suspense>
    </group>
  )
})

interface TreeAssetPart {
  geometry: THREE.BufferGeometry
  materialName: string
}

function assetParts(scene: THREE.Group): TreeAssetPart[] {
  const parts: TreeAssetPart[] = []
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const material = Array.isArray(object.material) ? object.material[0] : object.material
    parts.push({
      geometry: object.geometry,
      materialName: material?.name ?? '',
    })
  })
  return parts
}

function TreeAssetPartInstances({
  geometry,
  material,
  trees,
  modelScale,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  trees: TreeSpec[]
  modelScale: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    trees.forEach((tree, index) => {
      const scale = (tree.scale ?? 1) * modelScale
      dummy.position.set(tree.x, tree.y ?? 0, tree.z)
      dummy.rotation.set(0, tree.rotation ?? 0, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    refreshInstanceBounds(mesh)
  }, [trees, modelScale])

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, trees.length]}
      geometry={geometry}
      material={material}
      castShadow={false}
      receiveShadow
    />
  )
}

function TexturedTreeVariantInstances({
  scene,
  trees,
  modelScale,
  materialFor,
}: {
  scene: THREE.Group
  trees: TreeSpec[]
  modelScale: number
  materialFor: (name: string) => THREE.Material
}) {
  const parts = useMemo(() => assetParts(scene), [scene])
  if (trees.length === 0) return null
  return (
    <group>
      {parts.map((part, index) => (
        <TreeAssetPartInstances
          key={`${part.materialName}-${index}`}
          geometry={part.geometry}
          material={materialFor(part.materialName)}
          trees={trees}
          modelScale={modelScale}
        />
      ))}
    </group>
  )
}

function TexturedTreeAccents({
  trees,
  palette,
  style,
  trunkColor,
  canopyA,
  canopyB,
  sway,
}: {
  trees: TreeSpec[]
  palette: Palette
  style: TreeStyle
  trunkColor: string
  canopyA?: string
  canopyB?: string
  sway: number
}) {
  const tree01 = useGLTF(TREE_ASSET_URLS.tree01).scene
  const tree04 = useGLTF(TREE_ASSET_URLS.tree04).scene
  const pine01 = useGLTF(TREE_ASSET_URLS.pine01).scene
  const birch01 = useGLTF(TREE_ASSET_URLS.birch01).scene
  const dead01 = useGLTF(TREE_ASSET_URLS.dead01).scene

  const barkMap = useTexture(TREE_ASSET_URLS.bark)
  const leafMap = useTexture(TREE_ASSET_URLS.leaves)
  const pineLeafMap = useTexture(TREE_ASSET_URLS.pineLeaves)
  const birchBarkMap = useTexture(TREE_ASSET_URLS.birchBark)
  const birchLeafMap = useTexture(TREE_ASSET_URLS.birchLeaves)

  const variants = useMemo(() => {
    const result: Record<TexturedTreeVariant, TreeSpec[]> = {
      tree01: [],
      tree04: [],
      pine01: [],
      birch01: [],
      dead01: [],
    }
    trees.forEach((tree, index) => {
      if (!usesTexturedTree(tree, index, style)) return
      result[texturedTreeVariant(tree, index, style)].push(tree)
    })
    return result
  }, [trees, style])

  useLayoutEffect(() => {
    for (const texture of [barkMap, leafMap, pineLeafMap, birchBarkMap, birchLeafMap]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.flipY = false
      texture.anisotropy = 4
      texture.needsUpdate = true
    }
  }, [barkMap, leafMap, pineLeafMap, birchBarkMap, birchLeafMap])

  const materials = useMemo(() => {
    const leafTintA = new THREE.Color(canopyA ?? palette.foliageA).lerp(
      new THREE.Color('#ffffff'),
      0.58,
    )
    const leafTintB = new THREE.Color(canopyB ?? palette.foliageB).lerp(
      new THREE.Color('#ffffff'),
      0.64,
    )
    const makeLeaf = (map: THREE.Texture, color: THREE.Color) =>
      new THREE.MeshStandardMaterial({
        map,
        color,
        roughness: 0.94,
        metalness: 0,
        alphaTest: 0.34,
        side: THREE.DoubleSide,
      })

    return {
      bark: new THREE.MeshStandardMaterial({
        map: barkMap,
        color: new THREE.Color(trunkColor).lerp(new THREE.Color('#ffffff'), 0.34),
        roughness: 0.96,
      }),
      leaves: makeLeaf(leafMap, leafTintA),
      pineLeaves: makeLeaf(pineLeafMap, leafTintB),
      birchBark: new THREE.MeshStandardMaterial({
        map: birchBarkMap,
        color: new THREE.Color('#eee9dd'),
        roughness: 0.98,
      }),
      birchLeaves: makeLeaf(birchLeafMap, leafTintB),
    }
  }, [
    barkMap,
    leafMap,
    pineLeafMap,
    birchBarkMap,
    birchLeafMap,
    trunkColor,
    canopyA,
    canopyB,
    palette,
  ])

  useLayoutEffect(() => {
    if (sway > 0) {
      applySway(materials.leaves, sway * 0.72, 1.5, 0.55, true)
      applySway(materials.pineLeaves, sway * 0.58, 1.6, 0.62, true)
      applySway(materials.birchLeaves, sway * 0.76, 1.5, 0.68, true)
    }
    return () => {
      Object.values(materials).forEach((material) => material.dispose())
    }
  }, [materials, sway])

  const materialFor = (name: string) => {
    const key = name.toLowerCase()
    if (key.includes('birch_bark')) return materials.birchBark
    if (key.includes('birch_leaves')) return materials.birchLeaves
    if (key.includes('pine_leaves')) return materials.pineLeaves
    if (key.includes('leaves')) return materials.leaves
    return materials.bark
  }

  return (
    <group>
      <TexturedTreeVariantInstances scene={tree01} trees={variants.tree01} modelScale={0.94} materialFor={materialFor} />
      <TexturedTreeVariantInstances scene={tree04} trees={variants.tree04} modelScale={0.86} materialFor={materialFor} />
      <TexturedTreeVariantInstances scene={pine01} trees={variants.pine01} modelScale={0.72} materialFor={materialFor} />
      <TexturedTreeVariantInstances scene={birch01} trees={variants.birch01} modelScale={0.58} materialFor={materialFor} />
      <TexturedTreeVariantInstances scene={dead01} trees={variants.dead01} modelScale={0.96} materialFor={materialFor} />
    </group>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Grass — instanced tufts with per-instance sway.
 * ──────────────────────────────────────────────────────────────────────────── */

interface ScatterProps {
  count: number
  /** Area to scatter over. */
  center?: [number, number]
  size?: [number, number]
  height: (x: number, z: number) => number
  /** Return false to reject a candidate position (paths, water, buildings). */
  accept?: (x: number, z: number, y: number) => boolean
  seed?: number
}

function scatter({ count, center = [0, 0], size = [60, 60], height, accept, seed = 7 }: ScatterProps) {
  const rand = mulberry32(seed)
  const out: { x: number; z: number; y: number; s: number; r: number }[] = []
  let attempts = 0
  const maxAttempts = count * 12
  while (out.length < count && attempts < maxAttempts) {
    attempts++
    const x = center[0] + (rand() - 0.5) * size[0]
    const z = center[1] + (rand() - 0.5) * size[1]
    const y = height(x, z)
    if (!Number.isFinite(y)) continue
    if (accept && !accept(x, z, y)) continue
    out.push({ x, z, y, s: 0.65 + rand() * 0.75, r: rand() * Math.PI * 2 })
  }
  return out
}

export const GrassField = memo(function GrassField({
  count = 900,
  center,
  size,
  height,
  accept,
  colorA = '#7fa858',
  colorB = '#5d8544',
  seed = 21,
  bladeHeight = 0.42,
  sway = 0.16,
}: ScatterProps & {
  colorA?: string
  colorB?: string
  bladeHeight?: number
  sway?: number
}) {
  const { foliage: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const ref = useRef<THREE.InstancedMesh>(null)

  const items = useMemo(
    () => scatter({ count: n, center, size, height, accept, seed }),
    [n, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )

  // A tuft: three crossed tapered quads. Cheap, reads well from any angle.
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 3; i++) {
      const p = new THREE.PlaneGeometry(0.2, 1, 1, 3)
      p.translate(0, 0.5, 0)
      // Taper: pull the blade to a point at the tip, flare slightly at the base.
      const pos = p.attributes.position as THREE.BufferAttribute
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v)
        pos.setX(v, pos.getX(v) * Math.pow(1 - y, 0.85) * (1 + (1 - y) * 0.3))
        // A slight forward bow so blades are not razor-straight.
        pos.setZ(v, pos.getZ(v) + y * y * 0.14)
      }
      p.computeVertexNormals()
      p.rotateY((i / 3) * Math.PI)
      parts.push(p)
    }
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    return merged
  }, [])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      storybook({
        color: colorA,
        roughness: 1,
        rim: 0.3,
        gradient: 0.42,
        gradientColor: colorB,
        side: THREE.DoubleSide,
      }),
    [colorA, colorB],
  )

  useLayoutEffect(() => {
    applySway(material, sway, 1.6, 0.9, true)
  }, [material, sway])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    items.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(it.s, bladeHeight * 2 * it.s, it.s)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    refreshInstanceBounds(m)
  }, [items, bladeHeight])

  if (items.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      geometry={geometry}
      material={material}
      receiveShadow
    />
  )
})

/** Minimal geometry merge — avoids pulling in three's addons for one function. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  const posArrays: Float32Array[] = []
  const normArrays: Float32Array[] = []
  const uvArrays: Float32Array[] = []
  const indices: number[] = []
  let offset = 0

  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute
    const nrm = g.attributes.normal as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    posArrays.push(p.array as Float32Array)
    normArrays.push(nrm.array as Float32Array)
    uvArrays.push(uv.array as Float32Array)
    const idx = g.index
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset)
    } else {
      for (let i = 0; i < p.count; i++) indices.push(i + offset)
    }
    offset += p.count
  }

  const concat = (arrays: Float32Array[]) => {
    const total = arrays.reduce((s, a) => s + a.length, 0)
    const res = new Float32Array(total)
    let o = 0
    for (const a of arrays) {
      res.set(a, o)
      o += a.length
    }
    return res
  }

  out.setAttribute('position', new THREE.BufferAttribute(concat(posArrays), 3))
  out.setAttribute('normal', new THREE.BufferAttribute(concat(normArrays), 3))
  out.setAttribute('uv', new THREE.BufferAttribute(concat(uvArrays), 2))
  out.setIndex(indices)
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * Flowers, mushrooms, rocks
 * ──────────────────────────────────────────────────────────────────────────── */

export const FlowerField = memo(function FlowerField({
  count = 120,
  center,
  size,
  height,
  accept,
  seed = 55,
  colors = ['#f6a8b8', '#ffd98a', '#e9e4f2', '#ff9e7d'],
  scale = 1,
  /** 0..1 — flowers bloom outward as this rises. Used by memory reactions. */
  bloom = 1,
}: ScatterProps & { colors?: string[]; scale?: number; bloom?: number }) {
  const { foliage: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const items = useMemo(
    () => scatter({ count: n, center, size, height, accept, seed }),
    [n, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )

  const groups = useMemo(() => {
    // Split by colour so each colour is one instanced draw call.
    const buckets: { color: string; items: typeof items }[] = colors.map((c) => ({ color: c, items: [] }))
    items.forEach((it, i) => buckets[i % buckets.length].items.push(it))
    return buckets.filter((b) => b.items.length > 0)
  }, [items, colors])

  return (
    <group>
      {groups.map((b) => (
        <FlowerBucket key={b.color} color={b.color} items={b.items} scale={scale} bloom={bloom} />
      ))}
    </group>
  )
})

/** How close she has to be for a flower to open, in metres. */
const BLOOM_RADIUS = 3.4
/**
 * Minimum seconds between jingles.
 *
 * A dense meadow crosses dozens of flowers' thresholds in the same frame. Left
 * unlimited that is thirty overlapping figures — a chord, not a phrase. Spacing
 * them out turns a walk into something that sounds played.
 */
const BLOOM_CHIME_GAP = 0.85

function FlowerBucket({
  color,
  items,
  scale,
  bloom,
}: {
  color: string
  items: { x: number; z: number; y: number; s: number; r: number }[]
  scale: number
  bloom: number
}) {
  const headRef = useRef<THREE.InstancedMesh>(null)
  const stemRef = useRef<THREE.InstancedMesh>(null)
  const bloomRef = useRef(bloom)
  bloomRef.current = bloom
  /**
   * Per-flower openness, eased toward a proximity target every frame.
   *
   * `bloom` is the authored floor — memory reactions still drive the whole field
   * at once — and this is added on top, so a meadow that is already open just
   * opens a little further where she walks, while a closed one wakes as she
   * passes. Values live in a Float32Array because there is one per instance and
   * they are written every frame; a React state array would be absurd here.
   */
  const openRef = useRef<Float32Array>(new Float32Array(0))
  /** True once a flower has played its note, so each only ever chimes once. */
  const chimedRef = useRef<Uint8Array>(new Uint8Array(0))
  /** Rate-limits the jingle: a dense patch must not fire thirty notes at once. */
  const lastChime = useRef(0)

  const headMat = useMemo(
    () => storybook({ color, roughness: 0.9, rim: 0.45, gradient: 0.2 }),
    [color],
  )
  const stemMat = useMemo(
    () => storybook({ color: '#5d8544', roughness: 1, rim: 0.2 }),
    [],
  )

  useLayoutEffect(() => {
    applySway(headMat, 0.1, 1.2, 1.1, true)
    applySway(stemMat, 0.1, 1.2, 1.1, true)
  }, [headMat, stemMat])

  const write = () => {
    const h = headRef.current
    const s = stemRef.current
    if (!h || !s) return
    const d = new THREE.Object3D()
    const base = clamp01(bloomRef.current)
    const open = openRef.current
    items.forEach((it, i) => {
      const stemH = 0.3 * it.s * scale
      d.position.set(it.x, it.y + stemH / 2, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(0.028, stemH, 0.028)
      d.updateMatrix()
      s.setMatrixAt(i, d.matrix)

      // Closed flowers are a small tight bud; open ones are wider than tall.
      const b = clamp01(base * (0.34 + 0.66 * (open[i] ?? 0)))
      d.position.set(it.x, it.y + stemH, it.z)
      d.rotation.set(0, it.r, 0)
      const hs = 0.13 * it.s * scale * b
      d.scale.set(hs, hs * (0.6 + 0.5 * (1 - (open[i] ?? 0))), hs)
      d.updateMatrix()
      h.setMatrixAt(i, d.matrix)
    })
    h.instanceMatrix.needsUpdate = true
    s.instanceMatrix.needsUpdate = true
  }

  useLayoutEffect(() => {
    openRef.current = new Float32Array(items.length)
    chimedRef.current = new Uint8Array(items.length)
    write()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, scale])

  const lastBloom = useRef(bloom)
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const px = runtime.playerPos.x
    const pz = runtime.playerPos.z
    const open = openRef.current
    const chimed = chimedRef.current
    let changed = Math.abs(lastBloom.current - bloomRef.current) > 0.002
    lastBloom.current = bloomRef.current

    let toChime = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const dist = Math.hypot(it.x - px, it.z - pz)
      const target = dist > BLOOM_RADIUS ? 0 : 1 - dist / BLOOM_RADIUS
      const prev = open[i]
      // Opens briskly, closes slowly — a path of open flowers stays behind her
      // for a few seconds, which is most of why it reads as her doing it.
      const rate = target > prev ? 3.4 : 0.55
      open[i] = prev + (target - prev) * Math.min(1, dt * rate)
      if (Math.abs(open[i] - prev) > 0.0015) changed = true
      // The note belongs to the moment of opening, not to being near.
      if (!chimed[i] && open[i] > 0.5) {
        chimed[i] = 1
        toChime++
      } else if (chimed[i] && open[i] < 0.08) {
        // Re-arm once fully closed, so walking back through plays again.
        chimed[i] = 0
      }
    }

    if (toChime > 0) {
      const now = state.clock.elapsedTime
      if (now - lastChime.current > BLOOM_CHIME_GAP) {
        lastChime.current = now
        audio.cue('bloom')
      }
    }

    if (changed) write()
  })

  return (
    <group>
      <instancedMesh ref={stemRef} args={[geo.cylinder(5), stemMat, items.length]} frustumCulled={false} />
      <instancedMesh
        ref={headRef}
        args={[geo.sphere(8), headMat, items.length]}
        frustumCulled={false}
        castShadow={false}
      />
    </group>
  )
}

export const RockField = memo(function RockField({
  count = 30,
  center,
  size,
  height,
  accept,
  seed = 91,
  color = '#8c8a84',
  scale = 1,
  collide = true,
}: ScatterProps & { color?: string; scale?: number; collide?: boolean }) {
  const items = useMemo(
    () => scatter({ count, center, size, height, accept, seed }),
    [count, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(
    () => storybook({ color, roughness: 0.98, rim: 0.24, gradient: 0.3, flatShading: true }),
    [color],
  )

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    const cols: Collider[] = []
    items.forEach((it, i) => {
      const s = it.s * scale
      d.position.set(it.x, it.y + s * 0.22, it.z)
      d.rotation.set(it.r * 0.3, it.r, it.r * 0.2)
      d.scale.set(s * 1.2, s * 0.75, s)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      if (collide && s > 0.8) cols.push({ kind: 'circle', x: it.x, z: it.z, r: s * 0.5 })
    })
    m.instanceMatrix.needsUpdate = true
    if (cols.length) {
      runtime.colliders.push(...cols)
      return () => {
        runtime.colliders = runtime.colliders.filter((c) => !cols.includes(c))
      }
    }
  }, [items, scale, collide])

  if (items.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geo.blob(), mat, items.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
})

interface RockTrailProps {
  /** Polyline the trail follows, in world XZ. */
  path: [number, number][]
  height: (x: number, z: number) => number
  /** Roughly how far either side of the centre line the stones sit. */
  edge?: number
  /** Stones placed per world-metre of path length (before random thinning). */
  density?: number
  seed?: number
  color?: string
  scale?: number
}

/**
 * Two loose lines of small stones bordering a path, so a walker can read the
 * route ahead the way a real trail is edged by kicked-aside rocks. Purely
 * decorative and navigational — the pebbles are small and carry no colliders,
 * so she can still step over them. Reused for the forest and mountain trails.
 */
export const RockTrail = memo(function RockTrail({
  path,
  height,
  edge = 1.9,
  density = 0.85,
  seed = 71,
  color = '#877c70',
  scale = 1,
}: RockTrailProps) {
  const items = useMemo(() => {
    const rand = mulberry32(seed)
    const out: { x: number; z: number; y: number; s: number; r: number }[] = []
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i]
      const [bx, bz] = path[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const segLen = Math.hypot(dx, dz)
      if (segLen < 1e-4) continue
      const tx = dx / segLen
      const tz = dz / segLen
      // Left-hand perpendicular in XZ.
      const nx = -tz
      const nz = tx
      const steps = Math.max(1, Math.round(segLen * density))
      for (let s = 0; s < steps; s++) {
        const f = (s + 0.5) / steps
        const cx = ax + dx * f
        const cz = az + dz * f
        for (const side of [-1, 1] as const) {
          // Leave gaps, so the border reads as scattered rather than a kerb.
          if (rand() > 0.78) continue
          const off = edge + (rand() - 0.5) * 0.8
          const along = (rand() - 0.5) * (segLen / steps) * 0.7
          const x = cx + nx * side * off + tx * along
          const z = cz + nz * side * off + tz * along
          const y = height(x, z)
          if (!Number.isFinite(y)) continue
          out.push({ x, z, y, s: 0.26 + rand() * 0.32, r: rand() * Math.PI * 2 })
        }
      }
    }
    return out
  }, [path, height, edge, density, seed])

  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(
    () => storybook({ color, roughness: 0.98, rim: 0.26, gradient: 0.34, flatShading: true }),
    [color],
  )

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    items.forEach((it, i) => {
      const sc = it.s * scale
      d.position.set(it.x, it.y + sc * 0.14, it.z)
      d.rotation.set(it.r * 0.25, it.r, it.r * 0.2)
      d.scale.set(sc * 1.3, sc * 0.55, sc)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [items, scale])

  if (items.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geo.blob(), mat, items.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
})

export const MushroomField = memo(function MushroomField({
  count = 40,
  center,
  size,
  height,
  accept,
  seed = 77,
  capColor = '#c96b5c',
  glowColor = '#8fe6d0',
  radius = 4.2,
}: ScatterProps & {
  capColor?: string
  /** Colour the caps wake up in as she passes. */
  glowColor?: string
  /** How close she has to be before they light, in metres. */
  radius?: number
}) {
  const items = useMemo(
    () => scatter({ count, center, size, height, accept, seed }),
    [count, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )
  const capRef = useRef<THREE.InstancedMesh>(null)
  const stemRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.InstancedMesh>(null)
  const capMat = useMemo(() => storybook({ color: capColor, roughness: 0.85, rim: 0.4 }), [capColor])
  const stemMat = useMemo(() => storybook({ color: '#efe2cd', roughness: 0.95, rim: 0.3 }), [])
  /**
   * The glow is a separate additive halo mesh rather than emissive on the cap.
   *
   * Instances of one mesh share a material, so per-mushroom brightness cannot
   * come from a uniform — it has to be geometry. Scaling a halo per instance is
   * free (it is a matrix write we are already doing) and gives a soft bloom the
   * cap itself could never produce.
   */
  const glowMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: new THREE.Color(glowColor),
      transparent: true,
      // Bright enough for the bloom pass to catch it. At 0.5 the halo was
      // technically present and visually indistinguishable from a slightly paler
      // cap — the glow only reads as a glow once it blooms.
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: true,
    }),
    [glowColor],
  )
  useLayoutEffect(() => () => glowMat.dispose(), [glowMat])

  /** Per-instance lit amount, eased toward the proximity target each frame. */
  const litRef = useRef<Float32Array>(new Float32Array(0))

  const writeStatic = useCallbackRef(() => {
    const c = capRef.current
    const s = stemRef.current
    if (!c || !s) return
    const d = new THREE.Object3D()
    items.forEach((it, i) => {
      const sc = it.s * 0.5
      d.position.set(it.x, it.y + sc * 0.16, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(sc * 0.16, sc * 0.34, sc * 0.16)
      d.updateMatrix()
      s.setMatrixAt(i, d.matrix)

      d.position.set(it.x, it.y + sc * 0.33, it.z)
      d.scale.set(sc * 0.44, sc * 0.3, sc * 0.44)
      d.updateMatrix()
      c.setMatrixAt(i, d.matrix)
    })
    c.instanceMatrix.needsUpdate = true
    s.instanceMatrix.needsUpdate = true
  })

  useLayoutEffect(() => {
    litRef.current = new Float32Array(items.length)
    writeStatic()
  }, [items, writeStatic])

  useFrame((state, rawDt) => {
    const g = glowRef.current
    if (!g || items.length === 0) return
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const px = runtime.playerPos.x
    const pz = runtime.playerPos.z
    const lit = litRef.current
    const d = new THREE.Object3D()
    let anyLit = false

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const dist = Math.hypot(it.x - px, it.z - pz)
      // Wakes within `radius`, brightest right beside her.
      const target = dist > radius ? 0 : 1 - dist / radius
      // Rises quickly, falls away slowly, so a walk leaves a trail behind her.
      const rate = target > lit[i] ? 4.5 : 1.1
      lit[i] += (target - lit[i]) * Math.min(1, dt * rate)
      if (lit[i] < 0.004) continue
      anyLit = true

      const sc = it.s * 0.5
      // Each breathes on its own phase, so the patch shimmers rather than pulses.
      const breathe = 0.86 + 0.14 * Math.sin(t * 1.7 + it.r * 6.1)
      // Comfortably larger than the cap, so the halo reads as light coming off
      // it rather than as the cap having changed colour.
      const size = sc * 1.75 * lit[i] * breathe
      d.position.set(it.x, it.y + sc * 0.34, it.z)
      d.rotation.set(0, 0, 0)
      d.scale.set(size, size * 0.78, size)
      d.updateMatrix()
      g.setMatrixAt(i, d.matrix)
    }

    // Collapse anything that has gone dark, so it stops drawing.
    for (let i = 0; i < items.length; i++) {
      if (lit[i] >= 0.004) continue
      d.position.set(items[i].x, items[i].y, items[i].z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(0)
      d.updateMatrix()
      g.setMatrixAt(i, d.matrix)
    }

    g.instanceMatrix.needsUpdate = true
    g.visible = anyLit
  })

  if (items.length === 0) return null
  return (
    <group>
      <instancedMesh ref={stemRef} args={[geo.cylinder(6), stemMat, items.length]} frustumCulled={false} />
      <instancedMesh ref={capRef} args={[geo.sphere(10), capMat, items.length]} castShadow frustumCulled={false} />
      <instancedMesh
        ref={glowRef}
        args={[geo.sphere(8), glowMat, items.length]}
        frustumCulled={false}
        visible={false}
        renderOrder={7}
      />
    </group>
  )
})

/** A stable callback that always sees the latest closure. */
function useCallbackRef(fn: () => void) {
  const ref = useRef(fn)
  ref.current = fn
  return useMemo(() => () => ref.current(), [])
}


/* ────────────────────────────────────────────────────────────────────────────
 * Undergrowth: bushes, ferns and fallen logs.
 * These are what stop a region reading as "ground with trees on it" — they
 * break up the floor plane and give the middle distance something to hold.
 * All instanced, all respecting the foliage-density setting.
 * ──────────────────────────────────────────────────────────────────────────── */

export const BushField = memo(function BushField({
  count = 90,
  center,
  size,
  height,
  accept,
  seed = 301,
  colorA,
  colorB,
  scale = 1,
  /** Bigger bushes become obstacles; small ones stay walkable. */
  collideAbove = 1.35,
  sway = 0.07,
}: ScatterProps & {
  colorA?: string
  colorB?: string
  scale?: number
  collideAbove?: number
  sway?: number
}) {
  const { foliage: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const items = useMemo(
    () => scatter({ count: n, center, size, height, accept, seed }),
    [n, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )

  const lower = useRef<THREE.InstancedMesh>(null)
  const upper = useRef<THREE.InstancedMesh>(null)

  const mats = useMemo(
    () => ({
      a: storybook({ color: colorA ?? '#3f5c38', roughness: 0.97, rim: 0.3, gradient: 0.34 }),
      b: storybook({ color: colorB ?? '#2c452b', roughness: 0.97, rim: 0.24, gradient: 0.34 }),
    }),
    [colorA, colorB],
  )

  useLayoutEffect(() => {
    if (sway > 0) {
      applySway(mats.a, sway, 1.4, 0.7, true)
      applySway(mats.b, sway * 0.8, 1.4, 0.8, true)
    }
  }, [mats, sway])

  useLayoutEffect(() => {
    const lo = lower.current
    const up = upper.current
    if (!lo || !up) return
    const d = new THREE.Object3D()
    const cols: Collider[] = []
    items.forEach((it, i) => {
      const sc = it.s * scale
      d.position.set(it.x, it.y + sc * 0.3, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(sc * 1.5, sc * 0.85, sc * 1.4)
      d.updateMatrix()
      lo.setMatrixAt(i, d.matrix)

      // A second, smaller lobe so the silhouette is not a single dome.
      d.position.set(it.x + Math.sin(it.r) * sc * 0.4, it.y + sc * 0.62, it.z + Math.cos(it.r) * sc * 0.35)
      d.rotation.set(0, it.r * 1.7, 0)
      d.scale.set(sc * 1.0, sc * 0.7, sc * 0.95)
      d.updateMatrix()
      up.setMatrixAt(i, d.matrix)

      if (sc >= collideAbove) cols.push({ kind: 'circle', x: it.x, z: it.z, r: sc * 0.55 })
    })
    lo.instanceMatrix.needsUpdate = true
    up.instanceMatrix.needsUpdate = true
    if (cols.length) {
      runtime.colliders.push(...cols)
      return () => {
        runtime.colliders = runtime.colliders.filter((c) => !cols.includes(c))
      }
    }
  }, [items, scale, collideAbove])

  if (items.length === 0) return null
  return (
    <group>
      <instancedMesh
        ref={lower}
        args={[undefined, undefined, items.length]}
        geometry={geo.blob()}
        material={mats.a}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={upper}
        args={[undefined, undefined, items.length]}
        geometry={geo.blob()}
        material={mats.b}
        castShadow
        frustumCulled={false}
      />
    </group>
  )
})

/** Fallen trunks. Cheap, and they read as age. */
export const LogField = memo(function LogField({
  count = 14,
  center,
  size,
  height,
  accept,
  seed = 401,
  color = '#5a4534',
  scale = 1,
}: ScatterProps & { color?: string; scale?: number }) {
  const items = useMemo(
    () => scatter({ count, center, size, height, accept, seed }),
    [count, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => storybook({ color, roughness: 0.98, rim: 0.24, gradient: 0.3 }), [color])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    const cols: Collider[] = []
    items.forEach((it, i) => {
      const len = (2.2 + it.s * 2.4) * scale
      const rad = 0.24 * it.s * scale
      d.position.set(it.x, it.y + rad, it.z)
      // Lying down, rolled slightly so it does not look laid out on purpose.
      d.rotation.set(Math.PI / 2, it.r, it.r * 0.12)
      d.scale.set(rad * 2, len, rad * 2)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      cols.push({ kind: 'circle', x: it.x, z: it.z, r: Math.max(0.5, rad * 2.2) })
    })
    m.instanceMatrix.needsUpdate = true
    runtime.colliders.push(...cols)
    return () => {
      runtime.colliders = runtime.colliders.filter((c) => !cols.includes(c))
    }
  }, [items, scale])

  if (items.length === 0) return null
  return <instancedMesh ref={ref} args={[geo.cylinder(8), mat, items.length]} castShadow receiveShadow frustumCulled={false} />
})

/** Low ferns / weeds — a second, shorter layer under the grass. */
export const FernField = memo(function FernField({
  count = 200,
  center,
  size,
  height,
  accept,
  seed = 501,
  color = '#37552f',
}: ScatterProps & { color?: string }) {
  const { foliage: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const items = useMemo(
    () => scatter({ count: n, center, size, height, accept, seed }),
    [n, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(
    () => storybook({ color, roughness: 1, rim: 0.28, gradient: 0.36, side: THREE.DoubleSide }),
    [color],
  )
  useLayoutEffect(() => {
    applySway(mat, 0.13, 1.5, 0.85, true)
  }, [mat])

  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) {
      const p = new THREE.PlaneGeometry(0.5, 0.34, 1, 2)
      p.translate(0.25, 0, 0)
      p.rotateZ(0.5)
      p.rotateY((i / 4) * Math.PI * 2)
      parts.push(p)
    }
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    return merged
  }, [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    items.forEach((it, i) => {
      d.position.set(it.x, it.y + 0.04, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.setScalar(0.7 + it.s * 0.8)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [items])

  if (items.length === 0) return null
  return <instancedMesh ref={ref} args={[geometry, mat, items.length]} receiveShadow frustumCulled={false} />
})

/* ────────────────────────────────────────────────────────────────────────────
 * Water — a shader plane with rolling ripples and a sun glint.
 * ──────────────────────────────────────────────────────────────────────────── */

// `fog_pars_vertex` declares vFogDepth and `fog_vertex` fills it from mvPosition.
// A fully custom ShaderMaterial does not get those for free — three only injects
// the *fragment* tonemapping/colorspace pars automatically.
const WATER_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vUv = uv;
    vec3 p = position;
    float w = sin( p.x * 0.35 + uTime * 0.8 ) * 0.5
            + sin( p.y * 0.47 - uTime * 0.62 ) * 0.35
            + sin( ( p.x + p.y ) * 0.19 + uTime * 0.4 ) * 0.4;
    p.z += w * uAmp;
    vWave = w;
    vec4 world = modelMatrix * vec4( p, 1.0 );
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    #include <fog_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`

const WATER_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uGlint;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vWave;

  void main() {
    vec3 viewDir = normalize( cameraPosition - vWorld );
    float fres = pow( 1.0 - clamp( viewDir.y, 0.0, 1.0 ), 2.2 );

    vec3 col = mix( uDeep, uShallow, clamp( vWave * 0.35 + 0.5, 0.0, 1.0 ) );
    col = mix( col, uShallow, fres * 0.55 );

    // Broken specular band toward the sun — the "sunset reflection".
    vec3 sd = normalize( uSunDir );
    float toSun = clamp( dot( normalize( vec3( viewDir.x, 0.0, viewDir.z ) ), normalize( vec3( sd.x, 0.0, sd.z ) ) ), 0.0, 1.0 );
    float band = pow( toSun, 6.0 );
    float sparkle = sin( vWorld.x * 3.1 + uTime * 2.2 ) * sin( vWorld.z * 2.7 - uTime * 1.7 );
    sparkle = smoothstep( 0.55, 1.0, sparkle );
    col += uGlint * band * ( 0.25 + sparkle * 0.9 );

    // Soft foam where the wave crests.
    float foam = smoothstep( 0.85, 1.25, vWave );
    col = mix( col, vec3( 1.0 ), foam * 0.18 );

    gl_FragColor = vec4( col, uOpacity );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export const Water = memo(function Water({
  width,
  depth,
  position = [0, 0, 0],
  shallow = '#6fa8a8',
  deep = '#2f5560',
  glint = '#ffc890',
  sunDir = [0.7, 0.3, -0.6],
  amplitude = 0.08,
  opacity = 0.94,
  segments = 48,
}: {
  width: number
  depth: number
  position?: [number, number, number]
  shallow?: string
  deep?: string
  glint?: string
  sunDir?: [number, number, number]
  amplitude?: number
  opacity?: number
  segments?: number
}) {
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(width, depth, segments, segments),
    [width, depth, segments],
  )
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        transparent: opacity < 1,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uAmp: { value: amplitude },
            uShallow: { value: new THREE.Color(shallow) },
            uDeep: { value: new THREE.Color(deep) },
            uGlint: { value: new THREE.Color(glint) },
            uSunDir: { value: new THREE.Vector3(...sunDir) },
            uOpacity: { value: opacity },
          },
        ]),
      }),
    [shallow, deep, glint, amplitude, opacity, sunDir[0], sunDir[1], sunDir[2]],
  )
  useLayoutEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    />
  )
})

/* ────────────────────────────────────────────────────────────────────────────
 * Reeds — instanced, at the water's edge.
 * ──────────────────────────────────────────────────────────────────────────── */

export const Reeds = memo(function Reeds({
  count = 160,
  center,
  size,
  height,
  accept,
  seed = 33,
  color = '#7d8f52',
}: ScatterProps & { color?: string }) {
  const { foliage: density } = useQualityProfile().profile
  const n = Math.max(0, Math.round(count * density))
  const items = useMemo(
    () => scatter({ count: n, center, size, height, accept, seed }),
    [n, center?.[0], center?.[1], size?.[0], size?.[1], height, accept, seed],
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(
    () => storybook({ color, roughness: 1, rim: 0.35, side: THREE.DoubleSide }),
    [color],
  )
  useLayoutEffect(() => {
    applySway(mat, 0.24, 1.5, 0.75, true)
  }, [mat])

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.07, 1, 1, 4)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    items.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(1, 1.1 + it.s * 0.9, 1)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [items])

  if (items.length === 0) return null
  return <instancedMesh ref={ref} args={[geometry, mat, items.length]} frustumCulled={false} />
})

/* ────────────────────────────────────────────────────────────────────────────
 * Light shafts — moonlight through the canopy.
 *
 * An open cone stands in for a volume of lit air. The trick that makes it read
 * as light rather than as a translucent plastic cone is the view term: a
 * fragment whose surface faces the camera is one you are looking THROUGH the
 * belly of, so more air lies behind it and it should be brighter, while the
 * silhouette edge — where the surface is edge-on — should vanish. That is the
 * opposite of a fresnel rim, and it is what erases the geometry's outline from
 * every angle, so no rotation ever shows a hard edge.
 *
 * A cone is rotationally symmetric, so nothing here needs billboarding.
 * ──────────────────────────────────────────────────────────────────────────── */

const SHAFT_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying float vAxis;

  void main() {
    // 0 at the wide top (the canopy gap), 1 at the narrow bottom.
    vAxis = clamp( 0.5 - position.y, 0.0, 1.0 );
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vNormalW = normalize( mat3( modelMatrix ) * normal );
    vViewDirW = normalize( cameraPosition - world.xyz );
    vec4 mvPosition = viewMatrix * world;
    vFogDepth = - mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const SHAFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying float vAxis;

  void main() {
    // Facing the camera => looking through the depth of the cone => brighter.
    float through = abs( dot( normalize( vNormalW ), normalize( vViewDirW ) ) );
    through = pow( through, 1.6 );
    // Brightest just under the canopy, gone before it reaches the ground.
    float fall = ( 1.0 - smoothstep( 0.42, 1.0, vAxis ) ) * smoothstep( 0.0, 0.14, vAxis );
    // The canopy above breathes in the wind, so the light below it should too:
    // a slow occlusion swell plus a faint ripple sliding down the shaft.
    float sway = 0.82 + 0.18 * sin( uTime * 0.32 + vAxis * 2.2 );
    float ripple = 0.92 + 0.08 * sin( uTime * 1.1 - vAxis * 9.0 );
    float alpha = through * fall * sway * ripple * uOpacity;
    if ( alpha <= 0.002 ) discard;
    gl_FragColor = vec4( uColor, alpha );
    #include <fog_fragment>
  }
`

export const LightShafts = memo(function LightShafts({
  positions,
  color = '#ffe0a8',
  opacity = 0.12,
  height = 12,
  radius = 1.6,
  tilt = 0.28,
  azimuth,
}: {
  positions: [number, number, number][]
  color?: string
  opacity?: number
  height?: number
  radius?: number
  tilt?: number
  /** Optional shared direction around the vertical axis. */
  azimuth?: number
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        // A custom ShaderMaterial gets no fog plumbing for free — the varying has
        // to be declared and written by hand or the fragment chunk will not link.
        vertexShader: `varying float vFogDepth;\n${SHAFT_VERT}`,
        fragmentShader: `#include <fog_pars_fragment>\n${SHAFT_FRAG}`,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          // The view term averages well under 1, so the authored opacity is
          // scaled up to keep the same on-screen strength as the old flat cone.
          uOpacity: { value: opacity * 2.6 },
          uTime: { value: 0 },
          fogColor: { value: new THREE.Color('#000000') },
          fogNear: { value: 1 },
          fogFar: { value: 100 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: true,
      }),
    [color, opacity],
  )
  useLayoutEffect(() => () => mat.dispose(), [mat])

  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime
  })

  const geometry = useMemo(() => new THREE.ConeGeometry(radius, height, 14, 1, true), [radius, height])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group>
      {positions.map((p, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={mat}
          position={[p[0], p[1] + height / 2, p[2]]}
          rotation={[tilt, azimuth ?? i * 1.3, 0]}
          renderOrder={8}
        />
      ))}
    </group>
  )
})

export { roundedBoxGeometry }
