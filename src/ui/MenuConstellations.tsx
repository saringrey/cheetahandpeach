import { useMemo } from 'react'
import { CONSTELLATIONS } from '../content/constellations'

/**
 * The three constellations she draws at the overlook, hung over the title
 * screen.
 *
 * A quiet piece of foreshadowing: the shapes on the menu are literally the same
 * point data she will connect on the mountain, so the first thing the player
 * looks at is the last thing she earns. Reusing `CONSTELLATIONS` means editing a
 * shape in content updates both places at once.
 *
 * One inline SVG, no canvas, no per-frame work — the twinkle is CSS. It sits
 * behind the title block and is `aria-hidden`, because it is atmosphere and a
 * screen reader announcing "star field" would only be noise.
 */

/** Where each constellation sits on screen, and how big, in viewBox units. */
const PLACEMENT: Record<string, { cx: number; cy: number; r: number; opacity: number }> = {
  cheetah: { cx: 74, cy: 26, r: 15, opacity: 1 },
  peach: { cx: 90, cy: 58, r: 8.5, opacity: 0.8 },
  'road-home': { cx: 58, cy: 72, r: 10, opacity: 0.6 },
}

/** Loose scatter of unrelated stars so the shapes sit in a sky, not a vacuum. */
const FIELD_COUNT = 46

function fieldStars() {
  // Deterministic: a fixed sky, not a different one on every mount.
  let seed = 0x9e3779b9
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  return Array.from({ length: FIELD_COUNT }, (_, i) => ({
    key: i,
    x: rand() * 100,
    // Denser toward the top, like a sky rather than a texture.
    y: Math.pow(rand(), 1.35) * 96,
    r: 0.12 + rand() * 0.26,
    delay: rand() * 9,
    dur: 5 + rand() * 7,
  }))
}

export function MenuConstellations() {
  const field = useMemo(fieldStars, [])

  const shapes = useMemo(
    () =>
      CONSTELLATIONS.map((c) => {
        const place = PLACEMENT[c.id] ?? { cx: 50, cy: 50, r: 10, opacity: 0.5 }
        // Constellation points are in a -1..1 box; +y is up there and down in
        // SVG, so the vertical axis is flipped on the way in.
        const pts = c.points.map(([px, py]) => ({
          x: place.cx + px * place.r,
          y: place.cy - py * place.r * 0.82,
        }))
        return {
          id: c.id,
          opacity: place.opacity,
          path: pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '),
          // De-duplicate the retraced vertices (the cheetah doubles back through
          // its own spine) so those stars are not drawn twice at double opacity.
          stars: pts.filter(
            (p, i) => pts.findIndex((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) === i,
          ),
        }
      }),
    [],
  )

  return (
    <svg
      className="menu-sky"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g className="menu-sky__field">
        {field.map((s) => (
          <circle
            key={s.key}
            cx={s.x}
            cy={s.y}
            r={s.r}
            style={{ animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
          />
        ))}
      </g>

      {shapes.map((s, i) => (
        <g key={s.id} className="menu-sky__shape" style={{ opacity: s.opacity, animationDelay: `${i * 2.6}s` }}>
          <path d={s.path} />
          {s.stars.map((p, j) => (
            <circle key={j} cx={p.x} cy={p.y} r={0.45} style={{ animationDelay: `${i * 2.6 + j * 0.4}s` }} />
          ))}
        </g>
      ))}
    </svg>
  )
}
