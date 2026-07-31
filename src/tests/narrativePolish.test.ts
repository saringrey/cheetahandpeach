/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PALETTES, mixPalette } from '../systems/environment/palettes'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('narrative and emotional polish invariants', () => {
  it('keeps the final descent long, continuous, and free of an interstitial card', () => {
    const transition = readSource('../scenes/transition/TransitionScene.tsx')
    const start = Number(transition.match(/DESCENT_START_Z = (-?\d+)/)?.[1])
    const end = Number(transition.match(/DESCENT_END_Z = (-?\d+)/)?.[1])

    expect(start - end).toBeGreaterThanOrEqual(280)
    expect(transition).toContain("{ mode: 'dissolve' }")
    expect(transition).toContain('text="JEWEL"')
  })

  it('keeps expensive instanced vegetation materials stable while the sky blends', () => {
    const transition = readSource('../scenes/transition/TransitionScene.tsx')
    const mountain = readSource('../scenes/mountain/MountainScene.tsx')

    expect(transition).toContain('palette={startPalette}')
    expect(transition).toContain('palette={endPalette}')
    expect(transition).not.toMatch(/TreeField[^>]+palette=\{blend\.palette\}/)
    expect(transition).not.toMatch(/(?:GrassField|BushField)[^>]+blend\.palette/)
    expect(mountain).toContain('palette={dayPalette}')
  })

  it('renders one distant storm with internal light, culling, and optional delayed thunder', () => {
    const environment = readSource('../systems/environment/Environment.tsx')
    const mountain = readSource('../scenes/mountain/MountainScene.tsx')

    expect(mountain).toContain('<SupercellStorm')
    expect(environment).toContain('mesh.computeBoundingSphere()')
    expect(environment).toContain('flashLight.current.target = flashTarget.current')
    expect(environment).toContain('audio.distantThunder')
    expect(environment).toContain('s.sequence % 3 !== 0')
  })

  it('keeps chapter exposure and vignette authored, bounded, and blendable', () => {
    for (const palette of Object.values(PALETTES)) {
      // The moonlit cottage intentionally sits below the outdoor night range,
      // but never low enough to erase authored shadow detail.
      expect(palette.exposure).toBeGreaterThanOrEqual(0.55)
      expect(palette.exposure).toBeLessThanOrEqual(1)
      expect(palette.vignette).toBeGreaterThanOrEqual(0.35)
      expect(palette.vignette).toBeLessThanOrEqual(0.9)
    }

    const midpoint = mixPalette(PALETTES.cottage, PALETTES.parkingLot, 0.5)
    expect(midpoint.exposure).toBeCloseTo(
      (PALETTES.cottage.exposure + PALETTES.parkingLot.exposure) / 2,
    )
    expect(midpoint.vignette).toBeCloseTo(
      (PALETTES.cottage.vignette + PALETTES.parkingLot.vignette) / 2,
    )
  })

  it('keeps reality geometry beside the road and lets distant windows live in fog', () => {
    const transition = readSource('../scenes/transition/TransitionScene.tsx')
    const props = readSource('../systems/environment/props.tsx')

    expect(transition).toContain('<Guardrail points={[[5, -102], [-3, -120], [5, -138]]}')
    expect(props).toContain('emissiveIntensity: 0.82')
    expect(props).toContain('glareMaterial(color).clone()')
    expect(props).toContain('sp.getWorldPosition(worldPosition)')
  })

  it('owns optional soundtrack layers and separates them from score intensity', () => {
    const audio = readSource('../systems/audio/audio.ts')

    expect(audio).toContain('private scoreBus: GainNode | null = null')
    expect(audio).toContain('private optionalLayers = new Map<string, Layer>()')
    expect(audio).toContain('this.optionalLayers.clear()')
    expect(audio).toContain('out.connect(this.scoreBus!)')
  })
})
