import { SduiNode, type ActionSpec, type SduiProps } from '../core'

// Pure tree transforms keyed by node id — every editor change is one of these.

const GENERATED = /^n_[0-9a-f]{8}$/

/// A fresh editor id (stripped again on export).
export function newId(): string {
  const bytes = new Uint8Array(4)
  globalThis.crypto.getRandomValues(bytes)
  return `n_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function isGeneratedId(id: string | undefined): boolean {
  return id !== undefined && GENERATED.test(id)
}

export function withChildren(node: SduiNode, children: SduiNode[]): SduiNode {
  return new SduiNode({ id: node.id, type: node.type, props: node.props, children, action: node.action })
}

export function withProps(node: SduiNode, props: SduiProps): SduiNode {
  return new SduiNode({ id: node.id, type: node.type, props, children: node.children, action: node.action })
}

export function withAction(node: SduiNode, action: ActionSpec | undefined): SduiNode {
  return new SduiNode({ id: node.id, type: node.type, props: node.props, children: node.children, action })
}

/// The node with this id, searching self and descendants.
export function find(node: SduiNode, id: string): SduiNode | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = find(child, id)
    if (found) return found
  }
  return undefined
}

/// The parent of the node with this id.
export function parentOf(node: SduiNode, id: string): SduiNode | undefined {
  if (node.children.some((c) => c.id === id)) return node
  for (const child of node.children) {
    const found = parentOf(child, id)
    if (found) return found
  }
  return undefined
}

export function replacing(node: SduiNode, id: string, replacement: SduiNode): SduiNode {
  if (node.id === id) return replacement
  return withChildren(node, node.children.map((c) => replacing(c, id, replacement)))
}

export function removing(node: SduiNode, id: string): SduiNode {
  return withChildren(node, node.children.filter((c) => c.id !== id).map((c) => removing(c, id)))
}

/// A copy with `child` inserted into `parentId` at `index` (default: last).
export function insertingChild(node: SduiNode, child: SduiNode, parentId: string, index?: number): SduiNode {
  if (node.id === parentId) {
    const kids = [...node.children]
    kids.splice(index === undefined ? kids.length : Math.max(0, Math.min(index, kids.length)), 0, child)
    return withChildren(node, kids)
  }
  return withChildren(node, node.children.map((c) => insertingChild(c, child, parentId, index)))
}

/// Swap child `id` with the sibling `delta` positions away (no-op out of range).
export function movingChild(node: SduiNode, id: string, delta: number): SduiNode {
  const index = node.children.findIndex((c) => c.id === id)
  if (index >= 0) {
    const target = index + delta
    if (target < 0 || target >= node.children.length) return node
    const moved = [...node.children]
    ;[moved[index], moved[target]] = [moved[target]!, moved[index]!]
    return withChildren(node, moved)
  }
  return withChildren(node, node.children.map((c) => movingChild(c, id, delta)))
}

/// Every node gets an id: existing ids are kept, missing ones are generated.
export function withEnsuredIds(node: SduiNode): SduiNode {
  return new SduiNode({ id: node.id ?? newId(), type: node.type, props: node.props, children: node.children.map(withEnsuredIds), action: node.action })
}

/// A deep copy with fresh generated ids (duplicate).
export function cloningWithNewIds(node: SduiNode): SduiNode {
  return new SduiNode({ id: newId(), type: node.type, props: node.props, children: node.children.map(cloningWithNewIds), action: node.action })
}

/// Generated editor ids removed (authored ids are kept) — clean exported JSON.
export function strippingGeneratedIds(node: SduiNode): SduiNode {
  return new SduiNode({
    id: isGeneratedId(node.id) ? undefined : node.id, type: node.type, props: node.props,
    children: node.children.map(strippingGeneratedIds), action: node.action
  })
}

/// sdui-r — a template tree: every node keeps its id and gets `order` = its place in the
/// whole layout, numbered depth-first from the root (root 0, its first child 1, that child's
/// first child 2 …) — the reading order of the page. Moving a component renumbers every
/// node after it. Siblings stay in ascending order, so the spec rule (unique among
/// siblings, render by order) holds.
export function withOrders(node: SduiNode): SduiNode {
  let next = 0
  const walk = (n: SduiNode): SduiNode => {
    const order = next++
    return new SduiNode({ id: n.id, order, type: n.type, props: n.props, children: n.children.map(walk), action: n.action })
  }
  return walk(node)
}

/// sdui-r — the `order` each node gets in `withOrders` (depth-first position), by id.
export function ordersOf(root: SduiNode): Map<string, number> {
  const out = new Map<string, number>()
  flatten(root).forEach(([n], i) => { if (n.id !== undefined) out.set(n.id, i) })
  return out
}

/// sdui-r — children sorted by `order` (ties keep array order); `order` dropped (the
/// editor keeps order as array position).
export function sortedByOrder(node: SduiNode): SduiNode {
  const children = node.children.map((child, index) => ({ child, index }))
    .sort((a, b) => (a.child.order ?? a.index) - (b.child.order ?? b.index) || a.index - b.index)
    .map(({ child }) => sortedByOrder(child))
  return new SduiNode({ id: node.id, type: node.type, props: node.props, children, action: node.action })
}

/// sdui-r — a readable component id for a new node of `type` (`text1`, `button2` …),
/// unused in `taken`. Template ids are the keys makers' value sets use.
export function readableId(type: string, taken: ReadonlySet<string>): string {
  const base = (type.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]+/, '') || 'node')
  for (let n = 1; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`
}

/// Every id in the tree.
export function idsOf(node: SduiNode, out = new Set<string>()): Set<string> {
  if (node.id !== undefined) out.add(node.id)
  node.children.forEach((c) => idsOf(c, out))
  return out
}

/// Depth-first list of `[node, depth]` (outline order).
export function flatten(node: SduiNode, depth = 0, out: Array<[SduiNode, number]> = []): Array<[SduiNode, number]> {
  out.push([node, depth])
  for (const child of node.children) flatten(child, depth + 1, out)
  return out
}

/// The outline rows still visible when the nodes in `collapsed` are folded: their children
/// (and deeper) are skipped. `[node, depth]`, depth-first.
export function flattenVisible(node: SduiNode, collapsed: ReadonlySet<string>, depth = 0, out: Array<[SduiNode, number]> = []): Array<[SduiNode, number]> {
  out.push([node, depth])
  if (node.id === undefined || !collapsed.has(node.id)) for (const child of node.children) flattenVisible(child, collapsed, depth + 1, out)
  return out
}

/// The ids of every ancestor of `id` (root first), or `[]` when it is the root or absent.
export function ancestorsOf(root: SduiNode, id: string): string[] {
  const path: string[] = []
  const walk = (n: SduiNode): boolean => {
    if (n.id === id) return true
    for (const child of n.children) {
      if (walk(child)) {
        if (n.id !== undefined) path.unshift(n.id)
        return true
      }
    }
    return false
  }
  return walk(root) ? path : []
}

/// A short label for an outline row.
export function outlineLabel(node: SduiNode): string {
  switch (node.type) {
    case 'text': return `text: ${node.string('value')}`
    case 'button': return `button: ${node.string('title') || (node.string('systemName') ? `(${node.string('systemName')})` : '')}`
    case 'textField':
    case 'textArea':
    case 'picker': return `${node.type}: ${node.string('name')}`
    default: return node.type
  }
}
