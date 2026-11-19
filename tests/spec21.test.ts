// spec 2.1 (text.align, text.markup) and the single-admin builder: action panels
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

  it('align', async () => {
    expect((await render({ type: 'text', props: { value: 'x', align: 'center' } })).style.textAlign).toBe('center')
    expect((await render({ type: 'text', props: { value: 'x', align: 'trailing' } })).style.textAlign).toBe('end')
    expect((await render({ type: 'text', props: { value: 'x', align: 'justify' } })).style).not.toHaveProperty('textAlign')
  })

  it('a text always shows in full: every line, line breaks kept, never cut with an ellipsis', async () => {
    const value = 'Baris satu yang cukup panjang untuk dipotong\nBaris dua\n\nBaris empat'
    // a leftover maxLines from an early 2.1 draft is ignored
    const t = await render({ type: 'text', props: { value, maxLines: 1 } })
    expect(t.text).toBe(value)
    expect(t.style).toMatchObject({ display: 'block', whiteSpace: 'pre-wrap' })
    expect(t.style).not.toHaveProperty('WebkitLineClamp')
    expect(t.style).not.toHaveProperty('overflow')
    expect(t.style).not.toHaveProperty('textOverflow')
    const el = renderNodeDOM(t) as HTMLElement
    expect(el.textContent).toBe(value)
    expect(el.style.whiteSpace).toBe('pre-wrap')
    // the same with markup runs
    const rich = renderNodeDOM(await render({ type: 'text', props: { value: 'a **b**\nc', markup: true } })) as HTMLElement
    expect(rich.textContent).toBe('a b\nc')
    expect(rich.querySelectorAll('span')[1]!.style.fontWeight).toBe('700')
  })

  it('the builder writes spec 2.4 (2.1 documents stay valid)', () => {
    expect(SPEC_VERSION).toBe('2.4')
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
    expect(groups(host)).toEqual(['Content', 'State', 'Layout', 'Style', 'Accessibility', 'Props (JSON)'])   // spec 2.3: every component can be state-bound
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
    area.dispatchEvent(new Event('input'))
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

describe('live editing: the canvas follows every keystroke', () => {
  /// type `text` one character at a time into the FOCUSED field, as a person does (the panel is
  /// rebuilt after every keystroke, so the field that has the focus is a new element each time)
  const typeInto = (_start: HTMLInputElement | HTMLTextAreaElement, text: string) => {
    for (const ch of text) {
      const field = document.activeElement as HTMLInputElement | HTMLTextAreaElement
      field.value += ch
      field.setSelectionRange(field.value.length, field.value.length)
      field.dispatchEvent(new Event('input'))
    }
  }
  const device = (host: Element) => host.querySelector('.device')!.textContent

  it('Studio: text value, button title and number fields update the canvas while typing; focus and caret stay', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    const id = studio.document.add('text')
    const area = () => host.querySelector<HTMLTextAreaElement>('.insp .mtext textarea')!
    area().value = ''
    area().focus()
    typeInto(area(), 'Halo')
    expect(device(host)).toContain('Halo')                      // no blur needed
    expect(document.activeElement).toBe(area())                 // the rebuilt box still has the focus
    expect(area().selectionStart).toBe(4)
    typeInto(area(), '\nbaris dua')
    expect(find(studio.document.root, id)!.props.value).toBe('Halo\nbaris dua')
    // one typing session = one undo step
    area().dispatchEvent(new Event('change'))
    studio.document.undo()
    expect(find(studio.document.root, id)!.props.value).toBe('Text')

    const b = studio.document.add('button')
    const title = [...host.querySelectorAll('.insp label')].find((l) => l.firstChild?.textContent === 'title')!.querySelector('input')!
    title.value = ''
    title.focus()
    typeInto(title, 'Beli')
    expect(device(host)).toContain('Beli')
    expect(find(studio.document.root, b)!.props.title).toBe('Beli')
    expect(document.activeElement).toBe([...host.querySelectorAll('.insp label')].find((l) => l.firstChild?.textContent === 'title')!.querySelector('input'))
    studio.destroy()
    host.remove()
  })

  it('content mode: a value updates the canvas while typing; one undo step per session', () => {
    const template = TemplateDocument.decode({ schemaVersion: '2.1', template: { key: 'promo', version: 1, root: { type: 'vstack', id: 'root', children: [
      { type: 'text', id: 'headline', order: 1, props: { value: 'Judul' } },
      { type: 'button', id: 'cta', order: 2, props: { title: 'Lihat' }, action: { type: 'dismiss' } }
    ] } } })
    const host = document.createElement('div')
    document.body.append(host)
    const editor = new ValuesEditor({ screen: 'promo', template })
    const builder = mountScreenBuilder(host, { editor, showTemplates: false })
    editor.select('headline')
    const area = () => host.querySelector<HTMLTextAreaElement>('.insp .mtext textarea')!
    area().focus()
    typeInto(area(), 'Promo\nhari ini')
    expect(device(host)).toContain('Promo\nhari ini')
    expect(document.activeElement).toBe(area())
    area().dispatchEvent(new Event('change'))
    editor.select('cta')
    const title = [...host.querySelectorAll<HTMLInputElement>('.insp input')].find((i) => i.placeholder === 'Lihat')!
    title.focus()
    typeInto(title, 'Beli')
    expect(device(host)).toContain('Beli')
    editor.undo()                                                // the whole title at once
    expect(editor.value('cta', 'title')).toBe('Lihat')
    editor.undo()
    expect(editor.value('headline', 'value')).toBe('Judul')
    builder.destroy()
    host.remove()
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
