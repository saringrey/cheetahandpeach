import { useMemo, useLayoutEffect, memo } from 'react'
import * as THREE from 'three'
import { storybook } from '../../utils/assets'
import type { Palette } from './palettes'

export interface TerrainProps {
  /** World-space height function. Must be cheap: it is also used for collision. */
  height: (x: number, z: number) => number
  /** Extent of the mesh, centred on `center`. */
  width: number
  depth: number
  center?: [number, number]
  /** Grid resolution. 1 vertex per `step` metres. */
  step?: number
  palette: Palette
  /** Optional per-vertex tint, e.g. to paint a path or a shoreline. */
  tint?: (x: number, z: number, height: number) => THREE.Color | null
  /** Slope above which the steep colour is used. */
  rockAt?: number
  rockColor?: string
  receiveShadow?: boolean
}

/**
 * Terrain mesh generated from a height function.
 *
 * Vertex colours do the art direction: a two-tone grass gradient by height, a
 * steepness blend toward rock, and an optional painted tint for paths, mud and
 * shorelines. That keeps everything on one material and one draw call, with no
 * textures to load.
 */
export const Terrain = memo(function Terrain({
  height,
  width,
  depth,
  center = [0, 0],
  step = 2,
  palette,
  tint,
  rockAt = 0.9,
  rockColor,
  receiveShadow = true,
}: TerrainProps) {
  const geometry = useMemo(() => {
    const segX = Math.max(2, Math.round(width / step))
    const segZ = Math.max(2, Math.round(depth / step))
    const g = new THREE.PlaneGeometry(width, depth, segX, segZ)
    g.rotateX(-Math.PI / 2)
    g.translate(center[0], 0, center[1])

    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)

    const cLow = new THREE.Color(palette.groundB)
    const cHigh = new THREE.Color(palette.groundA)
    const cRock = new THREE.Color(rockColor ?? palette.path)
    const tmp = new THREE.Color()

    // Displace.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = height(x, z)
      pos.setY(i, Number.isFinite(y) ? y : 0)
    }

    // Colour, using the displaced positions so slope is real.
    const eps = step
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)

      const hx = height(x + eps, z) - height(x - eps, z)
      const hz = height(x, z + eps) - height(x, z - eps)
      const slope = Math.hypot(hx, hz) / (2 * eps)

      // Height blend, normalised over a generous range so it never bands.
      const t = THREE.MathUtils.clamp(y / 14 + 0.35, 0, 1)
      tmp.copy(cLow).lerp(cHigh, t)

      // Steepness blend toward rock.
      const rockMix = THREE.MathUtils.clamp((slope - rockAt) / 0.7, 0, 1)
      if (rockMix > 0) tmp.lerp(cRock, rockMix * 0.85)

      // Painted tint (paths, shorelines, asphalt).
      if (tint) {
        const t2 = tint(x, z, y)
        if (t2) tmp.lerp(t2, 1)
      }

      // A little per-vertex variation so large flat areas are not dead.
      const v = (Math.sin(x * 0.7) * Math.cos(z * 0.63) + Math.sin(x * 0.21 + z * 0.17)) * 0.018
      colors[i * 3] = THREE.MathUtils.clamp(tmp.r + v, 0, 1)
      colors[i * 3 + 1] = THREE.MathUtils.clamp(tmp.g + v, 0, 1)
      colors[i * 3 + 2] = THREE.MathUtils.clamp(tmp.b + v, 0, 1)
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, width, depth, center[0], center[1], step, palette, rockAt, rockColor, tint])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      storybook({
        color: '#ffffff',
        roughness: 0.97,
        rim: 0.1,
        gradient: 0.12,
        gradientColor: palette.ambientGround,
        vertexColors: true,
      }),
    [palette.ambientGround],
  )

  return <mesh geometry={geometry} material={material} receiveShadow={receiveShadow} />
})
