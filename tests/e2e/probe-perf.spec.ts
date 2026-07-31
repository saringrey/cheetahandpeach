import { expect, test, type Page } from '@playwright/test'

const CHAPTERS = ['cottage', 'town', 'forest', 'crossing', 'mountain', 'transition', 'parkingLot'] as const
const MIN_FPS = 55
const MAX_FRAME_MS = 22

const perf = (page: Page) =>
  page.evaluate(() => {
    const rt = (window as any).__cpRuntime
    return {
      fps: +rt.fps.toFixed(1),
      ms: +rt.frameMs.toFixed(1),
      draws: rt.drawCalls,
      tris: Math.round(rt.triangles / 1000),
      programs: rt.shaderPrograms,
      dpr: rt.effectiveDpr,
      buffer: `${rt.framebufferWidth}x${rt.framebufferHeight}`,
      renderer: rt.rendererName,
      quality: rt.activeQuality,
      cols: rt.colliders.length,
    }
  })

test('performance gate: every chapter holds its realtime frame budget', async ({ page }) => {
  test.setTimeout(400_000)
  await page.setViewportSize({ width: 1512, height: 900 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(3_000)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-unlock-memories').click()
  await page.getByTestId('debug-panel').getByText('×').click()

  for (const c of CHAPTERS) {
    await page.keyboard.press('Shift+Backquote')
    await page.getByTestId(`debug-jump-${c}`).click()
    await page.getByTestId('debug-panel').getByText('×').click()
    await page.waitForTimeout(9_000)
    const idle = await perf(page)
    // walk for 5s and sample again — this is where per-frame churn shows up
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(5_000)
    const walking = await perf(page)
    await page.keyboard.up('KeyW')
    console.log(
      `  ${c.padEnd(12)} idle ${String(idle.fps).padStart(5)}fps ${String(idle.ms).padStart(5)}ms  ` +
        `walk ${String(walking.fps).padStart(5)}fps ${String(walking.ms).padStart(5)}ms  ` +
        `draws=${walking.draws} tris=${walking.tris}k programs=${walking.programs} ` +
        `dpr=${walking.dpr} buffer=${walking.buffer} q=${walking.quality} cols=${walking.cols}`,
    )
    expect(walking.renderer, `${c} renderer`).not.toMatch(/SwiftShader/i)
    expect(idle.fps, `${c} idle FPS`).toBeGreaterThanOrEqual(MIN_FPS)
    expect(idle.ms, `${c} idle frame time`).toBeLessThanOrEqual(MAX_FRAME_MS)
    expect(walking.fps, `${c} walking FPS`).toBeGreaterThanOrEqual(MIN_FPS)
    expect(walking.ms, `${c} walking frame time`).toBeLessThanOrEqual(MAX_FRAME_MS)
  }
})
