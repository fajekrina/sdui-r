// sdui-r: a screen = a template (ids + orders) and a value set, signed separately and
// composed by the client.
import { describe, expect, it, vi } from 'vitest'
import { templateScreenProvider } from '../src/browser'
import {
  MemoryCacheStore, PayloadSecurity, ScreenSource, SduiCache, SchemaValidator, TemplateDocument, ValuesDocument,
  base64Encode, bundleBytes, compose, createEngine, isContentProp, utf8, utf8String
} from '../src/core'
import { devEngine, envelopeJSON, fixture, fixtureJSON, signingKey } from './helpers'

const TEMPLATE = fixtureJSON('valid/template_promo.json') as { template: Record<string, unknown> }
const VALUES = fixtureJSON('valid/values_promo.json') as { values: Record<string, unknown> }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const bytes = (v: unknown) => utf8(JSON.stringify(v))

describe('compose', () => {
  const template = TemplateDocument.fromJSON(fixture('valid/template_promo.json')).template
  const values = ValuesDocument.fromJSON(fixture('valid/values_promo.json')).values

  it('sorts children by order, merges props over the defaults, keeps the template action', () => {
    const screen = compose(template, values)
    expect(screen.key).toBe('home')
    expect(screen.root.children.map((c) => c.id)).toEqual(['headline', 'hero-image', 'cta'])
    expect(screen.root.children[0]!.props).toEqual({ value: 'Cashback 20% untuk {{user.name}}', style: 'title' })
    expect(screen.root.children[1]!.props).toEqual({ name: 'promo-cashback', height: 120 })
    expect(screen.root.children[2]!.props.title).toBe('Ambil promo')
    expect(screen.root.children[2]!.action!.toJSON()).toEqual({ type: 'navigate', screen: 'offers' })
    expect(screen.load.map((l) => l.request)).toEqual(['getOffers'])
  })

  it('applies the same values to a variant through the same ids', () => {
    const wide = compose(template, values).variants.wide!
    expect(wide.type).toBe('hstack')
    expect(wide.children.map((c) => c.id)).toEqual(['hero-image', 'headline', 'cta'])
    expect(wide.children[1]!.props.value).toBe('Cashback 20% untuk {{user.name}}')
  })

  it('a chart\'s api action (its data source) joins screen.load once, with its params; template load first', () => {
    const t = TemplateDocument.decode({ schemaVersion: '2.0', template: { key: 'dash', version: 1, load: [{ request: 'getOffers' }], root: { type: 'vstack', id: 'root', order: 0, children: [
      { type: 'chart', id: 'a', order: 0, action: { type: 'api', request: 'salesSummary', params: { period: 'month' } } },
      { type: 'chart', id: 'b', order: 1, props: { data: [1, 2] } },
      { type: 'chart', id: 'c', order: 2, action: { type: 'api', request: 'getOffers' } },
      { type: 'button', id: 'd', order: 3, action: { type: 'api', request: 'submitCheckout' } }
    ] } } }).template
    const screen = compose(t)
    expect(screen.load).toEqual([{ request: 'getOffers' }, { request: 'salesSummary', params: { period: 'month' } }])
  })

  it('without values: the template key and its defaults (a preview)', () => {
    const screen = compose(template)
    expect(screen.key).toBe('promoCard')
    expect(screen.root.children[0]!.props.value).toBe('Judul')
  })
})

describe('SchemaValidator: template + values', () => {
  const validator = new SchemaValidator()
  const doc = (t: unknown) => TemplateDocument.decode({ schemaVersion: '2.0', template: t })

  it('needs an id and an order on every node, unique ids, unique sibling orders', () => {
    const noOrder = clone(TEMPLATE.template) as { root: { children: Record<string, unknown>[] } }
    delete noOrder.root.children[0]!.order
    expect(() => validator.validateTemplate(doc(noOrder))).toThrow(/needs an order/)
    const dupId = clone(TEMPLATE.template) as { root: { children: Record<string, unknown>[] } }
    dupId.root.children[1]!.id = 'cta'
    expect(() => validator.validateTemplate(doc(dupId))).toThrow(/duplicate component id 'cta'/)
    const dupOrder = clone(TEMPLATE.template) as { root: { children: Record<string, unknown>[] } }
    dupOrder.root.children[1]!.order = 2
    expect(() => validator.validateTemplate(doc(dupOrder))).toThrow(/duplicate order 2/)
    const badId = clone(TEMPLATE.template) as { root: { children: Record<string, unknown>[] } }
    badId.root.children[1]!.id = '../x'
    expect(() => validator.validateTemplate(doc(badId))).toThrow(/invalid component id/)
  })

  it('rejects values for another template release, or for ids the template lacks', () => {
    const t = doc(TEMPLATE.template)
    const v = (patch: (x: { values: Record<string, unknown> }) => void) => { const x = clone(VALUES); patch(x); return ValuesDocument.decode(x) }
    expect(() => validator.validateValues(v((x) => { (x.values.template as { version: number }).version = 2 }), t)).toThrow(/promoCard@2/)
    expect(() => validator.validateValues(v((x) => { (x.values.components as Record<string, unknown>).ghost = { props: { value: 'x' } } }), t)).toThrow(/ghost: no such component/)
    expect(() => validator.validateValues(v((x) => { (x.values.components as Record<string, unknown>).cta = { action: { type: 'navigate', screen: 'https://x' } } }), t)).toThrow(/action is decided by the template/)
    expect(() => validator.validateValues(v(() => undefined), t)).not.toThrow()
  })

  it('only content props: style, layout and form rules are decided by the template', () => {
    const t = doc(TEMPLATE.template)
    const v = (components: Record<string, unknown>) => ValuesDocument.decode({ ...clone(VALUES), values: { ...clone(VALUES).values, components } })
    expect(() => validator.validateValues(v({ headline: { props: { value: 'Halo', a11yLabel: 'Judul' } }, 'hero-image': { props: { name: 'x' } }, cta: { props: { title: 'Ya' } } }), t)).not.toThrow()
    expect(() => validator.validateValues(v({ headline: { props: { style: 'caption' } } }), t)).toThrow(/headline.props.style: not content of a text/)
    expect(() => validator.validateValues(v({ 'hero-image': { props: { height: 400 } } }), t)).toThrow(/props.height: not content of a image/)
    expect(() => validator.validateValues(v({ cta: { props: { variant: 'plain' } } }), t)).toThrow(/variant/)
    expect(() => validator.validateValues(v({ root: { props: { padding: 0 } } }), t)).toThrow(/root.props.padding/)
    expect(isContentProp('chart', 'data')).toBe(true)
    expect(isContentProp('chart', 'kind')).toBe(false)
    expect(isContentProp('mySlot', 'anything')).toBe(false)
  })

  it('a different major is rejected', () => {
    expect(() => validator.validateTemplate(TemplateDocument.decode({ ...TEMPLATE, schemaVersion: '1.1' }))).toThrow(expect.objectContaining({ kind: 'unsupportedVersion' }))
  })
})

describe('engine: bundles', () => {
  it('renders a { template, values } bundle and a bare template', async () => {
    const engine = devEngine()
    const bundle = await engine.load(ScreenSource.inline({ template: TEMPLATE, values: VALUES }))
    expect(bundle.kind === 'loaded' && bundle.screen.root.children[0]!.props.value).toBe('Cashback 20% untuk {{user.name}}')
    const bare = await engine.load(ScreenSource.inline(TEMPLATE))
    expect(bare.kind === 'loaded' && bare.screen.key).toBe('promoCard')
  })

  it('a value set alone is refused (it needs its template)', async () => {
    const state = await devEngine().load(ScreenSource.inline(VALUES))
    expect(state.kind === 'failed' && state.error.kind).toBe('schema')
  })

  it('signed: both parts must verify; a forged value set or an unsigned part is rejected', async () => {
    const key = await signingKey()
    const verifier = { verify: async (data: Uint8Array, signature: Uint8Array) => {
      const k = await crypto.subtle.importKey('raw', new Uint8Array(key.publicKey), { name: 'Ed25519' }, false, ['verify'])
      return crypto.subtle.verify({ name: 'Ed25519' }, k, new Uint8Array(signature), new Uint8Array(data))
    } }
    const engine = createEngine({ security: PayloadSecurity.signed(verifier) })
    const seal = async (doc: unknown) => { const p = bytes(doc); return utf8String(envelopeJSON(p, await key.sign(p))) }
    const t = await seal(TEMPLATE)
    const v = await seal(VALUES)
    const ok = await engine.load(ScreenSource.inline(bundleBytes(t, v)))
    expect(ok.kind).toBe('loaded')

    const forged = JSON.parse(v) as { payload: string }
    const evil = clone(VALUES); (evil.values.components as Record<string, { props: Record<string, unknown> }>).headline!.props.value = 'HACKED'
    forged.payload = base64Encode(bytes(evil))
    const bad = await engine.load(ScreenSource.inline(bundleBytes(t, JSON.stringify(forged))))
    expect(bad.kind === 'failed' && bad.error.kind).toBe('signatureInvalid')

    const unsigned = await engine.load(ScreenSource.inline(bundleBytes(t, JSON.stringify(VALUES))))
    expect(unsigned.kind === 'failed' && unsigned.error.kind).toBe('signatureInvalid')
  })
})

describe('templateScreenProvider', () => {
  const routes = (overrides: Record<string, () => Response> = {}) => vi.fn(async (url: unknown, _init?: RequestInit) => {
    const u = String(url)
    for (const [k, f] of Object.entries(overrides)) if (u.endsWith(k)) return f()
    if (u.endsWith('/templates/m/promoCard/v1')) return new Response(JSON.stringify(TEMPLATE), { status: 200 })
    if (u.includes('/screens/m/home')) return new Response(JSON.stringify(VALUES), { status: 200, headers: { ETag: '"v-1"' } })
    return new Response('{}', { status: 404 })
  })

  it('fetches the value set, then its template once (immutable), and the engine composes them', async () => {
    const fetchImpl = routes()
    const engine = devEngine({ screenFactory: templateScreenProvider({ basePath: '/api/client', merchantId: 'm', fetchImpl }) })
    const a = await engine.load(ScreenSource.key('home'))
    const b = await engine.load(ScreenSource.key('home'))
    expect(a.kind === 'loaded' && a.screen.root.children.map((c) => c.id)).toEqual(['headline', 'hero-image', 'cta'])
    expect(b.kind).toBe('loaded')
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['/api/client/screens/m/home', '/api/client/templates/m/promoCard/v1', '/api/client/screens/m/home'])
  })

  it('reads the template ref from inside an envelope; a bad ref fails closed', async () => {
    const enveloped = { schemaVersion: '2.0', alg: 'ed25519', payload: base64Encode(bytes(VALUES)), signature: base64Encode(utf8('x')) }
    const fetchImpl = routes({ '/screens/m/home': () => new Response(JSON.stringify(enveloped), { status: 200 }) })
    const factory = templateScreenProvider({ basePath: '/c', merchantId: 'm', fetchImpl })
    const fetched = await factory.data('home')
    expect(JSON.parse(utf8String(fetched))).toEqual({ template: TEMPLATE, values: enveloped })

    const evil = clone(VALUES); (evil.values.template as { key: string }).key = '../../admin'
    const bad = templateScreenProvider({ basePath: '/c', merchantId: 'm', fetchImpl: routes({ '/screens/m/home': () => new Response(JSON.stringify(evil), { status: 200 }) }) })
    await expect(bad.data('home')).rejects.toMatchObject({ kind: 'decode' })
  })

  it('a value set for another screen is rejected (no substitution)', async () => {
    const other = clone(VALUES); other.values.screen = 'transfer'
    const fetchImpl = routes({ '/screens/m/home': () => new Response(JSON.stringify(other), { status: 200 }) })
    const engine = devEngine({ screenFactory: templateScreenProvider({ basePath: '/c', merchantId: 'm', fetchImpl }) })
    const state = await engine.load(ScreenSource.key('home'))
    expect(state.kind === 'failed' && state.error.message).toMatch(/for screen 'transfer'/)
  })

  it('with a cache: the bundle is cached, revalidated with If-None-Match, 304 keeps it', async () => {
    const fetchImpl = routes()
    const cache = new SduiCache({ store: new MemoryCacheStore() })
    const make = () => devEngine({ cache, screenFactory: templateScreenProvider({ basePath: '/c', merchantId: 'm', fetchImpl }) })
    expect((await make().load(ScreenSource.key('home'))).kind).toBe('loaded')
    fetchImpl.mockImplementation(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe('/c/screens/m/home')
      expect((init!.headers as Record<string, string>)['If-None-Match']).toBe('"v-1"')
      return new Response(null, { status: 304 })
    })
    const engine = make()
    const state = await engine.load(ScreenSource.key('home'))
    expect(state.kind === 'loaded' && state.origin).toBe('cache')
    await engine.settled()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
