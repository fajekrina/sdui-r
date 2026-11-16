// sdui-r — the **Screen Builder** (maker): the palette lists TEMPLATES; picking one loads
// its layout on the canvas, and the inspector edits the VALUES of the selected component.
// The template structure is locked (no insert / move / delete). The output is a value
// set for one merchant screen. Same canvas, preview, review and CSP rules as the Studio.
import { ActionSpec, ComponentFactory, TemplateDocument, type SduiNode, type SduiValue } from '../core'
import { renderNodeDOM } from '../vanilla'
import { COLORS, FIELDS, SHARED, attachStyles, foldSection, outlineTwisty, type FieldKind, type StudioCatalog } from './studio'
import { STUDIO_CSS } from './studio-css'
import { ancestorsOf, flatten, flattenVisible, outlineLabel } from './tree'
import { clippedContainers, findValueJsonRange, renderPreview } from './preview'
import { diff, type ScreenChange } from './diff'
import { ValuesEditor, type TemplateChoice } from './values-editor'

export interface ScreenBuilderOptions {
  editor?: ValuesEditor
  /// the merchant screen key the value set is for (with no `editor`)
  screen?: string
  /// the palette: template releases a maker may use
  templates?: readonly TemplateChoice[]
  /// fetch a template document for a choice without `document`
  loadTemplate?: (choice: TemplateChoice) => Promise<unknown>
  factory?: ComponentFactory
  stylesheet?: 'adopt' | 'external'
  sampleData?: Record<string, SduiValue>
  assetURL?: (name: string) => string
  title?: string
  /// names offered for image names (assets) and action targets
  catalog?: StudioCatalog
  /// view only (checker role)
  readOnly?: boolean
  /// the value set of the active release: the builder lists what the draft changes
  baseline?: unknown
  onSave?: (values: unknown) => void | Promise<void>
  onSubmitForReview?: (values: unknown, note: string) => void | Promise<void>
  onChange?: (values: unknown) => void
}

export type ScreenBuilderUpdate = Pick<ScreenBuilderOptions, 'templates' | 'title' | 'catalog' | 'readOnly' | 'baseline' | 'sampleData' | 'assetURL'>

export interface MountedScreenBuilder {
  readonly editor: ValuesEditor
  /// choose a template release programmatically (as a palette click does)
  choose(choice: TemplateChoice): Promise<void>
  update(options: ScreenBuilderUpdate): void
  destroy(): void
}

/// props that are layout, not content: shown read-only (the template decides them)
const LAYOUT = new Set(['spacing', 'alignment', 'columns', 'axis', 'padding', 'cornerRadius', 'width', 'height', 'maxHeight', 'rowHeight', 'contentMode', 'rows'])

export function mountScreenBuilder(target: HTMLElement, options: ScreenBuilderOptions = {}): MountedScreenBuilder {
  const editor = options.editor ?? new ValuesEditor({ screen: options.screen })
  const factory = options.factory ?? ComponentFactory.withBuiltins()
  const opts: ScreenBuilderOptions = { ...options }
  const d = target.ownerDocument
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Array<Node | string>) => {
    const e = d.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    e.append(...kids)
    return e
  }
  const button = (label: string, onClick: () => void, cls = 'btn') => {
    const b = el('button', { type: 'button', class: cls }, label)
    b.addEventListener('click', onClick)
    return b
  }
  const detachStyles = attachStyles(target, STUDIO_CSS, opts.stylesheet)
  const root = el('div', { class: 'sdui-studio sdui-screen-builder' })
  target.append(root)

  let width = 375
  let previewMode = false
  let jsonEditing = false
  let message = ''
  let status: { text: string; ok: boolean } | undefined
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  const uid = Math.random().toString(36).slice(2, 8)
  const assetsList = el('datalist', { id: `sdui-${uid}-assets` })
  const screensList = el('datalist', { id: `sdui-${uid}-screens` })
  const fillLists = () => {
    assetsList.replaceChildren(...(opts.catalog?.assets ?? []).map((v) => el('option', { value: v })))
    screensList.replaceChildren(...(opts.catalog?.screens ?? []).map((v) => el('option', { value: v })))
  }
  root.append(assetsList, screensList)
  fillLists()
  const showStatus = (text: string, ok: boolean) => {
    status = { text, ok }
    clearTimeout(statusTimer)
    if (ok) statusTimer = setTimeout(() => { status = undefined; paint() }, 2500)
  }
  const failure = (error: unknown) => (error instanceof Error ? error.message : String(error))

  // toolbar
  const titleEl = el('span', { class: 'ttl' })
  const screenEl = el('span', { class: 'tplref', 'aria-label': 'Screen key' })
  const templateEl = el('span', { class: 'tplref', 'aria-label': 'Template' })
  const undo = button('↶ Undo', () => editor.undo())
  const redo = button('↷ Redo', () => editor.redo())
  const widthSel = el('select', { 'aria-label': 'Preview width', class: 'btn' }, el('option', { value: '375' }, 'Compact 375'), el('option', { value: '768' }, 'Wide 768')) as HTMLSelectElement
  widthSel.addEventListener('change', () => { width = Number(widthSel.value); paint() })
  const previewBtn = button('Preview', () => { previewMode = !previewMode; paint() })
  const statusEl = el('span', { class: 'st', role: 'status' })
  const noteInput = el('input', { 'aria-label': 'Review note', placeholder: 'Note for the reviewer', class: 'note' }) as HTMLInputElement
  const save = async () => {
    try { await opts.onSave?.(JSON.parse(editor.exportJSON())); showStatus('Saved ✔', true) } catch (error) { showStatus(`Save failed: ${failure(error)}`, false) }
    paint()
  }
  const submit = async () => {
    try {
      await opts.onSubmitForReview?.(JSON.parse(editor.exportJSON()), noteInput.value.trim())
      noteInput.value = ''
      showStatus('Submitted for review ✔', true)
    } catch (error) {
      showStatus(`Submit failed: ${failure(error)}`, false)
    }
    paint()
  }
  const editing: HTMLElement[] = [undo, redo,
    ...(options.onSave ? [button('Save draft', () => void save())] : []),
    ...(options.onSubmitForReview ? [noteInput, button('Submit for review', () => void submit(), 'btn pri')] : [])]
  root.append(el('div', { class: 'tb' },
    el('strong', {}, 'Screen Builder'), titleEl, screenEl, templateEl, undo, redo, widthSel, previewBtn,
    el('span', { class: 'sp' }), statusEl, ...editing.slice(2)))

  // palette: templates
  const templatesEl = el('div', { class: 'tpls', role: 'listbox', 'aria-label': 'Templates' })
  const choose = async (choice: TemplateChoice) => {
    if (opts.readOnly) return
    const current = editor.template?.template
    if (current && current.key === choice.key && current.version === choice.version) return
    try {
      const raw = choice.document ?? await opts.loadTemplate?.(choice)
      if (raw === undefined) throw new Error(`no document for ${choice.key}@${choice.version}`)
      const dropped = editor.setTemplate(TemplateDocument.decode(raw))
      message = dropped.length ? `Values dropped (not in ${choice.key}@${choice.version}): ${dropped.join(', ')}` : ''
    } catch (error) {
      message = `Template: ${failure(error)}`
    }
    paint()
  }
  const outline = el('div', { role: 'tree' })
  /// outline components whose children are folded away (survives repaints)
  const folded = new Set<string>()
  let revealed: string | undefined
  // collapsible: once a template is chosen the list can fold away to give the outline room
  let templatesOpen = true
  const templatesBody = el('div', { id: `sdui-${uid}-templates` }, el('div', { class: 'tip' }, 'Pick the layout of this screen; then fill in its components.'), templatesEl)
  const templatesToggle = button('', () => { templatesOpen = !templatesOpen; paint() }, 'fold')
  templatesToggle.setAttribute('aria-controls', templatesBody.id)
  const paletteBox = el('div', {}, el('h3', { class: 'fold-h' }, templatesToggle), templatesBody)
  const device = el('div', { class: 'device' })
  device.addEventListener('click', (event) => {
    if (previewMode) return
    const hit = (event.target as Element).closest?.('[data-sdui-node]')
    if (hit) editor.select(hit.getAttribute('data-sdui-node') ?? undefined)
  })
  const inspector = el('div', { class: 'insp' })
  const main = el('div', { class: 'main' },
    el('div', { class: 'col' }, paletteBox, foldSection(d, `sdui-${uid}-outline`, 'Outline', outline)),
    el('div', { class: 'col canvas' }, device),
    el('div', { class: 'col' }, el('h3', {}, 'Values'), inspector))
  root.append(main)

  // JSON panel: the value set (2-way; collapsible; the selected component's values are
  // highlighted and scrolled to, as in the Template Builder), issues, changes vs. the active release
  const LINE = 18
  const PAD = 8
  let jsonOpen = true
  const jsonText = el('textarea', { spellcheck: 'false', wrap: 'off', 'aria-label': 'Values JSON' }) as HTMLTextAreaElement
  const band = el('div', { class: 'band' })
  const jsonBody = el('div', { class: 'body' }, band, jsonText)
  const badge = el('span', { class: 'badge' })
  const toggle = button('▾', () => { jsonOpen = !jsonOpen; paint() })
  toggle.setAttribute('aria-label', 'Show or hide the values JSON')
  const issues = el('div', { class: 'issues' })
  const changesEl = el('div', { class: 'changes', 'aria-label': 'Changes against the active release' })
  const jsonPanel = el('div', { class: 'json' }, el('div', { class: 'hd' }, toggle, el('span', {}, 'Values JSON (2-way)'), badge), jsonBody, issues, changesEl)
  root.append(jsonPanel)
  const placeBand = () => {
    const range = findValueJsonRange(jsonText.value, editor.selection)
    band.style.display = range ? 'block' : 'none'
    if (range) {
      band.style.top = `${PAD + range.startLine * LINE - jsonText.scrollTop}px`
      band.style.height = `${(range.endLine - range.startLine + 1) * LINE}px`
    }
    return range
  }
  jsonText.addEventListener('scroll', () => placeBand())
  let editTimer: ReturnType<typeof setTimeout> | undefined
  jsonText.addEventListener('input', () => {
    jsonEditing = true
    clearTimeout(editTimer)
    editTimer = setTimeout(() => {
      try { editor.importJSON(jsonText.value); message = '' } catch (error) { message = `JSON: ${failure(error)}` }
      jsonEditing = false
      paint()
    }, 500)
  })

  const field = (node: SduiNode, key: string, kind: FieldKind): HTMLElement => {
    const id = node.id!
    const def = editor.defaults(id)?.[key]
    const own = editor.isOverridden(id, key)
    const current = editor.value(id, key)
    const layout = LAYOUT.has(key)
    let control: HTMLElement
    if (kind === 'bool') {
      const input = el('input', { type: 'checkbox' }) as HTMLInputElement
      input.checked = current === true
      input.addEventListener('change', () => editor.setValue(id, key, input.checked === (def === true) ? undefined : input.checked))
      control = el('label', { class: 'chk' }, input, key)
    } else if (Array.isArray(kind) || key === 'background' || key === 'foreground' || key === 'color') {
      const values = Array.isArray(kind) ? kind : COLORS
      const select = el('select', {}, ...values.map((v) => el('option', { value: v }, v || '—'))) as HTMLSelectElement
      if (typeof current === 'string' && !values.includes(current)) select.append(el('option', { value: current }, current))
      select.value = typeof current === 'string' ? current : ''
      select.addEventListener('change', () => editor.setValue(id, key, select.value === (def ?? '') ? undefined : select.value || undefined))
      control = el('label', {}, key, select)
    } else if (kind === 'json') {
      const area = el('textarea', {}) as HTMLTextAreaElement
      area.value = current === undefined ? '' : JSON.stringify(current)
      area.addEventListener('change', () => { try { editor.setValue(id, key, area.value ? JSON.parse(area.value) as SduiValue : undefined) } catch { /* keep editing */ } })
      control = el('label', {}, key, area)
    } else {
      const attrs: Record<string, string> = { type: kind === 'number' ? 'number' : 'text' }
      if (node.type === 'image' && key === 'name') attrs.list = assetsList.id
      if (def !== undefined && def !== null) attrs.placeholder = String(def)
      const input = el('input', attrs) as HTMLInputElement
      input.value = own && current !== undefined && current !== null ? String(current) : ''
      input.addEventListener('change', () => editor.setValue(id, key, input.value === '' ? undefined : kind === 'number' ? Number(input.value) : input.value))
      control = el('label', {}, key, input)
    }
    if (layout) for (const c of control.querySelectorAll('input, select, textarea')) (c as HTMLInputElement).disabled = true
    const reset = button('↺', () => editor.setValue(id, key, undefined), 'btn')
    reset.title = 'Back to the template default'
    reset.hidden = !own
    return el('div', { class: own ? 'fld on' : 'fld' }, control, reset)
  }

  const inspectorFor = (node: SduiNode) => {
    const id = node.id!
    const known = new Map<string, FieldKind>([...(FIELDS[node.type] ?? []), ...SHARED])
    for (const key of Object.keys(editor.defaults(id) ?? {})) if (!known.has(key)) known.set(key, 'json')
    // content first, layout (locked) after
    const keys = [...known.keys()].sort((a, b) => Number(LAYOUT.has(a)) - Number(LAYOUT.has(b)))
    const own = editor.components[id]?.action
    const actionJSON = el('textarea', { 'aria-label': 'Action override JSON', placeholder: node.action ? JSON.stringify(node.action.toJSON()) : '— none —' }) as HTMLTextAreaElement
    actionJSON.value = own ? JSON.stringify(own.toJSON(), null, 1) : ''
    actionJSON.addEventListener('change', () => {
      try { editor.setAction(id, actionJSON.value.trim() ? ActionSpec.decode(JSON.parse(actionJSON.value)) : undefined); message = '' } catch (error) { message = `Action: ${failure(error)}`; paint() }
    })
    inspector.replaceChildren(
      el('fieldset', {}, el('legend', {}, `${node.type} #${id}`), ...keys.map((k) => field(node, k, known.get(k)!))),
      el('fieldset', {}, el('legend', {}, 'Action'),
        el('div', { class: 'tip' }, own ? 'Overrides the template action' : 'Template action (type JSON to override)'), actionJSON),
      el('div', { class: 'acts' }, button('Reset component', () => editor.reset(id)))
    )
  }

  const paint = () => {
    const template = editor.template?.template
    const readOnly = opts.readOnly === true
    titleEl.textContent = opts.title ?? ''
    titleEl.style.display = opts.title ? '' : 'none'
    screenEl.textContent = `screen ${editor.screen}`
    templateEl.textContent = template ? `${template.key}@${template.version}` : 'no template'
    undo.disabled = !editor.canUndo
    redo.disabled = !editor.canRedo
    previewBtn.textContent = previewMode ? 'Edit' : 'Preview'
    previewBtn.className = previewMode ? 'btn on' : 'btn'
    main.classList.toggle('pv', previewMode)
    jsonPanel.style.display = previewMode ? 'none' : ''
    root.classList.toggle('ro', readOnly)
    for (const control of editing) control.hidden = readOnly
    jsonText.readOnly = readOnly
    statusEl.textContent = status?.text ?? ''
    statusEl.className = `st${status ? (status.ok ? ' ok' : ' err') : ''}`

    templatesToggle.replaceChildren(el('span', { 'aria-hidden': 'true' }, templatesOpen ? '▾' : '▸'), 'Templates',
      ...(!templatesOpen && template ? [el('small', {}, `${template.key}@${template.version}`)] : []))
    templatesToggle.setAttribute('aria-expanded', String(templatesOpen))
    templatesToggle.title = templatesOpen ? 'Collapse the template list' : 'Expand the template list'
    templatesBody.hidden = !templatesOpen
    templatesEl.replaceChildren(...(opts.templates ?? []).map((choice) => {
      const on = template?.key === choice.key && template.version === choice.version
      const b = button('', () => void choose(choice), on ? 'tpl on' : 'tpl')
      b.append(el('span', {}, choice.title ?? choice.key), el('small', {}, `${choice.key}@${choice.version}`))
      b.title = `${choice.title ? `${choice.title} — ` : ''}${choice.key}@${choice.version}`
      b.setAttribute('role', 'option')
      b.setAttribute('aria-selected', String(on))
      b.disabled = readOnly
      return b
    }))
    if (!opts.templates?.length) templatesEl.replaceChildren(el('p', { class: 'empty' }, 'No templates'))

    const screen = editor.composed()
    // a NEW selection (e.g. a canvas click) inside a folded branch unfolds its parents;
    // folding the branch of the current selection afterwards stays folded
    if (screen && editor.selection && editor.selection !== revealed) for (const id of ancestorsOf(screen.root, editor.selection)) folded.delete(id)
    revealed = editor.selection
    outline.replaceChildren(...(screen ? flattenVisible(screen.root, folded) : []).map(([n, depth]) => {
      const own = editor.isOverridden(n.id!)
      const row = el('div', { class: n.id === editor.selection ? 'row sel' : 'row', role: 'treeitem', 'aria-level': String(depth + 1), 'data-sdui-row': n.id!, title: `${outlineLabel(n)} #${n.id}${own ? ' · has values' : ''}` },
        outlineTwisty(d, n, folded, paint),
        // the "has values" dot before the label, so a long label's ellipsis never hides it
        ...(own ? [el('span', { class: 'ovr', 'aria-label': 'has values' }, '● ')] : []), outlineLabel(n))
      if (n.children.length > 0) row.setAttribute('aria-expanded', String(!folded.has(n.id!)))
      row.style.paddingLeft = `${4 + depth * 14}px`
      row.addEventListener('click', () => editor.select(n.id))
      return row
    }))
    device.style.width = `${width}px`
    const preview = screen ? renderPreview(factory, width >= 600 && screen.variants.wide ? screen.variants.wide : (width < 600 && screen.variants.compact) || screen.root,
      { data: opts.sampleData, selected: previewMode ? undefined : editor.selection, assetURL: opts.assetURL }) : null
    device.replaceChildren(...(preview ? [renderNodeDOM(preview, undefined, undefined, d)] : [el('p', { class: 'empty' }, 'Choose a template')]))
    // a maker's longer text can outgrow a bounded container of the template: say so
    const clipped = screen && !previewMode ? clippedContainers(device, screen.root) : []

    const selected = editor.selection && screen ? flatten(screen.root).find(([n]) => n.id === editor.selection)?.[0] : undefined
    if (selected) inspectorFor(selected)
    else inspector.replaceChildren(el('p', { class: 'empty' }, screen ? 'Select a component' : 'Choose a template'))
    if (readOnly) for (const c of inspector.querySelectorAll('input, select, textarea, button')) (c as HTMLInputElement).disabled = true

    let values: unknown
    try { values = template ? editor.valuesDocument().toJSON() : undefined } catch { values = undefined }
    if (!jsonEditing) jsonText.value = values ? JSON.stringify(values, null, 2) : ''
    toggle.textContent = jsonOpen ? '▾' : '▸'
    toggle.setAttribute('aria-expanded', String(jsonOpen))
    jsonBody.style.display = jsonOpen ? 'block' : 'none'
    const range = jsonOpen ? placeBand() : null
    // a component without values has no entry yet: say so instead of highlighting nothing
    badge.textContent = selected
      ? `${selected.type} #${selected.id}${range ? ` · lines ${range.startLine + 1}–${range.endLine + 1}` : ' · template defaults'}`
      : ''
    badge.style.display = selected ? 'inline-block' : 'none'
    if (range) {
      const top = PAD + range.startLine * LINE
      if (top < jsonText.scrollTop || top > jsonText.scrollTop + jsonText.clientHeight - LINE) jsonText.scrollTop = Math.max(0, top - LINE * 2)
      placeBand()
    }
    const problems = template ? editor.issues().map((i) => i.message) : []
    issues.replaceChildren(...[message, ...problems].filter(Boolean).map((m) => el('div', {}, `⚠ ${m}`)),
      ...clipped.map((w) => el('div', { class: 'warn' }, `⚠ ${w}`)))
    paintChanges(opts.baseline === undefined || !editor.template ? undefined : changesAgainst(opts.baseline))
    if (values) opts.onChange?.(values)
  }

  /// the active release's values, composed with the chosen template, vs. the draft
  const changesAgainst = (baseline: unknown): ScreenChange[] => {
    const t = editor.template!
    const base = new ValuesEditor({ values: baseline })
    const ref = (baseline as { values?: { template?: { key?: string; version?: number } } }).values?.template
    const out: ScreenChange[] = []
    if (ref && (ref.key !== t.template.key || ref.version !== t.template.version)) {
      out.push({ kind: 'changed', path: 'screen', field: 'template', before: `${ref.key}@${ref.version}`, after: `${t.template.key}@${t.template.version}` })
    }
    base.setTemplate(t)
    return [...out, ...diff(base.composed()!.toJSON(), editor.composed()!.toJSON())]
  }

  const paintChanges = (changes: ScreenChange[] | undefined) => {
    changesEl.hidden = changes === undefined
    if (!changes) return
    const show = (v: unknown) => { const s = v === undefined ? '∅' : JSON.stringify(v); return s.length > 40 ? `${s.slice(0, 39)}…` : s }
    changesEl.replaceChildren(
      el('div', { class: 'hd' }, changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} vs. the active release` : 'No changes vs. the active release'),
      ...changes.map((c) => el('div', { class: c.kind }, `${c.kind} · ${c.type ?? 'screen'} ${c.path}${c.field ? ` · ${c.field}` : ''}${c.kind === 'changed' || c.kind === 'moved' ? `: ${show(c.before)} → ${show(c.after)}` : ''}`)))
  }

  const unsubscribe = editor.subscribe(paint)
  paint()

  return {
    editor,
    choose,
    update(next) {
      Object.assign(opts, next)
      fillLists()
      paint()
    },
    destroy() {
      unsubscribe()
      clearTimeout(editTimer)
      clearTimeout(statusTimer)
      root.remove()
      detachStyles()
    }
  }
}
