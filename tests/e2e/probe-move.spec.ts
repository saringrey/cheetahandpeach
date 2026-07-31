import { test, expect, type Page } from '@playwright/test'

/** Real-transition movement regression probe. */

const dump = (page: Page) =>
  page.evaluate(() => {
    const rt = (window as any).__cpRuntime
    const st = (window as any).__cpStore
    return {
      chapter: st.save.chapter,
      phase: st.phase,
      cinematic: st.cinematic,
      dialogue: !!st.dialogue,
      interstitial: st.interstitial,
      fade: st.fade,
      control: rt.playerControlEnabled,
      pos: [+rt.playerPos.x.toFixed(2), +rt.playerPos.y.toFixed(2), +rt.playerPos.z.toFixed(2)],
      bounds: rt.bounds,
      colliders: rt.colliders.length,
      ground: rt.sampleHeight(rt.playerPos.x, rt.playerPos.z),
      // colliders overlapping the player right now
      overlapping: rt.colliders
        .map((c: any) => {
          if (c.kind === 'circle') {
            const d = Math.hypot(rt.playerPos.x - c.x, rt.playerPos.z - c.z)
            return d < c.r + 0.34 ? { kind: 'circle', x: +c.x.toFixed(1), z: +c.z.toFixed(1), r: c.r, pen: +(c.r + 0.34 - d).toFixed(2) } : null
          }
          const cos = Math.cos(-c.rot)
          const sin = Math.sin(-c.rot)
          const rx = (rt.playerPos.x - c.x) * cos - (rt.playerPos.z - c.z) * sin
          const rz = (rt.playerPos.x - c.x) * sin + (rt.playerPos.z - c.z) * cos
          return Math.abs(rx) < c.hw + 0.34 && Math.abs(rz) < c.hd + 0.34
            ? { kind: 'box', x: +c.x.toFixed(1), z: +c.z.toFixed(1), hw: c.hw, hd: c.hd }
            : null
        })
        .filter(Boolean)
        .slice(0, 8),
    }
  })

async function tryMove(page: Page) {
  const before = await page.evaluate(() => {
    const rt = (window as any).__cpRuntime
    return [rt.playerPos.x, rt.playerPos.z]
  })
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1800)
  await page.keyboard.up('KeyW')
  const after = await page.evaluate(() => {
    const rt = (window as any).__cpRuntime
    return [rt.playerPos.x, rt.playerPos.z]
  })
  return +Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(2)
}

const TARGETS = ['town', 'forest', 'crossing', 'mountain', 'transition', 'parkingLot'] as const

test('probe: can the player move after a real chapter transition', async ({ page }) => {
  test.setTimeout(600_000)
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console.error]', m.text())
  })

  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(2_500)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-unlock-memories').click()
  await page.getByTestId('debug-panel').getByText('×').click()

  for (const target of TARGETS) {
    await page.evaluate((c) => (window as any).__cpStore.transitionToChapter(c), target)
    // transition takes 11.2s; intro cinematic another ~5s
    await page.waitForTimeout(12_000)
    const atArrival = await dump(page)
    await page.waitForTimeout(8_000)
    const settled = await dump(page)
    const moved = await tryMove(page)
    const afterMove = await dump(page)

    console.log(`\n════ ${target}`)
    console.log('  arrival :', JSON.stringify(atArrival))
    console.log('  settled :', JSON.stringify(settled))
    console.log('  moved   :', moved, 'units')
    console.log('  after   :', JSON.stringify(afterMove))
    expect(moved, `${target}: control returned but W did not move the player`).toBeGreaterThan(0.5)
  }
})
