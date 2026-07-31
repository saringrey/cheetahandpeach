import { useState } from 'react'
import { useGame } from '../store/gameStore'
import type { Settings as SettingsType, QualityPreset } from '../types'
import { audio } from '../systems/audio/audio'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting">
      <span className="setting__label">{label}</span>
      <div className="setting__control">{children}</div>
    </div>
  )
}

function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { label: string; value: T }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          data-on={o.value === value}
          onClick={() => {
            audio.cue('ui')
            onChange(o.value)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.05,
  format,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="setting__value">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
    </>
  )
}

const ON_OFF = [
  { label: 'On', value: true },
  { label: 'Off', value: false },
]

/**
 * A collapsed group of rows.
 *
 * The panel had grown to nineteen rows in four groups and needed scrolling to
 * reach the accessibility settings — which is exactly backwards, since those are
 * the ones somebody actively looks for. The graphics detail knobs (resolution,
 * shadows, foliage, particles) are all already driven by the Quality preset, so
 * they belong behind a fold: available to anyone chasing frames, out of the way
 * of everyone else.
 */
function Fold({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`settings-fold${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="settings-fold__toggle"
        aria-expanded={open}
        onClick={() => {
          audio.cue('ui')
          setOpen((v) => !v)
        }}
      >
        <span>{label}</span>
        <span className="settings-fold__chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <div className="settings-fold__body">{children}</div> : null}
    </div>
  )
}

export function SettingsPanel() {
  const settings = useGame((s) => s.settings)
  const update = useGame((s) => s.updateSettings)
  const reset = useGame((s) => s.resetSettings)

  const set = <K extends keyof SettingsType>(key: K) => (v: SettingsType[K]) =>
    update({ [key]: v } as Partial<SettingsType>)

  return (
    <div className="modal__scroll">
      <div className="settings-group">
        <div className="settings-group__label">Picture</div>
        <Row label="Quality">
          <Segmented<QualityPreset>
            value={settings.quality}
            options={[
              { label: 'Auto', value: 'auto' },
              { label: 'Low', value: 'low' },
              { label: 'Medium', value: 'medium' },
              { label: 'High', value: 'high' },
            ]}
            onChange={set('quality')}
          />
        </Row>
        <Row label="Bloom">
          <Segmented value={settings.bloom} options={ON_OFF} onChange={set('bloom')} />
        </Row>
        <Row label="Fullscreen">
          <Segmented
            value={typeof document !== 'undefined' && !!document.fullscreenElement}
            options={ON_OFF}
            onChange={(v) => {
              if (v) document.documentElement.requestFullscreen?.().catch(() => {})
              else document.exitFullscreen?.().catch(() => {})
            }}
          />
        </Row>
        <Fold label="Fine tuning">
          <Row label="Resolution scale">
            <Slider value={settings.resolutionScale} min={0.6} max={1} step={0.05} onChange={set('resolutionScale')} />
          </Row>
          <Row label="Shadows">
            <Segmented
              value={settings.shadows}
              options={[
                { label: 'Off', value: 'off' as const },
                { label: 'Low', value: 'low' as const },
                { label: 'High', value: 'high' as const },
              ]}
              onChange={set('shadows')}
            />
          </Row>
          <Row label="Foliage density">
            <Slider value={settings.foliageDensity} min={0.3} max={1} step={0.1} onChange={set('foliageDensity')} />
          </Row>
          <Row label="Particle density">
            <Slider value={settings.particleDensity} min={0} max={1} step={0.1} onChange={set('particleDensity')} />
          </Row>
        </Fold>
      </div>

      <div className="settings-group">
        <div className="settings-group__label">Sound</div>
        <Row label="Master">
          <Slider value={settings.masterVolume} onChange={set('masterVolume')} />
        </Row>
        <Fold label="Balance">
          <Row label="Music">
            <Slider value={settings.musicVolume} onChange={set('musicVolume')} />
          </Row>
          <Row label="Ambience">
            <Slider value={settings.ambienceVolume} onChange={set('ambienceVolume')} />
          </Row>
          <Row label="Sound effects">
            <Slider value={settings.sfxVolume} onChange={set('sfxVolume')} />
          </Row>
        </Fold>
      </div>

      <div className="settings-group">
        <div className="settings-group__label">Playing</div>
        <Row label="Look sensitivity">
          <Slider
            value={settings.mouseSensitivity}
            min={0.3}
            max={2.5}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={set('mouseSensitivity')}
          />
        </Row>
        <Row label="Invert vertical look">
          <Segmented value={settings.invertY} options={ON_OFF} onChange={set('invertY')} />
        </Row>
        <Row label="Interact">
          <Segmented
            value={settings.holdToInteract}
            options={[
              { label: 'Press', value: false },
              { label: 'Hold', value: true },
            ]}
            onChange={set('holdToInteract')}
          />
        </Row>
        <Row label="Compass">
          <Segmented value={settings.showCompass} options={ON_OFF} onChange={set('showCompass')} />
        </Row>
      </div>

      {/* Comfort, not "Accessibility": the two motion toggles used to sit in
          different groups purely because one is a camera setting and one is a
          world setting, which is a distinction nobody looking for "make it move
          less" cares about. They belong next to each other. */}
      <div className="settings-group">
        <div className="settings-group__label">Comfort</div>
        <Row label="Text size">
          <Slider
            value={settings.textScale}
            min={0.85}
            max={1.6}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={set('textScale')}
          />
        </Row>
        <Row label="Reduce camera motion">
          <Segmented value={settings.reduceCameraMotion} options={ON_OFF} onChange={set('reduceCameraMotion')} />
        </Row>
        <Row label="Reduce world motion">
          <Segmented value={settings.reduceMotion} options={ON_OFF} onChange={set('reduceMotion')} />
        </Row>
        <Row label="High-contrast prompts">
          <Segmented value={settings.highContrastPrompts} options={ON_OFF} onChange={set('highContrastPrompts')} />
        </Row>
      </div>

      <button
        type="button"
        className="menu-item"
        style={{ marginTop: '0.5rem' }}
        onClick={() => {
          audio.cue('uiBack')
          reset()
        }}
      >
        <span>Restore defaults</span>
        <span className="menu-item__icon">↺</span>
      </button>
    </div>
  )
}
