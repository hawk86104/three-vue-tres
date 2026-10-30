<template>
    <div class="editor-page">
        <header class="toolbar">
            <div class="heading">
                <span class="eyebrow">POLYFORK / TVT.JS</span>
                <h1>模型编辑</h1>
                <span v-if="asset" class="asset-name">{{ asset.title || asset.id }}</span>
            </div>
            <div class="actions">
                <button :disabled="!ready" @click="resetParams">恢复默认</button>
                <button :disabled="!ready" @click="fileInput.click()">导入配置</button>
                <button :disabled="!ready" @click="exportConfig">导出 JSON</button>
                <button class="primary" :disabled="!ready" @click="saveConfig">保存配置</button>
                <input ref="fileInput" class="file-input" type="file" accept=".json,application/json" @change="importConfig" />
            </div>
        </header>

        <div class="editor-body">
            <main class="viewer">
                <TresCanvas clear-color="#e9eef3" :tone-mapping="NoToneMapping">
                    <TresPerspectiveCamera :position="[5, 4, 7]" :fov="45" :near="0.01" :far="1000" />
                    <OrbitControls :target="[0, 1, 0]" />
                    <TresAmbientLight :intensity="1.2" />
                    <TresDirectionalLight :position="[4, 8, 6]" :intensity="2" />
                    <TresGridHelper :args="[12, 12, 0x9aabb9, 0xc7d2db]" />
                    <RemixPreview :model="modelGroup" />
                </TresCanvas>
                <div class="viewer-caption">
                    <strong>{{ asset?.title || 'Polyfork 模型' }}</strong>
                    <span>{{ asset?.id || '等待加载' }}</span>
                    <a v-if="asset?.page" :href="asset.page" target="_blank" rel="noopener noreferrer">查看原始资源 ↗</a>
                </div>
                <div v-if="loading" class="viewer-message">正在加载模型和可编辑参数…</div>
                <div v-else-if="loadError" class="viewer-message error" role="alert">{{ loadError }}</div>
                <div class="viewer-bottom">
                    <span>拖动旋转 · 滚轮缩放 · 预览已适配大小</span>
                    <button :disabled="!ready" @click="fitModel">适配模型</button>
                </div>
            </main>

            <aside class="panel">
                <div class="panel-header">
                    <span class="eyebrow">MODEL PARAMETERS</span>
                    <h2>模型参数</h2>
                    <p>根据模型提供的参数实时调整外观和形状。</p>
                </div>
                <p v-if="notice" class="notice" role="status">{{ notice }}</p>
                <p v-if="editError" class="notice error" role="alert">{{ editError }}</p>
                <div v-if="ready" class="parameters">
                    <p v-if="!parameters.length" class="empty">这个模型没有提供可编辑参数。</p>
                    <div v-for="[key, parameter] in parameters" :key="key" class="parameter">
                        <div class="parameter-title">
                            <label :for="`param-${key}`">{{ parameter.label || key }}</label>
                            <span v-if="isNumber(parameter)">{{ getValue(key, parameter) }}</span>
                            <span v-else-if="parameter.type === 'color'" class="color-value">{{ getValue(key, parameter) }}</span>
                        </div>
                        <select v-if="parameter.type === 'choice'" :id="`param-${key}`" :value="choiceIndex(key, parameter)" @change="setParam(key, parameter.options[Number($event.target.value)])">
                            <option v-for="(option, index) in parameter.options" :key="index" :value="index">{{ option }}</option>
                        </select>
                        <input v-else-if="parameter.type === 'color'" :id="`param-${key}`" class="color-input" type="color" :value="colorValue(getValue(key, parameter))" @input="setParam(key, $event.target.value)" />
                        <input v-else-if="isToggle(parameter)" :id="`param-${key}`" class="toggle-input" type="checkbox" :checked="!!getValue(key, parameter)" @change="setParam(key, $event.target.checked)" />
                        <template v-else-if="isNumber(parameter)">
                            <input v-if="hasRange(parameter)" :id="`param-${key}`" type="range" :min="parameter.min" :max="parameter.max" :step="rangeStep(parameter)" :value="getValue(key, parameter)" @input="setParam(key, $event.target.valueAsNumber)" />
                            <input v-else :id="`param-${key}`" type="number" :min="parameter.min" :max="parameter.max" :step="rangeStep(parameter)" :value="getValue(key, parameter)" @change="setParam(key, $event.target.valueAsNumber)" />
                            <div v-if="hasRange(parameter)" class="range-labels"><span>{{ parameter.min }}</span><span>{{ parameter.max }}</span></div>
                        </template>
                        <details v-if="parameter.describe"><summary>参数说明</summary><p>{{ parameter.describe }}</p></details>
                    </div>
                    <p v-if="unsupported.length" class="empty">暂不支持的参数类型：{{ unsupported.join('、') }}</p>
                </div>
                <div class="panel-footer">配置保存在当前浏览器，可导出 JSON 在其他设备恢复。模型来源：<a href="https://polyfork.dev" target="_blank" rel="noopener noreferrer">Polyfork ↗</a></div>
            </aside>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from '@fesjs/fes'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { Box3, Group, NoToneMapping, Vector3 } from 'three'
import RemixPreview from '../components/RemixPreview.vue'
import { loadPolyforkRemix } from '../lib/remix.js'

const route = useRoute()
const fileInput = ref(null)
const asset = ref(null)
const schema = ref({ params: {}, presets: {} })
const overrides = ref({})
const loading = ref(true)
const ready = ref(false)
const loadError = ref('')
const editError = ref('')
const notice = ref('')
const modelGroup = new Group()
let createAsset = null
let currentModel = null
let disposed = false

const isNumber = (parameter) => ['range', 'number'].includes(parameter.type)
const isToggle = (parameter) => ['toggle', 'bool'].includes(parameter.type)
const hasRange = (parameter) => Number.isFinite(parameter.min) && Number.isFinite(parameter.max) && parameter.max > parameter.min
const isSupported = (parameter) => parameter && (
    (parameter.type === 'choice' && Array.isArray(parameter.options) && parameter.options.length) ||
    parameter.type === 'color' || isToggle(parameter) || isNumber(parameter)
)
const entries = computed(() => Object.entries(schema.value.params || {}))
const parameters = computed(() => entries.value.filter(([, parameter]) => isSupported(parameter)))
const unsupported = computed(() => entries.value.filter(([, parameter]) => !isSupported(parameter)).map(([key]) => key))
const presetKey = computed(() => {
    if (schema.value.params?.colorway?.type === 'choice') return 'colorway'
    const names = Object.keys(schema.value.presets || {})
    return parameters.value.find(([, parameter]) => parameter.type === 'choice' && parameter.options.some((option) => names.includes(option)))?.[0]
})
const storageKey = () => `tvt.polyfork.remix.${asset.value.id}`

function getValue(key, parameter) {
    if (Object.prototype.hasOwnProperty.call(overrides.value, key)) return overrides.value[key]
    const presetParam = schema.value.params?.[presetKey.value]
    const selectedPreset = overrides.value[presetKey.value] ?? presetParam?.default
    const preset = schema.value.presets?.[selectedPreset]
    return preset?.[key] ?? parameter.default
}

function choiceIndex(key, parameter) {
    return Math.max(0, parameter.options.indexOf(getValue(key, parameter)))
}

function colorValue(value) {
    if (typeof value === 'number') return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`
    return /^#[\da-f]{6}$/i.test(value || '') ? value : '#ffffff'
}

function rangeStep(parameter) {
    if (Number.isFinite(parameter.step) && parameter.step > 0) return parameter.step
    return 'any'
}

function resourcesOf(model) {
    const resources = new Set()
    model?.traverse((object) => {
        if (object.geometry) resources.add(object.geometry)
        if (object.skeleton) resources.add(object.skeleton)
        for (const material of [object.material].flat().filter(Boolean)) {
            resources.add(material)
            Object.values(material).forEach((value) => {
                if (value?.isTexture) resources.add(value)
            })
        }
    })
    return resources
}

function disposeModel(model, retainedModel) {
    const retained = resourcesOf(retainedModel)
    resourcesOf(model).forEach((resource) => {
        if (!retained.has(resource)) resource.dispose()
    })
}

function fitModel() {
    if (!currentModel) return
    modelGroup.position.set(0, 0, 0)
    modelGroup.scale.setScalar(1)
    modelGroup.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(currentModel)
    const size = bounds.getSize(new Vector3())
    const scale = 3 / Math.max(size.x, size.y, size.z)
    if (bounds.isEmpty() || !Number.isFinite(scale) || scale <= 0) return
    const center = bounds.getCenter(new Vector3())
    modelGroup.scale.setScalar(scale)
    modelGroup.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
}

function renderModel(nextParams, fit = false) {
    const next = createAsset(nextParams)
    if (!next?.isObject3D) throw new Error('模型程序没有返回可显示的三维对象')
    const previous = currentModel
    modelGroup.add(next)
    if (previous) modelGroup.remove(previous)
    currentModel = next
    if (fit) fitModel()
    if (previous) disposeModel(previous, next)
}

function validateParams(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数格式不正确')
    const result = {}
    for (const [key, value] of Object.entries(input)) {
        if (!Object.prototype.hasOwnProperty.call(schema.value.params, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`未知参数：${key}`)
        const parameter = schema.value.params[key]
        let valid = false
        if (parameter.type === 'choice') valid = Array.isArray(parameter.options) && parameter.options.includes(value)
        else if (parameter.type === 'color') valid = typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
        else if (isToggle(parameter)) valid = typeof value === 'boolean'
        else if (isNumber(parameter)) valid = Number.isFinite(value) && (!Number.isFinite(parameter.min) || value >= parameter.min) && (!Number.isFinite(parameter.max) || value <= parameter.max)
        if (!valid) throw new Error(`参数 ${key} 的值无效`)
        result[key] = value
    }
    return result
}

function applyParams(next, fit = false) {
    try {
        const validated = validateParams(next)
        renderModel(validated, fit)
        overrides.value = validated
        editError.value = ''
        return true
    } catch (error) {
        editError.value = `无法更新模型：${error.message || error}`
        return false
    }
}

function setParam(key, value) {
    const next = { ...overrides.value, [key]: value }
    if (key === presetKey.value && schema.value.presets?.[value]) {
        Object.keys(schema.value.presets[value]).forEach((name) => { delete next[name] })
        next[key] = value
    }
    if (applyParams(next)) notice.value = '参数已修改，保存后可在本机恢复。'
}

function resetParams() {
    if (applyParams({})) notice.value = '已恢复默认参数，保存后可在本机恢复。'
}

function makeConfig() {
    return { version: 1, source: 'polyfork', assetId: asset.value.id, params: { ...overrides.value } }
}

function readConfig(config) {
    if (!config || config.version !== 1 || config.source !== 'polyfork' || config.assetId !== asset.value.id) {
        throw new Error('配置与当前模型不匹配')
    }
    return validateParams(config.params)
}

function saveConfig() {
    try {
        localStorage.setItem(storageKey(), JSON.stringify(makeConfig()))
        editError.value = ''
        notice.value = '配置已保存到当前浏览器。'
    } catch (error) {
        editError.value = `保存失败：${error.message || error}`
    }
}

function exportConfig() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(makeConfig(), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${asset.value.id}-polyfork.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = '配置已导出，可在同一模型的编辑页导入。'
}

async function importConfig(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
        if (file.size > 1024 * 1024) throw new Error('配置文件不能超过 1 MB')
        const next = readConfig(JSON.parse(await file.text()))
        if (applyParams(next, true)) notice.value = '配置已导入，点击保存可在本机恢复。'
    } catch (error) {
        editError.value = `导入失败：${error.message || error}`
    }
}

onMounted(async () => {
    try {
        const result = await loadPolyforkRemix(route.query.id)
        if (disposed) return
        asset.value = result.asset
        schema.value = {
            params: result.schema.params && typeof result.schema.params === 'object' ? result.schema.params : {},
            presets: result.schema.presets && typeof result.schema.presets === 'object' ? result.schema.presets : {},
        }
        createAsset = result.createAsset
        let initial = {}
        try {
            const saved = localStorage.getItem(storageKey())
            if (saved) {
                initial = readConfig(JSON.parse(saved))
                notice.value = '已恢复本机保存的配置。'
            }
        } catch {
            notice.value = '本机保存的配置无法读取，已使用默认参数。'
        }
        if (!applyParams(initial, true)) throw new Error(editError.value)
        ready.value = true
    } catch (error) {
        if (!disposed) loadError.value = `加载失败：${error.message || error}`
    } finally {
        if (!disposed) loading.value = false
    }
})

onUnmounted(() => {
    disposed = true
    if (currentModel) {
        modelGroup.remove(currentModel)
        disposeModel(currentModel)
    }
})
</script>

<style scoped>
.editor-page { position: fixed; z-index: 100000; inset: 0; display: flex; flex-direction: column; color: #1e2c37; font: 14px/1.5 system-ui, sans-serif; background: #e9eef3; }
.toolbar { z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 72px; padding: 8px 24px; background: #fff; box-shadow: 0 3px 20px #243d4d12; }
.heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 12px; min-width: 0; }
.heading h1 { margin: 0; font-size: 20px; white-space: nowrap; }
.eyebrow { color: #218d79; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.asset-name { overflow: hidden; color: #71838e; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
.actions button, .viewer-bottom button { padding: 8px 12px; border: 1px solid #d9e4e6; border-radius: 7px; color: #42615d; white-space: nowrap; background: #fff; }
.actions .primary { border-color: #208b78; color: #fff; background: #208b78; }
.file-input { display: none; }
.editor-body { display: flex; flex: 1; min-height: 0; }
.viewer { position: relative; flex: 1; min-width: 0; min-height: 0; }
.viewer :deep(canvas) { display: block; width: 100%; height: 100%; }
.viewer-caption, .viewer-bottom, .viewer-message { position: absolute; padding: 10px 13px; border-radius: 8px; background: #ffffffdf; }
.viewer-caption { top: 20px; left: 20px; display: grid; gap: 2px; max-width: calc(100% - 66px); }
.viewer-caption span, .viewer-caption a { font-size: 12px; overflow-wrap: anywhere; }
.viewer-caption span { color: #70838e; }
a { color: #208b78; text-decoration: none; }
.viewer-bottom { right: 20px; bottom: 20px; left: 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #70838e; font-size: 12px; }
.viewer-bottom button { padding: 5px 9px; }
.viewer-message { top: 50%; left: 50%; max-width: 75%; transform: translate(-50%, -50%); text-align: center; }
.panel { display: flex; flex: 0 0 340px; flex-direction: column; min-height: 0; padding: 22px; background: #fff; box-shadow: -4px 0 24px #243d4d12; }
.panel-header h2 { margin: 2px 0; font-size: 20px; }
.panel-header p { margin: 4px 0 16px; color: #82919a; font-size: 12px; }
.notice { margin: 0 0 12px; padding: 9px; border-radius: 6px; color: #287865; font-size: 12px; background: #edf8f5; overflow-wrap: anywhere; }
.error { color: #a33939; background: #fff0ef; }
.parameters { min-height: 0; overflow-y: auto; }
.parameter { padding: 13px 0; border-top: 1px solid #edf1f2; }
.parameter-title { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; font-weight: 600; }
.parameter-title span { color: #71838e; font-size: 12px; font-weight: 400; }
select, input[type='number'] { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid #d8e2e7; border-radius: 7px; color: #203440; background: #f9fbfc; }
input[type='range'] { width: 100%; margin: 2px 0; accent-color: #208b78; }
.range-labels { display: flex; justify-content: space-between; color: #92a1a8; font-size: 11px; }
.color-input { width: 58px; height: 32px; padding: 2px; border: 1px solid #d8e2e7; border-radius: 5px; background: #fff; }
.toggle-input { width: 18px; height: 18px; accent-color: #208b78; }
details { margin-top: 7px; color: #84949b; font-size: 11px; }
summary { cursor: pointer; }
details p { margin: 6px 0 0; line-height: 1.5; }
.empty { color: #84949b; font-size: 12px; }
.panel-footer { margin-top: auto; padding-top: 14px; color: #84949b; font-size: 12px; }
@media (max-width: 800px) {
    .toolbar { align-items: flex-start; flex-direction: column; gap: 8px; padding: 12px 14px; }
    .actions { justify-content: flex-start; }
    .actions button { padding: 6px 9px; font-size: 12px; }
    .editor-body { flex-direction: column; }
    .viewer { flex: 1 1 48%; }
    .panel { flex: 1 1 52%; box-sizing: border-box; padding: 14px; }
    .panel-header p { margin-bottom: 8px; }
    .viewer-caption { top: 10px; left: 10px; }
    .viewer-bottom { right: 10px; bottom: 10px; left: 10px; }
}
</style>
