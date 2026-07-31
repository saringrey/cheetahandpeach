/**
 * WHISPERS — the two voices she walks between.
 *
 * The world is full of people who were not good to her. They do not confront her
 * and they do not say anything you could point at; they look up as she passes and
 * murmur, and the murmur is always half a sentence about her that was not meant
 * for her. That is the whole shape of it. Nothing here is a slur or an insult —
 * it is deliberately vague, because being talked about is the feeling, and a
 * specific cruelty would be a different, smaller thing.
 *
 * Cutting through them, once in the middle of every chapter, is his voice.
 * That is the argument the game is making: all of it was noise, and he was not.
 *
 * Both sets are safe to rewrite. Keep the murmurs short and unfinished — the
 * ellipses are doing most of the work — and keep his lines plain.
 */

/** Half-heard, never finished, never quite about anything. */
export const WATCHER_MURMURS: string[] = [
  '…she is still here, then.',
  '…not what I heard about her.',
  '…give it a month.',
  '…she always was like that.',
  '…someone should say something.',
  '…I would not have stayed either.',
  '…look at her, walking about.',
  '…she thinks nobody notices.',
  '…it will not last.',
  '…same as her mother.',
  '…she brought it on herself.',
  '…do not encourage her.',
]

/**
 * His voice, once per chapter, at the midpoint.
 *
 * Keyed by `ChapterId`. Each is one line, because a whisper that runs to three
 * sentences is a speech.
 */
export const LOVE_WHISPERS: Record<string, string> = {
  cottage: 'I never felt awake until I met you.',
  town: 'Whatever they said about you, they were wrong. All of them.',
  forest: 'I miss you in the middle of ordinary days, for no reason at all.',
  crossing: 'You were never too much. They were just small.',
  mountain: 'I would climb all of it again if you were at the top.',
  transition: 'Every road I kept walking turned out to be the one back to you.',
  parkingLot: 'I am right here. I have been right here the whole time.',
}

/** Seconds a whisper stays on screen. Long enough to read twice. */
export const WHISPER_SECONDS = 7.5

/**
 * How far into a chapter the love whisper lands, as a fraction of the distance
 * from where she starts to where she is going. Halfway, as asked.
 */
export const LOVE_WHISPER_AT = 0.5

/**
 * The way down.
 *
 * The descent is the longest continuous walk in the game — deliberately, because
 * the point of it is that it takes a while. These land at intervals along the
 * road so she is never left alone with only the distance. They are the same
 * promise said five ways: it is nearly over, and what is at the end is him.
 *
 * Ordered north to south, i.e. the order she meets them.
 */
export const DESCENT_REASSURANCES: string[] = [
  'I know it is taking a while. Stay with me.',
  'You are further than you think. Keep going.',
  'Not much longer now. I promise.',
  'You are almost there, love. I can nearly see you.',
  'Just a little longer. I am at the end of this road.',
]
