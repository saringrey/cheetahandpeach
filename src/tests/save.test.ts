import { describe, it, expect } from 'vitest'
import { migrate, emptySave, SAVE_VERSION, nextChapter, chapterIndex, CHAPTER_ORDER } from '../game/save/save'

describe('save migration', () => {
  it('returns a fresh save for garbage input', () => {
    expect(migrate(null).version).toBe(SAVE_VERSION)
    expect(migrate(undefined).version).toBe(SAVE_VERSION)
    expect(migrate('nonsense').version).toBe(SAVE_VERSION)
    expect(migrate(42).version).toBe(SAVE_VERSION)
    expect(migrate([]).version).toBe(SAVE_VERSION)
  })

  it('preserves valid progress fields', () => {
    const s = migrate({
      version: 1,
      chapter: 'forest',
      memories: ['pressed-flower', 'ticket'],
      townTasks: ['recipe'],
      constellations: ['cheetah'],
      reachedParkingLot: true,
      endingComplete: false,
      playedSeconds: 512,
    })
    expect(s.chapter).toBe('forest')
    expect(s.memories).toEqual(['pressed-flower', 'ticket'])
    expect(s.townTasks).toEqual(['recipe'])
    expect(s.constellations).toEqual(['cheetah'])
    expect(s.reachedParkingLot).toBe(true)
    expect(s.endingComplete).toBe(false)
    expect(s.playedSeconds).toBe(512)
    expect(s.version).toBe(SAVE_VERSION)
  })

  it.each([1, 2, 3])('preserves completed v%i saves', (version) => {
    const s = migrate({
      version,
      chapter: 'ending',
      memories: ['pressed-flower', 'ticket'],
      townTasks: ['recipe', 'parcel'],
      journalPages: ['pressed-flower', 'last'],
      constellations: ['cheetah', 'road-home'],
      reachedParkingLot: true,
      endingComplete: true,
      playedSeconds: 987,
      updatedAt: 123456,
    })

    expect(s).toEqual({
      version: SAVE_VERSION,
      chapter: 'ending',
      checkpoint: null,
      memories: ['pressed-flower', 'ticket'],
      townTasks: ['recipe', 'parcel'],
      journalPages: ['pressed-flower', 'last'],
      constellations: ['cheetah', 'road-home'],
      reachedParkingLot: true,
      endingComplete: true,
      playedSeconds: 987,
      updatedAt: 123456,
    })
  })

  it.each(['true', 1, 0, null, {}, []])(
    'rejects malformed endingComplete value %j',
    (endingComplete) => {
      expect(migrate({ chapter: 'ending', endingComplete }).endingComplete).toBe(false)
    },
  )

  it('rejects unknown chapters', () => {
    expect(migrate({ chapter: 'castle' }).chapter).toBe('cottage')
    expect(migrate({ chapter: 7 }).chapter).toBe('cottage')
  })

  it('drops corrupted checkpoints', () => {
    const bad = migrate({
      chapter: 'town',
      checkpoint: { chapter: 'town', position: [NaN, 0, 3], facing: 0 },
    })
    expect(bad.checkpoint).toBeNull()

    const offMap = migrate({
      chapter: 'town',
      checkpoint: { chapter: 'town', position: [99999, 0, 3], facing: 0 },
    })
    expect(offMap.checkpoint).toBeNull()
  })

  it('drops checkpoints whose chapter no longer matches', () => {
    const s = migrate({
      chapter: 'forest',
      checkpoint: { chapter: 'town', position: [1, 0, 2], facing: 0 },
    })
    expect(s.checkpoint).toBeNull()
  })

  it('keeps a sane checkpoint', () => {
    const s = migrate({
      chapter: 'town',
      checkpoint: { chapter: 'town', position: [4, 0, -2], facing: 1.2 },
    })
    expect(s.checkpoint).toEqual({ chapter: 'town', position: [4, 0, -2], facing: 1.2 })
  })

  it('filters non-string entries out of progress arrays', () => {
    const s = migrate({ memories: ['a', 5, null, 'b', {}] })
    expect(s.memories).toEqual(['a', 'b'])
  })
})

describe('chapter ordering', () => {
  it('walks the full journey in order', () => {
    expect(CHAPTER_ORDER).toEqual([
      'cottage',
      'town',
      'forest',
      'crossing',
      'mountain',
      'transition',
      'parkingLot',
      'ending',
    ])
    expect(nextChapter('cottage')).toBe('town')
    expect(nextChapter('parkingLot')).toBe('ending')
    expect(nextChapter('ending')).toBe('ending')
  })

  it('indexes chapters for the journal', () => {
    expect(chapterIndex('cottage')).toBe(0)
    expect(chapterIndex('ending')).toBe(7)
  })

  it('empty save starts at the cottage with nothing collected', () => {
    const s = emptySave()
    expect(s.chapter).toBe('cottage')
    expect(s.memories).toEqual([])
    expect(s.endingComplete).toBe(false)
  })
})
