// @fajekrina/sdui-r/builder/vue — <SduiTemplateBuilder /> (the admin designs a template) and
// <SduiScreenBuilder /> (the admin fills its content — `:show-templates="false"` for the
// Studio's "Isi konten" mode) wrap the DOM builders; <SduiBuilder /> is the plain Studio.
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { mountStudio, mountTemplateBuilder, type MountedStudio, type StudioCatalog, type TemplateDeprecation } from './studio'
import { mountScreenBuilder, type AssetSource, type MountedScreenBuilder } from './screen-builder'
import { EditorDocument } from './document'
import type { TemplateChoice, ValuesEditor } from './values-editor'
import type { ComponentFactory, SduiValue } from '../core'

const studioProps = {
  document: { type: Object as PropType<EditorDocument>, default: undefined },
  factory: { type: Object as PropType<ComponentFactory>, default: undefined },
  sampleData: { type: Object as PropType<Record<string, SduiValue>>, default: undefined },
  assetURL: { type: Function as PropType<(name: string) => string>, default: undefined },
  /// spec 2.2 — upload an image's default picture (template mode); answers the asset name
  uploadAsset: { type: Function as PropType<(source: AssetSource) => Promise<string>>, default: undefined },
  /// names offered by the action editor (the app's allow-lists; never URLs)
  screens: { type: Array as PropType<readonly string[]>, default: undefined },
  requests: { type: Array as PropType<readonly string[]>, default: undefined },
  /// chart data sources (a chart's api action); absent = charts use `requests`
  sources: { type: Array as PropType<readonly string[]>, default: undefined },
  links: { type: Array as PropType<readonly string[]>, default: undefined },
  commands: { type: Array as PropType<readonly string[]>, default: undefined },
  title: { type: String, default: undefined },
  /// the app's names: screens, requests, sources, links, commands, assets (an explicit list wins)
  catalog: { type: Object as PropType<StudioCatalog>, default: undefined },
  /// the active release: the builder lists the draft's changes against it
  baseline: { type: Object as PropType<object>, default: undefined },
  /// `adopt` (default, constructable stylesheet) or `external` (link studio.css yourself)
  stylesheet: { type: String as PropType<'adopt' | 'external'>, default: undefined },
  /// `@save` / `@publish` show the Save/Publish buttons (publish is direct); `@change` fires on every edit
  onSave: { type: Function as PropType<(payload: unknown) => void | Promise<void>>, default: undefined },
  onPublish: { type: Function as PropType<(payload: unknown) => void | Promise<void>>, default: undefined },
  onChange: { type: Function as PropType<(payload: unknown) => void>, default: undefined },
  /// template mode: the template's deprecation (null = in use) and `@deprecate` / `@restore`
  deprecation: { type: Object as PropType<TemplateDeprecation | null>, default: undefined },
  onDeprecate: { type: Function as PropType<(info: { reason: string; replacedBy?: string }) => void | Promise<void>>, default: undefined },
  onRestore: { type: Function as PropType<() => void | Promise<void>>, default: undefined },
  /// spec 2.6 — a page (a locked document): the template it is made from; differences are marked
  pageTemplate: { type: Object as PropType<object>, default: undefined }
}

const studioComponent = (name: string, mount: typeof mountStudio, template: boolean) => defineComponent({
  name,
  props: studioProps,
  setup(props) {
    const host = ref<HTMLDivElement>()
    let studio: MountedStudio | undefined
    onMounted(() => {
      studio = mount(host.value!, {
        document: props.document ?? (template ? new EditorDocument({ factory: props.factory, mode: 'template' }) : undefined),
        factory: props.factory,
        sampleData: props.sampleData,
        assetURL: props.assetURL,
        uploadAsset: props.uploadAsset && ((source) => props.uploadAsset!(source)),
        screens: props.screens,
        requests: props.requests,
        sources: props.sources,
        links: props.links,
        commands: props.commands,
        title: props.title,
        catalog: props.catalog,
        baseline: props.baseline,
        stylesheet: props.stylesheet,
        onSave: props.onSave && ((p) => props.onSave?.(p)),
        onPublish: props.onPublish && ((p) => props.onPublish?.(p)),
        deprecation: props.deprecation,
        pageTemplate: props.pageTemplate,
        onDeprecate: props.onDeprecate && ((info) => props.onDeprecate?.(info)),
        onRestore: props.onRestore && (() => props.onRestore?.()),
        onChange: (p) => props.onChange?.(p)
      })
    })
    // options that may arrive or change after mounting (lists loaded from a backend, the title)
    watch(() => [props.title, props.screens, props.requests, props.sources, props.links, props.commands, props.catalog, props.baseline, props.sampleData, props.assetURL, props.deprecation, props.pageTemplate], () => {
      studio?.update({
        title: props.title, screens: props.screens, requests: props.requests, sources: props.sources, links: props.links,
        commands: props.commands, catalog: props.catalog, baseline: props.baseline,
        sampleData: props.sampleData, assetURL: props.assetURL, deprecation: props.deprecation, pageTemplate: props.pageTemplate
      })
    })
    onBeforeUnmount(() => studio?.destroy())
    return () => h('div', { ref: host, style: { height: '100%', minHeight: 0 } })
  }
})

export const SduiBuilder = studioComponent('SduiBuilder', mountStudio, false)

/// sdui-r — the Template Builder (admin): components → a template document.
export const SduiTemplateBuilder = studioComponent('SduiTemplateBuilder', mountTemplateBuilder, true)

/// sdui-r — the content editor: fill in a template's components → a value set (with
/// `:show-templates="false"` the page's template is fixed).
/// @deprecated Edit content in the Template Builder instead: the Studio shows design and content in one tree and `splitContent` stores them apart (template + value set).
export const SduiScreenBuilder = defineComponent({
  name: 'SduiScreenBuilder',
  props: {
    editor: { type: Object as PropType<ValuesEditor>, default: undefined },
    screen: { type: String, default: undefined },
    templates: { type: Array as PropType<readonly TemplateChoice[]>, default: undefined },
    loadTemplate: { type: Function as PropType<(choice: TemplateChoice) => Promise<unknown>>, default: undefined },
    factory: { type: Object as PropType<ComponentFactory>, default: undefined },
    sampleData: { type: Object as PropType<Record<string, SduiValue>>, default: undefined },
    assetURL: { type: Function as PropType<(name: string) => string>, default: undefined },
    title: { type: String, default: undefined },
    catalog: { type: Object as PropType<StudioCatalog>, default: undefined },
    baseline: { type: Object as PropType<object>, default: undefined },
    stylesheet: { type: String as PropType<'adopt' | 'external'>, default: undefined },
    onSave: { type: Function as PropType<(values: unknown) => void | Promise<void>>, default: undefined },
    /// publish the values now (no review step)
    onPublish: { type: Function as PropType<(values: unknown) => void | Promise<void>>, default: undefined },
    /// false: no template list (the page's template is fixed)
    showTemplates: { type: Boolean, default: true },
    onChange: { type: Function as PropType<(values: unknown) => void>, default: undefined },
    /// store a dropped / picked picture or copy a link; answers the asset name
    uploadAsset: { type: Function as PropType<(source: AssetSource) => Promise<string>>, default: undefined },
    maxAssetBytes: { type: Number, default: undefined }
  },
  setup(props) {
    const host = ref<HTMLDivElement>()
    let builder: MountedScreenBuilder | undefined
    onMounted(() => {
      builder = mountScreenBuilder(host.value!, {
        editor: props.editor,
        screen: props.screen,
        templates: props.templates,
        loadTemplate: props.loadTemplate && ((c) => props.loadTemplate!(c)),
        factory: props.factory,
        sampleData: props.sampleData,
        assetURL: props.assetURL,
        title: props.title,
        catalog: props.catalog,
        baseline: props.baseline,
        stylesheet: props.stylesheet,
        showTemplates: props.showTemplates,
        onSave: props.onSave && ((v) => props.onSave?.(v)),
        onPublish: props.onPublish && ((v) => props.onPublish?.(v)),
        uploadAsset: props.uploadAsset && ((source) => props.uploadAsset!(source)),
        maxAssetBytes: props.maxAssetBytes,
        onChange: (v) => props.onChange?.(v)
      })
    })
    watch(() => [props.templates, props.title, props.catalog, props.baseline, props.sampleData, props.assetURL], () => {
      builder?.update({
        templates: props.templates, title: props.title, catalog: props.catalog,
        baseline: props.baseline, sampleData: props.sampleData, assetURL: props.assetURL
      })
    })
    onBeforeUnmount(() => builder?.destroy())
    return () => h('div', { ref: host, style: { height: '100%', minHeight: 0 } })
  }
})

export default SduiBuilder
export * from './index'
