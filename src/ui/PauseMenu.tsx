import { useState, useMemo } from 'react'
import { useGame } from '../store/gameStore'
import { useMenuNav } from './useMenuNav'
import { SettingsPanel } from './Settings'
import { audio } from '../systems/audio/audio'

export function PauseMenu() {
  const togglePause = useGame((s) => s.togglePause)
  const toggleJournal = useGame((s) => s.toggleJournal)
  const goToTitle = useGame((s) => s.goToTitle)
  const [showSettings, setShowSettings] = useState(false)

  const items = useMemo(
    () => [
      { label: 'Keep going', icon: '→', run: () => togglePause() },
      {
        label: 'Journal',
        icon: '❦',
        run: () => {
          togglePause()
          toggleJournal()
        },
      },
      { label: 'Settings', icon: '⚙', run: () => setShowSettings(true) },
      {
        label: 'Return to title',
        icon: '←',
        run: () => {
          audio.stopAll(0.8)
          goToTitle()
        },
      },
    ],
    [togglePause, toggleJournal, goToTitle],
  )

  const [active, setActive] = useMenuNav(
    showSettings ? 0 : items.length,
    (i) => items[i]?.run(),
    () => (showSettings ? setShowSettings(false) : togglePause()),
  )

  if (showSettings) {
    return (
      <div className="layer layer--menu">
        <div className="panel modal">
          <div className="panel__core modal__core">
            <div className="modal__header">
              <h2 className="modal__title">Settings</h2>
              <button type="button" className="menu-note" onClick={() => setShowSettings(false)}>
                Back — Esc
              </button>
            </div>
            <SettingsPanel />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="layer layer--menu">
      <div className="panel modal" style={{ width: 'min(28rem, 92vw)' }}>
        <div className="panel__core modal__core">
          <span className="eyebrow">Paused</span>
          <h2 className="modal__title" style={{ marginTop: '0.9rem' }}>
            A moment.
          </h2>
          <nav className="menu">
            {items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                className="menu-item"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={item.run}
              >
                <span>{item.label}</span>
                <span className="menu-item__icon">{item.icon}</span>
              </button>
            ))}
          </nav>
          <p className="menu-note" style={{ marginTop: '1.2rem' }}>
            WASD to walk · Space to jump · Shift to hurry · E to look · Q for the paper star ·
            J for the journal
          </p>
        </div>
      </div>
    </div>
  )
}
