// spec 2.1 (text.align, text.maxLines, text.markup) and the single-admin builder: action panels
// by what a component does with its action, a grouped inspector, bold / italic, picker options.
import { describe, expect, it } from 'vitest'
import { devEngine } from './helpers'
import { ActionSpec, ComponentFactory, ScreenSource, SduiNode, SPEC_VERSION, TemplateDocument, parseMarkup } from '../src/core'
import { actionUseOf, actionWarnings, describeComponent, find, mountTemplateBuilder, mountScreenBuilder, ValuesEditor } from '../src/builder'
import { renderNodeDOM } from '../src/vanilla'

async function render(root: object, seed: Record<string, unknown> = {}) {
  const screen = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.1', screen: { key: 's', root } }), { seed: seed as never })
  await screen.load()
  return screen.render().nodes[0]!
}

describe('parseMarkup', () => {
  it('bold, italic, nesting; escapes and unpaired markers stay literal', () => {
    expect(parseMarkup('Diskon **50%** *hari ini*')).toEqual([
      { text: 'Diskon ', bold: false, italic: false }, { text: '50%', bold: true, italic: false },
      { text: ' ', bold: false, italic: false }, { text: 'hari ini', bold: false, italic: true }
    ])
    expect(parseMarkup('***both***')).toEqual([{ text: 'both', bold: true, italic: true }])
    expect(parseMarkup('5 \\* 3 = 15')).toEqual([{ text: '5 * 3 = 15', bold: false, italic: false }])
    expect(parseMarkup('a ** b')).toEqual([{ text: 'a ** b', bold: false, italic: false }])
    expect(parseMarkup('2 * 3 and **x')).toEqual([{ text: '2 * 3 and **x', bold: false, italic: false }])
  })
})

describe('text (spec 2.1)', () => {
  it('markup: bold / italic runs; off by default (a 2.0 text keeps its asterisks)', async () => {
    const t = await render({ type: 'text', props: { value: 'Diskon **50%** *hari ini*', markup: true } })
    expect(t.children.map((c) => [c.text, c.style.fontWeight, c.style.fontStyle])).toEqual([
      ['Diskon ', undefined, undefined], ['50%', '700', undefined], [' ', undefined, undefined], ['hari ini', undefined, 'italic']
    ])
    const plain = await render({ type: 'text', props: { value: 'Diskon **50%**' } })
    expect(plain.text).toBe('Diskon **50%**')
    expect(plain.children).toHaveLength(0)
  })

  it('markup is parsed BEFORE tokens resolve: data never turns into formatting', async () => {
    const t = await render({ type: 'text', props: { value: 'Halo **{{user.name}}**', markup: true } }, { user: { name: '*admin* **x**' } })
    expect(t.children.map((c) => [c.text, c.style.fontWeight ?? null, c.style.fontStyle ?? null])).toEqual([
      ['Halo ', null, null], ['*admin* **x**', '700', null]
    ])
  })

  it('align and maxLines', async () => {
    const t = await render({ type: 'text', props: { value: 'x', align: 'center', maxLines: 2 } })
    expect(t.style).toMatchObject({ textAlign: 'center', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' })
    expect((await render({ type: 'text', props: { value: 'x', align: 'trailing' } })).style.textAlign).toBe('end')
    expect((await render({ type: 'text', props: { value: 'x', align: 'justify', maxLines: 0 } })).style).not.toHaveProperty('textAlign')
  })

  it('the DOM renderer draws the runs and the line clamp', async () => {
    const t = await render({ type: 'text', props: { value: 'a **b**', markup: true, maxLines: 3 } })
    const el = renderNodeDOM(t) as HTMLElement
    expect(el.querySelectorAll('span')[1]!.style.fontWeight).toBe('700')
    expect(el.style.getPropertyValue('-webkit-line-clamp')).toBe('3')
  })

  it('the builder writes spec 2.1', () => {
    expect(SPEC_VERSION).toBe('2.1')
  })
})

describe('what a component does with its action', () => {
  it('button = tap, chart = source, other built-ins = none, custom = tap (or what it declares)', () => {
    const f = ComponentFactory.withBuiltins()
    expect(['button', 'chart', 'text', 'card', 'vstack', 'image'].map((t) => f.info(t)!.action)).toEqual(['tap', 'source', 'none', 'none', 'none', 'none'])
    f.register('rating', () => null)
    expect(f.info('rating')!.action).toBe('tap')
    f.register('badge', () => null, { action: 'none' })
    expect(f.info('badge')!.action).toBe('none')
    expect(actionUseOf('card')).toBe('none')
    expect(actionUseOf('lottie')).toBe('tap')
  })

  it('describe and warn: a card\'s action never runs; a chart reads only an api source', () => {
    const card = SduiNode.decode({ type: 'card', id: 'c', action: { type: 'navigate', screen: 'detail' } })
    expect(describeComponent(card).join(' ')).not.toContain('Tappable')
    expect(describeComponent(card)).toContain('Its action never runs (it is not tappable)')
    const root = SduiNode.decode({ type: 'vstack', id: 'root', children: [
      { type: 'card', id: 'c', action: { type: 'navigate', screen: 'detail' } },
      { type: 'chart', id: 'k', action: { type: 'navigate', screen: 'detail' } },
      { type: 'button', id: 'b', action: { type: 'navigate', screen: 'detail' } }
    ] })
    expect(actionWarnings(root, {})).toEqual([
      'card #c: a card never runs its action (only buttons do) — remove it',
      'chart #k: a chart only reads an api data source; its navigate action is ignored'
    ])
  })
})

describe('Studio inspector (single admin)', () => {
  const mount = () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { screens: ['home'] })
    return { host, studio, done: () => { studio.destroy(); host.remove() } }
  }
  const groups = (host: Element) => [...host.querySelectorAll('.insp details.grp > summary')].map((s) => s.textContent)

  it('groups the props; only a button gets the Interaction section', () => {
    const { host, studio, done } = mount()
    studio.document.add('text')
    expect(groups(host)).toEqual(['Content', 'Layout', 'Style', 'Accessibility', 'Props (JSON)'])
    const card = studio.document.add('card')
    studio.document.select(card)
    expect(groups(host)).not.toContain('Interaction')
    studio.document.add('button')
    expect(groups(host)).toContain('Interaction')
    // a leftover action on a card: shown only to remove it
    studio.document.setAction(card, ActionSpec.decode({ type: 'navigate', screen: 'home' }))
    studio.document.select(card)
    expect(groups(host)).toContain('Action (ignored)')
    ;[...host.querySelectorAll<HTMLButtonElement>('.insp button')].find((b) => b.textContent === 'Remove action')!.click()
    expect(find(studio.document.root, card)!.action).toBeUndefined()
    done()
  })

  it('a text value is multi-line; B wraps the selection in ** and turns markup on', () => {
    const { host, studio, done } = mount()
    const id = studio.document.add('text')
    const area = host.querySelector<HTMLTextAreaElement>('.insp .mtext textarea')!
    area.value = 'Diskon 50%\nhari ini'
    area.dispatchEvent(new Event('change'))
    expect(find(studio.document.root, id)!.props.value).toBe('Diskon 50%\nhari ini')
    const again = host.querySelector<HTMLTextAreaElement>('.insp .mtext textarea')!
    again.setSelectionRange(7, 10)
    host.querySelector<HTMLButtonElement>('.insp .fmt-b')!.click()
    const node = find(studio.document.root, id)!
    expect(node.props.value).toBe('Diskon **50%**\nhari ini')
    expect(node.props.markup).toBe(true)
    done()
  })

  it('picker options are a table; colors are tokens or hex', () => {
    const { host, studio, done } = mount()
    const id = studio.document.add('picker')
    studio.document.setProp(id, 'options', ['a', { value: 'b', label: 'Bee' }])
    const rows = () => [...host.querySelectorAll<HTMLElement>('.insp .opt:not(.hd)')]
    expect(rows().map((r) => [...r.querySelectorAll('input')].map((i) => i.value))).toEqual([['a', 'a'], ['b', 'Bee']])
    ;[...host.querySelectorAll<HTMLButtonElement>('.insp button')].find((b) => b.textContent === '+ Add option')!.click()
    expect(find(studio.document.root, id)!.props.options).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'Bee' }, { value: 'option3', label: 'Option 3' }])
    const token = host.querySelector<HTMLSelectElement>('select[aria-label="background token"]')!
    token.value = 'surface'
    token.dispatchEvent(new Event('change'))
    expect(find(studio.document.root, id)!.props.background).toBe('surface')
    const hex = host.querySelector<HTMLInputElement>('input[aria-label="background hex"]')!
    hex.value = '#FF0000'
    hex.dispatchEvent(new Event('change'))
    expect(find(studio.document.root, id)!.props.background).toBe('#FF0000')
    hex.value = 'red; background:url(x)'
    hex.dispatchEvent(new Event('change'))
    expect(find(studio.document.root, id)!.props.background).toBe('#FF0000')   // not a hex: ignored
    done()
  })
})

describe('content mode (the admin fills values)', () => {
  it('bold / italic in a value only when the template turned markup on', () => {
    const template = TemplateDocument.decode({ schemaVersion: '2.1', template: { key: 'promo', version: 1, root: { type: 'vstack', id: 'root', children: [
      { type: 'text', id: 'rich', order: 1, props: { value: 'Judul', markup: true } },
      { type: 'text', id: 'plain', order: 2, props: { value: 'Biasa' } }
    ] } } })
    const host = document.createElement('div')
    document.body.append(host)
    const editor = new ValuesEditor({ screen: 'promo', template })
    const builder = mountScreenBuilder(host, { editor, showTemplates: false })
    editor.select('rich')
    expect(host.querySelector('.insp .fmt-b')).not.toBeNull()
    editor.select('plain')
    expect(host.querySelector('.insp .fmt-b')).toBeNull()
    expect(host.querySelector('.insp .mtext textarea')).not.toBeNull()
    builder.destroy()
    host.remove()
  })
})
