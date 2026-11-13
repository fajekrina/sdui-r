// @fajekrina/sdui-r/builder/react — <SduiTemplateBuilder /> (admin) and
// <SduiScreenBuilder /> (maker) wrap the DOM builders; <SduiBuilder /> is the plain Studio.
import React, { useEffect, useMemo, useRef } from 'react'
import { mountStudio, mountTemplateBuilder, type MountedStudio, type StudioOptions } from './studio'
import { mountScreenBuilder, type MountedScreenBuilder, type ScreenBuilderOptions } from './screen-builder'
import { EditorDocument } from './document'

export interface SduiBuilderProps extends StudioOptions {
  className?: string
  style?: React.CSSProperties
}

export function SduiBuilder(props: SduiBuilderProps) {
  return <StudioHost {...props} mount={mountStudio} />
}

/// sdui-r — the Template Builder (admin): components → a template document.
export function SduiTemplateBuilder(props: SduiBuilderProps) {
  const fallback = useMemo(() => new EditorDocument({ factory: props.factory, mode: 'template' }), [props.factory])
  return <StudioHost {...props} document={props.document ?? fallback} mount={mountTemplateBuilder} />
}

function StudioHost({ className, style, mount, ...options }: SduiBuilderProps & { mount: typeof mountStudio }) {
  const host = useRef<HTMLDivElement>(null)
  const studio = useRef<MountedStudio>()
  const optionsRef = useRef(options)
  optionsRef.current = options
  useEffect(() => {
    if (!host.current) return
    studio.current = mount(host.current, {
      ...optionsRef.current,
      onSave: optionsRef.current.onSave && ((p) => optionsRef.current.onSave?.(p)),
      onPublish: optionsRef.current.onPublish && ((p) => optionsRef.current.onPublish?.(p)),
      onSubmitForReview: optionsRef.current.onSubmitForReview && ((p, note) => optionsRef.current.onSubmitForReview?.(p, note)),
      onChange: (p) => optionsRef.current.onChange?.(p)
    })
    return () => { studio.current?.destroy(); studio.current = undefined }
  }, [options.document])
  // options that may arrive or change after mounting (lists, the title, the reviewer
  // role, a new active release after publishing)
  const { title, screens, requests, links, commands, catalog, readOnly, baseline, sampleData, assetURL } = options
  useEffect(() => {
    studio.current?.update({ title, screens, requests, links, commands, catalog, readOnly, baseline, sampleData, assetURL })
  }, [title, screens, requests, links, commands, catalog, readOnly, baseline, sampleData, assetURL])
  return <div ref={host} className={className} style={{ height: '100%', ...style }} />
}

export interface SduiScreenBuilderProps extends ScreenBuilderOptions {
  className?: string
  style?: React.CSSProperties
}

/// sdui-r — the Screen Builder (maker): pick a template, fill in its components → a value set.
export function SduiScreenBuilder({ className, style, ...options }: SduiScreenBuilderProps) {
  const host = useRef<HTMLDivElement>(null)
  const builder = useRef<MountedScreenBuilder>()
  const optionsRef = useRef(options)
  optionsRef.current = options
  useEffect(() => {
    if (!host.current) return
    builder.current = mountScreenBuilder(host.current, {
      ...optionsRef.current,
      loadTemplate: optionsRef.current.loadTemplate && ((c) => optionsRef.current.loadTemplate!(c)),
      onSave: optionsRef.current.onSave && ((v) => optionsRef.current.onSave?.(v)),
      onSubmitForReview: optionsRef.current.onSubmitForReview && ((v, note) => optionsRef.current.onSubmitForReview?.(v, note)),
      onChange: (v) => optionsRef.current.onChange?.(v)
    })
    return () => { builder.current?.destroy(); builder.current = undefined }
  }, [options.editor, options.screen])
  const { templates, title, catalog, readOnly, baseline, sampleData, assetURL } = options
  useEffect(() => {
    builder.current?.update({ templates, title, catalog, readOnly, baseline, sampleData, assetURL })
  }, [templates, title, catalog, readOnly, baseline, sampleData, assetURL])
  return <div ref={host} className={className} style={{ height: '100%', ...style }} />
}

export default SduiBuilder
export * from './index'
