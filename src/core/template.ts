// sdui-r — a screen is a TEMPLATE (structure + behavior, reusable across screens and
// merchants) plus a VALUE SET (content per component, per merchant screen). The two are
// stored, reviewed, published and signed separately; the client composes them here.
import { SduiError } from './errors'
import { SduiNode } from './node'
import { SduiValue, type SduiProps } from './value'
import { ActionSpec } from './actions/spec'
import { chartSource } from './components/chart'
import { BUILDER_NOTE_PROP } from '../spec'
import { ScreenSpec, type LoadRequest, type ScreenState, type ScreenVariants, parseJSON } from './payload'
import type { BytesLike } from './bytes'

const asObject = (raw: unknown, path: string): Record<string, unknown> => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw SduiError.decode(`${path}: expected an object`)
  return raw as Record<string, unknown>
}
const requireString = (o: Record<string, unknown>, key: string, path: string): string => {
  if (typeof o[key] !== 'string') throw SduiError.decode(`${path}.${key}: required string is missing`)
  return o[key] as string
}
const requireVersion = (o: Record<string, unknown>, key: string, path: string): number => {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw SduiError.decode(`${path}.${key}: expected a positive integer`)
  return v
}

/// Which template release a value set was written for.
export interface TemplateRef {
  readonly key: string
  readonly version: number
}

/// A template: the layout of one screen. Every node carries an `id` (the value set's key)
/// and an `order` (its position among siblings); `props` are the defaults.
export class TemplateSpec {
  readonly title?: string
  readonly load: LoadRequest[]
  readonly variants: ScreenVariants
  /// v2.3 — the declared screen state
  readonly state: ScreenState

  constructor(
    readonly key: string,
    readonly version: number,
    readonly root: SduiNode,
    extra: { title?: string; load?: LoadRequest[]; variants?: ScreenVariants; state?: ScreenState } = {}
  ) {
    if (extra.title !== undefined) this.title = extra.title
    this.load = extra.load ?? []
    this.variants = extra.variants ?? {}
    this.state = extra.state ?? {}
  }

  get ref(): TemplateRef { return { key: this.key, version: this.version } }

  static decode(raw: unknown, path = 'template'): TemplateSpec {
    const o = asObject(raw, path)
    const version = requireVersion(o, 'version', path)
    if (o.title != null && typeof o.title !== 'string') throw SduiError.decode(`${path}.title: expected a string`)
    // load / state / variants / root decode exactly like a screen
    const shape = ScreenSpec.decode({ key: o.key, root: o.root, load: o.load, variants: o.variants, state: o.state }, path)
    return new TemplateSpec(shape.key, version, shape.root, { title: (o.title as string | null) ?? undefined, load: shape.load, variants: shape.variants, state: shape.state })
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { key: this.key, version: this.version }
    if (this.title !== undefined) out.title = this.title
    const shape = new ScreenSpec(this.key, this.root, { load: this.load, variants: this.variants, state: this.state }).toJSON()
    delete shape.key
    return { ...out, ...shape }
  }

  /// Every node id in `root` and the variants.
  ids(): Set<string> {
    const out = new Set<string>()
    const walk = (n: SduiNode) => { if (n.id !== undefined) out.add(n.id); n.children.forEach(walk) }
    walk(this.root)
    if (this.variants.compact) walk(this.variants.compact)
    if (this.variants.wide) walk(this.variants.wide)
    return out
  }
}

/// `{ schemaVersion, template }` — what the template service signs and delivers.
export class TemplateDocument {
  constructor(readonly schemaVersion: string, readonly template: TemplateSpec) {}

  static decode(raw: unknown): TemplateDocument {
    const o = asObject(raw, 'templateDoc')
    if (o.template === undefined) throw SduiError.decode('templateDoc.template: required object is missing')
    return new TemplateDocument(requireString(o, 'schemaVersion', 'templateDoc'), TemplateSpec.decode(o.template))
  }

  static fromJSON(bytes: BytesLike): TemplateDocument { return TemplateDocument.decode(parseJSON(bytes)) }

  toJSON() { return { schemaVersion: this.schemaVersion, template: this.template.toJSON() } }
}

/// The content of one template component: content props merged over the template's
/// defaults (shallow). Style, layout and the action belong to the template
/// (`isContentProp` says which props a value set may fill).
export interface ComponentValue {
  props?: SduiProps
}

/// The content of one merchant screen, for one template release.
export class ValueSet {
  constructor(
    readonly screen: string,
    readonly template: TemplateRef,
    readonly components: Readonly<Record<string, ComponentValue>> = {}
  ) {}

  static decode(raw: unknown, path = 'values'): ValueSet {
    const o = asObject(raw, path)
    const t = asObject(o.template, `${path}.template`)
    const ref = { key: requireString(t, 'key', `${path}.template`), version: requireVersion(t, 'version', `${path}.template`) }
    const components: Record<string, ComponentValue> = {}
    if (o.components != null) {
      for (const [id, entry] of Object.entries(asObject(o.components, `${path}.components`))) {
        const e = asObject(entry, `${path}.components.${id}`)
        const value: ComponentValue = {}
        if (e.action !== undefined) throw SduiError.schema(`${path}.components.${id}.action: the action is decided by the template`)
        if (e.props != null) value.props = SduiValue.decodeObject(e.props, `${path}.components.${id}.props`)
        components[id] = value
      }
    }
    return new ValueSet(requireString(o, 'screen', path), ref, components)
  }

  toJSON(): Record<string, unknown> {
    const components: Record<string, unknown> = {}
    for (const id of Object.keys(this.components).sort()) {
      const v = this.components[id]!
      const out: Record<string, unknown> = {}
      if (v.props && Object.keys(v.props).length > 0) out.props = v.props
      components[id] = out
    }
    return { screen: this.screen, template: { key: this.template.key, version: this.template.version }, components }
  }
}

/// `{ schemaVersion, values }` — what the value service signs and delivers.
export class ValuesDocument {
  constructor(readonly schemaVersion: string, readonly values: ValueSet) {}

  static decode(raw: unknown): ValuesDocument {
    const o = asObject(raw, 'templateDoc')
    if (o.values === undefined) throw SduiError.decode('valuesDoc.values: required object is missing')
    return new ValuesDocument(requireString(o, 'schemaVersion', 'templateDoc'), ValueSet.decode(o.values))
  }

  static fromJSON(bytes: BytesLike): ValuesDocument { return ValuesDocument.decode(parseJSON(bytes)) }

  toJSON() { return { schemaVersion: this.schemaVersion, values: this.values.toJSON() } }
}

/// The transport/cache unit: a template and a value set, each a signed envelope (or, in
/// development, a plain doc). Both signatures are verified every time it is used.
export interface ScreenBundle {
  template: unknown
  values?: unknown
}

/// A parsed JSON value is a bundle when it has `template` but no `schemaVersion`
/// (a template doc has both).
export function isScreenBundle(raw: unknown): raw is ScreenBundle {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'template' in raw && !('schemaVersion' in raw)
}

/// The bundle bytes, built by concatenation so each part's bytes stay exactly as served.
export function bundleBytes(templateJSON: string, valuesJSON?: string): string {
  return valuesJSON === undefined ? `{"template":${templateJSON}}` : `{"template":${templateJSON},"values":${valuesJSON}}`
}

/// Compose a template and its value set into the screen the renderers draw: children
/// sorted by `order` (ties keep array order), props = template defaults + values
/// (shallow), action = the template's. The screen key is the value
/// set's screen (a template is reusable), or the template key for a bare preview.
/// A chart's data source (its `api` action) joins `screen.load` (once), so the summary is fetched with the screen.
///
/// Structural checks (ids, orders, value ids, template ref) are the validator's —
/// call `SchemaValidator.validateTemplate` / `validateValues` first.
export function compose(template: TemplateSpec, values?: ValueSet): ScreenSpec {
  const components = values?.components ?? {}
  const build = (n: SduiNode): SduiNode => {
    const v = n.id !== undefined ? components[n.id] : undefined
    const children = n.children
      .map((child, index) => ({ child, index }))
      .sort((a, b) => (a.child.order ?? a.index) - (b.child.order ?? b.index) || a.index - b.index)
      .map(({ child }) => build(child))
    let props = v?.props ? { ...n.props, ...v.props } : n.props
    // the author's note for makers is template-only: it never reaches a client
    if (props[BUILDER_NOTE_PROP] !== undefined) { props = { ...props }; delete props[BUILDER_NOTE_PROP] }
    return new SduiNode({
      id: n.id,
      type: n.type,
      props,
      children,
      action: n.action,
      skippedAction: n.skippedAction
    })
  }
  const variants: ScreenVariants = {}
  if (template.variants.compact) variants.compact = build(template.variants.compact)
  if (template.variants.wide) variants.wide = build(template.variants.wide)
  const root = build(template.root)
  const load: LoadRequest[] = [...template.load]
  const walk = (n: SduiNode): void => {
    const source = chartSource(n)
    if (source && !load.some((l) => l.request === source.request)) load.push(source)
    n.children.forEach(walk)
  }
  ;[root, variants.compact, variants.wide].forEach((n) => n && walk(n))
  return new ScreenSpec(values?.screen ?? template.key, root, { load, variants, state: template.state })
}
