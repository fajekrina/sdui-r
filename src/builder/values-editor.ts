// sdui-r — the headless model of the Screen Builder (maker): a merchant screen = a chosen
// template release + the values of its components. The template's structure is never
// edited here, nor its style, layout or actions: only the CONTENT props of each component
// (`isContentProp` — texts, labels, image names, data arrays). That is the value set.
import {
  SchemaValidator, isContentProp, SduiNode, SduiPayload, TemplateDocument, ValueSet, ValuesDocument, compose, parseJSON,
  sortedJSONStringify, SPEC_VERSION, type BytesLike, type ComponentValue, type ScreenSpec, type SduiProps, type SduiValue
} from '../core'
import type { ValidationIssue } from './document'

/// A template a maker can pick (the Screen Builder palette).
export interface TemplateChoice {
  key: string
  version: number
  title?: string
  /// the template document (or envelope payload JSON); else `loadTemplate` fetches it
  document?: unknown
  /// set when the template is deprecated: shown in the palette and as a banner; a builder
  /// offers it only to pages that already use it
  deprecated?: { reason?: string; replacedBy?: string; by?: string; at?: string }
}

type Components = Record<string, ComponentValue>
type Snapshot = { template?: TemplateDocument; components: Components }

/// @deprecated Edit content in the Template Builder instead: the Studio shows design and content in one tree and `splitContent` stores them apart (template + value set).
export class ValuesEditor {
  private _screen: string
  private _template?: TemplateDocument
  private _components: Components = {}
  private _selection?: string
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private readonly listeners = new Set<() => void>()
  /// ids whose values were dropped by the last template switch
  dropped: string[] = []

  constructor(init: { screen?: string; template?: TemplateDocument | unknown; values?: ValuesDocument | unknown } = {}) {
    this._screen = init.screen ?? 'screen'
    if (init.template !== undefined) this._template = init.template instanceof TemplateDocument ? init.template : TemplateDocument.decode(init.template)
    if (init.values !== undefined) {
      const values = init.values instanceof ValuesDocument ? init.values : ValuesDocument.decode(init.values)
      this._screen = init.screen ?? values.values.screen
      this._components = { ...values.values.components }
    }
  }

  get screen(): string { return this._screen }
  get template(): TemplateDocument | undefined { return this._template }
  get components(): Readonly<Components> { return this._components }
  get selection(): string | undefined { return this._selection }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void { for (const l of [...this.listeners]) l() }

  /// the field being typed into (`id:key`): its keystrokes are one undo step
  private typing?: string

  /// End a typing session (the field lost focus): the next edit is a new undo step.
  endTyping(): void { this.typing = undefined }

  private mutate(next: Partial<Snapshot>, typing?: string): void {
    const s = { template: this._template, components: this._components, ...next }
    if (s.template === this._template && JSON.stringify(s.components) === JSON.stringify(this._components)) return
    if (!(typing !== undefined && typing === this.typing && this.undoStack.length > 0)) this.undoStack.push({ template: this._template, components: this._components })
    this.typing = typing
    this.redoStack = []
    this._template = s.template
    this._components = s.components
    this.changed()
  }

  select(id: string | undefined): void {
    if (this._selection === id) return
    this._selection = id
    this.typing = undefined
    this.changed()
  }

  setScreen(screen: string): void {
    if (screen === this._screen) return
    this._screen = screen
    this.changed()
  }

  /// Choose a template release. Values of ids the new template has are kept; the others
  /// are dropped (listed in `dropped`).
  setTemplate(template: TemplateDocument | unknown): string[] {
    const doc = template instanceof TemplateDocument ? template : TemplateDocument.decode(template)
    const ids = doc.template.ids()
    const kept: Components = {}
    const dropped: string[] = []
    const types = new Map<string, string>()
    const collect = (n: SduiNode): void => { if (n.id !== undefined) types.set(n.id, n.type); n.children.forEach(collect) }
    collect(doc.template.root)
    if (doc.template.variants.compact) collect(doc.template.variants.compact)
    if (doc.template.variants.wide) collect(doc.template.variants.wide)
    for (const [id, v] of Object.entries(this._components)) {
      const type = types.get(id)
      if (type === undefined) { dropped.push(id); continue }
      // a component whose type changed keeps only what is content of the new type
      const props: SduiProps = {}
      for (const [key, value] of Object.entries(v.props ?? {})) (isContentProp(type, key) ? (props[key] = value) : dropped.push(`${id}.${key}`))
      if (Object.keys(props).length > 0) kept[id] = { props }
    }
    this.dropped = dropped
    if (this._selection && !ids.has(this._selection)) this._selection = undefined
    this.mutate({ template: doc, components: kept })
    return dropped
  }

  /// The value of `key` for component `id`: the maker's override, else the template default.
  value(id: string, key: string): SduiValue | undefined {
    return this._components[id]?.props?.[key] ?? this.defaults(id)?.[key]
  }

  /// The template's props for `id` (its defaults).
  defaults(id: string): SduiProps | undefined {
    return this.node(id)?.props
  }

  isOverridden(id: string, key?: string): boolean {
    const v = this._components[id]
    if (!v) return false
    if (key === undefined) return Object.keys(v.props ?? {}).length > 0
    return v.props?.[key] !== undefined
  }

  /// Override (or, with `undefined` / `''`, reset to the default) one prop of a component.
  /// Only content props (`editable`); clearing is always allowed. `typing: true` — a
  /// keystroke: consecutive ones into the same field are one undo step.
  setValue(id: string, key: string, value: SduiValue | undefined, options: { typing?: boolean } = {}): void {
    const cleared = value === undefined || value === ''
    if (!cleared && !this.editable(id, key)) throw new TypeError(`${id}.${key} is not content — the template decides it`)
    const current = this._components[id] ?? {}
    const props = { ...(current.props ?? {}) }
    if (cleared) delete props[key]
    else props[key] = value
    this.put(id, { ...current, props }, options.typing ? `${id}:${key}` : undefined)
  }

  /// The template component `id` (root or a variant).
  node(id: string): SduiNode | undefined {
    if (!this._template) return undefined
    const find = (n: SduiNode): SduiNode | undefined => n.id === id ? n : n.children.map(find).find(Boolean)
    const t = this._template.template
    return find(t.root) ?? (t.variants.compact && find(t.variants.compact)) ?? (t.variants.wide && find(t.variants.wide)) ?? undefined
  }

  /// Whether a maker may fill `key` of component `id` (a content prop of its type).
  editable(id: string, key: string): boolean {
    const n = this.node(id)
    return n !== undefined && isContentProp(n.type, key)
  }

  /// Back to the template defaults for this component.
  reset(id: string): void {
    const next = { ...this._components }
    delete next[id]
    this.mutate({ components: next })
  }

  private put(id: string, value: ComponentValue, typing?: string): void {
    const next = { ...this._components }
    if (Object.keys(value.props ?? {}).length === 0) delete next[id]
    else next[id] = value
    this.mutate({ components: next }, typing)
  }

  /// The value set (needs a template).
  valuesDocument(): ValuesDocument {
    if (!this._template) throw new TypeError('choose a template first')
    return new ValuesDocument(SPEC_VERSION, new ValueSet(this._screen, this._template.template.ref, this._components))
  }

  /// What the client will render: the template composed with these values.
  composed(): ScreenSpec | undefined {
    return this._template ? compose(this._template.template, this.valuesDocument().values) : undefined
  }

  check(validator: SchemaValidator = new SchemaValidator()): void {
    if (!this._template) throw new TypeError('choose a template first')
    const values = this.valuesDocument()
    validator.validateTemplate(this._template)
    validator.validateValues(values, this._template)
    validator.validate(new SduiPayload(values.schemaVersion, compose(this._template.template, values.values)))
  }

  issues(validator?: SchemaValidator): ValidationIssue[] {
    try {
      this.check(validator)
      return []
    } catch (error) {
      return [{ message: error instanceof Error ? error.message : String(error) }]
    }
  }

  /// The validated value set as JSON (sorted keys). Throws on invalid.
  exportJSON(validator?: SchemaValidator): string {
    this.check(validator)
    return sortedJSONStringify(this.valuesDocument().toJSON())
  }

  /// Replace the values with a value set document. Its template must be the chosen one
  /// (else call `setTemplate` with that release first).
  importJSON(data: BytesLike | object): void {
    const raw = typeof data === 'object' && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer) ? data : parseJSON(data as BytesLike)
    const values = ValuesDocument.decode(raw).values
    const t = this._template?.template
    if (t && (t.key !== values.template.key || t.version !== values.template.version)) {
      throw new TypeError(`these values are for ${values.template.key}@${values.template.version}; the chosen template is ${t.key}@${t.version}`)
    }
    if (this._template) new SchemaValidator().validateValues(new ValuesDocument(SPEC_VERSION, values), this._template)
    this._screen = values.screen
    this.mutate({ components: { ...values.components } })
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  undo(): void {
    const previous = this.undoStack.pop()
    if (!previous) return
    this.typing = undefined
    this.redoStack.push({ template: this._template, components: this._components })
    ;({ template: this._template, components: this._components } = previous)
    this.changed()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.typing = undefined
    this.undoStack.push({ template: this._template, components: this._components })
    ;({ template: this._template, components: this._components } = next)
    this.changed()
  }
}
