/**
 * Return the simulation time a capped frame should deliver, or 0 when the next
 * display refresh should be skipped.
 *
 * A small tolerance absorbs browser timestamp jitter. The max(1, …) is
 * important: allowing a near-boundary frame through with zero delivered time
 * makes the smoothed FPS counter spike and can double-submit work on 120 Hz
 * displays.
 */
export function budgetedFrameDuration(
  elapsedMs: number,
  targetFps: number,
  toleranceMs = 0.25,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0
  if (!Number.isFinite(targetFps) || targetFps <= 0) return 0

  const interval = 1000 / targetFps
  if (elapsedMs + toleranceMs < interval) return 0
  const steps = Math.max(1, Math.floor((elapsedMs + toleranceMs) / interval))
  return steps * interval
}
