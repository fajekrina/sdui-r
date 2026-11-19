// spec 2.3 — screen state and transitions (phase 1: the document shape)
import { describe, expect, it } from 'vitest'
import { SchemaValidator, SduiBounds, SduiPayload, TemplateDocument, compose } from '../src/core'
import { EditorDocument, mergeContent, splitContent } from '../src/builder'
import { fixtureJSON } from './helpers'

const doc = (state: unknown) => TemplateDocument.decode({
  schemaVersion: '2.3',
  template: { key: 't', version: 1, state, root: { type: 'vstack', id: 'root', order: 0, children: [] } }
})

describe('screen state (document shape)', () => {
  it('decodes, keeps `initial`, ignores unknown keys inside an entry and round-trips', () => {
    const d = doc({ feedback: { initial: '{{insight.feedback}}', later: 1 }, shown: {} })
    expect(d.template.state).toEqual({ feedback: { initial: '{{insight.feedback}}' }, shown: {} })
    expect(TemplateDocument.decode(d.toJSON()).toJSON()).toEqual(d.toJSON())
    expect((d.toJSON().template as Record<string, unknown>).state).toEqual({ feedback: { initial: '{{insight.feedback}}' }, shown: {} })
  })

  it('a template without state writes none (2.2 documents stay byte-identical)', () => {
    expect('state' in (doc(undefined).toJSON().template as object)).toBe(false)
  })

  it('a non-string initial is a decode error', () => {
    expect(() => doc({ a: { initial: 1 } })).toThrow(/initial/)
  })

  it('compose carries the state to the screen', () => {
    const screen = compose(doc({ a: { initial: 'x' } }).template)
    expect(screen.state).toEqual({ a: { initial: 'x' } })
    expect(SduiPayload.decode(new SduiPayload('2.3', screen).toJSON()).screen.state).toEqual({ a: { initial: 'x' } })
  })

  it('the validator bounds the state: count, names, initial length', () => {
    const v = new SchemaValidator()
    const many = Object.fromEntries(Array.from({ length: SduiBounds.default.maxStates + 1 }, (_, i) => [`s${i}`, {}]))
    expect(() => v.validateTemplate(doc(many))).toThrow(/states exceed/)
    expect(() => v.validateTemplate(doc({ 'bad-name': {} }))).toThrow(/identifier/)
    expect(() => v.validateTemplate(doc({ a: { initial: 'x'.repeat(SduiBounds.default.maxStringLength + 1) } }))).toThrow(/string length/)
    expect(() => v.validateTemplate(doc({ ok: { initial: '{{a.b}}' } }))).not.toThrow()
  })
})

describe('the Studio keeps the state', () => {
  it('EditorDocument: import → export, undo of setScreenState', () => {
    const d = new EditorDocument({ mode: 'template' })
    d.importJSON(doc({ feedback: {} }).toJSON())
    expect(d.templateDocument().template.state).toEqual({ feedback: {} })
    d.setScreenState({ feedback: {}, shown: { initial: 'on' } })
    expect(JSON.parse(d.exportJSON()).template.state).toEqual({ feedback: {}, shown: { initial: 'on' } })
    d.undo()
    expect(d.state).toEqual({ feedback: {} })
  })

  it('mergeContent / splitContent keep it on the template (state is design, not content)', () => {
    const merged = mergeContent(doc({ feedback: { initial: '{{x}}' } })).document
    expect(merged.template.state).toEqual({ feedback: { initial: '{{x}}' } })
    const { template, values } = splitContent(merged)
    expect(template.template.state).toEqual({ feedback: { initial: '{{x}}' } })
    expect(JSON.stringify(values.toJSON())).not.toContain('feedback')
  })
})

describe('fixtures', () => {
  it('insight: the feedback buttons are state-bound and send the choice', () => {
    const d = TemplateDocument.decode(fixtureJSON('valid/template_insight.json'))
    expect(d.template.state.feedback).toEqual({ initial: '{{insight.feedback}}' })
    const like = compose(d.template).root
    const find = (n: typeof like, id: string): typeof like | undefined => n.id === id ? n : n.children.map((c) => find(c, id)).find(Boolean)
    const button = find(like, 'like')!
    expect(button.props.visibleWhen).toEqual({ state: 'feedback', in: ['', 'like'] })
    expect(button.action?.params).toEqual({ vote: '{{$selected.feedback}}' })
  })
})
