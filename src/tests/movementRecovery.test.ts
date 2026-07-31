import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('movement recovery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.stubGlobal('navigator', { getGamepads: () => [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears transient controls and velocity without moving the player or changing progress', async () => {
    const [
      { director },
      { frameInput, writeFrameInput },
      { input },
      { recoverPlayerMovement },
      { useGame },
      { runtime },
    ] = await Promise.all([
      import('../game/camera/director'),
      import('../game/input/frame'),
      import('../game/input/input'),
      import('../game/character/movementRecovery'),
      import('../store/gameStore'),
      import('../store/runtime'),
    ])

    runtime.playerPos.set(-8.5, 2.25, 14)
    runtime.playerFacing = 1.4
    runtime.playerSpeed = 3.2
    runtime.playerRunning = true
    runtime.holdControl('raft', true)
    const positionBefore = runtime.playerPos.toArray()
    const facingBefore = runtime.playerFacing
    const saveBefore = useGame.getState().save
    const epochBefore = runtime.movementResetEpoch

    const inputInternals = input as unknown as {
      onKeyDown: (event: KeyboardEvent) => void
    }
    inputInternals.onKeyDown({
      code: 'KeyA',
      repeat: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: () => {},
    } as KeyboardEvent)
    writeFrameInput({
      moveX: -1,
      moveY: 0,
      lookX: 12,
      lookY: -4,
      run: true,
      jumpPressed: true,
      interactPressed: true,
      interactHeld: true,
      journalPressed: true,
      questPressed: true,
      pausePressed: true,
      anyPressed: true,
      usingGamepad: true,
    })

    const onEnd = vi.fn()
    const cinematic = director.play(
      [
        { pos: [0, 2, 4], look: [0, 1, 0], duration: 0.1 },
        { pos: [4, 3, 0], look: [0, 1, 0], duration: 5 },
      ],
      { onEnd },
    )
    useGame.setState({ interstitial: 'stuck card', fade: 1 })

    const result = recoverPlayerMovement()

    await expect(cinematic).resolves.toBe('cancelled')
    expect(onEnd).not.toHaveBeenCalled()
    expect(result.cancelledCinematic).toBe(true)
    expect(result.releasedHolds).toEqual(expect.arrayContaining(['raft', 'cinematic']))
    expect(runtime.controlHolds.size).toBe(0)
    expect(runtime.playerControlEnabled).toBe(true)
    expect(runtime.playerSpeed).toBe(0)
    expect(runtime.playerRunning).toBe(false)
    expect(runtime.movementResetEpoch).toBe(epochBefore + 1)
    expect(runtime.playerPos.toArray()).toEqual(positionBefore)
    expect(runtime.playerFacing).toBe(facingBefore)
    expect(useGame.getState().save).toBe(saveBefore)
    expect(useGame.getState().cinematic).toBe(false)
    expect(useGame.getState().cinematicSkippable).toBe(false)
    expect(useGame.getState().interstitial).toBeNull()
    expect(useGame.getState().fade).toBe(0)
    expect(frameInput.moveX).toBe(0)
    expect(frameInput.moveY).toBe(0)
    expect(frameInput.run).toBe(false)
    expect(frameInput.jumpPressed).toBe(false)
    expect(frameInput.interactPressed).toBe(false)
    expect(frameInput.usingGamepad).toBe(false)
    expect(input.poll().moveX).toBe(0)
  })

  it('cancels a stuck chapter transition instead of letting its timers fire later', async () => {
    vi.useFakeTimers()
    const [{ recoverPlayerMovement }, { useGame }, { runtime }] = await Promise.all([
      import('../game/character/movementRecovery'),
      import('../store/gameStore'),
      import('../store/runtime'),
    ])

    useGame.setState({ phase: 'playing' })
    const chapterBefore = useGame.getState().save.chapter
    const saveBefore = useGame.getState().save
    useGame.getState().transitionToChapter('town')
    expect(runtime.controlHolds.has('transition')).toBe(true)

    recoverPlayerMovement()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(runtime.controlHolds.size).toBe(0)
    expect(runtime.playerControlEnabled).toBe(true)
    expect(useGame.getState().save).toBe(saveBefore)
    expect(useGame.getState().save.chapter).toBe(chapterBefore)
    expect(useGame.getState().interstitial).toBeNull()
    expect(useGame.getState().fade).toBe(0)
  })

  it('gives overlay menus sole ownership of Escape', () => {
    const nav = readFileSync(
      fileURLToPath(new URL('../ui/useMenuNav.ts', import.meta.url)),
      'utf8',
    )
    const app = readFileSync(fileURLToPath(new URL('../app/App.tsx', import.meta.url)), 'utf8')
    const canvas = readFileSync(
      fileURLToPath(new URL('../app/GameCanvas.tsx', import.meta.url)),
      'utf8',
    )

    expect(nav).toContain('e.stopImmediatePropagation()')
    expect(nav).toContain("window.addEventListener('keydown', onKey, true)")
    expect(app).not.toContain('input.gameplayFocus =')
    expect(canvas).toContain('useGame.subscribe(syncGameplayFocus)')
  })
})
