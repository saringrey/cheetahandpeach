import type { QualityPreset, Settings } from '../../types'

export interface QualityProfile {
  dpr: number
  shadows: 'off' | 'low' | 'high'
  foliage: number
  particles: number
  bloom: boolean
  smaa: boolean
}

export const PROFILES: Record<Exclude<QualityPreset, 'auto'>, QualityProfile> = {
  low: { dpr: 1, shadows: 'off', foliage: 0.45, particles: 0.4, bloom: false, smaa: false },
  // Auto starts here. A near-native Retina buffer plus mipmapped bloom was
  // spending GPU power to soften an intentionally hand-built, low-poly image.
  // Keep the fused moonlit grade, but reserve the expensive glow pyramid for
  // an explicit High preset.
  medium: { dpr: 1.1, shadows: 'low', foliage: 0.72, particles: 0.72, bloom: false, smaa: false },
  high: { dpr: 1.5, shadows: 'high', foliage: 1, particles: 1, bloom: true, smaa: true },
}

export type AutoTier = 'low' | 'medium' | 'high'

/**
 * Frame-time watcher for the Auto quality preset.
 *
 * Starts conservatively at medium, observes a long window, and only steps once
 * the average has been clearly wrong for several seconds. The long windows and
 * the asymmetric thresholds are what stop it oscillating.
 */
export class AutoQuality {
  private tier: AutoTier = 'medium'
  private accum = 0
  private frames = 0
  private windowTime = 0
  private badWindows = 0
  private goodWindows = 0
  /** Once we have stepped down twice we stop trying to climb back. */
  private demotions = 0

  readonly onChange: ((tier: AutoTier) => void)[] = []

  get current(): AutoTier {
    return this.tier
  }

  reset(startAt: AutoTier = 'medium') {
    this.tier = startAt
    this.accum = 0
    this.frames = 0
    this.windowTime = 0
    this.badWindows = 0
    this.goodWindows = 0
    this.demotions = 0
  }

  update(dtSeconds: number) {
    const ms = dtSeconds * 1000
    // Ignore obvious hitches (tab switch, GC pause, first frames).
    if (ms > 200) return
    this.accum += ms
    this.frames++
    this.windowTime += dtSeconds

    const WINDOW = 2.5
    if (this.windowTime < WINDOW) return

    const avg = this.accum / Math.max(1, this.frames)
    this.accum = 0
    this.frames = 0
    this.windowTime = 0

    // 60fps = 16.7ms. Step down past ~21ms (≈48fps), step up under ~12.5ms (≈80fps).
    if (avg > 21) {
      this.badWindows++
      this.goodWindows = 0
    } else if (avg < 12.5) {
      this.goodWindows++
      this.badWindows = 0
    } else {
      this.badWindows = 0
      this.goodWindows = 0
    }

    if (this.badWindows >= 2 && this.tier !== 'low') {
      this.tier = this.tier === 'high' ? 'medium' : 'low'
      this.demotions++
      this.badWindows = 0
      this.emit()
    } else if (this.goodWindows >= 4 && this.tier !== 'high' && this.demotions < 2) {
      this.tier = this.tier === 'low' ? 'medium' : 'high'
      this.goodWindows = 0
      this.emit()
    }
  }

  private emit() {
    for (const fn of this.onChange) fn(this.tier)
  }
}

export const autoQuality = new AutoQuality()

/** Resolve settings + auto tier into the profile actually used this frame. */
export function resolveProfile(settings: Settings, tier: AutoTier): QualityProfile {
  const base =
    settings.quality === 'auto' ? PROFILES[tier] : PROFILES[settings.quality]

  // Explicit user overrides always win over the preset.
  return {
    dpr: Math.min(base.dpr, 2) * settings.resolutionScale,
    shadows: settings.quality === 'auto' ? base.shadows : settings.shadows,
    foliage: base.foliage * settings.foliageDensity,
    particles: base.particles * settings.particleDensity,
    bloom: base.bloom && settings.bloom,
    smaa: base.smaa,
  }
}
