import { test, type Page } from '@playwright/test'

/**
 * Not an assertion suite — a visual capture pass for the player character's
 * proportions, so a change to her build can be reviewed against the world she
 * stands in rather than only against the numbers in Girl.tsx.
 *
 * Run with:  npx playwright test girl-scale
 */

async function boot(page: Page) {
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: 'New Game' }).click()
  await page.waitForTimeout(2_000)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-town').click()
  await page.keyboard.press('Shift+Backquote')
  await page.waitForTimeout(9_000)
}

/** Pulls the follow camera in to a given distance and settles it. */
async function frame(page: Page, distance: number, lookHeight: number) {
  await page.evaluate(
    ({ distance, lookHeight }) => {
      const runtime = (
        window as unknown as {
          __cpRuntime?: {
            camDistance: number
            camDistanceTarget: number
            camLookHeight: number
            camPitch: number
          }
        }
      ).__cpRuntime
      if (!runtime) return
      runtime.camDistance = distance
      runtime.camDistanceTarget = distance
      runtime.camLookHeight = lookHeight
      runtime.camPitch = 0.12
    },
    { distance, lookHeight },
  )
  await page.waitForTimeout(700)
}

test('measure the player character against the world', async ({ page }) => {
  test.setTimeout(180_000)
  await boot(page)

  // Screenshots of a game set at night can only say so much. The decisive
  // check is the bounding box: how tall she actually is, and how she compares
  // to the grown-ups standing next to her.
  const measured = await page.evaluate(() => {
    type Obj = {
      name: string
      children: Obj[]
      matrixWorld: { elements: number[] }
      geometry?: { boundingBox: { min: Vec; max: Vec } | null; computeBoundingBox: () => void }
    }
    type Vec = { x: number; y: number; z: number }

    const scene = (window as unknown as { __cpScene?: Obj }).__cpScene
    if (!scene) return null

    const find = (o: Obj, name: string): Obj | null => {
      if (o.name === name) return o
      for (const c of o.children) {
        const hit = find(c, name)
        if (hit) return hit
      }
      return null
    }
    const girl = find(scene, 'girl')
    if (!girl) return null

    // World-space Y extent, without needing a THREE handle in the page: push
    // every mesh's local bounding-box corners through its own world matrix.
    let min = Infinity
    let max = -Infinity
    const walk = (o: Obj) => {
      const g = o.geometry
      if (g) {
        if (!g.boundingBox) g.computeBoundingBox()
        const bb = g.boundingBox
        const e = o.matrixWorld.elements
        if (bb) {
          for (const x of [bb.min.x, bb.max.x]) {
            for (const y of [bb.min.y, bb.max.y]) {
              for (const z of [bb.min.z, bb.max.z]) {
                const wy = e[1] * x + e[5] * y + e[9] * z + e[13]
                if (wy < min) min = wy
                if (wy > max) max = wy
              }
            }
          }
        }
      }
      for (const c of o.children) walk(c)
    }
    walk(girl)
    const feet = girl.matrixWorld.elements[13]
    return { height: Number((max - min).toFixed(3)), aboveFeet: Number((max - feet).toFixed(3)) }
  })
  console.log('girl height (world units):', JSON.stringify(measured))

  // Default framing, standing still: is she in frame, and how does she read
  // against the buildings and the townspeople?
  await page.screenshot({ path: 'shots/girl-01-default-framing.png' })

  // Walking, so the gait and the stride length can be seen.
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1_600)
  await page.screenshot({ path: 'shots/girl-02-walking.png' })
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(1_200)

  // The game is set at night and lit for mood, which is right for playing and
  // useless for judging a silhouette. Flood the scene, crop to her, and look.
  await page.evaluate(() => {
    type Obj = { children: Obj[]; isLight?: boolean; intensity?: number }
    const scene = (window as unknown as { __cpScene?: Obj }).__cpScene
    if (!scene) return
    const walk = (o: Obj) => {
      if (o.isLight && typeof o.intensity === 'number') o.intensity *= 6
      for (const c of o.children) walk(c)
    }
    walk(scene)
  })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: 'shots/girl-03-closeup.png',
    clip: { x: 460, y: 250, width: 380, height: 380 },
  })

  // Next to a townsperson, which is the only comparison that actually settles
  // whether she reads as a child.
  const npcId = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __cpRuntime?: {
          interactables: Map<string, { position: [number, number, number] }>
          playerPos: { set: (x: number, y: number, z: number) => void }
          playerFacing: number
          camYaw: number
          sampleHeight: (x: number, z: number) => number
        }
      }
    ).__cpRuntime
    if (!runtime) return null
    const entry = [...runtime.interactables.entries()][0]
    if (!entry) return null
    const [id, { position }] = entry
    const [x, , z] = position
    runtime.playerPos.set(x + 1.0, runtime.sampleHeight(x + 1.0, z), z + 1.6)
    runtime.playerFacing = Math.PI
    runtime.camYaw = 0
    return id
  })
  console.log('standing beside interactable:', npcId)
  await page.waitForTimeout(1_800)
  await page.screenshot({ path: 'shots/girl-04-beside-npc.png' })
})
