import * as THREE from 'three'
import { useGame } from '../../store/gameStore'
import { runtime } from '../../store/runtime'
import { smootherstep, smoothstep, clamp01 } from '../../utils/math'

/**
 * Authored camera moments.
 *
 * A cinematic is a list of keyframes; the director interpolates position and
 * look-at through them and hands the result to <FollowCamera/>, which yields
 * control for the duration and then eases back to gameplay framing.
 */

export interface CameraKeyframe {
  pos: [number, number, number]
  look: [number, number, number]
  /** Seconds spent travelling INTO this keyframe. The first keyframe's duration is its hold. */
  duration: number
  ease?: 'smooth' | 'smoother' | 'linear'
  /** Optional field-of-view at this keyframe. */
  fov?: number
}

export interface CinematicOptions {
  /** Seconds before "Skip" becomes available. Use 0 for instantly skippable. */
  skipAfter?: number
  /** Cannot be skipped at all. Reserved for very short beats. */
  unskippable?: boolean
  /** Seconds spent easing back to the gameplay camera at the end. */
  returnTime?: number
  /** Called when the cinematic finishes or is skipped. */
  onEnd?: () => void
}

export type CinematicResult = 'completed' | 'cancelled'

interface ActiveCinematic {
  frames: CameraKeyframe[]
  elapsed: number
  total: number
  opts: CinematicOptions
  resolve: (result: CinematicResult) => void
  skipped: boolean
}

class CameraDirector {
  active: ActiveCinematic | null = null
  /** 0 = full gameplay camera, 1 = full cinematic. Eased at both ends. */
  blend = 0
  readonly pos = new THREE.Vector3()
  readonly look = new THREE.Vector3()
  fov: number | null = null

  isActive() {
    return this.active !== null || this.blend > 0.001
  }

  play(frames: CameraKeyframe[], opts: CinematicOptions = {}): Promise<CinematicResult> {
    if (frames.length === 0) return Promise.resolve('completed')
    // A new cinematic supersedes whatever was running.
    this.active?.resolve('cancelled')

    const total = frames.reduce((s, f) => s + Math.max(0, f.duration), 0)
    return new Promise<CinematicResult>((resolve) => {
      this.active = { frames, elapsed: 0, total, opts, resolve, skipped: false }
      useGame.getState().setCinematic(true)
      useGame.getState().setCinematicSkippable(false)
      runtime.holdControl('cinematic', true)
      if (opts.skipAfter === 0 && !opts.unskippable) {
        useGame.getState().setCinematicSkippable(true)
      }
    }).then((result) => {
      if (result === 'completed') opts.onEnd?.()
      return result
    })
  }

  skip() {
    const a = this.active
    if (!a || a.opts.unskippable) return
    a.skipped = true
    // Jump to the end so the world state matches what the cinematic was showing.
    a.elapsed = a.total
  }

  /** Ends any running cinematic immediately, without firing onEnd twice. */
  cancel() {
    const a = this.active
    this.active = null
    this.blend = 0
    this.fov = null
    runtime.holdControl('cinematic', false)
    useGame.getState().setCinematic(false)
    useGame.getState().setCinematicSkippable(false)
    a?.resolve('cancelled')
  }

  update(dt: number) {
    const a = this.active
    if (!a) {
      // Ease control back to gameplay.
      this.blend = Math.max(0, this.blend - dt / 0.9)
      if (this.blend <= 0) this.fov = null
      return
    }

    a.elapsed += dt

    if (!a.opts.unskippable && a.opts.skipAfter !== 0) {
      const after = a.opts.skipAfter ?? 1.2
      if (a.elapsed >= after && !useGame.getState().cinematicSkippable) {
        useGame.getState().setCinematicSkippable(true)
      }
    }

    // Blend in quickly at the start, out over `returnTime` at the end.
    const inT = clamp01(a.elapsed / 0.55)
    const remaining = a.total - a.elapsed
    const outWindow = a.opts.returnTime ?? 0.9
    const outT = clamp01(remaining / outWindow)
    this.blend = Math.min(smoothstep(inT), a.skipped ? Math.min(smoothstep(outT), this.blend) : smoothstep(outT))

    // Locate the current keyframe pair.
    let t = Math.min(a.elapsed, a.total)
    let i = 0
    while (i < a.frames.length - 1 && t > a.frames[i + 1].duration) {
      t -= a.frames[i + 1].duration
      i++
    }

    const from = a.frames[i]
    const to = a.frames[Math.min(i + 1, a.frames.length - 1)]
    const span = Math.max(0.0001, to.duration)
    const raw = from === to ? 1 : clamp01(t / span)
    const ease = to.ease ?? 'smoother'
    const k = ease === 'linear' ? raw : ease === 'smooth' ? smoothstep(raw) : smootherstep(raw)

    this.pos.set(
      from.pos[0] + (to.pos[0] - from.pos[0]) * k,
      from.pos[1] + (to.pos[1] - from.pos[1]) * k,
      from.pos[2] + (to.pos[2] - from.pos[2]) * k,
    )
    this.look.set(
      from.look[0] + (to.look[0] - from.look[0]) * k,
      from.look[1] + (to.look[1] - from.look[1]) * k,
      from.look[2] + (to.look[2] - from.look[2]) * k,
    )
    if (from.fov != null || to.fov != null) {
      const f0 = from.fov ?? to.fov ?? 55
      const f1 = to.fov ?? from.fov ?? 55
      this.fov = f0 + (f1 - f0) * k
    } else {
      this.fov = null
    }

    if (a.elapsed >= a.total) {
      this.active = null
      runtime.holdControl('cinematic', false)
      useGame.getState().setCinematic(false)
      useGame.getState().setCinematicSkippable(false)
      a.resolve('completed')
    }
  }
}

export const director = new CameraDirector()

/** Convenience: orbit a point while looking at it. Used for memory pickups. */
export function orbitAround(
  center: [number, number, number],
  radius: number,
  startAngle: number,
  sweep: number,
  height: number,
  duration: number,
): CameraKeyframe[] {
  const steps = 3
  const frames: CameraKeyframe[] = []
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (sweep * i) / steps
    frames.push({
      pos: [center[0] + Math.sin(a) * radius, center[1] + height, center[2] + Math.cos(a) * radius],
      look: center,
      duration: i === 0 ? 0 : duration / steps,
      ease: 'linear',
    })
  }
  return frames
}
