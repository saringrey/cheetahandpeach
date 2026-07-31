# CODEX Polish Log

## Pass: final browser polish — 2026-07-30

### Recovery and scope

- Created and verified before edits:
  `.backups/cheetahbackup-20260730-163300-pre-final-web-polish.tar.gz`
- SHA-256:
  `1deba544f95f7120ff2d3c26d4edc6fe5a9099195a5230658b876520d253891f`
- Verified gzip integrity, 884 entries, required sources, and an extracted
  source hash. Native macOS sources, projects, and release artifacts were
  outside this pass and remained untouched.

### Spawn audio

- Preloads `APPROACH` during the transition chapter and starts it from the
  parking-lot mount effect, before input and separately from the delayed
  0.35-second camera intro.
- Removed song playback from the former near-car trigger. The trigger retains
  its stage transition and chime.
- Added decoded optional-audio caching, keyed in-flight/active deduplication,
  playback-generation invalidation, natural-end callbacks, correct generated
  score duck/restore behavior, and a development-only lifecycle snapshot.
- Browser coverage proves: active at spawn, start count one after crossing the
  old trigger, one fresh start on Replay Ending, no late start after Return to
  Title, and a generated-score fallback when optional decode fails.
- `/Users/grey/Music/parkinglot.mp3`, the shipped asset, and packaged asset
  share SHA-256
  `f8aa840197217e4a4314c4cf08c7f55c463acbd728c354037c3d94000b382301`.

### Artwork and memories

- Copied the supplied three sketches into public assets without modifying the
  originals and replaced the three built-in sketchbook pages.
- Added the supplied childhood photograph to both the required journal entry
  and ending keepsake, with descriptive alternate text and portrait-safe
  layout.
- Added named paper-star hints, slightly larger pickup radii, stronger halos,
  and a modestly larger memento presentation. Positions, IDs, save format,
  progression, controls, gates, and replay behavior are unchanged.
- Browser checks cover all three natural image dimensions, portrait and
  landscape viewport containment, 44 px controls, journal/ending image
  rendering, and the real in-world photograph prompt.

### Build and verification

- Added the requested Rolldown groups with strict execution order. The default
  500 kB warning threshold was not raised.
- Production emits eight JavaScript chunks; the largest is 375,462 bytes. The
  old chunk warning is gone.
- Canonical verification passed: TypeScript; 74/74 unit tests across 15 files;
  lint with zero errors and 72 existing warnings; production dependency audit
  with zero vulnerabilities; production build; one production-preview WebGL
  gate; and 31/31 grouped Playwright cases.
- Performance gate passed at 60 FPS / 16.7 ms, idle and walking, in all seven
  chapters. Every production JavaScript chunk and release-critical asset
  returned HTTP 200 with the expected MIME type, and the page/console error
  collectors remained empty.
- Final browser directory:
  `releases/web/cheetah-and-peach-web-20260730-final-polish/`
- Final browser archive:
  `releases/web/cheetah-and-peach-web-20260730-final-polish.tar.gz`
- Archive SHA-256:
  `9aff03776478e241ed4b1ee36cd6d2d877a00b7dccfed8063be128c8156034cd`

### Human-only signoff

- Automated state proves correct start timing and lifecycle, but a person still
  needs to approve the audible mix on speakers/headphones.
- One uninterrupted no-debug cottage-to-ending playthrough remains the final
  experiential check.

## Pass: dark moonlight and volumetric atmosphere — 2026-07-30

### Recovery

- Created and verified before edits:
  `.backups/cheetahbackup-20260730-105030-pre-moonlit-grade.tar.gz`
- SHA-256:
  `f13575cf1f7de455ba44a0f62f3a9e6a60216f2a404a25d78155a2d4ef23cc5f`
- 76,959,167 bytes and 798 entries. Excludes generated dependencies, prior
  backups, saved releases, and test output.

### Visual result

- Regraded every authored chapter for blue-black moonlight, lower saturation,
  deeper fog, silver key light, bounded ambient bounce, and isolated warm
  practicals.
- Added an analytic moon disk/halo to the sky, shared height fog, one instanced
  ray-marched mist volume, screen-space slanted beams, and authored cone shafts.
  These are bounded illusions rather than a costly scene-wide volumetric
  renderer.
- Replaced the clipping linear contrast stage with one filmic toe/shoulder
  effect. Near-black forest detail survives while pale walls and fog stay down;
  the replacement does not add a fullscreen post pass.
- Reworked cottage material values and four local lights. The final bedroom
  capture is 16% lower in average luminance than the first moon pass while its
  furniture, floor seams, character, and doorway remain readable.

### Verification and artifacts

- TypeScript: pass.
- Unit tests: 69/69 across 14 files.
- Lint: exit 0; existing hook/Fast Refresh warning categories, no errors.
- Production build: pass, 1,878.97 kB JS / 589.95 kB gzip.
- Targeted WebGL/browser regression: 9/9 pass.
- Visual all-biome capture: pass.
- Performance: 60 fps idle and walking in all seven playable chapters at
  1512×900 Auto/medium.
- Native: exact packaged web parity, protocol/document/Metal/WebGL/capture
  health, stable startup, and clean main/helper shutdown pass.
- Saved web build:
  `releases/web/cheetah-and-peach-web-20260730-moonlit-metal/`
- Native app:
  `releases/native/The Cheetah & The Peach.app`

## Pass: indie-showcase atmosphere and feel — 2026-07-30

### Safety and launch

- Created and verified before edits:
  `.backups/showcase-polish-pre-20260730-042635.tar.gz`
- SHA-256:
  `9c72a1aae260516d0ce1f587f05922b57c16e71dd4bc464606e78582082235b5`
- 17 MB, 201 entries. Excludes `.backups`, `node_modules`, `dist`,
  `test-results`, `playwright-report` and `coverage`.
- Created:
  `/Users/grey/Desktop/Play The Cheetah & The Peach.command`
- The launcher now resolves Finder/Desktop symlinks, detects incomplete
  dependencies and stale builds, chooses a free port without killing another
  process, falls back to live Vite on build failure, logs to `/tmp`, and traps
  Terminal close/signals so the server and its children do not linger.

### Perceived-quality result

- The grade is now chapter-authored. Exposure eases toward each palette while
  vignette, contrast, saturation and bloom remain part of the same visual
  language. The previously crushed forest, descent and asphalt retain readable
  ground and silhouettes without turning night into day.
- Follow framing is closer and more responsive: a small velocity-weighted lead
  acknowledges direction, running pulls the camera in instead of away, and each
  chapter has an intentional distance/look height. All motion respects both
  reduced-motion settings and remains ref-driven.
- The mountain gives control back with the camera near eye level, leaving the
  supercell as a looming horizon landmark. Its heat-lightning core is
  tone-mapped and restrained, so it reads as light inside mass rather than
  stacked white decals.
- Light glints now measure camera distance in world space and clone only the
  small sprite material whose opacity they animate. One matching lamp can no
  longer control every other lamp's pulse.
- The final transition's last guardrail stays consistently right of the road.
  Distant reality windows use the shared fog-aware storybook material, which
  restores depth and removes floating bright rectangles.
- The parking-lot arrival uses the same light count but better placement: one
  warm pool reveals Cheetah without putting a pole through the frame; one
  practical gives the white sedan a restrained readable rim.
- Peach's conversation camera moved one handspan back, aims lower and widens
  slightly. Shoulders, dash and road remain in the shot. Dome intensity fell
  from 0.48 to 0.32 and the skin rim from 0.34 to 0.24; facial shape now survives
  the warm cabin light.
- Cheetah gained an irregular blink. Peach's existing slow breath, long road
  glances and gradual warmth were deliberately left alone.

### Sound and input

- Sparse birds, chimes and environmental rustle now occupy restrained stereo
  positions. Transition cars pan across the distant road.
- Parking traffic owns its sound. Random phantom passes were removed, and each
  visible car begins its stereo pass 18 m before center so picture and sound
  cross together.
- Authored score now has a child bus separate from personal music. Optional
  media is keyed, replaced rather than stacked, disconnected on end and stopped
  by `stopAll()`. Ending intensity is selected atomically with its cue.
- Gamepad look is angular velocity integrated with capped frame time, producing
  the same one-second travel at 30, 60 and 120 Hz. Gamepad A advances dialogue
  while gameplay focus is intentionally disabled. Blur and `clear()` drop every
  held/transient edge.

### Visual evidence and verification

- Regenerated all ten regional screenshots after the title focus pull settles,
  with the debug panel closed. The ending capture waits until its second text
  group's blur resolves.
- Added `polish-mountain-settled.png` to record the real gameplay handoff, not
  only the cinematic storm reveal.
- TypeScript: pass.
- Unit: 58/58 across 11 files.
- Lint: exits 0 with the existing hook/Fast Refresh warning categories; no
  errors.
- Production build: pass, 1,803.11 kB / 566.03 kB gzip.
- Full WebGL-safe browser verifier: 28/28 cases pass.
- Desktop launcher smoke: production rebuild, HTTP readiness and signal cleanup
  pass; no child process or listener remained.
- Performance probe at high quality: approximately 120 fps / 8.3 ms in all
  seven playable chapters, idle and walking.
- Browser console remains free of errors. Development still reports the known
  upstream `THREE.Clock` deprecation warning.

## Pass: final narrative and emotional polish — 2026-07-30

### Safety snapshot

- Created and verified before edits:
  `.backups/narrative-emotional-polish-pre-20260729-231834.tar.gz`
- SHA-256:
  `669b7dc97e1515e415ff5058ec9343c6a2c8bfaacf468ba9b9b186ad83d0932d`
- 15 MB, 192 entries. Excludes `.backups`, `node_modules`, `dist`,
  `test-results`, `playwright-report` and `coverage`.

### Narrative result

- The descent is now a ~310 m earned walk rather than a short connector. A
  dense early forest of pines, broadleaf trees and clustered pale birches
  gradually opens into roadside trees, fences, guardrails, telegraph wires,
  electric lamps and low buildings. Ground treatment changes by world position,
  so the landscape does not repaint itself behind the player.
- The mountain opens on a full supercell silhouette: low shelf, rising tower,
  broad anvil and smaller illuminated cores. Heat lightning is two internal
  pulses, never a bolt or white-screen strobe. Thunder arrives 3.2–6 s later and
  roughly one flash in three remains silent.
- The storm is one instanced mass in three draw calls. It computes instance
  bounds for ordinary frustum culling, owns a real scene-graph target for its
  flash light, and disconnects every synthesized one-shot output after its tail.
- The final transition is a 1.2 s dissolve with no prose card. Control remains
  held through the destination scene's 1.4 s fade-in; scene-local music
  intensity cannot leak into the next cue.
- The late-night JEWEL lot now has immediate traffic, sparse parked vehicles,
  varied head/tail lamps, independent cart motion, reflective repair/sheens,
  drifting newspaper, rooftop equipment plus an HVAC drone, litter, moths and
  the pre-existing storefront life.
- Arrival begins left of and 8–16 m from the driver door, diagonally facing it.
  The real movement vector and camera view both point at the car.
- The sit-down finishes in Cheetah's left-hand driver-seat eye line. Removing
  the duplicate seated Cheetah mesh fixed the old invisible back-seat framing.
  Peach remains across the cabin and now breathes, blinks, shifts, looks toward
  traffic, turns gradually and settles into a small smile.
- The conversation opens exactly with **“I’m sorry it took me so long.”** after
  the 5.2 s entry, 6.2 s of quiet and at least one visible passing car. All four
  lines remain player-paced. The written ending cannot begin until dialogue is
  closed and another car passes.

### Rendering and React stability

- Transition terrain/vegetation colors are spatial and stable. React still
  samples progress at a bounded cadence for sky/fog/music, but no longer builds
  hundreds of cached material variants while walking.
- `TreeField`, `GrassField`, `BushField` and `AtmosphericBeams` no longer put
  changing material identities in R3F constructor args. Palette changes update
  the material prop without reconstructing an `InstancedMesh` and wiping its
  matrices.
- Parking traffic, Peach performance, carts, storm lightning and weather audio
  mutate refs/nodes rather than writing React state per frame.

### Verification

- TypeScript: pass.
- Vitest: **52/52** across 10 files.
- Oxlint: exit 0; existing warning categories only.
- Production build: pass; existing large-chunk advisory remains.
- Reachability: 36 required interactions across all 7 playable chapters pass.
- Browser: all **28 Playwright cases pass** when run in WebGL-safe groups.
- Natural keyboard movement succeeds after real transitions into Town, Forest,
  Crossing, Mountain, Transition and Parking Lot.
- Real ending test passes: walk to car, driver-side entry, four-line dialogue,
  traffic gate, note, complete message and windshield callback.
- Performance probe remains ~120 fps / 8.3 ms at 1512×900 in all chapters.
- Inspected captures:
  `shots/polish-mountain-storm.png`,
  `shots/polish-descent-fantasy.png`,
  `shots/polish-descent-middle.png`,
  `shots/polish-descent-reality.png`,
  `shots/polish-parking-arrival.png`, and
  `shots/polish-interior-conversation.png`.

### Workflow note

A single 28-case Chromium process eventually retained enough WebGL resources to
make timers and screenshots crawl into false timeouts. Every affected case
passed immediately in a fresh browser. `scripts/verify-project.sh` now restarts
the browser between core, narrative, probe and capture groups while preserving
all coverage.

## Safety snapshot

- Created before source edits: `.backups/cheetahbackup-20260729-172619.tar.gz`
- SHA-256: `566587b524f2273eb621a9a7d7eb7893814f94786dd73021683c08b9dd62def4`
- Archive listing and gzip integrity verified before implementation.
- Exclusions match project backup convention: `.backups`, `node_modules`, `dist`, `test-results`.

## Baseline

- TypeScript: pass.
- Lint: exit 0 with existing React hook/Fast Refresh warnings.
- Unit: 21/21 pass.
- Production build: pass; existing large-chunk advisory.
- Playwright: 16 direct passes plus one first-attempt parking-lot movement miss that passed on retry.
- Parking-lot performance probe: about 120 FPS / 8.3 ms on the local Playwright Chromium fallback.
- Baseline ending defects reproduced:
  - `Get in` target registered on the passenger side.
  - Fixed timers opened the note while player dialogue remained active.
  - Exterior car was already occupied.
  - Store/road/car geography and late-night palette did not match the approved composition.

## Implemented

- Rebuilt the continuous parking-lot ending around explicit geography:
  - closed `JEWEL` storefront behind the car;
  - white sedan facing away toward the visible road;
  - stable lamps, curbs, faded bays, asphalt repair variation, planted islands, cart corral/carts, roof HVAC, bollards, shrubs, distant silhouettes, and sparse litter.
- Added fixed-pool road traffic with shared geometry/materials, varied silhouettes/speed/direction/gaps, emissive head/tail lights, and synchronized restrained traffic-pass audio.
- Re-staged the memory:
  - exterior car empty;
  - driver-side entry;
  - Cheetah drives;
  - Peach appears passenger-side only after the cabin transition;
  - player-paced four-line conversation;
  - note/message gated by dialogue closure and two traffic passes;
  - explicit transient stages and tracked timer/control cleanup.
- Upgraded cabin with fitted seats, steering wheel, instruments, console, selector, cup wells, mirror/charm, dashboard peach, side glass/trim, instrument glow, road view, and reversed `JEWEL` reflection.
- Added editable `CAR_MEMORY` configuration and backward-compatible `Car.driverDoorOpen`, `Stripmall.closed`, and `Streetlight.flicker` props.
- Added synthesized `audio.trafficPass()` with a two-voice cap and cleanup.
- Restored completed-save `Replay Ending` on title while preserving progress and save schema/version/key.
- Removed deprecated soft-shadow startup mode and cleaned worker object URLs/WebGL context listeners.
- Polished first-five-minute cottage presentation with instanced floorboards, wall trim, beams, door/window depth, furniture, personal objects, layered lighting, reduced-motion-aware dust, and porch lantern.
- Replaced blind ending movement automation with real keyboard walking steered toward the registered debug-only target bearing.

## Verification added

- Driver-seat/door configuration and parking geography contracts.
- Player-paced conversation and two-traffic-pass message gate.
- Valid v1/v2/v3 completed saves and malformed saves.
- Replay Ending progress preservation, checkpoint clearing, title return cleanup, and Reset Progress.
- Renderer boot without deprecated `PCFSoftShadowMap`.
- Desktop ending captures for exterior, prompt, conversation, note, message, and completion.

## Known advisories

- Three.js currently logs `THREE.Clock` deprecation from the renderer stack during development; no game-owned `THREE.Clock` construction was found.
- Production bundle still triggers the pre-existing Vite large-chunk advisory. Dependency/code-splitting work is intentionally outside this polish pass.
- Final full-suite, mobile, performance, visual-fidelity, and backup-diff results are appended after the final gate.

---

# Pass: navigation, atmosphere and set dressing

Backup taken before this pass:
`.backups/cheetahbackup2-20260729-192533.tar.gz`
SHA-256 `29912cbdfb8a1655b076d20def551a5782be9be01495fc42b40a27284b9992c4`
Verified by extracting the archive and comparing its `src` file count (70) against
the workspace (70).

## Items closed from PROJECT_STATUS_AND_ISSUES.md

### 1. Windshield callback pass counting (was issue #2)

Counting is now armed separately from the camera move. Entering the callback
clears every in-flight vehicle and stops spawning; once the 1.8 s windshield
move plus a 0.42 s settle has elapsed, the pass baseline is taken *then* and a
single car is dispatched from a shortened 30 m run-up. Previously a car that was
already halfway across the frame when the callback began could be counted as
"the" pass, ending the shot before the camera had arrived.

The 14 s renderer-safety fallback is unchanged and deliberately so: the real
callback budget is ~10.4 s, and raising the fallback only delays the ending for
anyone whose renderer *did* stall — including the debug entry point, which has no
parking scene to drive the callback and therefore always waits the timer out.
Raising it to 18 s during this pass broke the ending smoke test's budget, which
is how that was established.

### 3. Atmospheric shafts (was issue #3)

`AtmosphericBeams` were already built in view space and needed no billboarding.
The genuine defect was `LightShafts` in `nature.tsx`: a flat `glow()` cone that
read as translucent plastic. It now uses a shader whose alpha rises with
`|dot(normal, viewDir)|` — bright where you look through the belly of the cone,
gone at the silhouette edge, which is the opposite of a fresnel rim and is what
erases the outline from every angle. A cone is rotationally symmetric, so no
billboarding is required.

Separately, the beams were fading only over their top quarter, which left bright
columns standing up into the sky and reading as rendering artefacts. The fade now
starts at 22% and they are shorter (7–13 m, from 11–22 m).

### 5. Performance remeasured

Production-preview probe, 1512×900, real rAF, idle and walking:

| Chapter | idle | walking | colliders |
|---|---|---|---|
| cottage | 120.1 fps / 8.3 ms | 121.0 fps / 8.3 ms | 130 |
| town | 119.7 / 8.4 | 119.9 / 8.3 | 138 |
| forest | 120.1 / 8.3 | 119.9 / 8.3 | 409 |
| crossing | 120.1 / 8.3 | 119.9 / 8.3 | 54 |
| mountain | 119.9 / 8.3 | 121.2 / 8.3 | 149 |
| transition | 119.8 / 8.3 | 120.1 / 8.3 | 175 |
| parkingLot | 121.3 / 8.2 | 119.9 / 8.3 | 25 |

No regression from the ~120 fps / 8.3 ms baseline after every addition below.
Collider counts rose as expected where solid props were added.

## Added

### The paper star (navigation)

The game's only navigation aid, and the answer to "add a HUD to help the player
find their way around, and a Quest item to push the player in the right
direction".

- `Q` (gamepad X) holds the star up for 12 seconds. That lights the guide wisps
  at once instead of waiting out the idle timer, and makes the corner dial name
  the current objective and turn its needle toward it.
- Unlit it is a faint mark and a key cap in the bottom-left corner.
- `runtime.objectiveLabel` and `runtime.questGuideSeconds` carry the data;
  `useObjective(point, label)` sets both. Every chapter now supplies a label in
  the game's voice ("the lamp on the hill", "something remembered").
- `Compass.tsx` samples `runtime` at 6 Hz rather than subscribing, because
  bearing and distance are per-frame mutable state that must never re-render
  React. Nothing in it writes to `runtime`.
- Settings → *Paper star compass* switches it off entirely. The idle-triggered
  wisps behave exactly as before either way.

### Ty Warner Hill is now the way out of town

Lanterns pace the climb and light with the third kindness. One street lamp — the
last electric light before the trees — stands on the summit with a bench beside
it facing back down at the square she just lit (`hill-bench`, added to the
audit's required interactions). The chapter exit sits a few paces past the lamp
on the far shoulder, and the "third kindness" cinematic now pans up the hill to
it rather than at the old north-east path.

### Menu constellations

The three shapes she draws at the overlook, hung over the title screen, reusing
`CONSTELLATIONS` point data directly so editing a shape updates both places. One
inline SVG, 46 scattered field stars, CSS twinkle — no per-frame cost. The title
palette was darkened further (ground and foliage much harder than the sky) with
the horizon deliberately left lifted, because a visible skyline is what keeps
"dark" from becoming "off".

### Set dressing

Three new shared props, each one or two draw calls: `StringLights` (a sagging
catenary of instanced bulbs), `Well`, `Signpost` (canvas lettering, same
no-font-asset trick as `ParkSign`), and `TelegraphPole` (wired to its neighbour).

Placed:

- **Cottage bedroom** — wardrobe, two shelves with books, a chair pulled out from
  the desk, a wash stand with basin, pitcher and towel, a folded quilt, candle
  stub, wardrobe handles. Three new colliders, all flush to the walls so the
  route from the bed to the door is unchanged.
- **Town** — bunting strung in a triangle across the square, a well for the
  benches to face, a fingerpost at the road, five more clutter piles, three more
  planters, two more benches; and a dressed western approach (fence lines either
  side of the road, two lanterns, a "Lantern Town" sign) because she arrives at
  x ≈ -36 and used to face forty metres of empty ground.
- **Forest** — twelve lanterns hung unevenly along the main path. With 340 trees
  and a moonlit palette the floor was legible only as darkness.
- **Crossing** — piles under the east jetty deck (it had none), four mooring
  posts, an upturned rowing boat, crates and lanterns on both shores.
- **Mountain** — four more cairns, six lanterns down the switchbacks, a lantern
  at the trailhead itself, rope handrails on the two tightest bends, a second set
  of wind chimes.
- **Transition** — seven wired telegraph poles down the real half of the road,
  three more distant building silhouettes, two milestones, two benches, a
  signpost, a guardrail, crates.
- **Parking lot** — three more streetlights, three loose carts, four clutter
  piles, and two runs of shopfront bulbs (one dead).

## Fixed while looking at the captures

Each of these was found by rendering the game and looking at it, not by a test.

- **The cottage bedroom was black.** All that furniture was already there and
  none of it read. Lifting the practicals then blew the room out into warm
  daylight, which is worse. What works: one ceiling pool that falls off inside
  the room, a small fill that just picks the wardrobe out of the shadow, and no
  floor bounce at all — a light under her feet reads as a spotlight, not as
  light.
- **A washing line was removed rather than fixed.** Suspended cloth that small,
  lit from below and seen against a wall behind it, reads as paint strokes on the
  plaster however wide the slabs are made. A prop that reads as a mistake is
  worse than an empty corner; deliberately not replaced.
- **The volumetric mist saturated into a flat band.** Per-billboard alpha was
  scaled by 9× to compensate for the raymarched falloff, but puffs overlap
  several deep, so it accumulated into an opaque wall that out-glowed the sky —
  the exact 2D artefact the raymarching was written to remove. Now capped at 0.42
  authored and 0.5 in the shader, and the forest tints its mist toward its own
  fog instead of its brighter ambient teal.
- **The mountain was a black hole.** Fog near-plane pushed 52 → 78 m, ambient
  0.32 → 0.52 and sun 0.32 → 0.46, because moonlight is the only modelling light
  up there and below ~0.45 the cliffs stop being shapes. Trees are now kept 9 m
  clear of the trailhead — a canopy four metres from the spawn filled a third of
  the opening frame.
- **A shopping cart dominated the last chapter's opening frame.** Moved from
  (-6.2, 4.8) to (-15.2, 6.4).
- **The capture suite hid the game.** `shots.spec.ts` left the debug panel open
  over the left third of every screenshot; it now closes it around each jump. Its
  timeout was also raised to 600 s, because `?alwaysRun=1` drives frames from a
  worker at 16 ms and capture competes with rendering for the main thread.

## Controls

`Q` is documented in the pause menu and in the README, alongside a short
explanation that the star is optional and can be switched off.

## Final gate

One dedicated Vite dev server on port 5197, started by hand; one Playwright
owner; whole suite in a single run.

```
25 passed (13.9m)
```

- TypeScript: pass.
- Unit: 46/46 across 8 files.
- Lint: exits 0, 68 pre-existing warnings, no errors.
- Build: pass, 1,536.03 kB / 455.38 kB gzip.
- `probe-move`: the player moves after a real (non-teleport) transition into
  every chapter — town, forest, crossing, mountain, transition, parking lot.
- `probe-perf`: ~120 fps / 8.3 ms per chapter, idle and walking.
- `audit`: 36 required interactions across 7 chapters, all registered, in bounds,
  on finite ground and reachable; a re-render never empties the registry.
- Backup diffed after the pass: 27 modified source files, 2 new (`Compass.tsx`,
  `MenuConstellations.tsx`), 3 test files, 2 docs. Nothing unintended.

Remaining: one uninterrupted hand playthrough, cottage to ending, without debug
teleporting. Every gate is proven individually; nobody has yet walked the whole
thing in one sitting, and that needs a person rather than a test.

---

# Pass: compass strip, living plants, and the figure that never showed

## The silhouette was invisible, for two reasons

Reported as "the silhouette figure isn't showing up for me". Both causes were
real and independent.

1. **It was black on black.** `#05050a`, unlit, `MeshBasicMaterial`. That was the
   original art direction and it worked when the chapters were brighter; once
   everything went properly moonlit there was nothing left for near-black to be
   darker *than*. It now carries a cool fresnel rim — a thin cold edge where the
   surface turns away from the camera, which is what moonlight does to a person
   standing in the dark. The interior stays absolutely featureless, so it still
   reads as an absence rather than a body.
2. **It appeared behind her back.** It stood at a fixed spot beside the cottage
   door and became present twenty seconds after the reveal cinematic — by which
   time the player has almost always walked well east down the road. The beat
   played to an empty yard. Its position is now chosen at the moment it appears,
   nine metres ahead of her along the road and turned to face her. The twenty
   second wait is unchanged; it was asked for and it is right.

## The compass strip

Replaces the corner dial with a shallow band across the top of the screen. A
strip rather than a dial because a strip maps directly onto what the player can
see: a marker a third of the way across the band is a third of the way across the
view, with nothing to translate.

- **Home** is always shown and always called Home. Every objective in the game is
  a step back toward the same place, and naming them all that way is the point
  rather than a shortcut. The scene's own phrase for it — "the lamp on the hill",
  "something remembered" — rides underneath while the star is lit.
- **Durk** appears on the strip only while the star is lit, which is the answer to
  "add a hint to show where Durk is in each biome". He still has no marker,
  prompt, collider or gameplay effect; the `Durk` component now writes one vector
  to `runtime.durkPosition` on mount and clears it on unmount.
- Markers past either end pin just inside the band and dim, so "behind you and to
  the left" still reads as a direction to turn. Near an end the label grows
  inward, because otherwise the band's fade mask clips it — which is how "Home"
  became "Hom" in the first capture.
- Samples `runtime` at 12 Hz rather than subscribing. Bearings are per-frame
  mutable state that must never re-render React.

Covered by `tests/e2e/compass.spec.ts`: the strip renders, Home is named and has a
distance, Durk is registered by the region and hidden until the star is lit, the
note appears with it, and the whole thing disappears when switched off.

## Mushrooms that wake, flowers that open

Both are per-instance and proximity-driven from `runtime.playerPos` inside
`useFrame`, with no React state anywhere near them.

- **Mushrooms** grow an additive halo as she comes within 4.2 m, brightest right
  beside her. Instances of one mesh share a material, so per-mushroom brightness
  cannot come from a uniform — it has to be geometry, and scaling a halo per
  instance is free because it is a matrix write already being done. Each breathes
  on its own phase so a patch shimmers rather than pulses; they rise quickly and
  fade slowly, so a walk leaves a trail lit behind her.
- Mushrooms were only ever in the forest. There are now two forest patches (one
  sparse along the path, one dense around the mother-tree), a scatter in the
  cottage yard — the earliest point the game can show her that the world answers
  to her being in it — and a damp patch on the crossing's west shore.
- **Flowers** open on approach within 3.4 m: closed flowers are a small tight bud,
  open ones wider than tall. The authored `bloom` value is still the floor, so
  memory reactions that open a whole field at once are unaffected; this adds on
  top of it.
- Each flower plays a four-note pentatonic figure the first time it opens, picked
  from a set of four so a meadow sounds like a phrase being played rather than one
  chime repeating. Rate-limited to one jingle per 0.85 s: a dense patch crosses
  dozens of thresholds in a single frame, and unlimited that is a chord, not a
  phrase. They re-arm once fully closed, so walking back through plays again.

## An area light on the menu cottage

A `RectAreaLight` matched to the size and rotation of the cottage's lit front
wall, plus a dimmer one lying flat to catch the grass — `RectAreaLight` is
one-sided, so the downward spill has to be its own light. Neither casts shadows,
which is exactly what is wanted: soft light with no hard edges at no shadow-map
cost. `RectAreaLightUniformsLib.init()` runs once at module scope; without it the
lights render nothing at all.

Its intensity is radiance multiplied by emitter area, not an arbitrary scale, so
the numbers are far smaller than the point lights beside them. The first attempt
used 26 on an 8 m² rectangle and turned the whole front wall into a blown-out
white panel; 2.1 gives the wash it was for.

## Consolidated settings

Nineteen rows in four groups, needing a scroll to reach the accessibility
settings — which is backwards, since those are the ones people actively look for.

- **Picture** — quality, bloom, fullscreen, with resolution/shadows/foliage/
  particles folded behind *Fine tuning*. The Quality preset already drives all
  four; they belong out of the way of everyone who is not chasing frames.
- **Sound** — master, with music/ambience/effects folded behind *Balance*.
- **Playing** — look sensitivity, invert, interact press/hold, compass.
- **Comfort** — text size, both motion toggles, high-contrast prompts. The two
  motion settings used to sit in different groups purely because one is a camera
  setting and one is a world setting, a distinction nobody looking for "make it
  move less" cares about.

Thirteen visible rows, seven folded.

## Gate

One dedicated Vite server on 5197, one Playwright owner, whole suite in one run.

```
27 passed (14.2m)
```

Two new cases (`compass.spec.ts`). Typecheck clean, 46/46 unit, lint exits 0 with
the same 68 pre-existing warnings, build 1,788.50 kB / 561.76 kB gzip — up from
1,536 kB, which is the `RectAreaLight` BRDF lookup tables being pulled in.

Frame cost after everything, idle and walking, 1512×900:

| Chapter | idle | walking | colliders |
|---|---|---|---|
| cottage | 120.1 / 8.3 | 119.8 / 8.3 | 130 |
| town | 120.2 / 8.3 | 119.9 / 8.3 | 143 |
| forest | 119.8 / 8.3 | 120.7 / 8.3 | 409 |
| crossing | 119.9 / 8.3 | 120.0 / 8.3 | 54 |
| mountain | 119.9 / 8.3 | 121.0 / 8.3 | 151 |
| transition | 119.9 / 8.3 | 120.1 / 8.3 | 175 |
| parkingLot | 119.9 / 8.3 | 119.8 / 8.3 | 25 |

The per-instance proximity work (two `Float32Array` passes per mushroom and
flower field per frame) costs nothing measurable, which is the whole reason it
lives outside React.
