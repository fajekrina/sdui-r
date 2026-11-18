// sdui-r — what a component DOES, in words a maker understands: its action (where a button
// goes, which request it sends), the field it collects, where a chart's data comes from,
// whether an image is a frame to fill. Plus the template author's own note
// (`builderNote`, never delivered to clients). Shown in the Screen Builder (and as a check
// in the Template Builder inspector).
import { BUILDER_NOTE_PROP, type ActionSpec, type SduiNode } from '../core'

const quote = (s: string | undefined) => `"${s ?? '?'}"`

/// What the engine reads of each action type: whether `params` are sent, and which follow-up
/// steps run (`navigate` / `toast` cannot fail; `openURL` / `dismiss` / `refresh` end the chain).
export const ACTION_USES: Record<string, { params: boolean; chain: ReadonlyArray<'onSuccess' | 'onError'> }> = {
  navigate: { params: true, chain: ['onSuccess'] },
  api: { params: true, chain: ['onSuccess', 'onError'] },
  native: { params: true, chain: ['onSuccess', 'onError'] },
  toast: { params: false, chain: ['onSuccess'] },
  openURL: { params: false, chain: [] },
  dismiss: { params: false, chain: [] },
  refresh: { params: false, chain: [] }
}
const usesOf = (type: string) => ACTION_USES[type] ?? { params: true, chain: ['onSuccess', 'onError'] as const }

/// One action in a sentence, with its onSuccess / onError chain.
export function describeAction(action: ActionSpec | undefined): string {
  if (!action) return 'Does nothing when tapped'
  let out: string
  switch (action.type) {
    case 'navigate': {
      const how = action.presentation === 'sheet' ? ' as a sheet' : action.presentation === 'fullScreen' ? ' full screen' : ''
      out = `Opens page ${quote(action.screen)}${how}`
      break
    }
    case 'api': out = `Sends request ${quote(action.request)}`; break
    case 'openURL': out = `Opens link ${quote(action.link)}`; break
    case 'dismiss': out = 'Closes this page'; break
    case 'refresh': out = 'Reloads this page'; break
    case 'toast': out = `Shows the message ${quote(action.message)}`; break
    case 'native': out = `Runs the app command ${quote(action.command)}`; break
    default: out = `Runs a ${action.type} action`
  }
  // only the steps that actually run
  const chain = usesOf(action.type).chain
  if (action.onSuccess && chain.includes('onSuccess')) out += `; on success: ${lower(describeAction(action.onSuccess))}`
  if (action.onError && chain.includes('onError')) out += `; on error: ${lower(describeAction(action.onError))}`
  return out
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/// The short form for an outline row or a canvas badge (`→ checkout`, `⇄ submitCheckout`).
export function actionBadge(action: ActionSpec | undefined): string | undefined {
  if (!action) return undefined
  switch (action.type) {
    case 'navigate': return `→ ${action.screen ?? '?'}`
    case 'api': return `⇄ ${action.request ?? '?'}`
    case 'openURL': return `↗ ${action.link ?? '?'}`
    case 'dismiss': return '✕ close'
    case 'refresh': return '↻ reload'
    case 'toast': return '💬 message'
    case 'native': return `⚙ ${action.command ?? '?'}`
    default: return action.type
  }
}

/// Every line that explains `node`: the author's note first, then what it does.
export function describeComponent(node: SduiNode): string[] {
  const out: string[] = []
  const note = node.props[BUILDER_NOTE_PROP]
  if (typeof note === 'string' && note.trim()) out.push(note.trim())
  const field = (kind: string) => {
    const rules = [node.bool('required') ? 'required' : '', node.string('pattern'), node.bool('secure') ? 'hidden input' : ''].filter(Boolean)
    return `${kind} ${quote(node.string('name') || undefined)} sent with the form${rules.length ? ` (${rules.join(', ')})` : ''}`
  }
  switch (node.type) {
    case 'button': out.push(describeAction(node.action)); break
    case 'chart':
      out.push(node.action?.type === 'api'
        ? `Chart; its data comes from source ${quote(node.action.request)}`
        : 'Chart of the data you fill in')
      break
    case 'image':
      out.push(node.string('systemName') ? `Icon (${node.string('systemName')}); upload a picture to replace it` : 'Image frame: upload a picture, paste a link or drop a file')
      break
    case 'textField': out.push(field('Text input')); break
    case 'textArea': out.push(field('Multi-line input')); break
    case 'picker': out.push(field('Choice')); break
    case 'form': out.push('Form: its fields are sent together by a button inside it'); break
    case 'list': out.push('Repeats its content for every item'); break
    case 'text': out.push('Text'); break
    default:
      if (node.action) out.push(`Tappable; ${lower(describeAction(node.action))}`)
  }
  if (node.type !== 'button' && node.type !== 'chart' && node.action && out.length && !out[out.length - 1]!.startsWith('Tappable')) {
    out.push(`Tapping it: ${lower(describeAction(node.action))}`)
  }
  return out
}

/// The app's names an `api` action may use: `requests` (what a button sends) and `sources`
/// (what a chart reads).
export interface RequestLists {
  requests?: readonly string[]
  sources?: readonly string[]
}

/// The app's names actions may use (`links` = what `openURL` opens).
export interface ActionLists extends RequestLists {
  links?: readonly string[]
}

const visitActions = (root: SduiNode, visit: (node: SduiNode, action: ActionSpec, own: boolean) => void) => {
  const step = (node: SduiNode, action: ActionSpec | undefined, own: boolean) => {
    if (!action) return
    visit(node, action, own)
    step(node, action.onSuccess, false)
    step(node, action.onError, false)
  }
  const walk = (node: SduiNode) => { step(node, node.action, true); node.children.forEach(walk) }
  walk(root)
}

/// Every action warning of the Template Builder: requests / data sources of the wrong kind
/// (`requestWarnings`), a link not in the app's list, and fields the engine never reads
/// (`params` of openURL / dismiss / refresh / toast, a follow-up step that never runs).
/// Warnings only: nothing is blocked, and nothing is removed.
export function actionWarnings(root: SduiNode, lists: ActionLists): string[] {
  const out = requestWarnings(root, lists)
  const links = lists.links ?? []
  visitActions(root, (node, action) => {
    const at = `${node.type} #${node.id ?? '?'}`
    const uses = usesOf(action.type)
    if (action.type === 'openURL' && action.link && links.length > 0 && !links.includes(action.link)) {
      out.push(`${at} opens "${action.link}", which is not a known link`)
    }
    if (action.params !== undefined && !uses.params) out.push(`${at}: ${action.type} ignores params`)
    for (const key of ['onSuccess', 'onError'] as const) {
      if (action[key] && !uses.chain.includes(key)) out.push(`${at}: ${key} never runs after ${action.type}`)
    }
  })
  return out
}

/// Warnings (never errors: the engine's allow-list decides at runtime) for an `api` action that
/// names the wrong kind: a chart reading a request a button sends, a button (or any other
/// component, or a chain step) sending a chart data source, or a name in neither list. Only
/// when the app splits the lists (`sources` given); otherwise there is nothing to tell apart.
export function requestWarnings(root: SduiNode, lists: RequestLists): string[] {
  const sources = lists.sources
  if (!sources) return []
  const requests = lists.requests ?? []
  const out: string[] = []
  const label = (node: SduiNode) => `${node.type} #${node.id ?? '?'}`
  // a chart's own action is its data source; onSuccess / onError are ordinary steps
  visitActions(root, (node, action, own) => {
    const chartSource = own && node.type === 'chart'
    const name = action.request
    if (action.type === 'api' && name) {
      if (chartSource && !sources.includes(name)) {
        out.push(requests.includes(name)
          ? `${label(node)} reads "${name}", a request a button sends, not a data source`
          : `${label(node)} reads "${name}", which is not a data source`)
      } else if (!chartSource && !requests.includes(name)) {
        out.push(sources.includes(name)
          ? `${label(node)} sends "${name}", a chart data source, not a request`
          : `${label(node)} sends "${name}", which is not a known request`)
      }
    }
  })
  return out
}
