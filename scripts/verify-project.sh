#!/bin/bash
# Runs every gate in order and reports what passed.
set -u
cd "$(dirname "$0")/.." || exit 1

fail=0
step() {
  printf '\n\033[1m▸ %s\033[0m\n' "$1"
  shift
  if "$@"; then
    printf '\033[32m  ✓ passed\033[0m\n'
  else
    printf '\033[31m  ✗ FAILED\033[0m\n'
    fail=1
  fi
}

step "TypeScript"        npm run typecheck
step "Lint"              npm run lint
step "Unit tests"        npm run test
step "Production build"  npm run build
step "Production preview" npx playwright test --config=playwright.preview.config.ts

# Recycle both the Vite server and headless Chromium/WebGL process between
# groups. CI=1 makes the Playwright config refuse a pre-existing port owner, so
# every group proves which source tree it serves and reliably cleans up its own
# children. One monolithic invocation eventually retains enough GPU contexts on
# macOS to slow screenshot and timer operations into false timeouts.
step "Browser registry" env CI=1 npx playwright test \
  tests/e2e/audit.spec.ts \
  tests/e2e/compass.spec.ts
step "Browser play" env CI=1 npx playwright test \
  tests/e2e/menu.spec.ts \
  tests/e2e/movement.spec.ts \
  tests/e2e/replay-ending.spec.ts \
  tests/e2e/sketchbook.spec.ts
step "Browser smoke" env CI=1 npx playwright test tests/e2e/smoke.spec.ts
step "Browser parking" env CI=1 npx playwright test tests/e2e/parking-lot.spec.ts
step "Browser audio" env CI=1 npx playwright test tests/e2e/chapter-audio.spec.ts
step "Browser narrative" env CI=1 npx playwright test \
  tests/e2e/narrative-polish.spec.ts \
  tests/e2e/phase2.spec.ts
step "Browser environment" env CI=1 npx playwright test tests/e2e/environment-polish.spec.ts
step "Browser probes" env CI=1 npx playwright test \
  tests/e2e/probe-move.spec.ts \
  tests/e2e/probe-perf.spec.ts
step "Browser captures" env CI=1 npx playwright test tests/e2e/shots.spec.ts

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '\033[32mAll gates passed.\033[0m\n\n'
else
  printf '\033[31mSomething failed above.\033[0m\n\n'
fi
exit "$fail"
