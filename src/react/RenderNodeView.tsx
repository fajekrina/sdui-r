/// React binding for RenderNode — the only rendering code in the React adapter.
/// No component-type branches: element, attrs, style and text come from core.
import React from 'react'
import type { RenderNode } from '../core/render-node'
import type { ScreenController } from '../core/screen'
import { playMotion } from '../core/motion'

const ATTR_ALIASES: Record<string, string> = {
  novalidate: 'noValidate', class: 'className', for: 'htmlFor', minlength: 'minLength', maxlength: 'maxLength',
  inputmode: 'inputMode', autocomplete: 'autoComplete', 'fill-rule': 'fillRule', viewbox: 'viewBox',
  'vector-effect': 'vectorEffect', 'stroke-width': 'strokeWidth', 'stroke-linejoin': 'strokeLinejoin', 'stroke-linecap': 'strokeLinecap'
}

/// Toolkit-specific components: `{ chart: (node) => <Chart … /> }`.
export type ReactSlots = Record<string, (slot: NonNullable<RenderNode['slot']>, node: RenderNode) => React.ReactNode>

export function RenderNodeView({ node, screen, slots }: { node: RenderNode; screen?: ScreenController; slots?: ReactSlots }): React.ReactElement {
  if (node.slot && slots?.[node.slot.type]) {
    return <div style={node.style as React.CSSProperties} data-sdui-slot={node.slot.type}>{slots[node.slot.type]!(node.slot, node)}</div>
  }
  // the key in the DOM as in vanilla: focus is kept / rescued by it (`holdFocus`)
  const props: Record<string, unknown> = { style: node.style as React.CSSProperties, 'data-sdui-key': node.key }
  for (const [k, v] of Object.entries(node.attrs)) {
    if (k === 'value' && node.element !== 'option') continue
    if (k === 'style' || /^on/i.test(k)) continue   // styles via CSSOM only; no handlers from attrs
    props[ATTR_ALIASES[k] ?? k] = v
  }

  if (node.field && screen) {
    const { formId, name } = node.field
    props.value = String(node.attrs.value ?? '')
    props.onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      screen.setFieldValue(formId, name, e.target.value)
  }
  if (node.on?.click && screen) {
    const key = node.on.click
    props.onClick = (e: React.MouseEvent) => {
      e.preventDefault()
      void screen.handle(key)
    }
  }
  if (node.element === 'form') props.onSubmit = (e: React.FormEvent) => e.preventDefault()
  // v2.4 — a mouse hover previews (touch and pen never do)
  if (node.on?.hover && screen) { const k = node.on.hover; props.onPointerEnter = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') screen.hover(k) } }
  if (node.on?.hoverEnd && screen) { const k = node.on.hoverEnd; props.onPointerLeave = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') screen.hover(k) } }
  // spec 2.3 — called after commit, on every render while it animates (the delay keeps it in place)
  if (node.motion) { const motion = node.motion; props.ref = (el: Element | null) => { if (el) playMotion(el, motion) } }

  const children = node.children.map((c) => <RenderNodeView key={c.key} node={c} screen={screen} slots={slots} />)
  if (node.element === 'input' || node.element === 'img' || node.element === 'hr' || node.element === 'textarea') {
    return React.createElement(node.element, props)
  }
  return React.createElement(node.element, props, node.text, ...children)
}

export default RenderNodeView
