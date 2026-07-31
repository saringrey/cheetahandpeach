/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADING_FADE_MS, LOADING_HOLD_MS } from '../ui/LoadingScreen'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('final presentation polish', () => {
  it('holds the titled loading screen long enough to read and tracks progress with a peach', () => {
    const loading = readSource('../ui/LoadingScreen.tsx')
    const css = readSource('../styles/global.css')

    expect(LOADING_HOLD_MS).toBeGreaterThanOrEqual(1000)
    expect(LOADING_FADE_MS).toBeGreaterThanOrEqual(1000)
    expect(loading).toContain('role="progressbar"')
    expect(loading).toContain('className="loading__peach"')
    expect(loading).toContain('🍑')
    expect(css).toMatch(/\.loading__peach\s*\{[^}]*transition:\s*left 400ms/s)
  })

  it('makes the compass more legible without turning it into a full-width HUD', () => {
    const css = readSource('../styles/global.css')

    expect(css).toMatch(/\.compass-strip__band\s*\{[^}]*width:\s*min\(38rem, 64vw\)/s)
    expect(css).toMatch(/\.compass-strip__label\s*\{[^}]*font-size:\s*calc\(0\.86rem/s)
    expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.compass-strip__band\s*\{[^}]*width:\s*82vw/s)
  })

  it('keeps the town ducks leisurely and lights only the named park sign', () => {
    const creatures = readSource('../systems/environment/creatures.tsx')
    const props = readSource('../systems/environment/props.tsx')
    const town = readSource('../scenes/town/TownScene.tsx')

    expect(creatures).toContain('speed = 0.018')
    expect(props).toContain('lit = false')
    expect(props).toContain('emissiveIntensity: lit ? 0.38 : 0')
    expect(props).not.toMatch(/export const ParkSign[\s\S]*?distance=\{5\.5\}/)
    expect(town).toMatch(/text="Ty Warner Park"\s+lit/)
    expect(town).not.toMatch(/text="Lantern Town"\s+lit/)
  })
})
