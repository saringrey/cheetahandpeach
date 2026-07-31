/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('environment population and subtitle presentation', () => {
  it('keeps title stars in the rendered world instead of the menu overlay', () => {
    const titleMenu = readSource('../ui/TitleMenu.tsx')
    const titleScene = readSource('../scenes/title/TitleScene.tsx')

    expect(titleMenu).not.toContain('<MenuConstellations')
    expect(titleScene).toContain('function TitleConstellationSky()')
    expect(titleScene).toContain('<TitleConstellationSky />')
    expect(titleScene).toContain('CONSTELLATIONS')
  })

  it('centers dialogue in the viewport with translucent animated perimeter frames', () => {
    const css = readSource('../styles/global.css')

    expect(css).toMatch(/\.dialogue\s*\{[^}]*left:\s*50%;[^}]*top:\s*50%/s)
    expect(css).toContain('transform: translate(-50%, -50%);')
    expect(css).toContain('.dialogue > .panel::before')
    expect(css).toContain('.dialogue > .panel::after')
    expect(css).toContain('@keyframes subtitlePerimeter')
    expect(css).toMatch(/\.dialogue__core\s*\{[^}]*rgba\(27, 24, 35, 0\.58\)/s)
  })

  it('uses the supplied CC0 tree pack as instanced, non-shadow-casting accents', () => {
    const nature = readSource('../systems/environment/nature.tsx')
    const license = readSource('../../public/models/trees/quaternius/LICENSE.txt')

    expect(nature).toContain('/models/trees/quaternius/tree-01.glb')
    expect(nature).toContain('/models/trees/quaternius/pine-01.glb')
    expect(nature).toContain('/models/trees/quaternius/birch-01.glb')
    expect(nature).toContain('const TEXTURED_TREE_STRIDE = 5')
    expect(nature).toContain('mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)')
    expect(nature).toMatch(/function TreeAssetPartInstances[\s\S]*castShadow=\{false\}/)
    expect(license).toContain('CC0 1.0 Universal')
  })

  it('substantially increases authored tree candidates in every tree-bearing scene', () => {
    const populations: [string, string][] = [
      ['../scenes/title/TitleScene.tsx', 'i < 210'],
      ['../scenes/cottage/CottageScene.tsx', 'i < 270'],
      ['../scenes/town/TownScene.tsx', 'i < 245'],
      ['../scenes/forest/ForestScene.tsx', 'i < 860'],
      ['../scenes/crossing/CrossingScene.tsx', 'i < 235'],
      ['../scenes/mountain/MountainScene.tsx', 'i < 340'],
      ['../scenes/transition/TransitionScene.tsx', 'i < 740'],
    ]

    for (const [path, expected] of populations) {
      expect(readSource(path), path).toContain(expected)
    }
  })
})
