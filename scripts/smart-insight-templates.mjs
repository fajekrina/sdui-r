// sdui-r — the four starter templates of the Studio's Konten tab, after the design frames
// "template V1.jpeg" / "template V2.jpeg" (Smart Insight Detail): V1, V1 + CTA, V2 (a bar chart in
// the insight card), V2 + CTA. With a CTA the list cards have no chevron and are not tappable.
// Sample texts are in [brackets] (the Studio warns while a page still has one).
//
//   node scripts/smart-insight-templates.mjs
//
// writes spec/fixtures/valid/template_smart_insight_*.json and, when ../service exists, the
// template-service seed (seed/shared/*.json).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const TEAL = '#C2F0ED'
const CTA = '#71DAD3'
const INK = '#1A1A1A'
const BORDER = '#E3E3E3'

let order = 0
const node = (type, id, props = {}, children, action) => ({
  type, id, order: order++, props, ...(children ? { children: reorder(children) } : {}), ...(action ? { action } : {})
})
// orders count from 0 among siblings
function reorder(children) { return children.map((c, i) => ({ ...c, order: i })) }

const header = () => node('hstack', 'header', { spacing: 10, paddingHorizontal: 24, paddingVertical: 16, alignment: 'center' }, [
  node('button', 'back', { title: '', systemName: 'arrow.left', iconSize: 24, foreground: INK, a11yLabel: 'Kembali' }, undefined, { type: 'dismiss' }),
  node('text', 'pageTitle', { value: '[Page Name]', size: 17, weight: 'bold', color: INK, a11yTraits: ['header'] })
])

const insightCard = (chart) => node('card', 'insightCard', {
  alignment: 'fill', spacing: 12, background: '#FFFFFF', borderColor: BORDER, cornerRadius: 16, paddingHorizontal: 16, paddingVertical: 20
}, [
  node('text', 'insightTitle', { value: '[Insight Title]', size: 17, weight: 'bold', color: INK }),
  node('text', 'insightBody', { value: '[Insight Long Description]', size: 14, color: '#222222' }),
  ...(chart ? [
    node('chart', 'insightChart', {
      kind: 'bar', height: 180, color: CTA, showValues: false,
      data: [
        { key: 'm1', label: 'Jan', value: 40 }, { key: 'm2', label: 'Feb', value: 65 }, { key: 'm3', label: 'Mar', value: 50 },
        { key: 'm4', label: 'Apr', value: 80 }, { key: 'm5', label: 'Mei', value: 60 }
      ]
    }),
    node('vstack', 'chartNote', { alignment: 'center', spacing: 4, background: '#F7F7F7', cornerRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }, [
      node('text', 'chartNoteTitle', { value: '[Bar Chart Description]', size: 12, weight: 'bold', color: INK, align: 'center' }),
      node('text', 'chartNoteBody', { value: '[Bar Chart Detail]', size: 12, color: '#333333', align: 'center' })
    ])
  ] : [])
])

const listCard = (cta) => node('card', 'listCard', {
  alignment: 'fill', spacing: 0, background: '#FFFFFF', borderColor: BORDER, cornerRadius: 12, paddingHorizontal: 16, paddingVertical: 14
}, [
  node('hstack', 'listRow', { spacing: 12, alignment: 'center' }, [
    node('image', 'listIcon', { width: 32, height: 32, cornerRadius: 16, a11yLabel: 'Ikon' }),
    node('vstack', 'listTexts', { alignment: 'leading', spacing: 4 }, [
      node('text', 'listTitle', { value: '{{item.title}}', size: 14, weight: 'semibold', color: INK }),
      node('text', 'listDesc1', { value: '{{item.description1}}', size: 11, color: '#555555' }),
      node('text', 'listDesc2', { value: '{{item.description2}}', size: 14, weight: 'bold', color: INK })
    ]),
    ...(cta ? [] : [
      node('spacer', 'listGap', {}),
      node('image', 'listChevron', { systemName: 'chevron.right', foreground: INK, a11yLabel: 'Lihat detail' })
    ])
  ])
], cta ? undefined : { type: 'navigate', screen: '{{item.target}}' })

const ROWS = [1, 2, 3].map((n) => ({
  title: `[List Title ${n}]`, description1: '[Card Description 1]', description2: '[Card Description 2]', target: ''
}))

const feedbackButton = (id, title, symbol, value) => node('button', id, {
  title, systemName: symbol, iconPosition: 'top', iconSize: 26, iconPadding: 12, iconBackground: '#F7F7F7', iconForeground: INK,
  size: 12, weight: 'semibold', foreground: INK, group: 'feedback', value,
  selectedIconBackground: '#22C55E', selectedIconForeground: '#FFFFFF',
  visibleWhen: { state: 'feedback', in: ['', value] }, disabledWhen: { request: 'sendFeedback', equals: 'pending' }, transition: { visible: 'fade' }
}, undefined, { type: 'api', request: 'sendFeedback', params: { vote: '{{$selected.feedback}}' } })

function template(key, title, { chart, cta }) {
  order = 0
  const root = node('vstack', 'root', { alignment: 'fill', spacing: 0, background: '#FFFFFF' }, [
    node('vstack', 'top', { alignment: 'fill', spacing: -96 }, [
      node('vstack', 'hero', { alignment: 'fill', spacing: 8, background: TEAL }, [
        header(),
        node('vstack', 'illustrationBox', { alignment: 'fill', spacing: 0, paddingHorizontal: 48 }, [
          node('image', 'illustration', { height: 140, contentMode: 'fit', a11yLabel: 'Ilustrasi' })
        ]),
        node('spacer', 'heroTail', { height: 96 })
      ]),
      node('vstack', 'cardBox', { alignment: 'fill', spacing: 0, paddingHorizontal: 20 }, [insightCard(chart)])
    ]),
    node('vstack', 'section', { alignment: 'fill', spacing: 12, paddingHorizontal: 20, paddingVertical: 20 }, [
      node('text', 'sectionTitle', { value: '[Section Title]', size: 15, weight: 'bold', color: INK }),
      node('list', 'listCards', { items: ROWS, as: 'item', spacing: 12 }, [listCard(cta)])
    ]),
    node('vstack', 'feedback', { alignment: 'center', spacing: 12, paddingVertical: 16 }, [
      node('text', 'feedbackQuestion', { value: 'Suka dengan insight ini?', size: 12, color: '#333333' }),
      node('hstack', 'feedbackChoices', { spacing: 40, alignment: 'top' }, [
        feedbackButton('dislike', 'Kurang Suka', 'hand.thumbsdown', 'dislike'),
        feedbackButton('like', 'Suka!', 'hand.thumbsup', 'like')
      ]),
      node('text', 'feedbackThanks', { value: 'Terima kasih atas masukannya!', size: 12, color: '#333333', visibleWhen: { request: 'sendFeedback', equals: 'success' }, transition: { visible: 'fade' } })
    ]),
    node('spacer', 'bottomGap', { height: cta ? 88 : 24 }),
    ...(cta ? [node('vstack', 'footer', { alignment: 'fill', spacing: 0, paddingHorizontal: 20, paddingVertical: 16, background: '#FFFFFF', shadow: 'top', pin: 'bottom' }, [
      node('button', 'cta', { title: '[CTA Text]', variant: 'primary', background: CTA, foreground: INK, cornerRadius: 24, paddingVertical: 14, size: 14, weight: 'semibold' },
        undefined, { type: 'toast', message: 'Atur tujuan tombol ini di tab Konten', level: 'info' })
    ])] : [])
  ])
  return { schemaVersion: '2.6', template: { key, version: 1, title, state: { feedback: {} }, root: { ...root, order: 0 } } }
}

const TEMPLATES = [
  template('smartInsightV1', 'Smart Insight V1', { chart: false, cta: false }),
  template('smartInsightV1Cta', 'Smart Insight V1 + CTA', { chart: false, cta: true }),
  template('smartInsightV2', 'Smart Insight V2', { chart: true, cta: false }),
  template('smartInsightV2Cta', 'Smart Insight V2 + CTA', { chart: true, cta: true })
]

const SEED = new URL('../../service/template-service/src/main/resources/seed/shared/', import.meta.url)
const withSeed = existsSync(new URL('../../service/template-service/', import.meta.url))
if (withSeed) mkdirSync(SEED, { recursive: true })
for (const t of TEMPLATES) {
  const json = `${JSON.stringify(t, null, 2)}\n`
  const name = t.template.key.replace(/^smartInsight/, 'smart_insight_').toLowerCase()
  writeFileSync(new URL(`../spec/fixtures/valid/template_${name}.json`, import.meta.url), json)
  if (withSeed) writeFileSync(new URL(`${t.template.key}.json`, SEED), json)
  console.log(`wrote ${t.template.key}`)
}
