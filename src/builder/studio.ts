// The builder UI (Studio) — written once against the DOM and wrapped by React
// and Vue (builder/react, builder/vue), so both builders behave identically.
// The canvas uses the client's own components (`renderPreview`): preview == client.

import { ActionSpec, ActionType, BUILDER_NOTE_PROP, ComponentFactory, FIELD_PATTERNS, SduiNode, SPEC_VERSION, TemplateSpec, compose, type ActionUse, type SduiProps, type SduiValue } from '../core'
import { renderNodeDOM } from '../vanilla'
import { EditorDocument } from './document'
import { ancestorsOf, find, flatten, flattenVisible, isGeneratedId, ordersOf, outlineLabel } from './tree'
import { ACTION_USES, actionUseOf, actionWarnings, describeComponent } from './describe'
import { colorField, multilineText, optionsTable } from './controls'
import { clippedContainers, findNodeJsonRange, renderPreview } from './preview'
import { STUDIO_CSS } from './studio-css'
import { diff, type ScreenChange } from './diff'

export interface StudioOptions {
  document?: EditorDocument
  factory?: ComponentFactory
  /// `adopt` (default): a constructable stylesheet — no inline `<style>`, so a strict CSP
  /// (`style-src 'self'`) holds. `external`: the app links `@fajekrina/sdui-r/builder/studio.css`.
  stylesheet?: 'adopt' | 'external'
  /// sample data for `{{tokens}}` in the preview
  sampleData?: Record<string, SduiValue>
  assetURL?: (name: string) => string
  /// Names offered by the action editor — the app's allow-lists (screen keys,
  /// named requests, named links, host commands). Names only, never URLs; any
  /// other name can still be typed.
  screens?: readonly string[]
  /// the requests an `api` action sends (a button's submit …) — not the chart data sources
  requests?: readonly string[]
  /// the data sources a chart reads (its `api` action; `{ items: [{ key, label, value }] }`
  /// summaries). Absent = charts pick from `requests` (the lists are not split)
  sources?: readonly string[]
  links?: readonly string[]
  commands?: readonly string[]
  /// label shown in the toolbar, e.g. "merchant / home"
  title?: string
  /// the app's catalog of names: offered by the action editor (screens, requests, links,
  /// commands) and the image `name` field (assets). An explicit `screens` / … option wins.
  catalog?: StudioCatalog
  /// the payload of the active release: the Studio lists what the draft changes against it
  baseline?: unknown
  /// persist the validated payload (JSON object)
  onSave?: (payload: unknown) => void | Promise<void>
  /// publish it now (no review step): it goes live at once
  onPublish?: (payload: unknown) => void | Promise<void>
  onChange?: (payload: unknown) => void
  /// template mode: this template's deprecation (catalog state kept by the backend, not part of
  /// the template document); `null` / absent = in use. Shown as a banner.
  deprecation?: TemplateDeprecation | null
  /// template mode: deprecate the template (no new pages from it; existing pages keep working)
  onDeprecate?: (info: { reason: string; replacedBy?: string }) => void | Promise<void>
  /// template mode: take the deprecation back
  onRestore?: () => void | Promise<void>
}

/// A deprecated template: why, what to use instead, who and when.
export interface TemplateDeprecation {
  reason?: string
  /// the template key makers should use instead
  replacedBy?: string
  by?: string
  at?: string
}

/// Options that may change after mounting (async lists, a new title, …).
export type StudioUpdate = Pick<StudioOptions, 'title' | 'screens' | 'requests' | 'sources' | 'links' | 'commands' | 'catalog' | 'baseline' | 'sampleData' | 'assetURL' | 'deprecation'>

export interface StudioCatalog {
  screens?: readonly string[]
  /// what an `api` action sends (buttons and other components)
  requests?: readonly string[]
  /// what a chart reads (a chart's `api` action); absent = charts use `requests`
  sources?: readonly string[]
  links?: readonly string[]
  commands?: readonly string[]
  /// image names the app's `assetURL` maps
  assets?: readonly string[]
  /// deprecated template keys: marked in the page picker of `navigate` (and the Screen Builder)
  deprecated?: readonly string[]
}

/// The deprecation banner text: what it means for makers and pages.
export function deprecationText(key: string, dep: TemplateDeprecation): string {
  return `Template ${key} is deprecated${dep.reason ? `: ${dep.reason}` : ''}.` +
    `${dep.replacedBy ? ` Use ${dep.replacedBy} instead.` : ''} No new pages can be made from it; existing pages keep working.` +
    `${dep.by ? ` (${dep.by}${dep.at ? `, ${dep.at.slice(0, 10)}` : ''})` : ''}`
}

export interface MountedStudio {
  readonly document: EditorDocument
  /// apply changed options (e.g. a screen list loaded after mounting) and repaint
  update(options: StudioUpdate): void
  destroy(): void
}

/// how a prop is edited: `textarea` a multi-line text (a text's value: Enter = new line, with
/// bold / italic buttons), `color` a theme token or hex, `options` a picker's option table,
/// `items` a list's data (a `screen.load` request or a key path)
export type FieldKind = 'text' | 'textarea' | 'number' | 'bool' | 'json' | 'color' | 'options' | 'items' | string[]
/// checkboxes whose prop defaults to true: unchecked writes `false`, checked removes the prop
export const DEFAULT_TRUE = new Set(['showLabels', 'showLegend'])
type Drag = { kind: 'type'; type: string } | { kind: 'node'; id: string }
type Zone = 'inside' | 'before' | 'after'
type RawAction = Record<string, unknown>

export const COLORS = ['', 'primary', 'onPrimary', 'secondary', 'surface', 'onSurface', 'background', 'muted', 'border', 'success', 'warning', 'danger']
export const SHARED: Array<[string, FieldKind]> = [['padding', 'number'], ['background', 'color'], ['cornerRadius', 'number'], ['foreground', 'color'], ['a11yLabel', 'text'], ['a11yId', 'text']]
export const FIELDS: Record<string, Array<[string, FieldKind]>> = {
  // spec 2.1: align, markup (**bold** / *italic* in the value); a text always shows in full
  text: [['value', 'textarea'], ['markup', 'bool'], ['style', ['', 'title', 'headline', 'body', 'caption']], ['weight', ['', 'regular', 'medium', 'semibold', 'bold', 'heavy']],
    ['size', 'number'], ['color', 'color'], ['align', ['', 'leading', 'center', 'trailing']]],
  image: [['systemName', 'text'], ['name', 'text'], ['contentMode', ['', 'fit', 'fill']], ['width', 'number'], ['height', 'number']],
  // height / maxHeight: the container decides the size; a `scroll` inside fills it and scrolls
  vstack: [['spacing', 'number'], ['alignment', ['', 'leading', 'center', 'trailing']], ['height', 'number'], ['maxHeight', 'number']],
  card: [['height', 'number'], ['maxHeight', 'number']],
  hstack: [['spacing', 'number'], ['alignment', ['', 'top', 'center', 'bottom']]],
  zstack: [['width', 'number'], ['height', 'number']],
  button: [['title', 'text'], ['variant', ['', 'primary', 'secondary', 'plain']]],
  spacer: [['height', 'number'], ['width', 'number']],
  grid: [['columns', 'number'], ['spacing', 'number'], ['rowHeight', 'number'], ['height', 'number'], ['maxHeight', 'number']],
  scroll: [['axis', ['', 'vertical', 'horizontal']], ['spacing', 'number']],
  list: [['items', 'items'], ['as', 'text'], ['spacing', 'number']],
  form: [['spacing', 'number']],
  textField: [['name', 'text'], ['label', 'text'], ['placeholder', 'text'], ['keyboard', ['', 'text', 'number', 'email', 'phone']], ['required', 'bool'], ['minLength', 'number'], ['maxLength', 'number'], ['pattern', ['', ...Object.keys(FIELD_PATTERNS)]], ['secure', 'bool']],
  textArea: [['name', 'text'], ['label', 'text'], ['placeholder', 'text'], ['rows', 'number'], ['required', 'bool'], ['maxLength', 'number']],
  picker: [['name', 'text'], ['label', 'text'], ['placeholder', 'text'], ['required', 'bool'], ['options', 'options']],
  // sdui-r: data = a JSON array, or a key path into the screen data (e.g. a screen.load result)
  // the data source is the chart's ACTION (api → its request); no action = the static `data`
  chart: [['kind', ['', 'bar', 'line', 'area', 'pie', 'donut']], ['data', 'json'], ['labels', 'json'],
    ['keyKey', 'text'], ['labelKey', 'text'], ['valueKey', 'text'],
    ['color', 'color'], ['height', 'number'], ['min', 'number'], ['max', 'number'],
    ['showLabels', 'bool'], ['showKeys', 'bool'], ['showValues', 'bool'], ['showLegend', 'bool']]
}

/// The inspector groups, in order (the action has its own section).
export const GROUPS = ['Content', 'Field', 'Data', 'Layout', 'Style', 'Accessibility'] as const
export type FieldGroup = typeof GROUPS[number]
const GROUP: Record<string, FieldGroup> = {
  value: 'Content', markup: 'Content', title: 'Content', systemName: 'Content', name: 'Content', label: 'Content', placeholder: 'Content', options: 'Content',
  items: 'Data', as: 'Data', data: 'Data', labels: 'Data', keyKey: 'Data', labelKey: 'Data', valueKey: 'Data', min: 'Data', max: 'Data',
  keyboard: 'Field', required: 'Field', minLength: 'Field', maxLength: 'Field', pattern: 'Field', secure: 'Field', rows: 'Field',
  spacing: 'Layout', alignment: 'Layout', width: 'Layout', height: 'Layout', maxHeight: 'Layout', columns: 'Layout', rowHeight: 'Layout', axis: 'Layout',
  padding: 'Layout', contentMode: 'Layout',
  a11yLabel: 'Accessibility', a11yId: 'Accessibility'
}
const FORM_FIELDS = new Set(['textField', 'textArea', 'picker'])
/// The inspector group of a prop of a component type (Style for anything not listed).
export function groupOf(type: string, key: string): FieldGroup {
  // a form field's `name` is the key its value is sent under, not content
  if (key === 'name' && FORM_FIELDS.has(type)) return 'Field'
  return GROUP[key] ?? 'Style'
}

// action editor: the named target of each action type, and its picker list
const TARGETS: Record<string, [field: string, list: 'screens' | 'requests' | 'links' | 'commands']> = {
  navigate: ['screen', 'screens'], api: ['request', 'requests'], openURL: ['link', 'links'], native: ['command', 'commands']
}
/// action targets picked from a list: field, list, the "none" option, the label of a value not in the list
type Picked = [field: string, list: 'screens' | 'requests' | 'sources' | 'links', none: string, foreign: string]
const PICKED: Record<string, Picked> = {
  navigate: ['screen', 'screens', '— choose a page —', 'not a template'],
  api: ['request', 'requests', '— choose a request —', 'unknown request'],
  openURL: ['link', 'links', '— choose a link —', 'unknown link']
}
/// what an action without a target does, in the editor
const ACTION_TIPS: Record<string, string> = {
  dismiss: 'Closes this page (back in a browser, closes the sheet in the app). Ends the chain.',
  refresh: 'Reloads this page: the latest release, and its load requests run again. Ends the chain.',
  openURL: 'Opens the link in a new tab (https only; names from the app\'s link list). Ends the chain.'
}
const STARTERS: Record<string, RawAction> = {
  navigate: { type: 'navigate', screen: 'next' }, api: { type: 'api', request: 'myRequest' }, dismiss: { type: 'dismiss' },
  refresh: { type: 'refresh' }, openURL: { type: 'openURL', link: 'helpCenter' }, toast: { type: 'toast', message: 'Done', level: 'success' },
  native: { type: 'native', command: 'biometricConfirm' }
}
/// nested onSuccess/onError editors: 1 + 3 = the default `maxChainDepth` (4)
const MAX_NESTED = 3
const DRAG_MIME = 'application/x-sdui'

const CSS = STUDIO_CSS
const NOTE_PROP = BUILDER_NOTE_PROP

/// sdui-r — the **Template Builder** (admin / template designer): the Studio with a
/// component palette whose output is a template — readable component ids (renameable in
/// the inspector), `order` from the position, a release version and a palette title.
/// `onSave` / `onPublish` receive the template document.
export function mountTemplateBuilder(target: HTMLElement, options: StudioOptions = {}): MountedStudio {
  const document = options.document ?? new EditorDocument({ factory: options.factory, mode: 'template' })
  if (document.mode !== 'template') throw new TypeError('mountTemplateBuilder needs an EditorDocument in template mode')
  return mountStudio(target, { ...options, document })
}

/// A payload, a template document, or a bare screen → the screen JSON `diff` compares.
function asScreenJSON(value: unknown): unknown {
  const v = value as { template?: unknown; schemaVersion?: unknown } | undefined
  if (v && typeof v === 'object' && v.template !== undefined && v.schemaVersion !== undefined) {
    try { return compose(TemplateSpec.decode(v.template)).toJSON() } catch { return undefined }
  }
  return value
}

/// Mount the Studio into an element. With an EditorDocument in `template` mode this is
/// the Template Builder (see `mountTemplateBuilder`).
export function mountStudio(target: HTMLElement, options: StudioOptions = {}): MountedStudio {
  const doc = options.document ?? new EditorDocument({ factory: options.factory })
  const factory = options.factory ?? doc.factory
  const templateMode = doc.mode === 'template'
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
  const selectOf = (values: readonly string[], current: unknown, labelFor: (v: string) => string = (v) => v || '—') => {
    const select = el('select', {}, ...values.map((v) => el('option', { value: v }, labelFor(v)))) as HTMLSelectElement
    if (typeof current === 'string' && !values.includes(current)) select.append(el('option', { value: current }, current))
    select.value = typeof current === 'string' ? current : ''
    return select
  }

  const opts: StudioOptions = { ...options }
  const detachStyles = attachStyles(target, CSS, opts.stylesheet)
  const root = el('div', { class: 'sdui-studio' })
  target.append(root)

  let width = 375
  let jsonOpen = true
  let jsonEditing = false
  let previewMode = false
  let message = ''
  let status: { text: string; ok: boolean } | undefined
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  let drag: Drag | undefined

  // datalists for the action editor's named targets (one set per Studio)
  const uid = Math.random().toString(36).slice(2, 8)
  const listId = (name: string) => `sdui-${uid}-${name}`
  const LISTS = ['screens', 'requests', 'sources', 'links', 'commands', 'assets'] as const
  const datalists = new Map(LISTS.map((name) => [name, el('datalist', { id: listId(name) })] as const))
  const namesOf = (name: typeof LISTS[number]): readonly string[] => {
    const own = (name === 'assets' ? undefined : opts[name]) ?? opts.catalog?.[name]
    // not split by the app: charts pick from the one request list, as before
    return own ?? (name === 'sources' ? namesOf('requests') : [])
  }
  /// the picker of an action type's named target
  const pickedFor = (type: string): Picked | undefined => PICKED[type]
  const fillLists = () => {
    for (const [name, list] of datalists) list.replaceChildren(...namesOf(name).map((v) => el('option', { value: v })))
  }
  root.append(...datalists.values())
  fillLists()

  // toolbar
  const keyInput = el('input', { 'aria-label': templateMode ? 'Template key' : 'Screen key', class: 'key' }) as HTMLInputElement
  keyInput.addEventListener('change', () => doc.setKey(keyInput.value.trim()))
  // template mode: release version + the title makers see in the Screen Builder palette
  const versionInput = el('input', { 'aria-label': 'Template version', type: 'number', min: '1', class: 'ver' }) as HTMLInputElement
  versionInput.addEventListener('change', () => doc.setVersion(Number(versionInput.value)))
  const tplTitleInput = el('input', { 'aria-label': 'Template title', placeholder: 'Template title', class: 'key' }) as HTMLInputElement
  tplTitleInput.addEventListener('change', () => doc.setTitle(tplTitleInput.value.trim()))
  const templateFields = templateMode ? [el('span', { class: 'lbl' }, 'v'), versionInput, tplTitleInput] : []
  const undo = button('↶ Undo', () => doc.undo())
  const redo = button('↷ Redo', () => doc.redo())
  const widthSel = el('select', { 'aria-label': 'Preview width', class: 'btn' }, el('option', { value: '375' }, 'Compact 375'), el('option', { value: '768' }, 'Wide 768')) as HTMLSelectElement
  widthSel.addEventListener('change', () => { width = Number(widthSel.value); paint() })
  const previewBtn = button('Preview', () => { previewMode = !previewMode; paint() })
  const statusEl = el('span', { class: 'st', role: 'status' })
  const titleEl = el('span', { class: 'ttl' })
  const showStatus = (text: string, ok: boolean) => {
    status = { text, ok }
    clearTimeout(statusTimer)
    if (ok) statusTimer = setTimeout(() => { status = undefined; paint() }, 2500)
  }
  const emit = async (fn: StudioOptions['onSave'], done: string, failed: string) => {
    try {
      const json = JSON.parse(doc.exportJSON())
      await fn?.(json)
      showStatus(done, true)
    } catch (error) {
      showStatus(`${failed}: ${error instanceof Error ? error.message : String(error)}`, false)
    }
    paint()
  }
  const importBtn = button('Import', () => {
    const text = globalThis.prompt?.(templateMode ? 'Paste a template (or a spec payload) JSON' : 'Paste a spec payload (or a legacy page) JSON')
    if (!text) return
    try { doc.importJSON(text); message = '' } catch (error) { message = String(error instanceof Error ? error.message : error) }
    paint()
  })
  const saving: HTMLElement[] = [
    ...(options.onSave ? [button('Save draft', () => void emit(options.onSave, 'Saved ✔', 'Save failed'))] : []),
    ...(options.onPublish ? [button('Publish', () => void emit(options.onPublish, 'Published ✔', 'Publish failed'), 'btn pri')] : [])]
  // template mode: deprecation — a banner when deprecated (with Restore), else a Deprecate… form
  const depBar = el('div', { class: 'dep', role: 'region', 'aria-label': 'Deprecation' })
  let depFormOpen = false
  const depReason = el('input', { 'aria-label': 'Deprecation reason', placeholder: 'Why (required)', class: 'note' }) as HTMLInputElement
  const depReplace = el('select', { 'aria-label': 'Replaced by', class: 'btn' }) as HTMLSelectElement
  const runDeprecation = async (fn: () => void | Promise<void> | undefined, done: string, failed: string) => {
    try { await fn(); depFormOpen = false; showStatus(done, true) } catch (error) { showStatus(`${failed}: ${error instanceof Error ? error.message : String(error)}`, false) }
    paint()
  }
  const depConfirm = button('Deprecate', () => {
    const reason = depReason.value.trim()
    if (!reason) { showStatus('Deprecate: give a reason', false); paint(); return }
    void runDeprecation(() => opts.onDeprecate?.({ reason, ...(depReplace.value ? { replacedBy: depReplace.value } : {}) }), 'Deprecated ✔', 'Deprecate failed')
  }, 'btn pri')
  const depOpen = button('Deprecate…', () => { depFormOpen = !depFormOpen; paint() })
  const paintDeprecation = () => {
    const dep = opts.deprecation
    const canAct = templateMode
    depOpen.hidden = !templateMode || !!dep || !opts.onDeprecate
    if (!templateMode || (!dep && !depFormOpen)) { depBar.hidden = true; return }
    depBar.hidden = false
    if (dep) {
      depBar.replaceChildren(el('strong', {}, 'Deprecated'), el('span', {}, deprecationText(doc.key, dep)),
        ...(opts.onRestore && canAct ? [button('Restore', () => void runDeprecation(() => opts.onRestore?.(), 'Restored ✔', 'Restore failed'))] : []))
      return
    }
    const others = namesOf('screens').filter((k) => k !== doc.key && !(opts.catalog?.deprecated ?? []).includes(k))
    const current = depReplace.value
    depReplace.replaceChildren(el('option', { value: '' }, '— no replacement —'), ...others.map((k) => el('option', { value: k }, `use ${k}`)))
    depReplace.value = others.includes(current) ? current : ''
    depBar.replaceChildren(el('strong', {}, 'Deprecate this template?'),
      el('span', {}, 'Makers can no longer start new pages from it; live pages keep working.'),
      depReason, depReplace, depConfirm, button('Cancel', () => { depFormOpen = false; paint() }))
  }

  const toolbar = el('div', { class: 'tb' },
    el('strong', {}, templateMode ? 'Template Builder' : 'SDUI Studio'), titleEl,
    keyInput, ...templateFields, undo, redo, widthSel, previewBtn, el('span', { class: 'sp' }), statusEl,
    importBtn,
    button('Export DSL', () => { void navigator.clipboard?.writeText(doc.exportDSL()); message = 'DSL copied to clipboard'; paint() }),
    ...saving,
    depOpen
  )

  // drag & drop: palette → canvas/outline (insert), canvas/outline node → elsewhere (move)
  const startDrag = (event: DragEvent, next: Drag) => {
    drag = next
    try {
      event.dataTransfer?.setData(DRAG_MIME, JSON.stringify(next))
      event.dataTransfer?.setData('text/plain', next.kind === 'type' ? next.type : next.id)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove'
    } catch { /* some engines restrict dataTransfer; the in-memory drag still works */ }
  }
  const currentDrag = (event: DragEvent): Drag | undefined => {
    if (drag) return drag
    try {
      const raw = event.dataTransfer?.getData(DRAG_MIME)
      return raw ? JSON.parse(raw) as Drag : undefined
    } catch {
      return undefined
    }
  }
  /// before / inside / after from the pointer position over `el`
  const zoneOf = (target: Element, event: DragEvent, id: string): Zone => {
    const rect = target.getBoundingClientRect()
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
    if (doc.isContainer(id)) return id === doc.root.id || (y > 0.25 && y < 0.75) ? 'inside' : y <= 0.25 ? 'before' : 'after'
    return y < 0.5 ? 'before' : 'after'
  }
  let marked: Element | undefined
  const mark = (target: Element | undefined, zone?: Zone) => {
    if (marked && marked !== target) marked.removeAttribute('data-drop')
    marked = target
    if (target && zone) target.setAttribute('data-drop', zone)
  }
  const drop = (next: Drag, id: string, zone: Zone) => {
    const at = doc.placement(id, zone)
    if (!at) return
    if (next.kind === 'type') doc.add(next.type, at)
    else if (next.id !== id && doc.reparent(next.id, at.parentId, at.index)) doc.select(next.id)
  }
  /// wire a drop surface whose node elements carry the node id in `attr`
  const dropSurface = (surface: HTMLElement, attr: string, fallbackToRoot: boolean) => {
    const resolve = (event: DragEvent): [Element, string] | undefined => {
      const hit = (event.target as Element).closest?.(`[${attr}]`)
      if (hit && surface.contains(hit)) return [hit, hit.getAttribute(attr)!]
      return fallbackToRoot ? [surface, doc.root.id!] : undefined
    }
    surface.addEventListener('dragover', (event) => {
      const next = currentDrag(event)
      const at = next && !previewMode ? resolve(event) : undefined
      if (!at) return
      const zone = zoneOf(at[0], event, at[1])
      if (!doc.placement(at[1], zone) || (next!.kind === 'node' && next!.id === at[1])) { mark(undefined); return }
      event.preventDefault()
      mark(at[0], zone)
    })
    surface.addEventListener('dragleave', (event) => {
      if (!surface.contains(event.relatedTarget as Node | null)) mark(undefined)
    })
    surface.addEventListener('drop', (event) => {
      const next = currentDrag(event)
      const at = next && !previewMode ? resolve(event) : undefined
      mark(undefined)
      drag = undefined
      if (!at) return
      event.preventDefault()
      drop(next!, at[1], zoneOf(at[0], event, at[1]))
    })
  }
  const endDrag = () => { drag = undefined; mark(undefined) }

  // columns
  const palette = el('div', { class: 'pal' })
  for (const info of factory.palette()) {
    const item = button(info.type, () => doc.add(info.type), '')
    item.draggable = true
    item.addEventListener('dragstart', (event) => startDrag(event, { kind: 'type', type: info.type }))
    item.addEventListener('dragend', endDrag)
    palette.append(item)
  }
  const outline = el('div', { role: 'tree' })
  /// outline nodes whose children are folded away (survives repaints)
  const folded = new Set<string>()
  let revealed: string | undefined
  const twisty =(n: SduiNode, repaint: () => void) => outlineTwisty(d, n, folded, repaint)
  dropSurface(outline, 'data-sdui-row', false)
  const device = el('div', { class: 'device' })
  device.addEventListener('click', (event) => {
    if (previewMode) return
    const hit = (event.target as Element).closest?.('[data-sdui-node]')
    if (hit) doc.select(hit.getAttribute('data-sdui-node') ?? undefined)
  })
  device.addEventListener('dragstart', (event) => {
    const hit = (event.target as Element).closest?.('[data-sdui-node]')
    const id = hit?.getAttribute('data-sdui-node')
    if (id && id !== doc.root.id) startDrag(event, { kind: 'node', id })
  })
  device.addEventListener('dragend', endDrag)
  dropSurface(device, 'data-sdui-node', true)
  const inspector = el('div', { class: 'insp' })
  const paletteBox = el('div', {}, el('h3', {}, 'Components'), el('div', { class: 'tip' }, 'Click to insert, or drag onto the canvas / outline.'), palette)
  const main = el('div', { class: 'main' },
    el('div', { class: 'col' }, paletteBox, foldSection(d, `sdui-${uid}-outline`, 'Outline', outline)),
    el('div', { class: 'col canvas' }, device),
    el('div', { class: 'col' }, el('h3', {}, 'Inspector'), inspector)
  )
  root.append(toolbar, depBar, main)

  // JSON panel (collapsible; the selected node is highlighted and scrolled to)
  const LINE = 18
  const PAD = 8
  const jsonText = el('textarea', { spellcheck: 'false', wrap: 'off', 'aria-label': templateMode ? 'Template JSON' : 'Payload JSON' }) as HTMLTextAreaElement
  const band = el('div', { class: 'band' })
  const jsonBody = el('div', { class: 'body' }, band, jsonText)
  const badge = el('span', { class: 'badge' })
  const toggle = button('▾', () => { jsonOpen = !jsonOpen; paint() })
  toggle.setAttribute('aria-expanded', 'true')
  const issues = el('div', { class: 'issues' })
  // review: what the draft changes against the baseline (active release)
  const changesEl = el('div', { class: 'changes', 'aria-label': 'Changes against the active release' })
  const jsonPanel = el('div', { class: 'json' }, el('div', { class: 'hd' }, toggle, el('span', {}, 'JSON (2-way)'), badge), jsonBody, issues, changesEl)
  root.append(jsonPanel)
  let editTimer: ReturnType<typeof setTimeout> | undefined
  jsonText.addEventListener('input', () => {
    jsonEditing = true
    clearTimeout(editTimer)
    editTimer = setTimeout(() => {
      // template mode: the JSON editor cannot rename a component id (value sets are keyed by it)
      try { doc.importJSON(jsonText.value, { keepIds: templateMode }); message = '' } catch (error) { message = `JSON: ${error instanceof Error ? error.message : error}` }
      jsonEditing = false
      paint()
    }, 500)
  })
  jsonText.addEventListener('scroll', () => placeBand())
  const placeBand = () => {
    const range = findNodeJsonRange(jsonText.value, doc.selection)
    band.style.display = range ? 'block' : 'none'
    if (range) {
      band.style.top = `${PAD + range.startLine * LINE - jsonText.scrollTop}px`
      band.style.height = `${(range.endLine - range.startLine + 1) * LINE}px`
    }
    return range
  }

  /// A chart's data source (its own action, `api` only): pick a source (or none = its static
  /// `data`) and its params. No other action type and no follow-up steps: a chart never runs
  /// an action, it only reads the source.
  const sourceEditor = (node: SduiNode, commit: (next: RawAction | undefined) => void): HTMLElement => {
    const box = el('div', { class: 'act' })
    const raw = node.action?.toJSON() as RawAction | undefined
    const current = raw?.type === 'api' && typeof raw.request === 'string' ? raw.request : ''
    const names = namesOf('sources')
    const select = el('select', { 'aria-label': 'data source' }, el('option', { value: '' }, '— static data (no source) —'),
      ...names.map((n) => el('option', { value: n }, n))) as HTMLSelectElement
    if (current && !names.includes(current)) select.append(el('option', { value: current }, `${current} (not a data source)`))
    select.value = current
    select.addEventListener('change', () => commit(select.value ? { type: 'api', request: select.value, ...(raw?.type === 'api' && raw.params !== undefined ? { params: raw.params } : {}) } : undefined))
    box.append(el('label', {}, 'source', select))
    if (raw && raw.type !== 'api') {
      box.append(el('div', { class: 'tip warn' }, `A chart only reads an api data source; this ${String(raw.type)} action is ignored.`), button('Remove action', () => commit(undefined)))
      return box
    }
    box.append(el('div', { class: 'tip' }, current
      ? `Loaded when the page opens: a { items: [{ key, label, value }] } summary.`
      : 'No source: the chart draws its static data (Data group).'))
    if (current) {
      const area = el('textarea', { 'aria-label': 'params' }) as HTMLTextAreaElement
      area.value = raw?.params === undefined ? '' : JSON.stringify(raw.params)
      area.addEventListener('change', () => { try { commit({ type: 'api', request: current, ...(area.value.trim() ? { params: JSON.parse(area.value) } : {}) }) } catch { /* keep editing */ } })
      box.append(el('label', {}, 'params (JSON)', area))
    }
    return box
  }

  /// A structured action editor: type, its named target (picked from the app's
  /// allow-list or typed), presentation / message / level, params, and the
  /// onSuccess / onError chain. Edits the raw JSON form; `commit` decodes it.
  const actionEditor = (raw: RawAction | undefined, commit: (next: RawAction | undefined) => void, depth: number): HTMLElement => {
    const box = el('div', { class: 'act' })
    const typeSel = selectOf(['', ...ActionType.allCases], raw?.type, (v) => v || '— none —')
    typeSel.addEventListener('change', () => {
      const starter: RawAction | undefined = typeSel.value ? { ...STARTERS[typeSel.value] } : undefined
      // a new navigate / api points at a real page / request / source (the first one), not a placeholder
      const picked = starter && pickedFor(String(starter.type))
      if (starter && picked && namesOf(picked[1]).length > 0) starter[picked[0]] = namesOf(picked[1])[0]
      commit(starter)
    })
    box.append(el('label', {}, 'type', typeSel))
    if (!raw) return box
    const set = (key: string, value: unknown) => {
      const next = { ...raw }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      commit(next)
    }
    const type = String(raw.type)
    const textField = (key: string, list?: string) => {
      const input = el('input', list ? { list } : {}) as HTMLInputElement
      input.value = typeof raw[key] === 'string' ? raw[key] as string : ''
      input.addEventListener('change', () => set(key, input.value.trim()))
      return el('label', {}, key, input)
    }
    const target = TARGETS[type]
    const uses = ACTION_USES[type] ?? { params: true, chain: ['onSuccess', 'onError'] }
    if (ACTION_TIPS[type]) box.append(el('div', { class: 'tip' }, ACTION_TIPS[type]))
    const picked = pickedFor(type)
    if (picked && namesOf(picked[1]).length > 0) {
      // pages (the templates), requests (what a button sends) and data sources (what a chart
      // reads) are picked, not typed: no typo reaches a payload
      const [field, list, none, foreign] = picked
      const names = namesOf(list)
      const current = typeof raw[field] === 'string' ? raw[field] as string : ''
      const deprecated = list === 'screens' ? new Set(opts.catalog?.deprecated ?? []) : new Set<string>()
      const select = el('select', { 'aria-label': field }, el('option', { value: '' }, none),
        ...names.map((p) => el('option', { value: p }, deprecated.has(p) ? `${p} (deprecated)` : p))) as HTMLSelectElement
      if (current && !names.includes(current)) select.append(el('option', { value: current }, `${current} (${foreign})`))
      select.value = current
      select.addEventListener('change', () => set(field, select.value))
      box.append(el('label', {}, field, select))
    } else if (target) box.append(textField(target[0], listId(target[1])))
    if (type === 'navigate') {
      const select = selectOf(['', 'push', 'sheet', 'fullScreen'], raw.presentation)
      select.addEventListener('change', () => set('presentation', select.value))
      box.append(el('label', {}, 'presentation', select))
    }
    if (type === 'toast') {
      box.append(textField('message'))
      const select = selectOf(['', 'info', 'success', 'warning', 'error'], raw.level)
      select.addEventListener('change', () => set('level', select.value))
      box.append(el('label', {}, 'level', select))
    }
    // only what the engine reads: params where they are sent, follow-up steps that can run.
    // A field the type ignores stays visible while it holds something, so it can be removed.
    if (uses.params || raw.params !== undefined) {
      const area = el('textarea', { 'aria-label': 'params' }) as HTMLTextAreaElement
      area.value = raw.params === undefined ? '' : JSON.stringify(raw.params)
      area.addEventListener('change', () => { try { set('params', area.value.trim() ? JSON.parse(area.value) : undefined) } catch { /* keep editing */ } })
      box.append(el('label', {}, uses.params ? 'params (JSON)' : `params (ignored by ${type}: clear it)`, area))
    }
    if (depth < MAX_NESTED) {
      for (const key of ['onSuccess', 'onError'] as const) {
        const nested = raw[key] as RawAction | undefined
        const runs = uses.chain.includes(key)
        if (!runs && !nested) continue
        const details = el('details', nested ? { open: '' } : {}, el('summary', {}, runs ? key : `${key} (never runs after ${type}: remove it)`), actionEditor(nested, (v) => set(key, v), depth + 1))
        box.append(details)
      }
    }
    return box
  }

  /// inspector groups the author folded (survive repaints and selection changes)
  const foldedGroups = new Set<string>()
  const inspectorFor = (node: SduiNode) => {
    const id = node.id!
    const fields = [...(FIELDS[node.type] ?? []), ...SHARED]
    const props = node.props
    const control = (key: string, kind: FieldKind): HTMLElement => {
      const current = props[key]
      if (kind === 'bool') {
        const input = el('input', { type: 'checkbox' }) as HTMLInputElement
        const onByDefault = DEFAULT_TRUE.has(key)
        input.checked = onByDefault ? current !== false : current === true
        input.addEventListener('change', () => doc.setProp(id, key, onByDefault ? (input.checked ? undefined : false) : input.checked || undefined))
        return el('label', { class: 'chk' }, input, key === 'markup' ? 'markup (**bold** / *italic*)' : key)
      }
      if (kind === 'textarea') {
        return multilineText(d, {
          label: key, value: typeof current === 'string' ? current : '', rows: 3,
          // live: the canvas follows every keystroke (one undo step per typing session)
          onChange: (v) => doc.setProp(id, key, v === '' ? undefined : v, { typing: true }),
          onCommit: () => doc.endTyping(),
          // a text's value: bold / italic buttons (they switch `markup` on)
          ...(node.type === 'text' && key === 'value' ? { onMarkup: () => doc.setProp(id, 'markup', true), markupOn: props.markup === true } : {})
        })
      }
      if (kind === 'color') return colorField(d, key, current, (v) => doc.setProp(id, key, v))
      if (kind === 'options') return optionsTable(d, key, current, (v) => doc.setProp(id, key, v))
      if (kind === 'items') {
        // a list repeats over an array in the screen data: a `screen.load` result, or a key path
        const loads = doc.load.map((l) => l.request)
        const value = typeof current === 'string' ? current : ''
        const select = selectOf(['', ...loads], loads.includes(value) ? value : value ? '#' : '', (v) => v === '' ? '— none —' : v === '#' ? 'key path…' : `load: ${v}`)
        if (!select.querySelector('option[value="#"]')) select.append(el('option', { value: '#' }, 'key path…'))
        select.value = loads.includes(value) ? value : value ? '#' : ''
        const path = el('input', { 'aria-label': `${key} key path`, placeholder: 'e.g. catalog.items' }) as HTMLInputElement
        path.value = loads.includes(value) ? '' : value
        path.hidden = select.value !== '#'
        select.addEventListener('change', () => { if (select.value === '#') { path.hidden = false; path.focus() } else doc.setProp(id, key, select.value || undefined) })
        path.addEventListener('change', () => doc.setProp(id, key, path.value.trim() || undefined))
        return el('label', {}, key, select, path)
      }
      if (Array.isArray(kind)) {
        const select = selectOf(kind, current)
        select.addEventListener('change', () => doc.setProp(id, key, select.value || undefined))
        return el('label', {}, key, select)
      }
      if (kind === 'json') {
        const area = el('textarea', {}) as HTMLTextAreaElement
        area.value = current === undefined ? '' : JSON.stringify(current)
        area.addEventListener('change', () => { try { doc.setProp(id, key, area.value ? JSON.parse(area.value) : undefined) } catch { /* keep editing */ } })
        return el('label', {}, key, area)
      }
      const input = el('input', { type: kind === 'number' ? 'number' : 'text', ...(node.type === 'image' && key === 'name' ? { list: listId('assets') } : {}) }) as HTMLInputElement
      input.value = current === undefined || current === null ? '' : String(current)
      // live: the canvas follows every keystroke; a half-typed number waits
      input.addEventListener('input', () => {
        if (kind === 'number' && input.value !== '' && !Number.isFinite(Number(input.value))) return
        doc.setProp(id, key, input.value === '' ? undefined : kind === 'number' ? Number(input.value) : input.value, { typing: true })
      })
      input.addEventListener('change', () => doc.endTyping())
      return el('label', {}, key, input)
    }
    // one foldable section per group, in a fixed order
    const groups = new Map<FieldGroup, HTMLElement[]>()
    for (const [key, kind] of fields) {
      const g = groupOf(node.type, key)
      groups.set(g, [...(groups.get(g) ?? []), control(key, kind)])
    }
    const section = (name: string, ...body: Node[]) => {
      const box = el('details', foldedGroups.has(name) ? { class: 'grp' } : { class: 'grp', open: '' }, el('summary', {}, name), ...body) as HTMLDetailsElement
      box.addEventListener('toggle', () => { if (box.open) foldedGroups.delete(name); else foldedGroups.add(name) })
      return box
    }
    const controls = GROUPS.filter((g) => groups.has(g)).map((g) => section(g, ...groups.get(g)!))

    // parent picker (moves the node to the end of another container)
    const placement: Node[] = []
    const candidates = doc.parentCandidates(id)
    if (candidates.length) {
      const parentId = flatten(doc.root).find(([n]) => n.children.some((c) => c.id === id))?.[0].id ?? ''
      const select = selectOf(candidates.map((c) => c.id!), parentId, (v) => {
        const n = find(doc.root, v)!
        return `${outlineLabel(n)}${isGeneratedId(v) ? '' : ` #${v}`}${v === doc.root.id ? ' (root)' : ''}`
      })
      select.addEventListener('change', () => { if (doc.reparent(id, select.value)) doc.select(id) })
      placement.push(el('label', {}, 'parent', select))
    }

    // action: what the component does with it — a tap (structured editor + raw JSON), a data
    // source (the chart: an api request only), or nothing (shown only to clear a leftover)
    const commitAction = (raw: RawAction | undefined) => {
      try {
        doc.setAction(id, raw ? ActionSpec.decode(raw) : undefined)
      } catch (error) {
        message = `Action: ${error instanceof Error ? error.message : String(error)}`
        paint()
      }
    }
    const actionJSON = el('textarea', { 'aria-label': 'Action JSON' }) as HTMLTextAreaElement
    actionJSON.value = node.action ? JSON.stringify(node.action.toJSON(), null, 1) : ''
    actionJSON.addEventListener('change', () => { try { commitAction(actionJSON.value ? JSON.parse(actionJSON.value) : undefined) } catch { /* keep editing */ } })
    const use: ActionUse = actionUseOf(node.type, factory)
    const actionSection: Node[] = []
    if (use === 'tap') {
      actionSection.push(section('Interaction', actionEditor(node.action?.toJSON(), commitAction, 0), el('details', {}, el('summary', {}, 'Action JSON'), actionJSON)))
    } else if (use === 'source') {
      actionSection.push(section('Data source', sourceEditor(node, commitAction)))
    } else if (node.action) {
      actionSection.push(section('Action (ignored)',
        el('div', { class: 'tip warn' }, `A ${node.type} does nothing when tapped: this action never runs. Only buttons run actions.`),
        button('Remove action', () => commitAction(undefined))))
    }

    const propsJSON = el('textarea', { 'aria-label': 'Props JSON' }) as HTMLTextAreaElement
    propsJSON.value = JSON.stringify(props)
    propsJSON.addEventListener('change', () => { try { doc.setProps(id, JSON.parse(propsJSON.value) as SduiProps) } catch { /* keep editing */ } })

    // template mode: the component id is what makers' value sets are keyed by — generated
    // once (`text1`, `button2` …) and never edited, so a released value set never loses its key
    const identity: Node[] = []
    if (templateMode) {
      const idInput = el('input', { 'aria-label': 'Component id', class: 'cid', readonly: '', tabindex: '-1' }) as HTMLInputElement
      idInput.value = id
      idInput.readOnly = true
      idInput.title = 'Generated; value sets are keyed by it, so it cannot be changed'
      const order = ordersOf(doc.root).get(id) ?? 0
      const noteInput = el('textarea', { 'aria-label': 'Note for makers', placeholder: 'e.g. "Buy ticket — goes to checkout"', rows: '2' }) as HTMLTextAreaElement
      noteInput.value = typeof props[NOTE_PROP] === 'string' ? props[NOTE_PROP] as string : ''
      noteInput.addEventListener('change', () => doc.setProp(id, NOTE_PROP, noteInput.value.trim() || undefined))
      identity.push(el('label', {}, 'component id', idInput),
        el('div', { class: 'tip' }, `order ${order} (place in the page, top to bottom) · ↑ ↓ or drag to reorder`),
        el('label', {}, 'note for makers', noteInput),
        el('div', { class: 'tip fn' }, describeComponent(node, factory).join(' · ')))
    }

    inspector.replaceChildren(
      el('fieldset', {}, el('legend', {}, `${node.type}${node.id && !isGeneratedId(node.id) ? ` #${node.id}` : ''}`), ...identity, ...placement),
      ...controls,
      ...actionSection,
      section('Props (JSON)', propsJSON),
      el('div', { class: 'acts' },
        button('↑', () => doc.move(id, -1)), button('↓', () => doc.move(id, 1)),
        button('Duplicate', () => doc.duplicate(id)), button('Delete', () => doc.delete(id)))
    )
  }

  /// Edit-mode affordances on the rendered preview: draggable nodes, empty
  /// container hints, and a label on the selected node.
  const decorate = () => {
    const nodes = new Map(flatten(doc.root).map(([n]) => [n.id!, n]))
    for (const element of device.querySelectorAll('[data-sdui-node]')) {
      const id = element.getAttribute('data-sdui-node')!
      const node = nodes.get(id)
      if (!node) continue
      if (id !== doc.root.id) (element as HTMLElement).draggable = true
      element.setAttribute('title', `${node.type}${isGeneratedId(id) ? '' : ` #${id}`}`)
      if (id === doc.selection) element.setAttribute('data-label', element.getAttribute('title')!)
      if (doc.isContainer(id) && node.children.length === 0) element.append(el('div', { class: 'hint' }, `Empty ${node.type} — drop components here`))
      // an image without a picture is a frame the maker fills in the Screen Builder
      if (element.hasAttribute('data-sdui-frame')) element.setAttribute('data-frame-label', element.getAttribute('data-sdui-frame') === 'missing'
        ? `unknown image "${node.string('name')}"` : 'Image frame — the maker uploads the picture')
    }
  }

  const paint = () => {
    keyInput.value = doc.key
    versionInput.value = String(doc.version)
    tplTitleInput.value = doc.title ?? ''
    undo.disabled = !doc.canUndo
    redo.disabled = !doc.canRedo
    titleEl.textContent = opts.title ?? ''
    titleEl.style.display = opts.title ? '' : 'none'
    previewBtn.textContent = previewMode ? 'Edit' : 'Preview'
    previewBtn.className = previewMode ? 'btn on' : 'btn'
    previewBtn.setAttribute('aria-pressed', String(previewMode))
    main.classList.toggle('pv', previewMode)
    jsonPanel.style.display = previewMode ? 'none' : ''
    paintDeprecation()
    statusEl.textContent = status?.text ?? ''
    statusEl.className = `st${status ? (status.ok ? ' ok' : ' err') : ''}`
    // outline
    // a NEW selection (e.g. a canvas click) inside a folded branch unfolds its parents;
    // folding the branch of the current selection afterwards stays folded
    if (doc.selection && doc.selection !== revealed) for (const id of ancestorsOf(doc.root, doc.selection)) folded.delete(id)
    revealed = doc.selection
    outline.replaceChildren(...flattenVisible(doc.root, folded).map(([n, depth]) => {
      const text = outlineLabel(n)
      const row = el('div', { class: n.id === doc.selection ? 'row sel' : 'row', role: 'treeitem', 'aria-level': String(depth + 1), 'data-sdui-row': n.id!, title: templateMode ? `${text} #${n.id}` : text },
        twisty(n, () => paint()), text)
      if (n.children.length > 0) row.setAttribute('aria-expanded', String(!folded.has(n.id!)))
      row.style.paddingLeft = `${4 + depth * 14}px`
      row.addEventListener('click', () => doc.select(n.id))
      if (n.id !== doc.root.id) {
        row.draggable = true
        row.addEventListener('dragstart', (event) => startDrag(event, { kind: 'node', id: n.id! }))
        row.addEventListener('dragend', endDrag)
      }
      return row
    }))
    // canvas
    device.style.width = `${width}px`
    const preview = renderPreview(factory, doc.root, { data: opts.sampleData, selected: previewMode ? undefined : doc.selection, assetURL: opts.assetURL })
    device.replaceChildren(...(preview ? [renderNodeDOM(preview, undefined, undefined, d)] : []))
    if (!previewMode) decorate()
    // bounded containers that clip their content (measured on the canvas)
    const clipped = previewMode ? [] : clippedContainers(device, doc.root)
    // inspector (rebuilt on every edit: the field being typed into keeps focus and caret)
    const selected = doc.selected
    const keep = focusOf(inspector, selected?.id)
    if (selected) inspectorFor(selected)
    else inspector.replaceChildren(el('p', { class: 'empty' }, 'Select a node'))
    restoreFocus(inspector, keep, selected?.id)
    // JSON
    toggle.textContent = jsonOpen ? '▾' : '▸'
    toggle.setAttribute('aria-expanded', String(jsonOpen))
    jsonBody.style.display = jsonOpen ? 'block' : 'none'
    // the panel shows editor ids too, so the selected node can be located
    const withIds = templateMode
      ? JSON.stringify(doc.templateDocument().toJSON(), null, 2)
      : JSON.stringify({ schemaVersion: SPEC_VERSION, screen: { key: doc.key, root: doc.root.toJSON() } }, null, 2)
    if (!jsonEditing) jsonText.value = withIds
    const range = jsonOpen ? placeBand() : null
    badge.textContent = selected ? `${selected.type}${range ? ` · lines ${range.startLine + 1}–${range.endLine + 1}` : ''}` : ''
    badge.style.display = selected ? 'inline-block' : 'none'
    if (range && jsonOpen) {
      const top = PAD + range.startLine * LINE
      if (top < jsonText.scrollTop || top > jsonText.scrollTop + jsonText.clientHeight - LINE) jsonText.scrollTop = Math.max(0, top - LINE * 2)
      placeBand()
    }
    const problems = doc.issues().map((i) => i.message)
    issues.replaceChildren(
      ...[message, ...problems].filter(Boolean).map((m) => el('div', {}, `⚠ ${m}`)),
      ...clipped.map((w) => el('div', { class: 'warn' }, `⚠ ${w}`)),
      // an api action naming the wrong kind (a chart reading a button's request, a button sending a data source)
      ...actionWarnings(doc.root, { requests: namesOf('requests'), sources: opts.sources ?? opts.catalog?.sources, links: namesOf('links') }, factory)
        .map((w) => el('div', { class: 'warn' }, `⚠ ${w}`)),
      ...doc.importWarnings.map((w) => el('div', { class: 'warn' }, `↳ ${w}`))
    )
    const payload = templateMode ? doc.templateDocument().toJSON() : doc.payload().toJSON()
    paintChanges(opts.baseline === undefined ? undefined : diff(asScreenJSON(opts.baseline), asScreenJSON(payload)))
    options.onChange?.(payload)
  }

  const paintChanges = (changes: ScreenChange[] | undefined) => {
    changesEl.hidden = changes === undefined
    if (!changes) return
    const show = (v: unknown) => { const s = v === undefined ? '∅' : JSON.stringify(v); return s.length > 40 ? `${s.slice(0, 39)}…` : s }
    changesEl.replaceChildren(
      el('div', { class: 'hd' }, changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} vs. the active release` : 'No changes vs. the active release'),
      ...changes.map((c) => el('div', { class: c.kind },
        `${c.kind} · ${c.type ?? 'screen'} ${c.path}${c.field ? ` · ${c.field}` : ''}${c.kind === 'changed' || c.kind === 'moved' ? `: ${show(c.before)} → ${show(c.after)}` : ''}`))
    )
  }

  const unsubscribe = doc.subscribe(paint)
  paint()

  return {
    document: doc,
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

/// The focused field of a panel that is about to be rebuilt: its position among the panel's
/// fields, the component it belongs to, and the caret / selection.
export interface KeptFocus { owner: string | undefined; index: number; start: number | null; end: number | null }

const FIELDS_SELECTOR = 'input, textarea, select'

export function focusOf(panel: HTMLElement, owner: string | undefined): KeptFocus | undefined {
  const active = panel.ownerDocument.activeElement
  if (!active || !panel.contains(active)) return undefined
  const index = [...panel.querySelectorAll(FIELDS_SELECTOR)].indexOf(active)
  if (index < 0) return undefined
  const field = active as HTMLInputElement
  let start: number | null = null
  let end: number | null = null
  try { start = field.selectionStart; end = field.selectionEnd } catch { /* number inputs have no selection */ }
  return { owner, index, start, end }
}

/// Put the focus (and caret) back on the same field after the panel was rebuilt — only for
/// the same component, so selecting another one never steals the focus.
export function restoreFocus(panel: HTMLElement, kept: KeptFocus | undefined, owner: string | undefined): void {
  if (!kept || kept.owner !== owner) return
  const field = panel.querySelectorAll(FIELDS_SELECTOR)[kept.index] as HTMLInputElement | undefined
  if (!field) return
  field.focus()
  if (kept.start !== null && kept.end !== null) {
    try { field.setSelectionRange(kept.start, kept.end) } catch { /* not a text field */ }
  }
}

/// The fold toggle at the start of an outline row: ▾ / ▸ for a node with children (folds
/// its subtree in `folded`), an empty slot of the same width for a leaf so labels line up.
export function outlineTwisty(doc: Document, node: SduiNode, folded: Set<string>, repaint: () => void): HTMLElement {
  const tw = doc.createElement('span')
  if (node.children.length === 0 || node.id === undefined) {
    tw.className = 'tw leaf'
    tw.setAttribute('aria-hidden', 'true')
    return tw
  }
  const id = node.id
  const open = !folded.has(id)
  tw.className = 'tw'
  tw.setAttribute('role', 'button')
  tw.setAttribute('aria-label', open ? `Collapse ${node.type}` : `Expand ${node.type}`)
  tw.title = open ? `Collapse (${node.children.length} children)` : `Expand (${node.children.length} children)`
  tw.textContent = open ? '▾' : '▸'
  // fold only: selecting the row is the row's own click
  tw.addEventListener('click', (event) => {
    event.stopPropagation()
    if (open) folded.add(id)
    else folded.delete(id)
    repaint()
  })
  return tw
}

/// A column section with a collapse button in its header (`▾ Title` / `▸ Title`). It folds
/// on its own — repaints of the builder never reopen it.
export function foldSection(doc: Document, id: string, title: string, ...body: Node[]): HTMLElement {
  const content = doc.createElement('div')
  content.id = id
  content.append(...body)
  const toggle = doc.createElement('button')
  toggle.type = 'button'
  toggle.className = 'fold'
  toggle.setAttribute('aria-controls', id)
  let open = true
  const paint = () => {
    const arrow = doc.createElement('span')
    arrow.setAttribute('aria-hidden', 'true')
    arrow.textContent = open ? '▾' : '▸'
    toggle.replaceChildren(arrow, title)
    toggle.setAttribute('aria-expanded', String(open))
    toggle.title = open ? `Collapse ${title}` : `Expand ${title}`
    content.hidden = !open
  }
  toggle.addEventListener('click', () => { open = !open; paint() })
  paint()
  const header = doc.createElement('h3')
  header.className = 'fold-h'
  header.append(toggle)
  const section = doc.createElement('div')
  section.append(header, content)
  return section
}

/// Install the stylesheet without an inline `<style>` (strict CSP): a constructable
/// stylesheet adopted by the target's document or shadow root. `external`: the app links
/// `@fajekrina/sdui-r/builder/studio.css` itself. Engines without constructable stylesheets
/// (Safari < 16.4) fall back to a `<style>` element, which a strict CSP would block.
export function attachStyles(target: HTMLElement, css: string, mode: StudioOptions['stylesheet'] = 'adopt'): () => void {
  if (mode === 'external') return () => undefined
  const scope = target.getRootNode() as Document | ShadowRoot
  const Sheet = target.ownerDocument.defaultView?.CSSStyleSheet
  if (Sheet && 'adoptedStyleSheets' in scope && typeof Sheet.prototype.replaceSync === 'function') {
    const sheet = new Sheet()
    sheet.replaceSync(css)
    scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sheet]
    return () => { scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter((x) => x !== sheet) }
  }
  const style = target.ownerDocument.createElement('style')
  style.textContent = css
  target.append(style)
  return () => style.remove()
}

export { find }
