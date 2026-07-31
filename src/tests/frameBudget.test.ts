import { describe, expect, it } from 'vitest'
import { budgetedFrameDuration } from '../systems/performance/frameBudget'

describe('budgetedFrameDuration', () => {
  it('skips an early refresh on a 120 Hz display', () => {
    expect(budgetedFrameDuration(8.33, 60)).toBe(0)
  })

  it('never submits a zero-time frame at the tolerance boundary', () => {
    expect(budgetedFrameDuration(16.5, 60)).toBeCloseTo(1000 / 60)
  })

  it('catches up by whole simulation frames after a small hitch', () => {
    expect(budgetedFrameDuration(34, 60)).toBeCloseTo(2000 / 60)
  })

  it('rejects invalid timing inputs', () => {
    expect(budgetedFrameDuration(Number.NaN, 60)).toBe(0)
    expect(budgetedFrameDuration(20, 0)).toBe(0)
  })
})
