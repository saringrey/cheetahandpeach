import { expect, test, type APIRequestContext } from '@playwright/test'

const RELEASE_ASSETS = [
  { path: '/audio/music/approach.mp3', type: /^audio\/mpeg(?:;|$)/i },
  { path: '/sketchbook/sketch1.png', type: /^image\/png(?:;|$)/i },
  { path: '/sketchbook/sketch2.png', type: /^image\/png(?:;|$)/i },
  { path: '/sketchbook/sketch3.png', type: /^image\/png(?:;|$)/i },
  { path: '/memories/cheetahpic.png', type: /^image\/png(?:;|$)/i },
] as const
const MAX_JAVASCRIPT_CHUNK_BYTES = 500_000

async function assertServedAsset(
  request: APIRequestContext,
  baseURL: string,
  path: string,
  expectedType: RegExp,
) {
  const response = await request.get(new URL(path, baseURL).href)
  expect(response.status(), `${path} should be served by the production build`).toBe(200)
  expect(
    response.headers()['content-type'] ?? '',
    `${path} should have the expected MIME type`,
  ).toMatch(expectedType)
  const byteLength = (await response.body()).byteLength
  expect(byteLength, `${path} should not be empty`).toBeGreaterThan(0)
  return byteLength
}

test('production build boots WebGL, serves every release asset, and starts a new game', async ({
  page,
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error('The production-preview baseURL is required.')

  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto('/?alwaysRun=1')
  await expect(page.getByText('The Cheetah & The Peach')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible()
  await page.waitForFunction(
    () => document.documentElement.dataset.webglReady === 'true',
    undefined,
    { timeout: 20_000 },
  )

  const javascriptAssets = await page
    .locator('script[type="module"][src], link[rel="modulepreload"][href]')
    .evaluateAll((elements) =>
      Array.from(
        new Set(
          elements
            .map((element) =>
              element instanceof HTMLScriptElement ? element.src : (element as HTMLLinkElement).href,
            )
            .filter((url) => /\.m?js(?:[?#]|$)/.test(url)),
        ),
      ),
    )
  expect(
    javascriptAssets.length,
    'the production application should be split into multiple chunks',
  ).toBeGreaterThan(1)

  for (const url of javascriptAssets) {
    const byteLength = await assertServedAsset(
      request,
      baseURL,
      url,
      /^(?:text|application)\/javascript(?:;|$)/i,
    )
    expect(byteLength, `${new URL(url).pathname} should remain below Vite's 500 kB limit`).toBeLessThanOrEqual(
      MAX_JAVASCRIPT_CHUNK_BYTES,
    )
  }
  for (const asset of RELEASE_ASSETS) {
    await assertServedAsset(request, baseURL, asset.path, asset.type)
  }

  await page.getByRole('button', { name: 'New Game' }).click()
  await expect(page.getByRole('button', { name: 'New Game' })).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('canvas')).toBeVisible()
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('cheetah-peach.save.v1')
          return raw ? JSON.parse(raw).chapter : null
        }),
      { timeout: 10_000 },
    )
    .toBe('cottage')

  await page.waitForTimeout(1_000)
  expect(errors, 'production browser console and page errors').toEqual([])
})
