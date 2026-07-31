import { expect, test, type Page } from '@playwright/test'

async function bootParkingLot(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click()
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-parkingLot').click()
  await page.waitForTimeout(1_500)
  await page.keyboard.press('Shift+Backquote')
}

test('renderer does not boot through deprecated soft-shadow mode', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })

  await bootParkingLot(page)

  expect(
    warnings.filter((message) => message.includes('PCFSoftShadowMap')),
    'quality setup must use supported PCFShadowMap from first frame',
  ).toEqual([])
})

test('APPROACH starts once at parking-lot spawn and does not restart at the car', async ({
  page,
}) => {
  const approachResponses: number[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/audio/music/approach.mp3') {
      approachResponses.push(response.status())
    }
  })

  await bootParkingLot(page)

  const key = 'music:/audio/music/approach.mp3'
  await expect
    .poll(
      () =>
        page.evaluate(
          (audioKey) =>
            (
              window as unknown as {
                __cpAudio?: {
                  snapshot: () => {
                    activeOptionalKeys: string[]
                    optionalStartCounts: Record<string, number>
                  }
                }
              }
            ).__cpAudio?.snapshot().optionalStartCounts[audioKey] ?? 0,
          key,
        ),
      { message: 'APPROACH should start before the player leaves the spawn point' },
    )
    .toBe(1)

  const atSpawn = await page.evaluate((audioKey) => {
    const win = window as unknown as {
      __cpAudio?: {
        snapshot: () => {
          activeOptionalKeys: string[]
          optionalStartCounts: Record<string, number>
        }
      }
      __cpRuntime?: {
        interactables: Map<string, { position: [number, number, number] }>
        playerPos: { x: number; z: number; set: (x: number, y: number, z: number) => void }
      }
    }
    const runtime = win.__cpRuntime
    const target = runtime?.interactables.get('get-in')?.position
    const snapshot = win.__cpAudio?.snapshot()
    if (!runtime || !target || !snapshot) return null
    const distance = Math.hypot(
      target[0] - runtime.playerPos.x,
      target[2] - runtime.playerPos.z,
    )
    runtime.playerPos.set(target[0], target[1], target[2])
    return {
      distance,
      active: snapshot.activeOptionalKeys.includes(audioKey),
    }
  }, key)

  expect(atSpawn?.distance, 'song must already play at the deliberate distant spawn').toBeGreaterThan(8)
  expect(atSpawn?.active).toBe(true)
  await page.waitForTimeout(600)

  const afterOldTrigger = await page.evaluate(
    (audioKey) =>
      (
        window as unknown as {
          __cpAudio?: {
            snapshot: () => {
              activeOptionalKeys: string[]
              optionalStartCounts: Record<string, number>
            }
          }
        }
      ).__cpAudio?.snapshot().optionalStartCounts[audioKey] ?? 0,
    key,
  )
  expect(afterOldTrigger, 'the former near-car trigger must not restart APPROACH').toBe(1)
  expect(approachResponses).toContain(200)

  await page.evaluate(() => {
    (
      window as unknown as {
        __cpStore?: { markEndingComplete: () => void }
      }
    ).__cpStore?.markEndingComplete()
  })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Return to title' }).click()
  await expect(page.getByRole('button', { name: 'Replay Ending' })).toBeVisible()

  const afterTitle = await page.evaluate(() => {
    return (
      window as unknown as {
        __cpAudio?: {
          snapshot: () => {
            activeOptionalKeys: string[]
          }
        }
      }
    ).__cpAudio?.snapshot().activeOptionalKeys ?? []
  })
  expect(afterTitle, 'Return to title must stop personal audio immediately').not.toContain(key)

  await page.getByRole('button', { name: 'Replay Ending' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          (audioKey) =>
            (
              window as unknown as {
                __cpAudio?: {
                  snapshot: () => {
                    optionalStartCounts: Record<string, number>
                  }
                }
              }
            ).__cpAudio?.snapshot().optionalStartCounts[audioKey] ?? 0,
          key,
        ),
      { message: 'Replay Ending should start one fresh APPROACH source' },
    )
    .toBe(2)
})

test('Return to title invalidates a late APPROACH decode', async ({ page }) => {
  const key = 'music:/audio/music/approach.mp3'
  await page.route('**/audio/music/approach.mp3', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    await route.continue()
  })

  await bootParkingLot(page)
  const whileLoading = await page.evaluate(() => {
    return (
      window as unknown as {
        __cpAudio?: {
          snapshot: () => {
            pendingOptionalKeys: string[]
          }
        }
      }
    ).__cpAudio?.snapshot().pendingOptionalKeys ?? []
  })
  expect(whileLoading).toContain(key)

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Return to title' }).click()
  await page.waitForTimeout(3_500)

  const afterDecode = await page.evaluate(() => {
    return (
      window as unknown as {
        __cpAudio?: {
          snapshot: () => {
            activeOptionalKeys: string[]
            pendingOptionalKeys: string[]
            optionalStartCounts: Record<string, number>
          }
        }
      }
    ).__cpAudio?.snapshot()
  })
  expect(afterDecode?.activeOptionalKeys).not.toContain(key)
  expect(afterDecode?.pendingOptionalKeys).not.toContain(key)
  expect(afterDecode?.optionalStartCounts[key] ?? 0).toBe(0)
})

test('Get in target is on Cheetah driver side', async ({ page }) => {
  await bootParkingLot(page)

  const approach = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: {
          interactables: Map<string, { position: [number, number, number] }>
          playerPos: { x: number; z: number }
          playerFacing: number
        }
      }
    ).__cpRuntime
    const target = runtime?.interactables.get('get-in')?.position
    if (!runtime || !target) return null
    const dx = target[0] - runtime.playerPos.x
    const dz = target[2] - runtime.playerPos.z
    const distance = Math.hypot(dx, dz)
    const forwardX = Math.sin(runtime.playerFacing)
    const forwardZ = Math.cos(runtime.playerFacing)
    return {
      target,
      playerX: runtime.playerPos.x,
      distance,
      facingDot: (forwardX * dx + forwardZ * dz) / Math.max(distance, 0.0001),
    }
  })

  expect(approach, 'parking-lot get-in target must register').not.toBeNull()
  expect(approach!.target[0], 'driver door must be local -X / left of car center').toBeLessThan(0)
  expect(approach!.playerX, 'Cheetah should arrive to the left of the driver door').toBeLessThan(
    approach!.target[0],
  )
  expect(approach!.distance, 'approach should begin at a deliberate walkable distance').toBeGreaterThanOrEqual(8)
  expect(approach!.distance).toBeLessThanOrEqual(16)
  expect(approach!.facingDot, 'spawn must face directly toward the driver door').toBeGreaterThan(0.95)
})

test('birthday message waits until player closes conversation', async ({ page }) => {
  test.setTimeout(90_000)
  await bootParkingLot(page)

  const passBaseline = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: {
          interactables: Map<string, { onInteract: () => void }>
          trafficPasses: number
        }
      }
    ).__cpRuntime
    runtime?.interactables.get('get-in')?.onInteract()
    return runtime?.trafficPasses ?? 0
  })

  await page.waitForTimeout(7_000)
  await expect(
    page.getByText('I’m sorry it took me so long.'),
    'Peach must leave room for the entry and opening silence',
  ).toBeHidden()

  await expect(page.getByText('I’m sorry it took me so long.')).toBeVisible({
    timeout: 45_000,
  })
  const opening = await page.evaluate(() => {
    const win = window as unknown as {
      __cpRuntime?: { trafficPasses: number }
      __cpStore?: { dialogue: { text: string }[] | null; dialogueIndex: number }
    }
    return {
      passes: win.__cpRuntime?.trafficPasses ?? 0,
      first: win.__cpStore?.dialogue?.[0]?.text ?? null,
      index: win.__cpStore?.dialogueIndex ?? -1,
    }
  })
  expect(opening.passes, 'at least one visible road crossing must precede the apology').toBeGreaterThan(
    passBaseline,
  )
  expect(opening.first).toBe('I’m sorry it took me so long.')
  expect(opening.index).toBe(0)
  await page.screenshot({ path: 'shots/polish-interior-conversation.png' })
  await page.waitForTimeout(24_000)

  await expect(
    page.getByText('I am so glad it was you.'),
    'note must remain gated while conversation is still open',
  ).toBeHidden()
  const endingActive = await page.evaluate(
    () =>
      (
        window as unknown as {
          __cpStore?: { endingActive: boolean }
        }
      ).__cpStore?.endingActive,
  )
  expect(endingActive).toBe(false)
})
