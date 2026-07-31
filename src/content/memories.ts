/**
 * MEMORIES — the five keepsakes in the forest, plus the one on the water.
 *
 * `message` is what she reads when she picks it up, and what the journal keeps.
 * `photo` is optional: drop a JPG/PNG in `public/memories/` and put the path here.
 * Missing photos are handled gracefully — the journal draws a pressed-flower plate instead.
 */

export type MemoryShape = 'flower' | 'photo' | 'ticket' | 'musicbox' | 'charm' | 'shell'

export interface Memory {
  id: string
  /** Journal heading. */
  title: string
  /** What she thinks when she finds it. */
  message: string
  shape: MemoryShape
  /** Optional path under public/, e.g. '/memories/first-trip.jpg' */
  photo: string | null
  /** Describes an available photograph without repeating the journal prose. */
  photoAlt?: string
  /** Which chapter it lives in. */
  chapter: 'forest' | 'crossing'
}

export const MEMORIES: Memory[] = [
  {
    id: 'pressed-flower',
    title: 'A pressed flower',
    message: 'Some places become important because of who stood beside us.',
    shape: 'flower',
    photo: null,
    chapter: 'forest',
  },
  {
    id: 'photograph',
    title: 'A photograph',
    message: 'I did not know an ordinary day could become a beginning.',
    shape: 'photo',
    photo: '/memories/cheetahpic.png',
    photoAlt: 'Cheetah as a child, smiling in a cheetah-print outfit.',
    chapter: 'forest',
  },
  {
    id: 'ticket',
    title: 'A paper ticket',
    message: 'You made unfamiliar places feel safe.',
    shape: 'ticket',
    photo: null,
    chapter: 'forest',
  },
  {
    id: 'music-box',
    title: 'A small music box',
    message: 'The smallest moments became the ones I kept.',
    shape: 'musicbox',
    photo: null,
    chapter: 'forest',
  },
  {
    id: 'peach-charm',
    title: 'A peach-shaped charm',
    message: 'Even before I understood it, I was already finding my way to you.',
    shape: 'charm',
    photo: null,
    chapter: 'forest',
  },
  {
    id: 'river-stone',
    title: 'A stone from the riverbed',
    message: 'Quiet was never empty with you in it.',
    shape: 'shell',
    photo: null,
    chapter: 'crossing',
  },
]

export const FOREST_MEMORIES = MEMORIES.filter((m) => m.chapter === 'forest')
export const REQUIRED_FOREST_MEMORIES = FOREST_MEMORIES.length

export function getMemory(id: string): Memory | undefined {
  return MEMORIES.find((m) => m.id === id)
}
