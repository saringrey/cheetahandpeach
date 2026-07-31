import { test, expect, type Page } from '@playwright/test'

async function bootPlayableCottage(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })

  // Opening camera can be skipped after its short authored lead-in.
  await page.waitForTimeout(2_600)
  await page.keyboard.press('KeyE')
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __cpStore?: { cinematic: boolean }
            __cpRuntime?: { playerControlEnabled: boolean }
          }
          return w.__cpStore?.cinematic === false && w.__cpRuntime?.playerControlEnabled === true
        }),
      { timeout: 12_000 },
    )
    .toBe(true)
}

async function verticalState(page: Page) {
  return page.evaluate(() => {
    const rt = (
      window as unknown as {
        __cpRuntime: {
          playerPos: { x: number; y: number; z: number }
          sampleHeight: (x: number, z: number) => number
        }
      }
    ).__cpRuntime
    const { x, y, z } = rt.playerPos
    return { y, ground: rt.sampleHeight(x, z) }
  })
}

async function horizontalDistanceFrom(page: Page, before: { x: number; z: number }) {
  return page.evaluate(({ x, z }) => {
    const current = (
      window as unknown as {
        __cpRuntime: { playerPos: { x: number; z: number } }
      }
    ).__cpRuntime.playerPos
    return Math.hypot(current.x - x, current.z - z)
  }, before)
}

test('SPACE raises the player and lands back on sampled ground', async ({ page }) => {
  test.setTimeout(90_000)
  await bootPlayableCottage(page)

  const before = await verticalState(page)
  await page.keyboard.press('Space')

  await expect
    .poll(async () => {
      const state = await verticalState(page)
      return state.y - state.ground
    })
    .toBeGreaterThan(0.35)

  await expect
    .poll(
      async () => {
        const state = await verticalState(page)
        return Math.abs(state.y - state.ground)
      },
      { timeout: 4_000 },
    )
    .toBeLessThan(0.04)

  const after = await verticalState(page)
  expect(Math.abs(after.ground - before.ground)).toBeLessThan(0.04)
})

test('SPACE near a prompt does not consume the E interaction', async ({ page }) => {
  test.setTimeout(90_000)
  await bootPlayableCottage(page)

  await page.evaluate(() => {
    const rt = (
      window as unknown as {
        __cpRuntime: {
          playerPos: { set: (x: number, y: number, z: number) => void }
          sampleHeight: (x: number, z: number) => number
        }
      }
    ).__cpRuntime
    rt.playerPos.set(10, rt.sampleHeight(10, 11.2), 11.2)
  })
  await expect(page.locator('.prompt')).toContainText('Look', { timeout: 5_000 })

  await page.keyboard.press('Space')
  await expect(page.getByText('The road to town. She has walked it a hundred times.')).toBeHidden()

  await page.keyboard.press('KeyE')
  await expect(page.getByText('The road to town. She has walked it a hundred times.')).toBeVisible({
    timeout: 5_000,
  })
})

test('focus loss clears left input and debug recovery releases a stuck controller', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await bootPlayableCottage(page)

  // Reproduce the reported shape: left is still physically held when a menu
  // takes focus, then its keyup arrives outside gameplay.
  await page.keyboard.down('KeyA')
  await page.waitForTimeout(350)
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __cpStore?: { phase: string } }).__cpStore?.phase,
      ),
    )
    .toBe('paused')
  await page.keyboard.up('KeyA')
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __cpStore?: { phase: string } }).__cpStore?.phase,
      ),
    )
    .toBe('playing')

  const afterPause = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime: { playerPos: { x: number; z: number } }
      }
    ).__cpRuntime
    return { x: runtime.playerPos.x, z: runtime.playerPos.z }
  })
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(650)
  await page.keyboard.up('KeyD')
  await expect
    .poll(() => horizontalDistanceFrom(page, afterPause))
    .toBeGreaterThan(0.25)

  // Simulate a leaked owner and prove the visible recovery control clears it
  // without respawning or resetting progress.
  await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime: {
          holdControl: (reason: string, held: boolean) => void
        }
      }
    ).__cpRuntime
    runtime.holdControl('e2e-stuck-owner', true)
  })
  await page.keyboard.down('KeyA')
  await page.keyboard.press('Shift+Backquote')
  await expect(page.getByTestId('debug-panel')).toBeVisible()
  const atRecovery = await page.evaluate(() => {
    const position = (
      window as unknown as {
        __cpRuntime: { playerPos: { x: number; z: number } }
      }
    ).__cpRuntime.playerPos
    return { x: position.x, z: position.z }
  })
  await page.getByTestId('debug-reset-movement').click()
  await page.keyboard.up('KeyA')

  const recovered = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime: {
          playerPos: { x: number; z: number }
          playerControlEnabled: boolean
          controlHolds: Set<string>
          playerSpeed: number
        }
      }
    ).__cpRuntime
    return {
      x: runtime.playerPos.x,
      z: runtime.playerPos.z,
      enabled: runtime.playerControlEnabled,
      holds: runtime.controlHolds.size,
      speed: runtime.playerSpeed,
    }
  })
  // The browser action itself can consume a frame before the click lands, but
  // recovery must remain local rather than teleporting to the chapter spawn.
  expect(Math.hypot(recovered.x - atRecovery.x, recovered.z - atRecovery.z)).toBeLessThan(0.15)
  expect(recovered.enabled).toBe(true)
  expect(recovered.holds).toBe(0)
  expect(recovered.speed).toBe(0)

  await page.getByTestId('debug-panel').getByText('×').click()
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(650)
  await page.keyboard.up('KeyD')
  await expect
    .poll(() => horizontalDistanceFrom(page, recovered))
    .toBeGreaterThan(0.25)
})
