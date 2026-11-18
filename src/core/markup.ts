/// spec 2.1 — inline emphasis in a text's `value`, opt-in per text with `markup: true`:
/// `**bold**` and `*italic*` (they may nest); `\*` is a literal asterisk, and a marker
/// without its partner stays literal. Parsed on the TEMPLATE string, before `{{token}}`
/// substitution, so data (an API answer, a form value) can never turn into formatting.
/// No HTML, links or colors: the vocabulary is closed.
export interface MarkupRun {
  text: string
  bold: boolean
  italic: boolean
}

export function parseMarkup(source: string): MarkupRun[] {
  const tokens = source.match(/\\\*|\*\*|\*|[^*\\]+|\\/g) ?? []
  // pair each marker with the next one of its kind; an unpaired one is literal text
  const paired = new Set<number>()
  const open: Record<string, number> = {}
  tokens.forEach((t, i) => {
    if (t !== '**' && t !== '*') return
    if (open[t] === undefined) open[t] = i
    else { paired.add(open[t]!).add(i); delete open[t] }
  })
  const runs: MarkupRun[] = []
  let bold = false
  let italic = false
  tokens.forEach((t, i) => {
    if (paired.has(i)) {
      if (t === '**') bold = !bold
      else italic = !italic
      return
    }
    const text = t === '\\*' ? '*' : t
    const last = runs[runs.length - 1]
    if (last && last.bold === bold && last.italic === italic) last.text += text
    else runs.push({ text, bold, italic })
  })
  return runs
}
