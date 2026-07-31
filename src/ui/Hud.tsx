import { useEffect } from 'react'
import { useGame } from '../store/gameStore'
import { PROMPTS } from '../content/gameContent'
import { frameInput } from '../game/input/frame'
import { mulberry32 } from '../utils/math'
import { Compass } from './Compass'

// Murmurs surface somewhere different every time — stray thoughts don't queue
// up in one corner of the mind. Seeded by the whisper's key so a given murmur
// holds still for its whole lifetime instead of re-rolling on re-render.
function murmurPosition(key: number) {
  const rand = mulberry32(key * 7919 + 17)
  return {
    left: `${(6 + rand() * 42).toFixed(1)}%`,
    bottom: `${(26 + rand() * 30).toFixed(1)}%`,
  }
}

/**
 * The whole gameplay HUD.
 *
 * Deliberately almost nothing: one contextual prompt, a chapter card that comes
 * and goes, dialogue when someone is speaking, a small save dot, and the paper
 * star in the corner. No minimap, no meters, and no permanent objective text —
 * the star only speaks when she holds it up.
 */
export function Hud() {
  const prompt = useGame((s) => s.prompt)
  const dialogue = useGame((s) => s.dialogue)
  const dialogueIndex = useGame((s) => s.dialogueIndex)
  const chapterCard = useGame((s) => s.chapterCard)
  const clearChapterCard = useGame((s) => s.clearChapterCard)
  const toast = useGame((s) => s.toast)
  const clearToast = useGame((s) => s.clearToast)
  const saving = useGame((s) => s.savingIndicator)
  const fade = useGame((s) => s.fade)
  const narration = useGame((s) => s.narration)
  const whisper = useGame((s) => s.whisper)
  const clearWhisper = useGame((s) => s.clearWhisper)
  const interstitial = useGame((s) => s.interstitial)
  const cinematic = useGame((s) => s.cinematic)
  const skippable = useGame((s) => s.cinematicSkippable)
  const advanceDialogue = useGame((s) => s.advanceDialogue)
  const usingPad = frameInput.usingGamepad

  useEffect(() => {
    if (!chapterCard) return
    const t = setTimeout(clearChapterCard, 5200)
    return () => clearTimeout(t)
  }, [chapterCard, clearChapterCard])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 4800)
    return () => clearTimeout(t)
  }, [toast, clearToast])

  // Keyed on `whisper.key`, so a second murmur restarts the clock instead of
  // inheriting the remains of the first one's.
  useEffect(() => {
    if (!whisper) return
    const t = setTimeout(clearWhisper, whisper.kind === 'love' ? 7500 : 4200)
    return () => clearTimeout(t)
  }, [whisper, clearWhisper])

  const line = dialogue?.[dialogueIndex]
  const interactKey = usingPad ? 'A' : 'E'

  return (
    <div className="hud">
      {fade > 0.001 ? <div className="fade" style={{ opacity: fade }} /> : null}

      {chapterCard ? (
        <div className="chapter-card" key={chapterCard.key}>
          <h2 className="chapter-card__title">{chapterCard.title}</h2>
          {chapterCard.subtitle ? (
            <div className="chapter-card__sub">{chapterCard.subtitle}</div>
          ) : null}
        </div>
      ) : null}

      {narration ? <div className="narration">{narration}</div> : null}

      {whisper ? (
        <div
          className={`whisper whisper--${whisper.kind}`}
          key={whisper.key}
          style={whisper.kind === 'murmur' ? murmurPosition(whisper.key) : undefined}
        >
          {whisper.text}
        </div>
      ) : null}

      {interstitial ? (
        <div className="interstitial">
          <p>{interstitial}</p>
        </div>
      ) : null}

      {line ? (
        <div className="dialogue" onClick={advanceDialogue}>
          <div className="panel" style={{ padding: '0.4rem' }}>
            <div className="dialogue__core">
              {line.speaker ? <div className="dialogue__speaker">{line.speaker}</div> : null}
              <p className="dialogue__text">{line.text}</p>
              <div className="dialogue__hint">
                {dialogueIndex + 1 < (dialogue?.length ?? 0) ? `${interactKey} — continue` : `${interactKey} — close`}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {prompt && !line ? (
        <div className="prompt">
          <span className="prompt__key">
            {prompt.hold > 0 ? (
              <span
                className="prompt__hold"
                style={{ transform: `scaleX(${prompt.hold})` }}
              />
            ) : null}
            <span style={{ position: 'relative' }}>{interactKey}</span>
          </span>
          <span className="prompt__verb">
            {PROMPTS[prompt.verb]}
            {prompt.label ? <span className="prompt__label"> — {prompt.label}</span> : null}
          </span>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" key={toast.key}>
          <span>❦</span>
          <span>{toast.text}</span>
        </div>
      ) : null}

      {saving ? (
        <div className="save-dot">
          <span />
          Saved
        </div>
      ) : null}

      {cinematic && skippable ? (
        <div className="skip-hint">{interactKey} — skip</div>
      ) : null}

      <Compass />
    </div>
  )
}
