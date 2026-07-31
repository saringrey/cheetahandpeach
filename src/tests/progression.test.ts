import { describe, it, expect } from 'vitest'
import { MEMORIES, FOREST_MEMORIES, REQUIRED_FOREST_MEMORIES, getMemory } from '../content/memories'
import { CONSTELLATIONS } from '../content/constellations'
import { DIALOGUE, getDialogue } from '../content/dialogue'
import { FINAL_MEDIA, FINAL_MESSAGE, SILENCE_BEFORE_MESSAGE } from '../content/finalMessage'
import { CHAPTER_TITLES } from '../content/gameContent'
import { CHAPTER_ORDER } from '../game/save/save'

describe('progression requirements', () => {
  it('the forest requires exactly its five memories', () => {
    expect(REQUIRED_FOREST_MEMORIES).toBe(5)
    expect(FOREST_MEMORIES.map((m) => m.id)).toEqual([
      'pressed-flower',
      'photograph',
      'ticket',
      'music-box',
      'peach-charm',
    ])
  })

  it('memory ids are unique and resolvable', () => {
    const ids = MEMORIES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(getMemory(id)).toBeDefined()
    expect(getMemory('nope')).toBeUndefined()
  })

  it('uses the childhood photograph in both keepsake reveals', () => {
    const photograph = getMemory('photograph')
    expect(photograph?.photo).toBe('/memories/cheetahpic.png')
    expect(photograph?.photoAlt).toContain('Cheetah as a child')
    expect(FINAL_MEDIA.photograph).toBe('/memories/cheetahpic.png')
    expect(FINAL_MEDIA.photographAlt).toBe(photograph?.photoAlt)
  })

  it('three constellations exist with drawable shapes', () => {
    expect(CONSTELLATIONS).toHaveLength(3)
    expect(CONSTELLATIONS.map((c) => c.id)).toEqual(['cheetah', 'peach', 'road-home'])
    for (const c of CONSTELLATIONS) {
      expect(c.points.length).toBeGreaterThanOrEqual(3)
      expect(c.message.length).toBeGreaterThan(0)
      for (const [x, y] of c.points) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1)
        expect(Math.abs(y)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('every chapter has a title-card entry', () => {
    for (const c of CHAPTER_ORDER) expect(CHAPTER_TITLES[c]).toBeDefined()
  })

  it('dialogue lookups never explode on missing ids', () => {
    expect(getDialogue('does.not.exist')).toEqual([])
    expect(getDialogue('town.baker.before').length).toBeGreaterThan(0)
    // Every declared line is non-empty.
    for (const lines of Object.values(DIALOGUE)) {
      for (const l of lines) expect(l.text.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('final scene content', () => {
  it('the message has groups, each with a positive hold', () => {
    expect(FINAL_MESSAGE.length).toBeGreaterThanOrEqual(3)
    for (const g of FINAL_MESSAGE) {
      expect(g.lines.length).toBeGreaterThan(0)
      expect(g.hold).toBeGreaterThan(0)
    }
  })

  it('holds a real silence before the first words', () => {
    expect(SILENCE_BEFORE_MESSAGE).toBeGreaterThanOrEqual(3)
  })
})
