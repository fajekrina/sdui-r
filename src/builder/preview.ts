import { DataContext, RenderContext, relativeAssetURL, type ComponentFactory, type RenderNode, type SduiNode, type SduiValue } from '../core'

/// Render a node tree for the builder canvas with the SAME components the client
/// uses (preview == client), non-interactive, every node tagged with
/// `data-sdui-node` so a click on the canvas can select it.
/// spec 2.3 — `data` may hold simulated state (`$selected`, `$request`); a component hidden by
/// it is not drawn, except the `selected` one (dimmed, `data-sdui-hidden`), so it stays editable.
export function renderPreview(factory: ComponentFactory, root: SduiNode, options: { data?: Record<string, SduiValue>; selected?: string; assetURL?: (name: string) => string } = {}): RenderNode | null {
  const ctx = new RenderContext(new DataContext(options.data ?? {}), {
    factory,
    ui: { toasts: [], forms: {} },
    interactive: false,
    debug: true,
    loading: false,
    assetURL: options.assetURL ?? relativeAssetURL,
    slots: new Set(),
    sink: { bindAction: (key) => key, registerField: () => {}, unknownComponent: () => {} },
    reveal: (key) => key === options.selected
  })
  const view = ctx.view(root)
  if (!view) return null
  const ids = new Set<string>()
  const collect = (n: SduiNode) => { if (n.id) ids.add(n.id); n.children.forEach(collect) }
  collect(root)
  const tag = (n: RenderNode): RenderNode => {
    const own = ids.has(n.key)
    return {
      ...n,
      attrs: own ? { ...n.attrs, 'data-sdui-node': n.key } : n.attrs,
      style: own && n.key === options.selected ? { ...n.style, outline: '2px solid #2563EB', outlineOffset: '2px' } : n.style,
      children: n.children.map(tag)
    }
  }
  return tag(view)
}

/// Bounded containers on the rendered canvas that clip their content (`height` / `maxHeight`
/// on vstack/card/grid, or a grid cell under `rowHeight`) — a hint to put a `scroll` inside.
/// Measures the real layout, so call it after the canvas is in the document.
export function clippedContainers(canvas: HTMLElement, root: SduiNode): string[] {
  const nodes = new Map<string, SduiNode>()
  const collect = (n: SduiNode) => { if (n.id) nodes.set(n.id, n); n.children.forEach(collect) }
  collect(root)
  const positive = (n: SduiNode, key: string) => { const v = n.props[key]; return typeof v === 'number' && v > 0 ? v : undefined }
  const out: string[] = []
  for (const element of canvas.querySelectorAll<HTMLElement>('[data-sdui-node]')) {
    const node = nodes.get(element.getAttribute('data-sdui-node')!)
    if (!node) continue
    const bound = positive(node, 'height') ?? positive(node, 'maxHeight')
    if (bound !== undefined && ['vstack', 'card', 'grid'].includes(node.type) && element.scrollHeight > element.clientHeight + 1) {
      out.push(`${node.type} #${node.id}: content is taller than its ${positive(node, 'height') ? 'height' : 'maxHeight'} (${bound}px) and is clipped — put a scroll inside`)
    }
    const row = node.type === 'grid' ? positive(node, 'rowHeight') : undefined
    if (row !== undefined) {
      const cells = [...element.children].filter((c) => (c as HTMLElement).scrollHeight > (c as HTMLElement).clientHeight + 1 && getComputedStyle(c).overflowY !== 'auto')
      if (cells.length) out.push(`grid #${node.id}: ${cells.length} cell${cells.length === 1 ? ' is' : 's are'} taller than rowHeight (${row}px) and clipped — put a scroll in the cell`)
    }
  }
  return out
}

/// 0-based line range of the node with this id inside pretty-printed JSON text —
/// the object that directly holds `"id": "<id>"`. Tolerant (string/escape aware,
/// no JSON.parse), so it also works on temporarily invalid text.
export function findNodeJsonRange(text: string, id: string | undefined): { startLine: number; endLine: number } | null {
  if (!id || !text) return null
  const stack: number[] = []
  let pendingKey: string | null = null
  let found = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      let j = i + 1
      let value = ''
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') { value += text[j + 1] ?? ''; j += 2; continue }
        value += text[j]; j++
      }
      let k = j + 1
      while (k < text.length && /\s/.test(text[k]!)) k++
      if (text[k] === ':') pendingKey = value
      else {
        if (found < 0 && pendingKey === 'id' && value === id && stack.length > 0) found = stack[stack.length - 1]!
        pendingKey = null
      }
      i = j
      continue
    }
    if (ch === '{') { stack.push(i); pendingKey = null; continue }
    if (ch === '[') { stack.push(-1); pendingKey = null; continue }
    if (ch === '}' || ch === ']') {
      const open = stack.pop()
      if (found >= 0 && open === found) {
        const lineOf = (pos: number) => text.slice(0, pos).split('\n').length - 1
        return { startLine: lineOf(found), endLine: lineOf(i) }
      }
      pendingKey = null
      continue
    }
    if (ch === ',') pendingKey = null
  }
  return null
}

/// sdui-r — 0-based line range of `values.components.<id>` inside pretty-printed value-set
/// JSON (the object a component's values live in). Tolerant like `findNodeJsonRange`.
export function findValueJsonRange(text: string, id: string | undefined): { startLine: number; endLine: number } | null {
  if (!id || !text) return null
  const keys: Array<string | null> = []   // the key each open object / array was the value of
  const opens: number[] = []
  let pendingKey: string | null = null
  let found = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      let j = i + 1
      let value = ''
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') { value += text[j + 1] ?? ''; j += 2; continue }
        value += text[j]; j++
      }
      let k = j + 1
      while (k < text.length && /\s/.test(text[k]!)) k++
      pendingKey = text[k] === ':' ? value : null
      i = j
      continue
    }
    if (ch === '{' || ch === '[') {
      if (found < 0 && ch === '{' && pendingKey === id && keys[keys.length - 1] === 'components') found = i
      keys.push(pendingKey)
      opens.push(i)
      pendingKey = null
      continue
    }
    if (ch === '}' || ch === ']') {
      keys.pop()
      const open = opens.pop()
      if (found >= 0 && open === found) {
        const lineOf = (pos: number) => text.slice(0, pos).split('\n').length - 1
        return { startLine: lineOf(found), endLine: lineOf(i) }
      }
      pendingKey = null
      continue
    }
    if (ch === ',') pendingKey = null
  }
  return null
}
