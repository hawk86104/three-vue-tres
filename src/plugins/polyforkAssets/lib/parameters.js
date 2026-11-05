// Shared by the standalone editor, zone3Deditor and exported scene runtimes.
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
const forbiddenKeys = ['__proto__', 'constructor', 'prototype']

export const isPolyforkNumber = (parameter) => ['range', 'number'].includes(parameter?.type)
export const isPolyforkToggle = (parameter) => ['toggle', 'bool'].includes(parameter?.type)
export const hasPolyforkRange = (parameter) => Number.isFinite(parameter.min) && Number.isFinite(parameter.max) && parameter.max > parameter.min
export const isSupportedPolyforkParameter = (parameter) => Boolean(parameter && (
    (parameter.type === 'choice' && Array.isArray(parameter.options) && parameter.options.length) ||
    parameter.type === 'color' || isPolyforkToggle(parameter) || isPolyforkNumber(parameter)
))

export function polyforkPresetKey(schema) {
    if (schema.params?.colorway?.type === 'choice') return 'colorway'
    const names = Object.keys(schema.presets || {})
    return Object.entries(schema.params || {}).find(([, parameter]) =>
        parameter?.type === 'choice' && Array.isArray(parameter.options) && parameter.options.some((option) => names.includes(option)),
    )?.[0]
}

export function getPolyforkParameterValue(schema, overrides, key) {
    if (hasOwn(overrides, key)) return overrides[key]
    const presetKey = polyforkPresetKey(schema)
    const selected = overrides[presetKey] ?? schema.params?.[presetKey]?.default
    return schema.presets?.[selected]?.[key] ?? schema.params?.[key]?.default
}

export function validatePolyforkParams(schema, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数格式不正确')
    const result = {}
    for (const [key, value] of Object.entries(input)) {
        if (!hasOwn(schema.params || {}, key) || forbiddenKeys.includes(key)) throw new Error(`未知参数：${key}`)
        const parameter = schema.params[key]
        let valid = false
        if (parameter?.type === 'choice') valid = Array.isArray(parameter.options) && parameter.options.includes(value)
        else if (parameter?.type === 'color') valid = typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
        else if (isPolyforkToggle(parameter)) valid = typeof value === 'boolean'
        else if (isPolyforkNumber(parameter)) valid = Number.isFinite(value) &&
            (!Number.isFinite(parameter.min) || value >= parameter.min) && (!Number.isFinite(parameter.max) || value <= parameter.max)
        if (!valid) throw new Error(`参数 ${key} 的值无效`)
        result[key] = value
    }
    return result
}

export function mergePolyforkParams(schema, current, patch) {
    validatePolyforkParams(schema, patch)
    const result = { ...current }
    const presetKey = polyforkPresetKey(schema)
    if (presetKey && hasOwn(patch, presetKey)) {
        Object.keys(schema.presets?.[patch[presetKey]] || {}).forEach((key) => { delete result[key] })
    }
    // Explicit values in the same patch override the preset, irrespective of key order.
    return validatePolyforkParams(schema, { ...result, ...patch })
}

export function polyforkColorValue(value) {
    if (typeof value === 'number') return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`
    return /^#[\da-f]{6}$/i.test(value || '') ? value : '#ffffff'
}
