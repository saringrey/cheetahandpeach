/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../systems/audio/audio'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('chapter atmosphere audio', () => {
  it('assigns a distinct soundscape at every chapter boundary', () => {
    const expected = [
      ['../scenes/cottage/CottageScene.tsx', 'ambience="bedroom"'],
      ['../scenes/town/TownScene.tsx', 'ambience="town"'],
      ['../scenes/forest/ForestScene.tsx', 'ambience="forest"'],
      ['../scenes/crossing/CrossingScene.tsx', 'ambience="water"'],
      ['../scenes/mountain/MountainScene.tsx', 'ambience="mountain"'],
      ['../scenes/transition/TransitionScene.tsx', 'ambience="transition"'],
      ['../scenes/parkingLot/ParkingLotScene.tsx', 'ambience="parkingLot"'],
    ] as const

    for (const [path, marker] of expected) {
      expect(readSource(path)).toContain(marker)
    }
  })

  it('publishes the current ambience for browser-level transition checks', () => {
    const audio = readSource('../systems/audio/audio.ts')

    expect(audio).toContain('currentAmbience: this.currentAmbience')
    expect(audio).toContain('async ambience(id: AmbienceId, fade = 1.6)')
  })
})

describe('chapter music', () => {
  const themes = Object.entries(THEMES)

  it('gives every chapter its own tune, texture and colour', () => {
    // Two chapters sharing a motif, a texture or a filter setting is how the
    // score slid into sounding like one track with the key changed.
    const motifs = themes.map(([, t]) => JSON.stringify(t.motif))
    expect(new Set(motifs).size).toBe(themes.length)

    const textures = themes.filter(([, t]) => t.textureGain > 0).map(([, t]) => t.texture)
    expect(new Set(textures).size).toBe(textures.length)

    const cutoffs = themes.map(([, t]) => t.cutoff)
    expect(new Set(cutoffs).size).toBe(themes.length)
  })

  it('remixes the chapter before it rather than starting a new piece', () => {
    // The title seeds the lineage; everything after it carries something in.
    expect(THEMES.title.carry).toBeNull()
    for (const [id, theme] of themes) {
      if (id === 'title') continue
      expect(theme.carry, `${id} carries nothing forward`).not.toBeNull()
      expect(theme.carryGain).toBeGreaterThan(0)
      expect(THEMES[theme.carry!], `${id} carries an unknown theme`).toBeDefined()
      expect(theme.carry, `${id} carries itself`).not.toBe(id)
    }

    // Travel order, and the one deliberate exception: the ending reaches back
    // past the whole road to the cottage she left.
    expect(THEMES.cottage.carry).toBe('title')
    expect(THEMES.town.carry).toBe('cottage')
    expect(THEMES.forest.carry).toBe('town')
    expect(THEMES.crossing.carry).toBe('forest')
    expect(THEMES.mountain.carry).toBe('crossing')
    expect(THEMES.stars.carry).toBe('mountain')
    expect(THEMES.transition.carry).toBe('stars')
    expect(THEMES.lot.carry).toBe('transition')
    expect(THEMES.ending.carry).toBe('cottage')
  })

  it('derives the later motifs from earlier ones without changing their pitches', () => {
    // Both are transform-built: reversing and stretching only, so they stay as
    // consonant against their chords as the lines they came from.
    const pitches = (m: [number | null, number][]) => m.map(([s]) => s).filter((s) => s != null)

    expect(pitches(THEMES.mountain.motif).slice().reverse()).toEqual(pitches(THEMES.crossing.motif))
    expect(pitches(THEMES.lot.motif)).toEqual(pitches(THEMES.transition.motif).slice(0, 3))
  })
})
