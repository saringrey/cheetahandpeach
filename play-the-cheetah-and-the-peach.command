#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
#  The Cheetah & The Peach — macOS launcher
#  Double-click this file in Finder to play.
# ══════════════════════════════════════════════════════════════════════════
set -u

# Resolve Finder/Desktop symlinks before choosing the project directory.
LAUNCHER_SOURCE="${BASH_SOURCE[0]}"
while [ -h "$LAUNCHER_SOURCE" ]; do
  LAUNCHER_DIR="$(cd -P "$(dirname "$LAUNCHER_SOURCE")" >/dev/null 2>&1 && pwd)"
  LAUNCHER_SOURCE="$(readlink "$LAUNCHER_SOURCE")"
  case "$LAUNCHER_SOURCE" in
    /*) ;;
    *) LAUNCHER_SOURCE="${LAUNCHER_DIR}/${LAUNCHER_SOURCE}" ;;
  esac
done
PROJECT_DIR="$(cd -P "$(dirname "$LAUNCHER_SOURCE")" >/dev/null 2>&1 && pwd)"
cd "$PROJECT_DIR" || exit 1

printf '\n  \033[38;5;216mThe Cheetah & The Peach\033[0m\n'
printf '  \033[2mA Little Journey Back to the Beginning\033[0m\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf '  \033[31mNode.js is not installed.\033[0m\n'
  printf '  Install it from https://nodejs.org and run this again.\n\n'
  read -r -p "  Press return to close." _
  exit 1
fi

if [ ! -x node_modules/.bin/vite ]; then
  printf '  Installing dependencies (first run only, ~1 minute)...\n\n'
  npm install || {
    printf '\n  \033[31mInstall failed.\033[0m See the messages above.\n\n'
    read -r -p "  Press return to close." _
    exit 1
  }
fi

# Prefer the production build, but never serve an old build after source,
# content, audio, or configuration has changed.
NEEDS_BUILD=0
if [ ! -f dist/index.html ]; then
  NEEDS_BUILD=1
elif find src public -type f -newer dist/index.html -print -quit | grep -q .; then
  NEEDS_BUILD=1
else
  for BUILD_INPUT in index.html package.json package-lock.json vite.config.ts tsconfig.app.json .env.local; do
    if [ -f "$BUILD_INPUT" ] && [ "$BUILD_INPUT" -nt dist/index.html ]; then
      NEEDS_BUILD=1
      break
    fi
  done
fi

USE_PREVIEW=1
if [ "$NEEDS_BUILD" -eq 1 ]; then
  printf '  Preparing the latest version...\n\n'
  if ! npm run build; then
    printf '\n  \033[33mProduction build failed.\033[0m Using the live source instead.\n\n'
    USE_PREVIEW=0
  fi
fi

# Never kill an unrelated app just because it already owns the usual port.
PORT=''
for PORT_CANDIDATE in 5180 5181 5182 5183 5184 5185 5186 5187 5188 5189; do
  if command -v lsof >/dev/null 2>&1 &&
    lsof -nP -iTCP:"$PORT_CANDIDATE" -sTCP:LISTEN >/dev/null 2>&1; then
    continue
  fi
  PORT="$PORT_CANDIDATE"
  break
done

if [ -z "$PORT" ]; then
  printf '  \033[31mNo free launch port was found (5180–5189).\033[0m\n\n'
  read -r -p "  Press return to close." _
  exit 1
fi

URL="http://localhost:${PORT}"
LOG="/tmp/cheetah-peach-${PORT}.log"

if [ "$USE_PREVIEW" -eq 1 ] && [ -f dist/index.html ]; then
  ./node_modules/.bin/vite preview --port "$PORT" --strictPort >"$LOG" 2>&1 &
else
  ./node_modules/.bin/vite --port "$PORT" --strictPort >"$LOG" 2>&1 &
fi
SERVER_PID=$!

cleanup() {
  trap - EXIT INT TERM HUP
  printf '\n  Stopping the game...\n'
  pkill -TERM -P "$SERVER_PID" 2>/dev/null
  kill -TERM "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  printf '  Goodbye.\n\n'
}
trap cleanup EXIT INT TERM HUP

printf '  Starting'
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "$URL"; then
    printf ' ready.\n\n'
    break
  fi
  printf '.'
  sleep 0.5
done

if ! curl -s -o /dev/null "$URL"; then
  printf '\n\n  \033[31mThe server did not start.\033[0m\n'
  printf '  Log: %s\n\n' "$LOG"
  read -r -p "  Press return to close." _
  exit 1
fi

open "$URL"

printf '  \033[38;5;216mPlaying at %s\033[0m\n\n' "$URL"
printf '  WASD to walk  ·  Shift to hurry  ·  E to interact  ·  J for the journal\n'
printf '  Esc to pause\n\n'
printf '  \033[2mTo stop the game: press Control-C here, or just close this window.\033[0m\n\n'

wait "$SERVER_PID"
