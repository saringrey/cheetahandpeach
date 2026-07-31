import { expect, test, type Page } from '@playwright/test'

async function boot(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click()
}

async function jump(page: Page, chapter: 'mountain' | 'transition' | 'parkingLot') {
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId(`debug-jump-${chapter}`).click()
  await page.keyboard.press('Shift+Backquote')
}

test('storm, descent, and parking arrival remain renderable through the final flow', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await boot(page)

  await jump(page, 'mountain')
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: 'shots/polish-mountain-storm.png' })
  await page.waitForTimeout(3_850)
  await page.screenshot({ path: 'shots/polish-mountain-lightning.png' })
  // The intro has fully returned control by this point. Keep a truthful
  // gameplay-frame record so the storm cannot silently disappear behind the
  // first ridge while still looking good in its cinematic close-up.
  await page.waitForTimeout(4_000)
  await page.screenshot({ path: 'shots/polish-mountain-settled.png' })

  await jump(page, 'transition')
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: 'shots/polish-descent-fantasy.png' })

  await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: { playerPos: { set: (x: number, y: number, z: number) => void } }
      }
    ).__cpRuntime
    runtime?.playerPos.set(-12, 0, -4)
  })
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: 'shots/polish-descent-middle.png' })

  await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: { playerPos: { set: (x: number, y: number, z: number) => void } }
      }
    ).__cpRuntime
    runtime?.playerPos.set(-8, 0, -120)
  })
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: 'shots/polish-descent-reality.png' })

  const renderStats = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: { drawCalls: number; triangles: number; fps: number }
      }
    ).__cpRuntime
    return runtime
      ? { drawCalls: runtime.drawCalls, triangles: runtime.triangles, fps: runtime.fps }
      : null
  })
  expect(renderStats).not.toBeNull()
  expect(renderStats!.drawCalls).toBeGreaterThan(0)
  expect(renderStats!.triangles).toBeGreaterThan(0)
  expect(Number.isFinite(renderStats!.fps)).toBe(true)

  await jump(page, 'parkingLot')
  await page.waitForTimeout(5_000)
  await page.screenshot({ path: 'shots/polish-parking-arrival.png' })

  expect(errors).toEqual([])
})
