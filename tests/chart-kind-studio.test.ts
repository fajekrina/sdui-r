// The chart inspector follows `kind`: only the props that kind reads; values it ignores are kept,
// listed, and removable (switching back uses them again); a pie / donut's height is its diameter.
import { describe, expect, it } from 'vitest'
import { chartReads, mountTemplateBuilder } from '../src/builder'

// a field's name: the label's own first text (a checkbox puts its input first)
const labels = (host: Element) => [...host.querySelectorAll('.insp label')].map((l) => ([...l.childNodes].find((n) => n.nodeType === 3)?.textContent ?? '').trim())

describe('chartReads', () => {
  it('per kind', () => {
    expect(chartReads('bar', 'tip')).toBe(true)
    expect(chartReads('pie', 'tip')).toBe(false)
    expect(chartReads('line', 'min')).toBe(true)
    expect(chartReads('donut', 'min')).toBe(false)
    expect(chartReads('pie', 'showLegend')).toBe(true)
    expect(chartReads('bar', 'showLegend')).toBe(false)
    expect(chartReads('', 'tip')).toBe(true)                 // no kind = bar
    expect(chartReads('pie', 'data')).toBe(true)             // not listed = every kind
  })
})

describe('the chart inspector', () => {
  it('shows what the kind reads; lists (and removes) what it ignores', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    const id = studio.document.add('chart')
    studio.document.setProps(id, { kind: 'bar', data: [1, 2], min: 0, tip: '{{item.value}}', selectState: 'b', color: 'danger' })
    studio.document.select(id)
    expect(labels(host)).toEqual(expect.arrayContaining(['min', 'max', 'color', 'selectedColor']))
    expect(labels(host)).not.toContain('showLegend')
    expect(host.querySelector('.insp .unused')).toBeNull()

    studio.document.setProp(id, 'kind', 'pie')
    expect(labels(host)).not.toContain('min')
    expect(labels(host)).toContain('showLegend')
    expect(labels(host)).toContain('height (diameter)')
    const note = host.querySelector('.insp .unused')!
    expect(note.textContent).toContain('Not used by a pie chart: color, min, tip, selectState')
    expect(studio.document.selected!.props).toMatchObject({ min: 0, tip: '{{item.value}}' })   // kept

    studio.document.setProp(id, 'kind', 'bar')                    // switching back: they work again
    expect(host.querySelector('.insp .unused')).toBeNull()
    studio.document.setProp(id, 'kind', 'donut')
    ;(host.querySelector('.insp .unused button') as HTMLButtonElement).click()
    expect(studio.document.selected!.props).not.toHaveProperty('tip')
    expect(studio.document.selected!.props).not.toHaveProperty('min')
    expect(studio.document.selected!.props).toMatchObject({ kind: 'donut', data: [1, 2] })
    studio.document.undo()                                          // one undo step brings them back
    expect(studio.document.selected!.props).toMatchObject({ tip: '{{item.value}}', min: 0 })
    studio.destroy()
    host.remove()
  })
})
