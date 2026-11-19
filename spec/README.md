# SDUI-R spec (v2.5)

The contract between the backend and `@fajekrina/sdui-r`. The machine-readable source
of truth is [`sdui.schema.json`](./sdui.schema.json) (JSON Schema Draft 2020-12);
this file is the human guide. When the two disagree, the schema wins.

v1 is the [murti](https://github.com/iQbalADR/murti) v1 contract, copied and owned
here (Apache-2.0, see [`../NOTICE`](../NOTICE)); v1.1 is `@fajekrina/sdui`. **v2.0 (sdui-r)**
splits a screen into a template and a value set — a new major, so 1.x payloads are rejected.
**v2.1** adds props only (a 2.0 document is a valid 2.1 document): `text.align` and
`text.markup` — see [Text (v2.1)](#text-v21). **v2.2** adds props and symbols only — full-width
children, overlap, outlines, per-side padding, shadow, pin, button icons and choices — see
[Layout and choices (v2.2)](#layout-and-choices-v22). **v2.3** adds screen state, state-bound props
and transitions — no new components and no new action types, so a 2.2 client still renders a 2.3
screen (see the table in [State and transitions (v2.3)](#state-and-transitions-v23)). **v2.4** makes
the bar chart interactive and **v2.5** every other chart kind — see
[Interactive chart (v2.4, v2.5)](#interactive-chart-v24-v25).

## v2.0 — template + value set

| Document | Top level | Who signs it | Notes |
| --- | --- | --- | --- |
| Template | `{ schemaVersion, template: { key, version, title?, load?, root, variants? } }` | template service | every node has `id` (`^[A-Za-z][A-Za-z0-9_-]*$`, unique per tree) and `order` (integer ≥ 0, unique among siblings); `props` are defaults; a release `key@version` is immutable |
| Value set | `{ schemaVersion, values: { screen, template: { key, version }, components } }` | value service | `components.<id> = { props?, action? }`; props merge (shallow) over the defaults, the action replaces the template's |
| Bundle | `{ template, values? }` | — (each part is an envelope) | what the client fetches, caches and re-verifies |

Client rules (beyond the schema): ids unique per tree and orders unique among siblings;
value ids must exist in the template; `values.template` must equal the template's
`key@version`; a value set delivered for screen `X` must say `screen: "X"`. The composed
screen is then validated like any v1.1 screen (bounds, actions, targets).

The resolved `{ schemaVersion, screen }` payload below is what composition produces; it
stays accepted for previews and tests.

## Shape

```jsonc
// Payload (development, or inside the envelope)
{ "schemaVersion": "1.1",
  "screen": {
    "key": "home",                         // identifier
    "load": [ { "request": "getBalance" } ],   // v1.1, optional
    "root": { "type": "vstack", "props": {}, "children": [], "action": {} },
    "variants": { "compact": {}, "wide": {} }  // v1.1, optional
  } }

// Envelope (production)
{ "schemaVersion": "1.1", "alg": "ed25519", "keyId": "k1",
  "payload": "<base64 of the payload JSON>", "signature": "<base64 Ed25519 over those bytes>" }
```

A **node** is `{ type, id?, props?, children?, action? }`. `type` is an open
vocabulary (unknown types render a Null-Object placeholder); `props` is an open bag
(unknown keys are ignored).

## `schemaVersion` policy

- `MAJOR.MINOR`. The client supports major `1`.
- Same major, any minor → render what you can: unknown component types become
  placeholders, unknown props are ignored.
- Different major → reject, fail-closed (last-good cache or error view).
- Changes inside a major are additive only.

## Validation layers

| Layer | Where | What |
| --- | --- | --- |
| 1 · Structural decode | client | JSON maps to the model (`type` required, closed action types) |
| 2 · Schema conformance | CI (Ajv) + client validator + backend on save/publish | shape, closed vocabularies, per-field bounds |
| 3 · Client-only bounds | client validator | depth, total nodes, chain depth |
| 4 · Render fallback | renderer | unknown type → Null Object |

## Content props (what a value set may fill)

A value set carries **content only**: per component type, the props listed in
[`content.json`](./content.json) (texts, labels, image names, data arrays) plus `a11yLabel`.
Style, layout, form rules and the action belong to the template: a value set that sets
anything else, or any `action`, is invalid. The client validator (`validateValues`) and the
backend (on save and publish) both check it against the template. A type not listed (an
adapter slot) has no content props. `tests/spec.test.ts` fails if the file and
`CONTENT_PROPS` disagree.

## Bounds

The defaults are published as [`bounds.json`](./bounds.json) — the single source of these numbers.
A backend reads that file from the pinned package (`@fajekrina/sdui-r/spec/bounds.json`) instead of
copying them. The client builds `SduiBounds.default` from it, and `tests/spec.test.ts` fails if the schema disagrees.

| Bound | Default | Enforced by |
| --- | --- | --- |
| String length | 4096 | schema + client |
| Identifier length | 128 | schema + client |
| Props per object | 64 | schema + client |
| Children per node | 256 | schema + client |
| Array items | 512 | schema + client |
| Envelope payload | ~1 MiB | schema |
| Tree depth | 32 | client |
| Total nodes | 5000 | client |
| Action chain (`onSuccess`/`onError`) | 4 | client |
| `screen.load` requests (`maxLoadRequests`) | 8 | schema + client |

## Components

v1 (murti):

| `type` | Props |
| --- | --- |
| `text` | `value` (tokens; a newline is a line break), `style` `title`·`headline`·`body`·`caption`, `color`, `weight`, `size`; v2.1: `align`, `markup`. A text always shows in full (never cut, no ellipsis) |
| `image` | `systemName` (symbol) · `name` (app-resolved asset), `contentMode` `fit`·`fill`, `width`, `height` |
| `vstack` / `hstack` | `spacing`, `alignment` (`leading`·`center`·`trailing` / `top`·`center`·`bottom`); v2.2: vstack `fill`, negative `spacing` |
| `zstack` | `width`, `height`; children carry `x`, `y`, `width`, `height` |
| `card` | `padding` (16), `background`, `cornerRadius` (12), `foreground` |
| `button` | `title` (tokens) + `action`; `variant` `primary`·`secondary`·`plain` (v1.1); v2.2: icon, `size`, `weight`, choices |

v1.1:

| `type` | Props |
| --- | --- |
| `spacer` | `height`, `width` |
| `divider` | — |
| `grid` | `columns` (number), `spacing` |
| `scroll` | `axis` `vertical`·`horizontal` |
| `list` | `items` (data key path to an array), `as` (row name, default `item`), `spacing`; the children are the row template, rendered once per item with `{{<as>.*}}` |
| `form` | `spacing`; opens the `form.*` data scope for its fields |
| `textField` | `name`, `label`, `placeholder`, `keyboard` `text`·`number`·`email`·`phone`, `required`, `minLength`, `maxLength`, `pattern` (a **name**, see below), `secure` |
| `textArea` | `name`, `label`, `placeholder`, `rows`, `required`, `minLength`, `maxLength` |
| `picker` | `name`, `label`, `options` `[{ value, label }]` or strings, `required` |

Shared on every component: `padding`, `background`, `cornerRadius`, `foreground` (v2.2: `paddingHorizontal`,
`paddingVertical`, `borderColor`, `borderWidth`, `shadow`, `pin`),
and the accessibility props `a11yLabel` (tokens), `a11yId`, `a11yTraits`
(`button`·`header`·`image`·`link`).

### Style values

The style vocabulary is closed — no CSS. A color is a hex string (`#RGB`,
`#RRGGBB`, `#RRGGBBAA`) **or a semantic token name** (v1.1): `primary`,
`onPrimary`, `secondary`, `surface`, `onSurface`, `background`, `muted`, `border`,
`success`, `warning`, `danger`. Tokens resolve to CSS variables the host theme sets
(`--sdui-color-<name>`). Weights are names (`ultralight` … `black`); sizes and radii
are numbers (px). Anything unrecognized is ignored.

### Field patterns

`pattern` names a validator built into the client — never a regex from the
payload: `numeric`, `alphanumeric`, `email`, `phoneId` (Indonesian mobile),
`amount` (positive number, up to 2 decimals), `pin6` (6 digits), `nik` (16 digits).
An unknown name fails the field closed.

`secure: true` fields (PIN, OTP) are never logged, cached, or placed in the data
context outside their form; a WebView host may take them over with native input.

### Text (v2.1)

| Prop | Values | Effect |
| --- | --- | --- |
| `align` | `leading` · `center` · `trailing` | text alignment (unknown → ignored) |
| `markup` | `true` | `**bold**` and `*italic*` in `value` (they may nest); `\*` is a literal `*` |

`markup` is opt-in per text, so a 2.0 text with asterisks renders unchanged. The markers
are parsed on the **template string, before `{{tokens}}` resolve**: a token's value (API
data, a form field) is always plain text and never becomes formatting. A marker without its
partner stays literal. No HTML, links or colors — the vocabulary is closed. A 2.0 client
ignores both props (it shows the asterisks). A text is never truncated: every line of its
value shows, a newline is a line break. Native hosts parse the same way
(`parseMarkup` in the core is the reference).

**Typography (v2.3)** — on `text`:

| Prop | Values | Effect |
| --- | --- | --- |
| `font` | a name (identifier) | the font. `rounded` · `serif` · `mono` are built in; a host maps any name — web: the CSS variable `--sdui-font-<name>` (built-ins fall back to a system stack, other names to the inherited font); native: its own font table. Never CSS: an unknown name is the default font |
| `transform` | `uppercase` · `lowercase` · `capitalize` | letter case (the value itself is unchanged) |
| `letterSpacing` | number, -5…20 (px) | extra space between letters |
| `lineHeight` | number, 0.8…3 | line height as a multiple of the size (default 1.3) |

Out-of-range or unknown values are ignored by the client and rejected by the schema. All four
are design (template), not content.

### Actions per component

Only a `button` runs its action when tapped. A `chart` reads its `api` action's `request` as
its data source (loaded with the screen, never run on a tap; other action types and
`onSuccess` / `onError` are ignored). Every other built-in ignores an action; the builder
warns about one. A third-party component may run its own (`ComponentInfo.action`).

### Layout and choices (v2.2)

| Where | Prop | Effect |
| --- | --- | --- |
| `vstack` | `alignment: fill` | children take the full width |
| `vstack` | `spacing` < 0 | overlap: each child is pulled up over the previous one by that much and drawn above it |
| `card` | `alignment` (`leading` default · `center` · `trailing` · `fill`), `spacing` | as on a vstack |
| every component | `paddingHorizontal`, `paddingVertical` | override `padding` on those sides |
| every component | `borderColor`, `borderWidth` (default 1) | an outline (a width alone uses the `border` token) |
| every component | `shadow` | `small` · `medium` (below) · `top` (above: a pinned footer) |
| every component | `pin` | `bottom` · `top`: stays at that edge of the screen while the page scrolls |
| `button` | `systemName`, `iconPosition` (`leading` · `top`), `iconSize` (20), `iconPadding`, `iconBackground`, `iconForeground` | an icon before or above the title; `iconBackground` draws a circle behind it |
| `button` | `size`, `weight` | the title's size and weight |
| `button` | `group`, `value` | a **choice**: a tap selects `value` (default: the button id) in `group` |
| `button` | `selectedBackground`, `selectedForeground`, `selectedIconBackground`, `selectedIconForeground` | colors of the selected button |

A choice lives in the screen data as `$selected.<group>` (one value per group; a tap on another
button of the group moves it). It needs no action; when the button has one, it runs after the
choice and can send it (`"params": { "vote": "{{$selected.feedback}}" }`). The selected button
renders `aria-pressed="true"`. Symbols added: `arrow.left`, `hand.thumbsup`,
`hand.thumbsdown`. Every 2.2 prop is template (design), not content.

### State and transitions (v2.3)

Interactions without scripts: a screen keeps named **state**, components read it through one
**condition** per prop, and the engine animates the change.

**State.** State `x` is `$selected.x` in the screen data — the place a 2.2 choice group already
writes, so a choice group *is* a state. A template may declare its states:

```json
"state": { "feedback": { "initial": "{{insight.feedback}}" }, "balanceShown": {} }
```

`initial` (default `""`) may hold `{{token}}`s; until the state is first set it is re-resolved
against the data, so a `load` result that lands later still fills it. State is lost when the
screen closes. To keep it, an action sends it (`"params": { "vote": "{{$selected.feedback}}" }`),
the backend stores it and returns it in `load` data, and `initial` reads it — the template does not
change. A group or toggle used without a declaration still works and starts empty. At most
`maxStates` (16) per screen.

**What changes state** — button props (they run before the button's action, like a choice):

| Prop | Effect of a tap |
| --- | --- |
| `group` + `value` (v2.2) | `$selected.<group>` = `value` |
| `toggle` | `$selected.<toggle>` flips between `"on"` and `""` |

**Request status.** For every `api` action the engine keeps `$request.<request>`:
`pending` → `success` or `error`.

**Conditions** — exactly one source and exactly one operator; values compare as strings, an
unset state is `""`:

```json
{ "state": "feedback", "in": ["", "like"] }
{ "request": "sendFeedback", "equals": "success" }
```

| Operator | Holds when |
| --- | --- |
| `equals` / `notEquals` | the value is / is not that string |
| `in` | the value is one of the list (1 – `maxConditionValues` = 16) |
| `empty: true` / `notEmpty: true` | the value is / is not `""` |

AND: nest containers (an outer `visibleWhen` around an inner one). Anything richer: the backend
computes one field.

**State-bound props** (template / design, never content):

| Prop | On | Effect while the condition holds |
| --- | --- | --- |
| `visibleWhen` | every component | shown (otherwise hidden: no space, out of the accessibility tree) |
| `disabledWhen` | `button`, `textField`, `textArea`, `picker` | disabled |
| `maskedWhen` | `text` | the value is replaced by a mask (`••••••`) |
| `transition` | every component | `{ "visible": "none" \| "fade" \| "collapse" }` — how `visibleWhen` changes animate; `collapse` shrinks along the parent's axis |

The engine owns the durations (fade 200 ms, collapse 250 ms), drops them under
`prefers-reduced-motion`, and never animates the first render. A leaving component is `inert`
and `aria-hidden` while it animates out, then removed; keyboard focus it held moves to its nearest
shown ancestor. A static preview (the Studio canvas) never animates. `maskedWhen` is cosmetic — it
hides a value from onlookers, not from the client.

**Strict schema, lenient client.** The schema (CI and backend, on save and publish) rejects a
malformed condition or transition. A client that meets a condition it cannot evaluate (e.g. an
operator from a later minor) falls back per prop: `visibleWhen` → shown, `disabledWhen` →
enabled, `maskedWhen` → masked. The only client-side check is the `in` bound.

**A 2.2 client** ignores the unknown props: `visibleWhen` components always show (both feedback
buttons stay, the choice still colors the picked one), `disabledWhen` never disables (the
double-tap guard still holds), `toggle` does nothing, transitions are skipped — and **`maskedWhen`
shows the value**.

**Unknown action types (v2.3 client).** A node action or `onSuccess` / `onError` step of a type
the client does not know (a later minor's) is skipped — with the steps after it — and reported
once as `action_unsupported`; the screen still renders. The schema still rejects it.

Symbols added: `eye`, `eye.slash`.

### Interactive chart (v2.4, v2.5)

A chart's items can be picked; a tip at the picked item shows its data. v2.4: `bar`; v2.5: every kind,
with the same props (switching `kind` needs no new setup).

```json
{ "type": "chart", "id": "spend",
  "props": { "kind": "bar", "selectState": "spendBar", "initialSelection": "last",
             "selectedColor": "#D95C5C", "tip": "{{item.label}}\n**{{item.amount}}**" },
  "action": { "type": "api", "request": "coffeeSpending" } }
```

| Prop | Values | Effect |
| --- | --- | --- |
| `selectState` | identifier | bars can be picked: a tap writes state `$selected.<selectState>` = the item's `key` (no key: its index `"0"`, `"1"` …). Other components read it (`visibleWhen`, tokens). Tapping the picked bar keeps it |
| `initialSelection` | `last` · `first` · `none` (default) · an item key | the bar picked until a tap sets the state; re-resolved against the data, so a data source that lands later still gets it |
| `selectedColor` | color | the picked bar's color (others: the item's `color`, else `color`) |
| `tip` | text | shown above the picked bar: `{{item.<field>}}` reads the picked item, other tokens the screen data; `**bold**`, `*italic*` and line breaks apply |

The tip's place is computed from the data (the bar's center and top as percentages of the plot), never
measured, so every engine puts it in the same spot; at the first and the last bar it aligns to that edge.
It moves to a newly picked bar with a short slide (none on the first render, in a static preview, or
under `prefers-reduced-motion`). Each bar has a transparent button over it (the tap target, focusable,
`aria-label` = label and `amount` or value, `aria-pressed`); the tip is `aria-live="polite"`. On the
web, hovering a bar with a mouse **previews** its tip without changing the state. A 2.3 client ignores
all four: a static chart.

| Kind (v2.5) | Picked by | Marked by | Tip |
| --- | --- | --- | --- |
| `bar` | its column (button) | `selectedColor` | above the bar |
| `line` · `area` | its column (button): the nearest point along x | a round 10 px marker (`selectedColor`, else the line color) — HTML, as the stretched SVG would squash a circle | above the point |
| `pie` · `donut` | the slice, or its legend entry (a button; with `showLegend: false` the buttons stay, visually hidden) | the slice pulled out 4 along its middle (an SVG `transform` attribute), `selectedColor` when set | outside the slice along its middle, pushed away from the circle by its quadrant; the disc gets room around it |

A pie / donut sits **centered** with its legend **below** by default: `alignment` (`center` · `leading` ·
`trailing`) places it in the chart's width, `legendPosition` (`bottom` · `top` · `right` · `left`) moves the
legend (above / below: entries side by side, wrapping; beside: one per line).

The tip (and a point's marker) slides to a new pick; a pulled-out slice changes at once. A 2.4 client
picks bars only (line / area / pie / donut are static).

## Actions

| `type` | Required | Optional | Effect |
| --- | --- | --- | --- |
| `navigate` | `screen` | `params`, `presentation` `push`·`sheet`·`fullScreen` (v1.1) | host navigator |
| `api` | `request` | `params` | named request → response merged into data under the request name |
| `dismiss` | — | — | close / pop |
| `refresh` | — | — | reload the screen |
| `openURL` | `link` | — | host maps the **name** to a URL after its allow-list |
| `toast` (v1.1) | `message` | `level` `info`·`success`·`warning`·`error` | transient message |
| `native` (v1.1) | `command` | `params` | host command allow-listed by the app; result merged under the command name; unsupported → `onError` |

Every action may carry `onSuccess` / `onError` (linear chain, max depth 4). String
`params` may be `{{token}}`s; a param that is exactly one token keeps the value's
type. Inside a `form`, a button runs the form's field validation first and only
dispatches when it passes.

## Data and tokens

`{{a.b}}` resolves against the screen's data context: navigation params seed it,
`api` / `native` / `load` results merge in under their names, a `form` adds
`form.<field>`, a `list` row adds `<as>`. Reserved: `$selected.<state>` (v2.2 / 2.3),
`$request.<request>` (v2.3), `$load.<request>`. Missing tokens render as empty strings;
while a `load` request is pending, text whose tokens are still missing renders as a
loading placeholder.

## `screen.load`

All entries run in parallel once the payload is verified (also when served from
cache). Each result merges under its request name; a failed request marks
`$load.<request>` = `"error"` and the rest of the screen still renders.

## Variants

`variants.compact` (< 600 px) and `variants.wide` (≥ 600 px) replace `root` at that
width when present; `root` is the fallback.

## Fixtures

`fixtures/valid` must pass the schema and the client validator; `fixtures/invalid`
must be rejected by the schema. `npm test` runs both (`tests/spec.test.ts`).
