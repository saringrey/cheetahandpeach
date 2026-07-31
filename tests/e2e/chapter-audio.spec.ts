import { expect, test } from '@playwright/test'

const CHAPTER_AMBIENCE = [
  ['cottage', 'bedroom'],
  ['town', 'town'],
  ['forest', 'forest'],
  ['crossing', 'water'],
  ['mountain', 'mountain'],
  ['transition', 'transition'],
  ['parkingLot', 'parkingLot'],
] as const

test('every chapter activates its own atmosphere soundscape', async ({ page }) => {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click()
  await page.keyboard.press('Shift+Backquote')

  for (const [chapter, ambience] of CHAPTER_AMBIENCE) {
    await page.getByTestId(`debug-jump-${chapter}`).click()
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __cpAudio?: {
                    snapshot: () => { currentAmbience: string }
                  }
                }
              ).__cpAudio?.snapshot().currentAmbience ?? null,
          ),
        { message: `${chapter} should own a perceptibly different ambience` },
      )
      .toBe(ambience)
  }
})
