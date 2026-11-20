import type { Component } from '../component-factory'
import type { RenderContext } from '../render-context'
import type { SduiNode } from '../node'
import { SduiValue } from '../value'
import { cleanAttrs, renderNode, type RenderNode } from '../render-node'
import { color, fontWeight, numberProp, sharedStyle, textStyle, typography } from '../style'
import { Symbols } from './symbols'
import type { FieldRule } from '../patterns'
import { ChartComponent } from './chart'
import { parseMarkup } from '../markup'

export { ChartComponent }

// The built-in set — v1 (murti): text, image, vstack, hstack, zstack, button,
// card; v1.1: spacer, divider, grid, scroll, list, form, textField, textArea,
// picker. Each is one small class producing a RenderNode: the template
// third-party components follow.

const DEFAULT_SPACING = 8

/// Accessibility props → attributes: `a11yLabel` → aria-label (tokens resolved),
/// `a11yId` → data-testid, `a11yTraits` → role.
function a11y(node: SduiNode, ctx: RenderContext): Record<string, string> {
  const attrs: Record<string, string> = {}
  const label = node.string('a11yLabel')
  if (label) attrs['aria-label'] = ctx.resolve(label)
  const id = node.string('a11yId')
  if (id) attrs['data-testid'] = id
  for (const trait of node.array('a11yTraits')) {
    if (trait === 'button') attrs.role = 'button'
    if (trait === 'header') { attrs.role = 'heading'; attrs['aria-level'] = '2' }
    if (trait === 'image') attrs.role = 'img'
    if (trait === 'link') attrs.role = 'link'
  }
  return attrs
}

const spacing = (node: SduiNode) => numberProp(node, 'spacing') ?? DEFAULT_SPACING
const px = (n: number) => `${n}px`

/// spec 2.5 — a text, an image or a card with an `action` runs it when tapped: it renders
/// as a native `<button>` (keyboard and screen readers for free) that looks the same — the
/// reset below, then the view's own style. `disabledWhen` and a running action dim it like
/// a button. A card holding a control (a button, a field, another tappable) keeps its
/// action unused: a button inside a button is not allowed.
const TAP_RESET: Record<string, string> = { font: 'inherit', color: 'inherit', background: 'none', border: '0', padding: '0', margin: '0', textAlign: 'start', appearance: 'none' }
const CONTROLS = new Set(['button', 'textField', 'textArea', 'picker', 'form'])

export function holdsControl(node: SduiNode): boolean {
  return node.children.some((c) => CONTROLS.has(c.type) || (c.action !== undefined && c.type !== 'chart') || (c.type === 'chart' && c.string('selectState') !== '') || holdsControl(c))
}

function tappable(node: SduiNode, ctx: RenderContext, view: RenderNode): RenderNode {
  if (!node.action || (node.type === 'card' && holdsControl(node))) return view
  const busy = ctx.busy(node)
  const off = ctx.disabled(node)
  return {
    ...view,
    element: 'button',
    attrs: cleanAttrs({ type: 'button', disabled: busy || off, 'aria-busy': busy ? 'true' : undefined, ...view.attrs }),
    style: { ...TAP_RESET, ...view.style, cursor: busy ? 'progress' : off ? 'default' : 'pointer', ...(busy || off ? { opacity: '0.6' } : {}) },
    on: off ? undefined : ctx.onClick(node, node.action)
  }
}

/// The size of a bounded container (vstack, card, grid): `height` (fixed) and/or
/// `maxHeight`, in px. A bounded container clips what does not fit — scrolling is always
/// an explicit `scroll` inside it, which then fills the space left. `minHeight: 0` lets the
/// container shrink inside a bounded parent so a nested `scroll` gets that bound too.
function bounds(node: SduiNode): Record<string, string> {
  const out: Record<string, string> = { minHeight: '0' }
  const height = numberProp(node, 'height')
  const maxHeight = numberProp(node, 'maxHeight')
  if (height !== undefined && height > 0) out.height = px(height)
  if (maxHeight !== undefined && maxHeight > 0) out.maxHeight = px(maxHeight)
  if (out.height || out.maxHeight) {
    out.overflow = 'hidden'
    // the size is the whole visible box (padding included) — the same in the builder
    // canvas (border-box) and in any host page (content-box by default)
    out.boxSizing = 'border-box'
  }
  return out
}

function container(node: SduiNode, ctx: RenderContext, style: Record<string, string>, children: RenderNode[]): RenderNode {
  return renderNode(ctx.keyFor(node), 'div', {
    type: node.type,
    attrs: a11y(node, ctx),
    style: { ...style, ...sharedStyle(node) },
    children
  })
}

// MARK: - text

/// spec 2.3 — what a masked text shows
const MASK = '••••••'

/// spec 2.1 — `align` of a text: leading · center · trailing
const TEXT_ALIGN: Record<string, string> = { leading: 'start', center: 'center', trailing: 'end' }

export class TextComponent implements Component {
  static readonly type = 'text'
  static readonly category = 'content'
  static readonly defaultProps = { value: 'Text' }
  static readonly action = 'tap'
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    return tappable(node, ctx, this.view(node, ctx))
  }
  private view(node: SduiNode, ctx: RenderContext): RenderNode {
    const template = node.string('value')
    const base = textStyle(node.string('style'))
    const size = numberProp(node, 'size') ?? base.size
    const weight = fontWeight(node.string('weight')) ?? base.weight
    const style: Record<string, string> = {
      display: 'block', margin: '0', whiteSpace: 'pre-wrap',
      fontSize: px(size), fontWeight: String(weight), lineHeight: '1.3',
      // spec 2.3 — font (a name), transform, letterSpacing, lineHeight
      ...typography(node)
    }
    const c = color(node.string('color'))
    if (c) style.color = c
    const align = TEXT_ALIGN[node.string('align')]
    if (align) style.textAlign = align
    // spec 2.3 — `maskedWhen`: the value never reaches the view (nor an a11y label built from it)
    if (ctx.masked(node)) {
      return renderNode(ctx.keyFor(node), 'span', { type: node.type, attrs: { 'data-sdui-masked': 'true' }, style: { ...style, ...sharedStyle(node) }, text: MASK })
    }
    // a text always shows in full: every line of its value, line breaks kept (pre-wrap), never cut
    if (ctx.pending(template)) {
      // a `screen.load` result this text needs hasn't arrived yet → skeleton
      return renderNode(ctx.keyFor(node), 'span', {
        type: node.type,
        attrs: { 'aria-busy': 'true', ...a11y(node, ctx) },
        style: { ...style, ...sharedStyle(node), minWidth: '6em', minHeight: `${size * 1.3}px`, background: 'rgba(120,120,128,0.16)', borderRadius: '4px' }
      })
    }
    const key = ctx.keyFor(node)
    // spec 2.1 — `markup: true`: **bold** / *italic* runs, parsed before the tokens resolve
    const runs = node.bool('markup') && template.includes('*') ? parseMarkup(template) : undefined
    if (runs && runs.some((r) => r.bold || r.italic)) {
      return renderNode(key, 'span', {
        type: node.type,
        attrs: a11y(node, ctx),
        style: { ...style, ...sharedStyle(node) },
        children: runs.map((r, i) => renderNode(`${key}:${i}`, 'span', {
          style: { ...(r.bold ? { fontWeight: '700' } : {}), ...(r.italic ? { fontStyle: 'italic' } : {}) },
          text: ctx.resolve(r.text)
        }))
      })
    }
    return renderNode(key, 'span', {
      type: node.type,
      attrs: a11y(node, ctx),
      style: { ...style, ...sharedStyle(node) },
      text: ctx.resolve(runs ? runs.map((r) => r.text).join('') : template)
    })
  }
}

// MARK: - image

export class ImageComponent implements Component {
  static readonly type = 'image'
  static readonly category = 'content'
  /// a new image is an empty FRAME the maker fills (upload / link / drop); `systemName`
  /// makes it an icon instead
  static readonly defaultProps = { height: 160 }
  static readonly action = 'tap'
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const view = this.view(node, ctx)
    if (!node.action) return view
    // spec 2.5 — tappable. An icon or an empty frame becomes the button itself (a frame's
    // `role: img` would hide the button); a picture goes INSIDE one that takes its box
    if (view.element !== 'img') {
      const { role: _role, ...attrs } = view.attrs
      return tappable(node, ctx, { ...view, attrs })
    }
    const { objectFit, ...box } = view.style
    const { src, alt, loading, ...attrs } = view.attrs
    return tappable(node, ctx, renderNode(view.key, 'button', {
      type: node.type,
      attrs,
      style: { display: 'block', overflow: 'hidden', ...box },
      children: [renderNode(`${view.key}:img`, 'img', { attrs: cleanAttrs({ src, alt, loading }), style: { display: 'block', width: '100%', height: '100%', objectFit: objectFit! } })]
    }))
  }
  private view(node: SduiNode, ctx: RenderContext): RenderNode {
    // `name` renders an app-resolved asset (a maker's picture wins over the template's
    // icon); `systemName` renders a symbol glyph; neither → an empty frame. A raw URL is
    // never taken from the payload.
    const key = ctx.keyFor(node)
    const width = numberProp(node, 'width')
    const height = numberProp(node, 'height')
    const name = node.string('name')
    const src = name ? ctx.env.assetURL(name) : ''
    const systemName = node.string('systemName')
    if (!src && systemName) {
      return renderNode(key, 'span', {
        type: node.type,
        attrs: a11y(node, ctx),
        style: { display: 'inline-flex', ...sharedStyle(node) },
        children: [Symbols.node(`${key}:symbol`, systemName)]
      })
    }
    const label = node.string('a11yLabel')
    // full width by default. In a flex column, `width: 100%` makes WebKit size the picture's
    // height from the column's border box (padding included); stretching gives the same box
    const box: Record<string, string> = width === undefined && ctx.layout === 'column'
      ? { display: 'block', width: 'auto', maxWidth: '100%', alignSelf: 'stretch', height: height !== undefined ? px(height) : 'auto' }
      : { display: 'block', width: width !== undefined ? px(width) : '100%', height: height !== undefined ? px(height) : 'auto' }
    if (!src) {
      return renderNode(key, 'span', {
        type: node.type,
        attrs: cleanAttrs({ role: 'img', 'aria-label': label ? ctx.resolve(label) : 'image', 'data-sdui-frame': name ? 'missing' : 'empty', ...a11y(node, ctx) }),
        style: { ...box, minHeight: '48px', background: color('surface')!, ...sharedStyle(node) }
      })
    }
    return renderNode(key, 'img', {
      type: node.type,
      attrs: cleanAttrs({ src, alt: label ? ctx.resolve(label) : '', loading: 'lazy', ...a11y(node, ctx) }),
      style: { ...box, objectFit: node.string('contentMode') === 'fill' ? 'cover' : 'contain', ...sharedStyle(node) }
    })
  }
}

// MARK: - stacks

/// spec 2.2 — `fill`: children take the full width
const H_ALIGN: Record<string, string> = { leading: 'flex-start', center: 'center', trailing: 'flex-end', fill: 'stretch' }

/// spec 2.2 — a negative vstack `spacing` overlaps: each child is pulled up over the one
/// before it by that much (and drawn above it).
function overlapped(children: RenderNode[], gap: number): RenderNode[] {
  return children.map((c, i) => ({
    ...c,
    style: { position: 'relative', ...c.style, ...(i > 0 ? { marginTop: px(gap) } : {}) }
  }))
}
const V_ALIGN: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' }

export class VStackComponent implements Component {
  static readonly type = 'vstack'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  static readonly defaultProps = { spacing: 8 }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const gap = spacing(node)
    return container(node, ctx, {
      display: 'flex', flexDirection: 'column',
      alignItems: H_ALIGN[node.string('alignment')] ?? 'center', gap: px(Math.max(0, gap)),
      ...bounds(node)
    }, gap < 0 ? overlapped(ctx.children(node), gap) : ctx.children(node))
  }
}

export class HStackComponent implements Component {
  static readonly type = 'hstack'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  static readonly defaultProps = { spacing: 8 }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    return container(node, ctx, {
      display: 'flex', flexDirection: 'row',
      alignItems: V_ALIGN[node.string('alignment')] ?? 'center', gap: px(spacing(node))
    }, ctx.children(node))
  }
}

/// Overlays children. With a `width`/`height` (the source frame's size) and
/// `x`/`y`/`width`/`height` on each child, children are placed proportionally
/// (percentages of the frame) and the frame keeps its aspect ratio at any width.
/// Without a frame size it's a plain centered overlay.
export class ZStackComponent implements Component {
  static readonly type = 'zstack'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const width = numberProp(node, 'width') ?? 0
    const height = numberProp(node, 'height') ?? 0
    if (!(width > 0 && height > 0)) {
      const kids = ctx.children(node).map((k) => ({ ...k, style: { ...k.style, gridArea: '1 / 1' } }))
      return container(node, ctx, { display: 'grid', placeItems: 'center' }, kids)
    }
    const slots: RenderNode[] = []
    node.children.forEach((child, i) => {
      const view = ctx.child(i).view(child)
      if (!view) return
      const box = childBox(child, width, height)
      const pct = (v: number, of: number) => `${(v / of) * 100}%`
      slots.push(renderNode(`${view.key}:slot`, 'div', {
        style: {
          position: 'absolute', left: pct(box.x, width), top: pct(box.y, height),
          width: pct(box.width, width), height: pct(box.height, height),
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        },
        children: [view]
      }))
    })
    return container(node, ctx, { position: 'relative', width: '100%', aspectRatio: `${width} / ${height}`, overflow: 'hidden' }, slots)
  }
}

/// The absolute box of a `zstack` child, defaulting to the whole frame.
export function childBox(node: SduiNode, frameWidth: number, frameHeight: number) {
  return {
    x: numberProp(node, 'x') ?? 0,
    y: numberProp(node, 'y') ?? 0,
    width: numberProp(node, 'width') ?? frameWidth,
    height: numberProp(node, 'height') ?? frameHeight
  }
}

// MARK: - button

const BUTTON_VARIANTS: Record<string, Record<string, string>> = {
  primary: { background: color('primary')!, color: color('onPrimary')!, border: 'none', padding: '10px 16px', borderRadius: '10px', fontWeight: '600' },
  secondary: { background: color('surface')!, color: color('onSurface')!, border: `1px solid ${color('border')}`, padding: '10px 16px', borderRadius: '10px', fontWeight: '600' },
  plain: { background: 'transparent', color: color('primary')!, border: 'none', padding: '0' }
}

export class ButtonComponent implements Component {
  static readonly type = 'button'
  static readonly category = 'action'
  static readonly action = 'tap'
  static readonly defaultProps = { title: 'Button' }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const variant = BUTTON_VARIANTS[node.string('variant')] ?? BUTTON_VARIANTS.plain!
    const busy = ctx.busy(node)
    // spec 2.3 — `disabledWhen`: no handler, dimmed like a busy button
    const off = ctx.disabled(node)
    const key = ctx.keyFor(node)
    // spec 2.2 — a choice: `group` + `value`; the selected button wears its `selected*` colors.
    // spec 2.3 — `toggle`: the tap flips that state between "on" and ""; "on" reads as selected
    const group = node.string('group')
    const toggle = node.string('toggle')
    const select = group ? { group, value: node.string('value') || key } : toggle ? { group: toggle, value: 'on', toggle: true } : undefined
    const selected = select !== undefined && ctx.selected(select.group) === select.value
    const pick = (name: string) => (selected && color(node.string(`selected${name[0]!.toUpperCase()}${name.slice(1)}`))) || color(node.string(name))
    const style: Record<string, string> = { font: 'inherit', fontSize: '16px', cursor: busy ? 'progress' : off ? 'default' : 'pointer', opacity: busy || off ? '0.6' : '1', textAlign: 'center', ...variant, ...sharedStyle(node) }
    const size = numberProp(node, 'size')
    if (size !== undefined && size > 0) style.fontSize = px(size)
    const weight = fontWeight(node.string('weight'))
    if (weight) style.fontWeight = String(weight)
    if (selected) {
      const bg = color(node.string('selectedBackground'))
      const fg = color(node.string('selectedForeground'))
      if (bg) style.background = bg
      if (fg) style.color = fg
    }
    const title = ctx.resolve(node.string('title'))
    // spec 2.2 — an icon (`systemName`) before the title, or above it (`iconPosition: top`);
    // `iconBackground` puts it in a circle: `iconSize` (default 20) + `iconPadding` (default 0.6 × size) around it;
    // spec 2.5 — `iconCornerRadius` (px) makes it a rounded square instead (0: square)
    const symbol = node.string('systemName')
    let children: RenderNode[] | undefined
    if (symbol) {
      const iconSize = numberProp(node, 'iconSize') ?? 20
      const iconStyle: Record<string, string> = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: px(iconSize), lineHeight: '1' }
      const iconBg = pick('iconBackground')
      const iconRadius = numberProp(node, 'iconCornerRadius')
      if (iconBg) Object.assign(iconStyle, { background: iconBg, borderRadius: iconRadius !== undefined && iconRadius >= 0 ? px(iconRadius) : '50%', padding: px(numberProp(node, 'iconPadding') ?? Math.round(iconSize * 0.6)) })
      const iconFg = pick('iconForeground')
      if (iconFg) iconStyle.color = iconFg
      const top = node.string('iconPosition') === 'top'
      Object.assign(style, { display: 'inline-flex', flexDirection: top ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: px(top ? 8 : 6) })
      children = [renderNode(`${key}:icon`, 'span', { style: iconStyle, attrs: { 'aria-hidden': 'true' }, children: [Symbols.node(`${key}:symbol`, symbol, 1)] })]
      if (title) children.push(renderNode(`${key}:title`, 'span', { text: title }))
    }
    return renderNode(key, 'button', {
      type: node.type,
      attrs: cleanAttrs({ type: 'button', disabled: busy || off, 'aria-busy': busy ? 'true' : undefined, 'aria-pressed': select ? String(selected) : undefined, ...a11y(node, ctx) }),
      style,
      ...(children ? { children } : { text: title }),
      on: off ? undefined : ctx.onClick(node, node.action, select)
    })
  }
}

// MARK: - card

export class CardComponent implements Component {
  static readonly type = 'card'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  static readonly action = 'tap'
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    // A grey rounded box is the default; `background`, `cornerRadius`, `padding`,
    // and `foreground` override it. spec 2.5 — with an action the box is the button
    return tappable(node, ctx, renderNode(ctx.keyFor(node), 'div', {
      type: node.type,
      attrs: a11y(node, ctx),
      style: {
        // spec 2.2 — `alignment` (leading default · center · trailing · fill) and `spacing`
        display: 'flex', flexDirection: 'column', alignItems: H_ALIGN[node.string('alignment')] ?? 'flex-start',
        gap: px(Math.max(0, numberProp(node, 'spacing') ?? DEFAULT_SPACING)),
        ...bounds(node),
        ...sharedStyle(node, { padding: 16, background: 'surface', cornerRadius: 12 })
      },
      children: ctx.children(node)
    }))
  }
}

// MARK: - v1.1 layout

export class SpacerComponent implements Component {
  static readonly type = 'spacer'
  static readonly category = 'layout'
  static readonly defaultProps = { height: 16 }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const height = numberProp(node, 'height')
    const width = numberProp(node, 'width')
    return renderNode(ctx.keyFor(node), 'div', {
      type: node.type,
      attrs: { 'aria-hidden': 'true' },
      style: height === undefined && width === undefined
        ? { flex: '1 1 0' }
        : { flex: '0 0 auto', height: px(height ?? 0), width: px(width ?? 0) }
    })
  }
}

export class DividerComponent implements Component {
  static readonly type = 'divider'
  static readonly category = 'layout'
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    return renderNode(ctx.keyFor(node), 'hr', {
      type: node.type,
      style: { alignSelf: 'stretch', border: 'none', borderTop: `1px solid ${color('border')}`, margin: '0', width: '100%' }
    })
  }
}

export class GridComponent implements Component {
  static readonly type = 'grid'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  static readonly defaultProps = { columns: 2, spacing: 8 }
  /// `rowHeight` (px): every row that tall; a cell clips what does not fit, and a `scroll`
  /// placed in a cell scrolls within it. `height` / `maxHeight` bound the whole grid.
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const columns = Math.min(12, Math.max(1, Math.trunc(numberProp(node, 'columns') ?? 2)))
    const rowHeight = numberProp(node, 'rowHeight')
    const rows: Record<string, string> = rowHeight !== undefined && rowHeight > 0 ? { gridAutoRows: px(rowHeight) } : {}
    let children = ctx.children(node)
    if (rows.gridAutoRows) {
      children = children.map((c) => ({ ...c, style: { ...c.style, minHeight: '0', ...(c.type === 'scroll' ? {} : { overflow: 'hidden' }) } }))
    }
    return container(node, ctx, {
      display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: px(spacing(node)), alignSelf: 'stretch',
      ...rows, ...bounds(node)
    }, children)
  }
}

export class ScrollComponent implements Component {
  static readonly type = 'scroll'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  /// The container decides the size, `scroll` the behavior: a vertical scroll fills the
  /// space its bounded container (`vstack` / `card` / `grid` with `height` / `maxHeight`,
  /// or a `grid` cell with `rowHeight`) leaves, and scrolls what does not fit. Its children
  /// keep their own height (they never shrink to fit), which is what makes it scroll.
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const horizontal = node.string('axis') === 'horizontal'
    const children = ctx.children(node).map((c) => ({ ...c, style: { ...c.style, flexShrink: '0' } }))
    return container(node, ctx, horizontal
      ? { display: 'flex', flexDirection: 'row', gap: px(spacing(node)), overflowX: 'auto', alignSelf: 'stretch' }
      : { display: 'flex', flexDirection: 'column', overflowY: 'auto', alignSelf: 'stretch', maxHeight: '100%', flex: '1 1 auto', minHeight: '0' },
    children)
  }
}

/// Repeats its children (the row template) once per item of the array at the
/// `items` key path; each row sees its item as `{{<as>.*}}` (default `item`).
export class ListComponent implements Component {
  static readonly type = 'list'
  static readonly category = 'layout'
  static readonly acceptsChildren = true
  static readonly defaultProps = { items: 'items', as: 'item' }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    // `items`: a data key path to an array — or, v2.6, the array itself (a page fills its rows)
    const raw = node.props.items
    const items = Array.isArray(raw) ? raw : SduiValue.arrayValue(ctx.data.value(node.string('items'))) ?? []
    const as = node.string('as') || 'item'
    const rows = items.map((item, i) => {
      // each row keys its components apart (`<list>:r<i>:<id>`): their handlers and state differ
      const rowCtx = ctx.child(`r${i}`, { [as]: item }, undefined, 'column', `${ctx.keyFor(node)}:r${i}`)
      return renderNode(`${ctx.keyFor(node)}:row${i}`, 'li', {
        style: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: px(DEFAULT_SPACING) },
        children: rowCtx.children(node)
      })
    })
    return renderNode(ctx.keyFor(node), 'ul', {
      type: node.type,
      attrs: a11y(node, ctx),
      style: { margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: px(spacing(node)), alignSelf: 'stretch', ...sharedStyle(node) },
      children: rows
    })
  }
}

// MARK: - v1.1 forms

/// Opens the `form.*` data scope: its fields write there, and buttons inside it
/// validate the fields before their action runs.
export class FormComponent implements Component {
  static readonly type = 'form'
  static readonly category = 'form'
  static readonly acceptsChildren = true
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const formId = node.id ?? `form${ctx.path}`
    const values = ctx.ui.forms[formId]?.values ?? {}
    return renderNode(ctx.keyFor(node), 'form', {
      type: node.type,
      attrs: { novalidate: true, 'data-sdui-form': formId, ...a11y(node, ctx) },
      style: { display: 'flex', flexDirection: 'column', gap: px(spacing(node)), alignSelf: 'stretch', ...sharedStyle(node) },
      preventDefault: true,
      children: ctx.children(node, { form: values }, formId)
    })
  }
}

const INPUT_MODE: Record<string, { type: string; inputmode?: string; autocomplete?: string }> = {
  text: { type: 'text' },
  number: { type: 'text', inputmode: 'decimal' },
  email: { type: 'email', inputmode: 'email', autocomplete: 'email' },
  phone: { type: 'tel', inputmode: 'tel', autocomplete: 'tel' }
}

function fieldRule(node: SduiNode): FieldRule {
  return {
    name: node.string('name'),
    label: node.string('label') || undefined,
    required: node.bool('required'),
    minLength: numberProp(node, 'minLength'),
    maxLength: numberProp(node, 'maxLength'),
    pattern: node.string('pattern') || undefined
  }
}

/// Form controls get explicit metrics (height, line-height, no native
/// appearance) so Android WebView (Chromium) and WKWebView (WebKit) lay them out
/// identically — their intrinsic select/textarea sizes differ.
const FIELD_LINE = 22
const FIELD_STYLE: Record<string, string> = {
  display: 'block', width: '100%', boxSizing: 'border-box', margin: '0', font: 'inherit', fontSize: '16px',
  lineHeight: `${FIELD_LINE}px`, height: `${FIELD_LINE + 22}px`,
  padding: '10px 12px', border: `1px solid ${color('border')}`, borderRadius: '8px',
  background: color('background')!, color: color('onSurface')!, appearance: 'none'
}
/// the select's chevron, drawn with two gradients: no image, so a strict `img-src` allows it
const CHEVRON_INK = 'var(--sdui-color-muted, #6B7280)'
const CHEVRON = {
  backgroundImage: `linear-gradient(45deg, transparent 50%, ${CHEVRON_INK} 50%), linear-gradient(135deg, ${CHEVRON_INK} 50%, transparent 50%)`,
  backgroundPosition: 'calc(100% - 18px) 50%, calc(100% - 13px) 50%',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat'
}

function field(node: SduiNode, ctx: RenderContext, control: (attrs: Record<string, string | number | boolean>, value: string) => RenderNode): RenderNode {
  const key = ctx.keyFor(node)
  const rule = fieldRule(node)
  const formId = ctx.formId ?? `form${ctx.path}`
  if (rule.name) ctx.env.sink.registerField(formId, rule)
  const form = ctx.ui.forms[formId]
  const value = form?.values[rule.name] ?? ''
  const error = ctx.interactive ? form?.errors[rule.name] : undefined
  const attrs = cleanAttrs({
    name: rule.name, required: rule.required, minlength: rule.minLength, maxlength: rule.maxLength,
    placeholder: node.string('placeholder') ? ctx.resolve(node.string('placeholder')) : undefined,
    disabled: !ctx.interactive || ctx.disabled(node), 'aria-invalid': error ? 'true' : undefined, ...a11y(node, ctx)
  })
  const input = control(attrs, value)
  if (ctx.interactive && rule.name) input.field = { formId, name: rule.name }
  const label = rule.label ? ctx.resolve(rule.label) : rule.name
  const children: RenderNode[] = [
    renderNode(`${key}:label`, 'span', {
      style: { display: 'block', fontSize: '13px', marginBottom: '4px', color: color('muted')! },
      text: rule.required ? `${label} *` : label
    }),
    input
  ]
  if (error) children.push(renderNode(`${key}:error`, 'span', { attrs: { role: 'alert' }, style: { display: 'block', fontSize: '12px', marginTop: '4px', color: color('danger')! }, text: error }))
  return renderNode(key, 'label', { type: node.type, style: { display: 'block', alignSelf: 'stretch', ...sharedStyle(node) }, children })
}

export class TextFieldComponent implements Component {
  static readonly type = 'textField'
  static readonly category = 'form'
  static readonly defaultProps = { name: 'field', label: 'Field' }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const secure = node.bool('secure')
    const mode = INPUT_MODE[node.string('keyboard')] ?? INPUT_MODE.text!
    return field(node, ctx, (attrs, value) => renderNode(`${ctx.keyFor(node)}:control`, 'input', {
      attrs: cleanAttrs({
        ...attrs,
        type: secure ? 'password' : mode.type,
        inputmode: mode.inputmode,
        autocomplete: secure ? 'off' : mode.autocomplete,
        'data-sdui-secure': secure ? 'true' : undefined,
        value: ctx.interactive ? value : undefined
      }),
      style: FIELD_STYLE
    }))
  }
}

const rows = (node: SduiNode) => Math.min(20, Math.max(1, Math.trunc(numberProp(node, 'rows') ?? 3)))

export class TextAreaComponent implements Component {
  static readonly type = 'textArea'
  static readonly category = 'form'
  static readonly defaultProps = { name: 'notes', label: 'Notes', rows: 3 }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    return field(node, ctx, (attrs, value) => renderNode(`${ctx.keyFor(node)}:control`, 'textarea', {
      attrs: cleanAttrs({ ...attrs, rows: rows(node), value: ctx.interactive ? value : undefined }),
      style: { ...FIELD_STYLE, height: `${rows(node) * FIELD_LINE + 22}px`, resize: 'vertical' }
    }))
  }
}

export class PickerComponent implements Component {
  static readonly type = 'picker'
  static readonly category = 'form'
  static readonly defaultProps = { name: 'choice', label: 'Choice', options: [] }
  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const key = ctx.keyFor(node)
    const options = node.array('options').map((o, i) => {
      const value = typeof o === 'string' ? o : String(SduiValue.objectValue(o)?.value ?? '')
      const label = typeof o === 'string' ? o : String(SduiValue.objectValue(o)?.label ?? value)
      return renderNode(`${key}:opt${i}`, 'option', { attrs: { value }, text: ctx.resolve(label) })
    })
    return field(node, ctx, (attrs, value) => renderNode(`${key}:control`, 'select', {
      attrs: cleanAttrs({ ...attrs, value: ctx.interactive ? value : undefined }),
      style: { ...FIELD_STYLE, paddingRight: '32px', ...CHEVRON },
      children: [renderNode(`${key}:opt`, 'option', { attrs: { value: '' }, text: node.string('placeholder') || 'Select…' }), ...options]
    }))
  }
}

export const BUILTIN_COMPONENTS = [
  VStackComponent, HStackComponent, ZStackComponent, CardComponent, GridComponent, ScrollComponent, ListComponent,
  SpacerComponent, DividerComponent,
  TextComponent, ImageComponent,
  FormComponent, TextFieldComponent, TextAreaComponent, PickerComponent,
  ButtonComponent,
  ChartComponent   // sdui-r
]
