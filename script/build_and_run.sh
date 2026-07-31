#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_DISPLAY_NAME="The Cheetah & The Peach"
PROCESS_NAME="CheetahAndPeachNative"
BUNDLE_ID="com.grey.cheetahandpeach"
MIN_SYSTEM_VERSION="14.0"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_RUNTIME="$ROOT_DIR/node_modules/electron/dist/Electron.app"
NATIVE_SOURCE="$ROOT_DIR/native-electron"
WEB_DIST="$ROOT_DIR/dist"
DIST_DIR="$ROOT_DIR/releases/native"
APP_BUNDLE="$DIST_DIR/$APP_DISPLAY_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_BINARY="$APP_MACOS/$PROCESS_NAME"
PACKAGED_SOURCE="$APP_RESOURCES/app"
PACKAGED_WEB="$PACKAGED_SOURCE/webapp"
INFO_PLIST="$APP_CONTENTS/Info.plist"
HEALTH_FILE="/tmp/cheetahandpeach-native-health-${UID}"
FRAME_FILE="/tmp/cheetahandpeach-native-frame-${UID}.png"
LOG_FILE="$HOME/Library/Logs/$APP_DISPLAY_NAME/native.log"

main_process_ids() {
  pgrep -f "^${APP_BINARY}( |$)" 2>/dev/null || true
}

helper_process_ids() {
  pgrep -f "^${APP_BUNDLE}/Contents/Frameworks/.*Helper" 2>/dev/null || true
}

app_is_running() {
  [ -n "$(main_process_ids)" ]
}

stop_running_app() {
  local main_ids helper_ids
  main_ids="$(main_process_ids)"
  helper_ids="$(helper_process_ids)"
  if [ -n "$helper_ids" ]; then
    kill -TERM $helper_ids >/dev/null 2>&1 || true
  fi
  if [ -n "$main_ids" ]; then
    kill -TERM $main_ids >/dev/null 2>&1 || true
  fi

  for _ in {1..30}; do
    if ! app_is_running && [ -z "$(helper_process_ids)" ]; then
      return
    fi
    sleep 0.1
  done

  main_ids="$(main_process_ids)"
  helper_ids="$(helper_process_ids)"
  if [ -n "$helper_ids" ]; then
    kill -KILL $helper_ids >/dev/null 2>&1 || true
  fi
  if [ -n "$main_ids" ]; then
    kill -KILL $main_ids >/dev/null 2>&1 || true
  fi
}

require_dependencies() {
  if [ ! -d "$ELECTRON_RUNTIME" ] && [ -x "$ROOT_DIR/node_modules/.bin/electron" ]; then
    printf 'Electron runtime is not cached; downloading the locked runtime...\n'
    "$ROOT_DIR/node_modules/.bin/electron" --version >/dev/null
  fi
  if [ ! -d "$ELECTRON_RUNTIME" ]; then
    printf 'Electron runtime is missing. Run: npm install\n' >&2
    exit 1
  fi
  if [ ! -f "$NATIVE_SOURCE/main.cjs" ] || [ ! -f "$NATIVE_SOURCE/package.json" ]; then
    printf 'Native host source is incomplete: %s\n' "$NATIVE_SOURCE" >&2
    exit 1
  fi
}

set_plist_value() {
  local key="$1"
  local value="$2"
  if ! /usr/libexec/PlistBuddy -c "Set :$key $value" "$INFO_PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Add :$key string $value" "$INFO_PLIST"
  fi
}

stage_app() {
  require_dependencies
  stop_running_app

  VITE_ENABLE_DEBUG_TOOLS=false npm --prefix "$ROOT_DIR" run build

  rm -rf "$APP_BUNDLE"
  mkdir -p "$DIST_DIR"
  /usr/bin/ditto "$ELECTRON_RUNTIME" "$APP_BUNDLE"

  mv "$APP_MACOS/Electron" "$APP_BINARY"
  mkdir -p "$PACKAGED_SOURCE"
  cp "$NATIVE_SOURCE/main.cjs" "$PACKAGED_SOURCE/main.cjs"
  cp "$NATIVE_SOURCE/package.json" "$PACKAGED_SOURCE/package.json"
  mkdir -p "$PACKAGED_WEB"
  cp -R "$WEB_DIST/." "$PACKAGED_WEB/"

  if ! diff -qr "$WEB_DIST" "$PACKAGED_WEB" >/dev/null; then
    printf 'Bundled web assets differ from the canonical production build\n' >&2
    exit 1
  fi

  set_plist_value "CFBundleDisplayName" "$APP_DISPLAY_NAME"
  set_plist_value "CFBundleExecutable" "$PROCESS_NAME"
  set_plist_value "CFBundleIdentifier" "$BUNDLE_ID"
  set_plist_value "CFBundleName" "$APP_DISPLAY_NAME"
  set_plist_value "CFBundleShortVersionString" "1.0.0"
  set_plist_value "CFBundleVersion" "1"
  set_plist_value "LSMinimumSystemVersion" "$MIN_SYSTEM_VERSION"

  plutil -lint "$INFO_PLIST" >/dev/null
  codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null
  codesign --verify --deep --strict "$APP_BUNDLE"
  printf 'Built exact web-app bundle: %s\n' "$APP_BUNDLE"
  printf 'Metal host: Chromium/ANGLE (validated at launch)\n'
}

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

stage_app

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    tail -f "$LOG_FILE"
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$PROCESS_NAME\""
    ;;
  --verify|verify)
    rm -f "$HEALTH_FILE" "$FRAME_FILE"
    open_app
    launched=0
    for _ in {1..80}; do
      if app_is_running; then
        launched=1
        break
      fi
      sleep 0.1
    done
    if [ "$launched" -ne 1 ]; then
      printf 'App did not launch: %s\n' "$APP_BUNDLE" >&2
      stop_running_app
      exit 1
    fi

    healthy=0
    for _ in {1..200}; do
      if [ -f "$HEALTH_FILE" ] &&
        grep -q '^protocol=ready$' "$HEALTH_FILE" &&
        grep -q '^document=ready$' "$HEALTH_FILE" &&
        grep -q '^metal=ready$' "$HEALTH_FILE" &&
        grep -q '^canvas=ready$' "$HEALTH_FILE" &&
        grep -q '^web=ready$' "$HEALTH_FILE" &&
        grep -q '^capture=ready$' "$HEALTH_FILE" &&
        [ -s "$FRAME_FILE" ]; then
        healthy=1
        break
      fi
      sleep 0.1
    done
    if [ "$healthy" -ne 1 ]; then
      printf 'App health handshake failed (protocol/document/Metal/canvas/web/capture): %s\n' "$APP_BUNDLE" >&2
      if [ -f "$HEALTH_FILE" ]; then
        sed -n '1,40p' "$HEALTH_FILE" >&2
      fi
      if [ -f "$LOG_FILE" ]; then
        tail -40 "$LOG_FILE" >&2
      fi
      stop_running_app
      exit 1
    fi

    sleep 1
    if ! app_is_running; then
      printf 'App exited during startup: %s\n' "$APP_BUNDLE" >&2
      exit 1
    fi
    printf 'Verified native health: protocol, document, Metal, rendered WebGL canvas, capture\n'
    printf 'Diagnostic frame: %s\n' "$FRAME_FILE"
    stop_running_app
    if app_is_running || [ -n "$(helper_process_ids)" ]; then
      printf 'Native processes remained after shutdown\n' >&2
      exit 1
    fi
    rm -f "$HEALTH_FILE"
    printf 'Verified clean shutdown: main and helper processes stopped\n'
    ;;
  *)
    printf 'usage: %s [run|--debug|--logs|--telemetry|--verify]\n' "$0" >&2
    exit 2
    ;;
esac
