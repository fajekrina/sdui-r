// sdui-r 2.6 — a PAGE is a template plus what the page sets on its components. The template
// decides which components there are (type, id, children, order); the page may set any prop
// (content, style, layout …) and replace an action. What is stored is only what DIFFERS from
// the template, so a template change still reaches every prop a page left alone.
//
// - `mergePage`: template + page values → the one tree the Studio's Konten tab edits
// - `splitPage`: that tree → the page's value set (the differences), checked to keep the
//   template's structure
// - `placeholders`: sample texts still in the tree (`[Insight Title]`) — warned on publish
import {
  ActionSpec, BUILDER_NOTE_PROP, SPEC_VERSION, SduiError, SduiNode, TemplateDocument, TemplateSpec, ValueSet, ValuesDocument,
  isOverridableProp, type ComponentValue, type ScreenVariants, type SduiProps, type SduiValue
} from '../core'

type Tree = 'root' | 'compact' | 'wide'

const treesOf = (t: TemplateSpec): Array<[Tree, SduiNode]> =>
  ([['root', t.root], ['compact', t.variants.compact], ['wide', t.variants.wide]] as Array<[Tree, SduiNode | undefined]>)
    .filter((entry): entry is [Tree, SduiNode] => entry[1] !== undefined)

const rebuild = (n: SduiNode, props: SduiProps, action: ActionSpec | undefined, children: SduiNode[]): SduiNode =>
  new SduiNode({ id: n.id, order: n.order, type: n.type, props, children, action })

const mapTrees = (t: TemplateSpec, map: (n: SduiNode) => SduiNode): TemplateSpec => {
  const root = map(t.root)
  const variants: ScreenVariants = {}
  if (t.variants.compact) variants.compact = map(t.variants.compact)
  if (t.variants.wide) variants.wide = map(t.variants.wide)
  return new TemplateSpec(t.key, t.version, root, { title: t.title, load: t.load, variants, state: t.state })
}

/// id → node (the first tree that has the id wins: root, then the variants)
function nodesById(t: TemplateSpec): Map<string, SduiNode> {
  const out = new Map<string, SduiNode>()
  for (const [, tree] of treesOf(t)) {
    const walk = (n: SduiNode): void => { if (n.id !== undefined && !out.has(n.id)) out.set(n.id, n); n.children.forEach(walk) }
    walk(tree)
  }
  return out
}

const canonical = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

/// The tree the Konten tab edits: the page's props merged over the template's (every tree),
/// its actions in place of the template's. What the template no longer has (an id, a prop the
/// version may not set) is left out and listed in `dropped` (`id` / `id.prop`).
export function mergePage(template: TemplateDocument, values?: ValuesDocument | ValueSet | null): { document: TemplateDocument; dropped: string[] } {
  const set = values instanceof ValuesDocument ? values.values : values ?? undefined
  const version = values instanceof ValuesDocument ? values.schemaVersion : SPEC_VERSION
  const components = set?.components ?? {}
  const nodes = nodesById(template.template)
  const dropped: string[] = []
  for (const [id, value] of Object.entries(components)) {
    const node = nodes.get(id)
    if (node === undefined) { dropped.push(id); continue }
    for (const key of Object.keys(value.props ?? {})) if (!isOverridableProp(node.type, key, version)) dropped.push(`${id}.${key}`)
  }
  const merge = (n: SduiNode): SduiNode => {
    const own: ComponentValue | undefined = n.id !== undefined ? components[n.id] : undefined
    const props: SduiProps = { ...n.props }
    for (const [key, value] of Object.entries(own?.props ?? {})) {
      if (!isOverridableProp(n.type, key, version)) continue
      // a page removes a template prop with null
      if (value === null) delete props[key]
      else props[key] = value
    }
    return rebuild(n, props, own?.action ?? n.action, n.children.map(merge))
  }
  return { document: new TemplateDocument(template.schemaVersion, mapTrees(template.template, merge)), dropped }
}

/// Whether `edited` keeps the structure of `template`: every tree it has (the editor holds the
/// root) is the template's, with the same ids, types and children in the same order. Throws a schema error naming the first change.
export function assertSameStructure(edited: TemplateSpec, template: TemplateSpec): void {
  // the editor holds the root (a template's variants keep theirs; a page's values reach them by id)
  const b = new Map(treesOf(template))
  const walk = (x: SduiNode, y: SduiNode, path: string): void => {
    if (x.id !== y.id || x.type !== y.type) throw SduiError.schema(`${path}: ${x.type} #${x.id ?? '?'} is not the template's ${y.type} #${y.id ?? '?'} — a page cannot change components`)
    const xs = x.children.map((c) => c.id).join()
    const ys = y.children.map((c) => c.id).join()
    if (xs !== ys) throw SduiError.schema(`${path} (#${x.id}): a page cannot add, remove or move components — the template decides them`)
    x.children.forEach((c, i) => walk(c, y.children[i]!, `${path}.${c.id}`))
  }
  for (const [tree, node] of treesOf(edited)) {
    const base = b.get(tree)
    if (!base) throw SduiError.schema(`a page cannot add the ${tree} layout — the template decides it`)
    walk(sortedChildren(node), sortedChildren(base), tree)
  }
}

const sortedChildren = (n: SduiNode): SduiNode => new SduiNode({
  id: n.id, order: n.order, type: n.type, props: n.props, action: n.action,
  children: n.children.map((c, i) => ({ c, i })).sort((p, q) => (p.c.order ?? p.i) - (q.c.order ?? q.i) || p.i - q.i).map(({ c }) => sortedChildren(c))
})

/// The Konten tab's tree → page `screen`'s value set: per component, the props that differ from
/// the template (a prop the template has and the page removed → `null`) and an action that
/// differs. The structure must be the template's (`assertSameStructure`). The builder note is
/// template-only and never stored.
export function splitPage(edited: TemplateDocument, template: TemplateDocument, screen: string): ValuesDocument {
  assertSameStructure(edited.template, template.template)
  const base = nodesById(template.template)
  const components: Record<string, ComponentValue> = {}
  const seen = new Set<string>()
  for (const [, tree] of treesOf(edited.template)) {
    const walk = (n: SduiNode): void => {
      n.children.forEach(walk)
      if (n.id === undefined || seen.has(n.id)) return
      seen.add(n.id)
      const t = base.get(n.id)!
      const props: Record<string, SduiValue> = {}
      for (const [key, value] of Object.entries(n.props)) {
        if (key === BUILDER_NOTE_PROP) continue
        if (!same(value, t.props[key])) props[key] = value
      }
      for (const key of Object.keys(t.props)) if (key !== BUILDER_NOTE_PROP && !(key in n.props)) props[key] = null
      const value: ComponentValue = {}
      if (Object.keys(props).length > 0) value.props = props
      if (n.action && !(t.action && n.action.equals(t.action))) value.action = n.action
      if (value.props || value.action) components[n.id] = value
    }
    walk(tree)
  }
  const ref = template.template.ref
  return new ValuesDocument(SPEC_VERSION, new ValueSet(screen, ref, components))
}

const PLACEHOLDER = /^\s*\[[^\[\]]+\]\s*$/

/// Sample texts still in a tree: string props (and string fields of list items / options)
/// that are WHOLLY in brackets, e.g. `[Insight Title]` — `id.prop` per hit, in tree order.
export function placeholders(tree: SduiNode): string[] {
  const out: string[] = []
  const check = (where: string, v: unknown): boolean => {
    if (typeof v === 'string') return PLACEHOLDER.test(v)
    if (Array.isArray(v)) return v.some((x) => check(where, x))
    if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).some((x) => check(where, x))
    return false
  }
  const walk = (n: SduiNode): void => {
    for (const [key, value] of Object.entries(n.props)) {
      if (key === BUILDER_NOTE_PROP) continue
      if (check(key, value)) out.push(`${n.id ?? n.type}.${key}`)
    }
    n.children.forEach(walk)
  }
  walk(tree)
  return out
}
