import { director } from '../camera/director'
import { clearFrameInput } from '../input/frame'
import { input } from '../input/input'
import { useGame } from '../../store/gameStore'
import { runtime } from '../../store/runtime'

export interface MovementRecoveryResult {
  cancelledCinematic: boolean
  releasedHolds: string[]
  position: [number, number, number]
  resetEpoch: number
}

/**
 * Last-resort movement recovery for the development panel.
 *
 * This is intentionally narrower than respawning or resetting progress: it
 * preserves the chapter, checkpoint, world position, facing, inventory and
 * every save ID. Only transient input, camera/transition ownership and local
 * controller velocity are discarded.
 */
export function recoverPlayerMovement(): MovementRecoveryResult {
  const cancelledCinematic = director.isActive() || useGame.getState().cinematic
  const releasedHolds = [...runtime.controlHolds]
  const position: [number, number, number] = [
    runtime.playerPos.x,
    runtime.playerPos.y,
    runtime.playerPos.z,
  ]

  director.cancel()
  useGame.getState().recoverControl()
  input.clear()
  clearFrameInput()
  runtime.recoverMovement()

  return {
    cancelledCinematic,
    releasedHolds,
    position,
    resetEpoch: runtime.movementResetEpoch,
  }
}
