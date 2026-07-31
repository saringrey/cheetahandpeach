import { expect, test } from '@playwright/test'

/** Captures of the splash and the title menu. */
test('splash and menu', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  // The splash is deliberately brief; catch it before it fades.
  await page.waitForTimeout(260)
  await expect(page.getByRole('heading', { name: 'The Cheetah & The Peach' })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Loading game' })).toBeVisible()
  const follower = await page.locator('.loading__peach').boundingBox()
  const bar = await page.locator('.loading__bar').boundingBox()
  expect(follower).not.toBeNull()
  expect(bar).not.toBeNull()
  expect(follower!.x + follower!.width / 2).toBeGreaterThanOrEqual(bar!.x)
  expect(follower!.x + follower!.width / 2).toBeLessThanOrEqual(bar!.x + bar!.width)
  await page.screenshot({ path: 'shots/m-00-splash.png' })
  await page.waitForTimeout(650)
  await expect(page.getByRole('heading', { name: 'The Cheetah & The Peach' })).toBeVisible()
  await page.getByRole('button', { name: 'New Game' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(3_500)
  await page.screenshot({ path: 'shots/m-01-menu.png' })
})
