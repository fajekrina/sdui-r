// spec 2.5 — the 2.4 pick and tip on every chart kind: line / area (a round marker, the tip above the
// point), pie / donut (the slice pulled out, the tip outside it by quadrant, legend entries as buttons).
import { describe, expect, it } from 'vitest'
import { ScreenSource, type RenderNode } from '../src/core'
import { devEngine } from './helpers'

const byKey = (node: RenderNode | undefined, key: string): RenderNode | undefined =>
  !node ? undefined : node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)
const text = (n: RenderNode | undefined): string => !n ? '' : (n.text ?? '') + n.children.map(text).join('')

const items = [
  { key: 'a', label: 'A', value: 10, amount: 'Rp10' },
  { key: 'b', label: 'B', value: 30, amount: 'Rp30' },
  { key: 'c', label: 'C', value: 20, amount: 'Rp20' },
  { key: 'd', label: 'D', value: 40, amount: 'Rp40' }
]
async function render(props: object, interactive = true) {
  const s = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.5', screen: { key: 's', root: {
    type: 'chart', id: 'c', props: { data: items, selectState: 'pick', initialSelection: 'last', selectedColor: '#D95C5C', tip: '{{item.label}} **{{item.amount}}**', ...props } } } }))
  await s.load()
  return { s, root: () => s.render({ interactive }).nodes[0]! }
}

describe('line / area', () => {
  it.each(['line', 'area'])('%s: a marker on the picked point, the tip above it, a column per point', async (kind) => {
    const { s, root } = await render({ kind, min: 0 })
    let r = root()
    const marker = byKey(r, 'c:marker')!
    expect(marker.style).toMatchObject({ position: 'absolute', left: '87.5%', bottom: '96%', width: '10px', borderRadius: '50%', background: 'rgba(217, 92, 92, 1)' })
    const tip = byKey(r, 'c:tip')!
    expect(text(tip)).toBe('D Rp40')
    // its own 87.5% point over the point: it never leaves the chart
    expect(tip.style).toMatchObject({ left: '87.5%', transform: 'translateX(-87.5%)', bottom: 'calc(96% + 10px)' })
    expect(byKey(r, 'c:hits')!.children).toHaveLength(4)
    await s.handle(byKey(r, 'c:hit1')!.on!.click!)
    r = root()
    expect(s.data.value('$selected.pick')).toBe('b')
    expect(byKey(r, 'c:marker')!.style.left).toBe('37.5%')
    expect(byKey(r, 'c:tip')!.style).toMatchObject({ left: '37.5%', transform: 'translateX(-37.5%)' })
  })

  it('without selectedColor the marker takes the line color', async () => {
    const { root } = await render({ kind: 'line', selectedColor: undefined, color: 'success' })
    expect(byKey(root(), 'c:marker')!.style.background).toBe(byKey(root(), 'c:line')!.style.stroke)
  })
})

describe('pie / donut', () => {
  it.each(['pie', 'donut'])('%s: the picked slice pulled out and colored; the tip outside it', async (kind) => {
    const { s, root } = await render({ kind, height: 160 })
    let r = root()
    const last = byKey(r, 'c:slice3')!
    expect(last.attrs.transform).toMatch(/^translate\(-[\d.]+ -[\d.]+\)$/)   // D ends at 12 o'clock: up-left
    expect(last.style.fill).toBe('rgba(217, 92, 92, 1)')
    expect(byKey(r, 'c:slice0')!.attrs.transform).toBeUndefined()
    // room above and below the disc for the tip (never beside it: it would leave a narrow card)
    expect(byKey(r, 'c:disc')!.style).toMatchObject({ position: 'relative', width: '160px', padding: '35px 0' })
    const tip = byKey(r, 'c:tip')!
    expect(text(tip)).toBe('D Rp40')
    // D's middle is at 288° (upper half, far left): above the disc, slid to the left
    expect(tip.style).toMatchObject({ left: '2.45%', transform: 'translateX(-2.45%)', bottom: 'calc(100% - 35px + 4px)' })
    // tap a slice
    await s.handle(byKey(r, 'c:slice0')!.on!.click!)
    r = root()
    expect(s.data.value('$selected.pick')).toBe('a')
    expect(byKey(r, 'c:slice0')!.attrs.transform).toMatch(/^translate\([\d.]+ -[\d.]+\)$/)   // A: up-right
    expect(byKey(r, 'c:tip')!.style).toMatchObject({ left: '65.45%', bottom: 'calc(100% - 35px + 4px)' })   // A at 18°: above, right of center
  })

  it('legend entries are pick buttons (aria-pressed); a hover on a slice previews', async () => {
    const { s, root } = await render({ kind: 'pie' })
    let r = root()
    const entry = byKey(r, 'c:hit2')!
    expect(entry.element).toBe('button')
    expect(entry.attrs).toMatchObject({ 'aria-label': 'C, Rp20', 'aria-pressed': 'false' })
    expect(byKey(r, 'c:hit3')!.attrs['aria-pressed']).toBe('true')
    s.hover(byKey(r, 'c:slice1')!.on!.hover!)
    r = root()
    expect(text(byKey(r, 'c:tip'))).toBe('B Rp30')
    expect(s.data.value('$selected.pick')).toBeUndefined()
    s.hover(byKey(r, 'c:disc')!.on!.hoverEnd!)
    expect(text(byKey(root(), 'c:tip'))).toBe('D Rp40')
  })

  it('no legend: the buttons stay, visually hidden', async () => {
    const { root } = await render({ kind: 'donut', showLegend: false })
    const hidden = byKey(root(), 'c:picks')!
    expect(hidden.style).toMatchObject({ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' })
    expect(hidden.children.map((b) => b.attrs['aria-label'])).toEqual(['A, Rp10', 'B, Rp30', 'C, Rp20', 'D, Rp40'])
    expect(byKey(root(), 'c:legend')).toBeUndefined()
  })

  it('a static preview: the pick and tip show, nothing is tappable', async () => {
    const { root } = await render({ kind: 'pie' }, false)
    const r = root()
    expect(text(byKey(r, 'c:tip'))).toBe('D Rp40')
    expect(byKey(r, 'c:slice0')!.on).toBeUndefined()
    expect(byKey(r, 'c:hit0')).toBeUndefined()
  })

  it('without the 2.4 props a pie renders exactly as before', async () => {
    const { root } = await render({ kind: 'pie', selectState: undefined, initialSelection: undefined, selectedColor: undefined, tip: undefined })
    const r = root()
    expect(byKey(r, 'c:disc')).toBeUndefined()
    expect(byKey(r, 'c:item0')!.children[0]!.element).toBe('span')
  })
})
