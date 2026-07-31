# Personalizing The Cheetah & The Peach

Relationship text and appearance live under `src/content/`. Personal
sketchbook images live under `public/sketchbook/`. You never have to touch
gameplay code.

After editing anything, the dev server hot-reloads instantly. For the final
build, run `npm run build` once more.

---

## 1. Her name and your name

**`src/content/characters.ts`**

```ts
export const GIRL: GirlAppearance = {
  displayName: 'Peach',      // ← her name (journal, credits)
  ...
}

export const PERSON: PersonAppearance = {
  displayName: 'Me',         // ← your name
  ...
}
```

These names also flow into the credits automatically.

---

## 2. Her appearance

**`src/content/characters.ts` → `GIRL`**

| Field | What it changes |
|---|---|
| `skin` | skin tone |
| `hair` / `hairShadow` | hair colour, and its darker under-layer |
| `hairStyle` | `'long'` · `'bob'` · `'ponytail'` · `'bun'` |
| `dress` | main outfit colour |
| `dressTrim` | hem, collar and cuffs |
| `sleeves` | sleeve colour |
| `legs` | tights / legs |
| `shoes` | shoes |
| `hairAccent` | a small accent in her hair — set to `null` to remove it |

All colours are hex strings, e.g. `'#f6b8a0'`.

---

## 3. Your appearance (seated in the car)

**`src/content/characters.ts` → `PERSON`**

| Field | What it changes |
|---|---|
| `skin`, `hair`, `hairShadow` | tones |
| `hairStyle` | `'short'` · `'medium'` · `'curly'` · `'buzzed'` |
| `shirt` | shirt colour |
| `jacket` + `wearsJacket` | jacket colour; set `wearsJacket: false` to drop it |
| `glasses` + `glassesColor` | optional glasses |
| `facialHair` + `facialHairColor` | optional soft facial-hair silhouette |

Deliberately stylized — it is a silhouette that reads as *you*, not a portrait.

---

## 4. The car

**`src/content/characters.ts` → `CAR`**

| Field | What it changes |
|---|---|
| `body` | main paint |
| `trim` | lower panels and sills |
| `roof` | roof — set equal to `body` for a single tone |
| `seats` | seat upholstery |
| `interior` | dashboard and interior panels |
| `dashboardLight` | the glow on the dash |
| `style` | `'hatch'` (small, round) · `'sedan'` (longer) · `'wagon'` (squarer back) |
| `glassTint` | window tint |
| `dashCharmColor` | the peach on the dashboard |
| `mirrorCharmColor` | the little cheetah hanging from the mirror |

No manufacturer logos are used anywhere.

---

## 5. The parking lot

**`src/content/characters.ts` → `PARKING_LOT`**

| Field | What it changes |
|---|---|
| `carSpace` | which bay the car sits in, `0`–`7`, counted from the left |
| `lampColor` | streetlight colour (sodium amber by default) |
| `skyHorizon` / `skyZenith` | the dusk sky |
| `signText` | a faint sign at the edge of the lot — `null` hides it |

---

## 6. The final birthday message ⭐

**`src/content/finalMessage.ts`** — the most important file.

```ts
export const FINAL_MESSAGE: MessageGroup[] = [
  { lines: ['Every road we have taken, has lead us  here. Somehow.'], hold: 5.5 },
  ...
]
```

- Each **group** fades in on its own and stays on screen.
- `hold` is how many seconds that group sits alone before the next arrives.
- An empty string `''` inside `lines` renders a blank line.
- `SILENCE_BEFORE_MESSAGE` (seconds) is how long you both sit in silence first.
  Do not rush this — the silence is part of the scene.
- `FINAL_LINE` is the italic line that follows the whole message.

### Optional personal media

```ts
export const FINAL_MEDIA = {
  photograph: null,      // e.g. '/memories/us.jpg'
  voiceRecording: null,  // e.g. '/audio/voice/message.mp3'
  song: null,            // e.g. '/audio/music/our-song.mp3'
}
```

Put the files under `public/` and use the path **without** `public`.
Anything missing is skipped silently — the ending still works with text alone.

---

## 7. Memory messages

**`src/content/memories.ts`**

Six keepsakes: five in the forest, one at the water. For each:

```ts
{
  id: 'pressed-flower',        // ← do NOT change (save files reference it)
  title: 'My little Poupee',   // journal heading
  message: 'Some places...',   // what she reads when she finds it
  shape: 'flower',             // flower | photo | ticket | musicbox | charm | shell
  photo: null,                 // '/memories/first-trip.jpg'
  chapter: 'forest',           // do not change
}
```

> **Keep the `id` values as they are.** They are what a save file records.
> Changing an id makes an existing save forget that memory.

Photos go in `public/memories/`. A missing photo falls back to a pressed-flower
plate — nothing breaks.

---

## 8. Dialogue and town lines

**`src/content/dialogue.ts`**

Every spoken line and every thought she has when inspecting something. Grouped
by scene. `speaker: null` means it is her own unspoken thought.

Keep them short — the game is quiet on purpose. There are no branches.

---

## 9. Constellations

**`src/content/constellations.ts`**

Three shapes: the Cheetah, the Peach, the Road Home. For each you can edit:

- `name` — shown in the journal
- `message` — revealed when the last line is drawn
- `points` — 2D coordinates in a `-1..1` box, joined in array order.
  Editing these literally redraws the shape in the sky.
- `azimuth` / `elevation` / `spread` — where it sits on the sky dome

---

## 10. Raft sketchbook pages

During the river crossing, press **E** (or click the small prompt) to look
through the sketchbook while the raft keeps moving.

To add your own images:

1. Copy `.jpg`, `.png`, `.webp`, `.avif`, `.gif`, or `.svg` files into
   `public/sketchbook/`.
2. Add them to `public/sketchbook/manifest.json`.

```json
{
  "pages": [
    {
      "id": "river-study",
      "file": "river-study.jpg",
      "alt": "A pencil sketch of two mugs beside a river.",
      "title": "By the river",
      "caption": "Drawn on a quiet afternoon."
    }
  ]
}
```

`id` must be unique and use only letters, numbers, `_`, or `-`. `file` stays
inside `public/sketchbook/`; remote URLs are deliberately ignored so the game
remains local-first. Missing or invalid files fall back to a blank sketch page
and never interrupt the crossing.

---

## 11. Title, chapter names and prose

**`src/content/gameContent.ts`**

- `TITLE.main` / `TITLE.subtitle` — the title screen
- `TITLE.loadingLine` — the line under the loading emblem
- `OPENING_LINE` — *"Some beginnings wait for us to find them again."*
- `FIRST_STEP_LINE` — shown once when she first steps outside
- `CHAPTER_TITLES` — the card shown at the start of each chapter
- `PROMPTS` — the verbs on interaction prompts

---

## 12. Credits

**`src/content/credits.ts`**

Sections of `heading` + `lines`. The literal strings `'Peach'` and `'Me'` are
swapped for `GIRL.displayName` and `PERSON.displayName` at runtime, so the
credits stay in sync with the names you set in step 1.

---

## Where files go

```
public/
  audio/
    music/       background music   (title.mp3, cottage.mp3, forest.mp3, ending.mp3, …)
    ambience/    room tone / wind   (bedroom.mp3, town.mp3, forest.mp3, …)
    sfx/         one-shot sounds
  voice/       your recording
  memories/      photographs for memory pages
  sketchbook/    personal raft pages + manifest.json
  images/        anything else
  models/        (unused — everything is procedural)
  textures/      (unused — everything is procedural)
  fonts/         (unused — system serif)
```

### Replacing the generated audio

The game synthesises all its music and ambience at runtime, so it ships with no
audio files at all. Dropping a real file at one of the paths below **overrides**
the generated version for that slot:

| Drop a file here | Replaces |
|---|---|
| `public/audio/music/title.mp3` | title theme |
| `public/audio/music/cottage.mp3` | the morning |
| `public/audio/music/town.mp3` | the lantern town |
| `public/audio/music/forest.mp3` | the memory forest |
| `public/audio/music/crossing.mp3` | the water |
| `public/audio/music/mountain.mp3` | the climb |
| `public/audio/music/stars.mp3` | the constellation overlook |
| `public/audio/music/transition.mp3` | the way down |
| `public/audio/music/parking-lot.mp3` | the parking lot |
| `public/audio/music/ending.mp3` | the ending |
| `public/audio/ambience/*.mp3` | `bedroom`, `cottage`, `town`, `forest`, `water`, `mountain`, `transition`, `parking-lot`, `car` |

The exact filename list lives in `FILE_SLOTS` in `src/systems/audio/audio.ts`.

---

## Quick checklist before the birthday

1. Set both names in `characters.ts`.
2. Write the real message in `finalMessage.ts`.
3. Rewrite the six memory messages in `memories.ts`.
4. Set the car colour to a car that means something.
5. Optionally add a photograph and a song.
6. Run `npm run build`, then double-click `play-the-cheetah-and-the-peach.command`.
7. Play it start to finish once yourself.
