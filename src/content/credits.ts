/**
 * CREDITS — shown after the ending and from the title menu.
 */

export interface CreditSection {
  heading: string
  lines: string[]
}

export const CREDITS: CreditSection[] = [
  {
    heading: 'The Cheetah & The Peach',
    lines: ['A Little Journey Back to the Beginning'],
  },
  {
    heading: 'For',
    // {her} and {me} are replaced with the display names in characters.ts.
    lines: ['{her}'],
  },
  {
    heading: 'Made by',
    lines: ['{me}'],
  },
  {
    heading: 'Built with',
    lines: [
      'love',
      'loss',
      'hope',
      'regret',
      'understanding',
      '8 million lines of code',
      '486 hours',
      'Tears',
      'Dunkin',
      'every song that reminded me of you',
      'every night I could not sleep',
      'the hope is that you would see this',
      'and everything I feel about you',
    ],
  },
  {
    heading: 'thank you for',
    lines: [
      'being patient with me,',
      'staying when it was hard',
      'being the best thing that ever happened to me',
    ],
  },
  {
    heading: '',
    lines: ['Happy Birthday. I love you.'],
  },
]

/** The very last thing on screen. */
export const CREDITS_SIGNOFF = 'The beginning was waiting for us all along I love the way this feels.'
