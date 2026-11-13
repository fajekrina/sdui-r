// sdui-r: two builders — the Template Builder (admin: components → template) and the
// Screen Builder (maker: templates → value set).
import { describe, expect, it, vi } from 'vitest'
import { EditorDocument, ValuesEditor, mountScreenBuilder, mountTemplateBuilder } from '../src/builder'
import { ActionSpec, TemplateDocument } from '../src/core'
import { fixtureJSON, flush } from './helpers'

const TEMPLATE = fixtureJSON('valid/template_promo.json') as Record<string, unknown>
const VALUES = fixtureJSON('valid/values_promo.json') as Record<string, unknown>

describe('Template Builder model (EditorDocument, template mode)', () => {
  it('readable ids, orders from the position, version + title, validated export', () => {
    const doc = new EditorDocument({ mode: 'template', key: 'promo' })
    const a = doc.add('text')
    doc.select(undefined)
    const b = doc.add('button')
    doc.select(undefined)
    doc.add('text')
    expect([a, b]).toEqual(['text1', 'button1'])
    doc.move('text2', -1)
    doc.setVersion(3)
    doc.setTitle('Promo')
    const t = doc.templateDocument().toJSON().template as { key: string; version: number; title: string; root: { id: string; order: number; children: { id: string; order: number }[] } }
    expect([t.key, t.version, t.title]).toEqual(['promo', 3, 'Promo'])
    expect(t.root).toMatchObject({ id: 'root', order: 0 })
    expect(t.root.children.map((c) => [c.id, c.order])).toEqual([['text1', 0], ['text2', 1], ['button1', 2]])
    expect(JSON.parse(doc.exportJSON()).template.root.children[1].id).toBe('text2')
  })

  it('renames ids (unique, valid), duplicates with fresh ids, undo restores the version', () => {
    const doc = new EditorDocument({ mode: 'template' })
    const id = doc.add('text')
    expect(doc.renameId(id, 'headline')).toBe(true)
    expect(doc.selection).toBe('headline')
    doc.add('text')
    expect(doc.renameId('text1', 'headline')).toBe(false)
    expect(doc.renameId('text1', '1bad')).toBe(false)
    doc.duplicate('headline')
    expect(doc.root.children.map((c) => c.id)).toEqual(['headline', 'text2', 'text1'])
    doc.setVersion(2)
    doc.undo()
    expect(doc.version).toBe(1)
  })

  it('imports a template: children in order, ids kept', () => {
    const doc = new EditorDocument({ mode: 'template' })
    doc.importJSON(TEMPLATE)
    expect(doc.key).toBe('promoCard')
    expect(doc.title).toBe('Kartu promo')
    expect(doc.root.children.map((c) => c.id)).toEqual(['headline', 'hero-image', 'cta'])
    expect(doc.issues()).toEqual([])
  })

  it('mountTemplateBuilder: a template comes out of Save; the JSON panel shows it', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const onSave = vi.fn()
    const studio = mountTemplateBuilder(host, { onSave })
    expect(host.textContent).toContain('Template Builder')
    studio.document.add('text')
    const panel = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Template JSON"]')!
    expect(JSON.parse(panel.value).template.root.children[0]).toMatchObject({ id: 'text1', order: 0, type: 'text' })
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'Save draft')!.click()
    await flush()
    expect(onSave.mock.calls[0]![0]).toMatchObject({ schemaVersion: '2.0', template: { key: 'template', version: 1 } })
    expect(() => mountTemplateBuilder(host, { document: new EditorDocument() })).toThrow(TypeError)
    studio.destroy()
    host.remove()
  })
})

describe('Screen Builder model (ValuesEditor)', () => {
  it('values over the template defaults; reset; composed; validated export', () => {
    const editor = new ValuesEditor({ screen: 'home' })
    editor.setTemplate(TEMPLATE)
    expect(editor.value('headline', 'value')).toBe('Judul')
    editor.setValue('headline', 'value', 'Halo')
    editor.setAction('cta', ActionSpec.decode({ type: 'navigate', screen: 'promo' }))
    expect(editor.isOverridden('headline', 'value')).toBe(true)
    expect(editor.composed()!.root.children[0]!.props.value).toBe('Halo')
    expect(JSON.parse(editor.exportJSON())).toEqual({
      schemaVersion: '2.0',
      values: { screen: 'home', template: { key: 'promoCard', version: 1 }, components: { cta: { action: { type: 'navigate', screen: 'promo' } }, headline: { props: { value: 'Halo' } } } }
    })
    editor.setValue('headline', 'value', '')
    expect(editor.isOverridden('headline')).toBe(false)
    editor.reset('cta')
    expect(editor.components).toEqual({})
  })

  it('switching template keeps the values of shared ids and reports the dropped ones', () => {
    const editor = new ValuesEditor({ values: VALUES, template: TEMPLATE })
    const v2 = structuredClone(TEMPLATE) as { template: { version: number; root: { children: { id: string }[] } } }
    v2.template.version = 2
    v2.template.root.children = v2.template.root.children.filter((c) => c.id !== 'cta')
    delete (v2.template as { variants?: unknown }).variants
    expect(editor.setTemplate(v2)).toEqual(['cta'])
    expect(Object.keys(editor.components).sort()).toEqual(['headline', 'hero-image'])
    expect(() => editor.importJSON(VALUES)).toThrow(/promoCard@1/)
  })
})

describe('mountScreenBuilder', () => {
  const choices = [{ key: 'promoCard', version: 1, title: 'Kartu promo', document: TEMPLATE }, { key: 'lazy', version: 4 }]

  it('palette of templates → canvas; a canvas click selects; the inspector writes values', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const onSubmitForReview = vi.fn()
    const loadTemplate = vi.fn(async () => { throw new Error('offline') })
    const builder = mountScreenBuilder(host, { screen: 'home', templates: choices, loadTemplate, onSubmitForReview })
    const tpl = host.querySelectorAll<HTMLButtonElement>('.tpl')
    expect([...tpl].map((b) => b.textContent)).toEqual(['Kartu promopromoCard@1', 'lazylazy@4'])
    tpl[1]!.click()
    await flush()
    expect(host.querySelector('.issues')!.textContent).toContain('offline')
    host.querySelectorAll<HTMLButtonElement>('.tpl')[0]!.click()
    await flush()
    expect(host.querySelector('.tplref[aria-label="Template"]')!.textContent).toBe('promoCard@1')
    host.querySelector<HTMLElement>('[data-sdui-node="headline"]')!.click()
    const input = [...host.querySelectorAll<HTMLInputElement>('.insp input')].find((i) => i.placeholder === 'Judul')!
    input.value = 'Promo spesial'
    input.dispatchEvent(new Event('change'))
    expect(builder.editor.components.headline).toEqual({ props: { value: 'Promo spesial' } })
    expect(host.querySelector('[data-sdui-row="headline"] .ovr')).not.toBeNull()
    // structure is locked: no component palette, no delete
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Delete')).toBe(false)
    host.querySelector<HTMLInputElement>('input[aria-label="Review note"]')!.value = 'cek ya'
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'Submit for review')!.click()
    await flush()
    expect(onSubmitForReview).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ screen: 'home', components: { headline: { props: { value: 'Promo spesial' } } } }) }), 'cek ya')
    builder.destroy()
    host.remove()
  })

  it('read-only + baseline: nothing editable, the changes vs. the active release are listed', async () => {
    const host = document.createElement('div')
    const editor = new ValuesEditor({ values: VALUES, template: TemplateDocument.decode(TEMPLATE) })
    const base = structuredClone(VALUES) as { values: { components: Record<string, { props?: Record<string, unknown> }> } }
    base.values.components.headline!.props!.value = 'Lama'
    const builder = mountScreenBuilder(host, { editor, templates: choices, readOnly: true, baseline: base, onSubmitForReview: vi.fn() })
    expect(host.querySelector<HTMLButtonElement>('.tpl')!.disabled).toBe(true)
    expect([...host.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Submit for review')!.hidden).toBe(true)
    expect(host.querySelector('.changes')!.textContent).toContain('props.value: "Lama" → "Cashback 20% untuk {{user.name}}"')
    builder.destroy()
  })
})
