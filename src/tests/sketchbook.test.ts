import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SKETCHBOOK_PAGES,
  parseSketchbookManifest,
  resolveSketchbookAsset,
} from '../content/sketchbook'

describe('raft sketchbook content', () => {
  it('ships the three personal sketches in their intended order', () => {
    expect(DEFAULT_SKETCHBOOK_PAGES).toHaveLength(3)
    expect(DEFAULT_SKETCHBOOK_PAGES.map((page) => page.src)).toEqual([
      '/sketchbook/sketch1.png',
      '/sketchbook/sketch2.png',
      '/sketchbook/sketch3.png',
    ])
    expect(DEFAULT_SKETCHBOOK_PAGES.every((page) => page.kind === 'image')).toBe(true)
    expect(DEFAULT_SKETCHBOOK_PAGES.every((page) => page.alt.length > 20)).toBe(true)
    expect(new Set(DEFAULT_SKETCHBOOK_PAGES.map((page) => page.id)).size).toBe(
      DEFAULT_SKETCHBOOK_PAGES.length,
    )
  })

  it('accepts only safe files inside the local sketchbook folder', () => {
    expect(resolveSketchbookAsset('river-study.webp')).toBe('/sketchbook/river-study.webp')
    expect(resolveSketchbookAsset('pages/one.png')).toBe('/sketchbook/pages/one.png')
    expect(resolveSketchbookAsset('/sketchbook/already-local.jpg')).toBe(
      '/sketchbook/already-local.jpg',
    )

    expect(resolveSketchbookAsset('../private.png')).toBeNull()
    expect(resolveSketchbookAsset('/memories/not-a-sketch.png')).toBeNull()
    expect(resolveSketchbookAsset('https://example.com/tracker.png')).toBeNull()
    expect(resolveSketchbookAsset('notes.txt')).toBeNull()
  })

  it('keeps valid personal pages and drops malformed manifest entries', () => {
    const pages = parseSketchbookManifest({
      pages: [
        {
          id: 'our-river',
          file: 'our-river.jpg',
          alt: 'A pencil drawing of two mugs beside the river.',
          title: 'By the river',
          caption: 'A page from home.',
        },
        { id: 'remote', file: 'https://example.com/nope.png', alt: 'Not local.' },
        { id: 'text-file', file: 'notes.txt', alt: 'Not an image.' },
        { id: '', file: 'missing-id.png', alt: 'Missing id.' },
        null,
      ],
    })

    expect(pages).toEqual([
      {
        id: 'our-river',
        kind: 'image',
        src: '/sketchbook/our-river.jpg',
        alt: 'A pencil drawing of two mugs beside the river.',
        title: 'By the river',
        caption: 'A page from home.',
      },
    ])
  })

  it('returns an empty list for a missing or invalid manifest shape', () => {
    expect(parseSketchbookManifest(null)).toEqual([])
    expect(parseSketchbookManifest({})).toEqual([])
    expect(parseSketchbookManifest({ pages: 'nope' })).toEqual([])
  })
})
