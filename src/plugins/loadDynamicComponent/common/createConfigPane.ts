/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-29 17:17:45
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-03-26 19:51:27
 */
import { Pane } from 'tweakpane'
import * as EssentialsPlugin from '@pangenerator/tweakpane-textarea-plugin'
import JSON5 from 'json5'
import { reactive, watch, watchEffect } from 'vue'

interface SelectOption {
  label: string
  value: any
  keywords?: string
  category?: string
}

type VariantField = Pick<ConfigSchemaItem, 'name' | 'com' | 'options' | 'min' | 'max' | 'step'> & {
  key: string
  defaultValue: string | number | boolean
}

export interface ConfigSchemaItem {
  name: string
  com: 'Select' | 'ColorPicker' | 'Switch' | 'Slider' | 'Text' | 'jsonText' | 'ActionButton'
  group?: string
  action?: string
  options?: SelectOption[]
  searchable?: boolean
  variants?: { by: string, fields: Record<string, VariantField[]> }
  readonly?: boolean
  hideWhenEmpty?: boolean
  min?: number
  max?: number
  step?: number
}

export type ConfigSchema = Record<string, ConfigSchemaItem>

export interface ConfigPaneActionContext {
  actionId: string
  values: Record<string, any>
}

export interface CreateConfigPaneOptions {
  onAction?: (context: ConfigPaneActionContext) => void | Promise<void>
}

function addValueBinding(controls: any, values: Record<string, any>, key: string, item: ConfigSchemaItem) {
  const label = item.name
  switch (item.com) {
    case 'Select':
      return controls.addBinding(values, key, {
        label,
        options: item.options && Object.fromEntries(item.options.map(option => [option.label, option.value])),
      })
    case 'ColorPicker':
      return controls.addBinding(values, key, { label, picker: 'inline' })
    case 'Switch':
      return controls.addBinding(values, key, { label })
    case 'Slider':
      return controls.addBinding(values, key, { label, min: item.min, max: item.max, step: item.step })
    case 'Text':
      return controls.addBinding(values, key, { label, readonly: item.readonly ?? false })
    default:
      return undefined
  }
}

function addSearchableSelect(controls: any, values: Record<string, any>, key: string, item: ConfigSchemaItem) {
  const options = item.options ?? []
  const filters = reactive({ query: '', category: '' })
  const categories = Array.from(new Set(options.flatMap(option => option.category ? [option.category] : [])))
  const search = controls.addBinding(filters, 'query', { label: '搜索' })
  const input = search.element.querySelector('input') as HTMLInputElement | null
  if (input) {
    input.type = 'search'
    input.placeholder = '输入关键词'
    input.addEventListener('input', () => { filters.query = input.value })
  }
  if (categories.length) {
    controls.addBinding(filters, 'category', {
      label: '分类',
      options: { 全部分类: '', ...Object.fromEntries(categories.map(category => [category, category])) },
    })
  }

  const list = controls.addBlade({
    view: 'list',
    label: item.name,
    options: options.map(option => ({ text: option.label, value: option.value })),
    value: values[key],
  })
  let syncing = false
  list.on('change', ({ value }: { value: unknown }) => {
    if (!syncing) { values[key] = value }
  })

  watchEffect(() => {
    const query = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const selection = values[key]
    const matches = new Set(options.filter((option) => {
      if (option.value === '') { return false }
      if (filters.category && option.category !== filters.category) { return false }
      const text = `${option.label} ${option.keywords ?? ''} ${option.category ?? ''} ${option.value}`.toLowerCase()
      return query.every(word => text.includes(word))
    }))
    const available = options.filter(option => option.value === '' || option.value === selection || matches.has(option))
    if (!available.some(option => option.value === selection)) {
      available.unshift({ label: String(selection), value: selection })
    }

    syncing = true
    try {
      list.label = matches.size ? item.name : '无匹配项'
      list.options = available.map(option => ({ text: option.label, value: option.value }))
      list.value = selection
    }
    finally {
      syncing = false
    }
  })
}

function readJsonObject(json: unknown): Record<string, unknown> {
  try {
    const value: unknown = typeof json === 'string' ? JSON.parse(json) : null
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }
  catch { /* An edit can replace invalid saved JSON. */ }
  return {}
}

function addVariantFields(controls: any, values: Record<string, any>, key: string, item: ConfigSchemaItem) {
  const variants = item.variants!
  const folder = controls.addFolder({ title: item.name, expanded: true, hidden: true })
  const draft: Record<string, unknown> = {}
  let previousSelection: unknown
  let syncing = false

  watch(() => [values[variants.by], values[key]] as const, ([selection, json]) => {
    const fields = typeof selection === 'string' && Object.hasOwn(variants.fields, selection)
      ? variants.fields[selection]!
      : []
    const rebuild = selection !== previousSelection
    previousSelection = selection
    if (rebuild) {
      for (const child of folder.children) { child.dispose() }
    }
    folder.hidden = fields.length === 0

    const saved = readJsonObject(json)
    for (const field of fields) {
      const value = saved[field.key]
      const valid = typeof value === typeof field.defaultValue
        && (!field.options || field.options.some(option => option.value === value))
      draft[field.key] = valid ? value : field.defaultValue
      if (rebuild) {
        addValueBinding(folder, draft, field.key, field)?.on('change', (event: { value: unknown, last?: boolean }) => {
          if (!syncing && event.last !== false && values[variants.by] === selection) {
            values[key] = JSON.stringify({ ...readJsonObject(values[key]), [field.key]: event.value })
          }
        })
      }
    }
    syncing = true
    try {
      folder.refresh()
    }
    finally {
      syncing = false
    }
  }, { immediate: true })
}

export function createConfigPane(
  container: HTMLElement | null,
  config: ConfigSchema,
  values: Record<string, any>,
  options?: CreateConfigPaneOptions,
) {
  const pane = new Pane({
    container: container ?? undefined,
    title: '配置',
  }) as any

  pane.registerPlugin(EssentialsPlugin)

  const folders = new Map<string, any>()
  Object.entries(config).forEach(([key, item]) => {
    if (item.group && !folders.has(item.group)) {
      folders.set(item.group, pane.addFolder({ title: item.group, expanded: true }))
    }
    const controls = item.group ? folders.get(item.group) : pane
    if (item.com === 'Select' && item.searchable) {
      addSearchableSelect(controls, values, key, item)
      return
    }
    switch (item.com) {
      case 'Select':
      case 'ColorPicker':
      case 'Switch':
      case 'Slider':
      case 'Text': {
        const binding = addValueBinding(controls, values, key, item)
        if (!item.readonly) {
          binding.on('change', ({ value }: { value: unknown }) => { values[key] = value })
        }
        if (item.hideWhenEmpty) {
          watch(() => Boolean(values[key]), (visible) => { binding.hidden = !visible }, { immediate: true })
        }
        break
      }

      case 'jsonText': {
        if (item.variants) {
          addVariantFields(controls, values, key, item)
          break
        }
        const textBinding = controls.addBinding(values, key, {
          view: 'textarea',
          label: item.name,
          rows: 8,
          placeholder: '请在此输入 JSON...',
        })

        values.jsonError = ''
        values.jsonTextChangeNumber = 0

        const errorBinding = controls.addBinding(values, 'jsonError', {
          label: 'JSON错误',
          readonly: true,
        })

        controls.addButton({ title: '应用JSON数据' }).on('click', () => {
          try {
            const parsed = JSON5.parse(values[key])
            values[key] = JSON.stringify(parsed, null, 2)
            values.jsonError = 'JSON 校验成功'
            textBinding.refresh()
            errorBinding.refresh()
            values.jsonTextChangeNumber++
          }
          catch (error: any) {
            values.jsonError = error.message
            errorBinding.refresh()
            console.warn('JSON 格式错误', error)
          }
        })
        break
      }

      case 'ActionButton':
        controls.addButton({ title: item.name }).on('click', async () => {
          await options?.onAction?.({
            actionId: item.action || key,
            values,
          })
        })
        break

      default:
        console.warn(`Unknown config control: ${item.com}`)
    }
  })

  return pane
}
