import { expect, test } from '@playwright/test'

const SAVE_KEY = 'cheetah-peach.save.v1'

test('raft sketchbook opens accessibly while the crossing keeps moving', async ({ page }) => {
  test.setTimeout(90_000)

  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(1_000)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-crossing').click()
  await page.waitForTimeout(5_000)

  const boarded = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: {
          interactables: Map<string, { onInteract: () => void }>
        }
      }
    ).__cpRuntime
    const raft = runtime?.interactables.get('board-raft')
    raft?.onInteract()
    return Boolean(raft)
  })
  expect(boarded).toBe(true)
  await page.getByTestId('debug-panel').locator('button').first().click()

  await page.waitForTimeout(650)
  // Close the quiet boarding thought; the book is offered only after it clears.
  await page.keyboard.press('KeyE')

  const prompt = page.getByRole('button', { name: 'Open the raft sketchbook' })
  await expect(prompt).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shots/sketchbook-raft-prop.png' })
  await prompt.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleName('Graphite study')
  await expect(page.getByRole('button', { name: 'Close sketchbook' })).toBeFocused()
  await expect(dialog.locator('img')).toHaveAttribute('src', '/sketchbook/sketch1.png')
  await expect
    .poll(() => dialog.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)

  const beforeX = await page.evaluate(
    () => (window as unknown as { __cpRuntime: { playerPos: { x: number } } }).__cpRuntime.playerPos.x,
  )
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('heading', { name: 'Maggi Mantis' })).toBeVisible()
  await expect(dialog.locator('img')).toHaveAttribute('src', '/sketchbook/sketch2.png')
  await expect
    .poll(() => dialog.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await page.waitForTimeout(1_000)
  const afterX = await page.evaluate(
    () => (window as unknown as { __cpRuntime: { playerPos: { x: number } } }).__cpRuntime.playerPos.x,
  )
  expect(afterX).toBeGreaterThan(beforeX + 0.05)

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('heading', { name: 'Side by side' })).toBeVisible()
  await expect(dialog.locator('img')).toHaveAttribute('src', '/sketchbook/sketch3.png')
  await expect
    .poll(() => dialog.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)

  const book = dialog.locator('.sketchbook')
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    const bounds = await book.boundingBox()
    expect(bounds, `sketchbook should render at ${viewport.width}×${viewport.height}`).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
    for (const name of ['Close sketchbook', 'Previous page', 'Next page']) {
      const control = await page.getByRole('button', { name }).boundingBox()
      expect(control?.height ?? 0, `${name} should retain a 44px target`).toBeGreaterThanOrEqual(44)
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.screenshot({ path: 'shots/sketchbook-raft.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(prompt).toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __cpStore: { phase: string } }).__cpStore.phase,
      ),
    )
    .toBe('playing')

  // Leaving the crossing removes the offer and any book-owned listeners/state.
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-mountain').click()
  await expect(prompt).not.toBeVisible()
})

test('an east-shore crossing checkpoint resumes after the raft, not at the west entry', async ({
  page,
}) => {
  const save = {
    version: 3,
    chapter: 'crossing',
    checkpoint: {
      chapter: 'crossing',
      position: [42, 0, -1],
      facing: Math.PI / 2,
    },
    memories: [],
    townTasks: [],
    journalPages: [],
    constellations: [],
    reachedParkingLot: false,
    endingComplete: false,
    playedSeconds: 60,
    updatedAt: Date.now(),
  }

  await page.goto('/?alwaysRun=1')
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: SAVE_KEY, value: save },
  )
  await page.reload()
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 20_000 })

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const runtime = (
            window as unknown as {
              __cpRuntime?: {
                playerPos: { x: number }
                interactables: Map<string, unknown>
              }
            }
          ).__cpRuntime
          return {
            onEastShore: (runtime?.playerPos.x ?? -999) >= 38,
            canBoardAgain: runtime?.interactables.has('board-raft') ?? true,
          }
        }),
      { timeout: 10_000 },
    )
    .toEqual({ onEastShore: true, canBoardAgain: false })
})
