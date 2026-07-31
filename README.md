# The Cheetah & The Peach

> *A Little Journey Back to the Beginning*

A short (~20 minute) emotional 3D exploration game, built as a birthday gift.
Runs locally in a browser or packaged macOS app. No backend or accounts. The
optional stylized tree accents are CC0 assets from Quaternius and ship with
their license.

**This README is written for a coding agent picking the project up cold.** It
documents the architecture, the invariants, the traps that already bit, and what
is left to do.

---

## 1. Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build && npm run preview      # production
```

Native macOS app (builds the canonical production web bundle, packages it in a
sandboxed Chromium/ANGLE host forced to Metal, signs the `.app`, stops an older
copy, then launches):

```bash
./script/build_and_run.sh
```

Build, launch-check, and cleanly stop the native app:

```bash
./script/build_and_run.sh --verify
```

The staged app is
`releases/native/The Cheetah & The Peach.app`. It contains the exact same
compiled game files as `dist/`; no scene, UI, story, save, or control logic is
ported or replaced. The host requires an actual `ANGLE Metal Renderer` and a
captured WebGL frame before verification passes. See
`native-electron/README.md` for the boundary and diagnostics.

Double-clickable launcher (installs, builds on first run, then opens the browser):

```
play-the-cheetah-and-the-peach.command
```

Desktop shortcut:

```
/Users/grey/Desktop/Play The Cheetah & The Peach.command
```

The shortcut follows its symlink back to this project, installs missing
dependencies, rebuilds when source/content/config is newer than `dist/`, chooses
the first free port from 5180–5189, and stops its Vite child process when the
Terminal window closes. If a production build fails, it falls back to serving
the live source and leaves a per-port diagnostic log in `/tmp/`.

### Gameplay controls

| Input | Action |
|---|---|
| **WASD / arrow keys** | Walk |
| **Shift** | Hurry |
| **Space** | Jump |
| **E** | Interact |
| **Hold left mouse + drag** | Look around |
| **Q** | Hold up the paper star (guide + compass) |
| **J** | Journal |
| **Esc** | Pause / back |

E, Space, and Enter advance dialogue. Space/Enter also confirm menu choices, so
keyboard-only play remains available outside movement.

**The compass strip** runs across the top of the screen. A **Home** marker rides
it at the bearing of wherever the chapter wants her next — every objective in the
game is a step back toward the same place, so they all carry the same name.
Markers past either end pin inside the band and dim, meaning "turn around".

**The paper star** is the only thing that adds to it. Pressing **Q** holds it up
for twelve seconds: the guide wisps light immediately, the scene's own phrase for
Home appears under the marker, and **Durk** — the dog asleep somewhere in every
biome — shows up on the strip so he can be found rather than stumbled on. The
whole strip can be switched off in Settings → *Playing* → *Compass*. Nothing about
it is required; the idle-triggered wisps work as before either way.

**Things that answer to her.** Mushrooms light as she comes near and fade slowly
behind her; flowers open as she passes and each plays a short piano figure the
first time it does. Both are proximity-driven per instance, both are free of the
React tree, and neither is required for anything.

### All scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | serve the production build |
| `npm run typecheck` | `tsc -p tsconfig.app.json --noEmit` |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | raw single-process Playwright run (use the verifier for the local release gate) |
| `npx playwright test shots` | writes screenshots of every region to `shots/` |
| `./scripts/verify-project.sh` | typecheck, lint, unit tests, production build/preview smoke, then every browser case in WebGL-safe groups |
| `./script/build_and_run.sh` | release-build, stage, ad-hoc sign, and launch the native macOS app |
| `./script/build_and_run.sh --verify` | build, verify stable native launch, then prove clean shutdown |

### Debug tools

Set `VITE_ENABLE_DEBUG_TOOLS=true` (see `.env.example`), then press **Shift + ~** in game.
Gives chapter teleports, memory/task/constellation unlocks, the ending overlay,
quality switching and live perf counters. Compiled out of a normal build.

### `?alwaysRun=1`

Query flag. Normally the render loop stops when the tab is hidden. With this flag
the loop is driven from a Web Worker timer, which browsers do not throttle in
background tabs. **Automation must use it** — every Playwright test does.

---

## 2. Stack

| Package | Version | Notes |
|---|---|---|
| react / react-dom | 19.2 | |
| three | 0.185 | `PCFSoftShadowMap` is deprecated here — use `PCFShadowMap` |
| @react-three/fiber | 9.6 | |
| @react-three/drei | 10.7 | only lightly used |
| @react-three/postprocessing | 3.0 | Bloom, Vignette, SMAA, HueSaturation |
| zustand | 5.0 | |
| gsap | 3.15 | installed; camera work ended up custom, so barely used |
| vite | 8.1 | rolldown-based |
| typescript | 6.0 | `strict: true` |

Most of the world is generated in code, but release-critical runtime assets now
ship under `public/`: licensed tree models/textures, the APPROACH song, three
sketchbook pages, and the childhood photograph used by the journal and ending.
Keep those paths covered by the production-preview smoke test when replacing
personal content.

---

## 3. Architecture

```
src/
  app/
    App.tsx           DOM shell: overlays, pointer lock, audio unlock
    GameCanvas.tsx    <Canvas>, InputPump, QualityManager, Post, SceneRouter
  content/            ← ALL personalization lives here (see PERSONALIZE.md)
  game/
    camera/           FollowCamera.tsx, director.ts (authored cinematics)
    character/        Girl.tsx (procedural), CharacterController.tsx
    input/            input.ts (kb/mouse/gamepad), frame.ts (per-frame snapshot)
    interactions/     interactions.tsx (registry + prompt driver)
    save/             save.ts (localStorage, versioned, migrating)
    world/            collision.ts (analytic circle/AABB resolution)
  scenes/
    SceneKit.tsx      the shared frame every chapter is built on
    title/ cottage/ town/ forest/ crossing/ mountain/ transition/ parkingLot/
  store/
    gameStore.ts      zustand — UI + progression (reactive)
    runtime.ts        mutable singleton — per-frame data (NON-reactive)
  systems/
    audio/audio.ts            Web Audio engine, fully synthesised
    environment/              palettes, Environment, Terrain, nature, props, creatures
    particles/Particles.tsx   one pooled instanced system for everything
    performance/quality.ts    presets + the Auto tuner
  styles/global.css
  tests/              vitest unit tests
tests/e2e/            Playwright: smoke, reachability, narrative, ending, perf and captures
```

### The two-store rule (important)

- **`useGame`** (zustand) holds anything the UI renders. Writing to it re-renders React.
- **`runtime`** (plain mutable object) holds player position, camera angles,
  colliders, interactables, perf counters.

**Nothing inside a `useFrame` may write to `useGame` every frame.** Movement,
camera and collision run at 60 fps with zero React renders. Breaking this is the
easiest way to tank performance.

### Frame order

`useFrame` priorities are all **negative**. The canvas now runs with
`frameloop="never"` and `FrameScheduler` advances a monotonic manual clock at
30 fps in menus and 60 fps during play. Hidden tabs submit no frames.

```
-10000 RenderStats    resets whole-frame WebGL counters
 -1000 InputPump      polls input once, writes `frameInput`
  -900 QualityManager auto-quality, frame timing, budgeted shadow refresh
     0 CharacterController → FollowCamera → InteractionDriver → scene logic
 after RenderStats    records all scene + post-processing draws/triangles
```

Input is polled **once** and shared via `frameInput`, so one consumer cannot eat
another's key-press edge. `takeInteractPress()` consumes the edge.

### SceneKit

Every chapter renders `<SceneKit>`, which supplies world registration, sky,
lighting, wind, the player, the camera, the interaction driver, the guide lights,
autosave and the opening fade.

`<WorldSetup>` is rendered **first** so its layout effect clears colliders before
any child registers one (React fires layout effects depth-first in tree order).
Do not move it.

### Progression

Linear: `cottage → town → forest → crossing → mountain → transition → parkingLot → ending`
(`CHAPTER_ORDER` in `save.ts`). Chapters advance through `<Trigger>` volumes.

Gates:
- **town** — all three kindnesses (`recipe`, `flowers`, `letter`) before the forest path lights.
- **forest** — all five forest memories before the east exit opens.
- **mountain** — all three constellations before the descent opens.

**No-blocker strategy:** each scene sets `runtime.objective` (and a label via
`useObjective(point, label)`). If the player is idle or lost for N seconds
`<GuideWisps>` drift from her toward it; pressing **Q** summons them at once by
putting time on `runtime.questGuideSeconds`. The compass strip reads the same
`runtime.objective` and shows it as **Home**. Gated exits also carry a soft "not
yet" `<Trigger>` that states the situation in one line of her own thought.

### Collision

No physics engine, deliberately. `collision.ts` pushes a circle out of static
circles and rotated AABBs analytically (3 passes), then hard-clamps to `bounds`.
It cannot tunnel and cannot drop the player through terrain. Ground comes from
each scene's `height(x, z)` function, which is also what the terrain mesh is built
from — so the visual and the collision can never disagree.

`Collider.noCam` marks a collider the follow camera should ignore.

### Camera

`FollowCamera` is hand-rolled (the brief excluded `OrbitControls`). Damped follow,
mouse/stick orbit, pitch limits, obstruction handling by marching the ray toward
the camera and pulling in, and a hard "never below the ground" clamp.

`director` (`game/camera/director.ts`) owns authored cinematics: a keyframe list
with eased interpolation, a blend factor and skip support. `FollowCamera` lerps
between gameplay framing and `director.pos/look` by `director.blend`, so handover
is smooth in both directions. Every scene cancels the director on unmount.

### Audio

`systems/audio/audio.ts` synthesises everything:

- **Ambience** — pink-noise beds through biquad filters with slow LFOs, plus
  sparse scheduled one-shots (birds, chimes, passing cars).
- **Music** — per-chapter themes as chord progressions over one of three motifs
  (Cheetah / Peach / Road). Pad + bass + melody, lookahead-scheduled.
- **SFX** — shaped noise bursts and tones.
- A convolver with a generated impulse response gives everything one shared space.

Dropping a real file at any path in `FILE_SLOTS` **overrides** the generated
version for that slot. Missing files are not an error. `audio.init()` must be
called from a user gesture; `App.tsx` wires it to the first pointer/key event.

### Art direction

**Moonlit and dark by design.** The key light is a cool silver-blue moon at low
intensity (0.24–0.8 depending on chapter), ambient is cool blue, fog is tight
(`fogFar` 34–88), and warmth comes almost entirely from practical lights —
lanterns, windows, streetlights, the car interior. Interiors are deliberately
warm and lit so they read against the cold night outside.

Ground mist (`<Mist>` in `Environment.tsx`, wired through `SceneKit`'s `mist`
prop) adds soft near-horizontal sheets that hug the terrain and drift with the
player. **Mist must be tinted lighter than the scene** — tinting it with the fog
colour makes it invisible, which is why it uses `palette.ambientSky`.

Streetlights buzz continuously and stutter every 6–22 seconds (`Streetlight` in
`props.tsx`); the emissive lamp mesh dims with the light, so the flicker reads
even where the point light is not enabled.

The UI is dark mode. The CSS tokens keep their old names — `--paper` family are
now dark surfaces, `--ink` family are the warm light type on top — so every rule
follows from those. `--tint-1/2/3` are the light-on-dark hairline fills.
Narration, the chapter card and the interaction prompt sit on blurred backing
plates so they stay readable over any scene.

Tuning knobs:

- `systems/environment/palettes.ts` — per-chapter sky, fog, light colours and
  intensities. This is where you make the game brighter or darker.
- `gl.toneMappingExposure`, `<MoonlitGrade>` and `<Vignette>` in
  `GameCanvas.tsx` — global filmic toe/shoulder grade and framing.
- Practical light intensities live on `Lantern` / `Streetlight` in `props.tsx`.

If a scene looks too dark, raise `ambientIntensity` and the practicals *before*
raising exposure — the mood comes from contrast, not from overall level.

### Rendering / performance

- One shadow-casting directional light per scene, plus a hemisphere and a cool
  back-fill. Point lights are used sparingly and never cast shadows.
- `utils/assets.ts` caches every geometry and material. A hundred lanterns share
  one geometry and one material.
- Foliage, props, particles and creatures are `InstancedMesh` with one matrix
  upload per frame.
- `storybook()` is the one material everything uses: `MeshStandardMaterial` plus
  an injected rim and downward-gradient term, anchored on `#include <opaque_fragment>`.
- Wind sway is injected on `#include <begin_vertex>` and driven by one shared
  uniform object (`windUniforms`), so everything moves in the same gust.
- Auto quality watches frame time over 2.5 s windows with hysteresis and at most
  two demotions, which is what stops it oscillating.

Measured in headless Chromium on an Apple Silicon MacBook Pro: **100–180 fps** at
`high` in the heaviest regions.

---

## 4. Traps (already bit — do not re-break)

1. **Custom `ShaderMaterial` does not get fog for free.** Three auto-injects the
   *fragment* tonemapping/colorspace pars but **not** fog. The water shader needs
   `#include <fog_pars_vertex>` + `<fog_vertex>` (with `mvPosition` in scope) and
   `#include <fog_pars_fragment>` + `<fog_fragment>`. Without them it fails with
   `'fogNear' : undeclared identifier`.
2. **`PCFSoftShadowMap` is deprecated in three 0.185** and silently downgrades.
   Use `PCFShadowMap`; get quality from map size.
3. **Pointer lock must never leak a rejected promise.** A detached element or a
   headless driver throws `WrongDocumentError`; an unhandled rejection becomes a
   `pageerror` and fails the smoke test. See `requestPointerLock` in `input.ts`.
4. **Camera-relative movement.** The camera *sits at* `(sin yaw, cos yaw)` from
   the player, so screen-forward is the **negation** of that. Getting this wrong
   inverts W/S while leaving A/D correct — easy to miss.
5. **The smoke test must not filter `THREE.` out of console errors.** Deprecation
   notices arrive as *warnings*; filtering errors by that prefix hides real shader
   compile failures.
6. **Vite can cache a parse error.** If the canvas is black but `tsc` passes, look
   for a stale `Pre-transform error` in the dev-server log, then restart it and
   `rm -rf node_modules/.vite`.
7. **A hidden tab freezes the fade overlay.** `FadeIn` advances on `useFrame`. If
   a screenshot is uniformly dark, check `.fade` opacity before blaming the
   lighting — and use `?alwaysRun=1`.
8. **Painted decals z-fight.** The parking-lot lines need `polygonOffset` and a
   small Y lift, or they read as a dark band at grazing angles.
9. **Never depend on an object literal prop in an effect.** Scenes pass
   `spawn={{...}}` and `bounds={{...}}` fresh on every render. Two effects used to
   depend on those identities:
   - `CharacterController`'s spawn effect → any state write teleported the player
     back to the chapter entrance.
   - `SceneKit`'s `WorldSetup` → any state write **cleared every collider and
     interactable in the scene**, so solid things stopped being solid and the
     "Get in" prompt never appeared.
   Both now depend on the primitive values. Watch for this in any new effect.
10. **Gameplay focus is OFF while dialogue is on screen.** The confirm keys
   (E/Space/Enter) must therefore be registered *before* the focus check in
   `input.ts`, or a line can only be dismissed by clicking it.
11. **Doorways need `gap > 2 × body radius`.** The body radius is 0.34, so a
   1.0-wide cottage door left a 0.32 corridor and she jammed in the frame — a
   full progression blocker that debug-teleport tests cannot catch. Walk the
   main path when changing geometry.

---

## 5. Content / personalization

All relationship-specific content is in `src/content/`. **`PERSONALIZE.md` is the
user-facing guide — read it before touching anything there.**

| File | Holds |
|---|---|
| `characters.ts` | both characters' names + appearance, the car, the parking lot |
| `finalMessage.ts` | the birthday message, its pacing, optional photo/voice/song |
| `memories.ts` | the six keepsakes (ids are referenced by saves — do not rename) |
| `dialogue.ts` | every spoken line and inspection thought |
| `constellations.ts` | the three shapes, their points and messages |
| `gameContent.ts` | title, chapter cards, prompts, prose |
| `credits.ts` | credits; `{her}` / `{me}` interpolate the display names |

Current names: **she is `Cheetah`, he is `Peach`**.

---

## 6. Test coverage

**Vitest** — save migration (garbage input, unknown chapters, corrupted and
mismatched checkpoints, array filtering), chapter ordering, progression
requirements, dialogue lookup safety, final-message shape, settings persistence
(corrupt JSON, wrong types, unknown keys).

**Playwright** — title loads; New Game starts and persists; Continue resumes;
debug teleport reaches every chapter with zero console errors and correct save
state; the ending overlay plays through to "I love you." and records completion;
memories unlock and appear in the journal; environment and narrative polish are
captured; idle/walking performance is enforced at every chapter. A separate
production-preview smoke boots the compiled `dist/`, proves a rendered WebGL
frame, validates every release asset and emitted JavaScript chunk, and starts
the cottage without browser errors.

`shots.spec.ts` is a capture pass, not assertions. Use it after any lighting or
art change and actually look at the images.

---

## 7. State of the work

### Done and verified
Title (moonlit night), loading screen, settings, save/migration, pause, journal,
credits, ending overlay, replay/reset. Character, camera, collision, interactions,
gamepad architecture. All eight scenes with their gates. Audio engine. Auto
quality. Launcher. Tests. `PERSONALIZE.md`.

### Interaction audit

`tests/e2e/audit.spec.ts` walks every chapter, pulls the live interactable
registry and collider set out of the runtime, and prints a table per chapter. It
asserts: unique ids (the registry is a `Map`, so a duplicate silently
overwrites), everything inside bounds and on finite ground, radii big enough to
walk into, and — the one that matters — that a radius clears its own prop's
collider (`radius > buriedBy + 0.34` body radius). A second test proves a
re-render never empties the registry.

**Run it after any scene edit.** It is the cheapest way to catch an interaction
that has drifted inside a wall.

### Phase 3 additions

The final scene is now the whole point of the chapter: she walks to the car,
`E` → **Get in**, the door opens and she is seated, then **the camera stays in
the cabin** — her eyeline, him beside her. He speaks (`PEACHY_GREETING`), hands
her a folded note (`THE_NOTE`, rendered as paper), and the camera drifts to the
windshield so the **Jewel** sign fills it while the birthday message plays.

The lot is deliberately bare: one `Stripmall` straight ahead of the car with a
`GlowSign` on its facade, and nothing else.

The lot is deliberately bare: one `Stripmall` with a red `GlowSign` reading
**Jewel**, parked **behind** the car — the car sits nose-out, facing away from
the store, so the sign burns behind the two of them in the closing shot.

Every other chapter got undergrowth to stop it reading as bare ground:
`BushField`, `FernField` and `LogField` in `nature.tsx`, plus `Clutter`,
`Planter`, `Woodpile` and `Guardrail` in `props.tsx`. All instanced, all
respecting the foliage-density setting.

Also: view is **dragged** (hold the mouse button) rather than tracked, the
pointer is never captured; the splash is black and white; the title menu
animates on three co-prime periods instead of one loop.

**Two traps this added:**
- `setChapter('ending')` bumps `sceneEpoch`, which **remounts the scene** — she
  gets thrown out of the car and respawned while the overlay plays over it.
  Completion is recorded by `markEndingComplete()` alone; never change chapter
  during the ending.
- **Never animate `transform` on a clickable element.** `menuDrift` moved the
  menu buttons a couple of pixels forever, so their bounding box never settled
  and Playwright could not click them. Animate light and opacity only.

### Phase 2 additions

Silhouette outside the cottage (`Silhouette` in `props.tsx`, 20 s delay), 10-second
black interstitial between chapters (`transitionToChapter` in the store,
`INTERSTITIAL_LINE` in gameContent), Ty Warner Park hill + lettered sign
(`ParkSign`, canvas-texture lettering, no font asset), lamp glare sprites
(`Glint`), unlocked mouse-look, Shift+~ debug, white sedan, and the approach song
(`APPROACH_SONG`, `public/audio/music/approach.mp3`).

`tests/e2e/phase2.spec.ts` regression-tests the three bugs above plus the real
walked ending.

### Known limitations
- **Playtime is not stopwatch-verified end to end.** The pacing targets are
  designed for, not measured.
- The bundle keeps the full journey eagerly available but uses static
  Rolldown vendor groups so no emitted JavaScript chunk exceeds Vite's default
  500 kB warning threshold.
- **The forest gate requires all five memories** — the strictest gate in the game,
  though they sit on the main path and the guide points at the next one.
- **Controller support is architectural**, not hardware-tested; axis/button
  indices assume a standard mapping.
- **Safari is untested.** Chrome and headless Chromium only.
- The town's three errands keep their intermediate steps in component state, not
  the save file, so reloading mid-errand restarts that errand.

### Highest-value next steps
1. **Play it start to finish with a stopwatch** and tune region sizes to hit ~20
   minutes. This is the only thing that cannot be verified from code.
2. **Write the real message** in `finalMessage.ts` and the six memory lines.
3. **Listen through the parking-lot arrival on speakers and headphones.** The
   automated gate proves APPROACH starts and remains single-instance; only a
   human can approve the emotional balance against the generated score.
