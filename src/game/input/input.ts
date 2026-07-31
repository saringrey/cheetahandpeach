/**
 * Input: keyboard + mouse-look + gamepad, unified into an action snapshot that
 * systems poll once per frame. No React state, no per-event re-renders.
 */

export interface InputSnapshot {
  /** -1..1, strafe. */
  moveX: number
  /** -1..1, forward is +1. */
  moveY: number
  /** Accumulated look delta since last poll, in radians-ish units. */
  lookX: number
  lookY: number
  run: boolean
  /** True on the frame the jump key went down. */
  jumpPressed: boolean
  /** True on the frame the key went down. */
  interactPressed: boolean
  /** True while held. */
  interactHeld: boolean
  journalPressed: boolean
  /** True on the frame the quest-item key went down. */
  questPressed: boolean
  pausePressed: boolean
  anyPressed: boolean
  usingGamepad: boolean
}

const KEY_MOVE: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

/** Raw look units per second before FollowCamera applies user sensitivity. */
const GAMEPAD_LOOK_RATE = 840

export class InputSystem {
  private keys = new Set<string>()
  private lookX = 0
  private lookY = 0
  private jumpEdge = false
  private interactEdge = false
  private journalEdge = false
  private questEdge = false
  private pauseEdge = false
  private anyEdge = false
  private prevGamepadButtons: boolean[] = []
  private attached = false
  private lastGamepadActivity = 0
  /**
   * A browser cannot change the physical state of a connected controller.
   * After a focus loss or manual recovery, ignore it until every stick/button
   * returns to neutral so a held axis cannot immediately re-apply stale motion.
   */
  private suppressGamepadUntilNeutral = false
  private gameplayFocusValue = true

  /** Set true while the pointer is locked to the canvas. */
  pointerLocked = false
  /** True only while a mouse/trackpad button is held down on the canvas. */
  private dragging = false
  /**
   * Systems set this to false while a menu or dialogue owns the keyboard.
   * Losing gameplay focus is also an input boundary: clear held keys here so a
   * missed keyup cannot resume movement when gameplay returns.
   */
  get gameplayFocus() {
    return this.gameplayFocusValue
  }

  set gameplayFocus(enabled: boolean) {
    if (this.gameplayFocusValue && !enabled) this.clear()
    this.gameplayFocusValue = enabled
  }

  attach(target: HTMLElement) {
    if (this.attached) return
    this.attached = true
    this.clear()

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pagehide', this.onPageHide)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    target.addEventListener('mousemove', this.onMouseMove)
    target.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  detach(target: HTMLElement) {
    if (!this.attached) return
    this.attached = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pagehide', this.onPageHide)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    target.removeEventListener('mousemove', this.onMouseMove)
    target.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    this.clear()
  }

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement !== null
  }

  private onBlur = () => {
    this.clear()
  }

  private onPageHide = () => {
    this.clear()
  }

  private onVisibilityChange = () => {
    if (document.hidden) this.clear()
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    this.dragging = true
  }

  private onMouseUp = () => {
    this.dragging = false
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return
    // Never swallow browser shortcuts.
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.code === 'Escape') {
      this.pauseEdge = true
      return
    }
    // The confirm keys are registered even without gameplay focus, because
    // gameplay focus is switched OFF while dialogue is on screen — and dialogue
    // is advanced with exactly these keys. Without this, a line could only ever
    // be dismissed by clicking it.
    // SPACE belongs to movement during gameplay, but stays a keyboard-accessible
    // confirm while dialogue or a menu owns focus.
    const isConfirm =
      e.code === 'KeyE' || e.code === 'Enter' || (!this.gameplayFocus && e.code === 'Space')
    if (isConfirm) {
      this.interactEdge = true
      if (e.code === 'Space') e.preventDefault()
    }

    if (!this.gameplayFocus) {
      this.anyEdge = true
      return
    }

    if (e.code === 'KeyJ') this.journalEdge = true
    if (e.code === 'KeyQ') this.questEdge = true
    if (e.code === 'Space') this.jumpEdge = true
    this.keys.add(e.code)
    this.anyEdge = true
    if (KEY_MOVE[e.code] || e.code === 'Space') e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.gameplayFocus) return
    // The view is DRAGGED, not tracked: it only turns while a button is held.
    // Moving the mouse across the screen otherwise leaves the camera alone.
    if (!this.dragging) return
    const dx = e.movementX ?? 0
    const dy = e.movementY ?? 0
    // Guard against the jump a cursor makes when it re-enters the window.
    if (Math.abs(dx) > 160 || Math.abs(dy) > 160) return
    this.lookX += dx
    this.lookY += dy
  }

  isDown(code: string) {
    return this.keys.has(code)
  }

  poll(dtSeconds = 1 / 60): InputSnapshot {
    let moveX = 0
    let moveY = 0
    if (this.gameplayFocus) {
      for (const code of this.keys) {
        const m = KEY_MOVE[code]
        if (m) {
          moveX += m[0]
          moveY += m[1]
        }
      }
    }

    let run = this.gameplayFocus && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))
    let interactHeld = this.gameplayFocus && this.keys.has('KeyE')
    let lookX = this.lookX
    let lookY = this.lookY
    let usingGamepad = false

    // ── gamepad ──────────────────────────────────────────────────────────
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = pads && Array.from(pads).find((p) => p && p.connected)
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82)
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const rx = dead(pad.axes[2] ?? 0)
      const ry = dead(pad.axes[3] ?? 0)
      const buttons = pad.buttons.map((b) => b.pressed)
      const neutral =
        !buttons.some(Boolean) &&
        Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) === 0
      const gamepadReady = !this.suppressGamepadUntilNeutral

      if (this.suppressGamepadUntilNeutral && neutral) {
        // Resume on the next poll. This neutral frame deliberately produces no
        // edges or motion and becomes the new button baseline.
        this.suppressGamepadUntilNeutral = false
      }

      if (gamepadReady && this.gameplayFocus) {
        if (lx || ly) {
          moveX += lx
          moveY += -ly
        }
        if (rx || ry) {
          // Sticks express angular velocity, not a per-rendered-frame delta.
          // Capping the step also avoids a huge snap after a stalled frame.
          const step = Math.min(0.05, Math.max(0, dtSeconds))
          lookX += rx * GAMEPAD_LOOK_RATE * step
          lookY += ry * GAMEPAD_LOOK_RATE * step
        }
      }

      const pressed = (i: number) => buttons[i] && !this.prevGamepadButtons[i]

      if (
        gamepadReady &&
        (buttons.some(Boolean) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0)
      ) {
        this.lastGamepadActivity = performance.now()
      }

      if (gamepadReady && pressed(0)) {
        // Dialogue intentionally disables gameplay focus, but A is still the
        // promised confirm/continue button.
        this.interactEdge = true
        this.anyEdge = true
      }
      if (gamepadReady && pressed(1) && this.gameplayFocus) this.jumpEdge = true
      if (gamepadReady && pressed(3)) this.journalEdge = true
      if (gamepadReady && pressed(2)) this.questEdge = true
      if (gamepadReady && (pressed(9) || pressed(8))) this.pauseEdge = true
      // Face-button / d-pad navigation for menus.
      if (
        gamepadReady &&
        (pressed(12) || pressed(13) || pressed(14) || pressed(15) || pressed(1))
      ) {
        this.anyEdge = true
      }

      if (gamepadReady && this.gameplayFocus) {
        if (buttons[6] || buttons[7] || buttons[10]) run = true
        if (buttons[0]) interactHeld = true
      }
      this.prevGamepadButtons = buttons
      usingGamepad =
        gamepadReady && performance.now() - this.lastGamepadActivity < 3000
    }

    const len = Math.hypot(moveX, moveY)
    if (len > 1) {
      moveX /= len
      moveY /= len
    }

    const snap: InputSnapshot = {
      moveX,
      moveY,
      lookX,
      lookY,
      run,
      jumpPressed: this.jumpEdge,
      interactPressed: this.interactEdge,
      interactHeld,
      journalPressed: this.journalEdge,
      questPressed: this.questEdge,
      pausePressed: this.pauseEdge,
      anyPressed: this.anyEdge,
      usingGamepad,
    }

    this.lookX = 0
    this.lookY = 0
    this.jumpEdge = false
    this.interactEdge = false
    this.journalEdge = false
    this.questEdge = false
    this.pauseEdge = false
    this.anyEdge = false
    return snap
  }

  /** Drop any held keys — used when control is taken away mid-move. */
  clear() {
    this.keys.clear()
    this.dragging = false
    this.lookX = 0
    this.lookY = 0
    this.jumpEdge = false
    this.interactEdge = false
    this.journalEdge = false
    this.questEdge = false
    this.pauseEdge = false
    this.anyEdge = false
    this.prevGamepadButtons = []
    this.lastGamepadActivity = 0
    this.suppressGamepadUntilNeutral = true
  }
}

export const input = new InputSystem()

/**
 * Pointer lock is best-effort: it can fail for a detached element, a missing
 * user gesture, an unsupported option bag, or an automation driver. Every one of
 * those paths must end in silence — an unhandled rejection here would surface as
 * a page error and, in a headless run, fail the smoke test.
 */
export function requestPointerLock(el: HTMLElement) {
  if (typeof document === 'undefined') return
  if (document.pointerLockElement === el) return
  // A detached element throws WrongDocumentError; never even try.
  if (!el.isConnected || !document.contains(el)) return
  if (typeof el.requestPointerLock !== 'function') return

  const swallow = (r: unknown) => {
    if (r && typeof (r as Promise<void>).then === 'function') {
      ;(r as Promise<void>).then(undefined, () => {})
    }
  }

  const anyEl = el as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }
  try {
    // Chrome supports the options bag; other engines throw on it.
    swallow(anyEl.requestPointerLock({ unadjustedMovement: true }))
  } catch {
    try {
      swallow(anyEl.requestPointerLock())
    } catch {
      /* mouse look simply stays off */
    }
  }
}

export function exitPointerLock() {
  if (document.pointerLockElement) {
    try {
      document.exitPointerLock()
    } catch {
      /* ignore */
    }
  }
}
