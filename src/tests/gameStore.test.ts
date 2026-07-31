import { beforeEach, describe, expect, it, vi } from 'vitest'

const SAVE_KEY = 'cheetah-peach.save.v1'

function stubStorage(initial?: unknown) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(SAVE_KEY, JSON.stringify(initial))

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  })

  return values
}

function completedSave() {
  return {
    version: 3,
    chapter: 'ending',
    checkpoint: {
      chapter: 'ending',
      position: [3, 0, -7],
      facing: 1.25,
    },
    memories: ['pressed-flower', 'ticket'],
    townTasks: ['recipe', 'parcel'],
    journalPages: ['pressed-flower', 'last'],
    constellations: ['cheetah', 'road-home'],
    reachedParkingLot: true,
    endingComplete: true,
    playedSeconds: 987,
    updatedAt: 123456,
  }
}

describe('ending replay', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('hydrates completed progress during boot so the title can offer replay', async () => {
    stubStorage(completedSave())
    const { useGame } = await import('../store/gameStore')

    useGame.getState().boot()

    expect(useGame.getState().hasExistingSave).toBe(true)
    expect(useGame.getState().save.endingComplete).toBe(true)
  })

  it('replays the parking-lot approach without erasing collected progress', async () => {
    const storage = stubStorage(completedSave())
    const [{ useGame }, { runtime }] = await Promise.all([
      import('../store/gameStore'),
      import('../store/runtime'),
    ])

    useGame.getState().boot()
    useGame.setState({
      phase: 'title',
      prompt: { verb: 'enter', label: 'Get in', hold: 1 },
      dialogue: [{ speaker: 'Peach', text: 'Old line.' }],
      dialogueIndex: 1,
      chapterCard: { title: 'Old card', key: 1 },
      cinematic: true,
      cinematicSkippable: true,
      narration: 'Old narration.',
      interstitial: 'Old interstitial.',
      endingActive: true,
    })
    runtime.holdControl('ending', true)
    const epoch = useGame.getState().sceneEpoch
    const before = useGame.getState().save

    useGame.getState().replayEnding()

    const state = useGame.getState()
    expect(state.phase).toBe('playing')
    expect(state.sceneEpoch).toBe(epoch + 1)
    expect(state.save).toEqual({
      ...before,
      chapter: 'parkingLot',
      checkpoint: null,
    })
    expect(state.save.endingComplete).toBe(true)
    expect(state.prompt).toBeNull()
    expect(state.dialogue).toBeNull()
    expect(state.dialogueIndex).toBe(0)
    expect(state.chapterCard).toBeNull()
    expect(state.cinematic).toBe(false)
    expect(state.cinematicSkippable).toBe(false)
    expect(state.narration).toBeNull()
    expect(state.interstitial).toBeNull()
    expect(state.endingActive).toBe(false)
    expect(runtime.playerControlEnabled).toBe(true)

    const persisted = JSON.parse(storage.get(SAVE_KEY) ?? 'null')
    expect(persisted.chapter).toBe('parkingLot')
    expect(persisted.checkpoint).toBeNull()
    expect(persisted.memories).toEqual(before.memories)
    expect(persisted.townTasks).toEqual(before.townTasks)
    expect(persisted.journalPages).toEqual(before.journalPages)
    expect(persisted.constellations).toEqual(before.constellations)
    expect(persisted.reachedParkingLot).toBe(true)
    expect(persisted.endingComplete).toBe(true)
    expect(persisted.playedSeconds).toBe(before.playedSeconds)
  })

  it('keeps Reset Progress destructive only to save progress', async () => {
    const storage = stubStorage(completedSave())
    const { useGame } = await import('../store/gameStore')

    useGame.getState().boot()
    useGame.setState({
      endingActive: true,
      endingCallbackReady: true,
      endingCallbackDone: true,
    })
    useGame.getState().resetProgress()

    const state = useGame.getState()
    expect(storage.has(SAVE_KEY)).toBe(false)
    expect(state.hasExistingSave).toBe(false)
    expect(state.save.chapter).toBe('cottage')
    expect(state.save.memories).toEqual([])
    expect(state.save.endingComplete).toBe(false)
    expect(state.endingActive).toBe(false)
    expect(state.endingCallbackReady).toBe(false)
    expect(state.endingCallbackDone).toBe(false)
  })
})
