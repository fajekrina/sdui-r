// The SDUI spec version this engine implements (spec/sdui.schema.json).
// Payloads with the same MAJOR render (unknown minor additions degrade
// gracefully); a different MAJOR is rejected.

/// The spec version this engine writes and fully understands.
export const SPEC_VERSION = '2.4'

/// The only accepted MAJOR.
export const SUPPORTED_MAJOR = 2

/// Built-in component types: v1 (murti) and v1.1 additions.
export const V1_COMPONENTS = ['text', 'image', 'vstack', 'hstack', 'zstack', 'button', 'card'] as const
export const V11_COMPONENTS = ['spacer', 'divider', 'grid', 'scroll', 'list', 'form', 'textField', 'textArea', 'picker'] as const
/// sdui-r 2.0 additions.
export const V20_COMPONENTS = ['chart'] as const
/// sdui-r 2.4 additions (props only): the interactive bar chart — `selectState` (a tapped bar writes
/// `$selected.<state>` = its item key), `initialSelection`, `selectedColor`, `tip` (`{{item.x}}` of the
/// picked item, markup); web hover previews the tip (`RenderNode.on.hover` / `hoverEnd`).
/// sdui-r 2.3 additions (no new components, no new action types): screen `state` (each state is
/// `$selected.<name>`, the place a 2.2 choice group already writes; `initial` may hold tokens),
/// the state-bound props `visibleWhen` / `disabledWhen` / `maskedWhen` (one condition each),
/// `transition` (`visible`: none · fade · collapse), button `toggle`, and `$request.<request>`
/// (pending · success · error) kept by the engine for every `api` action.
/// sdui-r 2.2 additions (props + symbols, no new components): vstack/card `alignment: fill`,
/// negative vstack `spacing` (overlap), card `spacing`, shared `paddingHorizontal` /
/// `paddingVertical` / `borderColor` / `borderWidth` / `shadow` / `pin`, button icon
/// (`systemName`, `iconPosition`, `iconSize`, `iconBackground`, `iconForeground`), `size`, `weight`
/// and choices (`group`, `value`, `selected*`).
/// sdui-r 2.1 additions (props, no new components): `text.align` and `text.markup`
/// (`**bold**` / `*italic*` in `value`).
export type BuiltinComponentType = typeof V1_COMPONENTS[number] | typeof V11_COMPONENTS[number] | typeof V20_COMPONENTS[number]

/// sdui-r — what a value set may fill: per component type, the CONTENT props (text,
/// labels, image names, data arrays). Everything else — style, layout, form rules, the
/// action — is the template's decision. A value set that sets anything else is rejected
/// (client and backend); a type not listed here (an adapter slot) has no content props.
/// Mirrored in spec/content.json for backends (gated by tests/spec.test.ts).
export const CONTENT_PROPS: Readonly<Record<string, readonly string[]>> = {
  text: ['value'],
  image: ['name', 'systemName'],
  button: ['title'],
  list: ['items'],
  textField: ['label', 'placeholder'],
  textArea: ['label', 'placeholder'],
  picker: ['label', 'placeholder', 'options'],
  chart: ['data', 'labels', 'keyKey', 'labelKey', 'valueKey']
}
/// content props every component type has
export const SHARED_CONTENT_PROPS: readonly string[] = ['a11yLabel']

/// Whether a value set may set `key` on a component of `type`.
export function isContentProp(type: string, key: string): boolean {
  return SHARED_CONTENT_PROPS.includes(key) || (CONTENT_PROPS[type]?.includes(key) ?? false)
}

/// sdui-r — a template author's note for makers on one component ("Buy ticket — goes to
/// checkout"). Template-only: never content (a value set cannot set it) and dropped by
/// `compose`, so it never reaches a client.
export const BUILDER_NOTE_PROP = 'builderNote'
