import type { Component } from '../component-factory'
import type { RenderContext } from '../render-context'
import type { SduiNode } from '../node'
import { SduiValue, type SduiProps } from '../value'
import { renderNode, type RenderNode } from '../render-node'
import { color, numberProp, sharedStyle } from '../style'
import { parseMarkup } from '../markup'

// sdui-r — the built-in `chart`: bar, line, area, pie and donut, drawn as SVG `path`s
// (the only shapes the RenderNode vocabulary has), so every renderer draws the same
// chart under a strict CSP. Labels, values and the legend are plain HTML text.
//
// props
//   kind        bar | line | area | pie | donut                       (default bar)
// action       the DATA SOURCE: an `api` action names the request (e.g. `salesSummary`, with
//               its params); the composer adds it to `screen.load` and its response — a DATA
//               SUMMARY `{ items: [{ key, label, value }] }`, or the array itself — is drawn.
//               No action: the chart draws its static `data`. (A chart is never tappable.)
//   data        static: [12, 30, …] or [{ key?, label, value, color? }, …] — or a key path into
//               the screen data (`"sales.items"` / `"{{sales.items}}"`)
//   labels      [string]  labels for a plain number array ({{tokens}} allowed)
//   keyKey / labelKey / valueKey   the mapping of an item's fields (default key / label / value)
//   color       bar/line/area color: a theme token or hex (default `primary`)
//   height      px (default 160; pie/donut: the diameter)
//   min / max   value axis bounds (default: from the data, always including 0)
//   showLabels  bool — each item's label (default true)
//   showKeys    bool — each item's key
//   showValues  bool — each item's value (above the bar/point, or in the legend)
//   showLegend  bool — pie/donut legend (default true)
//   a11yLabel   the chart's accessible name (default: a generated summary)
//   v2.4 (bar), v2.5 (every kind): selectState (a tapped bar / point / slice writes $selected.<state> = its
//   item key), initialSelection (last · first · none · a key), selectedColor, tip ({{item.x}} of the picked
//   item, markup). line / area mark the point; pie / donut pull the slice out.

type Kind = 'bar' | 'line' | 'area' | 'pie' | 'donut'
interface Point { key: string; label: string; value: number; color?: string; item: Record<string, SduiValue> }

const KINDS: readonly Kind[] = ['bar', 'line', 'area', 'pie', 'donut']
/// slice colors, in order, for pie/donut (theme tokens, so a host theme restyles them)
const PALETTE = ['primary', 'success', 'warning', 'danger', 'secondary', 'muted']
const VIEW = 100
const num = (n: number) => String(Math.round(n * 100) / 100)

/// A chart's data source: the request of its `api` action (none: static `data`).
export function chartSource(node: SduiNode): { request: string; params?: SduiProps } | undefined {
  const action = node.type === 'chart' ? node.action : undefined
  if (action?.type !== 'api' || !action.request || !/^[A-Za-z][A-Za-z0-9_]*$/.test(action.request)) return undefined
  return action.params ? { request: action.request, params: action.params } : { request: action.request }
}

function points(node: SduiNode, ctx: RenderContext): { points: Point[]; path?: string } {
  const raw = node.value('data')
  const source = chartSource(node)?.request
  let path: string | undefined
  let items: SduiValue[] | undefined
  if (source) {
    // a data summary: `{ items: [...] }`, or the array itself
    path = source
    const v = ctx.data.value(source)
    items = SduiValue.arrayValue(v) ?? SduiValue.arrayValue(SduiValue.objectValue(v)?.items)
  } else if (typeof raw === 'string') {
    path = raw.replace(/^\{\{\s*|\s*\}\}$/g, '')
    items = SduiValue.arrayValue(ctx.data.value(path))
  } else {
    items = SduiValue.arrayValue(raw)
  }
  const labels = node.array('labels')
  const labelKey = node.string('labelKey') || 'label'
  const valueKey = node.string('valueKey') || 'value'
  const keyKey = node.string('keyKey') || 'key'
  const out: Point[] = []
  ;(items ?? []).forEach((item, i) => {
    const obj = SduiValue.objectValue(item)
    const value = obj ? SduiValue.doubleValue(obj[valueKey]) : SduiValue.doubleValue(item)
    if (value === undefined || !Number.isFinite(value)) return
    const label = obj ? SduiValue.displayString(obj[labelKey] ?? '') : SduiValue.displayString(labels[i] ?? '')
    const c = obj ? SduiValue.stringValue(obj.color) : undefined
    const k = obj ? SduiValue.displayString(obj[keyKey] ?? '') : ''
    out.push({ key: k, label: ctx.resolve(label), value, ...(c ? { color: c } : {}), item: obj ?? { label: ctx.resolve(label), value } })
  })
  return { points: out, path }
}

const label = (key: string, text: string, style: Record<string, string> = {}): RenderNode =>
  renderNode(key, 'span', {
    text,
    style: { flex: '1 1 0', minWidth: '0', textAlign: 'center', fontSize: '11px', lineHeight: '1.3', color: 'var(--sdui-color-muted, #6B7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }
  })

const format = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

export class ChartComponent implements Component {
  static readonly type = 'chart'
  /// its `api` action names the data source; it is never run on a tap
  static readonly action = 'source'
  static readonly category = 'content'
  static readonly defaultProps = { kind: 'bar', data: [3, 5, 2, 6], labels: ['Q1', 'Q2', 'Q3', 'Q4'], height: 160 }

  /// which parts of each item the drawing shows (the checkboxes of the builders)
  static shows(node: SduiNode) {
    return {
      labels: node.value('showLabels') !== false,
      keys: node.bool('showKeys'),
      values: node.bool('showValues'),
      legend: node.value('showLegend') !== false
    }
  }

  makeView(node: SduiNode, ctx: RenderContext): RenderNode {
    const key = ctx.keyFor(node)
    const kind = (KINDS as readonly string[]).includes(node.string('kind')) ? node.string('kind') as Kind : 'bar'
    const height = Math.max(40, Math.min(800, numberProp(node, 'height') ?? 160))
    const { points: data, path } = points(node, ctx)
    const base = { display: 'flex', flexDirection: 'column', gap: '4px', alignSelf: 'stretch', ...sharedStyle(node) }
    const named = node.string('a11yLabel')
    const summary = named ? ctx.resolve(named) : `${kind} chart: ${data.map((p) => `${p.label || '•'} ${format(p.value)}`).join(', ')}`

    if (path && ctx.pending(`{{${path}}}`)) {
      // the `screen.load` result the chart reads hasn't arrived yet → skeleton
      return renderNode(key, 'div', {
        type: node.type,
        attrs: { 'aria-busy': 'true' },
        style: { ...base, minHeight: `${height}px`, background: 'rgba(120,120,128,0.16)', borderRadius: '8px' }
      })
    }
    if (data.length === 0) {
      return renderNode(key, 'div', {
        type: node.type,
        attrs: { role: 'img', 'aria-label': named ? summary : 'chart: no data' },
        style: { ...base, minHeight: `${height}px`, alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--sdui-color-border, #D1D5DB)', borderRadius: '8px' },
        children: [label(`${key}:empty`, 'No data', { flex: '0 0 auto' })]
      })
    }
    // v2.4 — pickable bars are buttons inside: the chart is then a labelled group, not an image
    const pickable = IDENT.test(node.string('selectState')) && ctx.interactive
    const attrs = { role: pickable ? 'group' : 'img', 'aria-label': summary }
    return renderNode(key, 'div', {
      type: node.type,
      attrs,
      style: base,
      children: kind === 'pie' || kind === 'donut' ? this.round(key, node, data, kind, height, ctx) : this.axes(key, node, data, kind, height, ctx)
    })
  }

  /// bar / line / area: a stretched 100×100 view; strokes keep their width.
  private axes(key: string, node: SduiNode, data: Point[], kind: Kind, height: number, ctx: RenderContext): RenderNode[] {
    const values = data.map((p) => p.value)
    const lo = Math.min(0, numberProp(node, 'min') ?? Math.min(...values))
    const hiRaw = Math.max(0, numberProp(node, 'max') ?? Math.max(...values))
    const hi = hiRaw === lo ? lo + 1 : hiRaw
    const y = (v: number) => VIEW - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (VIEW - 4)
    const slot = VIEW / data.length
    const fill = color(node.string('color')) ?? color('primary')!
    const pick = picking(node, ctx, key, data)
    const shapes: RenderNode[] = []
    if (kind === 'bar') {
      data.forEach((p, i) => {
        const x = i * slot + slot * 0.15
        const w = slot * 0.7
        const top = Math.min(y(p.value), y(0))
        const bottom = Math.max(y(p.value), y(0))
        shapes.push(renderNode(`${key}:bar${i}`, 'path', {
          attrs: { d: `M${num(x)} ${num(bottom)}V${num(top)}H${num(x + w)}V${num(bottom)}Z`, 'data-index': i },
          style: { fill: (i === pick?.shown && pick.color) || (p.color ? color(p.color) ?? fill : fill) }
        }))
      })
    } else {
      const xs = data.map((_, i) => i * slot + slot / 2)
      const line = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(xs[i]!)} ${num(y(p.value))}`).join('')
      if (kind === 'area') {
        shapes.push(renderNode(`${key}:area`, 'path', {
          attrs: { d: `${line}L${num(xs[xs.length - 1]!)} ${num(y(0))}L${num(xs[0]!)} ${num(y(0))}Z` },
          style: { fill, fillOpacity: '0.18', stroke: 'none' }
        }))
      }
      shapes.push(renderNode(`${key}:line`, 'path', {
        attrs: { d: line, 'vector-effect': 'non-scaling-stroke' },
        style: { fill: 'none', stroke: fill, strokeWidth: '2', strokeLinejoin: 'round', strokeLinecap: 'round' }
      }))
    }
    // the zero line, when the data goes below it
    if (lo < 0) {
      shapes.push(renderNode(`${key}:zero`, 'path', {
        attrs: { d: `M0 ${num(y(0))}H${VIEW}`, 'vector-effect': 'non-scaling-stroke' },
        style: { fill: 'none', stroke: 'var(--sdui-color-border, #D1D5DB)', strokeWidth: '1' }
      }))
    }
    const out: RenderNode[] = []
    const show = ChartComponent.shows(node)
    if (show.values) {
      out.push(renderNode(`${key}:values`, 'div', {
        style: { display: 'flex' },
        children: data.map((p, i) => label(`${key}:v${i}`, format(p.value), { color: 'var(--sdui-color-onSurface, #111827)', fontWeight: '600' }))
      }))
    }
    const svg = renderNode(`${key}:svg`, 'svg', {
      attrs: { viewBox: `0 0 ${VIEW} ${VIEW}`, preserveAspectRatio: 'none', width: '100%', height: String(height), 'aria-hidden': 'true' },
      style: { display: 'block', overflow: 'visible' },
      children: shapes
    })
    out.push(pick ? plot(key, node, ctx, data, pick, svg, slot, y, kind, fill) : svg)
    if (show.labels && data.some((p) => p.label)) {
      out.push(renderNode(`${key}:labels`, 'div', { style: { display: 'flex' }, children: data.map((p, i) => label(`${key}:l${i}`, p.label)) }))
    }
    if (show.keys && data.some((p) => p.key)) {
      out.push(renderNode(`${key}:keys`, 'div', { style: { display: 'flex' }, children: data.map((p, i) => label(`${key}:k${i}`, p.key, { fontFamily: 'ui-monospace, monospace', fontSize: '10px' })) }))
    }
    return out
  }

  /// pie / donut: slices clockwise from 12 o'clock, a legend beside them.
  private round(key: string, node: SduiNode, data: Point[], kind: Kind, size: number, ctx: RenderContext): RenderNode[] {
    const slices = data.filter((p) => p.value > 0)
    const pick = picking(node, ctx, key, slices)
    const mids: number[] = []
    const total = slices.reduce((s, p) => s + p.value, 0)
    const r = 48
    const inner = kind === 'donut' ? 28 : 0
    const at = (a: number, radius: number) => [50 + radius * Math.sin(a), 50 - radius * Math.cos(a)] as const
    let angle = 0
    const shapes = slices.map((p, i) => {
      const sweep = (p.value / total) * Math.PI * 2
      const fill = (p.color ? color(p.color) : undefined) ?? color(PALETTE[i % PALETTE.length]!)!
      let d: string
      if (slices.length === 1) {
        // a full circle (an arc cannot end where it starts): two halves
        d = `M50 ${50 - r}A${r} ${r} 0 1 1 50 ${50 + r}A${r} ${r} 0 1 1 50 ${50 - r}Z` +
          (inner ? `M50 ${50 - inner}A${inner} ${inner} 0 1 0 50 ${50 + inner}A${inner} ${inner} 0 1 0 50 ${50 - inner}Z` : '')
      } else {
        const large = sweep > Math.PI ? 1 : 0
        const [x1, y1] = at(angle, r)
        const [x2, y2] = at(angle + sweep, r)
        if (inner) {
          const [x3, y3] = at(angle + sweep, inner)
          const [x4, y4] = at(angle, inner)
          d = `M${num(x1)} ${num(y1)}A${r} ${r} 0 ${large} 1 ${num(x2)} ${num(y2)}L${num(x3)} ${num(y3)}A${inner} ${inner} 0 ${large} 0 ${num(x4)} ${num(y4)}Z`
        } else {
          d = `M50 50L${num(x1)} ${num(y1)}A${r} ${r} 0 ${large} 1 ${num(x2)} ${num(y2)}Z`
        }
      }
      mids.push(angle + sweep / 2)
      angle += sweep
      // v2.5 — the picked slice is pulled out 4 along its middle (an attribute: no CSS, strict CSP holds)
      const picked = i === pick?.shown && slices.length > 1
      const out: Record<string, string> = picked ? { transform: `translate(${num(4 * Math.sin(mids[i]!))} ${num(-4 * Math.cos(mids[i]!))})` } : {}
      return renderNode(`${key}:slice${i}`, 'path', {
        attrs: { d, 'fill-rule': 'evenodd', 'data-index': i, 'vector-effect': 'non-scaling-stroke', ...out },
        // a thin line in the background color between slices: same-colored slices stay apart
        style: { fill: (i === pick?.shown && pick.color) || fill, stroke: 'var(--sdui-color-background, #FFFFFF)', strokeWidth: '1.5', ...(pick?.state && ctx.interactive ? { cursor: 'pointer' } : {}) },
        on: pick?.state && ctx.interactive ? pickOn(key, ctx, pick, p, i) : undefined
      })
    })
    let svg = renderNode(`${key}:svg`, 'svg', {
      attrs: { viewBox: '0 0 100 100', width: String(size), height: String(size), 'aria-hidden': 'true' },
      // a picked slice is pulled out past the view box: let it show
      style: { display: 'block', flex: '0 0 auto', overflow: 'visible' },
      children: shapes
    })
    const show = ChartComponent.shows(node)
    const pickable = !!pick?.state && ctx.interactive
    if (pick) svg = disc(key, node, ctx, slices, pick, svg, size, mids)
    const legend = !show.legend ? [] : [renderNode(`${key}:legend`, 'ul', {
      style: { margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0' },
      children: slices.map((p, i) => legendItem(key, ctx, pick, p, i, pickable, [
          renderNode(`${key}:swatch${i}`, 'span', { style: { width: '10px', height: '10px', borderRadius: '2px', flex: '0 0 auto', background: (i === pick?.shown && pick.color) || ((p.color ? color(p.color) : undefined) ?? color(PALETTE[i % PALETTE.length]!)!) } }),
          ...(show.labels || !p.key ? [renderNode(`${key}:name${i}`, 'span', { text: p.label || '•', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } })] : []),
          ...(show.keys && p.key ? [renderNode(`${key}:key${i}`, 'span', { text: p.key, style: { fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: 'var(--sdui-color-muted, #6B7280)' } })] : []),
          ...(show.values ? [renderNode(`${key}:pct${i}`, 'span', { text: `${format(p.value)} · ${Math.round((p.value / total) * 100)}%`, style: { color: 'var(--sdui-color-muted, #6B7280)' } })] : [])
        ]))
    })]
    // no legend: the slices still have keyboard / screen-reader buttons, visually hidden
    const hidden = pickable && !show.legend && pick ? [renderNode(`${key}:picks`, 'div', {
      style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
      children: slices.map((p, i) => pickButton(key, ctx, pick, p, i, {}, []))
    })] : []
    return [renderNode(`${key}:row`, 'div', { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', ...(hidden.length ? { position: 'relative' } : {}) }, children: [svg, ...legend, ...hidden] })]
  }
}

// MARK: - v2.4: picking a bar, its tip

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/

interface Pick {
  /// the state a tap writes (absent: the pick is `initialSelection` only)
  state?: string
  /// the index picked (state, else initialSelection); -1: none
  picked: number
  /// the index shown: a hover preview, else `picked`
  shown: number
  color?: string
}

const keyOf = (p: Point, i: number) => p.key || String(i)

/// The bars' pick: the state when a tap set it, else `initialSelection` (re-resolved against the
/// data on every render, like a state's initial); a web hover previews another bar. `undefined`
/// when the chart has none of the 2.4 props (it then renders exactly as in 2.3).
function picking(node: SduiNode, ctx: RenderContext, key: string, data: Point[]): Pick | undefined {
  const name = node.string('selectState')
  const state = IDENT.test(name) ? name : undefined
  const initial = node.string('initialSelection')
  if (!state && !initial && !node.string('tip') && !node.string('selectedColor')) return undefined
  const indexOf = (k: string | undefined) => (k ? data.findIndex((p, i) => keyOf(p, i) === k) : -1)
  const initialKey = initial === 'last' ? keyOf(data[data.length - 1]!, data.length - 1) : initial === 'first' ? keyOf(data[0]!, 0) : initial === 'none' ? undefined : initial || undefined
  const picked = indexOf((state && ctx.selected(state)) || initialKey)
  const hovered = indexOf(ctx.env.hovered?.(key))
  return { state, picked, shown: hovered >= 0 ? hovered : picked, color: color(node.string('selectedColor')) }
}

/// v2.5 — what a pick target does: a tap picks the item (state), a web mouse hover previews it.
function pickOn(key: string, ctx: RenderContext, pick: Pick, p: Point, i: number): RenderNode['on'] {
  const sink = ctx.env.sink
  return {
    click: sink.bindAction(`a:${key}:pick${i}`, undefined, ctx.data, ctx.formId, { group: pick.state!, value: keyOf(p, i) }),
    ...(sink.bindHover ? { hover: sink.bindHover(`h:${key}:${i}`, key, keyOf(p, i)) } : {})
  }
}

/// A focusable pick target for item `i` (a bar / point column, a legend entry, a hidden slice button).
function pickButton(key: string, ctx: RenderContext, pick: Pick, p: Point, i: number, style: Record<string, string>, children: RenderNode[]): RenderNode {
  const amount = SduiValue.stringValue(p.item.amount)
  return renderNode(`${key}:hit${i}`, 'button', {
    attrs: { type: 'button', 'aria-label': `${p.label || keyOf(p, i)}, ${amount ?? format(p.value)}`, 'aria-pressed': String(i === pick.picked) },
    // no UA button look (engines differ)
    style: { margin: '0', padding: '0', border: '0', background: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer', ...style },
    on: pickOn(key, ctx, pick, p, i),
    children
  })
}

/// The tip of the shown item at `place` (computed from the data, never measured), sliding there.
function tipNode(key: string, node: SduiNode, ctx: RenderContext, p: Point, place: Record<string, string>): RenderNode {
  const template = node.string('tip')
  const tipCtx = ctx.child('tip', { item: p.item })
  const runs = template.includes('*') ? parseMarkup(template) : [{ text: template, bold: false, italic: false }]
  const tip = renderNode(`${key}:tip`, 'div', {
    attrs: { 'aria-live': 'polite' },
    style: {
      position: 'absolute', ...place, zIndex: '10', pointerEvents: 'none', width: 'max-content', maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere',
      padding: '6px 10px', borderRadius: '8px', background: 'var(--sdui-color-background, #FFFFFF)', color: 'var(--sdui-color-onSurface, #111827)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: '12px', lineHeight: '1.4', whiteSpace: 'pre-wrap', textAlign: 'left'
    },
    children: runs.map((r, j) => renderNode(`${key}:tip${j}`, 'span', {
      style: { ...(r.bold ? { fontWeight: '700' } : {}), ...(r.italic ? { fontStyle: 'italic' } : {}) },
      text: tipCtx.resolve(r.text)
    }))
  })
  const motion = ctx.env.place?.(`${key}:tip`, place)
  if (motion) tip.motion = motion
  return tip
}

/// The room a tip needs: its tallest text over every item (so it does not jump when the pick changes),
/// lines wrapped at `perLine` characters — an estimate (nothing is measured), on the generous side.
function tipRoom(node: SduiNode, ctx: RenderContext, items: Point[], perLine: number): number {
  const template = node.string('tip')
  if (!template) return 0
  const plain = template.replace(/\*+/g, '')
  let lines = 1
  for (const p of items) {
    const text = ctx.child('tip', { item: p.item }).resolve(plain)
    lines = Math.max(lines, text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0))
  }
  return lines * 17 + 18
}

/// `left: X%` + `translateX(-X%)`: the tip's own X% point sits at the item's X%, so it never leaves the
/// box (as long as it is no wider than the box, which `maxWidth: 100%` ensures) and stays over its item.
const across = (x: number) => ({ left: `${num(x)}%`, transform: `translateX(${num(-x)}%)` })

/// bar / line / area: the plot — the drawing, a transparent full-height button per item (a bar, or the
/// column of a point: the nearest one along x), a round marker on a picked point (line / area: HTML,
/// as the stretched SVG would squash a circle), and the tip above the shown item. Every place is a
/// percentage of the plot computed from the data — never measured, so every engine agrees.
function plot(key: string, node: SduiNode, ctx: RenderContext, data: Point[], pick: Pick, svg: RenderNode, slot: number, y: (v: number) => number, kind: Kind, fill: string): RenderNode {
  const children: RenderNode[] = [svg]
  if (pick.state && ctx.interactive) {
    children.push(renderNode(`${key}:hits`, 'div', {
      style: { position: 'absolute', inset: '0', display: 'flex' },
      on: ctx.env.sink.bindHover ? { hoverEnd: ctx.env.sink.bindHover(`h:${key}:end`, key, undefined) } : undefined,
      children: data.map((p, i) => pickButton(key, ctx, pick, p, i, { flex: '1 1 0', minWidth: '0', height: '100%' }, []))
    }))
  }
  const shown = data[pick.shown]
  if (shown) {
    const i = pick.shown
    const bar = kind === 'bar'
    const center = i * slot + slot / 2
    const pct = (v: number) => num(((VIEW - v) / VIEW) * 100)
    // the point (line / area) or the bar's top (a negative bar: the zero line)
    const top = bar ? Math.min(y(shown.value), y(0)) : y(shown.value)
    if (!bar) {
      const at = { left: `${num(center)}%`, bottom: `${pct(y(shown.value))}%` }
      const marker = renderNode(`${key}:marker`, 'div', {
        style: {
          position: 'absolute', ...at, width: '10px', height: '10px', transform: 'translate(-50%, 50%)', borderRadius: '50%', boxSizing: 'border-box',
          background: pick.color ?? fill, border: '2px solid var(--sdui-color-background, #FFFFFF)', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)', pointerEvents: 'none', zIndex: '1'
        }
      })
      const moving = ctx.env.place?.(`${key}:marker`, at)
      if (moving) marker.motion = moving
      children.push(marker)
    }
    if (node.string('tip')) children.push(tipNode(key, node, ctx, shown, { ...across(center), bottom: `calc(${pct(top)}% + ${bar ? 6 : 10}px)` }))
  }
  // room above the tallest item for the tip (it never covers what is above the chart)
  const room = tipRoom(node, ctx, data, 30)
  return renderNode(`${key}:plot`, 'div', { style: { position: 'relative', ...(room ? { marginTop: `${room}px` } : {}) }, children })
}

/// pie / donut: the disc with room around it for the tip, which sits outside the shown slice along its
/// middle — pushed away from the circle by its quadrant (right of it on the right, above it at the top…).
function disc(key: string, node: SduiNode, ctx: RenderContext, slices: Point[], pick: Pick, svg: RenderNode, size: number, mids: number[]): RenderNode {
  const children: RenderNode[] = [svg]
  const shown = slices[pick.shown]
  const room = tipRoom(node, ctx, slices, Math.max(12, Math.floor(size / 7)))
  if (shown && node.string('tip')) {
    // never beside the disc (it would leave a narrow card): above it for a slice in the upper half,
    // below it otherwise, slid across toward the slice
    const a = mids[pick.shown]!
    const at: Record<string, string> = Math.cos(a) >= 0 ? { bottom: `calc(100% - ${room}px + 4px)` } : { top: `calc(100% - ${room}px + 4px)` }
    children.push(tipNode(key, node, ctx, shown, { ...across(50 + 50 * Math.sin(a)), ...at }))
  }
  return renderNode(`${key}:disc`, 'div', {
    style: { position: 'relative', flex: '0 0 auto', width: `${size}px`, ...(room ? { padding: `${room}px 0` } : {}) },
    on: pick.state && ctx.interactive && ctx.env.sink.bindHover ? { hoverEnd: ctx.env.sink.bindHover(`h:${key}:end`, key, undefined) } : undefined,
    children
  })
}

/// A legend entry; a button when the slices can be picked.
function legendItem(key: string, ctx: RenderContext, pick: Pick | undefined, p: Point, i: number, pickable: boolean, children: RenderNode[]): RenderNode {
  const row = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--sdui-color-onSurface, #111827)' }
  if (!pickable || !pick) return renderNode(`${key}:item${i}`, 'li', { style: { listStyle: 'none', ...row }, children })
  return renderNode(`${key}:item${i}`, 'li', {
    style: { listStyle: 'none' },
    children: [pickButton(key, ctx, pick, p, i, { ...row, textAlign: 'left', ...(i === pick.picked ? { fontWeight: '600' } : {}) }, children)]
  })
}
