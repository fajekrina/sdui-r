// spec 2.3 — one condition on the screen state (`$selected.<state>`) or on a request's status
// (`$request.<request>`): exactly one source and one operator. Pure; the schema (CI + backend)
// is strict about the shape, the client is lenient: a condition it cannot evaluate (another
// minor's operator, a malformed object) answers `null` and each prop picks its safe fallback.
import { SduiValue } from './value'

const OPS = ['equals', 'notEquals', 'in', 'empty', 'notEmpty']

/// `true` / `false`, or `null` when it cannot be evaluated. `read` looks up a data key path.
export function evaluate(raw: SduiValue | undefined, read: (path: string) => SduiValue | undefined): boolean | null {
  const c = SduiValue.objectValue(raw)
  if (!c) return null
  const keys = Object.keys(c)
  const source = keys.filter((k) => k === 'state' || k === 'request')
  const op = keys.filter((k) => OPS.includes(k))
  const name = c[source[0]!]
  if (keys.length !== 2 || source.length !== 1 || op.length !== 1 || typeof name !== 'string') return null
  const v = read(`${source[0] === 'state' ? '$selected' : '$request'}.${name}`)
  // an unset state is ""; numbers and booleans compare by their string form
  const value = v == null ? '' : typeof v === 'object' ? null : String(v)
  if (value === null) return null
  const arg = c[op[0]!]
  switch (op[0]) {
    case 'equals': return typeof arg === 'string' ? value === arg : null
    case 'notEquals': return typeof arg === 'string' ? value !== arg : null
    case 'in': return Array.isArray(arg) ? arg.includes(value) : null
    case 'empty': return arg === true ? value === '' : null
    default: return arg === true ? value !== '' : null
  }
}
