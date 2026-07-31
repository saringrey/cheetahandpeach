import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSettings, writeSettings, DEFAULT_SETTINGS } from '../game/save/save'

// A minimal localStorage for the node environment.
function stubStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  return store
}

describe('settings persistence', () => {
  beforeEach(() => {
    stubStorage()
  })

  it('round-trips settings', () => {
    writeSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.25, invertY: true })
    const s = loadSettings()
    expect(s.musicVolume).toBe(0.25)
    expect(s.invertY).toBe(true)
  })

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem('cheetah-peach.settings.v1', '{oops')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores wrong-typed and unknown keys', () => {
    localStorage.setItem(
      'cheetah-peach.settings.v1',
      JSON.stringify({ musicVolume: 'loud', hacked: true, textScale: 1.3, bloom: 'yes' }),
    )
    const s = loadSettings()
    expect(s.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume)
    expect(s.textScale).toBe(1.3)
    expect(s.bloom).toBe(DEFAULT_SETTINGS.bloom)
    expect('hacked' in s).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    localStorage.setItem(
      'cheetah-peach.settings.v1',
      JSON.stringify({ masterVolume: Infinity }),
    )
    // Infinity does not survive JSON round-trips as a number, but guard anyway
    // for direct storage tampering with "null" etc.
    const s = loadSettings()
    expect(Number.isFinite(s.masterVolume)).toBe(true)
  })
})
