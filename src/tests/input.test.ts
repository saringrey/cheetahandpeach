import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputSystem } from '../game/input/input'

function gamepad(axes: number[], buttons: boolean[]) {
  return {
    connected: true,
    axes,
    buttons: buttons.map((pressed) => ({ pressed })),
  } as unknown as Gamepad
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gamepad input polish', () => {
  it('lets A advance dialogue while gameplay focus is disabled', () => {
    const input = new InputSystem()
    let pressed = false
    vi.stubGlobal('navigator', {
      getGamepads: () => [gamepad([0, 0, 0, 0], [pressed])],
    })

    input.gameplayFocus = false
    input.poll(1 / 60)
    pressed = true

    expect(input.poll(1 / 60).interactPressed).toBe(true)
  })

  it('keeps right-stick camera travel equivalent at 30, 60, and 120 Hz', () => {
    const travelAt = (hz: number) => {
      const input = new InputSystem()
      vi.stubGlobal('navigator', {
        getGamepads: () => [gamepad([0, 0, 0.72, -0.36], [])],
      })
      let x = 0
      let y = 0
      for (let frame = 0; frame < hz; frame++) {
        const snapshot = input.poll(1 / hz)
        x += snapshot.lookX
        y += snapshot.lookY
      }
      return { x, y }
    }

    const at30 = travelAt(30)
    const at60 = travelAt(60)
    const at120 = travelAt(120)

    expect(at30.x).toBeCloseTo(at60.x, 5)
    expect(at120.x).toBeCloseTo(at60.x, 5)
    expect(at30.y).toBeCloseTo(at60.y, 5)
    expect(at120.y).toBeCloseTo(at60.y, 5)
  })

  it('drops every transient action when control is cleared', () => {
    const input = new InputSystem()
    const internals = input as unknown as {
      onKeyDown: (event: KeyboardEvent) => void
    }
    vi.stubGlobal('navigator', { getGamepads: () => [] })

    for (const code of ['KeyE', 'KeyJ', 'KeyQ', 'Space', 'Escape']) {
      internals.onKeyDown({
        code,
        repeat: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: () => {},
      } as KeyboardEvent)
    }
    input.clear()

    const snapshot = input.poll()
    expect(snapshot.interactPressed).toBe(false)
    expect(snapshot.journalPressed).toBe(false)
    expect(snapshot.questPressed).toBe(false)
    expect(snapshot.jumpPressed).toBe(false)
    expect(snapshot.pausePressed).toBe(false)
    expect(snapshot.anyPressed).toBe(false)
  })

  it('drops held left movement when gameplay focus moves to an overlay', () => {
    const input = new InputSystem()
    const internals = input as unknown as {
      onKeyDown: (event: KeyboardEvent) => void
    }
    vi.stubGlobal('navigator', { getGamepads: () => [] })

    internals.onKeyDown({
      code: 'KeyA',
      repeat: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: () => {},
    } as KeyboardEvent)
    expect(input.poll().moveX).toBe(-1)

    input.gameplayFocus = false
    input.gameplayFocus = true

    expect(input.poll().moveX).toBe(0)
  })

  it('waits for a held gamepad axis to return neutral after recovery', () => {
    const input = new InputSystem()
    let axes = [-0.82, 0, 0, 0]
    vi.stubGlobal('navigator', {
      getGamepads: () => [gamepad(axes, [])],
    })

    expect(input.poll().moveX).toBeLessThan(-0.5)
    input.clear()
    expect(input.poll().moveX).toBe(0)

    axes = [0, 0, 0, 0]
    expect(input.poll().moveX).toBe(0)
    axes = [-0.82, 0, 0, 0]
    expect(input.poll().moveX).toBeLessThan(-0.5)
  })
})
