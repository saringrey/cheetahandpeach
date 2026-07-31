# Native macOS release host

The shipped macOS application is an exact host for the canonical production
web build. It does not reimplement, fork, or replace any game scene.

## Architecture

- Electron 43 / Chromium 150 packages the unmodified `dist/` tree.
- Chromium ANGLE is forced to its Metal backend before application startup.
- `cheetah://game/` is a privileged, secure, sandboxed local protocol. It has a
  stable origin for localStorage and does not open a localhost port.
- Node integration is disabled, context isolation and renderer sandboxing are
  enabled, popups are denied, and navigation cannot leave the packaged origin.
- The window stays hidden until the game's own rendered-WebGL signal fires.
- Launch verification reads the real WebGL renderer string and requires
  `ANGLE Metal Renderer` before it passes.
- A renderer crash is logged and gets one clean reload. Repeated failure becomes
  a visible error instead of an unexplained black window.
- Native logs live at
  `~/Library/Logs/The Cheetah & The Peach/native.log`.

The package script copies the complete current `dist/` directory into
`Contents/Resources/app/webapp` and rejects the build if `diff -qr` finds any
difference. Story, state, saves, audio, controls, UI, and visuals therefore come
from the exact same compiled files as the saved web release.

## Commands

```bash
cd /Users/grey/cheetahandpeach

# Build, sign, launch, require Metal + a rendered capture, then prove cleanup.
./script/build_and_run.sh --verify

# Build and run.
./script/build_and_run.sh

# Build, run, and follow native diagnostics.
./script/build_and_run.sh --logs
```

The staged app is:

`releases/native/The Cheetah & The Peach.app`

It is ad-hoc signed for local use. Developer ID distribution and notarization
remain separate release steps.
