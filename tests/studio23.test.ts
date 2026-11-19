// spec 2.3 phase 4 — the Studio: states (declared + groups / toggles), the condition editor,
// simulated state on the canvas, the selected hidden component, Preview running the page for
// real (taps, requests, transitions), and warnings.
import { describe, expect, it } from 'vitest'
import { SduiNode, TemplateDocument } from '../src/core'
import {
  conditionOf, conditionParts, describeComponent, describeCondition, mountTemplateBuilder, requestNames, stateNames, stateValues, stateWarnings
} from '../src/builder'
import { fixtureJSON } from './helpers'

const insight = () => TemplateDocument.decode(fixtureJSON('valid/template_insight.json')).template
const tree = (children: object[]) => SduiNode.decode({ type: 'vstack', id: 'root', children })

describe('state-editor helpers', () => {
  it('names, values, requests of the insight page', () => {
    const t = insight()
    expect(stateNames(t.root, t.state)).toEqual(['feedback'])
    expect(stateValues(t.root, 'feedback')).toEqual(['', 'dislike', 'like'])
    expect(requestNames(t.root)).toEqual(['sendFeedback'])
    const toggle = tree([{ type: 'button', id: 'eye', props: { toggle: 'shown' } }])
    expect(stateNames(toggle)).toEqual(['shown'])
    expect(stateValues(toggle, 'shown')).toEqual(['', 'on'])
  })

  it('a condition ⇄ its parts; in words', () => {
    const c = { state: 'feedback', in: ['', 'like'] }
    expect(conditionOf(conditionParts(c)!)).toEqual(c)
    expect(conditionOf({ source: 'request', name: 'send', op: 'empty', values: [] })).toEqual({ request: 'send', empty: true })
    expect(conditionParts({ state: 'a', lessThan: '1' })).toBeUndefined()
    expect(describeCondition(c)).toBe('feedback is empty or "like"')
    expect(describeCondition({ request: 'sendFeedback', equals: 'success' })).toBe('request sendFeedback is "success"')
    expect(describeCondition({ state: 'x', notEmpty: true })).toBe('x is set')
  })

  it('the insight page has no warnings', () => {
    const t = insight()
    expect(stateWarnings(t.root, t.state)).toEqual([])
  })

  it('warns: nothing sets the state, an impossible value, an unknown request, a lone transition, an unused state, an unreadable condition', () => {
    const w = stateWarnings(tree([
      { type: 'text', id: 'bal', props: { maskedWhen: { state: 'shown', empty: true } } },
      { type: 'button', id: 'b', props: { group: 'g', value: 'a' } },
      { type: 'text', id: 't1', props: { visibleWhen: { state: 'g', equals: 'zzz' } } },
      { type: 'text', id: 't2', props: { visibleWhen: { request: 'nope', equals: 'success' } } },
      { type: 'text', id: 't3', props: { transition: { visible: 'fade' } } },
      { type: 'text', id: 't4', props: { visibleWhen: { state: 'g', lessThan: '1' } } }
    ]), { unused: {} })
    expect(w.join('\n')).toContain('text #bal: maskedWhen reads state "shown", but no button sets it — the value can never be revealed')
    expect(w.join('\n')).toContain('no button sets g to "zzz"')
    expect(w.join('\n')).toContain('reads request "nope", which no action sends')
    expect(w.join('\n')).toContain('text #t3: a transition animates visibleWhen changes; this component has none')
    expect(w.join('\n')).toContain('state "unused" is declared but nothing uses it')
    expect(w.join('\n')).toContain('text #t4: visibleWhen cannot be read')
  })

  it('a value the backend returns (initial with a token) is not "impossible"', () => {
    expect(stateWarnings(tree([
      { type: 'button', id: 'b', props: { group: 'g', value: 'a' } },
      { type: 'text', id: 't', props: { visibleWhen: { state: 'g', equals: 'fromServer' } } }
    ]), { g: { initial: '{{x.g}}' } })).toEqual([])
  })

  it('describeComponent says what the state does', () => {
    const t = insight()
    const find = (n: SduiNode, id: string): SduiNode | undefined => n.id === id ? n : n.children.map((c) => find(c, id)).find(Boolean)
    const lines = describeComponent(find(t.root, 'dislike')!)
    expect(lines).toContain('Shown only when feedback is empty or "dislike"')
    expect(lines).toContain('Disabled when request sendFeedback is "pending"')
    expect(lines).toContain('Appears / disappears with a fade')
    expect(describeComponent(SduiNode.decode({ type: 'button', props: { toggle: 'shown' } }))).toContain('A tap switches state shown on / off')
  })
})

describe('the Studio (template builder)', () => {
  const open = () => {
    const host = document.createElement('div')
    document.body.append(host)
    const studio = mountTemplateBuilder(host)
    studio.document.importJSON(fixtureJSON('valid/template_insight.json') as object)
    return { host, studio, done: () => { studio.destroy(); host.remove() } }
  }
  const pick = (host: Element, label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement & HTMLInputElement
  const change = (e: HTMLSelectElement | HTMLInputElement, value: string) => { e.value = value; e.dispatchEvent(new Event('change')) }
  const onCanvas = (host: Element, id: string) => host.querySelector(`.device [data-sdui-node="${id}"]`)

  it('the condition editor: picked source, operator, values', () => {
    const { host, studio, done } = open()
    studio.document.select('dislike')
    const group = [...host.querySelectorAll('.insp details.grp')].find((g) => g.querySelector('summary')!.textContent === 'State')!
    expect(group).toBeDefined()
    expect(pick(host, 'visibleWhen source').value).toBe('state:feedback')
    expect(pick(host, 'visibleWhen operator').value).toBe('in')
    expect((pick(host, 'visibleWhen dislike') as unknown as HTMLInputElement).checked).toBe(true)
    change(pick(host, 'visibleWhen operator'), 'equals')
    expect(studio.document.selected!.props.visibleWhen).toEqual({ state: 'feedback', equals: '' })
    change(pick(host, 'visibleWhen value'), 'dislike')
    expect(studio.document.selected!.props.visibleWhen).toEqual({ state: 'feedback', equals: 'dislike' })
    change(pick(host, 'transition'), 'collapse')
    expect(studio.document.selected!.props.transition).toEqual({ visible: 'collapse' })
    change(pick(host, 'visibleWhen source'), '')
    expect(studio.document.selected!.props.visibleWhen).toBeUndefined()
    // a request as the source starts at "success"
    change(pick(host, 'visibleWhen source'), 'request:sendFeedback')
    expect(studio.document.selected!.props.visibleWhen).toEqual({ request: 'sendFeedback', equals: 'success' })
    done()
  })

  it('the state panel: try a value — the canvas and the outline follow; the selected hidden component stays drawn', () => {
    const { host, studio, done } = open()
    expect(onCanvas(host, 'dislike')).not.toBeNull()
    expect(onCanvas(host, 'feedbackThanks')).toBeNull()            // request not sent
    change(pick(host, 'try feedback'), 'like')
    expect(onCanvas(host, 'dislike')).toBeNull()
    expect(host.querySelector('[data-sdui-row="dislike"]')!.classList.contains('dim')).toBe(true)
    expect(host.querySelector('[data-sdui-row="dislike"] .cnd')).not.toBeNull()
    studio.document.select('dislike')
    expect(onCanvas(host, 'dislike')!.getAttribute('data-sdui-hidden')).toBe('true')
    change(pick(host, 'try request sendFeedback'), 'success')
    expect(onCanvas(host, 'feedbackThanks')).not.toBeNull()
    done()
  })

  it('the state panel: declare a state, its initial value, remove it', () => {
    const { host, studio, done } = open()
    change(pick(host, 'New state name'), 'balanceShown')
    ;[...host.querySelectorAll<HTMLButtonElement>('.state button')].find((b) => b.textContent === 'Add state')!.click()
    expect(studio.document.state.balanceShown).toEqual({})
    change(pick(host, 'balanceShown initial'), 'on')
    expect(studio.document.state.balanceShown).toEqual({ initial: 'on' })
    expect(host.querySelector('.issues')!.textContent).toContain('state "balanceShown" is declared but nothing uses it')
    pick(host, 'Remove state balanceShown').click()
    expect(studio.document.state.balanceShown).toBeUndefined()
    change(pick(host, 'New state name'), 'bad name')
    ;[...host.querySelectorAll<HTMLButtonElement>('.state button')].find((b) => b.textContent === 'Add state')!.click()
    expect(host.querySelector('.issues')!.textContent).toContain('is not a name')
    expect(JSON.parse(studio.document.exportJSON()).template.state).toEqual({ feedback: { initial: '{{insight.feedback}}' } })
    done()
  })

  it('Preview runs the page for real: a tap hides the other button, the request answers, the thanks shows', async () => {
    const { host, done } = open()
    const previewBtn = [...host.querySelectorAll<HTMLButtonElement>('.tb button')].find((b) => b.textContent === 'Preview')!
    previewBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    const device = host.querySelector('.device')!
    expect(device.querySelector('[data-sdui-screen]')).not.toBeNull()
    ;(device.querySelector('[data-sdui-key="like"]') as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 0))
    // leaving (inert) or already gone
    const dislike = device.querySelector('[data-sdui-key="dislike"]')
    expect(dislike === null || dislike.hasAttribute('inert')).toBe(true)
    await new Promise((r) => setTimeout(r, 900))
    expect(device.querySelector('[data-sdui-key="dislike"]')).toBeNull()
    expect(device.querySelector('[data-sdui-key="feedbackThanks"]')).not.toBeNull()
    previewBtn.click()                                                 // back to edit: the canvas again
    expect(device.querySelector('[data-sdui-screen]')).toBeNull()
    expect(onCanvas(host, 'like')).not.toBeNull()
    done()
  })

  it('Preview: a request simulated as an error', async () => {
    const { host, done } = open()
    change(pick(host, 'try request sendFeedback'), 'error')
    ;[...host.querySelectorAll<HTMLButtonElement>('.tb button')].find((b) => b.textContent === 'Preview')!.click()
    await new Promise((r) => setTimeout(r, 0))
    ;(host.querySelector('.device [data-sdui-key="dislike"]') as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 900))
    expect(host.querySelector('.device [data-sdui-key="feedbackThanks"]')).toBeNull()
    expect(host.querySelector('.device [data-sdui-key="dislike"]')).not.toBeNull()
    done()
  })
})
