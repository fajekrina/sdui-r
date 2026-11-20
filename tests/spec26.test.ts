// spec 2.6 — a value set is a PAGE: any prop of a template component (not the builder note)
// and its action; below 2.6 content only. The builder's page helpers: merge, split (only the
// differences), the template's structure kept, sample texts found; the locked editor.
import { describe, expect, it } from 'vitest'
import { fixture } from './helpers'
import { SchemaValidator, TemplateDocument, ValuesDocument, compose, isOverridableProp, valuesOverride } from '../src/core'
import { EditorDocument, assertSameStructure, mergePage, placeholders, splitPage } from '../src/builder'

const promo = TemplateDocument.fromJSON(fixture('valid/template_promo.json'))
const values = (schemaVersion: string, components: object) => ValuesDocument.decode({ schemaVersion, values: { screen: 'p', template: { key: 'promoCard', version: 1 }, components } })
const check = (doc: ValuesDocument) => new SchemaValidator().validateValues(doc, promo)

describe('value set overrides (spec 2.6)', () => {
  it('2.6 sets any prop but the builder note; below 2.6 content only', () => {
    expect(valuesOverride('2.6')).toBe(true)
    expect(valuesOverride('2.5')).toBe(false)
    expect(isOverridableProp('text', 'color', '2.6')).toBe(true)
    expect(isOverridableProp('text', 'color', '2.5')).toBe(false)
    expect(isOverridableProp('text', 'value', '2.5')).toBe(true)
    expect(isOverridableProp('text', 'builderNote', '2.6')).toBe(false)
    expect(() => check(values('2.6', { headline: { props: { color: '#000000', padding: 4 } } }))).not.toThrow()
    expect(() => check(values('2.5', { headline: { props: { color: '#000000' } } }))).toThrow(/not content of a text/)
    expect(() => check(values('2.6', { headline: { props: { builderNote: 'x' } } }))).toThrow(/not content/)
  })

  it('an action from 2.6, validated like a template\'s', () => {
    expect(() => check(values('2.6', { cta: { action: { type: 'navigate', screen: 'offersJakarta' } } }))).not.toThrow()
    expect(() => check(values('2.5', { cta: { action: { type: 'navigate', screen: 'x' } } }))).toThrow(/from 2.6/)
    expect(() => check(values('2.6', { cta: { action: { type: 'navigate', screen: 'not a name' } } }))).toThrow()
  })

  it('compose: the page action replaces the template\'s; null removes a template prop', () => {
    const v = values('2.6', { cta: { action: { type: 'navigate', screen: 'other' } }, 'hero-image': { props: { height: null } } }).values
    const screen = compose(promo.template, v)
    const cta = screen.root.children.find((c) => c.id === 'cta')!
    expect(cta.action?.toJSON()).toEqual({ type: 'navigate', screen: 'other' })
    expect(screen.root.children.find((c) => c.id === 'hero-image')!.props).not.toHaveProperty('height')
  })

  it('the value set JSON round-trips its action', () => {
    const v = values('2.6', { cta: { props: { title: 'A' }, action: { type: 'navigate', screen: 'b' } } })
    expect(ValuesDocument.decode(v.toJSON()).values.components.cta!.action?.toJSON()).toEqual({ type: 'navigate', screen: 'b' })
  })
})

describe('page helpers (builder)', () => {
  it('merge then split stores only the differences (props, removed props, action)', () => {
    const page = values('2.6', { headline: { props: { value: 'Halo', color: '#0F766E' } } })
    const { document, dropped } = mergePage(promo, page)
    expect(dropped).toEqual([])
    const doc = new EditorDocument({ mode: 'template', locked: true })
    doc.importJSON(document.toJSON())
    doc.setProp('cta', 'variant', 'primary')
    doc.setProp('hero-image', 'height', undefined)
    doc.setAction('cta', undefined)
    doc.setProp('headline', 'color', '#0F766E')
    const out = splitPage(doc.templateDocument(), promo, 'p')
    expect(out.schemaVersion).toBe('2.6')
    expect(out.toJSON().values.components).toEqual({
      headline: { props: { value: 'Halo', color: '#0F766E' } },
      cta: { props: { variant: 'primary' } },
      'hero-image': { props: { height: null } }
    })
    // the template's own value is not stored again
    doc.setProp('headline', 'style', 'title')
    expect(splitPage(doc.templateDocument(), promo, 'p').values.components.headline!.props).not.toHaveProperty('style')
  })

  it('an action that differs is stored; a 2.0 content value set merges (old pages)', () => {
    const { document } = mergePage(promo, ValuesDocument.fromJSON(fixture('valid/values_promo.json')))
    const doc = new EditorDocument({ mode: 'template', locked: true })
    doc.importJSON(document.toJSON())
    expect(splitPage(doc.templateDocument(), promo, 'home').values.components.headline!.props!.value).toBe('Cashback 20% untuk {{user.name}}')
    const raw = document.toJSON() as unknown as { template: { root: { children: Array<{ id: string; action?: unknown }> } } }
    raw.template.root.children.find((c) => c.id === 'cta')!.action = { type: 'navigate', screen: 'detail' }
    expect(splitPage(TemplateDocument.decode(raw), promo, 'home').values.components.cta!.action?.toJSON()).toEqual({ type: 'navigate', screen: 'detail' })
  })

  it('unknown ids and props the version may not set are dropped on merge', () => {
    const { dropped } = mergePage(promo, values('2.5', { gone: { props: { value: 'x' } }, headline: { props: { value: 'a', color: '#000000' } } }))
    expect(dropped).toEqual(['gone', 'headline.color'])
  })

  it('the structure must stay the template\'s', () => {
    const raw = promo.toJSON() as unknown as { template: { root: { children: unknown[] } } }
    raw.template.root.children.pop()
    expect(() => assertSameStructure(TemplateDocument.decode(raw).template, promo.template)).toThrow(/cannot add, remove or move/)
    expect(() => splitPage(TemplateDocument.decode(raw), promo, 'p')).toThrow()
  })

  it('placeholders: texts wholly in brackets, also inside list items', () => {
    const t = TemplateDocument.decode({ schemaVersion: '2.6', template: { key: 'k', version: 1, root: { type: 'vstack', id: 'root', order: 0, children: [
      { type: 'text', id: 'title', order: 0, props: { value: '[Insight Title]' } },
      { type: 'text', id: 'q', order: 1, props: { value: 'Suka dengan insight ini?' } },
      { type: 'text', id: 'mixed', order: 2, props: { value: 'Halo [nama]' } },
      { type: 'list', id: 'cards', order: 3, props: { items: [{ title: '[List Title 1]' }] } }
    ] } } })
    expect(placeholders(t.template.root)).toEqual(['title.value', 'cards.items'])
  })
})

describe('locked editor (a page)', () => {
  const opened = () => {
    const doc = new EditorDocument({ mode: 'template', locked: true })
    doc.importJSON(promo.toJSON())
    return doc
  }

  it('cannot add, delete, duplicate, move, reparent, or change load / state', () => {
    const doc = opened()
    const before = JSON.stringify(doc.templateDocument().toJSON())
    expect(() => doc.add('text')).toThrow(/cannot add/)
    doc.delete('cta')
    doc.duplicate('cta')
    doc.move('cta', -1)
    expect(doc.reparent('cta', 'root', 0)).toBe(false)
    doc.setLoad([])
    doc.setScreenState({ x: { initial: '' } })
    expect(JSON.stringify(doc.templateDocument().toJSON())).toBe(before)
  })

  it('props and actions edit; a JSON edit that changes the structure is refused', () => {
    const doc = opened()
    doc.setProp('headline', 'color', '#123456')
    expect(doc.root.children.find((c) => c.id === 'headline')!.props.color).toBe('#123456')
    const raw = doc.templateDocument().toJSON() as unknown as { template: { root: { children: unknown[] } } }
    raw.template.root.children.pop()
    expect(() => doc.importJSON(raw, { keepIds: true })).toThrow(/cannot add, remove or move/)
  })

  it('an unlocked template document is unchanged', () => {
    const doc = new EditorDocument({ mode: 'template' })
    expect(doc.locked).toBe(false)
    expect(doc.add('text')).toBeTruthy()
  })
})
