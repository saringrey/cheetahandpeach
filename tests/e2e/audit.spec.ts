import { test, expect, type Page } from '@playwright/test'

/**
 * Interaction audit.
 *
 * Walks every chapter and pulls the live interactable registry and collider set
 * out of the runtime, then asserts the invariants that actually break a
 * playthrough:
 *
 *  - ids are unique (a duplicate silently overwrites the earlier one, because
 *    the registry is a Map)
 *  - every interactable sits inside the play bounds and on finite ground
 *  - no interactable is buried inside a collider it cannot be reached through
 *  - radii are large enough to be walked into
 *  - a re-render does not empty the registry (the bug that made the car
 *    non-solid and hid the "Get in" prompt)
 */

const CHAPTERS = ['cottage', 'town', 'forest', 'crossing', 'mountain', 'transition', 'parkingLot'] as const

const REQUIRED_INTERACTIONS: Record<(typeof CHAPTERS)[number], readonly string[]> = {
  cottage: [
    'bedroom-journal',
    'bedroom-window',
    'bedroom-cheetah',
    'bedroom-peach',
    'bedroom-frame',
    'bedroom-flowers',
    'cottage-sign',
  ],
  town: [
    'park-sign',
    'town-bell',
    'town-cat',
    'town-ducks',
    'town-bench',
    'hill-bench',
    'baker',
    'recipe-page',
    'florist',
    'water-flowers',
    'bookseller',
    'quiet-man',
  ],
  forest: [
    'forest-sit',
    'forest-deer',
    'memory-pressed-flower',
    'memory-photograph',
    'memory-ticket',
    'memory-music-box',
    'memory-peach-charm',
  ],
  crossing: ['board-raft', 'memory-river-stone', 'crossing-reeds'],
  mountain: ['marker-1', 'marker-2', 'chimes', 'rest'],
  transition: ['wildflower'],
  parkingLot: ['lot-lamp', 'get-in'],
}

interface AuditRow {
  id: string
  verb: string
  x: number
  z: number
  radius: number
  ground: number | null
  inBounds: boolean
  /** How far inside a solid collider the interactable's centre sits. */
  buriedBy: number
}

async function auditChapter(page: Page, chapter: string) {
  await page.getByTestId(`debug-jump-${chapter}`).click()
  await page.waitForTimeout(4_500)

  return page.evaluate(() => {
    const rt = (window as unknown as { __cpRuntime?: any }).__cpRuntime
    const b = rt.bounds
    const rows: AuditRow[] = []

    for (const [id, it] of rt.interactables) {
      const [x, , z] = it.position
      const ground = rt.sampleHeight(x, z)

      // How deep inside a solid shape is it?
      let buried = 0
      for (const c of rt.colliders) {
        if (c.kind === 'circle') {
          const d = Math.hypot(x - c.x, z - c.z)
          if (d < c.r) buried = Math.max(buried, c.r - d)
        } else {
          const cos = Math.cos(-c.rot)
          const sin = Math.sin(-c.rot)
          const rx = (x - c.x) * cos - (z - c.z) * sin
          const rz = (x - c.x) * sin + (z - c.z) * cos
          if (Math.abs(rx) < c.hw && Math.abs(rz) < c.hd) {
            buried = Math.max(buried, Math.min(c.hw - Math.abs(rx), c.hd - Math.abs(rz)))
          }
        }
      }

      rows.push({
        id,
        verb: it.verb,
        x: +x.toFixed(1),
        z: +z.toFixed(1),
        radius: it.radius,
        ground: Number.isFinite(ground) ? +ground.toFixed(1) : null,
        inBounds: x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ,
        buriedBy: +buried.toFixed(2),
      })
    }
    return { rows, colliders: rt.colliders.length }
  }) as Promise<{ rows: AuditRow[]; colliders: number }>
}

test('every interaction in every chapter is reachable and sane', async ({ page }) => {
  test.setTimeout(240_000)
  const problems: string[] = []

  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(2_000)
  await page.keyboard.press('Shift+Backquote')

  for (const chapter of CHAPTERS) {
    const { rows, colliders } = await auditChapter(page, chapter)

    // eslint-disable-next-line no-console
    console.log(
      `\n── ${chapter}  (${rows.length} interactions, ${colliders} colliders)\n` +
        rows
          .map(
            (r) =>
              `   ${r.id.padEnd(22)} ${r.verb.padEnd(8)} (${String(r.x).padStart(6)},${String(r.z).padStart(7)})` +
              ` r=${String(r.radius).padEnd(4)} ground=${String(r.ground).padStart(5)}` +
              `${r.inBounds ? '' : '  OUT-OF-BOUNDS'}${r.buriedBy > 0 ? `  BURIED ${r.buriedBy}` : ''}`,
          )
          .join('\n'),
    )

    expect(rows.length, `${chapter} registered no interactions`).toBeGreaterThan(0)
    expect(colliders, `${chapter} registered no colliders`).toBeGreaterThan(0)

    const ids = rows.map((r) => r.id)
    for (const required of REQUIRED_INTERACTIONS[chapter]) {
      if (!ids.includes(required)) problems.push(`${chapter}: missing interaction ${required}`)
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dupes.length) problems.push(`${chapter}: duplicate interaction ids ${[...new Set(dupes)].join(', ')}`)

    for (const r of rows) {
      if (!r.inBounds) problems.push(`${chapter}/${r.id}: outside the play bounds at (${r.x}, ${r.z})`)
      if (r.ground === null) problems.push(`${chapter}/${r.id}: sits on non-finite ground`)
      if (r.radius < 1.2) problems.push(`${chapter}/${r.id}: radius ${r.radius} is too small to walk into`)
      // Sitting inside your own prop's collider is normal and fine — a bench
      // interactable lives at the bench. What matters is whether she can stand
      // somewhere that is BOTH outside the solid shape and inside the radius.
      // That needs radius > buriedBy + body radius.
      const BODY = 0.34
      if (r.radius <= r.buriedBy + BODY) {
        problems.push(
          `${chapter}/${r.id}: unreachable — radius ${r.radius} does not clear ` +
            `its own collider (buried ${r.buriedBy} + body ${BODY})`,
        )
      }
    }
  }

  expect(problems, `interaction problems:\n${problems.join('\n')}`).toEqual([])
})

test('a re-render never empties the interaction registry', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?alwaysRun=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?alwaysRun=1')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 20_000 })
  await page.waitForTimeout(2_000)
  await page.keyboard.press('Shift+Backquote')
  await page.getByTestId('debug-jump-town').click()
  await page.waitForTimeout(5_000)

  const count = () =>
    page.evaluate(() => {
      const rt = (window as unknown as { __cpRuntime?: any }).__cpRuntime
      return { ints: rt.interactables.size, cols: rt.colliders.length }
    })

  const before = await count()
  expect(before.ints).toBeGreaterThan(0)

  // Force store writes of the kind gameplay performs. These are chosen because
  // they re-render the scene WITHOUT mounting or unmounting anything, so the
  // counts must come back identical. (Completing a task legitimately removes
  // its pickup, so it is not a valid probe here.)
  await page.evaluate(() => {
    const st = (window as unknown as { __cpStore?: any }).__cpStore
    st.showToast('probe')
    st.setNarration('probe')
    st.showChapterCard('probe')
  })
  await page.waitForTimeout(1_500)

  const after = await count()
  expect(after.ints, 'interactables were wiped by a re-render').toBe(before.ints)
  expect(after.cols, 'colliders were wiped by a re-render').toBe(before.cols)

  await page.evaluate(() => {
    const st = (window as unknown as { __cpStore?: any }).__cpStore
    st.setNarration(null)
  })
})
