# Performance and native macOS audit

Date: 2026-07-30  
Host: Apple M5 MacBook Pro, 10 GPU cores, 24 GB unified memory

## Outcome

The canonical web game and the native macOS game now use the same compiled
files. The native release no longer uses the WKWebView path that displayed a
black WebGL surface on this Mac. It packages the unchanged production build in
Chromium/ANGLE, explicitly selects Metal, and refuses to pass launch
verification unless the live renderer reports Metal and produces a non-empty
native capture.

Current artifacts:

- Native app: `releases/native/The Cheetah & The Peach.app`
- Saved web release:
  `releases/web/cheetah-and-peach-web-20260730-moonlit-metal/`
- Pre-change recovery archive:
  `.backups/cheetahbackup-20260730-105030-pre-moonlit-grade.tar.gz`
- Backup SHA-256:
  `f13575cf1f7de455ba44a0f62f3a9e6a60216f2a404a25d78155a2d4ef23cc5f`

## Environment polish

- The three title constellations now exist as distant world-space
  `LineSegments` and instanced star geometry. The old menu SVG is no longer
  rendered.
- Tree candidate populations increased in every tree-bearing scene:

| Scene | Before | Now |
|---|---:|---:|
| Title | 88 | 208 |
| Cottage | 90 | 220 |
| Town | 80 | 200 |
| Forest | 340 | 680 |
| Crossing | 60 | 190 |
| Mountain | 110 | 280 |
| Transition | 360 | 620 |

- Road, path, clearing, and camera corridors have widened exclusion zones so
  the new density frames travel instead of blocking it.
- Five selected CC0 Quaternius models—round tree, alternate broadleaf, pine,
  birch, and dead tree—were converted from the supplied OBJ pack into compact
  GLB files with their original textures.
- Supplied trees replace every fifth procedural tree as shared static
  `InstancedMesh` geometry. They do not create one React component or draw call
  per tree, do not cast individual shadows, and preserve the existing
  quality-tier thinning.
- Dialogue is centered in the viewport. Its panel is translucent and surrounded
  by two animated white perimeter glows, with high-contrast and Reduced Motion
  fallbacks.
- Every chapter now uses a dark, cool moon palette with chapter-authored
  exposure, fog depth, silver directional key light, restrained practicals,
  and a visible analytic moon in the sky shader.
- The cottage's plaster, floor, rug, ceiling practical, bedside light, window
  wash, and doorway rim were rebalanced together. Its measured capture average
  fell from 0.275 to 0.232 without erasing room geometry.
- The previous linear brightness/contrast stage was replaced one-for-one by a
  filmic moon grade. It lifts near-black shadow information, lowers pale
  highlights, and cools only the shadows, so “dark” does not become “dim.”
- Height fog, one instanced ray-marched mist layer, slanted screen-space
  atmospheric beams, and authored cone shafts create volumetric depth without a
  depth-texture raymarch or per-light shadow volume.

## Performance work

- Gameplay remains capped at 60 submitted frames per second.
- The title 3D world is capped at 20 Hz; DOM menu input remains immediate.
- Hidden windows stop rendering and suspend audio.
- Dynamic shadows update independently at 20 Hz on medium and 30 Hz on high.
- Auto/medium DPR is capped at 1.20; high is capped at 1.50.
- Tree and grass instance fields, including the supplied GLBs, calculate bounds
  for whole-field frustum culling.
- Expensive continuously interpolated menu `text-shadow` blurs were replaced by
  the same settled glow plus compositor-only opacity breathing.
- Gamepad menu input is polled at 20 Hz instead of every high-refresh display
  frame.

Native title-menu sampling after those changes averaged 58.5% of one CPU core
and 639 MiB RSS over five stable samples. The immediately preceding build
averaged 74.0% and 661 MiB, so the menu repaint fix reduced sampled process CPU
by about 21%. Chromium accounts for much of the resident-memory footprint; it is
not equivalent to GPU memory in use.

## Final browser probe

Production-shaped Chromium/Metal automation at 1512×900, Auto/medium:

| Biome | Idle | Walking | Draws | Triangles |
|---|---:|---:|---:|---:|
| Cottage | 60 fps | 60 fps | 255 | 325k |
| Town | 60 fps | 60 fps | 990 | 366k |
| Forest | 60 fps | 60 fps | 278 | 774k |
| Crossing | 60 fps | 60 fps | 236 | 291k |
| Mountain | 60 fps | 60 fps | 258 | 300k |
| Transition | 60 fps | 60 fps | 456 | 735k |
| Parking lot | 60 fps | 60 fps | 303 | 38k |

Forest is now the triangle-heavy scene and town remains draw-call heavy. Both
held the 60 FPS target while idle and walking on this host. Any further density
increase should first split forest fields spatially and merge town materials.

## Native release architecture

- Electron 43.2.0 / Chromium 150.
- `--use-angle=metal` is set before Chromium initializes.
- The measured renderer string is:
  `ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)`.
- The exact `dist/` tree is copied to
  `Contents/Resources/app/webapp`; `diff -qr` enforces parity.
- A secure `cheetah://game/` protocol provides a stable localStorage origin
  without a server or open port.
- Node integration is off; context isolation, Chromium sandboxing, and web
  security are on.
- The app remains hidden until the game publishes its first rendered-WebGL
  signal.
- Health verification requires protocol, document, WebGL canvas, Metal renderer,
  and a non-empty native frame capture.
- One renderer crash gets a clean reload; repeated failure is logged and shown
  rather than leaving a black window.
- Verification proves the main and helper processes all stop.

The preserved Swift/AppKit target remains under `native-macos/` as a diagnostic
fallback. It is not shipped because its WKWebView compositor stayed black even
while JavaScript, WebGL, the canvas pixel probe, and health checks all reported
ready.

## Verification

- Backup archive integrity and listing: pass.
- TypeScript: pass.
- Unit tests: 69/69 across 14 files.
- Lint: exit 0; existing warnings only.
- Production build: pass; 1,878.97 kB JS / 589.95 kB gzip.
- Core browser group: 16/16 pass.
- Narrative browser group: 9/9 pass.
- Movement and performance probes: 2/2 pass.
- All-region visual capture: pass.
- New environment/subtitle gate and menu gate: 2/2 pass.
- Native protocol/document/Metal/WebGL/capture gate: pass.
- Packaged web assets versus canonical `dist/`: exact.
- Native main/helper cleanup: pass.
- Saved web release versus canonical `dist/`: exact.
- Moonlit regression group: 9/9 pass.
- Current all-biome performance probe: 60 fps idle and walking in 7/7 chapters.

## Limitations

- The local app is ad-hoc signed, not Developer ID signed or notarized.
- Electron makes the `.app` about 281 MB; the saved web release is about 5.5 MB.
- Vite retains the existing large single-chunk advisory.
- Three/R3F retains the upstream `THREE.Clock` deprecation warning.
- The Xcode beta copy is present but its license has not been accepted. The
  shipped app does not require Xcode; no license prompt was accepted
  automatically.
- VRAM/unified-memory capacity does not determine heat. CPU/RSS and frame
  behavior were measured, but an exact watts/temperature claim still requires
  Instruments Energy Log or Metal System Trace during a natural playthrough.

## Commands

```bash
cd /Users/grey/cheetahandpeach

# Full browser release gate
./scripts/verify-project.sh

# Native launch, real Metal/WebGL capture, and cleanup gate
./script/build_and_run.sh --verify

# Run native app
./script/build_and_run.sh

# Follow native diagnostics
./script/build_and_run.sh --logs

# Open saved artifacts
open "releases/native/The Cheetah & The Peach.app"
open "releases/web/cheetah-and-peach-web-20260730-moonlit-metal"
```
