<template>
    <div>
        <section v-show="tab === 'parts'">
            <p class="hint">点击按钮让部件沿声明的范围运动，再次点击复位。</p>
            <div v-if="rigNames.length" class="rig-buttons">
                <button v-for="name in rigNames" :key="name" type="button" class="rig-button"
                    :class="{ active: state.joints[name] }" :disabled="!node(name)" :aria-pressed="!!state.joints[name]"
                    @click="toggleJoint(name)">{{ rig[name]?.type === 'slide' ? '滑动' : '旋转' }}：{{ name }}</button>
            </div>
            <p v-else class="hint">当前模型没有声明可运动的部件。</p>
            <details v-if="partNames.length" class="visibility-list">
                <summary>显示 / 隐藏部件</summary>
                <label v-for="name in partNames" :key="name" class="row visibility-item">
                    <span>{{ name }}</span><input type="checkbox" :checked="isVisible(name)" @change="setVisible(name, $event.target.checked)" />
                </label>
            </details>
            <button class="secondary" @click="resetParts">重置部件</button>
        </section>

        <section v-show="tab === 'ik'">
            <p class="hint">{{ asset.ik_type === 'arm' ? '输入模型坐标中的目标点，机械臂会在关节范围内尝试到达。' : '行走使用距离驱动的 IK，预览沿直线循环并在平地落脚。' }}</p>
            <div class="field">
                <label class="row"><span>启用 {{ asset.ik_type === 'arm' ? '机械臂' : '行走' }} IK</span><input type="checkbox" :checked="state.ik.enabled" @change="setIKEnabled($event.target.checked)" /></label>
                <p v-if="ikLoading" class="hint">正在加载 IK 求解器…</p>
                <template v-if="state.ik.enabled && asset.ik_type === 'arm' && state.ik.target">
                    <label v-for="(axis, index) in axes" :key="axis" class="axis-control">目标 {{ axis.toUpperCase() }} (m)
                        <input type="number" step="0.1" :value="state.ik.target[index]" @change="setTarget(index, $event.target.valueAsNumber)" />
                    </label>
                    <p class="hint">红点为目标位置<span v-if="shortfall !== null">；距离目标 {{ shortfall.toFixed(2) }} m</span>。</p>
                </template>
                <template v-if="state.ik.enabled && asset.ik_type === 'legs'">
                    <label class="axis-control">行走速度 (m/s)
                        <input type="number" min="0.05" max="10" step="0.1" :value="state.ik.speed" @change="setWalkSpeed($event.target.valueAsNumber)" />
                    </label>
                    <button class="secondary" :disabled="!ikReady" @click="state.ik.playing = !state.ik.playing">{{ state.ik.playing ? '暂停行走' : '开始行走' }}</button>
                </template>
                <p v-if="state.ik.enabled" class="hint">IK 会控制相关关节；点击部件动作时会关闭 IK。</p>
            </div>
        </section>

        <section v-show="tab === 'decal'">
            <p v-if="!decals.length" class="hint">这个模型没有声明可用的贴花区域，请选择支持贴花的模型。</p>
            <p v-else class="hint">选择贴花区域后可预览示例，也可上传 SVG 标志。渐变和透明效果会以静态图片显示。</p>
            <div v-if="decals.length" class="field">
                <label>贴花区域
                    <select :value="state.decal.area" @change="setArea($event.target.value)">
                        <option v-for="area in decals" :key="area.name" :value="area.name">{{ area.name }}</option>
                    </select>
                </label>
                <p v-if="selectedArea?.describe" class="hint">{{ selectedArea.describe }}</p>
                <label class="upload">{{ state.decal.svg ? '更换 SVG' : '上传 SVG 标志' }}
                    <input type="file" accept=".svg,image/svg+xml" @change="uploadSvg" />
                </label>
                <button class="secondary" @click="showExample">使用示例</button>
                <button class="secondary" @click="focusDecal">查看位置</button>
                <button v-if="state.decal.svg && !decalApplied && !decalLoading" class="secondary" @click="retryDecal">重试贴花</button>
                <button v-if="state.decal.svg" class="secondary" @click="removeDecal">移除贴花</button>
                <p v-if="decalLoading" class="hint">正在生成贴花…</p>
                <p v-else-if="decalApplied" class="hint">{{ state.decal.sample ? '当前显示示例贴花。' : '当前显示上传的 SVG 静态画面。' }}贴花会随配置保存。</p>
                <p v-else-if="state.decal.svg" class="hint">贴花未应用，请查看上方错误提示或更换区域。</p>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { CanvasTexture, MathUtils, MeshStandardMaterial, SRGBColorSpace, Vector3 } from 'three'
import { createPolyforkHelperLoader } from '../lib/remix.js'

const props = defineProps({
    tab: { type: String, required: true },
    asset: { type: Object, required: true },
    model: { type: Object, required: true },
    root: { type: Object, required: true },
    rig: { type: Object, required: true },
    detachable: { type: Array, required: true },
    decals: { type: Array, required: true },
    parameters: { type: Object, required: true },
    initialState: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['notice', 'error', 'target', 'reset-model', 'focus-decal'])
const axes = ['x', 'y', 'z']
const EXAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect x="2" y="2" width="236" height="116" rx="18" fill="#fff"/><path d="M30 88 60 25 90 88H75l-6-15H51l-6 15zm26-27h8L60 49z" fill="#187d71"/><path d="M106 26h24v62h-24zm39 0h24v62h-24zm38 0h27v12h-7v50h-13V38h-7z" fill="#1b3542"/></svg>'
const loader = createPolyforkHelperLoader()
const state = reactive({
    parts: {}, bones: {}, joints: {},
    ik: { enabled: false, playing: false, speed: 0.6, target: null },
    decal: { area: '', svg: '', visited: false, sample: false },
})
const ikLoading = ref(false)
const ikReady = ref(false)
const decalLoading = ref(false)
const decalApplied = ref(false)
const shortfall = ref(null)
const modelNodes = computed(() => {
    const objects = new Map(), bones = new Map(), visible = new Map()
    props.model?.traverse((object) => {
        if (!object.name || object.userData?.decal) return
        if (!objects.has(object.name)) objects.set(object.name, object)
        if (object.isBone && !bones.has(object.name)) bones.set(object.name, object)
        if (object !== props.model && !object.isBone && (object.isGroup || object.isMesh) && !visible.has(object.name)) visible.set(object.name, object)
    })
    return { objects, bones, visible }
})
const partNames = computed(() => {
    return [...modelNodes.value.visible.keys()].filter((name) => !visibilityCovered(name))
})
const rigNames = computed(() => Object.keys(props.rig))
const boneNames = computed(() => [...modelNodes.value.bones.keys()])
const selectedArea = computed(() => props.decals.find((area) => area.name === state.decal.area))
const boneNode = (name) => modelNodes.value.bones.get(name)
const visibilityNode = (name) => modelNodes.value.visible.get(name)
const node = (name) => (props.rig[name] && boneNode(name)) || modelNodes.value.objects.get(name)
const rounded = (value) => Math.round(value * 100) / 100
const isRig = (name) => Object.prototype.hasOwnProperty.call(props.rig, name)
const rigRange = (name) => Array.isArray(props.rig[name]?.range) && props.rig[name].range.length === 2 && props.rig[name].range.every(Number.isFinite) ? props.rig[name].range : [0, 90]
const rigMin = (name) => Math.min(...rigRange(name))
const rigMax = (name) => Math.max(...rigRange(name))

function words(value) {
    return String(value || '').replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
}

function matchesPart(name, key, parameter) {
    const directions = new Set(['l', 'r', 'f', 'b', 'fl', 'fr', 'rl', 'rr', 'lf', 'rf', 'lr', 'left', 'right', 'front', 'rear', 'back'])
    const part = words(name).filter((word) => !directions.has(word))
    const terms = words(`${key} ${parameter.label || ''}`)
    return part.length > 0 && part.every((word) => terms.some((term) => word === term || (Math.min(word.length, term.length) >= 4 && (word.startsWith(term) || term.startsWith(word)))))
}

function visibilityCovered(name) {
    return Object.entries(props.parameters).some(([key, parameter]) => {
        if (['toggle', 'bool'].includes(parameter?.type)) return matchesPart(name, key, parameter)
        if (parameter?.type !== 'choice' || !Array.isArray(parameter.options)) return false
        const options = parameter.options.map((value) => String(value).toLowerCase())
        return options.some((value) => ['none', 'off', 'hidden'].includes(value)) && options.includes(name.toLowerCase())
    })
}

let boundModel = null
let boundRoot = null
let jointPoses = new Map()
let ikSolver = null
let ikOrigin = null
let decalApi = null
let rasterSvg = ''
let rasterCanvas = null
let rasterRequest = null
let distance = 0
let modelVersion = 0
let decalVersion = 0
let ikVersion = 0
let fileVersion = 0
let closed = false

function isVisible(name) {
    return state.parts[name]?.visible ?? visibilityNode(name)?.visible ?? true
}

function applyParts() {
    for (const [name, value] of Object.entries(state.parts)) {
        const item = node(name)
        if (!item) continue
        const visual = visibilityNode(name)
        if (visual && !visibilityCovered(name) && typeof value.visible === 'boolean') visual.visible = value.visible
        if (isRig(name) && Number.isFinite(value.value)) {
            const spec = props.rig[name] || {}
            const axis = axes.includes(spec.axis) ? spec.axis : 'y'
            if (spec.type === 'slide') item.position[axis] = value.value
            else item.rotation[axis] = MathUtils.degToRad(value.value)
        }
    }
}

function setVisible(name, visible) {
    if (visibilityCovered(name)) return
    state.parts[name] = { ...state.parts[name], visible }
    applyParts()
    emit('notice', '部件已修改，保存配置后可恢复。')
}

function captureJoints() {
    jointPoses = new Map()
    for (const name of rigNames.value) {
        const object = node(name)
        if (!object) continue
        const spec = props.rig[name] || {}
        const axis = axes.includes(spec.axis) ? spec.axis : 'y'
        const property = spec.type === 'slide' ? object.position : object.rotation
        const amount = spec.type === 'slide' ? rigRange(name)[1] : MathUtils.degToRad(rigRange(name)[1])
        jointPoses.set(name, { property, axis, base: property[axis], amount, progress: 0 })
    }
}

function restoreJoints() {
    jointPoses.forEach((pose) => { pose.property[pose.axis] = pose.base })
    jointPoses.clear()
}

function resetJointActions() {
    jointPoses.forEach((pose) => { pose.property[pose.axis] = pose.base; pose.progress = 0 })
    state.joints = {}
}

function toggleJoint(name) {
    if (!jointPoses.has(name)) return
    if (state.ik.enabled) setIKEnabled(false)
    state.joints[name] = !state.joints[name]
    emit('notice', '部件动作已切换，保存配置后可恢复。')
}

function resetParts() {
    state.parts = {}
    state.bones = {}
    state.joints = {}
    emit('notice', '部件控制已重置；重建模型后恢复默认姿态。')
    emit('reset-model')
}

function applyBones() {
    for (const [name, angles] of Object.entries(state.bones)) {
        const bone = boneNode(name)
        if (bone?.isBone) axes.forEach((axis) => { bone.rotation[axis] = MathUtils.degToRad(angles[axis]) })
    }
}

function resetIKPose() {
    ++ikVersion
    ikLoading.value = false
    ikSolver?.rest?.()
    if (boundRoot && ikOrigin) {
        boundRoot.position.copy(ikOrigin.position)
        boundRoot.rotation.copy(ikOrigin.rotation)
        boundRoot.updateMatrixWorld(true)
    }
    ikSolver = null
    ikOrigin = null
    ikReady.value = false
    shortfall.value = null
    distance = 0
    emit('target', null)
}

function aimArm() {
    if (!ikSolver || !boundModel || !state.ik.target) return
    boundRoot.updateMatrixWorld(true)
    const world = boundModel.localToWorld(new Vector3(...state.ik.target))
    const missed = ikSolver.reachTo(world)
    shortfall.value = missed / (boundRoot.scale.x || 1)
    emit('target', world.toArray())
}

async function bindIK(version) {
    if (!state.ik.enabled || !boundModel || !boundRoot) return
    const ticket = ++ikVersion
    ikLoading.value = true
    try {
        const walk = await loader.load('walk')
        if (closed || version !== modelVersion || ticket !== ikVersion || !state.ik.enabled) return
        boundRoot.updateMatrixWorld(true)
        ikOrigin = { position: boundRoot.position.clone(), rotation: boundRoot.rotation.clone() }
        if (props.asset.ik_type === 'arm') {
            ikSolver = walk.arm(boundRoot, { rig: props.rig, detach: props.detachable })
            if (!state.ik.target) {
                const local = boundModel.worldToLocal(ikSolver.tipWorld().clone())
                state.ik.target = local.toArray().map(rounded)
            }
            aimArm()
        } else {
            ikSolver = walk.walker(boundRoot, { rig: props.rig, ground: walk.flatGround(0) })
        }
        ikReady.value = true
    } catch (error) {
        if (!closed && version === modelVersion && ticket === ikVersion) {
            state.ik.enabled = false
            resetIKPose()
            emit('error', `IK 初始化失败：${error.message || error}`)
        }
    } finally {
        if (version === modelVersion && ticket === ikVersion) ikLoading.value = false
    }
}

function setIKEnabled(enabled) {
    state.ik.enabled = enabled
    state.ik.playing = false
    resetIKPose()
    if (enabled) {
        resetJointActions()
        applyParts()
        applyBones()
        bindIK(modelVersion)
    }
    else { ikLoading.value = false; applyParts(); applyBones() }
    emit('notice', 'IK 设置已修改，保存配置后可恢复。')
}

function setTarget(index, value) {
    if (!Number.isFinite(value) || !state.ik.target) return
    state.ik.target[index] = MathUtils.clamp(value, -10000, 10000)
    aimArm()
    emit('notice', 'IK 目标已修改，保存配置后可恢复。')
}

function setWalkSpeed(value) {
    if (Number.isFinite(value)) state.ik.speed = MathUtils.clamp(value, 0.05, 10)
}

function validateSvg(svg) {
    if (typeof svg !== 'string' || svg.length > 256 * 1024) throw new Error('SVG 文件不能超过 256 KB')
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    if (parsed.querySelector('parsererror') || parsed.documentElement?.localName !== 'svg') throw new Error('请选择有效的 SVG 文件')
    if (parsed.querySelector('script, foreignObject') || /<!doctype|\son[a-z]+\s*=|(?:href|src)\s*=\s*['"]\s*(?:https?:|\/\/|javascript:)|url\(\s*['"]?\s*(?:https?:|\/\/|javascript:)/i.test(svg)) throw new Error('SVG 不能包含脚本或外部资源')
    return svg
}

async function applyDecal(version) {
    const model = boundModel
    const svg = state.decal.svg
    const area = selectedArea.value
    const ticket = ++decalVersion
    if (decalApi && model) decalApi.clearDecals(model)
    decalApplied.value = false
    if (!model || !svg || !area) { decalLoading.value = false; return true }
    decalLoading.value = true
    try {
        validateSvg(svg)
        const helper = await loader.load('decal')
        if (closed || ticket !== decalVersion || version !== modelVersion) return false
        if (rasterSvg !== svg || !rasterCanvas) {
            if (!rasterRequest || rasterRequest.svg !== svg) {
                const request = { svg, promise: rasterizeSvg(svg) }
                rasterRequest = request
                request.promise.finally(() => { if (rasterRequest === request) rasterRequest = null }).catch(() => {})
            }
            const canvas = await rasterRequest.promise
            if (closed || ticket !== decalVersion || version !== modelVersion) return false
            rasterSvg = svg
            rasterCanvas = canvas
        }
        model.updateWorldMatrix(true, true)
        const surface = helper.surfaceUnder(model, area)
        if (!surface) throw new Error('所选区域未找到模型表面，请换一个区域或恢复相关部件')
        for (let object = surface.mesh; object; object = object.parent) {
            if (!object.visible) throw new Error('贴花所在部件已隐藏，请先显示该部件')
        }
        // Polyfork builds the plate/projected geometry. Replace its three-colour
        // SDF material with a texture so SVG gradients and currentColor survive.
        const width = Math.max(1, Math.round(32 * rasterCanvas.width / rasterCanvas.height))
        const art = { w: width, h: 32, data: new Uint8Array(width * 32 * 4), palette: ['#ffffff'], spread: 6 }
        decalApi = helper
        const plates = helper.applyDecals(model, [area], art)
        if (!plates.length) throw new Error('当前模型没有可用的贴花区域')
        for (const plate of plates) {
            const old = plate.material
            old.map?.dispose()
            old.userData?.decal?.uSdf?.value?.dispose()
            old.dispose()
            const texture = new CanvasTexture(rasterCanvas)
            texture.colorSpace = SRGBColorSpace
            plate.material = new MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.01, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
        }
        decalApplied.value = true
        if (props.tab === 'decal') focusDecal()
        return true
    } catch (error) {
        if (!closed && ticket === decalVersion && version === modelVersion) emit('error', `贴花加载失败：${error.message || error}`)
        return false
    } finally {
        if (ticket === decalVersion) decalLoading.value = false
    }
}

async function rasterizeSvg(svg) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('浏览器无法读取这个 SVG'))
            img.src = url
        })
        const ratio = MathUtils.clamp((image.naturalWidth || 1) / (image.naturalHeight || 1), 0.05, 20)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(16, Math.round(ratio >= 1 ? 512 : 512 * ratio))
        canvas.height = Math.max(16, Math.round(ratio >= 1 ? 512 / ratio : 512))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法创建贴花画布')
        ctx.drawImage(image, canvas.width * 0.02, canvas.height * 0.02, canvas.width * 0.96, canvas.height * 0.96)
        return canvas
    } finally {
        URL.revokeObjectURL(url)
    }
}

function focusDecal() {
    if (selectedArea.value) emit('focus-decal', selectedArea.value)
}

async function setArea(name) {
    state.decal.area = name
    if (await applyDecal(modelVersion)) { focusDecal(); emit('notice', '贴花区域已修改，保存配置后可恢复。') }
}

async function retryDecal() {
    if (await applyDecal(modelVersion)) { focusDecal(); emit('notice', '贴花已应用。') }
}

async function showExample() {
    ++fileVersion
    state.decal.svg = EXAMPLE_SVG
    state.decal.visited = true
    state.decal.sample = true
    if (await applyDecal(modelVersion)) { focusDecal(); emit('notice', '已显示示例贴花，可上传 SVG 替换。') }
}

async function uploadSvg(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ticket = ++fileVersion
    try {
        if (file.size > 256 * 1024) throw new Error('SVG 文件不能超过 256 KB')
        const svg = validateSvg(await file.text())
        if (closed || ticket !== fileVersion) return
        state.decal.svg = svg
        state.decal.visited = true
        state.decal.sample = false
        if (await applyDecal(modelVersion)) { focusDecal(); emit('notice', '贴花已设置，保存配置后可恢复。') }
    } catch (error) {
        if (!closed && ticket === fileVersion) emit('error', `SVG 无法读取：${error.message || error}`)
    }
}

function removeDecal() {
    ++fileVersion
    state.decal.svg = ''
    rasterSvg = ''
    rasterCanvas = null
    applyDecal(modelVersion)
    emit('notice', '贴花已移除，保存配置后可恢复。')
}

function beforeReplace() {
    ++modelVersion
    ++decalVersion
    ikLoading.value = false
    decalLoading.value = false
    decalApplied.value = false
    resetIKPose()
    restoreJoints()
    if (decalApi && boundModel) decalApi.clearDecals(boundModel)
}

function rebind() {
    boundModel = props.model
    boundRoot = props.root
    if (!boundModel || !boundRoot) return
    const version = modelVersion
    applyParts()
    applyBones()
    captureJoints()
    if (!props.decals.some((area) => area.name === state.decal.area)) state.decal.area = props.decals[0]?.name || ''
    if (state.ik.enabled) { resetJointActions(); bindIK(version) }
    if (state.decal.svg) applyDecal(version)
}

function updateFrame(delta, elapsed) {
    if (!boundModel || !boundRoot) return
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0
    boundModel.userData.tick?.(elapsed)
    if (!state.ik.enabled) {
        const step = 1 - Math.exp(-7.67 * dt)
        jointPoses.forEach((pose, name) => {
            const target = state.joints[name] ? 1 : 0
            if (!target && !pose.progress) return
            pose.progress += (target - pose.progress) * step
            if (Math.abs(target - pose.progress) < 0.002) pose.progress = target
            pose.property[pose.axis] = pose.base + pose.amount * pose.progress
        })
    }
    if (state.ik.enabled && ikSolver && props.asset.ik_type === 'arm' && boundModel.userData.tick) aimArm()
    if (state.ik.enabled && state.ik.playing && ikSolver && props.asset.ik_type === 'legs') {
        const scale = boundRoot.scale.x || 1
        distance += dt * state.ik.speed
        if (distance * scale > 2) {
            distance = 0
            ikSolver.rest()
            boundRoot.position.copy(ikOrigin.position)
            boundRoot.rotation.copy(ikOrigin.rotation)
        }
        boundRoot.position.z = ikOrigin.position.z + distance * scale
        ikSolver.poseAt(distance * scale)
    }
}

function restoreState(input = {}) {
    ++fileVersion
    beforeReplace()
    const parts = {}
    for (const [name, value] of Object.entries(input.parts || {})) {
        if ((!node(name) && !isRig(name)) || !value || typeof value !== 'object') continue
        const next = {}
        if (!visibilityCovered(name) && typeof value.visible === 'boolean') next.visible = value.visible
        if (isRig(name) && Number.isFinite(value.value) && value.value >= rigMin(name) && value.value <= rigMax(name)) next.value = value.value
        parts[name] = next
    }
    const bones = {}
    for (const [name, angles] of Object.entries(input.bones || {})) {
        if (boneNames.value.includes(name) && angles && axes.every((axis) => Number.isFinite(angles[axis]) && Math.abs(angles[axis]) <= 180)) bones[name] = { x: angles.x, y: angles.y, z: angles.z }
    }
    const joints = {}
    for (const [name, active] of Object.entries(input.joints || {})) {
        if (isRig(name) && active === true) joints[name] = true
    }
    state.parts = parts
    state.bones = bones
    state.joints = joints
    const ik = input.ik || {}
    state.ik = {
        enabled: ik.enabled === true && !!props.asset.has_ik,
        playing: ik.playing === true,
        speed: Number.isFinite(ik.speed) ? MathUtils.clamp(ik.speed, 0.05, 10) : 0.6,
        target: Array.isArray(ik.target) && ik.target.length === 3 && ik.target.every((value) => Number.isFinite(value) && Math.abs(value) <= 10000) ? [...ik.target] : null,
    }
    const decal = input.decal || {}
    state.decal = {
        area: props.decals.some((area) => area.name === decal.area) ? decal.area : props.decals[0]?.name || '',
        svg: typeof decal.svg === 'string' && decal.svg.length <= 256 * 1024 ? decal.svg : '',
        visited: decal.visited === true || !!decal.svg,
        sample: decal.sample === true,
    }
    rebind()
}

function getState() {
    return JSON.parse(JSON.stringify(state))
}

watch(() => [props.model, props.root], () => { beforeReplace(); rebind() }, { immediate: true, flush: 'post' })
watch(() => props.tab, (tab) => {
    if (tab === 'decal' && props.decals.length && !state.decal.visited) showExample()
    else if (tab === 'decal' && decalApplied.value) focusDecal()
}, { immediate: true })
restoreState(props.initialState)
onUnmounted(() => { closed = true; beforeReplace(); loader.dispose() })
defineExpose({ beforeReplace, rebind, updateFrame, getState, restoreState })
</script>

<style scoped>
.hint { margin: 5px 0 10px; color: #84949b; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.field { padding: 13px 0; border-top: 1px solid #edf1f2; }
label { display: block; color: #48605e; font-size: 12px; font-weight: 600; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
input, select, button { font: inherit; }
input[type='checkbox'] { accent-color: #208b78; }
.rig-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.rig-button { padding: 8px 12px; border: 1px solid #a8d5cd; border-radius: 999px; color: #315e57; background: #fff; cursor: pointer; font-size: 12px; }
.rig-button.active { border-color: #208b78; color: #fff; background: #208b78; }
.rig-button:disabled { opacity: .5; cursor: default; }
.visibility-list { margin-top: 14px; color: #48605e; font-size: 12px; }
.visibility-list summary { cursor: pointer; font-weight: 600; }
.visibility-item { padding: 8px 0; border-bottom: 1px solid #edf1f2; }
select, input[type='number'] { box-sizing: border-box; width: 100%; margin-top: 6px; padding: 8px 10px; border: 1px solid #d8e2e7; border-radius: 7px; color: #203440; background: #f9fbfc; }
.axis-control { display: block; margin: 12px 0; }
.secondary, .upload { display: inline-block; margin: 8px 6px 0 0; padding: 7px 10px; border: 1px solid #cde0dc; border-radius: 6px; color: #287865; font-size: 12px; background: #f5fbf9; cursor: pointer; }
.secondary:disabled { opacity: .5; cursor: default; }
.upload input { display: none; }
</style>
