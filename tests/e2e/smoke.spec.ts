import { test, expect, type Page } from '@playwright/test'

/**
 * Smoke test for the whole journey's skeleton:
 * title → new game → player scene → debug teleports through every chapter →
 * ending overlay → save records completion. Also watches for fatal console
 * errors the whole way.
 */

const fatalErrors: string[] = []

function watchConsole(page: Page) {
  fatalErrors.length = 0
  page.on('console', (msg) => {
    if (msg.type() === 'error') fatalErrors.push(msg.text())
  })
  page.on('pageerror', (err) => fatalErrors.push(String(err)))
}

async function freshGame(page: Page) {
  watchConsole(page)
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
}

test('title screen loads and shows the menu', async ({ page }) => {
  await freshGame(page)
  await expect(page.getByText('The Cheetah & The Peach')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Credits' })).toBeVisible()
  // Continue is disabled with no save.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  expect(fatalErrors).toEqual([])
})

test('new game starts and the player scene appears', async ({ page }) => {
  await freshGame(page)
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  // The title menu goes away and the canvas remains.
  await expect(page.getByRole('button', { name: 'New Game' })).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('canvas')).toBeVisible()
  // The opening runs; after it the game persists a save (Continue works after reload).
  await page.waitForTimeout(11_000)
  const save = await page.evaluate(() => localStorage.getItem('cheetah-peach.save.v1'))
  expect(save).toBeTruthy()
  expect(JSON.parse(save!).chapter).toBe('cottage')
  expect(fatalErrors).toEqual([])
})

test('continue resumes after a save exists', async ({ page }) => {
  await freshGame(page)
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(3_000)
  await page.goto('/?alwaysRun=1')
  const cont = page.getByRole('button', { name: 'Continue' })
  await expect(cont).toBeEnabled({ timeout: 20_000 })
  await cont.click()
  await expect(cont).toBeHidden({ timeout: 10_000 })
  expect(fatalErrors).toEqual([])
})

test('debug teleport reaches every chapter without fatal errors', async ({ page }) => {
  await freshGame(page)
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(2_000)

  // Open the debug panel (VITE_ENABLE_DEBUG_TOOLS=true in the test server).
  await page.keyboard.press('Shift+Backquote')
  await expect(page.getByTestId('debug-panel')).toBeVisible({ timeout: 5_000 })

  for (const chapter of ['town', 'forest', 'crossing', 'mountain', 'transition', 'parkingLot']) {
    await page.getByTestId(`debug-jump-${chapter}`).click()
    // Each scene gets a moment to mount, run its intro, and render frames.
    await page.waitForTimeout(4_500)
    // Deprecation notices arrive as warnings, not errors, so nothing THREE-related
    // is filtered here — a shader compile failure must fail this test.
    const errs = fatalErrors.filter((e) => !e.includes('DevTools'))
    expect(errs, `fatal errors after teleporting to ${chapter}`).toEqual([])
    const save = await page.evaluate(() => localStorage.getItem('cheetah-peach.save.v1'))
    expect(JSON.parse(save!).chapter).toBe(chapter)
  }
})

test('ending overlay can be reached through debug mode and completion saves', async ({ page }) => {
  await freshGame(page)
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(2_000)

  await page.keyboard.press('Shift+Backquote')
  await expect(page.getByTestId('debug-panel')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('debug-jump-parkingLot').click()
  await page.waitForTimeout(4_000)

  await page.getByTestId('debug-ending').click()
  await page.keyboard.press('Shift+Backquote')
  // The note (11s) and deliberate silence (7s) precede the first group.
  await expect(page.getByText('Every road was leading here.')).toBeVisible({ timeout: 30_000 })
  // The full message plays out; completion is marked.
  await expect(page.getByText('I love you.')).toBeVisible({ timeout: 60_000 })
  const endingPhoto = page.getByRole('img', { name: /Cheetah as a child/ })
  await expect(endingPhoto).toBeVisible()
  await expect
    .poll(() => endingPhoto.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  const photoBounds = await endingPhoto.evaluate((image) => {
    const rect = image.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  expect(photoBounds.left).toBeGreaterThanOrEqual(0)
  expect(photoBounds.top).toBeGreaterThanOrEqual(0)
  expect(photoBounds.right).toBeLessThanOrEqual(photoBounds.viewportWidth)
  expect(photoBounds.bottom).toBeLessThanOrEqual(photoBounds.viewportHeight)
  await page.waitForTimeout(2_200)
  await page.screenshot({ path: 'shots/ending-childhood-photo.png' })
  // Debug activation has no live parking-scene traffic callback, so the
  // renderer-safety fallback completes that beat after 14 seconds.
  await expect(page.getByRole('button', { name: 'Return to the title' })).toBeVisible({
    timeout: 35_000,
  })
  const save = await page.evaluate(() => localStorage.getItem('cheetah-peach.save.v1'))
  expect(JSON.parse(save!).endingComplete).toBe(true)
  expect(fatalErrors).toEqual([])
})

test('memories unlock via debug and appear in the journal', async ({ page }) => {
  await freshGame(page)
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(2_000)

  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-unlock-memories').click()
  await page.keyboard.press('Shift+Backquote')

  await page.keyboard.press('KeyJ')
  await expect(page.getByText('What she kept')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('6 of 6 found')).toBeVisible()
  await expect(page.getByText('A pressed flower')).toBeVisible()
  const journalPhoto = page.getByRole('img', { name: /Cheetah as a child/ })
  await expect(journalPhoto).toBeVisible()
  await expect
    .poll(() => journalPhoto.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'shots/journal-childhood-photo.png' })
  expect(fatalErrors).toEqual([])
})
