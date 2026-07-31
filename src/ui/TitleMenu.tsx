import { useState, useMemo } from 'react'
import { useGame } from '../store/gameStore'
import { TITLE } from '../content/gameContent'
import { useMenuNav } from './useMenuNav'
import { SettingsPanel } from './Settings'
import { Credits } from './Credits'
import { audio } from '../systems/audio/audio'

type Sheet = null | 'settings' | 'credits' | 'confirmReset'

export function TitleMenu() {
  const hasSave = useGame((s) => s.hasExistingSave)
  const newGame = useGame((s) => s.newGame)
  const continueGame = useGame((s) => s.continueGame)
  const replayEnding = useGame((s) => s.replayEnding)
  const resetProgress = useGame((s) => s.resetProgress)
  const endingComplete = useGame((s) => s.save.endingComplete)
  const [sheet, setSheet] = useState<Sheet>(null)

  const items = useMemo(() => {
    const list: { label: string; icon: string; disabled?: boolean; run: () => void }[] = [
      {
        label: 'New Game',
        icon: '↗',
        run: () => {
          void audio.init()
          newGame()
        },
      },
      {
        label: 'Continue',
        icon: '→',
        disabled: !hasSave,
        run: () => {
          if (!hasSave) return
          void audio.init()
          continueGame()
        },
      },
    ]
    if (endingComplete) {
      list.push({
        label: 'Replay Ending',
        icon: '↻',
        run: () => {
          void audio.init()
          replayEnding()
        },
      })
    }
    list.push(
      { label: 'Settings', icon: '⚙', run: () => setSheet('settings') },
      { label: 'Credits', icon: '✦', run: () => setSheet('credits') },
    )
    if (hasSave) {
      list.push({ label: 'Reset Progress', icon: '↺', run: () => setSheet('confirmReset') })
    }
    return list
  }, [hasSave, endingComplete, newGame, continueGame, replayEnding])

  const [active, setActive] = useMenuNav(
    sheet ? 0 : items.length,
    (i) => {
      const item = items[i]
      if (item && !item.disabled) item.run()
    },
  )

  if (sheet === 'settings') {
    return (
      <div className="layer layer--menu">
        <div className="panel modal">
          <div className="panel__core modal__core">
            <div className="modal__header">
              <h2 className="modal__title">Settings</h2>
              <button type="button" className="menu-note" onClick={() => setSheet(null)}>
                Back — Esc
              </button>
            </div>
            <SettingsPanel />
          </div>
        </div>
      </div>
    )
  }

  if (sheet === 'credits') {
    return <Credits onBack={() => setSheet(null)} />
  }

  if (sheet === 'confirmReset') {
    return (
      <div className="layer layer--menu">
        <div className="panel modal" style={{ width: 'min(30rem, 92vw)' }}>
          <div className="panel__core modal__core">
            <h2 className="modal__title">Start over?</h2>
            <p className="prose" style={{ marginTop: '0.75rem' }}>
              This erases the journal, the memories she has found, and how far she has walked.
              It cannot be undone.
            </p>
            <div className="menu">
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  audio.cue('uiBack')
                  resetProgress()
                  setSheet(null)
                }}
              >
                <span>Yes, erase everything</span>
                <span className="menu-item__icon">↺</span>
              </button>
              <button type="button" className="menu-item" onClick={() => setSheet(null)}>
                <span>Keep my progress</span>
                <span className="menu-item__icon">←</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="title-screen">
      {/* The two of them, lifting out of the dark beside the menu. */}
      <div className="title-screen__memory" aria-hidden="true" />
      <div className="title-screen__block">
        <span className="eyebrow eyebrow--birthday rise rise-1">
          Happy Birthday, my everything. My life.
        </span>
        <h1 className="display rise rise-2" style={{ marginTop: '1.1rem' }}>
          {TITLE.main}
        </h1>
        <p className="subtitle rise rise-3">{TITLE.subtitle}</p>

        <nav className="menu rise rise-4">
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              className="menu-item"
              data-active={i === active}
              disabled={item.disabled}
              onMouseEnter={() => setActive(i)}
              onClick={item.run}
            >
              <span>{item.label}</span>
              <span className="menu-item__icon">{item.icon}</span>
            </button>
          ))}
        </nav>

        <p className="menu-note rise rise-5" style={{ marginTop: '1.4rem' }}>
          {endingComplete
            ? 'You have been here before. It is still true.'
            : hasSave
              ? 'Continue picks up where she stopped.'
              : 'Best with sound on, and the lights low.'}
        </p>
      </div>
    </div>
  )
}
