import { expect, test } from '@playwright/test'

test('environment stars, dense trees, and centered subtitle frame render together', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')

  await page.getByRole('button', { name: 'New Game' }).waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => document.documentElement.dataset.webglReady === 'true',
    undefined,
    { timeout: 20_000 },
  )
  await expect(page.locator('.menu-sky')).toHaveCount(0)
  await page.screenshot({ path: 'shots/polish-environment-stars.png' })

  await page.getByRole('button', { name: 'New Game' }).click()
  await page.waitForTimeout(800)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-forest').click()
  await page.keyboard.press('Shift+Backquote')
  await page.waitForTimeout(7_000)

  const assetLoads = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/models/trees/quaternius/')),
  )
  expect(assetLoads.length).toBeGreaterThanOrEqual(8)
  await page.screenshot({ path: 'shots/polish-dense-forest.png' })

  await page.evaluate(() => {
    const store = (
      window as unknown as {
        __cpStore?: {
          startDialogue: (lines: { speaker: string; text: string }[]) => void
        }
      }
    ).__cpStore
    store?.startDialogue([
      {
        speaker: 'Peach',
        text: 'The subtitles belong in the middle of the world.',
      },
    ])
  })

  const dialogue = page.locator('.dialogue')
  await expect(dialogue).toBeVisible()
  const box = await dialogue.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 640)).toBeLessThan(2)
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - 360)).toBeLessThan(2)

  const presentation = await page.locator('.dialogue__core').evaluate((element) => {
    const core = getComputedStyle(element)
    const frame = getComputedStyle(element.parentElement as HTMLElement, '::before')
    return {
      background: core.backgroundImage,
      frameBorder: frame.borderTopColor,
      frameAnimation: frame.animationName,
    }
  })
  expect(presentation.background).toContain('0.58')
  expect(presentation.frameBorder).toContain('255')
  expect(presentation.frameAnimation).toBe('subtitlePerimeter')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'shots/polish-centered-subtitle.png' })
})
