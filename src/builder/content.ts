// sdui-r — the Studio edits a page's design AND its content in one tree, but they are still
// stored, published and signed apart: the template (structure, layout, style, actions) by the
// template service, the value set (the CONTENT props of each component — `isContentProp`) by
// the value service. The template keeps no content: the value set is the only place it lives.
//
// - `mergeContent`: template + value set → the one tree the Studio edits
// - `splitContent`: that tree → a template without content + the value set
import { SduiNode, TemplateDocument, TemplateSpec, ValueSet, ValuesDocument, isContentProp, type ComponentValue, type ScreenVariants, type SduiProps } from '../core'

type Tree = 'root' | 'compact' | 'wide'

const trees = (t: TemplateSpec): Array<[Tree, SduiNode]> =>
  ([['root', t.root], ['compact', t.variants.compact], ['wide', t.variants.wide]] as Array<[Tree, SduiNode | undefined]>)
    .filter((entry): entry is [Tree, SduiNode] => entry[1] !== undefined)

const rebuild = (n: SduiNode, props: SduiProps, children: SduiNode[]): SduiNode =>
  new SduiNode({ id: n.id, order: n.order, type: n.type, props, children, action: n.action })

// root first, then the variants (splitContent: the first tree with an id's content wins)
const withTrees = (t: TemplateSpec, map: (n: SduiNode) => SduiNode): TemplateSpec => {
  const root = map(t.root)
  const variants: ScreenVariants = {}
  if (t.variants.compact) variants.compact = map(t.variants.compact)
  if (t.variants.wide) variants.wide = map(t.variants.wide)
  return new TemplateSpec(t.key, t.version, root, { title: t.title, load: t.load, variants })
}

/// The tree the Studio edits: the value set's content written into the template's components
/// (every tree: root and variants). Content for an id the template no longer has, or a prop
/// that is no longer content of the component's type, is left out and listed in `dropped`
/// (`id` / `id.prop`). Without values the template is the tree as it is.
export function mergeContent(template: TemplateDocument, values?: ValuesDocument | ValueSet | null): { document: TemplateDocument; dropped: string[] } {
  const set = values instanceof ValuesDocument ? values.values : values ?? undefined
  const components = set?.components ?? {}
  const types = new Map<string, string>()
  for (const [, tree] of trees(template.template)) {
    const walk = (n: SduiNode): void => { if (n.id !== undefined && !types.has(n.id)) types.set(n.id, n.type); n.children.forEach(walk) }
    walk(tree)
  }
  const dropped: string[] = []
  for (const [id, value] of Object.entries(components)) {
    const type = types.get(id)
    if (type === undefined) { dropped.push(id); continue }
    for (const key of Object.keys(value.props ?? {})) if (!isContentProp(type, key)) dropped.push(`${id}.${key}`)
  }
  const merge = (n: SduiNode): SduiNode => {
    const own = n.id !== undefined ? components[n.id]?.props : undefined
    const content: SduiProps = {}
    for (const [key, value] of Object.entries(own ?? {})) if (isContentProp(n.type, key)) content[key] = value
    return rebuild(n, { ...n.props, ...content }, n.children.map(merge))
  }
  return { document: new TemplateDocument(template.schemaVersion, withTrees(template.template, merge)), dropped }
}

/// The Studio's tree → what is stored: the template without any content, and the value set
/// for page `screen` (a page IS its template: the key by default) holding each component's
/// content props, for the template version being drafted. A component id that appears in more
/// than one tree (root and a variant) keeps the content of the first tree that has it.
export function splitContent(document: TemplateDocument, screen = document.template.key): { template: TemplateDocument; values: ValuesDocument } {
  const components: Record<string, ComponentValue> = {}
  const strip = (n: SduiNode): SduiNode => {
    const props: SduiProps = {}
    const content: SduiProps = {}
    for (const [key, value] of Object.entries(n.props)) (isContentProp(n.type, key) ? content : props)[key] = value
    if (n.id !== undefined && Object.keys(content).length > 0 && components[n.id] === undefined) components[n.id] = { props: content }
    return rebuild(n, props, n.children.map(strip))
  }
  const t = withTrees(document.template, strip)
  return {
    template: new TemplateDocument(document.schemaVersion, t),
    values: new ValuesDocument(document.schemaVersion, new ValueSet(screen, t.ref, components))
  }
}
