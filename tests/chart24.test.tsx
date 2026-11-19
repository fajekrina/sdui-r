// spec 2.4 — the interactive bar chart: pick a bar (tap; web hover previews), its tip (computed
// place, {{item.x}}, markup), selectedColor, initialSelection, the slide, a11y, renderers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionDispatcher, MOVE_MS, ScreenSource, playMotion, type RenderNode } from '../src/core'
import { mount } from '../src/vanilla'
import { devEngine, flush } from './helpers'

const byKey = (node: RenderNode | undefined, key: string): RenderNode | undefined =>
  !node ? undefined : node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)
const text = (n: RenderNode | undefined): string => !n ? '' : (n.text ?? '') + n.children.map(text).join('')

const items = [
  { key: 'feb', label: 'Feb 2025', value: 560000, amount: 'Rp560.000', color: '#FDE8E8' },
  { key: 'mar', label: 'Mar 2025', value: 950000, amount: 'Rp950.000', color: '#FDE8E8' },
  { key: 'apr', label: 'Apr 2025', value: 1140000, amount: 'Rp1.140.000', color: '#FDE8E8' }
]
const chart = (props: object = {}, extra: object = {}) => ({ schemaVersion: '2.4', screen: { key: 's', root: { type: 'vstack', id: 'root', children: [
  { type: 'chart', id: 'spend', props: { kind: 'bar', height: 120, min: 0, data: items, selectState: 'spendBar', initialSelection: 'last', selectedColor: '#D95C5C', tip: '{{item.label}}\n**{{item.amount}}**', ...props }, ...extra },
  { type: 'text', id: 'picked', props: { value: 'picked {{$selected.spendBar}}' } }
] } } })

async function screenOf(payload: object, init: Parameters<typeof devEngine>[0] = {}) {
  const s = devEngine(init).screen(ScreenSource.inline(payload))
  await s.load()
  return s
}
const fills = (root: RenderNode) => [0, 1, 2].map((i) => byKey(root, `spend:bar${i}`)!.style.fill)

describe('the pick and its tip', () => {
  it('initialSelection last: the last bar is picked, colored, and the tip shows its item', async () => {
    const s = await screenOf(chart())
    const root = s.render().nodes[0]!
    expect(fills(root)).toEqual(['rgba(253, 232, 232, 1)', 'rgba(253, 232, 232, 1)', 'rgba(217, 92, 92, 1)'])
    const tip = byKey(root, 'spend:tip')!
    expect(text(tip)).toBe('Apr 2025\nRp1.140.000')
    expect(tip.children[1]!.style.fontWeight).toBe('700')           // **bold** applies
    expect(tip.attrs['aria-live']).toBe('polite')
    // over the last bar's center (83.33%), its own 83.33% point there: it never leaves the chart
    expect(tip.style).toMatchObject({ position: 'absolute', left: '83.33%', transform: 'translateX(-83.33%)', maxWidth: '100%' })
    expect(tip.style.bottom).toMatch(/^calc\(9\d(\.\d+)?% \+ 6px\)$/)
    expect(byKey(root, 'spend')!.attrs.role).toBe('group')
    expect(byKey(root, 'spend:plot')!.style.marginTop).toBe('52px')   // 2 lines of room above the tallest bar
  })

  it('a tap picks a bar: the state, the color, the tip and aria-pressed follow; tapping it again keeps it', async () => {
    const s = await screenOf(chart())
    let root = s.render().nodes[0]!
    expect(byKey(root, 'spend:hit2')!.attrs['aria-label']).toBe('Apr 2025, Rp1.140.000')
    await s.handle(byKey(root, 'spend:hit0')!.on!.click!)
    root = s.render().nodes[0]!
    expect(s.data.value('$selected.spendBar')).toBe('feb')
    expect(text(byKey(root, 'picked'))).toBe('picked feb')
    expect(text(byKey(root, 'spend:tip'))).toBe('Feb 2025\nRp560.000')
    expect(byKey(root, 'spend:tip')!.style).toMatchObject({ left: '16.67%', transform: 'translateX(-16.67%)' })
    expect(fills(root)[0]).toBe('rgba(217, 92, 92, 1)')
    expect(byKey(root, 'spend:hit0')!.attrs['aria-pressed']).toBe('true')
    expect(byKey(root, 'spend:hit2')!.attrs['aria-pressed']).toBe('false')
    await s.handle(byKey(root, 'spend:hit1')!.on!.click!)
    root = s.render().nodes[0]!
    expect(byKey(root, 'spend:tip')!.style).toMatchObject({ left: '50%', transform: 'translateX(-50%)' })
    await s.handle(byKey(root, 'spend:hit1')!.on!.click!)            // K6: stays picked
    expect(s.data.value('$selected.spendBar')).toBe('mar')
  })

  it('a hover previews another bar without changing the state; leaving goes back', async () => {
    const s = await screenOf(chart())
    let root = s.render().nodes[0]!
    s.hover(byKey(root, 'spend:hit0')!.on!.hover!)
    root = s.render().nodes[0]!
    expect(text(byKey(root, 'spend:tip'))).toBe('Feb 2025\nRp560.000')
    expect(s.data.value('$selected.spendBar')).toBeUndefined()
    expect(byKey(root, 'spend:hit2')!.attrs['aria-pressed']).toBe('true')   // still the pick
    s.hover(byKey(root, 'spend:hits')!.on!.hoverEnd!)
    expect(text(byKey(s.render().nodes[0], 'spend:tip'))).toBe('Apr 2025\nRp1.140.000')
  })

  it('initialSelection: first, a key, none; no selectState = a static highlight', async () => {
    expect(text(byKey((await screenOf(chart({ initialSelection: 'first' }))).render().nodes[0], 'spend:tip'))).toContain('Feb')
    expect(text(byKey((await screenOf(chart({ initialSelection: 'mar' }))).render().nodes[0], 'spend:tip'))).toContain('Mar')
    expect(byKey((await screenOf(chart({ initialSelection: 'none' }))).render().nodes[0], 'spend:tip')).toBeUndefined()
    const fixed = (await screenOf(chart({ selectState: undefined }))).render().nodes[0]!
    expect(byKey(fixed, 'spend:hits')).toBeUndefined()
    expect(text(byKey(fixed, 'spend:tip'))).toContain('Apr')
    expect(byKey(fixed, 'spend')!.attrs.role).toBe('img')
  })

  it('without 2.4 props the chart renders exactly as before (no plot layer)', async () => {
    const root = (await screenOf(chart({ selectState: undefined, initialSelection: undefined, selectedColor: undefined, tip: undefined }))).render().nodes[0]!
    expect(byKey(root, 'spend:plot')).toBeUndefined()
    expect(byKey(root, 'spend:svg')).toBeDefined()
  })

  it('a data source landing later still gets its initial pick', async () => {
    let answer!: (b: Uint8Array) => void
    const perform = vi.fn(() => new Promise<Uint8Array>((r) => { answer = r }))
    // a screen payload names its load itself (a template's chart source joins it in compose)
    const payload = chart({ data: undefined }, { action: { type: 'api', request: 'coffeeSpending' } }) as { screen: Record<string, unknown> }
    payload.screen.load = [{ request: 'coffeeSpending' }]
    const s = await screenOf(payload, { actionDispatcher: new ActionDispatcher({ network: { perform } }) })
    expect(byKey(s.render().nodes[0], 'spend:tip')).toBeUndefined()   // skeleton while loading
    answer(new TextEncoder().encode(JSON.stringify({ items })))
    await vi.waitFor(() => expect(text(byKey(s.render().nodes[0], 'spend:tip'))).toBe('Apr 2025\nRp1.140.000'))
  })

  it('a static preview (Studio canvas) shows the tip, but no buttons', async () => {
    const s = await screenOf(chart())
    const root = s.render({ interactive: false }).nodes[0]!
    expect(byKey(root, 'spend:hits')).toBeUndefined()
    expect(text(byKey(root, 'spend:tip'))).toContain('Apr')
  })
})

describe('the tip slides', () => {
  let clock = 0
  beforeEach(() => { clock = 1000; vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('from the old bar to the new one; never on the first render; not under reduced motion', async () => {
    const s = await screenOf(chart(), { now: () => clock })
    let root = s.render().nodes[0]!
    expect(byKey(root, 'spend:tip')!.motion).toBeUndefined()
    s.select({ group: 'spendBar', value: 'feb' })
    root = s.render().nodes[0]!
    expect(byKey(root, 'spend:tip')!.motion).toMatchObject({ duration: MOVE_MS, elapsed: 0, from: { left: '83.33%', transform: 'translateX(-83.33%)' } })
    clock += MOVE_MS + 1
    expect(byKey(s.render().nodes[0], 'spend:tip')!.motion).toBeUndefined()
    const calm = await screenOf(chart(), { now: () => clock, reducedMotion: () => true })
    calm.render()
    calm.select({ group: 'spendBar', value: 'feb' })
    expect(byKey(calm.render().nodes[0], 'spend:tip')!.motion).toBeUndefined()
  })

  it('playMotion slides from the old place to the style it now has', () => {
    const calls: Array<{ frames: Keyframe[]; o: KeyframeAnimationOptions }> = []
    const el = document.createElement('div')
    el.style.left = '5%'
    el.style.transform = 'translateX(0%)'
    Object.assign(el, { animate: (frames: Keyframe[], o: KeyframeAnimationOptions) => { calls.push({ frames, o }); return { id: '', cancel() {}, onfinish: null } }, getAnimations: () => [] })
    playMotion(el, { kind: 'fade', axis: 'x', direction: 'in', duration: 200, elapsed: 40, from: { left: '95%', transform: 'translateX(-100%)' } })
    expect(calls[0]!.frames).toEqual([{ left: '95%', transform: 'translateX(-100%)' }, { left: '5%', transform: 'translateX(0%)' }])
    expect(calls[0]!.o).toMatchObject({ duration: 200, delay: -40 })
  })
})

describe('renderers', () => {
  it('vanilla: a tap picks; a mouse hover previews; a touch hover does not', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const view = mount(host, { engine: devEngine(), source: { payload: chart() } })
    await flush()
    const tip = () => host.querySelector('[data-sdui-key="spend:tip"]')!.textContent
    const enter = (key: string, pointerType: string) => {
      const e = new Event('pointerenter') as Event & { pointerType: string }
      e.pointerType = pointerType
      host.querySelector(`[data-sdui-key="${key}"]`)!.dispatchEvent(e)
    }
    enter('spend:hit0', 'touch')
    expect(tip()).toBe('Apr 2025\nRp1.140.000')
    enter('spend:hit0', 'mouse')
    expect(tip()).toBe('Feb 2025\nRp560.000')
    // WebKit sends pointerleave to the row a repaint just removed: ignored (no repaint loop)
    const leave = (el: Element) => { const e = new Event('pointerleave') as Event & { pointerType: string }; e.pointerType = 'mouse'; el.dispatchEvent(e) }
    const detached = host.querySelector('[data-sdui-key="spend:hits"]')!
    detached.remove()
    leave(detached)
    expect(tip()).toBe('Feb 2025\nRp560.000')                        // still the hover preview
    view.screen.hover('h:spend:end')                                   // a real leave ends it
    expect(tip()).toBe('Apr 2025\nRp1.140.000')
    ;(host.querySelector('[data-sdui-key="spend:hit1"]') as HTMLElement).click()
    await flush()
    expect(view.screen.data.value('$selected.spendBar')).toBe('mar')
    view.destroy()
    host.remove()
  })
})
