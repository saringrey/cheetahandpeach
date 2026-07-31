/**
 * DIALOGUE — every line anyone says, and every line she thinks when she looks at something.
 *
 * Lines are shown one at a time. Press E or click to advance. There are no branches.
 * Keep them short; the game is quiet on purpose.
 */

export interface DialogueLine {
  /** Name shown above the line. Use null for her own unspoken thoughts. */
  speaker: string | null
  text: string
}

export type DialogueId = keyof typeof DIALOGUE

export const DIALOGUE = {
  // ── Bedroom -----------------------------------------------------------------
  'bedroom.journal': [
    { speaker: null, text: 'Her journal. Half the pages are still waiting.' },
  ],
  'bedroom.window': [
    { speaker: null, text: 'Morning already. Something is moving down by the gate.' },
  ],
  'bedroom.cheetah': [
    { speaker: null, text: 'The little cheetah. It has been on that shelf for years.' },
  ],
  'bedroom.peach': [
    { speaker: null, text: 'A peach, carved out of something soft. It still smells faintly sweet.' },
  ],
  'bedroom.frame': [
    { speaker: null, text: 'A photograph she keeps meaning to hang properly.' },
  ],
  'bedroom.flowers': [{ speaker: null, text: 'Someone put fresh ones in the jar.' }],

  // ── Cottage yard -------------------------------------------------------------
  'cottage.sign': [{ speaker: null, text: 'The road to town. She has walked it a hundred times.' }],
  'cottage.lights': [
    { speaker: null, text: 'Little peach-colored lights, drifting toward the road.' },
  ],

  // ── Town ---------------------------------------------------------------------
  // The save id for this errand is still `recipe` and the interaction is still
  // `recipe-page`, because both are persisted and audited. Only the fiction
  // changed — she is looking for butter now, not a recipe page.
  'town.baker.before': [
    { speaker: 'Baker', text: 'I am trying to make cinny-toast but I lost my butter! Can you find it for me?' },
    { speaker: 'Baker', text: 'It cannot have gone far. Nothing here ever does.' },
  ],
  'town.baker.after': [
    { speaker: 'Baker', text: 'There it is. Thank you, love.' },
    { speaker: 'Baker', text: 'Some lights are left behind so someone can find their way.' },
  ],
  'town.recipe.found': [{ speaker: null, text: 'The butter, sat against the fence where the wind left it.' }],

  'town.florist.before': [
    { speaker: 'Florist', text: 'They went thirsty while I was away. The can is right there.' },
  ],
  'town.florist.after': [
    { speaker: 'Florist', text: 'Look at them. The smallest kindness can change the color of a place.' },
  ],
  'town.flowers.watered': [{ speaker: null, text: 'They lift almost immediately.' }],

  // The Dream Man never speaks. Not once, not even here — every line is her own
  // observation. He still hands the letter over, because the third kindness gates
  // the whole chapter and a mute NPC must not become a dead end.
  'town.letter.pickup': [
    { speaker: null, text: 'The Dream Man looks up. He does not say anything.' },
    { speaker: null, text: 'He holds out a letter, and waits, and keeps holding it out.' },
    { speaker: null, text: 'She takes it. He goes back to whatever he was doing.' },
  ],
  'town.dreamMan': [
    { speaker: null, text: 'The Dream Man does not look up this time.' },
    { speaker: null, text: 'Whatever he is reading, it is not for her.' },
  ],
  'town.letter.deliver': [
    { speaker: 'Man by the bridge', text: 'For me? After all this time.' },
    { speaker: 'Man by the bridge', text: 'Keep going. Something remembers you.' },
  ],

  'town.cat': [{ speaker: null, text: 'June leans into her hand and starts up like a small engine.' }],
  'town.cat.again': [{ speaker: null, text: 'She has decided this is her spot now. Fair enough.' }],

  // ── The dogs -------------------------------------------------------------
  // Both share these, because both are just a dog who is pleased to see her.
  'dog.durk': [{ speaker: null, text: 'Durk thumps his tail twice and leans his whole weight into her leg.' }],
  'dog.durk.again': [{ speaker: null, text: 'He would let her do this all night.' }],
  'dog.apollo': [{ speaker: null, text: 'Apollo is entirely white and entirely delighted about it.' }],
  'dog.apollo.again': [{ speaker: null, text: 'He barks once, quietly, as if checking she is still there.' }],
  'town.ducks': [{ speaker: null, text: 'Four of them, in a line, entirely certain of where they are going.' }],
  'town.bell': [{ speaker: null, text: 'The note hangs in the air longer than it should.' }],
  'town.bench': [{ speaker: null, text: 'Warm stone. She stays a moment.' }],
  'town.parkSign': [
    { speaker: null, text: 'Ty Warner Park. The hill behind it goes up further than it looks.' },
  ],
  'town.hillBench': [
    { speaker: null, text: 'The whole town is lit from up here. She did that.' },
    { speaker: null, text: 'This is the last lamp. Past it, the dark is only dark.' },
    { speaker: null, text: 'She sits a while anyway. There is no hurry tonight.' },
  ],

  // ── Forest --------------------------------------------------------------------
  'forest.sit': [
    { speaker: null, text: 'The stream does most of the talking.' },
  ],
  'forest.deer': [
    { speaker: null, text: 'It watches her for a long moment, then goes back to the grass.' },
  ],
  'forest.spirit': [
    { speaker: null, text: 'Something small and quick, gone between the trees.' },
  ],

  // ── Crossing -------------------------------------------------------------------
  'crossing.raft': [{ speaker: null, text: 'The raft is already pointed at the far shore.' }],
  'crossing.reeds': [{ speaker: null, text: 'Fish move under the surface, then think better of it.' }],

  // ── Mountain ---------------------------------------------------------------------
  'mountain.marker1': [{ speaker: null, text: 'A stone marker. Someone stacked these a long time ago.' }],
  'mountain.marker2': [{ speaker: null, text: 'The town is a handful of lights now.' }],
  'mountain.chimes': [{ speaker: null, text: 'The wind finds them before she does.' }],
  'mountain.rest': [{ speaker: null, text: 'She looks back at everywhere she has been.' }],

  // ── Transition ---------------------------------------------------------------------
  'transition.wildflower': [{ speaker: null, text: 'Just a roadside flower. Ordinary. Still nice.' }],

  // ── Parking lot ---------------------------------------------------------------------
  'lot.cart': [{ speaker: null, text: 'Someone left it out. It rocks a little in the wind.' }],
  'lot.receipt': [{ speaker: null, text: 'A receipt, going wherever the wind takes it.' }],
  'lot.lamp': [{ speaker: null, text: 'The light warms up slowly, the way they do.' }],
} satisfies Record<string, DialogueLine[]>

export function getDialogue(id: string): DialogueLine[] {
  return (DIALOGUE as Record<string, DialogueLine[]>)[id] ?? []
}
