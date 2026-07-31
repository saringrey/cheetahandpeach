import type { Checkpoint } from '../../types'

export const CROSSING_ENTRY_SPAWN = {
  position: [-33, 0, 4] as [number, number, number],
  facing: Math.PI / 2,
}

export const CROSSING_LANDING_SPAWN = {
  position: [41, 0, -1] as [number, number, number],
  facing: Math.PI / 2,
}

/**
 * SceneKit owns the normal/checkpoint spawn. After a ride, a dedicated
 * character controller must own the east-shore spawn instead: remounting
 * SceneKit's cached controller would correctly—but undesirably—return west.
 */
export function crossingCharacterOwner(
  riding: boolean,
  landed: boolean,
): 'scene' | 'raft' | 'landing' {
  if (riding) return 'raft'
  return landed ? 'landing' : 'scene'
}

export function checkpointIsAfterCrossing(checkpoint: Checkpoint | null): boolean {
  return checkpoint?.chapter === 'crossing' && checkpoint.position[0] >= 38
}
