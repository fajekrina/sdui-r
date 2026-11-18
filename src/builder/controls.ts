// Field controls shared by the Studio inspector and its content (values) mode: a text box
// with bold / italic buttons for a text's value, a table for picker options, and a color
// field (theme tokens or a hex color). Plain DOM, no inline styles (strict CSP).
import { COLOR_TOKENS, parseHexColor, type SduiValue } from '../core'

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, ...kids: Array<Node | string>) => HTMLElementTagNameMap[K]

export function elFor(d: Document): El {
  return (tag, attrs = {}, ...kids) => {
    const e = d.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    e.append(...kids)
    return e
  }
}

/// Wrap the selection of `area` in `marker` (`**` bold, `*` italic); without a selection the
/// markers go in at the caret with the caret between them. Answers the new text.
export function wrapSelection(area: HTMLTextAreaElement, marker: string): string {
  const { selectionStart: start, selectionEnd: end, value } = area
  const picked = value.slice(start, end)
  const next = `${value.slice(0, start)}${marker}${picked}${marker}${value.slice(end)}`
  area.value = next
  const caret = start + marker.length
  area.setSelectionRange(caret, caret + picked.length)
  return next
}

/// A multi-line text box: every keystroke goes to `onInput` (the canvas follows as you type),
/// leaving the box calls `onCommit`. With `onMarkup` it gets **B** / *I* buttons that wrap the
/// selection in `**` / `*` and switch the text's `markup` on (spec 2.1); Enter is a new line.
export function multilineText(d: Document, options: {
  label: string
  value: string
  placeholder?: string
  rows?: number
  onChange: (value: string) => void
  /// every keystroke (default: `onChange`)
  onInput?: (value: string) => void
  onCommit?: () => void
  onMarkup?: () => void
  markupOn?: boolean
}): HTMLElement {
  const el = elFor(d)
  const area = el('textarea', { rows: String(options.rows ?? 3), 'aria-label': options.label, ...(options.placeholder ? { placeholder: options.placeholder } : {}) })
  area.value = options.value
  area.addEventListener('input', () => (options.onInput ?? options.onChange)(area.value))
  area.addEventListener('change', () => options.onCommit?.())
  const box = el('div', { class: 'mtext' })
  if (options.onMarkup) {
    const tool = (label: string, marker: string, title: string) => {
      const b = el('button', { type: 'button', class: `btn fmt fmt-${marker === '**' ? 'b' : 'i'}`, title, 'aria-label': title }, label)
      // keep the selection in the text box while clicking
      b.addEventListener('mousedown', (event) => event.preventDefault())
      b.addEventListener('click', () => {
        const next = wrapSelection(area, marker)
        if (!options.markupOn) options.onMarkup?.()
        options.onChange(next)
      })
      return b
    }
    box.append(el('div', { class: 'fmtbar' }, tool('B', '**', 'Bold (**text**)'), tool('I', '*', 'Italic (*text*)'),
      el('span', { class: 'tip' }, options.markupOn ? '**bold** · *italic* · \\* = a literal *' : 'B / I turns on bold & italic for this text')))
  }
  box.prepend(el('label', {}, options.label, area))
  return box
}

/// One picker option: a value sent with the form and the label people see.
export type PickerOption = { value: string; label: string }

/// Picker `options` (`[{ value, label }]` or strings) as rows; strings become `{ value, label }`.
export function toOptions(raw: unknown): PickerOption[] {
  if (!Array.isArray(raw)) return []
  return raw.map((o) => typeof o === 'string' ? { value: o, label: o }
    : { value: String((o as Record<string, unknown>)?.value ?? ''), label: String((o as Record<string, unknown>)?.label ?? (o as Record<string, unknown>)?.value ?? '') })
}

/// A table editor for picker options: value + label per row, add / remove / move.
export function optionsTable(d: Document, label: string, current: unknown, onChange: (options: SduiValue | undefined) => void): HTMLElement {
  const el = elFor(d)
  const rows = toOptions(current)
  const commit = () => onChange(rows.length ? rows.filter((r) => r.value.trim() !== '').map((r) => ({ value: r.value.trim(), label: r.label.trim() || r.value.trim() })) : undefined)
  const table = el('div', { class: 'opts', role: 'table', 'aria-label': label })
  table.append(el('div', { class: 'opt hd', role: 'row' }, el('span', {}, 'value'), el('span', {}, 'label'), el('span', {})))
  rows.forEach((row, i) => {
    const value = el('input', { 'aria-label': `option ${i + 1} value` })
    value.value = row.value
    value.addEventListener('input', () => { row.value = value.value; commit() })
    const text = el('input', { 'aria-label': `option ${i + 1} label` })
    text.value = row.label
    text.addEventListener('input', () => { row.label = text.value; commit() })
    const remove = el('button', { type: 'button', class: 'btn', title: 'Remove option', 'aria-label': `Remove option ${i + 1}` }, '✕')
    remove.addEventListener('click', () => { rows.splice(i, 1); commit() })
    const up = el('button', { type: 'button', class: 'btn', title: 'Move up', 'aria-label': `Move option ${i + 1} up` }, '↑')
    up.disabled = i === 0
    up.addEventListener('click', () => { [rows[i - 1], rows[i]] = [rows[i]!, rows[i - 1]!]; commit() })
    table.append(el('div', { class: 'opt', role: 'row' }, value, text, el('span', { class: 'ops' }, up, remove)))
  })
  const add = el('button', { type: 'button', class: 'btn' }, '+ Add option')
  add.addEventListener('click', () => { rows.push({ value: `option${rows.length + 1}`, label: `Option ${rows.length + 1}` }); commit() })
  return el('div', { class: 'fldset' }, el('span', { class: 'lbl' }, label), table, add)
}

const TOKENS = Object.keys(COLOR_TOKENS)
const HEX = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

/// A color: a theme token (follows the host theme, dark mode) or a hex color.
export function colorField(d: Document, label: string, current: unknown, onChange: (value: string | undefined) => void): HTMLElement {
  const el = elFor(d)
  const value = typeof current === 'string' ? current : ''
  const isToken = TOKENS.includes(value)
  const select = el('select', { 'aria-label': `${label} token` },
    el('option', { value: '' }, '— none —'), ...TOKENS.map((t) => el('option', { value: t }, t)), el('option', { value: '#' }, 'custom hex…'))
  select.value = isToken ? value : value ? '#' : ''
  const hex = el('input', { 'aria-label': `${label} hex`, placeholder: '#RRGGBB', class: 'hex' })
  hex.value = isToken ? '' : value
  hex.hidden = select.value !== '#'
  const swatch = el('input', { type: 'color', 'aria-label': `${label} picker`, class: 'sw' })
  const rgb = parseHexColor(isToken ? COLOR_TOKENS[value]! : value)
  if (rgb) swatch.value = `#${[rgb.red, rgb.green, rgb.blue].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`
  swatch.hidden = select.value !== '#'
  select.addEventListener('change', () => {
    if (select.value === '#') { hex.hidden = false; swatch.hidden = false; hex.focus(); return }
    onChange(select.value || undefined)
  })
  hex.addEventListener('change', () => { const v = hex.value.trim(); if (v === '' || HEX.test(v)) onChange(v || undefined) })
  swatch.addEventListener('change', () => onChange(swatch.value))
  return el('label', {}, label, el('span', { class: 'color' }, select, swatch, hex))
}
