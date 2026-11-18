import {
  ActionSpec, ComponentFactory, SchemaValidator, SduiError, SduiNode, SduiPayload, ScreenSpec, SPEC_VERSION,
  TemplateDocument, TemplateSpec, compose, parseJSON, sortedJSONStringify, type BytesLike, type LoadRequest, type SduiProps
} from '../core'
import { fromUniversal } from '../compat'
import {
  cloningWithNewIds, find, idsOf, insertingChild, movingChild, parentOf, readableId, removing, replacing, sortedByOrder,
  strippingGeneratedIds, withAction, withEnsuredIds, withOrders, withProps
} from './tree'
import { DSLExport } from './dsl-export'

export interface ValidationIssue {
  message: string
}

/// `screen`: a resolved screen (sdui). `template` (sdui-r Template Builder): the output is a
/// template — readable component ids (`text1`, `button2`; fixed, never reused), `order` from the
/// position, a release `version` and a palette `title`.
export type EditorMode = 'screen' | 'template'

type Snapshot = { root: SduiNode; load: LoadRequest[]; key: string; version: number; title?: string }

/// The editable screen: a spec node tree where every node has an id, the
/// selection, `screen.load`, and undo history. Views subscribe and call its edit
/// methods; every edit is a pure tree transform.
export class EditorDocument {
  private _key: string
  private _root: SduiNode
  private _load: LoadRequest[]
  private _selection?: string
  private _version: number
  private _title?: string
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  readonly mode: EditorMode
  private readonly listeners = new Set<() => void>()
  /// warnings from the last legacy import (`fromUniversal`)
  importWarnings: string[] = []
  /// template mode: every component id this document has ever held (or was told about with
  /// `reserveIds`) → its type. A generated id never repeats one of them, so a deleted
  /// component's id never comes back on a different component (value sets are keyed by ids).
  private readonly seen = new Map<string, string>()

  constructor(init: { key?: string; root?: SduiNode; load?: LoadRequest[]; factory?: ComponentFactory; mode?: EditorMode; version?: number; title?: string } = {}) {
    this.factory = init.factory ?? ComponentFactory.withBuiltins()
    this.mode = init.mode ?? 'screen'
    this._key = init.key ?? (this.mode === 'template' ? 'template' : 'screen')
    this._version = init.version ?? 1
    this._title = init.title
    this._root = this.ensureIds(init.root ?? new SduiNode({ id: this.mode === 'template' ? 'root' : undefined, type: 'vstack', props: { spacing: 12, alignment: 'leading', padding: 16 } }))
    this.remember(this._root)
    this._load = init.load ?? []
  }

  /// template mode: ids that must never be generated again — those of every released version
  /// of this template (`reserveIds(releasedTemplateJSON)`), or plain ids. A deleted id stays
  /// reserved for the life of the document anyway.
  reserveIds(source: Iterable<string> | object): void {
    if (Symbol.iterator in source) {
      for (const id of source as Iterable<string>) if (!this.seen.has(id)) this.seen.set(id, '')
      return
    }
    this.remember(TemplateDocument.decode(source).template.root)
  }

  /// Ids (with their type) the document has held, and must not hand out again.
  private remember(node: SduiNode): void {
    if (this.mode !== 'template') return
    const walk = (n: SduiNode) => {
      if (n.id !== undefined && !this.seen.get(n.id)) this.seen.set(n.id, n.type)
      n.children.forEach(walk)
    }
    walk(node)
  }

  /// Ids a new component may not take: the current tree's and every id ever seen.
  private reservedIds(): Set<string> {
    const out = new Set(this.seen.keys())
    // the constructor asks before `_root` is set
    const root = this._root as SduiNode | undefined
    return root ? idsOf(root, out) : out
  }

  /// Missing ids: generated (screen) or readable `type<n>` (template), never a reserved one.
  private ensureIds(node: SduiNode): SduiNode {
    if (this.mode !== 'template') return withEnsuredIds(node)
    const used = this.reservedIds()
    idsOf(node, used)
    const walk = (n: SduiNode): SduiNode => {
      let id = n.id
      if (id === undefined) { id = readableId(n.type, used); used.add(id) }
      return new SduiNode({ id, type: n.type, props: n.props, children: n.children.map(walk), action: n.action })
    }
    return walk(node)
  }

  /// Refuses a tree that renames a component: every explicit id must already exist here,
  /// on a component of the same type. (Putting back a deleted component under its own id is
  /// allowed; giving that id to another type is not.)
  private assertIdsKept(next: SduiNode): void {
    const types = new Map(this.seen)
    const collect = (n: SduiNode) => { if (n.id !== undefined) types.set(n.id, n.type); n.children.forEach(collect) }
    collect(this._root)
    const check = (n: SduiNode) => {
      if (n.id !== undefined) {
        const was = types.get(n.id)
        if (was === undefined) throw SduiError.decode(`component id "${n.id}" is new — ids are generated and cannot be changed; leave "id" out for a new component`)
        if (was !== n.type) throw SduiError.decode(`component id "${n.id}" ${was ? `belongs to a ${was}` : 'was used by an earlier release'}; ids cannot be changed or reused`)
      }
      n.children.forEach(check)
    }
    check(next)
  }

  /// A copy with fresh ids (duplicate).
  private freshIds(node: SduiNode): SduiNode {
    if (this.mode !== 'template') return cloningWithNewIds(node)
    const taken = this.reservedIds()
    const walk = (n: SduiNode): SduiNode => {
      const id = readableId(n.type, taken)
      taken.add(id)
      return new SduiNode({ id, type: n.type, props: n.props, children: n.children.map(walk), action: n.action })
    }
    return walk(node)
  }

  readonly factory: ComponentFactory

  get key(): string { return this._key }
  /// template mode: the release version being drafted
  get version(): number { return this._version }
  /// template mode: the palette title makers see
  get title(): string | undefined { return this._title }
  get root(): SduiNode { return this._root }
  get load(): LoadRequest[] { return this._load }
  get selection(): string | undefined { return this._selection }
  get selected(): SduiNode | undefined { return this._selection ? find(this._root, this._selection) : undefined }

  select(id: string | undefined): void {
    if (this._selection === id) return
    this._selection = id
    this.typing = undefined
    this.changed()
  }

  /// the field being typed into (`id:key`): its keystrokes are one undo step
  private typing?: string

  /// End a typing session (the field lost focus): the next edit is a new undo step.
  endTyping(): void { this.typing = undefined }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener()
  }

  private snapshot(): Snapshot { return { root: this._root, load: this._load, key: this._key, version: this._version, title: this._title } }

  private restore(s: Snapshot): void {
    this.remember(this._root)
    this.remember(s.root)
    this._root = s.root
    this._load = s.load
    this._key = s.key
    this._version = s.version
    this._title = s.title
  }

  private mutate(next: Partial<Snapshot>, typing?: string): void {
    const s: Snapshot = { ...this.snapshot(), ...next }
    // a no-op edit must not touch undo/redo history
    if (s.root.equals(this._root) && JSON.stringify(s.load) === JSON.stringify(this._load) && s.key === this._key &&
        s.version === this._version && s.title === this._title) return
    // keystrokes into the same field: one undo step for the whole word / sentence
    if (!(typing !== undefined && typing === this.typing && this.undoStack.length > 0)) this.undoStack.push(this.snapshot())
    this.typing = typing
    this.redoStack = []
    this.restore(s)
    this.changed()
  }

  /// Where a palette insert goes: into the selected container, else beside the
  /// selected node, else the root.
  insertionPoint(): { parentId: string; index?: number } {
    const sel = this.selected
    if (sel && this.factory.info(sel.type)?.acceptsChildren) return { parentId: sel.id! }
    if (sel) {
      const parent = parentOf(this._root, sel.id!)
      if (parent) return { parentId: parent.id!, index: parent.children.findIndex((c) => c.id === sel.id) + 1 }
    }
    return { parentId: this._root.id! }
  }

  /// Insert a new component of `type` (with its palette default props).
  add(type: string, at = this.insertionPoint()): string {
    const info = this.factory.info(type)
    const node = this.ensureIds(new SduiNode({ type, props: { ...(info?.defaultProps ?? {}) } as SduiProps }))
    this.insert(node, at.parentId, at.index)
    this.select(node.id)
    return node.id!
  }

  insert(child: SduiNode, parentId: string, index?: number): void {
    this.mutate({ root: insertingChild(this._root, this.ensureIds(child), parentId, index) })
  }

  /// Can the node with this id hold children (its component `acceptsChildren`)?
  isContainer(id: string): boolean {
    const node = find(this._root, id)
    return !!node && this.factory.info(node.type)?.acceptsChildren === true
  }

  /// Where a drop relative to `targetId` lands: `inside` a container (last
  /// child), or `before`/`after` it among its siblings. `undefined` when the
  /// drop is not possible (e.g. inside a leaf, or beside the root).
  placement(targetId: string, where: 'inside' | 'before' | 'after'): { parentId: string; index?: number } | undefined {
    if (where === 'inside') return this.isContainer(targetId) ? { parentId: targetId } : undefined
    const parent = parentOf(this._root, targetId)
    if (!parent) return undefined
    const index = parent.children.findIndex((c) => c.id === targetId)
    return { parentId: parent.id!, index: where === 'before' ? index : index + 1 }
  }

  /// Containers `id` may move into: every container except the node itself and
  /// its descendants (parent picker).
  parentCandidates(id: string): SduiNode[] {
    const node = find(this._root, id)
    if (!node || id === this._root.id) return []
    const out: SduiNode[] = []
    const walk = (n: SduiNode) => {
      if (n.id === id) return
      if (this.factory.info(n.type)?.acceptsChildren) out.push(n)
      n.children.forEach(walk)
    }
    walk(this._root)
    return out
  }

  /// Move node `id` into container `parentId` at `index` (default: last).
  /// Refuses the root, a non-container parent, and a parent inside the moved
  /// node; returns whether the tree changed.
  reparent(id: string, parentId: string, index?: number): boolean {
    const node = find(this._root, id)
    if (!node || id === this._root.id || !this.isContainer(parentId) || find(node, parentId)) return false
    const from = parentOf(this._root, id)!
    const oldIndex = from.children.findIndex((c) => c.id === id)
    // removing the node first shifts later siblings of the same parent up by one
    const target = index !== undefined && from.id === parentId && oldIndex < index ? index - 1 : index
    const before = this._root
    this.mutate({ root: insertingChild(removing(this._root, id), node, parentId, target) })
    return this._root !== before
  }

  delete(id: string): void {
    if (id === this._root.id) return
    this.mutate({ root: removing(this._root, id) })
    if (this._selection === id) this.select(undefined)
  }

  duplicate(id: string): void {
    const node = find(this._root, id)
    const parent = parentOf(this._root, id)
    if (!node || !parent) return
    const copy = this.freshIds(node)
    this.insert(copy, parent.id!, parent.children.findIndex((c) => c.id === id) + 1)
    this.select(copy.id)
  }

  move(id: string, delta: number): void { this.mutate({ root: movingChild(this._root, id, delta) }) }
  replace(id: string, node: SduiNode): void { this.mutate({ root: replacing(this._root, id, node) }) }

  /// `typing: true` — a keystroke: consecutive ones into the same field are one undo step.
  setProp(id: string, key: string, value: SduiProps[string] | undefined, options: { typing?: boolean } = {}): void {
    const node = find(this._root, id)
    if (!node) return
    const props = { ...node.props }
    if (value === undefined || value === '') delete props[key]
    else props[key] = value
    this.mutate({ root: replacing(this._root, id, withProps(node, props)) }, options.typing ? `${id}:${key}` : undefined)
  }

  setProps(id: string, props: SduiProps): void {
    const node = find(this._root, id)
    if (node) this.replace(id, withProps(node, props))
  }

  setAction(id: string, action: ActionSpec | undefined): void {
    const node = find(this._root, id)
    if (node) this.replace(id, withAction(node, action))
  }

  setKey(key: string): void { this.mutate({ key }) }
  setVersion(version: number): void { if (Number.isInteger(version) && version >= 1) this.mutate({ version }) }
  setTitle(title: string | undefined): void { this.mutate({ title: title || undefined }) }

  /// template mode: component ids are generated once (`text1`, `button2` …) and never change —
  /// value sets are keyed by them. There is no rename; `importJSON(…, { keepIds: true })`
  /// refuses an edit that would introduce or reassign an id.

  /// template mode: the template document (ids kept, `order` = position).
  templateDocument(): TemplateDocument {
    return new TemplateDocument(SPEC_VERSION, new TemplateSpec(this._key, this._version, withOrders(this._root), { title: this._title, load: this._load }))
  }
  setLoad(load: LoadRequest[]): void { this.mutate({ load }) }

  /// The payload (generated ids stripped).
  payload(): SduiPayload {
    return new SduiPayload(SPEC_VERSION, new ScreenSpec(this._key, strippingGeneratedIds(this._root), { load: this._load }))
  }

  /// Validation issues for the current tree (empty = valid).
  issues(validator: SchemaValidator = new SchemaValidator()): ValidationIssue[] {
    try {
      this.check(validator)
      return []
    } catch (error) {
      return [{ message: error instanceof Error ? error.message : String(error) }]
    }
  }

  /// Replace the document with a spec payload — or a legacy UniversalPageConfig,
  /// converted with `fromUniversal` (its warnings land in `importWarnings`).
  ///
  /// `keepIds` (template mode, the live JSON editor): the edit may delete components and add
  /// new ones without an `id` (they get a generated one), but may not give a component an id
  /// the document does not already have, nor move an id to a component of another type.
  importJSON(data: BytesLike | object, options: { keepIds?: boolean } = {}): void {
    const raw = typeof data === 'object' && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer) ? data : parseJSON(data as BytesLike)
    let payload: SduiPayload
    const obj = raw as Record<string, unknown>
    if (obj && typeof obj === 'object' && 'template' in obj && 'schemaVersion' in obj) {
      // a template document: ids kept, children in `order`
      const t = TemplateDocument.decode(raw).template
      if (options.keepIds && this.mode === 'template') this.assertIdsKept(t.root)
      this.undoStack.push(this.snapshot())
      this.redoStack = []
      this.restore({ root: this.ensureIds(sortedByOrder(t.root)), load: t.load, key: t.key, version: t.version, title: t.title })
      this.importWarnings = []
      this._selection = undefined
      this.changed()
      return
    } else if (obj && typeof obj === 'object' && 'screen' in obj) {
      payload = SduiPayload.decode(raw)
      this.importWarnings = []
    } else if (obj && typeof obj === 'object' && ('layout' in obj || 'components' in obj || Array.isArray(raw))) {
      const converted = fromUniversal(raw)
      payload = SduiPayload.decode(converted.payload)
      this.importWarnings = converted.warnings
    } else {
      throw SduiError.decode('not a spec payload or a legacy page')
    }
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    this._key = payload.screen.key
    this._root = this.ensureIds(payload.screen.root)
    this.remember(this._root)
    this._load = payload.screen.load
    this._selection = undefined
    this.changed()
  }

  /// Validate what this editor exports (a template in template mode). Throws on invalid.
  check(validator: SchemaValidator = new SchemaValidator()): void {
    if (this.mode === 'template') {
      const doc = this.templateDocument()
      validator.validateTemplate(doc)
      validator.validate(new SduiPayload(doc.schemaVersion, compose(doc.template)))
    } else {
      validator.validate(this.payload())
    }
  }

  /// The exported document as JSON: a template (template mode) or the payload (generated
  /// ids stripped). Sorted keys; throws on invalid.
  exportJSON(validator: SchemaValidator = new SchemaValidator()): string {
    this.check(validator)
    return sortedJSONStringify(this.mode === 'template' ? this.templateDocument().toJSON() : this.payload())
  }

  /// DSL (TypeScript) source that rebuilds this screen.
  exportDSL(): string {
    return DSLExport.source(this.payload())
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  undo(): void {
    const previous = this.undoStack.pop()
    if (!previous) return
    this.typing = undefined
    this.redoStack.push(this.snapshot())
    this.restore(previous)
    this.changed()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.typing = undefined
    this.undoStack.push(this.snapshot())
    this.restore(next)
    this.changed()
  }
}
