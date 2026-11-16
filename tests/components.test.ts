import { describe, expect, it } from 'vitest'
import { devEngine } from './helpers'
import { ComponentFactory, ScreenSource, createEngine, type RenderNode } from '../src/core'

async function render(root: object, seed: Record<string, unknown> = {}, slots?: string[]) {
  const screen = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.0', screen: { key: 's', root } }), { seed: seed as never })
  await screen.load()
  return screen.render({ slots }).nodes[0]!
}

describe('built-in components', () => {
  it('registers v1 + v1.1 types', () => {
    expect(ComponentFactory.withBuiltins().registeredTypes).toEqual([
      'button', 'card', 'chart', 'divider', 'form', 'grid', 'hstack', 'image', 'list', 'picker', 'scroll', 'spacer', 'text', 'textArea', 'textField', 'vstack', 'zstack'
    ])
  })

  it('text: style sizes, weight, hex and token colors', async () => {
    const t = await render({ type: 'text', props: { value: 'x', style: 'title', weight: 'semibold', color: 'primary' } })
    expect(t.style).toMatchObject({ fontSize: '28px', fontWeight: '600', color: 'var(--sdui-color-primary, #0A66C2)' })
    const hexed = await render({ type: 'text', props: { value: 'x', color: '#FF000080', background: 'url(evil)' } })
    expect(hexed.style.color).toBe('rgba(255, 0, 0, 0.502)')
    expect(hexed.style.background).toBeUndefined()   // not a hex / token → ignored
  })

  it('image: symbol glyph or app-resolved asset name, never a raw URL from the payload', async () => {
    const sym = await render({ type: 'image', props: { systemName: 'star.fill' } })
    expect(sym.children[0]!.element).toBe('svg')
    const asset = await render({ type: 'image', props: { name: 'hero', contentMode: 'fill' } })
    expect(asset.attrs.src).toBe('hero')
    expect(asset.style.objectFit).toBe('cover')
  })

  it('stacks, grid, spacer, divider, scroll', async () => {
    const v = await render({ type: 'vstack', props: { spacing: 12, alignment: 'leading' }, children: [{ type: 'spacer', props: { height: 8 } }, { type: 'divider' }] })
    expect(v.style).toMatchObject({ flexDirection: 'column', gap: '12px', alignItems: 'flex-start' })
    expect(v.children.map((c) => c.element)).toEqual(['div', 'hr'])
    const g = await render({ type: 'grid', props: { columns: 3 } })
    expect(g.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
    const s = await render({ type: 'scroll', props: { axis: 'horizontal' } })
    expect(s.style.overflowX).toBe('auto')
  })

  it('size: the container is bounded (height / maxHeight, clipping); a scroll inside fills it and scrolls', async () => {
    // card (maxHeight 240) → scroll → vstack → image; image
    const card = await render({ type: 'card', props: { maxHeight: 240 }, children: [{ type: 'scroll', children: [
      { type: 'vstack', children: [{ type: 'image', props: { name: 'a', height: 200 } }, { type: 'image', props: { name: 'b', height: 200 } }] }
    ] }] })
    expect(card.style).toMatchObject({ maxHeight: '240px', overflow: 'hidden', minHeight: '0', display: 'flex', flexDirection: 'column' })
    const scroll = card.children[0]!
    expect(scroll.style).toMatchObject({ overflowY: 'auto', flex: '1 1 auto', minHeight: '0' })
    expect(scroll.children[0]!.style.flexShrink).toBe('0')      // its content keeps its height → it scrolls
    expect((await render({ type: 'vstack', props: { height: 300 } })).style).toMatchObject({ height: '300px', overflow: 'hidden' })
    // unbounded: no clipping, no size
    const plain = await render({ type: 'vstack' })
    expect(plain.style.overflow).toBeUndefined()
    expect(plain.style.height).toBeUndefined()
    expect((await render({ type: 'card', props: { maxHeight: -5 } })).style.maxHeight).toBeUndefined()   // invalid → ignored
    // scroll has no size of its own any more
    expect((await render({ type: 'scroll', props: { maxHeight: 99 } })).style.maxHeight).toBe('100%')
  })

  it('grid: rowHeight makes uniform rows; a cell clips, a scroll cell scrolls', async () => {
    const g = await render({ type: 'grid', props: { columns: 2, rowHeight: 120, maxHeight: 400 }, children: [
      { type: 'card', children: [{ type: 'text', props: { value: 'a' } }] },
      { type: 'scroll', children: [{ type: 'text', props: { value: 'b' } }] }
    ] })
    expect(g.style).toMatchObject({ gridAutoRows: '120px', maxHeight: '400px', overflow: 'hidden' })
    expect(g.children[0]!.style).toMatchObject({ minHeight: '0', overflow: 'hidden' })
    expect(g.children[1]!.style).toMatchObject({ minHeight: '0', overflowY: 'auto' })
    expect(g.children[1]!.style.overflow).toBeUndefined()
    expect((await render({ type: 'grid', props: { columns: 2 }, children: [{ type: 'text' }] })).children[0]!.style.overflow).toBeUndefined()
  })

  it('zstack places children proportionally', async () => {
    const z = await render({ type: 'zstack', props: { width: 400, height: 200 }, children: [{ type: 'text', props: { value: 'x', x: 100, y: 50, width: 200, height: 100 } }] })
    expect(z.style.aspectRatio).toBe('400 / 200')
    expect(z.children[0]!.style).toMatchObject({ left: '25%', top: '25%', width: '50%', height: '50%' })
  })

  it('card defaults, overridden by props', async () => {
    const c = await render({ type: 'card', props: { background: '#000000', cornerRadius: 4 } })
    expect(c.style).toMatchObject({ padding: '16px', borderRadius: '4px', background: 'rgba(0, 0, 0, 1)' })
  })

  it('list repeats its template per item with a scoped row', async () => {
    const l = await render(
      { type: 'list', props: { items: 'promos', as: 'p' }, children: [{ type: 'text', props: { value: '{{p.title}}' } }] },
      { promos: [{ title: 'A' }, { title: 'B' }] }
    )
    expect(l.element).toBe('ul')
    expect(l.children.map((row) => row.children[0]!.text)).toEqual(['A', 'B'])
  })

  it('form fields: labels, required marks, secure inputs, keyboard modes, picker options', async () => {
    const f = await render({ type: 'form', id: 'f', children: [
      { type: 'textField', props: { name: 'pin', label: 'PIN', secure: true, required: true } },
      { type: 'textField', props: { name: 'email', label: 'Email', keyboard: 'email' } },
      { type: 'picker', props: { name: 'p', label: 'P', options: ['a', { value: 'b', label: 'Bee' }] } },
      { type: 'textArea', props: { name: 'n', label: 'N', rows: 4 } }
    ] })
    const control = (i: number) => f.children[i]!.children[1]!
    expect(f.children[0]!.children[0]!.text).toBe('PIN *')
    expect(control(0).attrs).toMatchObject({ type: 'password', 'data-sdui-secure': 'true', autocomplete: 'off' })
    expect(control(1).attrs).toMatchObject({ type: 'email', inputmode: 'email' })
    expect(control(2).children.map((o) => o.text)).toEqual(['Select…', 'a', 'Bee'])
    expect(control(3).attrs.rows).toBe(4)
    expect(control(0).field).toEqual({ formId: 'f', name: 'pin' })
  })

  it('accessibility props', async () => {
    const t = await render({ type: 'text', props: { value: 'x', a11yLabel: 'Hello {{n}}', a11yId: 'greet', a11yTraits: ['header'] } }, { n: 'Ada' })
    expect(t.attrs).toMatchObject({ 'aria-label': 'Hello Ada', 'data-testid': 'greet', role: 'heading' })
  })

  it('button variants', async () => {
    const b = await render({ type: 'button', props: { title: 'Go', variant: 'primary' }, action: { type: 'dismiss' } })
    expect(b.style.background).toContain('--sdui-color-primary')
    expect(b.on?.click).toBeDefined()
  })
})

describe('preview (non-interactive) has no handlers or field bindings', () => {
  it('drops on/field', async () => {
    const screen = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.0', screen: { key: 's', root: { type: 'form', children: [{ type: 'textField', props: { name: 'a' } }, { type: 'button', props: { title: 'x' }, action: { type: 'dismiss' } }] } } }))
    await screen.load()
    const walk = (n: RenderNode): RenderNode[] => [n, ...n.children.flatMap(walk)]
    const all = walk(screen.render({ interactive: false }).nodes[0]!)
    expect(all.some((n) => n.on || n.field)).toBe(false)
  })
})
