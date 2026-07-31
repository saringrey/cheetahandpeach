import { test, type Page } from '@playwright/test'

/**
 * Not an assertion suite — a visual capture pass. Drives the game to each
 * chapter and writes a screenshot to `shots/`, so the look of every region can
 * be reviewed without playing through by hand.
 *
 * Run with:  npx playwright test shots
 */

const CHAPTERS = ['town', 'forest', 'crossing', 'mountain', 'transition', 'parkingLot'] as const

async function boot(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'shots/00a-loading-peach.png' })
  await page.getByRole('button', { name: 'New Game' }).waitFor({ timeout: 20_000 })
}

async function placeAtParkSign(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as {
      __cpRuntime?: {
        playerPos: { set: (x: number, y: number, z: number) => void }
        playerFacing: number
        camYaw: number
        sampleHeight: (x: number, z: number) => number
      }
      __cpStore?: { completeTownTask: (task: string) => void }
    }
    for (const task of ['recipe', 'flowers', 'letter']) {
      win.__cpStore?.completeTownTask(task)
    }
    const runtime = win.__cpRuntime
    if (!runtime) return
    // The text plane faces the sign's local +Z. Stand on that side and put the
    // follow camera behind the player so the lit lettering is square-on.
    const x = -24
    const z = -12.5
    runtime.playerPos.set(x, runtime.sampleHeight(x, z), z)
    runtime.playerFacing = -Math.PI * 0.53
    runtime.camYaw = Math.PI * 0.47
  })
  await page.waitForTimeout(2_000)
}

test('capture every region', async ({ page }) => {
  // Generous on purpose. `?alwaysRun=1` drives frames from a worker at 16 ms so
  // the loop survives an occluded tab, which means screenshot capture competes
  // with rendering for the main thread — a single full-page capture of a busy
  // scene can take tens of seconds. This suite asserts nothing; it only has to
  // finish, so it is given room rather than being made to race.
  test.setTimeout(600_000)
  await boot(page)

  // Capture the title the way a player actually sees it, after its intentional
  // 900 ms focus pull has settled.
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: 'shots/00-title.png' })

  await page.getByRole('button', { name: 'New Game' }).click()
  // Let the opening cinematic finish and hand back control.
  await page.waitForTimeout(16_000)
  await page.screenshot({ path: 'shots/01-cottage-bedroom.png' })
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'shots/01a-cottage-compass.png' })

  // Walk out of the cottage so the exterior reveal is captured too.
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(4_500)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(4_000)
  await page.screenshot({ path: 'shots/02-cottage-outside.png' })

  let i = 3
  for (const chapter of CHAPTERS) {
    // Open the panel, jump, then close it again. Leaving it open covered the
    // left third of every capture, which made the whole point of this suite —
    // looking at the game — impossible.
    await page.keyboard.press('Shift+Backquote')
    await page.getByTestId(`debug-jump-${chapter}`).click()
    await page.keyboard.press('Shift+Backquote')
    await page.waitForTimeout(9_000)
    await page.screenshot({ path: `shots/${String(i).padStart(2, '0')}-${chapter}.png` })
    if (chapter === 'town') {
      await placeAtParkSign(page)
      await page.screenshot({ path: 'shots/03a-town-ty-warner-sign.png' })
    }
    if (chapter === 'forest') {
      await page.evaluate(() => {
        const runtime = (
          window as unknown as {
            __cpRuntime?: {
              interactables: Map<string, { position: [number, number, number] }>
              playerPos: { set: (x: number, y: number, z: number) => void }
              playerFacing: number
            }
          }
        ).__cpRuntime
        const memory = runtime?.interactables.get('memory-photograph')?.position
        if (!runtime || !memory) return
        // Stand just inside the authored 2.8 m pickup radius, with the camera
        // slightly off-axis so the keepsake and its prompt are not hidden
        // directly behind the character.
        runtime.playerPos.set(memory[0] + 2.55, memory[1], memory[2])
        runtime.playerFacing = -1.2
      })
      await page.waitForTimeout(1_500)
      await page.screenshot({ path: 'shots/04a-forest-photograph-memento.png' })
    }
    i++
  }
  await page.keyboard.press('Shift+Backquote')

  // The ending, with the message on screen.
  await page.getByTestId('debug-ending').click()
  await page.keyboard.press('Shift+Backquote')
  // The second message group enters at ~24 s; let its blur resolve before
  // treating the frame as visual evidence.
  await page.waitForTimeout(27_000)
  await page.screenshot({ path: 'shots/09-ending.png' })
})

test('capture the lit Ty Warner Park sign close-up', async ({ page }) => {
  test.setTimeout(90_000)
  await boot(page)
  await page.getByRole('button', { name: 'New Game' }).click()
  await page.waitForTimeout(2_000)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-town').click()
  await page.getByTestId('debug-panel').getByText('×').click()
  await page.waitForTimeout(9_000)
  await placeAtParkSign(page)
  await page.screenshot({ path: 'shots/03a-town-ty-warner-sign.png' })
})
