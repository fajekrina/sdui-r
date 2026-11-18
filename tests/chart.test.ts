// sdui-r: the built-in `chart` — bar / line / area / pie / donut as SVG paths.
import { describe, expect, it } from 'vitest'
import { ScreenSource, type RenderNode } from '../src/core'
import { devEngine } from './helpers'

async function render(props: Record<string, unknown>, seed: Record<string, unknown> = {}, action?: Record<string, unknown>) {
  const screen = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.0', screen: { key: 's', root: { type: 'chart', id: 'c', props, ...(action ? { action } : {}) } } }), { seed: seed as never })
  await screen.load()
  return screen.render().nodes[0]!
}
const all = (n: RenderNode): RenderNode[] => [n, ...n.children.flatMap(all)]
const paths = (n: RenderNode) => all(n).filter((x) => x.element === 'path')
const texts = (n: RenderNode) => all(n).filter((x) => x.text !== undefined).map((x) => x.text)
const api = (request: string) => ({ type: 'api', request })

describe('chart', () => {
  it('bar: one path per value, labels, values, a generated accessible name', async () => {
    const c = await render({ data: [10, 20, 5], labels: ['A', 'B', '{{who}}'], showValues: true }, { who: 'C' })
    expect(c.type).toBe('chart')
    expect(c.attrs).toMatchObject({ role: 'img', 'aria-label': 'bar chart: A 10, B 20, C 5' })
    const bars = paths(c)
    expect(bars).toHaveLength(3)
    expect(bars[1]!.attrs.d).toBe('M38.33 100V4H61.67V100Z')        // the max reaches the top (4) from the base (100)
    expect(bars[0]!.style.fill).toBe('var(--sdui-color-primary, #0A66C2)')
    expect(texts(c)).toEqual(['10', '20', '5', 'A', 'B', 'C'])
    const svg = all(c).find((x) => x.element === 'svg')!
    expect(svg.attrs).toMatchObject({ viewBox: '0 0 100 100', preserveAspectRatio: 'none', height: '160', 'aria-hidden': 'true' })
  })

  it('reads objects (labelKey / valueKey / per-item color) from a data key path', async () => {
    const seed = { sales: { items: [{ day: 'Sen', total: 4, color: 'danger' }, { day: 'Sel', total: 8 }, { day: 'x', total: 'n/a' }] } }
    for (const data of ['sales.items', '{{sales.items}}']) {
      const c = await render({ kind: 'bar', data, labelKey: 'day', valueKey: 'total' }, seed)
      expect(paths(c)).toHaveLength(2)                                  // the non-number is skipped
      expect(paths(c)[0]!.style.fill).toBe('var(--sdui-color-danger, #B91C1C)')
      expect(texts(c)).toEqual(['Sen', 'Sel'])
    }
  })

  it('the data source is the api action: its request\'s summary { items: [{ key, label, value }] }; no action = static data', async () => {
    const seed = { salesSummary: { title: 'Penjualan', items: [{ key: 'jan', label: 'Januari', value: 120 }, { key: 'feb', label: 'Februari', value: 80 }] } }
    const c = await render({ data: [1, 2, 3, 4, 5] }, seed, api('salesSummary'))
    expect(paths(c)).toHaveLength(2)
    expect(texts(c)).toEqual(['Januari', 'Februari'])
    expect(c.on ?? {}).toEqual({})                                     // the action loads data; the chart is not tappable
    // the array itself is a summary too; another action type (or none) draws the static data
    expect(paths(await render({}, { list: [{ label: 'a', value: 1 }] }, api('list')))).toHaveLength(1)
    expect(paths(await render({ data: [1, 2] }, seed, { type: 'navigate', screen: 'x' }))).toHaveLength(2)
    expect(paths(await render({ data: [1, 2] }, seed))).toHaveLength(2)
  })

  it('checkboxes choose what the drawing shows: labels (default on), keys, values, legend (default on)', async () => {
    const seed = { s: { items: [{ key: 'jan', label: 'Januari', value: 120 }, { key: 'feb', label: 'Februari', value: 80 }] } }
    expect(texts(await render({ showKeys: true, showValues: true }, seed, api('s')))).toEqual(['120', '80', 'Januari', 'Februari', 'jan', 'feb'])
    expect(texts(await render({ showLabels: false, showValues: true }, seed, api('s')))).toEqual(['120', '80'])
    expect(texts(await render({ kind: 'pie', showKeys: true, showValues: true }, seed, api('s')))).toEqual(['Januari', 'jan', '120 · 60%', 'Februari', 'feb', '80 · 40%'])
    expect(texts(await render({ kind: 'pie', showLegend: false }, seed, api('s')))).toEqual([])
    // a custom mapping
    expect(texts(await render({ keyKey: 'id', labelKey: 'name', valueKey: 'n', showKeys: true }, { t: [{ id: 'x1', name: 'Satu', n: 1 }] }, api('t')))).toEqual(['Satu', 'x1'])
  })

  it('line / area: a non-scaling stroke; area adds a translucent fill', async () => {
    const line = await render({ kind: 'line', data: [1, 3, 2], color: 'success' })
    expect(paths(line)).toHaveLength(1)
    expect(paths(line)[0]!.attrs).toMatchObject({ d: 'M16.67 68L50 4L83.33 36', 'vector-effect': 'non-scaling-stroke' })
    expect(paths(line)[0]!.style).toMatchObject({ fill: 'none', stroke: 'var(--sdui-color-success, #15803D)', strokeWidth: '2' })
    const area = await render({ kind: 'area', data: [1, 3, 2] })
    expect(paths(area).map((p) => p.key)).toEqual(['c:area', 'c:line'])
    expect(paths(area)[0]!.attrs.d).toBe('M16.67 68L50 4L83.33 36L83.33 100L16.67 100Z')
    expect(paths(area)[0]!.style.fillOpacity).toBe('0.18')
  })

  it('negative values: bars grow from the zero line, which is drawn', async () => {
    const c = await render({ data: [-5, 5] })
    const [neg, pos, zero] = paths(c)
    expect(neg!.attrs.d).toBe('M7.5 100V52H42.5V100Z')
    expect(pos!.attrs.d).toBe('M57.5 52V4H92.5V52Z')
    expect(zero!.key).toBe('c:zero')
  })

  it('pie / donut: slices with theme colors, a legend with values and percentages', async () => {
    const pie = await render({ kind: 'pie', data: [{ label: 'VA', value: 3 }, { label: 'Card', value: 1, color: '#7C3AED' }], showValues: true })
    const slices = paths(pie)
    expect(slices).toHaveLength(2)
    expect(slices[0]!.attrs.d).toBe('M50 50L50 2A48 48 0 1 1 2 50Z')       // 75%: the large arc
    expect(slices[0]!.style.fill).toBe('var(--sdui-color-primary, #0A66C2)')
    expect(slices[1]!.style.fill).toBe('rgba(124, 58, 237, 1)')
    expect(texts(pie)).toEqual(['VA', '3 · 75%', 'Card', '1 · 25%'])
    const donut = await render({ kind: 'donut', data: [2, 2], showLegend: false })
    expect(paths(donut)[0]!.attrs.d).toContain('L50 78A28 28 0 0 0 50 22Z')  // the inner arc back
    expect(all(donut).some((x) => x.element === 'ul')).toBe(false)
  })

  it('a single slice is a full circle; empty data shows "No data"; a11yLabel wins', async () => {
    const one = await render({ kind: 'pie', data: [7] })
    expect(paths(one)[0]!.attrs.d).toBe('M50 2A48 48 0 1 1 50 98A48 48 0 1 1 50 2Z')
    const empty = await render({ data: [], a11yLabel: 'Penjualan' })
    expect(texts(empty)).toEqual(['No data'])
    expect(empty.attrs['aria-label']).toBe('Penjualan')
    const missing = await render({ data: 'nothing.here' })
    expect(texts(missing)).toEqual(['No data'])
  })

  it('a slot claimed by the adapter wins over the built-in chart', async () => {
    const screen = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.0', screen: { key: 's', root: { type: 'chart', props: { data: [1] } } } }))
    await screen.load()
    expect(screen.render({ slots: ['chart'] }).nodes[0]!.slot?.type).toBe('chart')
    expect(screen.render().nodes[0]!.slot).toBeUndefined()
  })
})
