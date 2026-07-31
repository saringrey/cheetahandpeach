/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const CREATURES = readSource('../systems/environment/creatures.tsx')
const BIOME_SCENES = [
  '../scenes/cottage/CottageScene.tsx',
  '../scenes/town/TownScene.tsx',
  '../scenes/forest/ForestScene.tsx',
  '../scenes/crossing/CrossingScene.tsx',
  '../scenes/mountain/MountainScene.tsx',
  '../scenes/transition/TransitionScene.tsx',
  '../scenes/parkingLot/ParkingLotScene.tsx',
]

describe('Durk environmental storytelling', () => {
  it('defines a quiet named dog with sleeping and firefly-chasing behaviors', () => {
    expect(CREATURES).toContain("export const DURK_NAME = 'Durk'")
    expect(CREATURES).toContain("export type DurkBehavior = 'sleep' | 'fireflies'")
    expect(CREATURES).toContain('export const Durk')
  })

  it('places Durk once in every environmental biome', () => {
    // Scenes place Durk through the PettableDog wrapper (id="durk-<scene>"),
    // which renders <Durk> and adds the pet interaction. Apollo, his white-coat
    // companion, uses id="apollo-<scene>" and is matched separately.
    for (const path of BIOME_SCENES) {
      const source = readSource(path)
      expect(source.match(/id="durk-/g), path).toHaveLength(1)
    }
  })

  it('never registers Durk as an interactable or HUD prompt', () => {
    for (const path of BIOME_SCENES) {
      const source = readSource(path)
      expect(source).not.toMatch(/Interactable[^>]+(?:Durk|durk)/)
    }
  })
})
