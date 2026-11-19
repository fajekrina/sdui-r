# @fajekrina/sdui-r

Server-driven UI for the web, Android WebView and iOS WKWebView — **one spec, one
engine, three hosts.** In sdui-r a screen is a **template** (the layout: components with
an `id` and an `order`, reusable across screens and merchants) plus a **value set** (the
content of each component, per merchant screen). The two are stored, reviewed, published
and signed separately; the engine verifies both and composes them. This package owns
*how* the result renders, navigates, and talks to the network.

Forked from [`@fajekrina/sdui`](https://github.com/fajekrina/sdui) (which composes screens
from components). Design notes: `DESAIN-SDUI-R.md` in the workspace.

## Template + values

```jsonc
// template (template service) — structure + behavior, every node has id + order
{ "schemaVersion": "2.0",
  "template": { "key": "promoCard", "version": 1, "title": "Kartu promo",
    "root": { "type": "vstack", "id": "root", "order": 0, "children": [
      { "type": "text",   "id": "headline", "order": 0, "props": { "value": "Judul", "style": "title" } },
      { "type": "button", "id": "cta",      "order": 1, "props": { "title": "Lihat" },
        "action": { "type": "navigate", "screen": "offers" } } ] } } }

// value set (value service) — content per component id, for one merchant screen
{ "schemaVersion": "2.0",
  "values": { "screen": "home", "template": { "key": "promoCard", "version": 1 },
    "components": { "headline": { "props": { "value": "Cashback 20%" } },
                    "cta": { "action": { "type": "navigate", "screen": "promoDetail" } } } } }
```

```ts
import { createEngine, PayloadSecurity } from '@fajekrina/sdui-r'
import { templateScreenProvider, specManifestLoader, webCryptoEd25519 } from '@fajekrina/sdui-r/browser'

const delivery = { basePath: '/api/client', merchantId: 'merchant_demo' }
const engine = createEngine({
  security: PayloadSecurity.signed(await webCryptoEd25519(publicKey)),
  screenFactory: templateScreenProvider(delivery),   // value set → its template → one bundle
  manifestLoader: specManifestLoader(delivery)
})
```

- Children render in `order`; value props are merged over the template defaults; a value
  action replaces the template action; width variants get the same values through the ids.
- Fail-closed: a value set for another template release, an id the template lacks, a
  value set for another screen, or either part unsigned/forged → the screen is rejected.
- **Two builders, one admin**: the **Template Builder** (`mountTemplateBuilder` /
  `<SduiTemplateBuilder>`: components → template) and the **content editor**
  (`mountScreenBuilder` / `<SduiScreenBuilder>`: fill in a template's components → value set;
  `showTemplates: false` when the page's template is fixed). The same admin designs and fills;
  `onPublish` publishes directly (no review step).

- **Spec** — [`spec/sdui.schema.json`](spec/sdui.schema.json): our own contract,
  derived from [murti](https://github.com/iQbalADR/murti) v1 with additive v1.1
  features (forms, `screen.load`, toast/native actions, layout components, theme
  tokens, width variants). Guide: [`spec/README.md`](spec/README.md).
- **Engine** — headless TypeScript with the MurtiEngine structure: injected
  component/screen factories, action dispatcher, validator, security and cache.
  No DOM, no framework; every side effect through ports.
- **Renderers** — React, Vue and vanilla render the engine's `RenderNode` tree
  generically (identical DOM, enforced by a parity test).
- **Hosts** — browser (`./browser`) or a native app via the bridge (`./bridge`).

## Install

```bash
npm install @fajekrina/sdui-r
```

| Import | What |
| --- | --- |
| `@fajekrina/sdui-r` | engine: `createEngine`, `ScreenSource`, `ComponentFactory`, `ScreenFactory`, `ActionDispatcher`, `PayloadSecurity`, `SduiCache`, model, ports |
| `@fajekrina/sdui-r/pwa` | `connectivity`, `onServiceWorkerUpdate` |
| `@fajekrina/sdui-r/browser` | `specScreenProvider`, `specManifestLoader`, `fetchNetworkClient`, `webCryptoEd25519`, `indexedDbStore`, `aesGcmCipher`, `browserNavigator`, `windowViewport`, `browserPorts` |
| `@fajekrina/sdui-r/bridge` | `nativeBridgePorts`, `detectHost`, `applyTheme`, `verifyBundleManifest` — see [HOST-BRIDGE.md](HOST-BRIDGE.md) |
| `@fajekrina/sdui-r/react` · `/vue` | `<SduiScreen engine source />` |
| `@fajekrina/sdui-r/vanilla` | `mount(el, { engine, source })` |
| `@fajekrina/sdui-r/builder` · `/builder/react` · `/builder/vue` | `EditorDocument`, DSL, `DSLExport`, `mountStudio` / `<SduiBuilder />` |
| `@fajekrina/sdui-r/compat` | `fromUniversal()` — import legacy Universal pages in the builder |
| `@fajekrina/sdui-r/spec/sdui.schema.json` | the schema (backend validation, CI) |

## Quickstart (browser)

```ts
import { ActionDispatcher, PayloadSecurity, SduiCache, createEngine, keyedVerifier } from '@fajekrina/sdui-r'
import { MESSAGES_ID } from '@fajekrina/sdui-r/i18n'
import { browserNavigator, fetchNetworkClient, indexedDbStore, specManifestLoader, specScreenProvider, webCryptoEd25519, windowViewport } from '@fajekrina/sdui-r/browser'

// spec screens + version manifest: GET {basePath}/manifest/{mid}, GET {basePath}/screens/{mid}/{key}/v{seq}
const delivery = { basePath: '/api/universal/v1/client', merchantId: 'merchant_demo' }

const engine = createEngine({
  screenFactory: specScreenProvider(delivery),
  manifestLoader: specManifestLoader(delivery),
  actionDispatcher: new ActionDispatcher({
    // payloads only NAME requests; method + path live here (the allow-list)
    network: fetchNetworkClient({
      baseUrl: '/api', endpoints: { getBalance: { method: 'GET', path: '/accounts/balance' } },
      getHeaders: async () => ({ Authorization: `Bearer ${await session.token()}` })
    }),
    navigator: browserNavigator({ navigate: (screen, params) => router.push({ name: screen, query: params }), links: { helpCenter: 'https://help.example.com' } })
  }),
  // required: none = reject all. keyId as the backend sends it in the envelope (universal-service:
  // the first 16 hex chars of sha256(public key), listed by GET {basePath}/signing-keys)
  security: PayloadSecurity.signed(keyedVerifier({ [PAYLOAD_KEY_ID]: await webCryptoEd25519(EMBEDDED_PUBLIC_KEY) })),
  assetURL: (name) => `https://cdn.example.com/sdui/${name}.webp`,
  messages: MESSAGES_ID,
  cache: new SduiCache({ store: indexedDbStore() }),
  viewport: windowViewport()
})
await engine.refreshManifest()   // before the first screen, and again when the app resumes
```

```tsx
// React
import { SduiScreen } from '@fajekrina/sdui-r/react'
<SduiScreen engine={engine} source={{ key: 'home' }} seed={{ user }} />
```

```vue
<!-- Vue -->
<SduiScreen :engine="engine" :source="{ key: 'home' }" :seed="{ user }" />
```

```ts
// vanilla
import { mount } from '@fajekrina/sdui-r/vanilla'
mount(document.getElementById('app')!, { engine, source: { key: 'home' } })
```

## Inside an Android / iOS WebView

```ts
import { nativeBridgePorts } from '@fajekrina/sdui-r/bridge'

const host = nativeBridgePorts()   // Android addWebMessageListener / iOS WKScriptMessageHandler
const engine = createEngine({
  actionDispatcher: new ActionDispatcher({
    navigator: host.navigator, host: host.host,
    network: fetchNetworkClient({ baseUrl, endpoints, getHeaders: host.getHeaders })   // token pattern B
  }),
  viewport: host.viewport,
  onEvent: host.onEvent
})
```

The host protocol, security rules and bundle distribution are in [HOST-BRIDGE.md](HOST-BRIDGE.md).

## Auth: a BFF session or a bearer token

The package never holds credentials. Two supported patterns:

```ts
// Web / PWA — a BFF on the app's origin holds the session cookie; send the CSRF token
const network = fetchNetworkClient({
  baseUrl: '/bff', endpoints,
  credentials: 'same-origin',                                   // never 'include'
  getHeaders: async ({ refresh }) => ({ 'X-CSRF-Token': await csrf.token({ refresh }) }),
  traceHeaders: () => ({ traceparent: currentTraceparent() })   // optional
})

// WebView host (token pattern B) — a short-lived token from the host, in memory only
const network = fetchNetworkClient({
  baseUrl, endpoints,                                           // credentials: 'omit' (default)
  getHeaders: async ({ refresh }) => ({ Authorization: `Bearer ${await host.token({ refresh })}` })
})
```

A `401` calls `getHeaders({ refresh: true })` once and retries; a second `401` reaches
`onError` with the server's error code, so the app can step up or log in. API results are
never cached; headers never reach the `Logger`.

## Offline and PWA

```ts
import { connectivity, onServiceWorkerUpdate } from '@fajekrina/sdui-r/pwa'

const engine = createEngine({ /* … */, connectivity: connectivity({ probeUrl: '/healthz' }) })

// "New version available": only when no screen has a deferred update or a dirty form
onServiceWorkerUpdate({
  canApply: () => !controllers.some((c) => c.hasPendingUpdate),
  onAvailable: (apply) => showBanner('New version', apply)   // SW skips waiting on {type:'SKIP_WAITING'}
})
```

- **Revalidation:** versioned screens (`…/screens/{mid}/{key}/v{seq}` from the manifest) are
  fetched once; unversioned ones are revalidated with `If-None-Match` — a `304` costs no
  download, decode or re-render (event `screen_not_modified`).
- **Offline after a restart:** the last verified layout of each screen is remembered as a
  sealed pointer in the `CacheStore` and **re-verified** when used; the screen loads with
  `origin: 'offline'`. Nothing cached → `SduiError.network` (show an offline page).
- **Offline actions:** `api` fails fast with a network error into `onError`; `screen.load`
  sends nothing and reads `$load.<request> = "error"` (`$offline` is `true`).
- **Back online:** the manifest is refreshed, then screens reload their data
  (event `connectivity_changed`).
- Raw bytes above `maxEnvelopeBytes` (default 1 MiB) are rejected before decode
  (`envelope_too_large`).

## Strict CSP

Renderers write styles through CSSOM only and the Studio installs its stylesheet as a
constructable stylesheet, so the bundle runs under:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self';
require-trusted-types-for 'script'; trusted-types 'none'
```

No `innerHTML`/`eval`/style attributes anywhere (a test gate over `src/`). Engines without
constructable stylesheets (Safari < 16.4) fall back to a `<style>` element for the Studio —
there, pass `stylesheet: 'external'` and link `@fajekrina/sdui-r/builder/studio.css`.

## Authoring

```ts
import { screen, vstack, text, button, navigate } from '@fajekrina/sdui-r/builder'

const json = screen('home', vstack({ spacing: 12 }, [
  text('Halo, {{user.name}}', { style: 'title' }),
  button('Detail', navigate('productDetail', { presentation: 'sheet' }))
])).validated().toJSON()
```

Or visually: `<SduiBuilder onSave={…} onPublish={…} />` (React/Vue) — the canvas
uses the client's own components, export validates, and **Export DSL** turns any
screen back into code.

```tsx
<SduiBuilder
  title="merchant / home"
  screens={['home', 'transfer']}          // navigate.screen
  requests={['getBalance', 'createTransfer']} // api.request
  links={['helpCenter']}                  // openURL.link
  commands={['biometricConfirm']}         // native.command
  onSave={(payload) => saveDraft(payload)}
/>
```

- Drag components from the palette onto the canvas or the outline (or click to
  insert); drop inside a container, or before/after a node. Drag nodes to move
  them; the inspector's **parent** picker does the same.
- **Preview** hides the editor chrome and renders the screen as the client does.
- The action editor is a form per action type: the target is picked from the
  name lists above (any other name can be typed), plus presentation, toast
  message/level, params, and the `onSuccess`/`onError` chain. The lists are names
  from the app's allow-lists — URLs never enter a payload.
- Save/Publish report `Saved ✔` / `Save failed: …` in the toolbar.

- The inspector groups the props (Content · Field · Data · Choice · State · Layout · Style · Accessibility).
  Spec 2.2 props (fill, overlap, outline, per-side padding, shadow, pin, button icons and choices)
  have fields; `systemName` suggests the built-in symbols; with `uploadAsset` an image's `name`
  gets an upload button (the template's default picture).
  A text's value is a multi-line box with **B** / *I* buttons (spec 2.1 `markup`); picker
  options are a table; colors are theme tokens or hex.
- Interactive bar chart (spec 2.4): in Choice, `tip` lists the picked item's fields
  (`{{item.amount}}` …, from the static data or the source's sample) and turns on `selectState`;
  `initialSelection` offers last / first / none and the item keys; `selectedColor`. Preview: tap a
  bar (or hover with a mouse) to see the tip move.
- Text typography (spec 2.3): `font` is picked from rounded · serif · mono plus the app's
  `catalog.fonts` (a name the app maps with `--sdui-font-<name>`, never CSS); `transform`,
  `letterSpacing`, `lineHeight` sit in Style.
- Spec 2.3 interactions without scripts: the **State** group picks `visibleWhen` / `disabledWhen` /
  `maskedWhen` (state or request → operator → value) and `transition` (fade · collapse); a button's
  `toggle` sits in Choice. The **State** panel (left column) declares states with their `initial`
  value and **try**s values (and request results) on the canvas; a component hidden by them is
  marked ◐ in the outline and, when selected, drawn dimmed. **Preview** runs the page with the
  client engine (taps, `$request`, animations; requests answered as tried). `stateWarnings` reports
  conditions no button can change, states nothing writes, unknown requests, unused states.
- The action section follows what the component does with an action (`ComponentInfo.action`):
  **Interaction** for a button (or a custom component), **Data source** for a chart (an `api`
  request only), nothing for other built-ins (a leftover action is shown only to remove it).

```tsx
<SduiTemplateBuilder
  catalog={{ screens, requests, sources, links, commands, assets }}   // names from the app's catalog
  baseline={activeRelease}            // lists the draft's changes against the active release
  onSave={(payload) => saveDraft(payload)}
  onPublish={(payload) => publish(payload)}   // live at once: no review step
/>
```

`diff(base, next)` (`@fajekrina/sdui-r/builder`) is the same comparison, headless — for a
review page or a backend check.

## Extending

```ts
class RatingComponent implements Component {
  static readonly type = 'rating'
  makeView(node: SduiNode, ctx: RenderContext) {
    return renderNode(ctx.keyFor(node), 'span', { text: '★'.repeat(node.int('stars')) })
  }
}
engine.componentFactory.register(new RatingComponent())
```

Toolkit-specific widgets (a React chart, a map) go through slots:
`<SduiScreen slots={{ chart: (slot) => <Chart data={slot.props.series} /> }} />`.

## Security model

Without `security`, a release engine **rejects every payload** (fail-closed); development
says `PayloadSecurity.insecureDevelopment` out loud. Without a manifest, cached screens are
served stale-while-revalidate; the applied manifest (and its anti-rollback `sequence`) is
persisted across restarts. Each tap is locked while its action runs and carries an
`Idempotency-Key`. Image names resolve to relative paths only unless you map them.


Closed action vocabulary with **named** targets (never a raw URL); bounded validation
(depth 32, nodes 5000, strings 4096, chain 4, load 8); Ed25519 envelopes verified on
every load including from cache (`keyId` for rotation); signed manifest with a
monotonic `sequence` (anti-rollback); named field patterns (no regex from payloads);
`secure` fields never logged or cached; no `innerHTML` anywhere.

## Develop

```bash
npm ci
npm run typecheck
npm test             # unit + spec gate (Ajv) + core purity + React=Vue=vanilla parity
npm run build
npm run size         # bundle budget
npm run check:package  # the packed tarball typechecks for CJS and ESM consumers
npm run conformance  # Chromium ≡ WebKit / Firefox, strict CSP (npx playwright install chromium webkit firefox)
npm run test:contract  # against a running universal-service (SDUI_E2E_BASE_URL)
```

See [CHANGELOG.md](CHANGELOG.md). Licensed MIT; the spec
and murti-derived parts are Apache-2.0 — see [NOTICE](NOTICE).
