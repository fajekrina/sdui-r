// @fajekrina/sdui-r/builder — two builders, written once against the DOM and wrapped
// by React and Vue (./builder/react, ./builder/vue):
// - Template Builder (admin): components → a template (ids + orders)   mountTemplateBuilder
// - Screen Builder (maker): templates → a value set for one screen     mountScreenBuilder
// plus the headless models (EditorDocument, ValuesEditor), DSL, preview and diff.
export { EditorDocument, type EditorMode, type ValidationIssue } from './document'
export { ValuesEditor, type TemplateChoice } from './values-editor'
export { mountScreenBuilder, type ScreenBuilderOptions, type ScreenBuilderUpdate, type MountedScreenBuilder } from './screen-builder'
export * from './tree'
export * from './dsl'
export { DSLExport } from './dsl-export'
export { renderPreview, findNodeJsonRange } from './preview'
export { mountStudio, mountTemplateBuilder, type StudioCatalog, type StudioOptions, type StudioUpdate, type MountedStudio } from './studio'
export { diff, type ChangeKind, type ScreenChange } from './diff'
export { fromUniversal, toIdentifier, type ConversionResult } from '../compat'
