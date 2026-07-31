/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PALETTES } from '../systems/environment/palettes'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('moonlit color grade', () => {
  it('keeps every authored chapter dark, cool, and contrast-led', () => {
    for (const palette of Object.values(PALETTES)) {
      expect(palette.exposure).toBeGreaterThanOrEqual(0.56)
      expect(palette.exposure).toBeLessThanOrEqual(0.7)
      expect(palette.brightness ?? 0).toBeLessThanOrEqual(-0.05)
      expect(palette.contrast ?? 0).toBeGreaterThanOrEqual(0.2)
      expect(palette.saturation).toBeLessThanOrEqual(-0.08)
      expect(palette.ambientIntensity).toBeLessThanOrEqual(0.3)
      expect(palette.fogFar).toBeLessThanOrEqual(64)
    }
  })

  it('gives the sky a visible analytic moon and the fog a directional volume', () => {
    const environment = readSource('../systems/environment/Environment.tsx')
    const grade = readSource('../systems/environment/MoonlitGrade.tsx')
    const sceneKit = readSource('../scenes/SceneKit.tsx')

    expect(environment).toContain('float moonDisk')
    expect(environment).toContain('uniform float uSlant')
    expect(environment).toContain('Math.min(0.16, palette.ambientIntensity * 0.5)')
    expect(grade).toContain('vec3 sCurve = base * base * (3.0 - 2.0 * base)')
    expect(grade).toContain('graded /= 1.0 + graded')
    expect(grade).toContain('float shadowMask = 1.0 - smoothstep')
    expect(grade).toContain("super('MoonlitGradeEffect'")
    expect(sceneKit).toContain('volumetricLight = 0.085')
    expect(sceneKit).toContain('fogGround = 0.72')
    expect(sceneKit).toContain('mistColor ?? palette.fog')
  })

  it('keeps the cottage lamp local and lets the window carry the moon key', () => {
    const cottage = readSource('../scenes/cottage/CottageScene.tsx')

    expect(cottage).toContain('intensity={2.2} distance={6.2}')
    expect(cottage).toContain('intensity={1.85} distance={5.8}')
    expect(cottage).toContain('intensity={0.4} distance={3.0}')
    expect(cottage).toContain('<LightShafts')
    expect(cottage).toContain('color="#abc9ee"')
  })
})
