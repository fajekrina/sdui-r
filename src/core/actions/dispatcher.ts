import { parseJSON } from '../payload'
import { SduiValue, type SduiProps } from '../value'
import { resolveValue } from '../token'
import { TARGET_TOKEN } from '../validator'
import { NamedRequest, NoNetworkClient, noHost, noopNavigator, type HostPort, type NetworkClient, type Navigator } from '../../ports'
import type { DataContext } from '../data-context'
import type { ActionSpec, ActionType, ToastLevel } from './spec'

/// What a command can touch while it runs — everything else stays out of reach.
/// What an action chain did — the screen uses it to keep or drop the submission's
/// idempotency key and to hold the double-tap lock across a navigation.
export interface ChainOutcome {
  apiFailed: boolean
  navigated: boolean
}

export interface ActionContext {
  data: DataContext
  outcome?: ChainOutcome
  /// one per user tap; each `api` call in the chain derives its own from it
  idempotencyKey?: string
  network: NetworkClient
  navigator: Navigator
  host: HostPort
  /// show a transient message (the screen's UI store)
  toast(message: string, level: ToastLevel): void
  /// reload the current screen
  refresh(): void
  /// spec 2.3 — an `api` request's status for `$request.<request>`
  requestStatus?(request: string, status: 'pending' | 'success' | 'error'): void
  /// observability hook
  emit?(event: { type: 'action_dispatched'; action: ActionType; ok: boolean; target?: string }): void
}

/// A single action (Command pattern): one closed-vocabulary action type.
export interface Command {
  execute(spec: ActionSpec, context: ActionContext, dispatcher: ActionDispatcher): Promise<void>
}

/// v2.6 — a navigate screen / openURL link given as ONE `{{token}}`: its value at tap time,
/// used only when it is an identifier (a named target, never a URL); else undefined.
function target(value: string | undefined, data: DataContext): string | undefined {
  if (value === undefined || !TARGET_TOKEN.test(value)) return value
  const v = data.value(value.slice(2, -2).trim())
  return typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(v) ? v : undefined
}

/// Resolve `{{token}}`s in params against the data at dispatch time.
function params(spec: ActionSpec, data: DataContext): SduiProps {
  if (!spec.params) return {}
  return resolveValue(spec.params, (k) => data.value(k)) as SduiProps
}

class NavigateCommand implements Command {
  async execute(spec: ActionSpec, ctx: ActionContext, d: ActionDispatcher) {
    const screen = target(spec.screen, ctx.data)
    if (screen === undefined) { if (spec.screen !== undefined) ctx.emit?.({ type: 'action_dispatched', action: 'navigate', ok: false }); return }
    ctx.navigator.navigate(screen, params(spec, ctx.data), { presentation: spec.presentation ?? 'push' })
    if (ctx.outcome) ctx.outcome.navigated = true
    ctx.emit?.({ type: 'action_dispatched', action: 'navigate', ok: true, target: screen })
    if (spec.onSuccess) await d.dispatch(spec.onSuccess, ctx)
  }
}

class DismissCommand implements Command {
  async execute(_spec: ActionSpec, ctx: ActionContext) {
    ctx.navigator.dismiss()
    ctx.emit?.({ type: 'action_dispatched', action: 'dismiss', ok: true })
  }
}

class RefreshCommand implements Command {
  async execute(_spec: ActionSpec, ctx: ActionContext) {
    ctx.refresh()
    ctx.navigator.refresh()
    ctx.emit?.({ type: 'action_dispatched', action: 'refresh', ok: true })
  }
}

class OpenURLCommand implements Command {
  async execute(spec: ActionSpec, ctx: ActionContext) {
    const link = target(spec.link, ctx.data)
    if (link === undefined) { if (spec.link !== undefined) ctx.emit?.({ type: 'action_dispatched', action: 'openURL', ok: false }); return }
    ctx.navigator.openLink(link)
    ctx.emit?.({ type: 'action_dispatched', action: 'openURL', ok: true, target: link })
  }
}

class ToastCommand implements Command {
  async execute(spec: ActionSpec, ctx: ActionContext, d: ActionDispatcher) {
    ctx.toast(ctx.data.resolve(spec.message ?? ''), spec.level ?? 'info')
    ctx.emit?.({ type: 'action_dispatched', action: 'toast', ok: true })
    if (spec.onSuccess) await d.dispatch(spec.onSuccess, ctx)
  }
}

/// The one command that reaches the network. On success the response merges into
/// the data context under the request's name, then `onSuccess` runs; any failure
/// runs `onError` — fail-closed.
class APICommand implements Command {
  async execute(spec: ActionSpec, ctx: ActionContext, d: ActionDispatcher) {
    if (spec.request === undefined) return this.fail(spec, ctx, d)
    let bytes: Uint8Array
    ctx.requestStatus?.(spec.request, 'pending')
    try {
      const idempotencyKey = ctx.idempotencyKey ? `${ctx.idempotencyKey}:${spec.request}` : undefined
      bytes = await ctx.network.perform(new NamedRequest(spec.request), params(spec, ctx.data), { idempotencyKey })
    } catch {
      return this.fail(spec, ctx, d)
    }
    try {
      ctx.data.merge({ [spec.request]: SduiValue.decode(parseJSON(bytes)) })
    } catch {
      // a non-JSON body still counts as success; there is just nothing to merge
    }
    ctx.requestStatus?.(spec.request, 'success')
    ctx.emit?.({ type: 'action_dispatched', action: 'api', ok: true, target: spec.request })
    if (spec.onSuccess) await d.dispatch(spec.onSuccess, ctx)
  }

  private async fail(spec: ActionSpec, ctx: ActionContext, d: ActionDispatcher) {
    if (ctx.outcome) ctx.outcome.apiFailed = true
    if (spec.request !== undefined) ctx.requestStatus?.(spec.request, 'error')
    ctx.emit?.({ type: 'action_dispatched', action: 'api', ok: false, target: spec.request })
    if (spec.onError) await d.dispatch(spec.onError, ctx)
  }
}

/// v1.1 — a named, host-allow-listed device command (biometric confirm, share…).
/// The result merges under the command name; unsupported or failed → `onError`.
class NativeCommand implements Command {
  async execute(spec: ActionSpec, ctx: ActionContext, d: ActionDispatcher) {
    if (spec.command === undefined) return
    let result: SduiValue
    try {
      result = await ctx.host.native(spec.command, params(spec, ctx.data))
    } catch {
      ctx.emit?.({ type: 'action_dispatched', action: 'native', ok: false, target: spec.command })
      if (spec.onError) await d.dispatch(spec.onError, ctx)
      return
    }
    if (result !== null && result !== undefined) ctx.data.merge({ [spec.command]: result })
    ctx.emit?.({ type: 'action_dispatched', action: 'native', ok: true, target: spec.command })
    if (spec.onSuccess) await d.dispatch(spec.onSuccess, ctx)
  }
}

export interface ActionDispatcherInit {
  network?: NetworkClient
  navigator?: Partial<Navigator>
  host?: HostPort
}

/// Turns a decoded `ActionSpec` into behavior (the Command pattern). Created once
/// with the network client, the host navigator and the native host.
export class ActionDispatcher {
  readonly network: NetworkClient
  readonly navigator: Navigator
  readonly host: HostPort

  constructor(init: ActionDispatcherInit = {}) {
    this.network = init.network ?? new NoNetworkClient()
    this.navigator = { ...noopNavigator, ...(init.navigator ?? {}) }
    this.host = init.host ?? noHost
  }

  /// Build the command for an action type and run it. Chaining re-enters here;
  /// the chain is finite by construction and depth-bounded by validation.
  async dispatch(spec: ActionSpec, context: ActionContext): Promise<void> {
    await ActionDispatcher.command(spec.type).execute(spec, context, this)
  }

  static command(type: ActionType): Command {
    switch (type) {
      case 'navigate': return new NavigateCommand()
      case 'api': return new APICommand()
      case 'dismiss': return new DismissCommand()
      case 'refresh': return new RefreshCommand()
      case 'openURL': return new OpenURLCommand()
      case 'toast': return new ToastCommand()
      case 'native': return new NativeCommand()
    }
  }
}

