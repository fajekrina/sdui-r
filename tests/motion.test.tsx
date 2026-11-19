// spec 2.3 phase 3 — `transition`: the core times appear / leave animations and puts them on
// the RenderNode; every renderer plays them the same way (Web Animations API); focus that a
// hidden component held moves to its nearest shown ancestor; pictures in a flex column.
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as renderReact, cleanup, act } from '@testing-library/react'
import { createApp, h, nextTick } from 'vue'
import { ScreenSource, holdFocus, playMotion, type Motion, type RenderNode } from '../src/core'
import { SduiScreen as ReactScreen } from '../src/react'
import { SduiScreen as VueScreen } from '../src/vue'
import { mount } from '../src/vanilla'
import { devEngine, flush } from './helpers'

const byKey = (node: RenderNode | undefined, key: string): RenderNode | undefined =>
  !node ? undefined : node.key === key ? node : node.children.map((c) => byKey(c, key)).find(Boolean)

const feedback = (transition: string, container = 'hstack') => ({
  schemaVersion: '2.3',
  screen: { key: 's', state: { feedback: {} }, root: { type: container, id: 'root', children: [
    { type: 'button', id: 'dislike', props: { title: 'Kurang', group: 'feedback', value: 'dislike', visibleWhen: { state: 'feedback', in: ['', 'dislike'] }, transition: { visible: transition } } },
    { type: 'button', id: 'like', props: { title: 'Suka', group: 'feedback', value: 'like', visibleWhen: { state: 'feedback', in: ['', 'like'] }, transition: { visible: transition } } }
  ] } }
})

describe('the core times the transition', () => {
  let clock = 1000
  beforeEach(() => { clock = 1000; vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  const screenOf = async (payload: object, reducedMotion = false) => {
    const s = devEngine({ now: () => clock, reducedMotion: () => reducedMotion }).screen(ScreenSource.inline(payload))
    await s.load()
    return s
  }

  it('first render: no animation; a leave: inert, no handler, then dropped', async () => {
    const s = await screenOf(feedback('fade'))
    let root = s.render().nodes[0]!
    expect(byKey(root, 'dislike')!.motion).toBeUndefined()
    s.select({ group: 'feedback', value: 'like' })
    root = s.render().nodes[0]!
    const leaving = byKey(root, 'dislike')!
    expect(leaving.motion).toEqual({ kind: 'fade', axis: 'x', direction: 'out', duration: 200, elapsed: 0 })
    expect(leaving.attrs).toMatchObject({ inert: true, 'aria-hidden': 'true' })
    expect(leaving.on).toBeUndefined()
    clock += 120
    expect(byKey(s.render().nodes[0], 'dislike')!.motion!.elapsed).toBe(120)   // re-render mid-way: continues
    const repaint = vi.fn()
    s.subscribe(repaint)
    clock += 100
    vi.advanceTimersByTime(250)
    expect(repaint).toHaveBeenCalled()                                         // a render is scheduled for its end
    expect(byKey(s.render().nodes[0], 'dislike')).toBeUndefined()
  })

  it('an appear animates in, then renders plainly', async () => {
    const s = await screenOf(feedback('collapse', 'vstack'))
    s.select({ group: 'feedback', value: 'like' })
    s.render()
    clock += 300
    s.render()                                                                 // dislike gone
    s.select({ group: 'feedback', value: '' })
    const back = byKey(s.render().nodes[0], 'dislike')!
    expect(back.motion).toMatchObject({ kind: 'collapse', axis: 'y', direction: 'in', duration: 250 })
    expect(back.attrs.inert).toBeUndefined()
    clock += 300
    expect(byKey(s.render().nodes[0], 'dislike')!.motion).toBeUndefined()
  })

  it('reduced motion and a static preview never animate', async () => {
    const s = await screenOf(feedback('fade'), true)
    s.render()
    s.select({ group: 'feedback', value: 'like' })
    expect(byKey(s.render().nodes[0], 'dislike')).toBeUndefined()
    const p = await screenOf(feedback('fade'))
    p.render({ interactive: false })
    p.select({ group: 'feedback', value: 'like' })
    expect(byKey(p.render({ interactive: false }).nodes[0], 'dislike')).toBeUndefined()
  })

  it('no transition, or no visibleWhen: nothing to animate', async () => {
    const s = await screenOf(feedback('none'))
    s.render()
    s.select({ group: 'feedback', value: 'like' })
    expect(byKey(s.render().nodes[0], 'dislike')).toBeUndefined()
  })
})

describe('playMotion', () => {
  const element = () => {
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions; anim: { id: string; cancel: () => void; onfinish: unknown } }> = []
    const el = document.createElement('div')
    Object.assign(el, {
      animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
        const anim = { id: '', cancel: vi.fn(), onfinish: null as unknown }
        calls.push({ frames, options, anim })
        return anim
      },
      getAnimations: () => calls.map((c) => c.anim)
    })
    return { el, calls }
  }

  it('fades out from where the core says it is; replaces its previous animation', () => {
    const { el, calls } = element()
    const m: Motion = { kind: 'fade', axis: 'y', direction: 'out', duration: 200, elapsed: 50 }
    playMotion(el, m)
    expect(calls[0]!.frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(calls[0]!.options).toMatchObject({ duration: 200, delay: -50, fill: 'both' })
    calls[0]!.anim.id = 'sdui-motion'
    playMotion(el, { ...m, elapsed: 80 })
    expect(calls[0]!.anim.cancel).toHaveBeenCalled()
    expect(calls[1]!.options.delay).toBe(-80)
  })

  it('collapse along the row axis; an appear cancels itself when done', () => {
    const { el, calls } = element()
    playMotion(el, { kind: 'collapse', axis: 'x', direction: 'in', duration: 250, elapsed: 0 })
    expect(calls[0]!.frames[0]).toMatchObject({ width: '0px', opacity: 0, overflow: 'hidden' })
    expect(calls[0]!.frames[1]).toHaveProperty('width')
    expect(calls[0]!.anim.onfinish).toBeTypeOf('function')
  })

  it('no WAAPI (old WebView, jsdom): a no-op', () => {
    expect(() => playMotion(document.createElement('div'), { kind: 'fade', axis: 'y', direction: 'out', duration: 200, elapsed: 0 })).not.toThrow()
  })
})

describe('every renderer plays the same animation', () => {
  type Call = { key: string | null; frames: Keyframe[]; delay: number | undefined }
  let calls: Call[] = []
  beforeEach(() => {
    calls = []
    ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = function (this: HTMLElement, frames: Keyframe[], o: KeyframeAnimationOptions) {
      calls.push({ key: this.getAttribute('data-sdui-key'), frames, delay: o.delay })
      return { id: '', cancel() {}, onfinish: null }
    }
  })
  afterEach(() => { delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate })

  const click = (root: ParentNode, key: string) => (root.querySelector(`[data-sdui-key="${key}"]`) as HTMLElement).click()
  const expected = (c: Call[]) => {
    const leave = c.find((x) => x.key === 'dislike')!
    expect(leave.frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(Math.abs(leave.delay ?? 0)).toBeLessThan(100)
  }

  it('vanilla', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const view = mount(host, { engine: devEngine(), source: { payload: feedback('fade') } })
    await flush()
    click(host, 'like'); await flush()
    expected(calls)
    expect(host.querySelector('[data-sdui-key="dislike"]')!.hasAttribute('inert')).toBe(true)
    view.destroy(); host.remove()
  })

  it('React', async () => {
    const { container } = renderReact(<ReactScreen engine={devEngine()} source={{ payload: feedback('fade') }} />)
    await act(async () => { await flush() })
    await act(async () => { click(container, 'like'); await flush() })
    expected(calls)
    cleanup()
  })

  it('Vue', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const app = createApp({ render: () => h(VueScreen, { engine: devEngine(), source: { payload: feedback('fade') } }) })
    app.mount(host)
    await flush(); await nextTick()
    click(host, 'like'); await flush(); await nextTick()
    expected(calls)
    app.unmount(); host.remove()
  })
})

describe('focus held by a hidden component', () => {
  it('holdFocus moves it to the nearest shown ancestor', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div data-sdui-key="banner"><button data-sdui-key="close">x</button></div>'
    document.body.appendChild(root)
    ;(root.querySelector('button') as HTMLElement).focus()
    const rescue = holdFocus(root)
    root.querySelector('button')!.remove()
    rescue()
    expect(document.activeElement?.getAttribute('data-sdui-key')).toBe('banner')
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    root.remove()
  })

  it('vanilla: closing a banner with its own ✕ keeps focus in the screen', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const payload = { schemaVersion: '2.3', screen: { key: 's', root: { type: 'vstack', id: 'root', children: [
      { type: 'hstack', id: 'banner', props: { visibleWhen: { state: 'promo', notEquals: 'dismissed' } }, children: [
        { type: 'button', id: 'close', props: { title: '✕', group: 'promo', value: 'dismissed' } }
      ] }
    ] } } }
    const view = mount(host, { engine: devEngine(), source: { payload } })
    await flush()
    const close = host.querySelector('[data-sdui-key="close"]') as HTMLElement
    close.focus()
    close.click(); await flush()
    expect(host.querySelector('[data-sdui-key="banner"]')).toBeNull()
    expect(document.activeElement?.getAttribute('data-sdui-key')).toBe('root')
    view.destroy(); host.remove()
  })
})

describe('a picture in a flex column (WebKit sizes a 100% width from the border box)', () => {
  const image = async (container: string, props: object = {}) => {
    const s = devEngine({ assetURL: () => '/a.png' }).screen(ScreenSource.inline({ schemaVersion: '2.3', screen: { key: 's', root: { type: container, id: 'root', children: [{ type: 'image', id: 'pic', props: { name: 'x', ...props } }] } } }))
    await s.load()
    return byKey(s.render().nodes[0], 'pic')!.style
  }
  it('stretches in a column, is 100% in a row, keeps an explicit width', async () => {
    expect(await image('vstack')).toMatchObject({ width: 'auto', maxWidth: '100%', alignSelf: 'stretch' })
    expect(await image('card')).toMatchObject({ width: 'auto', alignSelf: 'stretch' })
    expect(await image('hstack')).toMatchObject({ width: '100%' })
    expect(await image('zstack')).toMatchObject({ width: '100%' })
    expect(await image('vstack', { width: 120 })).toMatchObject({ width: '120px' })
  })
})
