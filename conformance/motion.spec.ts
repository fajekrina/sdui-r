// spec 2.3 — transitions in real engines: the insight feedback buttons. Tapping one fades the
// other out (inert while it leaves, a running Web Animation), then it is gone; under reduced
// motion it is gone at once. Same in Chromium and WebKit.
import { chromium, webkit, expect, test, type BrowserType } from '@playwright/test'

const ENGINES: Record<string, BrowserType> = { chromium, webkit }
const PAIR = (process.env.CONFORMANCE_PAIR ?? 'chromium,webkit').split(',').map((n) => n.trim())

for (const name of [...new Set(PAIR)]) {
  for (const reduced of [false, true]) {
    test(`insight feedback fades out in ${name}${reduced ? ' (reduced motion)' : ''}`, async ({ baseURL }) => {
      const browser = await ENGINES[name]!.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
        await page.goto(`${baseURL}/conformance/index.html?fixture=template_insight.json`)
        await page.waitForFunction(() => (window as unknown as { __sduiReady?: boolean }).__sduiReady === true)
        const dislike = page.locator('[data-sdui-key="dislike"]')
        await expect(dislike).toBeVisible()
        await page.locator('[data-sdui-key="like"]').click()
        if (!reduced) {
          // leaving: still there, inert, out of the a11y tree, animating
          expect(await dislike.getAttribute('inert')).not.toBeNull()
          expect(await dislike.getAttribute('aria-hidden')).toBe('true')
          expect(await dislike.evaluate((el) => el.getAnimations().filter((a) => a.id === 'sdui-motion').length)).toBe(1)
        }
        await expect(dislike).toHaveCount(0, { timeout: reduced ? 100 : 1000 })
        await expect(page.locator('[data-sdui-key="like"]')).toHaveAttribute('aria-pressed', 'true')
      } finally {
        await browser.close()
      }
    })
  }
}

// spec 2.4 — the chart tip follows a tapped bar (its place is computed, so both engines agree)
for (const name of [...new Set(PAIR)]) {
  test(`chart tip follows the tapped bar in ${name}`, async ({ baseURL }) => {
    const browser = await ENGINES[name]!.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
      await page.goto(`${baseURL}/conformance/index.html?fixture=chart_tip.json`)
      await page.waitForFunction(() => (window as unknown as { __sduiReady?: boolean }).__sduiReady === true)
      const tip = page.locator('[data-sdui-key="spend:tip"]')
      await expect(tip).toHaveText(/Apr 2025\s*Rp1\.140\.000/)
      const bar = async (i: number) => (await page.locator(`[data-sdui-key="spend:bar${i}"]`).boundingBox())!
      // at the last bar the tip stays inside the chart, over that bar, above it (polled: a repaint may
      // replace the node while it is measured)
      const last = await bar(2)
      const plot = (await page.locator('[data-sdui-key="spend:plot"]').boundingBox())!
      await expect.poll(async () => {
        const t = await tip.boundingBox()
        return !!t && t.x + t.width <= plot.x + plot.width + 1 && t.x + t.width > last.x + last.width / 2 && t.y + t.height <= last.y
      }, { timeout: 2000 }).toBe(true)
      await page.locator('[data-sdui-key="spend:hit1"]').click()
      await expect(tip).toHaveText(/Mar 2025\s*Rp950\.000/)
      expect(await tip.evaluate((el) => el.getAnimations().filter((a) => a.id === 'sdui-motion').length)).toBe(1)
      // once the slide ends (engines schedule its start a little differently), it rests centered over the bar
      const mid = await bar(1)
      await expect.poll(async () => { const t = (await tip.boundingBox())!; return Math.abs(t.x + t.width / 2 - (mid.x + mid.width / 2)) }, { timeout: 2000 }).toBeLessThanOrEqual(2)
      // the state other components read: the picked item's key
      await expect(page.locator('[data-sdui-key="picked"]')).toHaveText('Dipilih: 2025-03')
    } finally {
      await browser.close()
    }
  })
}

// spec 2.5 — the same pick on a line (marker) and a donut (slice pulled out, tip outside it)
for (const name of [...new Set(PAIR)]) {
  for (const [fixture, target, mark] of [['chart_tip_line.json', 'spend:hit0', 'spend:marker'], ['chart_tip_pie.json', 'spend:slice0', 'spend:slice0']] as const) {
    test(`${fixture}: a tap picks in ${name}`, async ({ baseURL }) => {
      const browser = await ENGINES[name]!.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
        await page.goto(`${baseURL}/conformance/index.html?fixture=${fixture}`)
        await page.waitForFunction(() => (window as unknown as { __sduiReady?: boolean }).__sduiReady === true)
        const tip = page.locator('[data-sdui-key="spend:tip"]')
        await expect(tip).toHaveText(/Apr\s*Rp1\.140\.000/)
        await page.locator(`[data-sdui-key="${target}"]`).click()
        await expect(tip).toHaveText(/Feb\s*Rp560\.000/)
        await expect(page.locator('[data-sdui-key="picked"]')).toHaveText('Dipilih: feb')
        await expect(page.locator(`[data-sdui-key="${mark}"]`)).toHaveCount(1)
        // the tip stays inside the page (polled: vanilla repaints once more when the slide ends)
        await expect.poll(async () => { const b = await tip.boundingBox(); return b ? b.x >= 0 && b.x + b.width <= 375 : false }, { timeout: 2000 }).toBe(true)
      } finally {
        await browser.close()
      }
    })
  }
}
