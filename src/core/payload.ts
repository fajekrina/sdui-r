import { SduiError } from './errors'
import { SduiNode } from './node'
import { SduiValue, type SduiProps } from './value'
import { canonical } from './actions/spec'
import { base64Decode, base64Encode, utf8String, type BytesLike, type Bytes } from './bytes'

/// Parse JSON bytes (or text) into a plain value, mapping any failure to
/// `SduiError.decode`.
export function parseJSON(bytes: BytesLike): unknown {
  let text: string
  try {
    text = utf8String(bytes)
  } catch {
    throw SduiError.decode('data is not valid UTF-8')
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw SduiError.decode(`invalid JSON: ${(e as Error).message}`)
  }
}

const asObject = (raw: unknown, path: string): Record<string, unknown> => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw SduiError.decode(`${path}: expected an object`)
  return raw as Record<string, unknown>
}
const requireString = (o: Record<string, unknown>, key: string, path: string): string => {
  if (typeof o[key] !== 'string') throw SduiError.decode(`${path}.${key}: required string is missing`)
  return o[key] as string
}

/// A named screen and its root node. `key` must resolve in the screen factory —
/// a semantic check, not a decode concern.
export class ScreenSpec {
  /// v1.1 — named requests run in parallel when the screen opens.
  readonly load: LoadRequest[]
  /// v1.1 — per-width layouts; `root` is the fallback.
  readonly variants: ScreenVariants
  /// v2.3 — the declared screen state (`$selected.<name>`), with initial values.
  readonly state: ScreenState

  constructor(readonly key: string, readonly root: SduiNode, extra: { load?: LoadRequest[]; variants?: ScreenVariants; state?: ScreenState } = {}) {
    this.load = extra.load ?? []
    this.variants = extra.variants ?? {}
    this.state = extra.state ?? {}
  }

  static decode(raw: unknown, path = 'screen'): ScreenSpec {
    const o = asObject(raw, path)
    if (o.root === undefined) throw SduiError.decode(`${path}.root: required node is missing`)
    let load: LoadRequest[] = []
    if (o.load != null) {
      if (!Array.isArray(o.load)) throw SduiError.decode(`${path}.load: expected an array`)
      load = o.load.map((item, i) => {
        const r = asObject(item, `${path}.load[${i}]`)
        return {
          request: requireString(r, 'request', `${path}.load[${i}]`),
          params: r.params == null ? undefined : SduiValue.decodeObject(r.params, `${path}.load[${i}].params`)
        }
      })
    }
    const variants: ScreenVariants = {}
    if (o.variants != null) {
      const v = asObject(o.variants, `${path}.variants`)
      if (v.compact != null) variants.compact = SduiNode.decode(v.compact, `${path}.variants.compact`)
      if (v.wide != null) variants.wide = SduiNode.decode(v.wide, `${path}.variants.wide`)
    }
    const state = decodeState(o.state, `${path}.state`)
    return new ScreenSpec(requireString(o, 'key', path), SduiNode.decode(o.root, `${path}.root`), { load, variants, state })
  }

  toJSON() {
    const out: Record<string, unknown> = { key: this.key }
    if (this.load.length > 0) out.load = this.load.map((r) => (r.params ? { request: r.request, params: r.params } : { request: r.request }))
    if (Object.keys(this.state).length > 0) out.state = stateJSON(this.state)
    out.root = this.root.toJSON()
    if (this.variants.compact || this.variants.wide) {
      const variants: Record<string, unknown> = {}
      if (this.variants.compact) variants.compact = this.variants.compact.toJSON()
      if (this.variants.wide) variants.wide = this.variants.wide.toJSON()
      out.variants = variants
    }
    return out
  }
}

export interface LoadRequest {
  request: string
  params?: SduiProps
}

/// v2.3 — one declared state. `initial` (default "") may hold `{{token}}`s; until the
/// state is first set it is re-resolved against the screen data.
export interface StateDecl {
  initial?: string
}

/// v2.3 — the screen state by name; each lives in the data context as `$selected.<name>`.
export type ScreenState = Readonly<Record<string, StateDecl>>

/// Decode `state`: an object of objects; unknown keys inside an entry are ignored
/// (forward-compatible), a non-string `initial` is a decode error.
export function decodeState(raw: unknown, path: string): ScreenState {
  if (raw == null) return {}
  const out: Record<string, StateDecl> = {}
  for (const [name, entry] of Object.entries(asObject(raw, path))) {
    const e = asObject(entry, `${path}.${name}`)
    if (e.initial != null && typeof e.initial !== 'string') throw SduiError.decode(`${path}.${name}.initial: expected a string`)
    out[name] = typeof e.initial === 'string' ? { initial: e.initial } : {}
  }
  return out
}

export function stateJSON(state: ScreenState): Record<string, StateDecl> {
  const out: Record<string, StateDecl> = {}
  for (const name of Object.keys(state)) out[name] = state[name]!.initial !== undefined ? { initial: state[name]!.initial } : {}
  return out
}

export interface ScreenVariants {
  compact?: SduiNode
  wide?: SduiNode
}

/// The plaintext screen tree — the payload inside the envelope, or posted
/// directly during development.
export class SduiPayload {
  constructor(readonly schemaVersion: string, readonly screen: ScreenSpec) {}

  static decode(raw: unknown): SduiPayload {
    const o = asObject(raw, 'payload')
    if (o.screen === undefined) throw SduiError.decode('payload.screen: required object is missing')
    return new SduiPayload(requireString(o, 'schemaVersion', 'payload'), ScreenSpec.decode(o.screen))
  }

  static fromJSON(bytes: BytesLike): SduiPayload {
    return SduiPayload.decode(parseJSON(bytes))
  }

  toJSON() { return { schemaVersion: this.schemaVersion, screen: this.screen.toJSON() } }

  equals(other: SduiPayload | undefined): boolean {
    return !!other && JSON.stringify(canonical(this.toJSON())) === JSON.stringify(canonical(other.toJSON()))
  }
}

/// The production transport wrapper. The client verifies the signature (and
/// optionally decrypts) BEFORE trusting the payload. This type only models the
/// envelope shape; verification/decryption is the crypto layer's job.
///
/// `payload` and `signature` travel as base64 strings and decode to bytes.
export class SduiEnvelope {
  readonly enc?: string
  /// v1.1 — the signing key's id (key rotation).
  readonly keyId?: string

  constructor(
    readonly schemaVersion: string,
    readonly alg: string,
    readonly payload: Bytes,
    readonly signature: Bytes,
    extra: { enc?: string; keyId?: string } = {}
  ) {
    if (extra.enc !== undefined) this.enc = extra.enc
    if (extra.keyId !== undefined) this.keyId = extra.keyId
  }

  static decode(raw: unknown): SduiEnvelope {
    const o = asObject(raw, 'envelope')
    const schemaVersion = requireString(o, 'schemaVersion', 'envelope')
    const alg = requireString(o, 'alg', 'envelope')
    const payload = base64Decode(requireString(o, 'payload', 'envelope'))
    const signature = base64Decode(requireString(o, 'signature', 'envelope'))
    if (!payload) throw SduiError.decode('envelope.payload: not base64')
    if (!signature) throw SduiError.decode('envelope.signature: not base64')
    if (o.enc != null && typeof o.enc !== 'string') throw SduiError.decode('envelope.enc: expected a string')
    if (o.keyId != null && typeof o.keyId !== 'string') throw SduiError.decode('envelope.keyId: expected a string')
    return new SduiEnvelope(schemaVersion, alg, payload, signature, {
      enc: (o.enc as string | null) ?? undefined,
      keyId: (o.keyId as string | null) ?? undefined
    })
  }

  static fromJSON(bytes: BytesLike): SduiEnvelope {
    return SduiEnvelope.decode(parseJSON(bytes))
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {
      schemaVersion: this.schemaVersion,
      alg: this.alg,
      payload: base64Encode(this.payload),
      signature: base64Encode(this.signature)
    }
    if (this.keyId !== undefined) out.keyId = this.keyId
    if (this.enc !== undefined) out.enc = this.enc
    return out
  }
}
