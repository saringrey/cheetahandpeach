import type { Collider, Bounds } from '../../store/runtime'

/**
 * Analytic collision resolution.
 *
 * There is no physics engine here on purpose: jumping is a small vertical layer,
 * while world collision stays horizontal and static. Pushing a circle out of a
 * set of fixed shapes is exact, cheap, and — unlike a solver — cannot tunnel or
 * drop the player through the world.
 */

const MAX_PASSES = 3

export interface ResolveResult {
  x: number
  z: number
  /** True if anything pushed back this frame — used to damp the walk animation. */
  hit: boolean
}

export function resolveCollisions(
  x: number,
  z: number,
  radius: number,
  colliders: Collider[],
  bounds: Bounds,
): ResolveResult {
  let px = x
  let pz = z
  let hit = false

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i]

      if (c.kind === 'circle') {
        const dx = px - c.x
        const dz = pz - c.z
        const minDist = c.r + radius
        const d2 = dx * dx + dz * dz
        if (d2 < minDist * minDist) {
          const d = Math.sqrt(d2)
          if (d < 1e-5) {
            // Dead centre: pick a deterministic direction rather than NaN.
            px = c.x + minDist
          } else {
            const push = (minDist - d) / d
            px += dx * push
            pz += dz * push
          }
          moved = true
          hit = true
        }
      } else {
        // Rotate into the box's local frame, clamp, rotate back.
        const cos = Math.cos(-c.rot)
        const sin = Math.sin(-c.rot)
        const rx = (px - c.x) * cos - (pz - c.z) * sin
        const rz = (px - c.x) * sin + (pz - c.z) * cos

        const ex = c.hw + radius
        const ez = c.hd + radius
        if (rx > -ex && rx < ex && rz > -ez && rz < ez) {
          // Push out along the axis of least penetration.
          const penX = ex - Math.abs(rx)
          const penZ = ez - Math.abs(rz)
          let nx = rx
          let nz = rz
          if (penX < penZ) {
            nx = rx >= 0 ? ex : -ex
          } else {
            nz = rz >= 0 ? ez : -ez
          }
          const bcos = Math.cos(c.rot)
          const bsin = Math.sin(c.rot)
          px = c.x + (nx * bcos - nz * bsin)
          pz = c.z + (nx * bsin + nz * bcos)
          moved = true
          hit = true
        }
      }
    }

    if (!moved) break
  }

  // Hard play-area clamp. Nothing can leave the map, ever.
  if (px < bounds.minX + radius) {
    px = bounds.minX + radius
    hit = true
  }
  if (px > bounds.maxX - radius) {
    px = bounds.maxX - radius
    hit = true
  }
  if (pz < bounds.minZ + radius) {
    pz = bounds.minZ + radius
    hit = true
  }
  if (pz > bounds.maxZ - radius) {
    pz = bounds.maxZ - radius
    hit = true
  }

  return { x: px, z: pz, hit }
}

/**
 * Is a position sane enough to spawn at? Used to reject checkpoints saved by an
 * older build whose terrain no longer exists.
 */
export function isSpawnSafe(x: number, y: number, z: number, bounds: Bounds): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  if (x < bounds.minX || x > bounds.maxX) return false
  if (z < bounds.minZ || z > bounds.maxZ) return false
  if (Math.abs(y) > 400) return false
  return true
}

/** Approximate the ground normal by sampling the height field around a point. */
export function groundSlope(
  sample: (x: number, z: number) => number,
  x: number,
  z: number,
  eps = 0.35,
): { nx: number; nz: number; steepness: number } {
  const hx = sample(x + eps, z) - sample(x - eps, z)
  const hz = sample(x, z + eps) - sample(x, z - eps)
  const nx = -hx / (2 * eps)
  const nz = -hz / (2 * eps)
  const steepness = Math.hypot(nx, nz)
  return { nx, nz, steepness }
}
