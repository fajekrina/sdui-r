// Chart tip / pie / State panel fixes: a long tip never leaves the chart and gets the room it needs;
// pie slices are separated and the legend swatch follows the pick; the State panel tries a chart's
// item keys and "no pick"; a chart's data source is not a request; same-colored slices are flagged.
import { describe, expect, it } from 'vitest'
import { ScreenSource, SduiNode, type RenderNode } from '../src/core'
import { mountTemplateBuilder, requestNames, stateWarnings } from '../src/builder'
import { devEngine } from './helpers'

const byKey = (node: RenderNode | undefined, key: string): RenderNode | undefined =>
  !node ? undefined : node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)

const items = [
  { key: 'a', label: 'Feb', value: 10, note: 'pendek' },
  { key: 'b', label: 'Mar', value: 30, note: 'catatan yang jauh lebih panjang dari satu baris tip, jadi teksnya terbungkus beberapa kali di dalam chart' }
]
async function root(props: object) {
  const s = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.5', screen: { key: 's', root: {
    type: 'chart', id: 'c', props: { data: items, selectState: 'p', initialSelection: 'first', ...props } } } }))
  await s.load()
  return s.render().nodes[0]!
}

describe('a long tip', () => {
  it('room from the longest resolved text (stable whichever item is picked); never wider than the chart', async () => {
    const short = await root({ tip: '{{item.label}}' })
    const long = await root({ tip: '{{item.label}}\n{{item.note}}' })
    expect(byKey(short, 'c:plot')!.style.marginTop).toBe('35px')
    // Feb is picked, but Mar's long note sets the room: 1 + 4 wrapped lines
    expect(byKey(long, 'c:plot')!.style.marginTop).toBe(`${5 * 17 + 18}px`)
    expect(byKey(long, 'c:tip')!.style).toMatchObject({ maxWidth: '100%', zIndex: '10', overflowWrap: 'anywhere' })
  })

  it('pie / donut: above or below the disc, never beside it', async () => {
    const r = await root({ kind: 'donut', tip: '{{item.label}}', height: 120 })
    const tip = byKey(r, 'c:tip')!
    expect(tip.style.top ?? tip.style.bottom).toMatch(/^calc\(100% - \d+px \+ 4px\)$/)
    expect(tip.style.transform).toMatch(/^translateX\(-[\d.]+%\)$/)
  })
})

describe('pie / donut', () => {
  it('slices are separated by a thin background line; the picked swatch takes selectedColor; the slice may show past the view box', async () => {
    const r = await root({ kind: 'pie', selectedColor: '#D95C5C' })
    expect(byKey(r, 'c:slice0')!.style).toMatchObject({ stroke: 'var(--sdui-color-background, #FFFFFF)', strokeWidth: '1.5' })
    expect(byKey(r, 'c:swatch0')!.style.background).toBe('rgba(217, 92, 92, 1)')
    expect(byKey(r, 'c:swatch1')!.style.background).not.toBe('rgba(217, 92, 92, 1)')
    expect(byKey(r, 'c:svg')!.style.overflow).toBe('visible')
  })

  it('a warning when every slice has the same color', () => {
    const tree = (data: object[]) => SduiNode.decode({ type: 'vstack', id: 'root', children: [{ type: 'chart', id: 'c', props: { kind: 'donut', data } }] })
    expect(stateWarnings(tree([{ value: 1, color: '#FDE8E8' }, { value: 2, color: '#FDE8E8' }])).join()).toContain('every slice has the color #FDE8E8')
    expect(stateWarnings(tree([{ value: 1, color: '#FDE8E8' }, { value: 2, color: '#D95C5C' }]))).toEqual([])
    expect(stateWarnings(tree([{ value: 1 }, { value: 2 }]))).toEqual([])
  })
})

describe('the Studio', () => {
  it("a chart's data source is not a request (it is loaded, never sent by a tap)", () => {
    const tree = SduiNode.decode({ type: 'vstack', id: 'root', children: [
      { type: 'chart', id: 'c', action: { type: 'api', request: 'coffeeSpending' } },
      { type: 'button', id: 'b', action: { type: 'api', request: 'sendFeedback' } }
    ] })
    expect(requestNames(tree)).toEqual(['sendFeedback'])
  })

  it("the State panel tries a chart's item keys (from the sample), its initial pick, or no pick", () => {
    const host = document.createElement('div')
    document.body.append(host)
    const sample = { items: [{ key: '2025-02', label: 'Feb', value: 1 }, { key: '2025-03', label: 'Mar', value: 2 }] }
    const studio = mountTemplateBuilder(host, { sampleData: { coffeeSpending: sample } })
    studio.document.importJSON({ schemaVersion: '2.5', template: { key: 't', version: 1, root: { type: 'vstack', id: 'root', order: 0, children: [
      { type: 'chart', id: 'c', order: 0, props: { selectState: 'bar', initialSelection: 'last', tip: '{{item.label}}' }, action: { type: 'api', request: 'coffeeSpending' } }] } } })
    const tryBar = host.querySelector('[aria-label="try bar"]') as HTMLSelectElement
    expect([...tryBar.options].map((o) => o.textContent)).toEqual(['(initial pick)', '(no pick)', '2025-02', '2025-03'])
    expect(host.querySelector('.state')!.textContent).toContain('picked by chart #c')
    expect(host.querySelector('[aria-label="bar initial"]')).toBeNull()
    expect(host.querySelector('[aria-label="try request coffeeSpending"]')).toBeNull()
    const tip = () => host.querySelector('.device [data-sdui-key="c:tip"]')?.textContent
    expect(tip()).toBe('Mar')
    tryBar.value = '2025-02'; tryBar.dispatchEvent(new Event('change'))
    expect(tip()).toBe('Feb')
    const none = [...tryBar.options].find((o) => o.textContent === '(no pick)')!.value
    const again = host.querySelector('[aria-label="try bar"]') as HTMLSelectElement
    again.value = none; again.dispatchEvent(new Event('change'))
    expect(tip()).toBeUndefined()
    studio.destroy()
    host.remove()
  })
})
