export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a))
export const smoothstep = (t: number) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
export const smootherstep = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Frame-rate independent exponential smoothing. `rate` ≈ how fast, in 1/seconds. */
export const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))

/** Shortest signed angular difference, radians. */
export function angleDelta(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function dampAngle(current: number, target: number, rate: number, dt: number) {
  return current + angleDelta(current, target) * (1 - Math.exp(-rate * dt))
}

/** Deterministic hash-based PRNG — the world is identical every run. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap 2D value noise. Good enough for terrain undulation and sway offsets. */
export function noise2(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const h = (a: number, b: number) => {
    let n = a * 374761393 + b * 668265263
    n = (n ^ (n >>> 13)) * 1274126177
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = h(xi, yi)
  const b = h(xi + 1, yi)
  const c = h(xi, yi + 1)
  const d = h(xi + 1, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1
}

export function fbm(x: number, y: number, octaves = 3) {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq) * amp
    amp *= 0.5
    freq *= 2.03
  }
  return sum
}

/** Distance from a point to a segment, in 2D. Used constantly for paths and rivers. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-8) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / len2
  t = clamp01(t)
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

/** Distance from a point to a polyline, plus how far along it that was (0..1). */
export function distToPath(px: number, pz: number, pts: [number, number][]) {
  let best = Infinity
  let bestT = 0
  let acc = 0
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const segLen = Math.hypot(bx - ax, bz - az)
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz
    let t = len2 < 1e-8 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2
    t = clamp01(t)
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
    if (d < best) {
      best = d
      bestT = total > 0 ? (acc + t * segLen) / total : 0
    }
    acc += segLen
  }
  return { dist: best, t: bestT }
}

/** Point at normalized distance `t` along a polyline. */
export function pointOnPath(pts: [number, number][], t: number): [number, number] {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  let target = clamp01(t) * total
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    if (target <= segLen || i === pts.length - 2) {
      const k = segLen < 1e-8 ? 0 : target / segLen
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]
    }
    target -= segLen
  }
  return pts[pts.length - 1]
}
