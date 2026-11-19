import { describe, expect, it } from 'vitest'
import { SchemaValidator, TemplateDocument, ValuesDocument, compose } from '../src/core'
import { mergeContent, splitContent } from '../src/builder'

// a page's design and content are edited in one tree, stored apart (template / value set)
const template = () => TemplateDocument.decode({
  schemaVersion: '2.2',
  template: {
    key: 'insight', version: 2, title: 'Insight',
    root: {
      type: 'vstack', id: 'root', order: 0, props: { spacing: 8 },
      children: [
        { type: 'text', id: 'text1', order: 0, props: { value: 'Judul', style: 'title', builderNote: 'judul utama' } },
        { type: 'image', id: 'image1', order: 1, props: { name: 'img_0123456789abcdef0123456789abcdef', height: 120 } },
        { type: 'button', id: 'button1', order: 2, props: { title: 'Lihat', variant: 'primary', systemName: 'star.fill', a11yLabel: 'Lihat semua' }, action: { type: 'api', request: 'submitCheckout' } }
      ]
    },
    variants: { compact: { type: 'text', id: 'text1', order: 0, props: { value: 'Judul pendek', size: 12 } } }
  }
})

describe('splitContent', () => {
  it('keeps no content in the template and every content prop in the value set', () => {
    const { template: t, values } = splitContent(template())
    const root = t.template.root
    expect(root.children[0]!.props).toEqual({ style: 'title', builderNote: 'judul utama' })
    expect(root.children[1]!.props).toEqual({ height: 120 })
    // a button's icon is design (not content); its title and a11y label are content
    expect(root.children[2]!.props).toEqual({ variant: 'primary', systemName: 'star.fill' })
    expect(root.children[2]!.action?.request).toBe('submitCheckout')
    expect(root.children.map((c) => c.order)).toEqual([0, 1, 2])
    expect(t.template.variants.compact!.props).toEqual({ size: 12 })
    expect(values.values.screen).toBe('insight')
    expect(values.values.template).toEqual({ key: 'insight', version: 2 })
    expect(values.values.components).toEqual({
      text1: { props: { value: 'Judul' } },   // root wins over the variant
      image1: { props: { name: 'img_0123456789abcdef0123456789abcdef' } },
      button1: { props: { title: 'Lihat', a11yLabel: 'Lihat semua' } }
    })
    // both halves are valid documents, and the value set fits its template
    const validator = new SchemaValidator()
    validator.validateTemplate(t)
    validator.validateValues(values, t)
  })

  it('composes back to the same screen the editor showed', () => {
    const doc = template()
    const { template: t, values } = splitContent(doc)
    const before = compose(doc.template).root
    const after = compose(t.template, values.values).root
    expect(after.toJSON()).toEqual(before.toJSON())
  })
})

describe('mergeContent', () => {
  it('writes the value set into the components and round-trips through splitContent', () => {
    const { template: t, values } = splitContent(template())
    const { document, dropped } = mergeContent(t, values)
    expect(dropped).toEqual([])
    expect(document.template.root.children[0]!.props).toEqual({ style: 'title', builderNote: 'judul utama', value: 'Judul' })
    // the variant shares the id: it shows the same content
    expect(document.template.variants.compact!.props).toEqual({ size: 12, value: 'Judul' })
    expect(splitContent(document).template.toJSON()).toEqual(t.toJSON())
    expect(splitContent(document).values.toJSON()).toEqual(values.toJSON())
  })

  it('drops content the template no longer has and keeps a template without values as is', () => {
    const values = ValuesDocument.decode({
      schemaVersion: '2.2',
      values: { screen: 'insight', template: { key: 'insight', version: 1 }, components: { gone: { props: { value: 'x' } }, text1: { props: { value: 'Baru', style: 'caption' } } } }
    })
    const { document, dropped } = mergeContent(template(), values)
    expect(dropped).toEqual(['gone', 'text1.style'])
    expect(document.template.root.children[0]!.props.value).toBe('Baru')
    expect(document.template.root.children[0]!.props.style).toBe('title')
    expect(mergeContent(template(), null).document.toJSON()).toEqual(template().toJSON())
  })
})
