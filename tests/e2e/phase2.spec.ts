import { test, expect, type Page } from '@playwright/test'

/**
 * Phase-2 regression tests: the two bugs that were reported, plus captures of
 * the new content so the look can be reviewed.
 */

async function boot(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: 'New Game' }).click()
  await page.waitForTimeout(2_000)
}

/** Reads the live player position out of the runtime singleton. */
async function playerPos(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __cp?: { x: number; y: number; z: number } }
    return w.__cp ?? null
  })
}

async function walkToInteractable(page: Page, id: string, promptText: string) {
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
      { timeout: 20_000 },
    )
    .toBe(true)

  const prompt = page.getByText(promptText, { exact: true })
  for (let i = 0; i < 55 && !(await prompt.isVisible()); i++) {
    const found = await page.evaluate((targetId) => {
      const runtime = (
        window as unknown as {
          __cpRuntime?: {
            playerPos: { x: number; z: number }
            camYaw: number
            interactables: Map<string, { position: [number, number, number] }>
          }
        }
      ).__cpRuntime
      const target = runtime?.interactables.get(targetId)?.position
      if (!runtime || !target) return false
      const dx = target[0] - runtime.playerPos.x
      const dz = target[2] - runtime.playerPos.z
      runtime.camYaw = Math.atan2(-dx, -dz)
      return true
    }, id)
    expect(found, `${id} target must stay registered`).toBe(true)

    await page.keyboard.down('KeyW')
    await page.waitForTimeout(320)
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(120)
  }
  await expect(prompt, `${promptText} prompt must appear after real walking`).toBeVisible({
    timeout: 10_000,
  })
}

test('petting the cat does not teleport the player', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)

  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-town').click()
  await page.waitForTimeout(6_000)
  await page.keyboard.press('Shift+Backquote')

  const before = await playerPos(page)
  expect(before, 'runtime position probe must be installed').not.toBeNull()

  // Walk a little so we are demonstrably away from the spawn point.
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2_500)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(600)

  const moved = await playerPos(page)
  const walked = Math.hypot(moved!.x - before!.x, moved!.z - before!.z)
  expect(walked, 'player should have walked somewhere').toBeGreaterThan(1)

  // Now force the exact state write that used to reset the spawn effect.
  await page.evaluate(() => {
    const w = window as unknown as { __cpStore?: { completeTownTask: (id: string) => void } }
    w.__cpStore?.completeTownTask('flowers')
  })
  await page.waitForTimeout(1_200)

  const after = await playerPos(page)
  const jumped = Math.hypot(after!.x - moved!.x, after!.z - moved!.z)
  expect(jumped, 'a progress write must not move the player').toBeLessThan(2)
})

test('a repeating trigger does not re-fire the instant it is dismissed', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)

  await page.evaluate(() => {
    const w = window as unknown as {
      __cpStore?: { startDialogue: (l: { speaker: null; text: string }[]) => void }
    }
    w.__cpStore?.startDialogue([{ speaker: null, text: 'probe' }])
  })
  await expect(page.getByText('probe')).toBeVisible({ timeout: 5_000 })

  await page.keyboard.press('KeyE')
  await expect(page.getByText('probe')).toBeHidden({ timeout: 5_000 })
  // It must stay dismissed.
  await page.waitForTimeout(2_500)
  await expect(page.getByText('probe')).toBeHidden()
})

test('the silhouette meets her outside the cottage', async ({ page }) => {
  test.setTimeout(150_000)
  await boot(page)

  // Let the opening cinematic finish and hand back control.
  await page.waitForTimeout(13_000)

  // Walk out of the door, in bursts, until the beat fires.
  const line = page.getByText('I was nothing when I met you.')
  for (let i = 0; i < 8 && !(await line.isVisible()); i++) {
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(1_800)
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(1_200)
  }
  await expect(line).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: 'shots/p2-01b-silhouette-line.png' })
})

test('captures of the new content', async ({ page }) => {
  test.setTimeout(180_000)
  await boot(page)

  // The silhouette outside the cottage.
  await page.waitForTimeout(12_000)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(5_000)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(5_000)
  await page.screenshot({ path: 'shots/p2-01-silhouette.png' })

  // Ty Warner Park.
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-town').click()
  await page.waitForTimeout(7_000)
  await page.keyboard.press('Shift+Backquote')
  await page.screenshot({ path: 'shots/p2-02-town-hill.png' })

  // The parking lot with the white sedan.
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-parkingLot').click()
  await page.waitForTimeout(8_000)
  await page.keyboard.press('Shift+Backquote')
  await page.screenshot({ path: 'shots/p2-03-white-sedan.png' })
})

test('the ending plays for real: she walks to the car and gets in', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)

  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-parkingLot').click()
  await page.waitForTimeout(8_000)
  await page.keyboard.press('Shift+Backquote')

  // Real deterministic walking: debug runtime supplies only target bearing.
  // Movement still goes through normal keyboard input, controller, and collisions.
  await walkToInteractable(page, 'get-in', 'Get in')
  await page.screenshot({ path: 'shots/p2-04-get-in.png' })

  // Get in. Cheetah drives; Peach appears passenger-side only in the cabin.
  await page.keyboard.press('KeyE')

  const conversation = [
    'I’m sorry it took me so long.',
    'I remember how easy it was to stay.',
    'We kept talking while the whole road moved past us.',
    'Nothing extraordinary was happening.',
  ]
  await expect(page.getByText(conversation[0], { exact: true })).toBeVisible({ timeout: 45_000 })
  await page.screenshot({ path: 'shots/p2-05-peachy-speaks.png' })
  for (let i = 0; i < conversation.length; i++) {
    await expect(page.getByText(conversation[i], { exact: true })).toBeVisible({ timeout: 8_000 })
    await page.keyboard.press('KeyE')
  }

  // Note begins only after dialogue closes and the next visible traffic pass.
  await expect(page.getByText('I am so glad it was you.')).toBeVisible({ timeout: 40_000 })
  await page.screenshot({ path: 'shots/p2-06-the-note.png' })

  await expect(page.getByText('Every road was leading here.')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'shots/p2-07-message.png' })

  await expect(page.getByText('I love you.')).toBeVisible({ timeout: 60_000 })

  // The written overlay yields to the quiet windshield callback. The same two
  // mugs from the river bench are now on the dashboard while a car passes.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __cpStore?: { endingCallbackReady: boolean }
              }
            ).__cpStore?.endingCallbackReady,
        ),
      { timeout: 20_000 },
    )
    .toBe(true)
  await expect(page.getByRole('button', { name: 'Return to the title' })).toBeHidden()
  await page.waitForTimeout(2_400)
  await page.screenshot({ path: 'shots/p2-08-mug-callback.png' })

  // Completion records only after the passing-car beat returns to the cabin.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __cpStore?: { endingCallbackDone: boolean }
              }
            ).__cpStore?.endingCallbackDone,
        ),
      { timeout: 20_000 },
    )
    .toBe(true)
  await expect(page.getByRole('button', { name: 'Return to the title' })).toBeVisible({
    timeout: 5_000,
  })
  const save = await page.evaluate(() => localStorage.getItem('cheetah-peach.save.v1'))
  expect(JSON.parse(save!).endingComplete).toBe(true)
})
