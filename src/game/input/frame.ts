import type { InputSnapshot } from './input'

/**
 * The input snapshot for the current frame.
 *
 * <InputPump/> polls exactly once per frame and writes into this object, so the
 * character controller, camera and interaction system all observe the same
 * frame's input. Polling in each of them independently would let one consumer
 * eat another's key-press edge.
 */
export const frameInput: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  run: false,
  jumpPressed: false,
  interactPressed: false,
  interactHeld: false,
  journalPressed: false,
  questPressed: false,
  pausePressed: false,
  anyPressed: false,
  usingGamepad: false,
}

export function writeFrameInput(s: InputSnapshot) {
  frameInput.moveX = s.moveX
  frameInput.moveY = s.moveY
  frameInput.lookX = s.lookX
  frameInput.lookY = s.lookY
  frameInput.run = s.run
  frameInput.jumpPressed = s.jumpPressed
  frameInput.interactPressed = s.interactPressed
  frameInput.interactHeld = s.interactHeld
  frameInput.journalPressed = s.journalPressed
  frameInput.questPressed = s.questPressed
  frameInput.pausePressed = s.pausePressed
  frameInput.anyPressed = s.anyPressed
  frameInput.usingGamepad = s.usingGamepad
}

/**
 * Zero the already-published frame as well as the event-side InputSystem.
 *
 * Clearing only InputSystem leaves one stale snapshot alive until the next
 * render. A manual movement recovery must be immediate, even if the frame loop
 * is paused or the tab is being restored.
 */
export function clearFrameInput() {
  frameInput.moveX = 0
  frameInput.moveY = 0
  frameInput.lookX = 0
  frameInput.lookY = 0
  frameInput.run = false
  frameInput.jumpPressed = false
  frameInput.interactPressed = false
  frameInput.interactHeld = false
  frameInput.journalPressed = false
  frameInput.questPressed = false
  frameInput.pausePressed = false
  frameInput.anyPressed = false
  frameInput.usingGamepad = false
}

/** Consumes the interact edge so only one system reacts to a press. */
export function takeInteractPress(): boolean {
  if (!frameInput.interactPressed) return false
  frameInput.interactPressed = false
  return true
}
