// spec 2.3 — `transition`: how a `visibleWhen` change animates. The core decides everything
// (kind, axis, direction, how far along it is) and puts it on the RenderNode as data; every
// adapter plays it the same way with `playMotion` — the Web Animations API, so no stylesheet
// and no inline `style` attribute (a strict CSP holds). A negative delay = the time already
// elapsed, so a renderer that rebuilds its DOM mid-animation (vanilla) continues it in place.

export type MotionKind = 'fade' | 'collapse'

export interface Motion {
  kind: MotionKind
  /// the parent's main axis: `collapse` shrinks the width in a row, the height elsewhere
  axis: 'x' | 'y'
  /// `in`: appearing; `out`: leaving (the node is `inert` and dropped when it ends)
  direction: 'in' | 'out'
  duration: number
  /// ms already played
  elapsed: number
  /// v2.4 — a slide (`kind` is ignored): from this place to the one in the node's style
  from?: Record<string, string>
}

/// v2.4 — how long a moving node (the chart tip) slides to its new place
export const MOVE_MS = 200

/// Engine-owned durations (ms).
export const MOTION_MS: Readonly<Record<MotionKind, number>> = { fade: 200, collapse: 250 }

/// `transition.visible` of a node's props, if it animates.
export function motionKind(raw: unknown): MotionKind | undefined {
  const visible = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { visible?: unknown }).visible : undefined
  return visible === 'fade' || visible === 'collapse' ? visible : undefined
}

/// The user asked the OS for less motion: transitions are dropped (the end state is the same).
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

/// Play `motion` on the element a RenderNode became (no-op without one, or without WAAPI).
/// Replaces the element's previous SDUI animation, so calling it on every render is safe.
export function playMotion(el: Element | null | undefined, motion: Motion | undefined): void {
  const h = el as (HTMLElement & { animate?: HTMLElement['animate'] }) | null | undefined
  if (!h || typeof h.animate !== 'function') return
  for (const a of h.getAnimations?.() ?? []) if (a.id === 'sdui-motion') a.cancel()
  if (!motion) return
  if (motion.from) {
    const to: Keyframe = {}
    for (const k of Object.keys(motion.from)) to[k] = h.style.getPropertyValue(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
    const slide = h.animate([motion.from as Keyframe, to], { duration: motion.duration, delay: -motion.elapsed, fill: 'both', easing: 'ease' })
    slide.id = 'sdui-motion'
    slide.onfinish = () => slide.cancel()
    return
  }
  let shown: Keyframe = { opacity: 1 }
  let gone: Keyframe = { opacity: 0 }
  if (motion.kind === 'collapse') {
    // measured at full size: the animation is not applied yet
    const cs = getComputedStyle(h)
    const [size, a, b] = motion.axis === 'x' ? ['width', 'paddingLeft', 'paddingRight'] as const : ['height', 'paddingTop', 'paddingBottom'] as const
    const box = h.getBoundingClientRect()
    shown = { opacity: 1, overflow: 'hidden', [size]: `${motion.axis === 'x' ? box.width : box.height}px`, [a]: cs[a], [b]: cs[b], boxSizing: 'border-box' }
    gone = { opacity: 0, overflow: 'hidden', [size]: '0px', [a]: '0px', [b]: '0px', boxSizing: 'border-box' }
  }
  const animation = h.animate(motion.direction === 'in' ? [gone, shown] : [shown, gone], {
    duration: motion.duration, delay: -motion.elapsed, fill: 'both', easing: 'ease'
  })
  animation.id = 'sdui-motion'
  // appeared: its natural box from now on (a collapse must not keep a fixed px size)
  if (motion.direction === 'in') animation.onfinish = () => animation.cancel()
}

/// spec 2.3 — keep keyboard focus in the screen when the focused element is hidden (a ✕ that
/// closes its own banner). Call before a commit with the screen's root element; call what it
/// returns after the commit: if focus fell out (to the body, or into an `inert` leaving node),
/// it moves to the nearest ancestor that is still shown (made focusable with tabindex -1).
export function holdFocus(root: Element | null | undefined): () => void {
  const doc = root?.ownerDocument
  const active = doc?.activeElement
  if (!root || !doc || !active || !root.contains(active)) return () => {}
  const keys: string[] = []
  for (let e: Element | null = active; e && e !== root; e = e.parentElement) {
    const key = e.getAttribute('data-sdui-key')
    if (key) keys.push(key)
  }
  return () => {
    const now = doc.activeElement
    if (now && now !== doc.body && root.contains(now) && !now.closest('[inert]')) return
    for (const key of keys) {
      const el = [...root.querySelectorAll<HTMLElement>('[data-sdui-key]')].find((e) => e.getAttribute('data-sdui-key') === key)
      if (el && !el.closest('[inert]')) {
        if (!el.hasAttribute('tabindex') && el.tabIndex < 0) el.setAttribute('tabindex', '-1')
        el.focus({ preventScroll: true })
        return
      }
    }
  }
}
