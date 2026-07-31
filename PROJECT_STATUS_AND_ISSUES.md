# Project Status, Issues, and Remaining Work

Last updated: 2026-07-30 18:26 CDT

This is the working handoff for the final browser polish pass. It records what
is implemented, what has been verified, and the two human-only checks that
remain before the showcase. Native macOS files were explicitly out of scope and
were not rebuilt or edited.

## Safety and recovery

- Final browser-polish backup:
  `.backups/cheetahbackup-20260730-163300-pre-final-web-polish.tar.gz`
- SHA-256:
  `1deba544f95f7120ff2d3c26d4edc6fe5a9099195a5230658b876520d253891f`
- Verified before edits: gzip integrity, 884 archive entries, required source
  files present, and an extracted `audio.ts` hash matching the live source.
  Generated dependencies, earlier backups, `dist`, releases, browser output,
  and native build caches were excluded by design.
- Current moonlit-grade backup:
  `.backups/cheetahbackup-20260730-105030-pre-moonlit-grade.tar.gz`
- SHA-256:
  `f13575cf1f7de455ba44a0f62f3a9e6a60216f2a404a25d78155a2d4ef23cc5f`
- Verified before edits: gzip integrity, archive listing, 76,959,167 bytes,
  798 entries.
- Current pass backup:
  `.backups/cheetahbackup-20260730-093724-pre-stars-subtitles-trees-native.tar.gz`
- SHA-256:
  `f4749e83a76781d44b3d6a462b3e726ca5ecc4c60f1eb984ce560339e6e0182b`
- Verified before edits: gzip integrity, archive listing, 127,511,662 bytes.
- Latest pre-showcase backup:
  `.backups/showcase-polish-pre-20260730-042635.tar.gz`
- SHA-256:
  `9c72a1aae260516d0ce1f587f05922b57c16e71dd4bc464606e78582082235b5`
- Verified before source edits: gzip integrity, extraction listing, 201 archive
  entries, 17 MB. It excludes generated/dependency folders by design.
- Latest pre-change backup:
  `.backups/narrative-emotional-polish-pre-20260729-231834.tar.gz`
- SHA-256:
  `669b7dc97e1515e415ff5058ec9343c6a2c8bfaacf468ba9b9b186ad83d0932d`
- Verified before source edits: gzip integrity, extraction, 192 archive entries,
  15 MB. It excludes generated/dependency folders by design.
- Previous pre-change backup:
  `.backups/cheetahbackup2-20260729-192533.tar.gz`
  (`29912cbdfb8a1655b076d20def551a5782be9be01495fc42b40a27284b9992c4`)
- Earlier pre-change backup:
  `.backups/cheetahbackup-20260729-181739.tar.gz`
  (`5b48b9f5de37c6089e93ab808c1ccdcf061a20942732f57855e797cadbc96669`)
- Archive listing and checksum were verified before this round of edits.
- Excluded from the archive by design:
  `.backups`, `node_modules`, `dist`, and `test-results`.
- Earlier backup:
  `.backups/cheetahbackup-20260729-172619.tar.gz`
- Save compatibility remains unchanged:
  `SAVE_VERSION = 3`, key `cheetah-peach.save.v1`.

## Current state

The project remains a React + React Three Fiber continuous browser game.
Movement, interaction registration, camera direction, collisions, audio,
chapter routing, persistence, journal data, and debug tooling still use the
existing architecture. No mobile version is being targeted.

Current local verification:

- TypeScript: pass.
- Unit tests: 74/74 pass across 15 files.
- Lint: exits 0 with exactly 72 existing hook-dependency/Fast Refresh
  advisories and no errors; this pass added no new warning.
- Dependency audit: 0 vulnerabilities across 189 production dependencies.
- Production build: pass with eight cacheable JavaScript chunks, no Vite
  chunk-size warning, and a largest chunk of 375.46 kB.
- Production-preview browser gate: pass. Title, New Game, WebGL readiness,
  every release asset, every emitted/preloaded JavaScript chunk, MIME type,
  HTTP response, and the 500 kB regression ceiling were verified.
- Fresh-state interaction audit: all 36 required interactions across 7 playable
  chapters registered, in bounds, on finite ground, and reachable — including the
  new `hill-bench` at the Ty Warner summit.
- Performance probe: 60 FPS / 16.7 ms in every chapter, idle and walking, at
  1512×900; the automated floor is 55 FPS / 22 ms.
- Desktop shortcut smoke: pass. It rebuilt the current production output,
  served HTTP on the first free port, and left no Vite child or listening port
  after Control-C.
- Browser coverage: all 31 grouped Playwright release cases pass, including the
  new five-case parking-lot audio lifecycle gate, responsive sketchbook checks,
  photograph checks, environment/subtitle gate, and menu gate. The canonical
  verifier restarts Chromium at WebGL-safe boundaries to avoid macOS GPU-context
  accumulation.

### Final browser polish: spawn audio, mementos, artwork, and clean chunks

- `APPROACH` preloads during the preceding descent and starts from the
  parking-lot scene-entry effect, before input and independently of the delayed
  0.35-second camera move.
- The old near-car trigger now changes stage and plays its chime only. Keyed
  active/in-flight deduplication keeps the first arrival at one start, Replay
  Ending creates exactly one fresh start, and Return to Title invalidates any
  late fetch/decode result.
- The generated parking score starts even if the optional MP3 fails. It ducks
  only after the song starts successfully and restores the correct
  exterior/interior level on failure or natural completion.
- The supplied `parkinglot.mp3`, shipped `approach.mp3`, and packaged asset are
  byte-identical:
  `f8aa840197217e4a4314c4cf08c7f55c463acbd728c354037c3d94000b382301`.
- The three supplied sketches replace the built-in sketchbook pages. The
  supplied childhood photograph appears in both the required journal memento
  and the ending keepsake, with descriptive alternate text and viewport-safe
  presentation.
- Required memories keep their positions, IDs, save semantics, and ending
  gates, but now have named paper-star hints, a 2.8 m pickup radius, clearer
  halos, and a modestly larger presentation. No permanent objective marker was
  added.
- The exact requested Rolldown static groups preserve execution order and
  produce eight chunks. The default 500 kB Vite warning remains enabled as a
  regression guard; the largest emitted chunk is 375,462 bytes.
- Final browser release:
  `releases/web/cheetah-and-peach-web-20260730-final-polish/`
- Browser archive:
  `releases/web/cheetah-and-peach-web-20260730-final-polish.tar.gz`
- Archive SHA-256:
  `9aff03776478e241ed4b1ee36cd6d2d877a00b7dccfed8063be128c8156034cd`

### Stars, trees, subtitles, and exact native port

- Moved the title constellations out of the menu DOM and into the 3D sky as
  actual world geometry.
- Increased tree candidates across every tree-bearing scene while widening
  authored travel corridors.
- Imported five selected CC0 Quaternius tree models and textures from the
  supplied pack. They replace a sampled subset of procedural trees through
  shared instancing, so density does not become per-tree component churn.
- Centered dialogue in the viewport and added a translucent panel with animated
  white perimeter frames.
- Replaced the black WKWebView release host with a Chromium/ANGLE Metal host
  that packages the exact canonical `dist/` files. It does not port or fork
  game code.
- Added renderer diagnostics, a stable secure local protocol, one-shot renderer
  recovery, launch capture, native logging, and complete helper cleanup.
- Reduced idle title cost with a 20 Hz 3D cadence, static settled text glow,
  compositor-only menu breathing, and 20 Hz gamepad menu polling. Stable native
  process CPU sampling fell from 74.0% to 58.5% of one core.
- Saved the final web build at
  `releases/web/cheetah-and-peach-web-20260730-stars-trees-metal/`.
- Staged the native app at
  `releases/native/The Cheetah & The Peach.app`.
- Save compatibility remains `SAVE_VERSION = 3`, key
  `cheetah-peach.save.v1`.

### Moonlit atmosphere and volumetric pass

- Reauthored every chapter palette around a cool silver directional key,
  dark blue-black skies, closer fog depth, restrained ambient bounce, reduced
  saturation, chapter exposure, and strong but bounded vignette.
- Added a real analytic moon disk and halo to the existing sky shader.
- Added low-cost slanted atmospheric beams and increased the shared instanced
  mist/fog presence. Cottage, forest, crossing, transition, mountain, and the
  parking lot now share one coherent moonlit visual language.
- Replaced linear final brightness/contrast with one fused filmic custom effect.
  It preserves near-black detail while lowering walls and fog highlights and
  cooling shadows. It replaces an existing effect, so it does not add a
  fullscreen render pass.
- Rebalanced the cottage independently: darker plaster/floor/rug values,
  reduced warm ceiling and bedside pools, a restrained cool window wash, and
  one authored window shaft. Capture mean fell from 0.275 to 0.232 while the
  furniture, player, and doorway remain legible.
- Saved the exact current web build at
  `releases/web/cheetah-and-peach-web-20260730-moonlit-metal/`.
- Rebuilt the native app from that canonical production output. Protocol,
  document, Metal renderer, WebGL framebuffer, native capture, stable launch,
  asset parity, and complete helper shutdown all passed.

## Implemented additions and fixes

### Indie showcase perceived-quality pass

- Added authored exposure and vignette values to every chapter palette, with a
  damped eye-adaptation handoff instead of one global exposure. Forest,
  transition and parking-lot ground detail now survives the grade without
  flattening the warm cottage or title.
- Tightened third-person composition: chapter-specific follow distances,
  restrained velocity look-ahead, a corrected run pull-in, and a lower
  mountain opening angle that keeps the supercell present after its cinematic.
- Improved tiny character life without turning it into idle-loop theatre:
  Cheetah now blinks on an irregular clock; Peach retains the existing slow
  breathing, long road glances and small settled smile.
- Reframed and relit the car conversation. Peach's shoulders, dashboard and a
  seam of night road remain visible; the dome practical and skin rim no longer
  bleach half the face.
- Made light glints use true world distance and private opacity state. Matching
  lamps can no longer overwrite one another's pulse, and their halos are
  restrained.
- Repaired the last descent guardrail so it stays beside the road. Distant
  building windows now participate in tone mapping and height fog instead of
  floating as UI-bright rectangles.
- Rebalanced the supercell's additive core, kept its enormous authored
  silhouette, and added a settled-gameplay capture so future passes cannot make
  it look good only during the intro.
- Re-composed the final lot with two existing practicals: a quiet arrival pool
  and a restrained rim on the white sedan. No lights or mechanics were added.
- Made synthesized birds, chimes and rustle carry sparse stereo placement.
  Visible traffic begins its stereo approach before screen center; phantom lot
  traffic was removed.
- Split authored score intensity from personal music, track optional media by
  key, replace it on replay, and stop/disconnect it on title/teardown. The ending
  can no longer stack or accidentally attenuate the supplied approach track.
- Made gamepad camera movement frame-rate independent, restored gamepad A as a
  dialogue confirm, and clear every transient edge on blur/control reset.
- Added and validated the Desktop launcher shortcut at
  `/Users/grey/Desktop/Play The Cheetah & The Peach.command`.

### Final narrative and emotional polish

- Extended the final descent to a continuous ~310 m walk (294 m north/south
  span) with a dense, layered woodland: 360 authored tree candidates split
  among pines, broadleaf trees, pale birches and thinning roadside growth, plus
  roots, grasses, ferns, bushes, mushrooms, fallen logs, stones, insects, birds,
  lanterns, guardrails and telegraph wire.
- Made the fantasy-to-reality change geographic rather than a global skin swap:
  stone becomes asphalt, wild growth separates into restrained verge, stars and
  score recede, electric lights and low buildings arrive, and the distant JEWEL
  sign is visible before the scene boundary.
- Replaced the long prose interstitial between descent and parking lot with a
  1.2 s dissolve. Chapter ownership swaps behind black and control stays held
  through the new scene's complete 1.4 s fade-in.
- Added a huge three-layer supercell with a shelf cloud, rotating tower, broad
  anvil, internal two-pulse heat lightning and optional delayed thunder. The
  opening mountain camera holds on it before settling behind Cheetah; the storm
  remains visible through early descent openings.
- Re-staged the parking arrival from the left, diagonally facing the driver door.
  The closed JEWEL, road-facing car, already-moving traffic, sparse parked cars,
  carts, paper, pavement sheen, roof HVAC and its low drone establish an occupied
  late-night place before interaction.
- The sit-down now becomes Cheetah's actual driver-seat point of view; no duplicate
  Cheetah model is rendered inside the eye line. Peach breathes, blinks, shifts,
  glances toward the road, slowly turns and settles into a restrained smile.
- The exact opening is now **“I’m sorry it took me so long.”** It cannot appear
  until the 5.2 s entry completes, 6.2 s of interior silence passes, and at least
  one visible car crosses. The note waits for the player to close all four lines
  and for a new road pass.
- Stabilized instanced vegetation/material updates so live palette changes no
  longer reconstruct and zero tree/grass/bush matrices. Storm bounds now cull,
  directional flash targeting is scene-owned, one-shot audio nodes disconnect,
  and changing chapters resets scene-local music intensity.

### Desktop cleanup

- Removed portrait-specific parking camera/seat branches.
- Removed the mobile-only Playwright case and generated mobile captures.
- Kept the generic dialogue-centering correction because it fixes desktop UI.
- Desktop behavior is now the only acceptance target.

### Movement and interaction audit

- Added SPACE jump during active gameplay.
- Preserved E as interaction.
- Preserved Space/Enter/E dialogue advancement when gameplay does not own input.
- Added gravity, sampled-ground landing, airborne horizontal collision, and a
  restrained landing footstep.
- Updated pause-menu and README control instructions.
- Strengthened the interaction audit so it starts from a fresh save and checks
  the explicit required interaction IDs instead of hiding pickups through a
  debug-unlock shortcut.
- Fixed the crossing disembark bug that could remount the west-shore spawn after
  the raft reached the east shore.
- Added east-shore checkpoint resume detection.

### Durk

- Added one quiet brown-and-black dog named Durk to every playable biome:
  cottage, town, forest, crossing, mountain, transition, and parking lot.
- Durk either sleeps or chases fireflies.
- Durk has no marker, prompt, dialogue, audio, collider, or gameplay effect.
- Animation mutates refs in the frame loop and respects Reduced Motion.
- Geometry/materials are shared and cached.

### Raft sketchbook

- Added a small physical sketchbook to the moving raft.
- E or click opens an accessible viewer without stopping raft travel.
- Added three procedural cheetah-study pages.
- Added local personal-image support through:
  `public/sketchbook/manifest.json`.
- User instructions live in:
  `public/sketchbook/README.md` and `PERSONALIZE.md`.
- Only same-origin images inside `/sketchbook/` are accepted.
- Invalid, remote, malformed, or missing pages fail safely.
- Viewer focus, Escape handling, listeners, and transient state clean up on
  close/unmount.
- Save schema and content IDs were not changed.

### Two-mug emotional callback

- Added a small non-interactive wooden bench near the early forest river.
- Two mugs sit on it. No prompt, marker, dialogue, reward, or event was added.
- Added the same mug pair to the parked car dashboard during the final
  afterglow.
- Ending overlay now yields to a windshield shot.
- Ending completion waits for a road-traffic pass and the return to the cabin.
- A 14-second renderer-safety fallback prevents the ending from trapping the
  player if the 3D scene is interrupted.
- Added transient callback flags only; persisted save data remains unchanged.

### Parking-lot ending

- Closed JEWEL storefront sits behind the white sedan.
- JEWEL sign uses glowing red text.
- Car faces away from the store and toward the visible road.
- Cheetah enters and drives from the driver side.
- Peach appears in the passenger seat only after the cabin transition.
- Player-paced conversation begins with the exact apology and remains four lines.
- Note/message remain gated by dialogue closure and a new visible traffic pass.
- Traffic uses a fixed recycled pool with shared geometry/materials.
- Replay Ending preserves collected progress and completion.
- Reset Progress now also clears transient ending/camera/control state.

### Navigation: the compass strip and the paper star

- A shallow bearing band across the top of the screen. A **Home** marker rides it
  at the bearing of whatever the chapter wants next; every objective in the game
  carries that same name, because every one of them is a step back to the same
  place.
- **Q** (gamepad X) holds up the paper star for 12 seconds: the guide wisps light
  at once, the scene's own phrase for Home appears under the marker, and **Durk**
  joins the strip so the dog can be found in each biome rather than stumbled on.
- Markers past either end pin inside the band and dim, so "behind you" reads as a
  direction to turn. Labels grow inward near an end or the band's fade mask clips
  them.
- `Compass.tsx` samples `runtime` at 12 Hz rather than subscribing — bearings are
  per-frame mutable state that must never re-render React. It never writes.
- `runtime.durkPosition` is written once on the `Durk` component's mount and
  cleared on unmount. He still has no marker, prompt, collider or gameplay effect.
- Every chapter supplies its own objective phrase via `useObjective(point, label)`.
- Switchable off in Settings → *Playing* → *Compass*. `Settings.showCompass`
  defaults true and is whitelisted by the existing settings loader, so older
  stored settings merge forward without migration. Covered by
  `tests/e2e/compass.spec.ts` (2 cases).

### A world that answers to her

- **Mushrooms** grow an additive halo within 4.2 m, brightest beside her, each
  breathing on its own phase; they rise fast and fade slow so a lit trail stays
  behind her. Now in the forest (two patches), the cottage yard and the crossing's
  west shore, not just the forest.
- **Flowers** open on approach within 3.4 m and each plays a four-note pentatonic
  figure the first time it does, chosen from four so a meadow sounds played rather
  than repeated. Rate-limited to one jingle per 0.85 s. The authored `bloom` value
  remains the floor, so memory reactions are unaffected.
- Both are per-instance, driven from `runtime.playerPos` inside `useFrame`, with
  no React state involved.

### The silhouette figure, fixed

Reported as not showing up. Two independent causes: it was `#05050a` unlit black
in scenes that had since gone properly moonlit, and it appeared at a fixed spot
twenty seconds after the reveal — by which time the player has usually walked east
past it, so the beat played behind her back. It now carries a cool fresnel rim
(featureless interior, lit edge) and picks its spot at reveal time, nine metres
ahead of her on the road and facing her. The twenty-second wait is unchanged.

### An area light on the menu cottage

A `RectAreaLight` matched to the lit front wall, plus a flat one for the grass
(`RectAreaLight` is one-sided). Neither casts shadows, which is the point: soft
light, no hard edges, no shadow-map cost. Its intensity is radiance × area, not an
arbitrary scale — the first attempt at 26 blew the wall out; 2.1 is the wash.

### Settings consolidated

Nineteen rows in four groups became thirteen visible and seven folded: **Picture**
(fine tuning folded), **Sound** (balance folded), **Playing**, **Comfort**. Both
motion toggles now sit together — they used to be split between Controls and
Accessibility purely because one is a camera setting and one is a world setting.

### Ty Warner Hill is the way out of town

- Lanterns pace the climb and light with the third kindness.
- One street lamp stands on the summit — the last electric light before the trees
  — with a bench beside it facing back down at the square she just lit.
- The chapter exit moved to the far shoulder a few paces past the lamp; the
  "third kindness" cinematic pans up the hill to it.
- New `hill-bench` interaction, added to the audit's required list.

### Menu constellations

- The three shapes she draws at the overlook now hang over the title screen,
  reusing `CONSTELLATIONS` point data so editing a shape updates both places.
- One inline SVG, 46 field stars, CSS twinkle, no per-frame cost.
- Title palette darkened further, with the horizon deliberately left lifted.

### Set dressing

- Three new shared props: `StringLights`, `Well`, `Signpost`, plus
  `TelegraphPole`. Each is one or two draw calls and instances its repeats.
- Dressed the cottage bedroom (wardrobe, shelves, chair, wash stand, quilt), the
  town square and its western approach, the forest path, both crossing shores,
  the mountain switchbacks, the transition road, and the parking lot.
- No new network assets. All geometry and materials come from the existing caches.

### Atmosphere and environment

- Added restrained brightness/contrast grading per scene.
- Kept bloom subtle and retained existing quality fallbacks.
- Added a lightweight instanced atmospheric-light shaft layer over the existing
  ray-marched mist and height fog.
- Enabled restrained flicker on selected parking-lot lamps; other lamps remain
  stable for composition.
- Increased procedural canopy smoothness.
- Added a third offset canopy lobe and smoother trunks to reduce stacked,
  blocky tree silhouettes.
- Added environmental detail through Durk, river bench/mugs, raft sketchbook,
  parking props, traffic, litter, and cabin objects without new network assets.

## Known bugs, risks, and incomplete proof

### Closed in the navigation/atmosphere/set-dressing pass

Items 1, 2, 3, 4, 5 and 6 below were the previous outstanding list. All six are
now closed; see `CODEX_POLISH_LOG.md` for the detail.

1. **Full Playwright coverage** — done. All 31 cases pass. The reliable local
   acceptance path restarts Chromium between four WebGL-heavy groups; keeping
   all cases in one browser process eventually caused false timeouts from
   retained GPU contexts. `scripts/verify-project.sh` now owns that batching.
2. **Windshield callback timing** — hardened. Pass counting is armed only after
   the 1.8 s camera move plus a 0.42 s settle; in-flight traffic is retired when
   the callback begins and one car is dispatched from a 30 m run-up. The 14 s
   renderer-safety fallback is unchanged, deliberately (raising it to 18 s broke
   the ending smoke test's budget, which established that ~10.4 s is the real
   callback cost and 14 s is the right ceiling).
3. **Atmospheric shafts** — resolved, and the real defect was elsewhere:
   `AtmosphericBeams` were already view-space and needed no billboarding, while
   `LightShafts` was a flat cone that read as plastic. It now uses a
   look-through-the-belly view term, which erases the silhouette from every
   angle. Beams also fade far earlier so they no longer stand up into the sky.
4. **Final visual gate** — captured and inspected at desktop resolution via
   `npx playwright test shots`, which now closes the debug panel around each jump
   (it had been covering the left third of every image). Six defects were found by
   looking and fixed; they are listed in the log.
5. **Performance remeasured** — 60 fps / 16.7 ms in all seven chapters, idle and
   walking, after every final addition. Table in the log.
6. **Natural route completion** — the town→forest gate moved to the Ty Warner
   summit and is covered by the audit; the crossing east-shore resume and
   driver-side entry tests still pass. A single uninterrupted hand playthrough
   remains the one thing no automated pass can stand in for.

### Still open

#### A. One uninterrupted hand playthrough

Every gate is proven individually and the interaction audit passes from a fresh
save, but nobody has yet walked cottage → ending in one sitting without debug
teleporting. The automated audio snapshot proves that APPROACH becomes active
at parking-lot spawn and is not restarted at the old trigger, but final audible
timing and mix still need one speaker/headphone listen. Those are human
experience checks, not missing implementation.

#### B. Existing advisories

- Oxlint reports existing exhaustive-deps and Fast Refresh warnings. Zero errors;
  exits 0. The final count is 72 and no warning was introduced by this pass.
- The former Vite large-chunk advisory is closed. The default 500 kB threshold
  remains active and the largest final chunk is 375.46 kB.
- The development renderer stack may log a `THREE.Clock` deprecation. No
  game-owned `THREE.Clock` construction exists.
- `probe-perf` reports `draws=1 tris=0k`: it reads `gl.info.render` after the
  frame's reset, so those two counters are meaningless. The fps and frame-time
  figures beside them are real. Cosmetic reporting bug in the probe, not the game.
- Do not use one monolithic `npx playwright test` invocation as the local release
  gate on this Mac. Use `./scripts/verify-project.sh`; it runs the same 31 cases
  with fresh browser processes at stable boundaries.
- None of these are release blockers.

## Remaining work, in order

1. Play it start to finish by hand, once, without debug teleporting.
2. Listen at parking-lot spawn and approve the `APPROACH`/generated-score mix.
3. Fix only something those human checks actually expose.

## Useful commands

```bash
cd /Users/grey/cheetahandpeach
npm run typecheck
npm run lint
npm test
npm run build
./scripts/verify-project.sh
```

Run Playwright only once at a time because the configured suite owns port 5197.
The verification script handles WebGL-safe browser recycling.

## Main files changed in the indie-showcase pass

- `play-the-cheetah-and-the-peach.command`
- `README.md`
- `PROJECT_STATUS_AND_ISSUES.md`
- `CODEX_POLISH_LOG.md`
- `src/app/GameCanvas.tsx`
- `src/content/characters.ts`
- `src/game/camera/FollowCamera.tsx`
- `src/game/character/Girl.tsx`
- `src/game/input/input.ts`
- `src/scenes/town/TownScene.tsx`
- `src/scenes/forest/ForestScene.tsx`
- `src/scenes/mountain/MountainScene.tsx`
- `src/scenes/transition/TransitionScene.tsx`
- `src/scenes/parkingLot/ParkingLotScene.tsx`
- `src/systems/audio/audio.ts`
- `src/systems/environment/Environment.tsx`
- `src/systems/environment/palettes.ts`
- `src/systems/environment/props.tsx`
- `src/tests/input.test.ts`
- `src/tests/narrativePolish.test.ts`
- `tests/e2e/narrative-polish.spec.ts`
- `tests/e2e/shots.spec.ts`
- `shots/` visual evidence
- `/Users/grey/Desktop/Play The Cheetah & The Peach.command` (symlink)

## Main files changed in the narrative/emotional pass

- `src/scenes/mountain/MountainScene.tsx`
- `src/scenes/transition/TransitionScene.tsx`
- `src/scenes/parkingLot/ParkingLotScene.tsx`
- `src/systems/environment/Environment.tsx`
- `src/systems/environment/nature.tsx`
- `src/systems/environment/props.tsx`
- `src/systems/audio/audio.ts`
- `src/content/characters.ts`
- `src/content/finalMessage.ts`
- `src/store/gameStore.ts`
- `src/store/runtime.ts`
- `src/tests/chapterTransition.test.ts`
- `src/tests/narrativePolish.test.ts`
- `src/tests/parkingLot.test.ts`
- `tests/e2e/narrative-polish.spec.ts`
- `tests/e2e/parking-lot.spec.ts`
- `tests/e2e/phase2.spec.ts`
- `scripts/verify-project.sh`

## Main files changed in the preceding navigation pass

- `src/game/input/input.ts`
- `src/game/input/frame.ts`
- `src/game/character/CharacterController.tsx`
- `src/game/world/collision.ts`
- `src/scenes/crossing/CrossingScene.tsx`
- `src/scenes/crossing/crossingState.ts`
- `src/scenes/forest/ForestScene.tsx`
- `src/scenes/parkingLot/ParkingLotScene.tsx`
- `src/scenes/SceneKit.tsx`
- `src/systems/environment/Environment.tsx`
- `src/systems/environment/creatures.tsx`
- `src/systems/environment/nature.tsx`
- `src/systems/environment/palettes.ts`
- `src/systems/environment/props.tsx`
- `src/ui/EndingOverlay.tsx`
- `src/ui/PauseMenu.tsx`
- `src/ui/Sketchbook.tsx`
- `src/ui/sketchbookState.ts`
- `src/app/App.tsx`
- `src/app/GameCanvas.tsx`
- `src/content/sketchbook.ts`
- `src/store/gameStore.ts`
- `src/styles/global.css`
- `public/sketchbook/manifest.json`
- `public/sketchbook/README.md`
- `PERSONALIZE.md`
- relevant unit and Playwright test files.
