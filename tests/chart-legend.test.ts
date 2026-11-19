// pie / donut layout: centered with the legend below by default; `legendPosition` (bottom · top ·
// right · left) and `alignment` (center · leading · trailing); the Studio offers them for pie / donut only.
import { describe, expect, it } from 'vitest'
import { ScreenSource, type RenderNode } from '../src/core'
import { mountTemplateBuilder } from '../src/builder'
import { devEngine } from './helpers'

const byKey = (node: RenderNode | undefined, key: string): RenderNode | undefined =>
  !node ? undefined : node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)

async function pie(props: object = {}) {
  const s = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.5', screen: { key: 's', root: {
    type: 'chart', id: 'c', props: { kind: 'donut', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }], ...props } } } }))
  await s.load()
  const r = s.render().nodes[0]!
  return { row: byKey(r, 'c:row')!, legend: byKey(r, 'c:legend') }
}

describe('pie / donut layout', () => {
  it('default: centered, the legend below, its entries side by side', async () => {
    const { row, legend } = await pie()
    expect(row.style).toMatchObject({ display: 'flex', flexDirection: 'column', alignItems: 'center' })
    expect(row.children[0]!.key).toBe('c:svg')
    expect(legend!.style).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' })
  })

  it.each([
    ['top', { flexDirection: 'column-reverse', alignItems: 'center' }, 'row'],
    ['right', { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }, 'column'],
    ['left', { flexDirection: 'row-reverse', justifyContent: 'center' }, 'column']
  ])('legendPosition %s', async (position, rowStyle, legendDirection) => {
    const { row, legend } = await pie({ legendPosition: position })
    expect(row.style).toMatchObject(rowStyle)
    expect(legend!.style.flexDirection).toBe(legendDirection)
  })

  it.each([['leading', 'flex-start'], ['trailing', 'flex-end'], ['center', 'center'], ['nonsense', 'center']])('alignment %s', async (alignment, flex) => {
    expect((await pie({ alignment })).row.style.alignItems).toBe(flex)
    expect((await pie({ alignment, legendPosition: 'right' })).row.style.justifyContent).toBe(flex)
  })
})

describe('the Studio', () => {
  it('alignment and legendPosition for pie / donut only', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    const id = studio.document.add('chart')
    studio.document.setProps(id, { kind: 'donut', data: [1, 2] })
    studio.document.select(id)
    const legend = host.querySelector('.insp label select[aria-label="legendPosition"], .insp label') && [...host.querySelectorAll('.insp label')].find((l) => l.firstChild?.textContent === 'legendPosition')
    expect(legend).toBeDefined()
    expect([...legend!.querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'bottom', 'top', 'right', 'left'])
    expect([...host.querySelectorAll('.insp label')].some((l) => l.firstChild?.textContent === 'alignment')).toBe(true)
    studio.document.setProp(id, 'kind', 'bar')
    expect([...host.querySelectorAll('.insp label')].some((l) => l.firstChild?.textContent === 'legendPosition')).toBe(false)
    expect([...host.querySelectorAll('.insp label')].some((l) => l.firstChild?.textContent === 'alignment')).toBe(false)
    studio.destroy()
    host.remove()
  })
})
