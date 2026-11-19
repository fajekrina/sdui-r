// spec 2.3 — the screen state in the Studio: which states a page has (declared, or written by a
// choice group / toggle), the values each can take, what a condition says in words, warnings,
// and the condition editor (source → operator → value), so a maker picks instead of typing JSON.
import { evaluate, type ScreenState, type SduiNode, type SduiValue } from '../core'

export const CONDITION_PROPS = ['visibleWhen', 'disabledWhen', 'maskedWhen'] as const
export type ConditionProp = typeof CONDITION_PROPS[number]
export const CONDITION_OPS = ['equals', 'notEquals', 'in', 'empty', 'notEmpty'] as const
export type ConditionOp = typeof CONDITION_OPS[number]

/// A condition in editable form (`undefined` = none).
export interface ConditionParts { source: 'state' | 'request'; name: string; op: ConditionOp; values: string[] }

const walk = (root: SduiNode, visit: (n: SduiNode) => void) => { visit(root); root.children.forEach((c) => walk(c, visit)) }

/// Every state of the page: declared ones first, then choice groups and toggles (in tree order).
export function stateNames(root: SduiNode, declared: ScreenState = {}): string[] {
  const out = new Set(Object.keys(declared))
  walk(root, (n) => {
    // a button's group / toggle, or (2.4) a chart's picked bar
    const name = n.type === 'button' ? n.string('group') || n.string('toggle') : n.type === 'chart' ? n.string('selectState') : ''
    if (name) out.add(name)
  })
  return [...out]
}

/// The values the page's buttons can put in a state ("" = unset is always possible).
export function stateValues(root: SduiNode, name: string): string[] {
  const out = new Set<string>([''])
  walk(root, (n) => {
    if (n.type === 'chart' && n.string('selectState') === name) {
      // a picked bar writes its item key (static data; a data source's keys come with its answer)
      const data = n.props.data
      if (Array.isArray(data)) data.forEach((item, i) => out.add(item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).key === 'string' ? (item as Record<string, string>).key : String(i)))
      return
    }
    if (n.type !== 'button') return
    if (n.string('group') === name) out.add(n.string('value') || n.id || '')
    else if (n.string('toggle') === name) out.add('on')
  })
  return [...out]
}

/// Requests the page's `api` actions send (the sources of `request` conditions).
export function requestNames(root: SduiNode): string[] {
  const out = new Set<string>()
  walk(root, (n) => {
    for (let a = n.action; a; a = a.onSuccess) if (a.type === 'api' && a.request) out.add(a.request)
    for (let a = n.action?.onError; a; a = a.onSuccess) if (a.type === 'api' && a.request) out.add(a.request)
  })
  return [...out]
}

export const REQUEST_VALUES = ['', 'pending', 'success', 'error']

/// A condition prop → its parts; `undefined` when absent or not in the 2.3 shape.
export function conditionParts(raw: SduiValue | undefined): ConditionParts | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || evaluate(raw, () => undefined) === null) return undefined
  const c = raw as Record<string, SduiValue>
  const source = 'state' in c ? 'state' : 'request'
  const op = CONDITION_OPS.find((o) => o in c)!
  const arg = c[op]
  const values = op === 'in' ? (arg as string[]) : op === 'equals' || op === 'notEquals' ? [arg as string] : []
  return { source, name: c[source] as string, op, values }
}

/// Parts → the condition prop.
export function conditionOf(p: ConditionParts): Record<string, SduiValue> {
  const value: SduiValue = p.op === 'in' ? p.values : p.op === 'empty' || p.op === 'notEmpty' ? true : (p.values[0] ?? '')
  return { [p.source]: p.name, [p.op]: value }
}

const shown = (v: string) => (v === '' ? 'empty' : `"${v}"`)

/// "feedback is "like" or empty", "request sendFeedback is "success"".
export function describeCondition(raw: SduiValue | undefined): string | undefined {
  if (raw === undefined) return undefined
  const p = conditionParts(raw)
  if (!p) return 'a condition this Studio cannot read'
  const subject = p.source === 'state' ? p.name : `request ${p.name}`
  switch (p.op) {
    case 'equals': return `${subject} is ${shown(p.values[0] ?? '')}`
    case 'notEquals': return `${subject} is not ${shown(p.values[0] ?? '')}`
    case 'in': return `${subject} is ${p.values.map(shown).join(' or ')}`
    case 'empty': return `${subject} is empty`
    case 'notEmpty': return `${subject} is set`
  }
}

const VERB: Record<ConditionProp, string> = { visibleWhen: 'Shown only when', disabledWhen: 'Disabled when', maskedWhen: 'Masked when' }

/// What the state-bound props of a component do, in words (for its description).
export function describeStateProps(node: SduiNode): string[] {
  const out: string[] = []
  for (const prop of CONDITION_PROPS) {
    const text = describeCondition(node.props[prop])
    if (text) out.push(`${VERB[prop]} ${text}`)
  }
  const t = node.props.transition
  const kind = t && typeof t === 'object' && !Array.isArray(t) ? (t as { visible?: unknown }).visible : undefined
  if (node.props.visibleWhen !== undefined && (kind === 'fade' || kind === 'collapse')) out.push(`Appears / disappears with a ${kind}`)
  if (node.type === 'button' && node.string('toggle')) out.push(`A tap switches state ${node.string('toggle')} on / off`)
  if (node.type === 'chart' && node.string('selectState')) out.push(`A tapped bar is picked (state ${node.string('selectState')})${node.string('tip') ? '; a tip above it shows its data' : ''}`)
  return out
}

/// The page's state values for the canvas: a simulated value, else the declared initial
/// (its tokens resolved against the sample data), else "".
export function simulatedState(root: SduiNode, declared: ScreenState, sim: Record<string, string>, resolve: (t: string) => string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of stateNames(root, declared)) out[name] = sim[name] ?? resolve(declared[name]?.initial ?? '')
  return out
}

/// Warnings only (nothing is blocked): a condition no button can make true or false, a state
/// read but never written, a request no action sends, a balance that can never be revealed,
/// a transition without a visibleWhen, a declared state nothing uses, a condition this Studio
/// cannot read.
export function stateWarnings(root: SduiNode, declared: ScreenState = {}): string[] {
  const out: string[] = []
  const writers = new Set<string>()
  walk(root, (n) => {
    const w = n.type === 'button' ? n.string('group') || n.string('toggle') : n.type === 'chart' ? n.string('selectState') : ''
    if (w) writers.add(w)
  })
  // a chart that picks from a data source writes keys this Studio cannot list
  const sourced = new Set<string>()
  walk(root, (n) => { if (n.type === 'chart' && n.action?.type === 'api' && n.string('selectState')) sourced.add(n.string('selectState')) })
  const requests = requestNames(root)
  const read = new Set<string>()
  walk(root, (n) => {
    const at = `${n.type} #${n.id ?? '?'}`
    for (const prop of CONDITION_PROPS) {
      const raw = n.props[prop]
      if (raw === undefined) continue
      const p = conditionParts(raw)
      if (!p) { out.push(`${at}: ${prop} cannot be read (one state or request, one operator) — the app ${prop === 'maskedWhen' ? 'keeps it masked' : prop === 'visibleWhen' ? 'always shows it' : 'never disables it'}`); continue }
      if (p.source === 'request') {
        if (!requests.includes(p.name)) out.push(`${at}: ${prop} reads request "${p.name}", which no action sends`)
        const odd = p.values.filter((v) => !REQUEST_VALUES.includes(v))
        if (odd.length) out.push(`${at}: a request is only pending, success or error — never ${odd.map(shown).join(', ')}`)
        continue
      }
      read.add(p.name)
      const initial = declared[p.name]?.initial
      if (!writers.has(p.name)) {
        if (!initial || !initial.includes('{{')) out.push(`${at}: ${prop} reads state "${p.name}", but no button sets it${prop === 'maskedWhen' ? ' — the value can never be revealed' : ''}`)
        continue
      }
      // a value no button sets (and that the backend may not return either) is suspicious
      const possible = stateValues(root, p.name)
      const missing = p.values.filter((v) => !possible.includes(v))
      if (missing.length && !initial?.includes('{{') && !sourced.has(p.name)) out.push(`${at}: no button sets ${p.name} to ${missing.map(shown).join(' or ')}`)
    }
    if (n.props.transition !== undefined && n.props.visibleWhen === undefined) out.push(`${at}: a transition animates visibleWhen changes; this component has none`)
    // spec 2.4 — the picking props work on a bar chart; a tip needs a bar to sit on
    if (n.type === 'chart') {
      const picks = ['tip', 'selectState', 'initialSelection', 'selectedColor'].filter((k) => n.props[k] !== undefined)
      const kind = n.string('kind') || 'bar'
      if (picks.length && kind !== 'bar') out.push(`${at}: ${picks.join(', ')} only work on a bar chart (this one is ${kind})`)
      else if (n.string('tip') && !n.string('selectState') && (!n.string('initialSelection') || n.string('initialSelection') === 'none')) out.push(`${at}: the tip never shows — set selectState (a tap picks a bar) or initialSelection`)
    }
  })
  for (const name of Object.keys(declared)) {
    if (!read.has(name) && !writers.has(name)) out.push(`state "${name}" is declared but nothing uses it`)
  }
  return out
}

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, ...kids: Array<Node | string>) => HTMLElementTagNameMap[K]

const OP_LABEL: Record<ConditionOp, string> = { equals: 'is', notEquals: 'is not', in: 'is one of', empty: 'is empty', notEmpty: 'is set' }

/// The condition editor: state / request (dropdown) → operator → value(s) (picked from the
/// values the page's buttons set; `in` takes several). "— none —" removes the condition.
export function conditionEditor(d: Document, label: string, current: SduiValue | undefined,
  lists: { states: readonly string[]; requests: readonly string[]; valuesOf: (source: 'state' | 'request', name: string) => readonly string[] },
  onChange: (next: Record<string, SduiValue> | undefined) => void): HTMLElement {
  const el: El = (tag, attrs = {}, ...kids) => {
    const e = d.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    e.append(...kids)
    return e
  }
  const parts = conditionParts(current)
  const box = el('div', { class: 'cond', role: 'group', 'aria-label': label })
  const source = el('select', { 'aria-label': `${label} source` })
  source.append(el('option', { value: '' }, '— none —'),
    ...lists.states.map((s) => el('option', { value: `state:${s}` }, s)),
    ...lists.requests.map((r) => el('option', { value: `request:${r}` }, `request ${r}`)))
  const at = parts ? `${parts.source}:${parts.name}` : ''
  if (at && ![...source.options].some((o) => o.value === at)) source.append(el('option', { value: at }, parts!.source === 'state' ? parts!.name : `request ${parts!.name}`))
  source.value = at
  box.append(el('label', {}, label, source))
  if (current !== undefined && !parts) box.append(el('div', { class: 'tip warn' }, 'This condition is not in a shape the Studio reads; pick again or edit it in Props (JSON).'))
  if (parts) {
    const op = el('select', { 'aria-label': `${label} operator` }, ...CONDITION_OPS.map((o) => el('option', { value: o }, OP_LABEL[o])))
    op.value = parts.op
    box.append(op)
    const commit = (next: Partial<ConditionParts>) => onChange(conditionOf({ ...parts, ...next }))
    op.addEventListener('change', () => {
      const o = op.value as ConditionOp
      commit({ op: o, values: o === 'in' ? parts.values.length ? parts.values : [''] : o === 'empty' || o === 'notEmpty' ? [] : [parts.values[0] ?? ''] })
    })
    const known = lists.valuesOf(parts.source, parts.name)
    if (parts.op === 'equals' || parts.op === 'notEquals') {
      const value = el('select', { 'aria-label': `${label} value` }, ...known.map((v) => el('option', { value: v }, v === '' ? '(empty)' : v)))
      const v = parts.values[0] ?? ''
      if (!known.includes(v)) value.append(el('option', { value: v }, v))
      value.value = v
      value.addEventListener('change', () => commit({ values: [value.value] }))
      box.append(value)
    } else if (parts.op === 'in') {
      const all = [...new Set([...known, ...parts.values])]
      box.append(...all.map((v) => {
        const check = el('input', { type: 'checkbox', 'aria-label': `${label} ${v === '' ? 'empty' : v}` })
        check.checked = parts.values.includes(v)
        check.addEventListener('change', () => {
          const values = all.filter((x) => x === v ? check.checked : parts.values.includes(x))
          if (values.length) commit({ values })
        })
        return el('label', { class: 'chk' }, check, v === '' ? '(empty)' : v)
      }))
    }
  }
  source.addEventListener('change', () => {
    if (!source.value) return onChange(undefined)
    const [s, ...rest] = source.value.split(':')
    const name = rest.join(':')
    const src = s as 'state' | 'request'
    onChange(conditionOf(src === 'request'
      ? { source: src, name, op: 'equals', values: ['success'] }
      : { source: src, name, op: parts?.op ?? 'equals', values: parts?.values.length ? parts.values : [lists.valuesOf(src, name).find((v) => v !== '') ?? ''] }))
  })
  return box
}
