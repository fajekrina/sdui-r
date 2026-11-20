// spec 2.2 — the props behind the "insight" template: full-width children, overlap, outline,
// per-side padding, shadow, pin; button icons and choices (selected state); stroke symbols;
// and the Studio fields for them (plus a template's default picture upload).
import { describe, expect, it, vi } from 'vitest'
import { devEngine, fixtureJSON } from './helpers'
import { ActionDispatcher, ScreenSource, SduiNode, Symbols, TemplateDocument, compose, sharedStyle, type RenderNode } from '../src/core'
import { find, mountTemplateBuilder } from '../src/builder'

async function screenOf(root: object) {
  const screen = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.2', screen: { key: 's', root } }))
  await screen.load()
  return { screen }
}
async function render(root: object) {
  return (await screenOf(root)).screen.render().nodes[0]!
}
const byKey = (node: RenderNode, key: string): RenderNode | undefined =>
  node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)

describe('layout (spec 2.2)', () => {
  it('vstack / card alignment fill stretches the children', async () => {
    expect((await render({ type: 'vstack', props: { alignment: 'fill' } })).style.alignItems).toBe('stretch')
    const card = await render({ type: 'card', props: { alignment: 'fill', spacing: 12 } })
    expect(card.style).toMatchObject({ alignItems: 'stretch', gap: '12px' })
    // a card keeps its leading default
    expect((await render({ type: 'card' })).style).toMatchObject({ alignItems: 'flex-start', gap: '8px' })
  })

  it('a negative vstack spacing overlaps: each later child is pulled up and drawn above', async () => {
    const v = await render({ type: 'vstack', props: { spacing: -40 }, children: [{ type: 'text', id: 'a', props: { value: 'A' } }, { type: 'card', id: 'b' }] })
    expect(v.style.gap).toBe('0px')
    expect(v.children[0]!.style).toMatchObject({ position: 'relative' })
    expect(v.children[0]!.style).not.toHaveProperty('marginTop')
    expect(v.children[1]!.style).toMatchObject({ position: 'relative', marginTop: '-40px' })
  })

  it('shared: per-side padding, outline, shadow, pin', () => {
    const style = (props: object) => sharedStyle(new SduiNode({ type: 'vstack', props: props as never }))
    expect(style({ padding: 8, paddingHorizontal: 24 }).padding).toBe('8px 24px')
    expect(style({ paddingVertical: 16 }).padding).toBe('16px 0px')
    expect(style({ padding: 4 }).padding).toBe('4px')
    expect(style({ borderColor: '#E3E3E3' }).border).toBe('1px solid rgba(227, 227, 227, 1)')
    expect(style({ borderWidth: 2 }).border).toBe('2px solid var(--sdui-color-border, #D1D5DB)')
    expect(style({ borderColor: 'nope' })).not.toHaveProperty('border')
    expect(style({ shadow: 'top' }).boxShadow).toContain('-4px')
    expect(style({ shadow: 'huge' })).not.toHaveProperty('boxShadow')
    expect(style({ pin: 'bottom' })).toMatchObject({ position: 'sticky', bottom: '0', marginTop: 'auto' })
    expect(style({ pin: 'top' })).toMatchObject({ position: 'sticky', top: '0' })
    expect(style({ pin: 'left' })).not.toHaveProperty('position')
  })
})

describe('symbols (spec 2.2)', () => {
  it('arrow.left and outline thumbs (stroke glyphs)', () => {
    for (const name of ['arrow.left', 'hand.thumbsup', 'hand.thumbsdown']) expect(Symbols.has(name)).toBe(true)
    const thumb = Symbols.node('k', 'hand.thumbsup').children[0]!
    expect(thumb.attrs).toMatchObject({ fill: 'none', stroke: 'currentColor', 'stroke-width': '2' })
    expect(Symbols.node('k', 'arrow.left').children[0]!.attrs).toMatchObject({ 'fill-rule': 'evenodd' })
    Symbols.register('test.outline', 'M4 4L20 20', { stroke: true })
    expect(Symbols.node('k', 'test.outline').children[0]!.attrs.stroke).toBe('currentColor')
  })
})

describe('button (spec 2.2)', () => {
  it('an icon above the title, in a circle; size and weight of the title', async () => {
    const b = await render({ type: 'button', id: 'like', props: { title: 'Suka!', systemName: 'hand.thumbsup', iconPosition: 'top', iconSize: 30, iconPadding: 13, iconBackground: '#F7F7F7', size: 14, weight: 'semibold' } })
    expect(b.style).toMatchObject({ display: 'inline-flex', flexDirection: 'column', fontSize: '14px', fontWeight: '600' })
    const icon = byKey(b, 'like:icon')!
    expect(icon.style).toMatchObject({ borderRadius: '50%', padding: '13px', fontSize: '30px' })
    // spec 2.5 — iconCornerRadius: a rounded square (0: square); a negative value keeps the circle
    const radius = async (r: number) => byKey(await render({ type: 'button', id: 'sq', props: { title: '', systemName: 'star.fill', iconBackground: '#F7F7F7', iconCornerRadius: r } }), 'sq:icon')!.style.borderRadius
    expect(await radius(8)).toBe('8px')
    expect(await radius(0)).toBe('0px')
    expect(await radius(-1)).toBe('50%')
    expect(byKey(b, 'like:title')!.text).toBe('Suka!')
    // icon only (a back button): no title span
    const back = await render({ type: 'button', id: 'back', props: { title: '', systemName: 'arrow.left' } })
    expect(byKey(back, 'back:title')).toBeUndefined()
    expect(back.style.flexDirection).toBe('row')
  })

  it('a choice: tapping selects it (aria-pressed, selected colors), even without an action', async () => {
    const { screen } = await screenOf({ type: 'hstack', children: [
      { type: 'button', id: 'no', props: { title: 'Kurang Suka', systemName: 'hand.thumbsdown', iconBackground: '#F7F7F7', group: 'feedback', value: 'dislike', selectedIconBackground: '#22C55E', selectedIconForeground: '#FFFFFF' } },
      { type: 'button', id: 'yes', props: { title: 'Suka!', systemName: 'hand.thumbsup', iconBackground: '#F7F7F7', group: 'feedback', value: 'like', selectedIconBackground: '#22C55E', selectedIconForeground: '#FFFFFF', selectedBackground: '#EEFFEE' } }
    ] })
    const nodes = () => screen.render().nodes[0]!
    expect(byKey(nodes(), 'yes')!.attrs['aria-pressed']).toBe('false')
    await screen.handle(byKey(nodes(), 'yes')!.on!.click!)
    const after = nodes()
    expect(screen.data.value('$selected.feedback')).toBe('like')
    expect(byKey(after, 'yes')!.attrs['aria-pressed']).toBe('true')
    expect(byKey(after, 'yes')!.style.background).toBe('rgba(238, 255, 238, 1)')
    expect(byKey(after, 'yes:icon')!.style).toMatchObject({ background: 'rgba(34, 197, 94, 1)', color: 'rgba(255, 255, 255, 1)' })
    expect(byKey(after, 'no:icon')!.style.background).toBe('rgba(247, 247, 247, 1)')
    // one choice per group: the other one takes it over
    await screen.handle(byKey(after, 'no')!.on!.click!)
    expect(screen.data.value('$selected.feedback')).toBe('dislike')
    expect(byKey(nodes(), 'yes')!.attrs['aria-pressed']).toBe('false')
  })

  it('the action runs after the choice and reads it as {{$selected.<group>}}', async () => {
    const perform = vi.fn(async () => new TextEncoder().encode('{}'))
    const engine = devEngine({ actionDispatcher: new ActionDispatcher({ network: { perform } }) })
    const screen = engine.screen(ScreenSource.inline({ schemaVersion: '2.2', screen: { key: 's', root: {
      type: 'button', id: 'yes', props: { title: 'Suka!', group: 'feedback', value: 'like' },
      action: { type: 'api', request: 'sendFeedback', params: { vote: '{{$selected.feedback}}' } }
    } } }))
    await screen.load()
    await screen.handle(screen.render().nodes[0]!.on!.click!)
    expect(perform).toHaveBeenCalledOnce()
    expect((perform.mock.calls[0] as unknown[])[1]).toEqual({ vote: 'like' })
  })

  it('a static preview (builder) has no handler and nothing selected', async () => {
    const { screen } = await screenOf({ type: 'button', props: { title: 'x', group: 'g', value: 'v' } })
    const b = screen.render({ interactive: false }).nodes[0]!
    expect(b.on).toBeUndefined()
    expect(b.attrs['aria-pressed']).toBe('false')
  })
})

describe('the insight template (fixture)', () => {
  it('decodes, composes and renders with the 2.2 props', async () => {
    const doc = TemplateDocument.decode(fixtureJSON('valid/template_insight.json'))
    expect(doc.schemaVersion).toBe('2.3')   // raised to 2.3 for its feedback state; the 2.2 props stay
    const screen = compose(doc.template)
    const top = find(screen.root, 'top')!
    expect(top.props.spacing).toBe(-128)
    const node = await render(screen.root.toJSON() as object)
    expect(byKey(node, 'footer')!.style).toMatchObject({ position: 'sticky', bottom: '0' })
    expect(byKey(node, 'insightCard')!.style.border).toContain('solid')
    expect(byKey(node, 'like')!.attrs['aria-pressed']).toBe('false')
  })
})

describe('Studio (spec 2.2)', () => {
  const mount = (options: Parameters<typeof mountTemplateBuilder>[1] = {}) => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, options)
    return { host, studio, done: () => { studio.destroy(); host.remove() } }
  }
  const labels = (host: Element) => [...host.querySelectorAll('.insp label')].map((l) => l.firstChild?.textContent ?? '')

  it('offers the new props: shared outline / padding / shadow / pin, fill, button icon and choice', () => {
    const { host, studio, done } = mount()
    studio.document.add('vstack')
    expect(labels(host)).toEqual(expect.arrayContaining(['paddingHorizontal', 'paddingVertical', 'borderColor', 'borderWidth', 'shadow', 'pin']))
    expect([...host.querySelectorAll('.insp select option')].map((o) => o.getAttribute('value'))).toContain('fill')
    studio.document.add('button')
    expect(labels(host)).toEqual(expect.arrayContaining(['systemName', 'iconPosition', 'iconSize', 'iconPadding', 'iconBackground', 'group', 'value', 'selectedIconBackground', 'size', 'weight']))
    expect([...host.querySelectorAll('.insp details.grp > summary')].map((s) => s.textContent)).toContain('Choice')
    // the symbol field suggests the built-in glyphs
    const symbol = [...host.querySelectorAll<HTMLInputElement>('.insp input')].find((i) => i.closest('label')?.firstChild?.textContent === 'systemName')!
    const list = host.querySelector(`#${symbol.getAttribute('list')}`)!
    expect([...list.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toContain('hand.thumbsup')
    done()
  })

  it('template mode: an image gets an upload field; the picture becomes its default name', async () => {
    const uploadAsset = vi.fn(async () => 'img_0123456789abcdef0123456789abcdef')
    const { host, studio, done } = mount({ uploadAsset })
    const id = studio.document.add('image')
    const picker = host.querySelector<HTMLInputElement>('.insp input[type=file]')!
    const file = new File([new Uint8Array([1, 2, 3])], 'emas.png', { type: 'image/png' })
    Object.defineProperty(picker, 'files', { value: [file] })
    picker.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(find(studio.document.root, id)!.props.name).toBe('img_0123456789abcdef0123456789abcdef'))
    expect(uploadAsset).toHaveBeenCalledWith({ file })
    done()
    // without uploadAsset: no upload field
    const plain = mount()
    plain.studio.document.add('image')
    expect(plain.host.querySelector('.insp input[type=file]')).toBeNull()
    plain.done()
  })
})
