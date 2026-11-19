// spec 2.3 — screen state and transitions (phase 1: the document shape; phase 2: the engine)
import { describe, expect, it, vi } from 'vitest'
import {
  ActionDispatcher, ActionSpec, SchemaValidator, ScreenSource, SduiBounds, SduiNode, SduiPayload, Symbols, TemplateDocument, compose, evaluate,
  type RenderNode, type SduiEvent
} from '../src/core'
import { EditorDocument, mergeContent, splitContent } from '../src/builder'
import { devEngine, fixtureJSON } from './helpers'

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

// MARK: - phase 2: the engine

const byKey = (node: RenderNode | undefined, key: string): RenderNode | undefined =>
  !node ? undefined : node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)

async function screenOf(screen: object, init: Parameters<typeof devEngine>[0] = {}) {
  const s = devEngine(init).screen(ScreenSource.inline({ schemaVersion: '2.3', screen: { key: 's', ...screen } }))
  await s.load()
  return s
}

const bytes = (json: string) => new TextEncoder().encode(json)

describe('conditions', () => {
  const data: Record<string, unknown> = { '$selected.feedback': 'like', '$selected.n': 3, '$request.send': 'pending' }
  const read = (k: string) => data[k] as never
  it.each([
    [{ state: 'feedback', equals: 'like' }, true],
    [{ state: 'feedback', notEquals: 'like' }, false],
    [{ state: 'feedback', in: ['', 'like'] }, true],
    [{ state: 'feedback', in: ['dislike'] }, false],
    [{ state: 'unset', empty: true }, true],
    [{ state: 'unset', notEmpty: true }, false],
    [{ state: 'n', equals: '3' }, true],
    [{ request: 'send', equals: 'pending' }, true],
    [{ request: 'other', empty: true }, true]
  ])('%j → %s', (c, expected) => {
    expect(evaluate(c as never, read)).toBe(expected)
  })

  it.each([
    [{ state: 'feedback', lessThan: '1' }],          // a later minor's operator
    [{ state: 'feedback', equals: 'a', empty: true }],
    [{ equals: 'a' }],
    [{ state: 'a', request: 'b', equals: 'a' }],
    [{ state: 'feedback', empty: false }],
    [{ state: 'feedback', in: 'like' }],
    ['feedback']
  ])('%j cannot be evaluated (null)', (c) => {
    expect(evaluate(c as never, read)).toBeNull()
  })
})

describe('state-bound props', () => {
  it('visibleWhen hides the component; an unreadable condition shows it', async () => {
    const s = await screenOf({ root: { type: 'vstack', id: 'root', children: [
      { type: 'text', id: 'a', props: { value: 'A', visibleWhen: { state: 'x', equals: 'on' } } },
      { type: 'text', id: 'b', props: { value: 'B', visibleWhen: { state: 'x', lessThan: '1' } } }
    ] } })
    const root = s.render().nodes[0]!
    expect(byKey(root, 'a')).toBeUndefined()
    expect(byKey(root, 'b')).toBeDefined()
  })

  it('disabledWhen: a disabled button has no handler; a field is disabled', async () => {
    const s = await screenOf({ root: { type: 'vstack', id: 'root', children: [
      { type: 'button', id: 'go', props: { title: 'Go', disabledWhen: { state: 'x', empty: true } }, action: { type: 'dismiss' } },
      { type: 'textField', id: 'f', props: { name: 'f', label: 'F', disabledWhen: { state: 'x', empty: true } } },
      { type: 'button', id: 'ok', props: { title: 'Ok', disabledWhen: { state: 'x', lessThan: '1' } }, action: { type: 'dismiss' } }
    ] } })
    const root = s.render().nodes[0]!
    expect(byKey(root, 'go')!.attrs.disabled).toBe(true)
    expect(byKey(root, 'go')!.on).toBeUndefined()
    expect(JSON.stringify(byKey(root, 'f'))).toContain('"disabled":true')
    expect(byKey(root, 'ok')!.on?.click).toBeDefined()   // unreadable → enabled
  })

  it('maskedWhen hides the value, and fails closed when unreadable; toggle flips the state', async () => {
    const s = await screenOf({
      state: { shown: {} },
      root: { type: 'vstack', id: 'root', children: [
        { type: 'text', id: 'bal', props: { value: 'Rp 1.000.000', a11yLabel: 'Saldo Rp 1.000.000', maskedWhen: { state: 'shown', empty: true } } },
        { type: 'text', id: 'odd', props: { value: 'Rp 5', maskedWhen: { state: 'shown', lessThan: '1' } } },
        { type: 'button', id: 'eye', props: { title: '', toggle: 'shown' } }
      ] }
    })
    let root = s.render().nodes[0]!
    expect(byKey(root, 'bal')!.text).toBe('••••••')
    expect(JSON.stringify(root)).not.toContain('1.000.000')
    expect(byKey(root, 'odd')!.text).toBe('••••••')
    expect(byKey(root, 'eye')!.attrs['aria-pressed']).toBe('false')
    await s.handle(byKey(root, 'eye')!.on!.click!)
    root = s.render().nodes[0]!
    expect(s.data.value('$selected.shown')).toBe('on')
    expect(byKey(root, 'eye')!.attrs['aria-pressed']).toBe('true')
    expect(byKey(root, 'bal')!.text).toBe('Rp 1.000.000')
    await s.handle(byKey(root, 'eye')!.on!.click!)
    expect(s.data.value('$selected.shown')).toBe('')
    expect(byKey(s.render().nodes[0], 'bal')!.text).toBe('••••••')
  })
})

describe('the feedback interaction (insight)', () => {
  const send = { type: 'api', request: 'sendFeedback', params: { vote: '{{$selected.feedback}}' } }
  const buttons = [
    { type: 'button', id: 'dislike', props: { title: 'Kurang Suka', group: 'feedback', value: 'dislike', visibleWhen: { state: 'feedback', in: ['', 'dislike'] }, disabledWhen: { request: 'sendFeedback', equals: 'pending' } }, action: send },
    { type: 'button', id: 'like', props: { title: 'Suka!', group: 'feedback', value: 'like', visibleWhen: { state: 'feedback', in: ['', 'like'] }, disabledWhen: { request: 'sendFeedback', equals: 'pending' } }, action: send },
    { type: 'text', id: 'thanks', props: { value: 'Terima kasih!', visibleWhen: { request: 'sendFeedback', equals: 'success' } } }
  ]

  it('a tap keeps only the picked button; pending disables it; success shows the thanks', async () => {
    let finish!: (b: Uint8Array) => void
    const perform = vi.fn(() => new Promise<Uint8Array>((r) => { finish = r }))
    const s = await screenOf({ state: { feedback: {} }, root: { type: 'hstack', id: 'root', children: buttons } }, { actionDispatcher: new ActionDispatcher({ network: { perform } }) })
    let root = s.render().nodes[0]!
    expect(byKey(root, 'like')).toBeDefined()
    expect(byKey(root, 'dislike')).toBeDefined()
    expect(byKey(root, 'thanks')).toBeUndefined()
    const tap = s.handle(byKey(root, 'like')!.on!.click!)
    root = s.render().nodes[0]!
    expect(byKey(root, 'dislike')).toBeUndefined()
    expect(byKey(root, 'like')!.attrs.disabled).toBe(true)
    expect(s.data.value('$request.sendFeedback')).toBe('pending')
    finish(bytes('{}'))
    await tap
    root = s.render().nodes[0]!
    expect(s.data.value('$request.sendFeedback')).toBe('success')
    expect(byKey(root, 'like')!.attrs.disabled).toBeFalsy()
    expect(byKey(root, 'thanks')).toBeDefined()
    expect((perform.mock.calls[0] as unknown[])[1]).toEqual({ vote: 'like' })
  })

  it('a failed request reads error', async () => {
    const perform = vi.fn(async (): Promise<Uint8Array> => { throw new Error('down') })
    const s = await screenOf({ root: { type: 'hstack', id: 'root', children: buttons } }, { actionDispatcher: new ActionDispatcher({ network: { perform } }) })
    await s.handle(byKey(s.render().nodes[0], 'dislike')!.on!.click!)
    expect(s.data.value('$request.sendFeedback')).toBe('error')
    expect(byKey(s.render().nodes[0], 'thanks')).toBeUndefined()
  })
})

describe('initial: the container for a stored choice', () => {
  it('follows the data until a tap sets the state', async () => {
    let answer!: (b: Uint8Array) => void
    const perform = vi.fn((req: { rawValue: string }) => req.rawValue === 'insight'
      ? new Promise<Uint8Array>((r) => { answer = r })
      : Promise.resolve(bytes('{}')))
    const s = await screenOf({
      load: [{ request: 'insight' }],
      state: { feedback: { initial: '{{insight.feedback}}' } },
      root: { type: 'hstack', id: 'root', children: [
        { type: 'button', id: 'like', props: { title: 'Suka!', group: 'feedback', value: 'like' } },
        { type: 'button', id: 'dislike', props: { title: 'Kurang', group: 'feedback', value: 'dislike', visibleWhen: { state: 'feedback', in: ['', 'dislike'] } } }
      ] }
    }, { actionDispatcher: new ActionDispatcher({ network: { perform: perform as never } }) })
    expect(s.data.value('$selected.feedback') ?? '').toBe('')
    answer(bytes('{"feedback":"like"}'))
    await vi.waitFor(() => expect(s.data.value('$selected.feedback')).toBe('like'))
    let root = s.render().nodes[0]!
    expect(byKey(root, 'like')!.attrs['aria-pressed']).toBe('true')
    expect(byKey(root, 'dislike')).toBeUndefined()
    // once set by a tap, the data no longer moves it
    s.select({ group: 'feedback', value: 'dislike' })
    s.data.merge({ insight: { feedback: 'like', again: true } })
    expect(s.data.value('$selected.feedback')).toBe('dislike')
    root = s.render().nodes[0]!
    expect(byKey(root, 'dislike')).toBeDefined()
  })
})

describe('K5: an action of an unknown type is skipped, not fatal', () => {
  it('decodeStep answers the type; decode (authoring) still rejects it', () => {
    expect(ActionSpec.decodeStep({ type: 'setState', state: 'x' }, 'a')).toBe('setState')
    expect(() => ActionSpec.decode({ type: 'setState' })).toThrow(/unknown action type/)
    const a = ActionSpec.decode({ type: 'api', request: 'r', onSuccess: { type: 'later', x: 1 }, onError: { type: 'toast', message: 'x' } })
    expect(a.onSuccess).toBeUndefined()
    expect(a.skipped).toEqual(['later'])
    expect(a.onError?.type).toBe('toast')
    expect(SduiNode.decode({ type: 'button', action: { type: 'later' } }).action).toBeUndefined()
  })

  it('the screen renders, the button does nothing, and the type is reported once', async () => {
    const events: SduiEvent[] = []
    const s = await screenOf({ root: { type: 'vstack', id: 'root', children: [
      { type: 'button', id: 'a', props: { title: 'A' }, action: { type: 'later' } },
      { type: 'button', id: 'b', props: { title: 'B' }, action: { type: 'dismiss', onSuccess: { type: 'later' } } }
    ] } }, { onEvent: (e) => events.push(e) })
    expect(s.loadState.kind).toBe('loaded')
    expect(byKey(s.render().nodes[0], 'a')!.on).toBeUndefined()
    expect(events.filter((e) => e.type === 'action_unsupported')).toEqual([{ type: 'action_unsupported', action: 'later' }])
  })
})

describe('symbols (spec 2.3)', () => {
  it('eye and eye.slash for a toggle', () => {
    expect(Symbols.has('eye')).toBe(true)
    expect(Symbols.node('k', 'eye.slash').children[0]!.attrs.stroke).toBe('currentColor')
  })
})
