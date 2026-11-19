// Phase 0 gate: the spec (JSON Schema + fixtures) and the client validator agree.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import { CONTENT_PROPS, SHARED_CONTENT_PROPS, SchemaValidator, SduiBounds, SduiEnvelope, SduiPayload, TemplateDocument, ValuesDocument } from '../src/core'
import { ROOT, devEngine, fixture, fixtureJSON, fixtureNames } from './helpers'

const schema = JSON.parse(readFileSync(resolve(ROOT, 'spec/sdui.schema.json'), 'utf8'))
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema)

describe('spec/sdui.schema.json', () => {
  it.each(fixtureNames('valid'))('valid/%s passes the schema', (name) => {
    expect(validate(fixtureJSON(`valid/${name}`)), JSON.stringify(validate.errors)).toBe(true)
  })

  it.each(fixtureNames('invalid'))('invalid/%s is rejected by the schema', (name) => {
    expect(validate(fixtureJSON(`invalid/${name}`))).toBe(false)
  })
})

describe('client validator vs spec fixtures', () => {
  const validator = new SchemaValidator()
  const engine = devEngine()
  const promo = TemplateDocument.fromJSON(fixture('valid/template_promo.json'))

  // what the client does with each wire shape: an envelope's payload, a value set against
  // its template, or the engine's verify → decode → validate → compose (template, bundle, screen)
  const clientCheck = async (name: string, raw: Uint8Array): Promise<unknown> => {
    if (name === 'envelope.json') return validator.validate(SduiPayload.fromJSON(SduiEnvelope.fromJSON(raw).payload))
    if (name.startsWith('values_')) return validator.validateValues(ValuesDocument.fromJSON(raw), promo)
    return engine.materialize(raw)
  }

  it.each(fixtureNames('valid'))('valid/%s decodes and validates', async (name) => {
    await clientCheck(name, fixture(`valid/${name}`))
  })

  // Unknown structural keys are a schema-layer rejection (CI + backend). The client
  // ignores them by policy (forward-compatible minors) — and so never acts on them.
  const SCHEMA_ONLY = new Set(['action_extra_key.json', 'node_extra_key.json', 'api_raw_url.json', 'variants_unknown_key.json', 'values_extra_key.json'])

  // v2.3 state-bound props: props are open, so a malformed condition / transition is a schema
  // rejection (CI + backend); the client still renders the screen and falls back per prop.
  // An unknown action type (K5) is skipped by the client — never run — instead of failing it.
  const LENIENT = new Set(['action_unknown_type.json', 'condition_two_operators.json', 'condition_no_source.json', 'condition_two_sources.json', 'condition_unknown_operator.json', 'transition_unknown.json'])

  it.each(fixtureNames('invalid').filter((n) => !SCHEMA_ONLY.has(n) && !LENIENT.has(n)))('invalid/%s is rejected by decode or validation', async (name) => {
    await expect(Promise.resolve().then(() => clientCheck(name, fixture(`invalid/${name}`)))).rejects.toThrow()
  })

  it.each([...LENIENT])('invalid/%s: the client still materializes the screen', async (name) => {
    await clientCheck(name, fixture(`invalid/${name}`))
  })

  it.each([...SCHEMA_ONLY])('invalid/%s: the unknown keys are dropped, never used', (name) => {
    const raw = fixture(`invalid/${name}`)
    const payload = name.startsWith('values_') ? ValuesDocument.fromJSON(raw) : SduiPayload.fromJSON(raw)
    const json = JSON.stringify(payload.toJSON())
    expect(json).not.toContain('unexpected')
    expect(json).not.toContain('https://')
    expect(json).not.toContain('tablet')
  })
})

// F1: one source of bounds — the published spec/bounds.json, the schema, and the client defaults agree
// sdui-r: one source of what a value set may fill — backends read spec/content.json
describe('spec/content.json', () => {
  it('is CONTENT_PROPS / SHARED_CONTENT_PROPS, and no action', () => {
    const content = JSON.parse(readFileSync(resolve(ROOT, 'spec/content.json'), 'utf8')) as Record<string, unknown>
    expect(content.schemaVersion).toBe('2.0')
    expect(content.props).toEqual(CONTENT_PROPS)
    expect(content.shared).toEqual(SHARED_CONTENT_PROPS)
    expect(content.action).toBe(false)
  })
})

describe('spec/bounds.json', () => {
  const bounds = JSON.parse(readFileSync(resolve(ROOT, 'spec/bounds.json'), 'utf8')) as Record<string, unknown>
  const { $comment: _comment, schemaVersion, ...numbers } = bounds
  const defs = schema.$defs

  it('is what SduiBounds.default is built from (every field, nothing else)', () => {
    expect(schemaVersion).toBe('2.0')
    expect(numbers).toEqual({ ...SduiBounds.default })
  })

  it('matches every bound the schema also expresses', () => {
    expect(defs.value.anyOf.find((v: { type: string }) => v.type === 'string').maxLength).toBe(numbers.maxStringLength)
    expect(defs.value.anyOf.find((v: { type: string }) => v.type === 'array').maxItems).toBe(numbers.maxArrayItems)
    expect(defs.value.anyOf.find((v: { type: string }) => v.type === 'object').maxProperties).toBe(numbers.maxProps)
    expect(defs.props.maxProperties).toBe(numbers.maxProps)
    expect(defs.node.properties.children.maxItems).toBe(numbers.maxChildren)
    expect(defs.identifier.maxLength).toBe(numbers.maxIdentifierLength)
    expect(defs.screen.properties.load.maxItems).toBe(numbers.maxLoadRequests)
    expect(defs.screenState.maxProperties).toBe(numbers.maxStates)
    expect(defs.condition.properties.in.maxItems).toBe(numbers.maxConditionValues)
  })
})
