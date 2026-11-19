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
