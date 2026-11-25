<template>
    <TresPerspectiveCamera :position="initialPosition" :look-at="target" :fov="30" :near="0.05" :far="50" />
    <OrbitControls
        ref="controls"
        :target="target"
        :damping-factor="0.08"
        :min-distance="minDistance"
        :max-distance="maxDistance"
        :min-polar-angle="Math.PI * 0.12"
        :max-polar-angle="Math.PI * 0.88"
        :rotate-speed="0.7"
        @change="onOrbitChange"
    />
    <TresHemisphereLight :args="['#ffffff', '#b9a58f', 1.1]" />
    <TresDirectionalLight :position="[2, 4, 3]" :intensity="1.8" />
    <TresDirectionalLight :position="[-3, 2, -2]" :intensity="0.7" />
    <TresDirectionalLight :position="[0, 1, -4]" :intensity="0.5" />
    <primitive v-if="body" :object="body.root" :dispose="false" />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { MathUtils, Raycaster, Spherical, Vector2, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { disposeAnatomy, prepareAnatomy, updatePartHighlight } from './anatomyModel'

const props = defineProps({
    assetPath: { type: String, required: true },
    catalog: { type: Array, required: true },
    sex: { type: String, required: true },
    layers: { type: Object, required: true },
    pinned: { type: Array, required: true },
    hovered: { type: String, default: null },
    retry: { type: Number, default: 0 },
})
const emit = defineEmits(['status', 'progress', 'hover', 'select', 'rotate', 'project'])

const target = [0, 0.92, 0]
const initialPosition = [0, 1.02, 3.55]
const minDistance = 0.6
const maxDistance = 6
const controls = useTemplateRef('controls')
const { renderer, camera, sizes } = useTresContext()
const body = shallowRef(null)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

function readModelBuffer(response, signal) {
    const total = Number(response.headers.get('content-length'))
    if (!total || !response.body || typeof TransformStream === 'undefined' || response.headers.has('content-encoding')) {
        return response.arrayBuffer()
    }

    let received = 0
    let previousPercent = -1
    const progressStream = new TransformStream({
        transform(chunk, controller) {
            received += chunk.byteLength
            const percent = Math.min(100, Math.floor(received / total * 100))
            if (percent !== previousPercent && !signal.aborted) emit('progress', percent)
            previousPercent = percent
            controller.enqueue(chunk)
        },
    })
    return new Response(response.body.pipeThrough(progressStream)).arrayBuffer()
}

watch([() => props.sex, () => props.retry], async ([sex], _, onCleanup) => {
    const request = new AbortController()
    let root
    onCleanup(() => {
        request.abort()
        if (root) disposeAnatomy(root)
    })
    body.value = null
    emit('status', 'loading')
    emit('hover', null)

    try {
        const response = await fetch(`${props.assetPath}/anatomy-${sex}.glb`, { signal: request.signal })
        if (!response.ok) throw new Error(`GLB HTTP ${response.status}`)
        const buffer = await readModelBuffer(response, request.signal)
        if (request.signal.aborted) return
        const { scene } = await loader.parseAsync(buffer, `${props.assetPath}/`)
        if (request.signal.aborted) {
            disposeAnatomy(scene)
            return
        }
        root = scene
        body.value = prepareAnatomy(root, props.catalog, sex)
        emit('status', 'ready')
    } catch (error) {
        if (request.signal.aborted) return
        if (root) disposeAnatomy(root)
        root = null
        console.error('人体解剖模型加载失败', error)
        emit('status', 'error')
    }
}, { immediate: true })

watchEffect(() => {
    if (!body.value) return
    for (const [system, group] of body.value.groups) group.visible = props.layers[system]
    const pinned = new Set(props.pinned)
    for (const [key, part] of body.value.parts) updatePartHighlight(part, key === props.hovered, pinned.has(key))
})

const loop = useLoop()
loop.onBeforeRender(({ elapsed }) => {
    const pulse = 0.35 + 0.25 * Math.sin(elapsed * 3)
    for (const key of props.pinned) {
        const part = body.value?.parts.get(key)
        if (part?.material.isMeshStandardMaterial && key !== props.hovered) part.material.emissiveIntensity = pulse
    }
})

const point = new Vector3()
let lastProjection = { width: 0, height: 0, anchors: [] }
loop.onRender(() => {
    const width = sizes.width.value
    const height = sizes.height.value
    const model = body.value
    const activeCamera = camera.activeCamera.value
    const anchors = []
    if (model && activeCamera && width && height) {
        for (const key of props.pinned) {
            const part = model.parts.get(key)
            if (!part || !props.layers[part.structure.system]) continue
            point.copy(part.center).applyMatrix4(model.root.matrixWorld).project(activeCamera)
            if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1) continue
            anchors.push({ key, x: Math.round((point.x + 1) * width / 2), y: Math.round((1 - point.y) * height / 2) })
        }
    }
    const previous = lastProjection.anchors
    const sameAnchors = anchors.length === previous.length && anchors.every((anchor, index) => {
        const last = previous[index]
        return anchor.key === last.key && anchor.x === last.x && anchor.y === last.y
    })
    if (sameAnchors && width === lastProjection.width && height === lastProjection.height) return
    lastProjection = { width, height, anchors }
    emit('project', lastProjection)
})

const canvas = renderer.instance.domElement
const raycaster = new Raycaster()
raycaster.firstHitOnly = true
const pointer = new Vector2()
const visibleMeshes = computed(() => body.value?.pickMeshes.filter((mesh) => props.layers[mesh.userData.anatomy.system]) ?? [])

function pick(event) {
    const activeCamera = camera.activeCamera.value
    const meshes = visibleMeshes.value
    if (!meshes.length || !activeCamera) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    if (Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1) return null
    raycaster.setFromCamera(pointer, activeCamera)
    const hits = raycaster.intersectObjects(meshes, false)
    // Joints and organs can be picked through the surrounding bones or muscles.
    const hit = hits.find(({ object }) => object.userData.anatomy.system === 'joints')
        ?? hits.find(({ object }) => object.userData.anatomy.system === 'organs') ?? hits[0]
    return hit?.object.userData.anatomy.key ?? null
}

let press = null
const moved = (event) => Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5
const clearPointer = () => {
    press = null
    emit('hover', null)
}
const pointerEvents = {
    pointerdown(event) {
        clearPointer()
        if (event.isPrimary && event.button === 0) press = { id: event.pointerId, x: event.clientX, y: event.clientY }
    },
    pointermove(event) {
        if (press?.id === event.pointerId && moved(event)) press = null
        if (!event.buttons && event.pointerType !== 'touch') emit('hover', pick(event))
    },
    pointerup(event) {
        if (press?.id !== event.pointerId) return
        const key = moved(event) ? null : pick(event)
        press = null
        if (key) emit('select', key)
    },
    pointerleave: clearPointer,
    pointercancel: clearPointer,
}

// Leave unmodified wheel gestures available for scrolling the case page.
function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) event.stopImmediatePropagation()
}

onMounted(() => {
    for (const [event, handler] of Object.entries(pointerEvents)) canvas.addEventListener(event, handler)
    canvas.addEventListener('wheel', handleWheel, { capture: true, passive: true })
})
onBeforeUnmount(() => {
    for (const [event, handler] of Object.entries(pointerEvents)) canvas.removeEventListener(event, handler)
    canvas.removeEventListener('wheel', handleWheel, true)
})

const offset = new Vector3()
const angles = new Spherical()
function onOrbitChange(orbit) {
    const degrees = Math.round(MathUtils.radToDeg(orbit.getAzimuthalAngle()))
    emit('rotate', MathUtils.clamp(degrees, -180, 180))
}
function zoom(factor) {
    const orbit = controls.value?.instance
    if (!orbit) return
    offset.copy(orbit.object.position).sub(orbit.target)
    offset.setLength(MathUtils.clamp(offset.length() * factor, minDistance, maxDistance))
    orbit.object.position.copy(orbit.target).add(offset)
    orbit.update()
}
function rotate(degrees) {
    const orbit = controls.value?.instance
    if (!orbit) return
    angles.setFromVector3(offset.copy(orbit.object.position).sub(orbit.target))
    angles.theta = MathUtils.degToRad(degrees)
    orbit.object.position.copy(orbit.target).add(offset.setFromSpherical(angles))
    orbit.update()
}
function reset() {
    const orbit = controls.value?.instance
    if (!orbit) return
    const damping = orbit.enableDamping
    orbit.enableDamping = false
    orbit.update()
    orbit.target.fromArray(target)
    orbit.object.position.fromArray(initialPosition)
    orbit.update()
    orbit.enableDamping = damping
}
defineExpose({ zoom, rotate, reset })
</script>
