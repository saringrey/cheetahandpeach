import * as THREE from 'three'
import type { Interactable } from '../types'

/**
 * Per-frame mutable state. Deliberately NOT a React store — nothing here may
 * trigger a re-render. Systems read and write it directly inside useFrame.
 */
class Runtime {
  /** Player world position (feet). */
  playerPos = new THREE.Vector3()
  /** Player facing, radians, 0 = +Z. */
  playerFacing = 0
  /** Horizontal speed in m/s. */
  playerSpeed = 0
  /** True while the run modifier is held and she is actually moving. */
  playerRunning = false
  /**
   * Bumped by the recovery control when component-local velocity must be
   * discarded. CharacterController observes this without a React render.
   */
  movementResetEpoch = 0
  /**
   * Set false while a cinematic or overlay owns input. Never assign this
   * directly — go through `holdControl()`, so the reason is recorded and the
   * watchdog can tell "deliberately held" from "leaked".
   */
  playerControlEnabled = true
  /**
   * Why control is currently held. Empty means she drives.
   *
   * A plain boolean was not enough: two systems can hold control at once (a
   * chapter transition and the arrival cinematic overlap by design), and
   * whichever released first handed control back while the other was still
   * running. Naming the holds makes releasing one harmless.
   */
  readonly controlHolds = new Set<string>()

  /** Camera orbit, radians. */
  camYaw = 0
  camPitch = 0.28
  /** Desired follow distance; scenes nudge this for framing. */
  camDistance = 6.2
  camDistanceTarget = 6.2
  /** Height the camera looks at above the player's feet. */
  camLookHeight = 1.0

  /** Seconds since the player last moved or interacted. Drives the gentle nudge. */
  idleSeconds = 0
  /** Total seconds spent in the current chapter. */
  chapterSeconds = 0

  /** Whatever the current scene wants the guide-wisp to point at. */
  objective: THREE.Vector3 | null = null
  /**
   * Human-readable name for `objective`, e.g. "the bench at the top".
   *
   * Lives here rather than in the store because it changes with the objective,
   * and the objective is set from scene render paths that must not trigger a
   * re-render. The compass samples it a few times a second instead.
   */
  objectiveLabel: string | null = null
  /**
   * Where Durk is, if this region has him.
   *
   * He has no marker, prompt, collider or gameplay effect by design — he is just
   * a dog who happens to be there. But "happens to be there" made him
   * findable only by luck, so the compass strip can point at him while the paper
   * star is lit. Set by the `Durk` component on mount, cleared on unmount.
   */
  durkPosition: THREE.Vector3 | null = null
  /**
   * Seconds remaining on a summoned guide.
   *
   * The paper star is the player's own nudge: pressing it puts time on this
   * clock, and while it is running the wisps light regardless of idle time and
   * the compass shows itself. Counted down by the wisps' frame loop.
   */
  questGuideSeconds = 0

  /** Set by each scene so the character controller knows the ground. */
  sampleHeight: (x: number, z: number) => number = () => 0
  /** Colliders the character controller resolves against. */
  colliders: Collider[] = []
  /** Valid play area. Anything outside is pushed back in. */
  bounds: Bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }

  /** Interactables currently registered by the active scene. */
  interactables = new Map<string, Interactable>()

  /** Perf counters surfaced by the debug panel. */
  fps = 0
  frameMs = 0
  drawCalls = 0
  triangles = 0
  shaderPrograms = 0
  effectiveDpr = 1
  framebufferWidth = 0
  framebufferHeight = 0
  rendererName = ''
  activeQuality: 'low' | 'medium' | 'high' = 'high'
  /** Visible road crossings, useful for timing authored beats and debug probes. */
  trafficPasses = 0

  /**
   * Take or release a named hold on player control.
   *
   * `holdControl('cinematic', true)` … `holdControl('cinematic', false)`. Control
   * comes back only once every hold has been released.
   */
  holdControl(reason: string, held: boolean) {
    if (held) this.controlHolds.add(reason)
    else this.controlHolds.delete(reason)
    this.playerControlEnabled = this.controlHolds.size === 0
  }

  /** Drop every hold. Used when leaving a chapter or returning to the title. */
  releaseAllControl() {
    this.controlHolds.clear()
    this.playerControlEnabled = true
  }

  /**
   * Recover control without moving the player or touching saved progress.
   * Component-local horizontal/vertical velocity is cleared on the next frame
   * when CharacterController observes the epoch bump.
   */
  recoverMovement() {
    this.releaseAllControl()
    this.playerSpeed = 0
    this.playerRunning = false
    this.movementResetEpoch += 1
  }

  reset() {
    this.playerPos.set(0, 0, 0)
    this.playerFacing = 0
    this.recoverMovement()
    this.camYaw = 0
    this.camPitch = 0.28
    this.camDistance = 6.2
    this.camDistanceTarget = 6.2
    this.camLookHeight = 1.0
    this.idleSeconds = 0
    this.chapterSeconds = 0
    this.objective = null
    this.objectiveLabel = null
    this.durkPosition = null
    this.questGuideSeconds = 0
    this.trafficPasses = 0
    this.colliders = []
    this.interactables.clear()
    this.sampleHeight = () => 0
  }
}

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number; noCam?: boolean }
  /** Axis-aligned box, optionally rotated about Y by `rot` radians. */
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; rot: number; noCam?: boolean }

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const runtime = new Runtime()

export function registerInteractable(item: Interactable): () => void {
  runtime.interactables.set(item.id, item)
  return () => {
    runtime.interactables.delete(item.id)
  }
}
