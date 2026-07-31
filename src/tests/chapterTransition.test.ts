import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('continuous chapter dissolve', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('swaps behind black and holds control through the complete scene fade-in', async () => {
    const [{ useGame }, { runtime }] = await Promise.all([
      import('../store/gameStore'),
      import('../store/runtime'),
    ])
    useGame.setState((state) => ({
      phase: 'playing',
      save: { ...state.save, chapter: 'transition' },
      fade: 0,
      interstitial: null,
    }))
    runtime.releaseAllControl()

    useGame.getState().transitionToChapter('parkingLot', '', { mode: 'dissolve' })

    expect(runtime.controlHolds.has('transition')).toBe(true)
    expect(useGame.getState().save.chapter).toBe('transition')
    expect(useGame.getState().interstitial).toBeNull()

    vi.advanceTimersByTime(1_199)
    expect(useGame.getState().save.chapter).toBe('transition')
    expect(runtime.controlHolds.has('transition')).toBe(true)

    vi.advanceTimersByTime(1)
    expect(useGame.getState().save.chapter).toBe('parkingLot')
    expect(useGame.getState().fade).toBe(1)
    expect(useGame.getState().interstitial).toBeNull()
    expect(runtime.controlHolds.has('transition')).toBe(true)

    vi.advanceTimersByTime(1_479)
    expect(runtime.controlHolds.has('transition')).toBe(true)

    vi.advanceTimersByTime(1)
    expect(runtime.controlHolds.has('transition')).toBe(false)
    expect(runtime.playerControlEnabled).toBe(true)
  })
})
