// spec 2.5 — a text, an image or a card with an action runs it when tapped: a native
// <button> that looks the same; disabledWhen dims it; a card holding a control keeps its
// action unused (no button in a button).
import { describe, expect, it, vi } from 'vitest'
import { devEngine } from './helpers'
import { ActionDispatcher, ScreenSource, type RenderNode } from '../src/core'

async function screenOf(root: object) {
  const perform = vi.fn(async () => new TextEncoder().encode('{}'))
  const engine = devEngine({ actionDispatcher: new ActionDispatcher({ network: { perform } }), assetURL: (n) => (n === 'hero' ? 'https://cdn.example/hero.png' : '') })
  const screen = engine.screen(ScreenSource.inline({ schemaVersion: '2.5', screen: { key: 's', root } }))
  await screen.load()
  return { screen, perform }
}
const api = { type: 'api', request: 'open' }
const byKey = (node: RenderNode, key: string): RenderNode | undefined =>
  node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)

describe('tappable text, image, card (spec 2.5)', () => {
  it('a text with an action is a button that keeps its look, and runs the action', async () => {
    const { screen, perform } = await screenOf({ type: 'text', id: 't', props: { value: 'Lihat semua', color: '#2563EB' }, action: api })
    const t = screen.render().nodes[0]!
    expect(t.element).toBe('button')
    expect(t.attrs.type).toBe('button')
    expect(t.text).toBe('Lihat semua')
    expect(t.style).toMatchObject({ background: 'none', border: '0', padding: '0', textAlign: 'start', cursor: 'pointer', fontSize: '16px' })
    expect(t.style.color).toBe('rgba(37, 99, 235, 1)')
    await screen.handle(t.on!.click!)
    expect(perform).toHaveBeenCalledOnce()
  })

  it('without an action nothing changes', async () => {
    const { screen } = await screenOf({ type: 'vstack', children: [{ type: 'text', id: 't', props: { value: 'A' } }, { type: 'card', id: 'c' }, { type: 'image', id: 'i', props: { systemName: 'star.fill' } }] })
    const root = screen.render().nodes[0]!
    expect(['t', 'c', 'i'].map((k) => byKey(root, k)!.element)).toEqual(['span', 'div', 'span'])
  })

  it('a picture goes inside a button that takes its box; the label names the button', async () => {
    const { screen } = await screenOf({ type: 'image', id: 'i', props: { name: 'hero', height: 120, cornerRadius: 12, a11yLabel: 'Promo' }, action: api })
    const b = screen.render().nodes[0]!
    expect(b).toMatchObject({ element: 'button', attrs: { type: 'button', 'aria-label': 'Promo' } })
    expect(b.style).toMatchObject({ height: '120px', borderRadius: '12px', overflow: 'hidden', padding: '0' })
    const img = byKey(b, 'i:img')!
    expect(img).toMatchObject({ element: 'img', attrs: { src: 'https://cdn.example/hero.png', alt: 'Promo' } })
    expect(img.style).toMatchObject({ width: '100%', height: '100%', objectFit: 'contain' })
    expect(b.on?.click).toBeDefined()
  })

  it('an icon image is the button itself; an empty frame loses its img role', async () => {
    const icon = (await screenOf({ type: 'image', id: 'i', props: { systemName: 'star.fill' }, action: api })).screen.render().nodes[0]!
    expect(icon.element).toBe('button')
    expect(byKey(icon, 'i:symbol')!.element).toBe('svg')
    const frame = (await screenOf({ type: 'image', id: 'f', action: api })).screen.render().nodes[0]!
    expect(frame.element).toBe('button')
    expect(frame.attrs.role).toBeUndefined()
  })

  it('a card with an action is the button; one holding a button keeps its action unused', async () => {
    const { screen, perform } = await screenOf({ type: 'vstack', children: [
      { type: 'card', id: 'c', action: api, children: [{ type: 'text', id: 'in', props: { value: 'Promo' } }] },
      { type: 'card', id: 'h', action: api, children: [{ type: 'button', id: 'b', props: { title: 'Beli' } }] }
    ] })
    const root = screen.render().nodes[0]!
    const card = byKey(root, 'c')!
    expect(card.element).toBe('button')
    expect(card.style).toMatchObject({ display: 'flex', flexDirection: 'column', padding: '16px', borderRadius: '12px' })
    expect(byKey(card, 'in')!.element).toBe('span')
    expect(byKey(root, 'h')!.element).toBe('div')
    expect(byKey(root, 'h')!.on).toBeUndefined()
    await screen.handle(card.on!.click!)
    expect(perform).toHaveBeenCalledOnce()
  })

  it('disabledWhen dims it and drops the handler', async () => {
    const { screen } = await screenOf({ type: 'text', id: 't', props: { value: 'A', disabledWhen: { state: 'x', equals: '' } }, action: api })
    const t = screen.render().nodes[0]!
    expect(t.element).toBe('button')
    expect(t.attrs.disabled).toBe(true)
    expect(t.style.opacity).toBe('0.6')
    expect(t.on).toBeUndefined()
  })
})
