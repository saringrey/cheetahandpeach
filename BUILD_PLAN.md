# The Cheetah & The Peach — Build Plan

Phased plan. Each phase is self-contained and ends in a verification gate.

## Phase 0 — Verified API surface (done before any code)

Resolved versions (from `package.json` after install):

| Package | Version |
|---|---|
| react / react-dom | 19.2.7 |
| three | 0.185.1 |
| @react-three/fiber | 9.6.1 |
| @react-three/drei | 10.7.7 |
| @react-three/postprocessing | 3.0.4 |
| postprocessing | 6.39.4 |
| zustand | 5.0.14 |
| gsap | 3.15.0 |
| vite | 8.1.1 |
| typescript | 6.0.2 |

**Allowed APIs** — confirmed present on disk, not assumed:

- `@react-three/drei/core/`: `Instances.d.ts`, `shaderMaterial.d.ts`, `Sparkles.d.ts`,
  `Stars.d.ts`, `AdaptiveDpr.d.ts`, `PerformanceMonitor.d.ts`, `Line.d.ts`, `Float.d.ts`,
  `Preload.d.ts`, `Text.d.ts`, `Sky.d.ts`
- `@react-three/postprocessing/dist/effects/`: `Bloom.d.ts`, `Vignette.d.ts`, `SMAA.d.ts`,
  `HueSaturation.d.ts`, `ToneMapping.d.ts`, `DepthOfField.d.ts`, `Noise.d.ts`
- `@react-three/fiber`: `Canvas`, `useFrame`, `useThree`, `extend`

**Anti-patterns to avoid** (decided, with reasons):

- ❌ `drei/<Text>` and `drei/<Html>` for narrative text — troika font fetching and DOM-in-canvas
  layout cost. All text is plain DOM overlaid on the canvas.
- ❌ `Environment` / HDRI — requires a remote or bundled `.hdr`. Lighting is hand-authored.
- ❌ `OrbitControls` as the gameplay camera — explicitly excluded by the brief.
- ❌ A physics engine (rapier/cannon) — no jumping or dynamics are required. Analytic
  heightfields + circle/AABB resolution are faster and cannot drop the player through terrain.
- ❌ Per-frame React state writes. Per-frame data lives in a mutable runtime singleton.
- ❌ Remote asset URLs of any kind.

## Phase 1 — Foundation
Vite scaffold, folder structure, content files, Zustand store, save system with version +
migration, settings persistence, loading screen, title screen in a live 3D scene.
**Gate:** `tsc --noEmit` clean, `npm run build` succeeds, title screen renders.

## Phase 2 — Core movement
Procedural girl, follow camera with damping + obstruction, keyboard + gamepad input, analytic
terrain/collision, proximity interaction system, checkpoints, pause menu, journal shell.
**Gate:** player walks a test scene; no fall-through; prompts appear; typecheck clean.

## Phase 3 — Cottage & town
Bedroom interior, doorway reveal cinematic, cottage yard vista, lantern town, three kindness
interactions, progressive town lighting.
**Gate:** all three interactions fire, light the town, and open the forest path.

## Phase 4 — Forest & memories
Forest region, five memory collectibles with camera emphasis + environmental reaction + journal
page + autosave, wildlife, sitting spot, forest audio bed.
**Gate:** five memories collectible, journal records them, exit opens.

## Phase 5 — Water, mountain, stars
Guided raft crossing, mountain climb with overlooks, sunset→night lighting ramp, three
constellation reveals with hold-to-connect.
**Gate:** crossing completes, mountain reachable, three constellations complete.

## Phase 6 — Transition & ending
Two-minute fantasy→reality morph, parking lot, car, second character, "Get in", interior
sequence, staged final message, credits, Replay Ending.
**Gate:** full run from New Game to the final message without debug tools.

## Phase 7 — Polish & delivery
Auto-quality tuner, accessibility, macOS launcher, Vitest unit tests, Playwright smoke test,
`PERSONALIZE.md`, full clean-save playthrough.
**Gate:** all acceptance criteria in the brief verified.

## Verification checklist (run at every gate)

```bash
npx tsc --noEmit          # types
npm run build             # production bundle
npm run test              # vitest unit tests
npm run test:e2e          # playwright smoke
```
