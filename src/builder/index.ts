// @fajekrina/sdui-r/builder — two builders, written once against the DOM and wrapped
// by React and Vue (./builder/react, ./builder/vue):
// - Template Builder (the admin designs): components → a template       mountTemplateBuilder
// - content editor (the admin fills it): a template → a value set     mountScreenBuilder
// plus the headless models (EditorDocument, ValuesEditor), DSL, preview and diff.
export { EditorDocument, type EditorMode, type ValidationIssue } from './document'
export { ValuesEditor, type TemplateChoice } from './values-editor'
export { mountScreenBuilder, IMAGE_TYPES, type AssetSource, type ScreenBuilderOptions, type ScreenBuilderUpdate, type MountedScreenBuilder } from './screen-builder'
export { describeAction, describeComponent, actionBadge, actionUseOf, actionWarnings, requestWarnings, type ActionLists, type RequestLists } from './describe'
export { multilineText, optionsTable, colorField, wrapSelection, toOptions, type PickerOption } from './controls'
export * from './tree'
export * from './dsl'
export { DSLExport } from './dsl-export'
export { renderPreview, findNodeJsonRange, findValueJsonRange, clippedContainers } from './preview'
export { mountStudio, mountTemplateBuilder, deprecationText, groupOf, GROUPS, CHART_KINDS, chartReads, type FieldGroup, type StudioCatalog, type StudioOptions, type StudioUpdate, type MountedStudio, type TemplateDeprecation } from './studio'
export { diff, type ChangeKind, type ScreenChange } from './diff'
export { mergeContent, splitContent } from './content'
export { mergePage, splitPage, assertSameStructure, placeholders } from './page'
export { fromUniversal, toIdentifier, type ConversionResult } from '../compat'
export { CONDITION_PROPS, CONDITION_OPS, REQUEST_VALUES, conditionEditor, conditionOf, conditionParts, describeCondition, describeStateProps, requestNames, simulatedState, stateNames, stateValues, stateWarnings, type ConditionOp, type ConditionParts, type ConditionProp } from './state-editor'
