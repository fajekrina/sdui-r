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
//   v2.4 (bar): selectState (a tapped bar writes $selected.<state> = its item key), initialSelection
//   (last · first · none · a key), selectedColor, tip ({{item.x}} of the picked item, markup)

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
    const pickable = kind === 'bar' && IDENT.test(node.string('selectState')) && ctx.interactive
    const attrs = { role: pickable ? 'group' : 'img', 'aria-label': summary }
    return renderNode(key, 'div', {
      type: node.type,
      attrs,
      style: base,
      children: kind === 'pie' || kind === 'donut' ? this.round(key, node, data, kind, height) : this.axes(key, node, data, kind, height, ctx)
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
    const pick = kind === 'bar' ? picking(node, ctx, key, data) : undefined
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
    out.push(pick ? plot(key, node, ctx, data, pick, svg, slot, y) : svg)
    if (show.labels && data.some((p) => p.label)) {
      out.push(renderNode(`${key}:labels`, 'div', { style: { display: 'flex' }, children: data.map((p, i) => label(`${key}:l${i}`, p.label)) }))
    }
    if (show.keys && data.some((p) => p.key)) {
      out.push(renderNode(`${key}:keys`, 'div', { style: { display: 'flex' }, children: data.map((p, i) => label(`${key}:k${i}`, p.key, { fontFamily: 'ui-monospace, monospace', fontSize: '10px' })) }))
    }
    return out
  }

  /// pie / donut: slices clockwise from 12 o'clock, a legend beside them.
  private round(key: string, node: SduiNode, data: Point[], kind: Kind, size: number): RenderNode[] {
    const slices = data.filter((p) => p.value > 0)
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
      angle += sweep
      return renderNode(`${key}:slice${i}`, 'path', { attrs: { d, 'fill-rule': 'evenodd', 'data-index': i }, style: { fill } })
    })
    const svg = renderNode(`${key}:svg`, 'svg', {
      attrs: { viewBox: '0 0 100 100', width: String(size), height: String(size), 'aria-hidden': 'true' },
      style: { display: 'block', flex: '0 0 auto' },
      children: shapes
    })
    const show = ChartComponent.shows(node)
    const legend = !show.legend ? [] : [renderNode(`${key}:legend`, 'ul', {
      style: { margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0' },
      children: slices.map((p, i) => renderNode(`${key}:item${i}`, 'li', {
        style: { listStyle: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--sdui-color-onSurface, #111827)' },
        children: [
          renderNode(`${key}:swatch${i}`, 'span', { style: { width: '10px', height: '10px', borderRadius: '2px', flex: '0 0 auto', background: (p.color ? color(p.color) : undefined) ?? color(PALETTE[i % PALETTE.length]!)! } }),
          ...(show.labels || !p.key ? [renderNode(`${key}:name${i}`, 'span', { text: p.label || '•', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } })] : []),
          ...(show.keys && p.key ? [renderNode(`${key}:key${i}`, 'span', { text: p.key, style: { fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: 'var(--sdui-color-muted, #6B7280)' } })] : []),
          ...(show.values ? [renderNode(`${key}:pct${i}`, 'span', { text: `${format(p.value)} · ${Math.round((p.value / total) * 100)}%`, style: { color: 'var(--sdui-color-muted, #6B7280)' } })] : [])
        ]
      }))
    })]
    return [renderNode(`${key}:row`, 'div', { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }, children: [svg, ...legend] })]
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

/// The plot: the bars, a transparent button over each (tap target; web hover previews), and the
/// tip above the shown bar. The tip's place is computed from the data — the bar's center (or edge,
/// at either end) and top as percentages of the plot — never measured: every engine agrees.
function plot(key: string, node: SduiNode, ctx: RenderContext, data: Point[], pick: Pick, svg: RenderNode, slot: number, y: (v: number) => number): RenderNode {
  const children: RenderNode[] = [svg]
  const sink = ctx.env.sink
  if (pick.state && ctx.interactive) {
    const state = pick.state
    children.push(renderNode(`${key}:hits`, 'div', {
      style: { position: 'absolute', inset: '0', display: 'flex' },
      on: sink.bindHover ? { hoverEnd: sink.bindHover(`h:${key}:end`, key, undefined) } : undefined,
      children: data.map((p, i) => {
        const amount = SduiValue.stringValue(p.item.amount)
        return renderNode(`${key}:hit${i}`, 'button', {
          attrs: { type: 'button', 'aria-label': `${p.label || keyOf(p, i)}, ${amount ?? format(p.value)}`, 'aria-pressed': String(i === pick.picked) },
          // no UA button look (engines differ): an invisible, full-height tap target
          style: { flex: '1 1 0', minWidth: '0', height: '100%', margin: '0', padding: '0', border: '0', background: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer' },
          on: {
            click: sink.bindAction(`a:${key}:bar${i}`, undefined, ctx.data, ctx.formId, { group: state, value: keyOf(p, i) }),
            ...(sink.bindHover ? { hover: sink.bindHover(`h:${key}:${i}`, key, keyOf(p, i)) } : {})
          }
        })
      })
    }))
  }
  const template = node.string('tip')
  const lines = template ? template.split('\n').length : 0
  const shown = data[pick.shown]
  if (template && shown) {
    const i = pick.shown
    const n = data.length
    // at the first / last bar the tip lines up with that bar's outer edge (never cut off)
    const left = n > 1 && i === 0 ? i * slot + slot * 0.15 : n > 1 && i === n - 1 ? i * slot + slot * 0.85 : i * slot + slot / 2
    const shift = n > 1 && i === 0 ? 0 : n > 1 && i === n - 1 ? -100 : -50
    const top = Math.min(y(shown.value), y(0))
    const place = { left: `${num(left)}%`, bottom: `calc(${num(((VIEW - top) / VIEW) * 100)}% + 6px)`, transform: `translateX(${shift}%)` }
    const tipCtx = ctx.child('tip', { item: shown.item })
    const runs = template.includes('*') ? parseMarkup(template) : [{ text: template, bold: false, italic: false }]
    const tip = renderNode(`${key}:tip`, 'div', {
      attrs: { 'aria-live': 'polite' },
      style: {
        position: 'absolute', ...place, zIndex: '1', pointerEvents: 'none', width: 'max-content', maxWidth: '60%',
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
    children.push(tip)
  }
  // room above the tallest bar for the tip (it never covers what is above the chart)
  return renderNode(`${key}:plot`, 'div', { style: { position: 'relative', ...(lines ? { marginTop: `${lines * 17 + 18}px` } : {}) }, children })
}
