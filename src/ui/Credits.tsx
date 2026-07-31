import { useEffect } from 'react'
import { CREDITS, CREDITS_SIGNOFF } from '../content/credits'
import { useGame } from '../store/gameStore'
import { GIRL, PERSON } from '../content/characters'
import { audio } from '../systems/audio/audio'

/**
 * Credits. Doubles as the post-ending card, so it takes an optional `onBack`;
 * without one it returns to the title.
 */
export function Credits({ onBack }: { onBack?: () => void }) {
  const goToTitle = useGame((s) => s.goToTitle)
  const back = onBack ?? goToTitle

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        audio.cue('uiBack')
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

  return (
    <div className="layer layer--menu">
      <div className="credits modal__scroll" style={{ maxHeight: '82vh' }}>
        {CREDITS.map((section, i) => (
          <div
            key={`${section.heading}-${i}`}
            className="credits__section"
            style={{ animationDelay: `${i * 140}ms` }}
          >
            {section.heading ? <div className="credits__heading">{section.heading}</div> : null}
            {section.lines.map((line, j) => (
              <div className="credits__line" key={j}>
                {/* Names come from the personalization file so credits stay in sync. */}
                {line.replace('{her}', GIRL.displayName).replace('{me}', PERSON.displayName)}
              </div>
            ))}
          </div>
        ))}

        <p className="subtitle" style={{ color: 'rgba(247,236,224,0.66)', marginBottom: '2rem' }}>
          {CREDITS_SIGNOFF}
        </p>

        <button type="button" className="ghost-button" onClick={back}>
          Back
        </button>
      </div>
    </div>
  )
}
