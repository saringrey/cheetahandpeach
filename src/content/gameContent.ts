/**
 * GAME CONTENT — title, chapter names, and the short lines of prose that punctuate
 * the journey. All editable.
 */

export const TITLE = {
  main: 'The Cheetah & The Peach',
  subtitle: 'A Little Journey Back to the Beginning',
  /** Shown under the emblem on the loading screen. */
  loadingLine: 'Some journeys begin by remembering.',
}

export type ChapterId =
  | 'title'
  | 'cottage'
  | 'town'
  | 'forest'
  | 'crossing'
  | 'mountain'
  | 'transition'
  | 'parkingLot'
  | 'ending'

/** The card that briefly appears when a chapter begins. */
export const CHAPTER_TITLES: Record<ChapterId, { title: string; subtitle?: string }> = {
  title: { title: 'The Cheetah & The Peach' },
  cottage: { title: 'The Morning', subtitle: 'where it begins again' },
  town: { title: 'The Lantern Town', subtitle: 'small kindnesses' },
  forest: { title: 'The Memory Forest', subtitle: 'what we kept' },
  crossing: { title: 'The Quiet Water', subtitle: 'a place to breathe' },
  mountain: { title: 'The Long Climb', subtitle: 'toward the stars' },
  transition: { title: 'The Way Down', subtitle: '' },
  parkingLot: { title: '', subtitle: '' },
  ending: { title: '', subtitle: '' },
}

/** The single line that opens the game, over black, before she wakes. */
export const OPENING_LINE = 'Some beginnings wait for us to find them again.'

/** Held on the black card between every chapter. */
export const INTERSTITIAL_LINE = 'Just how you are'

/** Shown once, softly, the first time she steps outside the cottage. */
export const FIRST_STEP_LINE = 'Follow the lights.'

/** Prompts. Verbs only — the interaction system supplies the object. */
export const PROMPTS = {
  inspect: 'Look',
  talk: 'Speak',
  collect: 'Take',
  deliver: 'Give',
  water: 'Water',
  sit: 'Sit',
  pet: 'Pet',
  ring: 'Ring',
  open: 'Open',
  reveal: 'Reach out',
  enter: 'Get in',
}

/** Hints that appear only if the player has been still and lost for a while. */
export const GENTLE_NUDGES = {
  cottage: 'The door is open.',
  town: 'Someone in the square could use a hand.',
  forest: 'Something is glowing further in.',
  crossing: 'The water is calm enough to cross.',
  mountain: 'The path keeps going up.',
  transition: 'Keep walking down.',
  parkingLot: '',
}
