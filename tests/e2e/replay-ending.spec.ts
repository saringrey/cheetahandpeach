import { expect, test, type Page } from '@playwright/test'

const SAVE_KEY = 'cheetah-peach.save.v1'

const completedSave = {
  version: 3,
  chapter: 'ending',
  checkpoint: {
    chapter: 'ending',
    position: [3, 0, -7],
    facing: 1.25,
  },
  memories: ['pressed-flower', 'ticket'],
  townTasks: ['recipe', 'parcel'],
  journalPages: ['pressed-flower', 'last'],
  constellations: ['cheetah', 'road-home'],
  reachedParkingLot: true,
  endingComplete: true,
  playedSeconds: 987,
  updatedAt: 123456,
}

async function seedCompletedSave(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key: SAVE_KEY, save: completedSave },
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'Replay Ending' })).toBeVisible({
    timeout: 20_000,
  })
}

async function runtimeState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __cpRuntime?: {
        controlHolds: Set<string>
        playerControlEnabled: boolean
      }
      __cpStore?: {
        save: { chapter: string }
        phase: string
        cinematic: boolean
      }
    }
    return {
      holds: [...(w.__cpRuntime?.controlHolds ?? [])],
      playerControlEnabled: w.__cpRuntime?.playerControlEnabled,
      chapter: w.__cpStore?.save.chapter,
      phase: w.__cpStore?.phase,
      cinematic: w.__cpStore?.cinematic,
    }
  })
}

test('completed save can replay safely and still reset from title', async ({ page }) => {
  test.setTimeout(90_000)
  await seedCompletedSave(page)

  await page.getByRole('button', { name: 'Replay Ending' }).click()
  await expect(page.getByRole('button', { name: 'Replay Ending' })).toBeHidden({
    timeout: 10_000,
  })
  await expect
    .poll(async () => (await runtimeState(page)).chapter, { timeout: 10_000 })
    .toBe('parkingLot')

  const replayed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY)
  expect(replayed.chapter).toBe('parkingLot')
  expect(replayed.checkpoint).toBeNull()
  expect(replayed.memories).toEqual(completedSave.memories)
  expect(replayed.townTasks).toEqual(completedSave.townTasks)
  expect(replayed.journalPages).toEqual(completedSave.journalPages)
  expect(replayed.constellations).toEqual(completedSave.constellations)
  expect(replayed.reachedParkingLot).toBe(true)
  expect(replayed.endingComplete).toBe(true)
  expect(replayed.playedSeconds).toBe(completedSave.playedSeconds)

  // Simulate leaving during an owned ending/camera beat. goToTitle must release
  // both holds before the title scene mounts.
  const titleState = await page.evaluate(() => {
    const w = window as unknown as {
      __cpRuntime: {
        controlHolds: Set<string>
        playerControlEnabled: boolean
        holdControl: (reason: string, held: boolean) => void
      }
      __cpStore: {
        goToTitle: () => void
        cinematic: boolean
      }
    }
    w.__cpRuntime.holdControl('ending', true)
    w.__cpRuntime.holdControl('cinematic', true)
    w.__cpStore.goToTitle()
    return {
      holds: [...w.__cpRuntime.controlHolds],
      playerControlEnabled: w.__cpRuntime.playerControlEnabled,
      cinematic: w.__cpStore.cinematic,
    }
  })
  expect(titleState).toEqual({
    holds: [],
    playerControlEnabled: true,
    cinematic: false,
  })
  await expect(page.getByRole('button', { name: 'Replay Ending' })).toBeVisible({
    timeout: 10_000,
  })

  // Replay again. The authored arrival camera may legitimately take a fresh
  // cinematic hold; it must release it, and no old ending hold may survive.
  await page.evaluate(() => {
    const w = window as unknown as {
      __cpRuntime: { holdControl: (reason: string, held: boolean) => void }
    }
    w.__cpRuntime.holdControl('ending', true)
    w.__cpRuntime.holdControl('cinematic', true)
  })
  await page.getByRole('button', { name: 'Replay Ending' }).click()
  await expect
    .poll(runtimeState.bind(null, page), { timeout: 20_000 })
    .toMatchObject({
      holds: [],
      playerControlEnabled: true,
      chapter: 'parkingLot',
      phase: 'playing',
      cinematic: false,
    })

  await page.evaluate(() => {
    const w = window as unknown as { __cpStore: { goToTitle: () => void } }
    w.__cpStore.goToTitle()
  })
  await expect(page.getByRole('button', { name: 'Reset Progress' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Reset Progress' }).click()
  await page.getByRole('button', { name: 'Yes, erase everything' }).click()

  await expect(page.getByRole('button', { name: 'Replay Ending' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), { timeout: 5_000 })
    .toBeNull()
})
