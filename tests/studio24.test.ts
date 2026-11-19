// spec 2.4 phase 4 — the Studio for the interactive chart: tip (auto selectState, item fields),
// initialSelection (incl. item keys), selectedColor; state panel / warnings know the chart's state.
import { describe, expect, it } from 'vitest'
import { SduiNode } from '../src/core'
import { describeComponent, mountTemplateBuilder, stateNames, stateValues, stateWarnings } from '../src/builder'

const tree = (children: object[]) => SduiNode.decode({ type: 'vstack', id: 'root', children })
const data = [{ key: 'feb', label: 'Feb', value: 1, amount: 'Rp1' }, { key: 'mar', label: 'Mar', value: 2, amount: 'Rp2' }]

describe('state-editor knows the chart', () => {
  it('its selectState is a state; static item keys are its values', () => {
    const t = tree([{ type: 'chart', id: 'c', props: { data, selectState: 'bar' } }])
    expect(stateNames(t)).toEqual(['bar'])
    expect(stateValues(t, 'bar')).toEqual(['', 'feb', 'mar'])
    expect(stateWarnings(tree([
      { type: 'chart', id: 'c', props: { data, selectState: 'bar' } },
      { type: 'text', id: 't', props: { visibleWhen: { state: 'bar', equals: 'mar' } } }
    ]))).toEqual([])
  })

  it('a data source chart: its keys are unknown here, so no "no button sets" warning', () => {
    expect(stateWarnings(tree([
      { type: 'chart', id: 'c', props: { selectState: 'bar' }, action: { type: 'api', request: 'coffeeSpending' } },
      { type: 'text', id: 't', props: { visibleWhen: { state: 'bar', equals: '2025-03' } } }
    ]))).toEqual([])
  })

  it('warns: a tip that never shows (spec 2.5: every kind may pick)', () => {
    expect(stateWarnings(tree([{ type: 'chart', id: 'p', props: { kind: 'pie', data, tip: 'x', selectState: 's' } }]))).toEqual([])
    expect(stateWarnings(tree([{ type: 'chart', id: 'c', props: { data, tip: 'x' } }])).join()).toContain('the tip never shows')
    expect(stateWarnings(tree([{ type: 'chart', id: 'c', props: { data, tip: 'x', initialSelection: 'last' } }]))).toEqual([])
  })

  it('describeComponent', () => {
    expect(describeComponent(SduiNode.decode({ type: 'chart', props: { selectState: 'bar', tip: 'x' } }))).toContain('A tapped bar is picked (state bar); a tip shows its data')
    expect(describeComponent(SduiNode.decode({ type: 'chart', props: { kind: 'donut', selectState: 's' } }))).toContain('A tapped slice is picked (state s)')
  })
})

describe('the inspector', () => {
  it('tip (turns on selectState, lists the item fields), initialSelection (incl. keys), selectedColor', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    const id = studio.document.add('chart')
    studio.document.setProps(id, { kind: 'bar', data })
    studio.document.select(id)
    const tip = host.querySelector('textarea[aria-label="tip"]') as HTMLTextAreaElement
    expect(host.querySelector('.insp')!.textContent).toContain('{{item.amount}}')
    tip.value = '{{item.label}}'
    tip.dispatchEvent(new Event('input'))
    expect(studio.document.selected!.props).toMatchObject({ tip: '{{item.label}}', selectState: `${id}Bar` })
    const pick = host.querySelector('select[aria-label="initialSelection"]') as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toEqual(['', 'last', 'first', 'none', 'feb', 'mar'])
    pick.value = 'mar'
    pick.dispatchEvent(new Event('change'))
    expect(studio.document.selected!.props.initialSelection).toBe('mar')
    expect(host.querySelector('.insp')!.textContent).toContain('selectedColor')
    // the canvas (a static preview) shows the tip at the initial pick
    expect(host.querySelector(`.device [data-sdui-key="${id}:tip"]`)!.textContent).toBe('Mar')
    studio.destroy()
    host.remove()
  })
})
