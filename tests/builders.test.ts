// sdui-r: two builders — the Template Builder (admin: components → template) and the
// Screen Builder (maker: templates → value set).
import { describe, expect, it, vi } from 'vitest'
import { EditorDocument, ValuesEditor, clippedContainers, mountScreenBuilder, mountTemplateBuilder } from '../src/builder'
import { ActionSpec, SduiNode, TemplateDocument } from '../src/core'
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

  it('the template list collapses and expands; collapsed, the header names the chosen template', () => {
    const host = document.createElement('div')
    const editor = new ValuesEditor({ values: VALUES, template: TemplateDocument.decode(TEMPLATE) })
    const builder = mountScreenBuilder(host, { editor, templates: choices })
    const toggle = host.querySelector<HTMLButtonElement>('button.fold')!
    const body = host.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`)!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(body.hidden).toBe(false)
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(body.hidden).toBe(true)
    expect(toggle.textContent).toBe('▸TemplatespromoCard@1')
    editor.setValue('headline', 'value', 'x')   // repaints keep it collapsed
    expect(body.hidden).toBe(true)
    host.querySelector<HTMLButtonElement>('button.fold')!.click()
    expect(body.hidden).toBe(false)
    builder.destroy()
  })

  it('the outline collapses in both builders and stays collapsed across repaints; rows carry their full text', () => {
    const fold = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button.fold')].find((b) => b.textContent!.endsWith('Outline'))!
    const tb = document.createElement('div')
    const doc = new EditorDocument({ mode: 'template' })
    const studio = mountTemplateBuilder(tb, { document: doc })
    const t = fold(tb)
    const outline = tb.querySelector<HTMLElement>(`#${t.getAttribute('aria-controls')}`)!
    t.click()
    expect([t.getAttribute('aria-expanded'), outline.hidden]).toEqual(['false', true])
    doc.add('text')                                   // a repaint
    expect(outline.hidden).toBe(true)
    t.click()
    expect(outline.querySelector('[data-sdui-row="text1"]')!.getAttribute('title')).toBe('text: Text #text1')
    studio.destroy()

    const sb = document.createElement('div')
    const editor = new ValuesEditor({ values: VALUES, template: TemplateDocument.decode(TEMPLATE) })
    const builder = mountScreenBuilder(sb, { editor, templates: choices })
    const s = fold(sb)
    s.click()
    editor.setValue('headline', 'value', 'x')
    expect(sb.querySelector<HTMLElement>(`#${s.getAttribute('aria-controls')}`)!.hidden).toBe(true)
    s.click()
    const row = sb.querySelector('[data-sdui-row="headline"]')!
    expect(row.getAttribute('title')).toBe('text: x #headline · has values')
    expect([...row.children].map((c) => c.className)).toEqual(['tw leaf', 'ovr'])   // toggle slot, then the marker, then the label
    builder.destroy()
  })

  it('outline levels: a parent folds / unfolds its subtree; a selection inside a folded branch opens it', () => {
    const host = document.createElement('div')
    const doc = new EditorDocument({ mode: 'template' })
    const studio = mountTemplateBuilder(host, { document: doc })
    const stack = doc.add('vstack')
    doc.add('text')                                     // inside the selected vstack
    doc.select(undefined)
    const ids = () => [...host.querySelectorAll('[data-sdui-row]')].map((r) => r.getAttribute('data-sdui-row'))
    expect(ids()).toEqual(['root', stack, 'text1'])
    const row = () => host.querySelector(`[data-sdui-row="${stack}"]`)!
    expect(row().getAttribute('aria-level')).toBe('2')
    expect(row().getAttribute('aria-expanded')).toBe('true')
    row().querySelector<HTMLElement>('.tw')!.click()      // fold: the row is not selected
    expect(ids()).toEqual(['root', stack])
    expect(row().getAttribute('aria-expanded')).toBe('false')
    expect(row().querySelector('.tw')!.textContent).toBe('▸')
    expect(doc.selection).toBeUndefined()
    doc.add('image', { parentId: 'root' })               // repaints keep the fold
    expect(ids()).toEqual(['root', stack, 'image1'])
    doc.select('text1')                                 // e.g. a canvas click
    expect(ids()).toEqual(['root', stack, 'text1', 'image1'])
    host.querySelector<HTMLElement>('[data-sdui-row="root"] .tw')!.click()
    expect(ids()).toEqual(['root'])
    studio.destroy()

    const sb = document.createElement('div')
    const builder = mountScreenBuilder(sb, { editor: new ValuesEditor({ values: VALUES, template: TemplateDocument.decode(TEMPLATE) }), templates: choices })
    expect(sb.querySelectorAll('[data-sdui-row]')).toHaveLength(4)
    sb.querySelector<HTMLElement>('[data-sdui-row="root"] .tw')!.click()
    expect(sb.querySelectorAll('[data-sdui-row]')).toHaveLength(1)
    builder.destroy()
  })

  it('clippedContainers: a bounded container (or a rowHeight cell) whose content overflows is reported', () => {
    const canvas = document.createElement('div')
    canvas.innerHTML = '<div data-sdui-node="box"><span></span></div><div data-sdui-node="ok"></div><div data-sdui-node="g"><div></div><div></div></div><div data-sdui-node="free"></div>'
    const size = (el: Element, scroll: number, client: number) => {
      Object.defineProperty(el, 'scrollHeight', { value: scroll })
      Object.defineProperty(el, 'clientHeight', { value: client })
    }
    const [box, ok, g, free] = [...canvas.children]
    size(box!, 400, 240); size(ok!, 200, 240); size(g!, 120, 120); size(free!, 900, 100)
    size(g!.children[0]!, 300, 120); size(g!.children[1]!, 100, 120)
    const root = new SduiNode({ id: 'root', type: 'vstack', children: [
      new SduiNode({ id: 'box', type: 'card', props: { maxHeight: 240 } }),
      new SduiNode({ id: 'ok', type: 'vstack', props: { height: 240 } }),
      new SduiNode({ id: 'g', type: 'grid', props: { rowHeight: 120 } }),
      new SduiNode({ id: 'free', type: 'vstack' })
    ] })
    expect(clippedContainers(canvas, root)).toEqual([
      'card #box: content is taller than its maxHeight (240px) and is clipped — put a scroll inside',
      'grid #g: 1 cell is taller than rowHeight (120px) and clipped — put a scroll in the cell'
    ])
  })

  it('values JSON: collapsible; the selected component is highlighted with its line range', () => {
    const host = document.createElement('div')
    const editor = new ValuesEditor({ values: VALUES, template: TemplateDocument.decode(TEMPLATE) })
    const builder = mountScreenBuilder(host, { editor, templates: choices })
    const text = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Values JSON"]')!
    const band = host.querySelector<HTMLElement>('.json .band')!
    const badge = host.querySelector<HTMLElement>('.json .badge')!
    editor.select('cta')
    const lines = text.value.split('\n')
    const start = lines.findIndex((l) => l.trim() === '"cta": {')
    const indent = lines[start]!.indexOf('"')
    const end = lines.findIndex((l, i) => i > start && l.indexOf('}') === indent)
    expect(band.style.display).toBe('block')
    expect(badge.textContent).toBe(`button #cta · lines ${start + 1}–${end + 1}`)
    editor.select('root')                       // no values yet: nothing to highlight
    expect(band.style.display).toBe('none')
    expect(badge.textContent).toBe('vstack #root · template defaults')
    const toggle = host.querySelector<HTMLButtonElement>('.json .hd button')!
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector<HTMLElement>('.json .body')!.style.display).toBe('none')
    toggle.click()
    expect(host.querySelector<HTMLElement>('.json .body')!.style.display).toBe('block')
    builder.destroy()
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
