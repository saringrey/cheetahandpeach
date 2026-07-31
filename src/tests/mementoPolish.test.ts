/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('memento discoverability polish', () => {
  it('names the next forest keepsake without moving or renaming the five memories', () => {
    const forest = readSource('../scenes/forest/ForestScene.tsx')

    expect(forest).toContain(': MEMORY_SPOTS[nextMemory.id].label')
    expect(forest).not.toContain(": 'something remembered'")
    expect(forest).toContain('radius={2.8}')
    expect(forest).toContain('scale={[2, 0.02, 2]}')
    expect(forest).toContain('scale={1.15}')
    expect(forest).toContain('intensity={2.4} distance={6.5}')
  })

  it('keeps the river stone optional while making it easier to notice', () => {
    const crossing = readSource('../scenes/crossing/CrossingScene.tsx')

    expect(crossing).toContain('id="memory-river-stone"')
    expect(crossing).toContain('scale={[0.38, 0.25, 0.33]}')
    expect(crossing).toContain('radius={2.7}')
    expect(crossing).toContain('material={glow(\'#b8d8e0\', 0.13, false)}')
  })

  it('keeps the portrait out of the ending message flow and viewport-safe', () => {
    const css = readSource('../styles/global.css')

    expect(css).toMatch(/\.ending__photo\s*\{[^}]*position:\s*absolute;/s)
    expect(css).toMatch(/\.ending__photo\s*\{[^}]*max-height:\s*34vh;/s)
    expect(css).toMatch(/\.sketchbook\s*\{[^}]*max-height:\s*calc\(100dvh - 2rem\);/s)
    expect(css).toContain('.entry__plate img.entry__photo--portrait')
  })
})
