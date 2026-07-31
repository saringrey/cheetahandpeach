import { describe, expect, it } from 'vitest'
import {
  checkpointIsAfterCrossing,
  CROSSING_LANDING_SPAWN,
  crossingCharacterOwner,
} from '../scenes/crossing/crossingState'
import type { Checkpoint } from '../types'

describe('crossing character handoff', () => {
  it('mounts an east-shore character after the raft instead of the cached west spawn', () => {
    expect(crossingCharacterOwner(false, false)).toBe('scene')
    expect(crossingCharacterOwner(true, false)).toBe('raft')
    expect(crossingCharacterOwner(false, true)).toBe('landing')
    expect(CROSSING_LANDING_SPAWN.position[0]).toBeGreaterThanOrEqual(38)
    expect(CROSSING_LANDING_SPAWN.position[2]).toBe(-1)
  })

  it('recognizes a saved east-shore checkpoint as already landed', () => {
    const checkpoint: Checkpoint = {
      chapter: 'crossing',
      position: [42, 0, -1],
      facing: Math.PI / 2,
    }
    expect(checkpointIsAfterCrossing(checkpoint)).toBe(true)
    expect(checkpointIsAfterCrossing({ ...checkpoint, position: [-20, 0, 2] })).toBe(false)
    expect(checkpointIsAfterCrossing({ ...checkpoint, chapter: 'forest' })).toBe(false)
    expect(checkpointIsAfterCrossing(null)).toBe(false)
  })
})
