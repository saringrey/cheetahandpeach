import { test, expect } from '@playwright/test'

/**
 * The compass strip and the paper star.
 *
 * Covers the things that silently stop working: the strip not rendering at all,
 * the Home marker losing its bearing source, and Durk never being registered by
 * the region (which would make the star useless as a way of finding him).
 */

test('the compass strip shows Home, and the star reveals Durk', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })

  // Past the opening cinematic, which deliberately hides the whole HUD.
  await page.waitForFunction(
    () => {
      const st = (window as unknown as { __cpStore?: any }).__cpStore
      return st && st.phase === 'playing' && !st.cinematic && !st.dialogue
    },
    undefined,
    { timeout: 60_000 },
  )

  const strip = page.locator('.compass-strip')
  await expect(strip).toBeVisible()

  // Home is always shown and always named Home, whatever the chapter's own
  // phrase for it happens to be.
  const home = page.locator('.compass-strip__mark--home')
  await expect(home).toBeVisible()
  await expect(home.locator('.compass-strip__label')).toContainText('Home')
  await expect(home.locator('.compass-strip__distance')).toContainText('m')

  // Unlit by default: Durk stays out of it until she asks.
  await expect(page.locator('.compass-strip--lit')).toHaveCount(0)
  await expect(page.locator('.compass-strip__mark--durk')).toHaveCount(0)

  // The cottage has a Durk, so the region must have registered him.
  expect(
    await page.evaluate(() => !!(window as unknown as { __cpRuntime?: any }).__cpRuntime.durkPosition),
  ).toBe(true)

  // Q lights the star, which arms the guide and reveals Durk on the strip.
  await page.keyboard.press('KeyQ')
  await expect(page.locator('.compass-strip--lit')).toHaveCount(1)
  await expect(page.locator('.compass-strip__mark--durk')).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { __cpRuntime?: any }).__cpRuntime.questGuideSeconds),
  ).toBeGreaterThan(0)

  // The scene's own phrase for Home rides underneath while the star is lit.
  await expect(home.locator('.compass-strip__note')).toBeVisible()

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([])
})

test('the compass can be switched off in settings', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const st = (window as unknown as { __cpStore?: any }).__cpStore
      return st && st.phase === 'playing' && !st.cinematic
    },
    undefined,
    { timeout: 60_000 },
  )

  await expect(page.locator('.compass-strip')).toBeVisible()
  await page.evaluate(() =>
    (window as unknown as { __cpStore?: any }).__cpStore.updateSettings({ showCompass: false }),
  )
  await expect(page.locator('.compass-strip')).toHaveCount(0)
})
