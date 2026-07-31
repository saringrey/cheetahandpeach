/**
 * The raft sketchbook is intentionally separate from save data. Its three
 * keepsake pages ship with the game; optional extra pages are read from a local
 * public-folder manifest and disappear harmlessly when a file is unavailable.
 */

export type CheetahDrawing = 'watching' | 'running' | 'sleeping'

export interface SketchbookDrawingPage {
  id: string
  kind: 'drawing'
  drawing: CheetahDrawing
  title: string
  caption: string
}

export interface SketchbookImagePage {
  id: string
  kind: 'image'
  src: string
  alt: string
  title: string
  caption: string
}

export type SketchbookPage = SketchbookDrawingPage | SketchbookImagePage

/** Served by Vite from `public/sketchbook/manifest.json`. */
export const SKETCHBOOK_MANIFEST = '/sketchbook/manifest.json'

export const DEFAULT_SKETCHBOOK_PAGES: readonly SketchbookImagePage[] = [
  {
    id: 'graphite-study',
    kind: 'image',
    src: '/sketchbook/sketch1.png',
    alt: 'A dense graphite drawing on lined paper of two dark-haired figures leaning toward one another.',
    title: 'Graphite study',
    caption: '',
  },
  {
    id: 'maggi-mantis',
    kind: 'image',
    src: '/sketchbook/sketch2.png',
    alt: 'A lined-paper drawing of Maggi Mantis, a long-limbed mantis with “LOVE YOU” curled into its antennae.',
    title: 'Maggi Mantis',
    caption: '',
  },
  {
    id: 'side-by-side',
    kind: 'image',
    src: '/sketchbook/sketch3.png',
    alt: 'A lined-paper drawing of two smiling, big-eyed figures holding hands, surrounded by small love doodles.',
    title: 'Side by side',
    caption: '',
  },
] as const

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i

function text(value: unknown, fallback = '', max = 180): string {
  return typeof value === 'string' ? value.trim().slice(0, max) || fallback : fallback
}

/**
 * Convert a manifest filename into a same-origin public asset path.
 * Remote URLs, traversal, control characters, and non-image files are rejected.
 */
export function resolveSketchbookAsset(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  const hasControlCharacter = Array.from(input).some((character) => character.charCodeAt(0) < 32)
  if (
    !input ||
    input.length > 240 ||
    hasControlCharacter ||
    /[\\?#]/.test(input) ||
    input.includes(':') ||
    input.startsWith('//')
  ) {
    return null
  }

  const relative = input.startsWith('/sketchbook/')
    ? input.slice('/sketchbook/'.length)
    : input.startsWith('/')
      ? ''
      : input
  if (!relative || !IMAGE_EXTENSION.test(relative)) return null

  const segments = relative.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null

  return `/sketchbook/${relative}`
}

/** Parse untrusted JSON without allowing it to affect anything beyond this viewer. */
export function parseSketchbookManifest(value: unknown): SketchbookImagePage[] {
  if (!value || typeof value !== 'object') return []
  const pages = (value as { pages?: unknown }).pages
  if (!Array.isArray(pages)) return []

  const seen = new Set<string>()
  const parsed: SketchbookImagePage[] = []

  for (const raw of pages.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const id = text(entry.id, '', 64)
    const src = resolveSketchbookAsset(entry.file)
    if (!SAFE_ID.test(id) || seen.has(id) || !src) continue
    seen.add(id)

    const title = text(entry.title, 'A page from home', 90)
    parsed.push({
      id,
      kind: 'image',
      src,
      alt: text(entry.alt, title, 220),
      title,
      caption: text(entry.caption, '', 260),
    })
  }

  return parsed
}

export async function loadPersonalSketchbookPages(
  signal?: AbortSignal,
): Promise<SketchbookImagePage[]> {
  try {
    const response = await fetch(SKETCHBOOK_MANIFEST, {
      signal,
      cache: import.meta.env.DEV ? 'no-store' : 'default',
    })
    if (!response.ok) return []
    return parseSketchbookManifest(await response.json())
  } catch {
    return []
  }
}
