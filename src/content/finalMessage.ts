/**
 * THE FINAL MESSAGE — the most important file in the project.
 *
 * The message is shown in `groups`. Each group fades in on its own, holds, then the
 * next one follows. Empty strings inside a group render as a blank line.
 *
 * Keep groups short. The silence between them is doing as much work as the words.
 */

export interface MessageGroup {
  lines: string[]
  /** Seconds this group stays alone on screen before the next appears. */
  hold: number
}

export const FINAL_MESSAGE: MessageGroup[] = [
  { lines: ['Every road we have been on... was leading here.'], hold: 5.5 },
  {
   lines: [
     'Before the memories,',
     'before the adventures, before the hurt',
     'before the happy and before the sad.',
     'I would not have it any other way.',
     'Before I knew what our story would become,',
     'there was this place. Our world inside your car.',
     'our little safe space, for two little kids to be shy,',
     'to be nervous. to desire. to love. to try again.',
     'every second with you.',
   ],
   hold: 7.5,
  },
  { lines: ['An ordinary parking lot.', 'Your car.', 'And the moment I met you.'], hold: 6.5 },
  { lines: ['I would take every road again for the rest of my life', 'if it still brought me back to you somday.'], hold: 6.5 },
  { lines: ['Happy Birthday, Poupee'], hold: 4.5 },
  { lines: ['I love you endlessly. Just how you are. '], hold: 6 },
]

/** Shown after the message, over the two of them sitting in the car. */
export const FINAL_LINE = 'The beginning was waiting for us all along. I love you, Cheetah'

/**
 * Optional personal media. Drop the files in and set the paths — the game checks whether
 * each file exists and silently skips anything missing. Nothing breaks if they are all null.
 */
export const FINAL_MEDIA = {
  /** e.g. '/memories/us.jpg' — shown as a small photograph after the message. */
  photograph: '/memories/cheetahpic.png' as string | null,
  photographAlt: 'Cheetah as a child, smiling in a cheetah-print outfit.',
  /** e.g. '/audio/voice/message.mp3' — plays once the message begins. */
  voiceRecording: null as string | null,
  /** e.g. '/audio/music/our-song.mp3' — replaces the generated ending music. */
  song: null as string | null,
}

/**
 * THE MOMENT SHE GETS IN.
 *
 * The first thing he says once she is beside him. Shown as dialogue, with his
 * display name from characters.ts above it.
 */
export const PEACHY_GREETING = [
  'Im sorry it took me so long. I was waiting for you',
  'I remember how easy it was to stay. I would do it for a lifetime',
  'We kept talking. The whole road moved past us.',
  'Nothing extraordinary was happening.',
]

/**
 * THE NOTE he hands her.
 *
 * Rendered as a folded piece of paper that opens on screen. Edit these lines
 * freely — each string is its own line, and an empty string is a blank line.
 * The birthday message in FINAL_MESSAGE follows after it.
 */
export const THE_NOTE = {
  /** Small heading at the top of the paper. Set to null for none. */
  heading: null as string | null,
  lines: [
    'I typed this out at least one hundred times',
    'none of them were ever right.',
    '',
    'here is the plain version of it all',
    'I am so glad it was you. It will always be you. ',
  ],
  /** How long the note stays open before the message begins. Seconds. */
  hold: 11,
}

/**
 * Plays once, quietly, as she arrives at the parking-lot spawn.
 * Set to null to fall back to the generated score.
 */
export const APPROACH_SONG: string | null = '/audio/music/approach.mp3'

/** How long the two of you sit in silence before the first line appears. Seconds. */
export const SILENCE_BEFORE_MESSAGE = 7
