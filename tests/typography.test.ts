// spec 2.3 — text typography: font (a name, never CSS), transform, letterSpacing, lineHeight;
// and the Studio's font picker (built-ins + the app's catalog).
import { describe, expect, it } from 'vitest'
import { ScreenSource, SduiNode, typography, type RenderNode } from '../src/core'
import { mountTemplateBuilder } from '../src/builder'
import { devEngine } from './helpers'

const t = (props: object) => typography(new SduiNode({ type: 'text', props: props as never }))

describe('typography', () => {
  it('a font is a name: built-in stacks, a host variable, never CSS', () => {
    expect(t({ font: 'rounded' }).fontFamily).toBe('var(--sdui-font-rounded, ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif)')
    expect(t({ font: 'mono' }).fontFamily).toContain('ui-monospace')
    expect(t({ font: 'brand' }).fontFamily).toBe('var(--sdui-font-brand, inherit)')
    for (const bad of ['Arial; color: red', 'a b', '1x', '', 'x)'] as const) expect(t({ font: bad })).not.toHaveProperty('fontFamily')
  })

  it('transform, letterSpacing, lineHeight within their ranges', () => {
    expect(t({ transform: 'uppercase', letterSpacing: 1.5, lineHeight: 1.6 })).toEqual({ textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: '1.6' })
    expect(t({ transform: 'shout', letterSpacing: 40, lineHeight: 9 })).toEqual({})
    expect(t({ letterSpacing: -0.5 })).toEqual({ letterSpacing: '-0.5px' })
  })

  it('a text renders them over its preset (lineHeight replaces the 1.3 default)', async () => {
    const s = devEngine().screen(ScreenSource.inline({ schemaVersion: '2.3', screen: { key: 's', root: {
      type: 'text', id: 'x', props: { value: 'Halo', style: 'title', font: 'serif', transform: 'uppercase', letterSpacing: 2, lineHeight: 1.1 } } } }))
    await s.load()
    const node = s.render().nodes[0] as RenderNode
    expect(node.style).toMatchObject({ fontSize: '28px', fontWeight: '700', lineHeight: '1.1', letterSpacing: '2px', textTransform: 'uppercase' })
    expect(node.style.fontFamily).toContain('--sdui-font-serif')
    expect(node.text).toBe('Halo')                                     // the value itself is untouched
  })
})

describe('the Studio', () => {
  it('a font picker (built-ins + catalog.fonts); case, spacing and line height fields', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: { fonts: ['brand'] } })
    const id = studio.document.add('text')
    studio.document.select(id)
    const font = host.querySelector('[aria-label="font"]') as HTMLSelectElement
    expect([...font.options].map((o) => o.value)).toEqual(['', 'rounded', 'serif', 'mono', 'brand'])
    font.value = 'brand'
    font.dispatchEvent(new Event('change'))
    expect(studio.document.selected!.props.font).toBe('brand')
    const labels = [...host.querySelectorAll('.insp label')].map((l) => l.firstChild?.textContent)
    expect(labels).toEqual(expect.arrayContaining(['transform', 'letterSpacing', 'lineHeight']))
    studio.destroy()
    host.remove()
  })
})
