import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/gameStore'
import { runtime } from '../store/runtime'
import { frameInput } from '../game/input/frame'

/**
 * The compass strip: a shallow band across the top of the screen showing which
 * way things lie, and the paper star that lights it up.
 *
 * A bearing strip rather than a dial, because a strip maps directly onto what
 * the player can see — a marker sitting a third of the way across the band is a
 * third of the way across the view. A round dial makes you translate.
 *
 * Two markers ride it. **Home** is wherever the chapter wants her next: the lit
 * windows, the lantern, the way on. **Durk** appears when the dog is in the
 * region at all, so he can be found without wandering. Home is always shown;
 * Durk only while the star is lit, so the strip stays quiet by default.
 *
 * ## Why this samples instead of subscribing
 *
 * Bearings come from `runtime`, which is mutable per-frame state that must never
 * trigger a React re-render. So this polls it on its own clock — twelve times a
 * second, fast enough that the markers glide rather than step, and about a
 * fifteenth the cost of doing it per frame. Nothing here writes to `runtime`.
 */

/** Samples per second. Low on purpose — see the note above. */
const SAMPLE_HZ = 12

/** Half-width of the strip's field of view, in degrees either side of centre. */
const STRIP_HALF_FOV = 84

interface Mark {
  /** Screen-relative bearing in degrees; 0 is straight ahead. */
  bearing: number
  metres: number
}

interface Reading {
  home: Mark | null
  durk: Mark | null
  /** The scene's own words for what Home looks like right now. */
  homeNote: string | null
  /** Seconds left on the summoned guide, 0 when the star is not lit. */
  lit: number
}

const IDLE: Reading = { home: null, durk: null, homeNote: null, lit: 0 }

/** Bearing and distance from the player to a world point, camera-relative. */
function markFor(x: number, z: number): Mark {
  const dx = x - runtime.playerPos.x
  const dz = z - runtime.playerPos.z

  // Relative to the CAMERA, not to her facing: the strip has to agree with what
  // the player can see, and the player sees through the camera. Screen-forward
  // is the negation of the camera's offset direction, the same convention the
  // character controller moves by.
  const forwardX = -Math.sin(runtime.camYaw)
  const forwardZ = -Math.cos(runtime.camYaw)
  const rightX = -forwardZ
  const rightZ = forwardX

  return {
    bearing: (Math.atan2(dx * rightX + dz * rightZ, dx * forwardX + dz * forwardZ) * 180) / Math.PI,
    metres: Math.hypot(dx, dz),
  }
}

function read(): Reading {
  const objective = runtime.objective
  const durk = runtime.durkPosition
  return {
    home: objective ? markFor(objective.x, objective.z) : null,
    durk: durk ? markFor(durk.x, durk.z) : null,
    homeNote: runtime.objectiveLabel,
    lit: runtime.questGuideSeconds,
  }
}

/** Where a bearing sits along the strip, 0..1, or null if it is behind her. */
function offsetOf(bearing: number): number | null {
  if (Math.abs(bearing) > STRIP_HALF_FOV) return null
  return 0.5 + bearing / (STRIP_HALF_FOV * 2)
}

function Marker({
  mark,
  kind,
  label,
  note,
}: {
  mark: Mark
  kind: 'home' | 'durk'
  label: string
  /** Shown under the label while the star is lit. */
  note?: string | null
}) {
  const offset = offsetOf(mark.bearing)
  // Off the edge of the strip: pin it just inside the nearer end and dim it, so
  // "behind you and to the left" still reads as a direction to turn.
  const pinned = offset === null
  const left = pinned ? (mark.bearing < 0 ? 0.06 : 0.94) : offset
  // Near either end the label has to grow inward or it runs off the band and is
  // clipped by its fade mask — which is how "Home" became "Hom".
  const side = left > 0.62 ? ' is-right' : left < 0.38 ? ' is-left' : ''

  return (
    <div
      className={`compass-strip__mark compass-strip__mark--${kind}${pinned ? ' is-pinned' : ''}${side}`}
      style={{ left: `${(left * 100).toFixed(2)}%` }}
    >
      <span className="compass-strip__glyph">{kind === 'home' ? '⌂' : '❍'}</span>
      <span className="compass-strip__text">
        <span className="compass-strip__label">
          {label}
          <span className="compass-strip__distance">{Math.round(mark.metres)} m</span>
        </span>
        {note ? <span className="compass-strip__note">{note}</span> : null}
      </span>
    </div>
  )
}

export function Compass() {
  const phase = useGame((s) => s.phase)
  const dialogue = useGame((s) => s.dialogue)
  const cinematic = useGame((s) => s.cinematic)
  const showCompass = useGame((s) => s.settings.showCompass)
  const [reading, setReading] = useState<Reading>(IDLE)
  const frame = useRef(0)

  const active = phase === 'playing' && !dialogue && !cinematic && showCompass

  useEffect(() => {
    if (!active) {
      setReading(IDLE)
      return
    }
    let cancelled = false
    let last = 0
    const step = (now: number) => {
      if (cancelled) return
      if (now - last >= 1000 / SAMPLE_HZ) {
        last = now
        setReading(read())
      }
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame.current)
    }
  }, [active])

  if (!active) return null

  const lit = reading.lit > 0
  const questKey = frameInput.usingGamepad ? 'X' : 'Q'

  return (
    <div className={`compass-strip${lit ? ' compass-strip--lit' : ''}`} aria-live="off">
      <div className="compass-strip__band" aria-hidden="true">
        {/* Ticks give the band a scale, so a marker's drift reads as turning. */}
        {[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((t) => (
          <i
            key={t}
            className={`compass-strip__tick${t === 0.5 ? ' is-centre' : ''}`}
            style={{ left: `${t * 100}%` }}
          />
        ))}
        {/* Always "Home". Every objective in the game is a step back toward the
            same place, and naming them all that way is the point rather than a
            shortcut — the scene's own phrase rides underneath when she asks. */}
        {reading.home ? (
          <Marker mark={reading.home} kind="home" label="Home" note={lit ? reading.homeNote : null} />
        ) : null}
        {lit && reading.durk ? <Marker mark={reading.durk} kind="durk" label="Durk" /> : null}
      </div>

      <div className="compass-strip__star" title={`${questKey} — the paper star`}>
        <span className="compass-strip__starGlyph">✦</span>
        <span className="compass-strip__starKey">{questKey}</span>
      </div>
    </div>
  )
}
