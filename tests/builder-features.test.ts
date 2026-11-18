// sdui-r builder features: fixed component ids, depth-first orders, template deprecation,
// "what it does" for makers, and image frames filled by upload / link / drop.
import { describe, expect, it, vi } from 'vitest'
import {
  EditorDocument, ValuesEditor, find, requestWarnings, actionWarnings, actionBadge, describeAction, describeComponent, mountScreenBuilder, mountTemplateBuilder, ordersOf
} from '../src/builder'
import { ActionSpec, ComponentFactory, SduiNode, TemplateDocument, compose } from '../src/core'
import { renderPreview } from '../src/builder'
import { flush } from './helpers'

const click = (host: Element, label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)!.click()

/// a template with a hero image frame, an icon image, a button and a form field
function template(): TemplateDocument {
  return TemplateDocument.decode({
    schemaVersion: '2.0',
    template: {
      key: 'promo', version: 1,
      root: { type: 'vstack', id: 'root', order: 0, children: [
        { type: 'image', id: 'hero', order: 1, props: { height: 120 } },
        { type: 'image', id: 'icon', order: 2, props: { systemName: 'star.fill' } },
        { type: 'button', id: 'buy', order: 3, props: { title: 'Beli', builderNote: 'Tombol beli tiket' },
          action: { type: 'navigate', screen: 'checkout', presentation: 'sheet' } },
        { type: 'textField', id: 'email', order: 4, props: { name: 'email', label: 'Email', required: true, pattern: 'email' } }
      ] }
    }
  })
}

describe('Template Builder: ids and orders', () => {
  it('orders number every component depth-first and follow a move', () => {
    const doc = new EditorDocument({ mode: 'template' })
    const card = doc.add('card')
    const title = doc.add('text')            // inside the card
    doc.select(undefined)
    const cta = doc.add('button')            // after the card
    let t = doc.templateDocument().template
    expect([...ordersOf(doc.root)]).toEqual([['root', 0], [card, 1], [title, 2], [cta, 3]])
    expect(t.root.children.map((c) => c.order)).toEqual([1, 3])
    // move the button into the card, before the text: the numbers follow
    expect(doc.reparent(cta, card, 0)).toBe(true)
    t = doc.templateDocument().template
    expect(t.root.children[0]!.children.map((c) => [c.id, c.order])).toEqual([[cta, 2], [title, 3]])
    // still a valid template; compose renders in that order
    expect(doc.issues()).toEqual([])
    expect(compose(t).root.children[0]!.children.map((c) => c.id)).toEqual([cta, title])
  })

  it('the component id is shown read-only with its order; the note for makers is a prop', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    studio.document.add('text')
    studio.document.select(undefined)
    const id = studio.document.add('button')
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Component id"]')!
    expect(input.value).toBe(id)
    expect(input.readOnly).toBe(true)
    expect(host.querySelector('.insp')!.textContent).toContain('order 2')
    const note = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note for makers"]')!
    note.value = 'Goes to checkout'
    note.dispatchEvent(new Event('change'))
    expect(studio.document.selected!.props.builderNote).toBe('Goes to checkout')
    studio.destroy()
    host.remove()
  })

  it('the note never reaches a client: compose drops it', () => {
    const screen = compose(template().template)
    expect(screen.root.children.find((c) => c.id === 'buy')!.props.builderNote).toBeUndefined()
    expect(template().template.root.children.find((c) => c.id === 'buy')!.props.builderNote).toBe('Tombol beli tiket')
  })
})

describe('Template deprecation', () => {
  it('Deprecate… asks for a reason and a replacement; a deprecated template shows a banner and Restore', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const onDeprecate = vi.fn()
    const onRestore = vi.fn()
    const doc = new EditorDocument({ mode: 'template', key: 'oldHome' })
    const studio = mountTemplateBuilder(host, { document: doc, catalog: { screens: ['oldHome', 'home', 'gone'], deprecated: ['gone'] }, onDeprecate, onRestore })
    const bar = host.querySelector<HTMLElement>('.dep')!
    expect(bar.hidden).toBe(true)
    click(host, 'Deprecate…')
    expect(bar.hidden).toBe(false)
    const replace = host.querySelector<HTMLSelectElement>('select[aria-label="Replaced by"]')!
    // neither itself nor a deprecated template is offered as the replacement
    expect([...replace.options].map((o) => o.value)).toEqual(['', 'home'])
    click(host, 'Deprecate')
    expect(onDeprecate).not.toHaveBeenCalled()          // a reason is required
    host.querySelector<HTMLInputElement>('input[aria-label="Deprecation reason"]')!.value = 'Diganti layout baru'
    replace.value = 'home'
    click(host, 'Deprecate')
    await flush()
    expect(onDeprecate).toHaveBeenCalledWith({ reason: 'Diganti layout baru', replacedBy: 'home' })
    studio.update({ deprecation: { reason: 'Diganti layout baru', replacedBy: 'home', by: 'admin' } })
    expect(bar.textContent).toContain('Template oldHome is deprecated: Diganti layout baru. Use home instead.')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Deprecate…' && !b.hidden)).toBe(false)
    click(host, 'Restore')
    await flush()
    expect(onRestore).toHaveBeenCalled()
    studio.destroy()
    host.remove()
  })

  it('the navigate page picker marks deprecated templates', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: { screens: ['home', 'gone'], deprecated: ['gone'] } })
    const id = studio.document.add('button')
    studio.document.setAction(id, ActionSpec.decode({ type: 'navigate', screen: 'home' }))
    const picker = host.querySelector<HTMLSelectElement>('select[aria-label="screen"]')!
    expect([...picker.options].map((o) => o.textContent)).toContain('gone (deprecated)')
    studio.destroy()
    host.remove()
  })

  it('Screen Builder: a deprecated template is badged in the palette and bannered when chosen', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = new ValuesEditor({ screen: 'promo', template: template() })
    const builder = mountScreenBuilder(host, { editor, templates: [{ key: 'promo', version: 1, deprecated: { reason: 'old', replacedBy: 'promo2' } }] })
    expect(host.querySelector('.tpl .depb')!.textContent).toBe('deprecated')
    const bar = host.querySelector<HTMLElement>('.dep')!
    expect(bar.hidden).toBe(false)
    expect(bar.textContent).toContain('Use promo2 instead')
    builder.update({ templates: [{ key: 'promo', version: 1 }] })
    expect(bar.hidden).toBe(true)
    builder.destroy()
    host.remove()
  })
})

describe('What a component does (makers)', () => {
  it('describes actions, chains, fields and images', () => {
    expect(describeAction(ActionSpec.decode({ type: 'api', request: 'submitCheckout', onSuccess: { type: 'navigate', screen: 'done' }, onError: { type: 'toast', message: 'Gagal' } })))
      .toBe('Sends request "submitCheckout"; on success: opens page "done"; on error: shows the message "Gagal"')
    expect(actionBadge(ActionSpec.decode({ type: 'navigate', screen: 'checkout' }))).toBe('→ checkout')
    expect(actionBadge(undefined)).toBeUndefined()
    const t = template().template.root
    const byId = (id: string) => t.children.find((c) => c.id === id)!
    expect(describeComponent(byId('buy'))).toEqual(['Tombol beli tiket', 'Opens page "checkout" as a sheet'])
    expect(describeComponent(byId('email'))).toEqual(['Text input "email" sent with the form (required, email)'])
    expect(describeComponent(byId('hero'))[0]).toContain('Image frame')
    expect(describeComponent(byId('icon'))[0]).toContain('Icon (star.fill)')
  })

  it('the Screen Builder inspector, outline and canvas say what the button does', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = new ValuesEditor({ screen: 'promo', template: template() })
    const builder = mountScreenBuilder(host, { editor, templates: [{ key: 'promo', version: 1 }] })
    editor.select('buy')
    expect(host.querySelector('.fn')!.textContent).toContain('Opens page "checkout" as a sheet')
    expect(host.querySelector('.fn')!.textContent).toContain('Tombol beli tiket')
    expect(host.querySelector('[data-sdui-row="buy"] .fnb')!.textContent).toBe('→ checkout')
    expect(host.querySelector('.device [data-sdui-node="buy"]')!.getAttribute('data-fn')).toBe('→ checkout')
    builder.destroy()
    host.remove()
  })
})

describe('Image frames', () => {
  const factory = ComponentFactory.withBuiltins()
  const render = (props: Record<string, string | number>, assetURL = (n: string) => n === 'known' ? 'https://cdn.example/known.png' : '') =>
    renderPreview(factory, new SduiNode({ id: 'img', type: 'image', props }), { assetURL })!

  it('no picture → an empty frame; a picture wins over the icon; an unknown name → a marked frame', () => {
    expect(render({})).toMatchObject({ element: 'span', attrs: { role: 'img', 'data-sdui-frame': 'empty' } })
    expect(render({ systemName: 'star.fill', name: 'known' })).toMatchObject({ element: 'img', attrs: { src: 'https://cdn.example/known.png' } })
    expect(render({ systemName: 'star.fill' }).element).toBe('span')
    expect(render({ systemName: 'star.fill' }).attrs['data-sdui-frame']).toBeUndefined()
    expect(render({ name: 'nope' }).attrs['data-sdui-frame']).toBe('missing')
    // a new image from the palette is a frame
    expect(factory.info('image')!.defaultProps).toEqual({ height: 160 })
  })

  it('the Template Builder labels an empty frame for the maker', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    const id = studio.document.add('image')
    expect(host.querySelector(`.device [data-sdui-node="${id}"]`)!.getAttribute('data-frame-label')).toContain('the maker uploads the picture')
    studio.destroy()
    host.remove()
  })

  it('a maker uploads a file, copies a link, or drops a file on the frame; the value is the asset name', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const editor = new ValuesEditor({ screen: 'promo', template: template() })
    const uploadAsset = vi.fn(async (source: { file: Blob } | { url: string }) => 'file' in source ? 'img_file' : 'img_link')
    const builder = mountScreenBuilder(host, { editor, templates: [{ key: 'promo', version: 1 }], uploadAsset, assetURL: (n) => `/assets/${n}` })
    editor.select('hero')
    expect(host.querySelector('.device [data-sdui-node="hero"]')!.getAttribute('data-frame-label')).toContain('Drop a picture here')
    // pick a file
    const picker = host.querySelector<HTMLInputElement>('input[type=file]')!
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })
    Object.defineProperty(picker, 'files', { value: [png] })
    picker.dispatchEvent(new Event('change'))
    await flush()
    expect(uploadAsset).toHaveBeenLastCalledWith({ file: png })
    expect(editor.value('hero', 'name')).toBe('img_file')
    expect(host.querySelector<HTMLImageElement>('.drop img')!.getAttribute('src')).toBe('/assets/img_file')
    // a link
    const link = host.querySelector<HTMLInputElement>('input[aria-label="Picture link"]')!
    link.value = 'http://insecure.example/x.png'
    click(host, 'Use link')
    await flush()
    expect(host.querySelector('.st')!.textContent).toContain('https://')
    host.querySelector<HTMLInputElement>('input[aria-label="Picture link"]')!.value = 'https://example.com/x.png'
    click(host, 'Use link')
    await flush()
    expect(uploadAsset).toHaveBeenLastCalledWith({ url: 'https://example.com/x.png' })
    expect(editor.value('hero', 'name')).toBe('img_link')
    // not a picture → refused before upload
    const calls = uploadAsset.mock.calls.length
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })
    const zone = host.querySelector<HTMLElement>('.drop')!
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }
    drop.dataTransfer = { files: [svg], types: ['Files'] }
    zone.dispatchEvent(drop)
    await flush()
    expect(uploadAsset.mock.calls.length).toBe(calls)
    expect(host.querySelector('.st')!.textContent).toContain('not a picture')
    // drop a file on the canvas frame of the icon image: the picture replaces the icon
    const icon = host.querySelector('.device [data-sdui-node="icon"]')!
    const canvasDrop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }
    canvasDrop.dataTransfer = { files: [png], types: ['Files'] }
    icon.dispatchEvent(canvasDrop)
    await flush()
    expect(editor.selection).toBe('icon')
    expect(editor.value('icon', 'name')).toBe('img_file')
    expect(host.querySelector('.device [data-sdui-node="icon"]')!.tagName).toBe('IMG')
    // remove
    click(host, 'Remove picture')
    expect(editor.isOverridden('icon', 'name')).toBe(false)
    builder.destroy()
    host.remove()
  })
})

describe('Requests and chart data sources', () => {
  const options = (host: Element, field: string) => [...host.querySelector<HTMLSelectElement>(`select[aria-label="${field}"]`)!.options].map((o) => o.textContent)
  const typeSelect = (host: Element) => [...host.querySelectorAll('label')].find((l) => l.firstChild?.textContent === 'type')!.querySelector('select')!

  it('a button picks from requests, a chart from sources; each marks the other kind as foreign', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: { requests: ['submitCheckout'], sources: ['salesSummary', 'refundSummary'] } })
    const button = studio.document.add('button')
    studio.document.select(button)
    const type = typeSelect(host)
    type.value = 'api'
    type.dispatchEvent(new Event('change'))
    expect(find(studio.document.root, button)!.action!.toJSON()).toMatchObject({ type: 'api', request: 'submitCheckout' })
    expect(options(host, 'request')).toEqual(['— choose a request —', 'submitCheckout'])

    // a chart: only a data source (opsi A) — no action type to choose
    const chart = studio.document.add('chart')
    studio.document.select(chart)
    expect(options(host, 'data source')).toEqual(['— static data (no source) —', 'salesSummary', 'refundSummary'])
    const source = host.querySelector<HTMLSelectElement>('select[aria-label="data source"]')!
    source.value = 'salesSummary'
    source.dispatchEvent(new Event('change'))
    expect(find(studio.document.root, chart)!.action!.toJSON()).toEqual({ type: 'api', request: 'salesSummary' })

    // a template made before the split: the wrong kind is shown for what it is, never dropped
    studio.document.setAction(chart, ActionSpec.decode({ type: 'api', request: 'submitCheckout' }))
    studio.document.select(chart)
    expect(options(host, 'data source')).toContain('submitCheckout (not a data source)')
    studio.document.setAction(button, ActionSpec.decode({ type: 'api', request: 'salesSummary' }))
    studio.document.select(button)
    expect(options(host, 'request')).toContain('salesSummary (unknown request)')
    studio.destroy()
    host.remove()
  })

  it('an app that does not split the lists: charts pick from requests, as before', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: { requests: ['salesSummary'] } })
    const chart = studio.document.add('chart')
    studio.document.setAction(chart, ActionSpec.decode({ type: 'api', request: 'salesSummary' }))
    studio.document.select(chart)
    expect(options(host, 'data source')).toEqual(['— static data (no source) —', 'salesSummary'])
    studio.destroy()
    host.remove()
  })
})

describe('Request warnings', () => {
  const lists = { requests: ['submitCheckout'], sources: ['salesSummary'] }
  const tree = (button: unknown, chart: unknown) => SduiNode.decode({ type: 'vstack', id: 'root', children: [
    { type: 'button', id: 'buy', action: button }, { type: 'chart', id: 'sales', action: chart }
  ] })

  it('warns when a button sends a data source or a chart reads a request (chains included)', () => {
    expect(requestWarnings(tree({ type: 'api', request: 'submitCheckout' }, { type: 'api', request: 'salesSummary' }), lists)).toEqual([])
    expect(requestWarnings(tree(
      { type: 'api', request: 'salesSummary', onSuccess: { type: 'api', request: 'nope' } },
      { type: 'api', request: 'submitCheckout', onError: { type: 'api', request: 'salesSummary' } }
    ), lists)).toEqual([
      'button #buy sends "salesSummary", a chart data source, not a request',
      'button #buy sends "nope", which is not a known request',
      'chart #sales reads "submitCheckout", a request a button sends, not a data source',
      'chart #sales sends "salesSummary", a chart data source, not a request'
    ])
  })

  it('says nothing when the app does not split the lists', () => {
    expect(requestWarnings(tree({ type: 'api', request: 'salesSummary' }, { type: 'api', request: 'submitCheckout' }), { requests: ['salesSummary'] })).toEqual([])
  })

  it('the Template Builder shows them as warnings', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: lists })
    const b = studio.document.add('button')
    studio.document.setAction(b, ActionSpec.decode({ type: 'api', request: 'salesSummary' }))
    const warnings = [...host.querySelectorAll('.issues .warn')].map((w) => w.textContent)
    expect(warnings.some((w) => w?.includes('a chart data source, not a request'))).toBe(true)
    studio.destroy()
    host.remove()
  })
})

describe('Action editor: only what each type uses', () => {
  // the onSuccess / onError steps of the action editor (not the inspector groups)
  const summaries = (host: Element) => [...host.querySelectorAll('.insp .act details > summary')].map((s) => s.textContent)
  const hasParams = (host: Element) => host.querySelector('.insp textarea[aria-label="params"]') !== null

  it('openURL picks a link, has no params and no follow-up steps; dismiss / refresh only explain', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: { links: ['terms', 'privacyPolicy'] } })
    const b = studio.document.add('button')
    studio.document.setAction(b, ActionSpec.decode({ type: 'openURL', link: 'terms' }))
    studio.document.select(b)
    const link = host.querySelector<HTMLSelectElement>('select[aria-label="link"]')!
    expect([...link.options].map((o) => o.textContent)).toEqual(['— choose a link —', 'terms', 'privacyPolicy'])
    expect(hasParams(host)).toBe(false)
    expect(summaries(host)).toEqual([])
    expect(host.querySelector('.insp')!.textContent).toContain('Opens the link in a new tab')
    for (const type of ['dismiss', 'refresh'] as const) {
      studio.document.setAction(b, ActionSpec.decode({ type }))
      studio.document.select(b)
      expect(hasParams(host)).toBe(false)
      expect(summaries(host)).toEqual([])
    }
    expect(host.querySelector('.insp')!.textContent).toContain('Reloads this page')
    // navigate keeps params and onSuccess (it cannot fail: no onError); api keeps both
    studio.document.setAction(b, ActionSpec.decode({ type: 'navigate', screen: 'home' }))
    studio.document.select(b)
    expect(hasParams(host)).toBe(true)
    expect(summaries(host)).toEqual(['onSuccess'])
    studio.destroy()
    host.remove()
  })

  it('a field the type ignores stays visible (to be removed) and is warned about', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host, { catalog: { links: ['terms'] } })
    const b = studio.document.add('button')
    studio.document.setAction(b, ActionSpec.decode({ type: 'openURL', link: 'faq', params: { a: 1 }, onSuccess: { type: 'dismiss' } }))
    studio.document.select(b)
    expect(host.querySelector('.insp')!.textContent).toContain('params (ignored by openURL: clear it)')
    expect(summaries(host)).toEqual(['onSuccess (never runs after openURL: remove it)'])
    const warnings = [...host.querySelectorAll('.issues .warn')].map((w) => w.textContent)
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('opens "faq", which is not a known link'),
      expect.stringContaining('openURL ignores params'),
      expect.stringContaining('onSuccess never runs after openURL')
    ]))
    studio.destroy()
    host.remove()
  })

  it('describeAction tells only the steps that run', () => {
    expect(describeAction(ActionSpec.decode({ type: 'openURL', link: 'terms', onSuccess: { type: 'dismiss' } }))).toBe('Opens link "terms"')
    expect(describeAction(ActionSpec.decode({ type: 'api', request: 'x', onError: { type: 'dismiss' } }))).toBe('Sends request "x"; on error: closes this page')
  })

  it('actionWarnings: nothing for a clean tree', () => {
    const root = SduiNode.decode({ type: 'vstack', id: 'root', children: [
      { type: 'button', id: 'b', action: { type: 'api', request: 'submitCheckout', onSuccess: { type: 'toast', message: 'ok', onSuccess: { type: 'navigate', screen: 'done' } }, onError: { type: 'toast', message: 'no' } } },
      { type: 'button', id: 'l', action: { type: 'openURL', link: 'terms' } }
    ] })
    expect(actionWarnings(root, { requests: ['submitCheckout'], sources: [], links: ['terms'] })).toEqual([])
  })
})
