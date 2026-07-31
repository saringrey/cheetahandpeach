/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROFILES } from '../systems/performance/quality'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('default thermal budget', () => {
  it('keeps Auto on the efficient medium profile', () => {
    expect(PROFILES.medium.dpr).toBeLessThanOrEqual(1.1)
    expect(PROFILES.medium.shadows).toBe('low')
    expect(PROFILES.medium.bloom).toBe(false)
    expect(PROFILES.medium.smaa).toBe(false)
  })

  it('uses the resolved profile for post effects and shadow allocation', () => {
    const canvas = readSource('../app/GameCanvas.tsx')
    const environment = readSource('../systems/environment/Environment.tsx')

    expect(canvas).toContain('const enableBloom = profile.bloom')
    expect(canvas).toContain('const enableSmaa = profile.smaa')
    expect(canvas).toContain("powerPreference: 'low-power'")
    expect(canvas).toContain('window.devicePixelRatio || 1, 1.35')
    expect(canvas).toContain('runtime.effectiveDpr = dpr')
    expect(canvas).toContain('runtime.shaderPrograms = gl.info.programs?.length ?? 0')
    expect(canvas).toContain('const wallDt = (now - lastWallFrame.current) / 1000')
    expect(canvas).toContain('autoQuality.update(wallDt)')
    expect(environment).toContain("const mapSize = profile.shadows === 'high' ? 2048 : 1024")
    expect(environment).not.toContain("const mapSize = settings.shadows === 'high' ? 2048 : 1024")
  })

  it('keeps the fused moonlit grade when optional expensive effects are off', () => {
    const canvas = readSource('../app/GameCanvas.tsx')

    expect(canvas).toContain('<MoonlitGrade')
    expect(canvas).not.toContain('if (!enableBloom && !enableSmaa) return null')
  })

  it('keeps mist atmospheric without raymarching and uploading it every frame', () => {
    const environment = readSource('../systems/environment/Environment.tsx')
    const sceneKit = readSource('../scenes/SceneKit.tsx')

    expect(environment).toContain('for ( int i = 0; i < 3; i++ )')
    expect(environment).toContain('lastMatrixUpdate.current < 1 / 20')
    expect(sceneKit).toContain('count={Math.round(32 * mist)}')
  })

  it('shares identical storybook shader programs and budgets town point lights', () => {
    const assets = readSource('../utils/assets.ts')
    const town = readSource('../scenes/town/TownScene.tsx')
    const props = readSource('../systems/environment/props.tsx')

    expect(assets).toContain("mat.customProgramCacheKey = () => 'storybook-surface-v2'")
    expect(assets).not.toContain('rimColor.getHexString()')
    expect(props).toContain('emissiveIntensity: lit ? 0.38 : 0')
    expect(props).not.toMatch(/export const ParkSign[\s\S]*?distance=\{5\.5\}/)
    expect((town.match(/realLight/g) ?? []).length).toBeLessThanOrEqual(7)
  })
})
