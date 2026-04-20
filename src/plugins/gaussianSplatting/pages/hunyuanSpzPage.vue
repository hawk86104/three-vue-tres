<template>
    <TresCanvas v-bind="canvasState" window-size>
        <TresPerspectiveCamera :position="[-0.0528, -0.122, 0.702]" :fov="45" :near="0.1" :far="1000" />
        <OrbitControls makeDefault :target="new Vector3(-0.1291, -0.2132, 0.2345)" />
        <Suspense>
            <hunyuanSpz
                :key="viewerKey"
                :url="viewerState.url"
                :splat-alpha-removal-threshold="viewerState.splatAlphaRemovalThreshold"
                :buffer-compression-level="viewerState.bufferCompressionLevel"
                :antialiased-mode="viewerState.antialiasedMode"
                :dynamic-scene="viewerState.dynamicScene"
                :shared-memory-for-workers="viewerState.sharedMemoryForWorkers"
                :focal-adjustment="viewerState.focalAdjustment"
                :kernel2-d-size="viewerState.kernel2DSize"
                :splat-render-mode="viewerState.splatRenderMode"
                :rotation-input-order="viewerState.rotationInputOrder"
            />
        </Suspense>

        <!-- <TresGridHelper :args="[20, 20, '#94a3b8', '#cbd5e1']" /> -->
    </TresCanvas>
</template>

<script setup lang="ts">
import { SRGBColorSpace, BasicShadowMap, NoToneMapping, Vector3 } from 'three'
import { computed, onUnmounted, reactive } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import hunyuanSpz from '../components/hunyuanSpz.vue'

type AntialiasedMode = 'auto' | 'on' | 'off'
type SplatRenderMode = 'ThreeD' | 'TwoD'
type RotationInputOrder = 'xyzw' | 'wxyz'

const renderPixelRatio = typeof window === 'undefined'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 1.25)

const debugState = reactive({
    url: 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.spz',
    splatAlphaRemovalThreshold: 1,
    bufferCompressionLevel: 0,
    antialiasedMode: 'auto' as AntialiasedMode,
    dynamicScene: false,
    sharedMemoryForWorkers: false,
    focalAdjustment: 1.15,
    kernel2DSize: 0.3,
    splatRenderMode: 'ThreeD' as SplatRenderMode,
    rotationInputOrder: 'xyzw' as RotationInputOrder,
    canvasDpr: renderPixelRatio,
    canvasAntialias: false,
})

const viewerState = reactive({
    url: debugState.url,
    splatAlphaRemovalThreshold: debugState.splatAlphaRemovalThreshold,
    bufferCompressionLevel: debugState.bufferCompressionLevel,
    antialiasedMode: debugState.antialiasedMode,
    dynamicScene: debugState.dynamicScene,
    sharedMemoryForWorkers: debugState.sharedMemoryForWorkers,
    focalAdjustment: debugState.focalAdjustment,
    kernel2DSize: debugState.kernel2DSize,
    splatRenderMode: debugState.splatRenderMode,
    rotationInputOrder: debugState.rotationInputOrder,
})

const applyViewerState = () => {
    viewerState.url = debugState.url
    viewerState.splatAlphaRemovalThreshold = debugState.splatAlphaRemovalThreshold
    viewerState.bufferCompressionLevel = debugState.bufferCompressionLevel
    viewerState.antialiasedMode = debugState.antialiasedMode
    viewerState.dynamicScene = debugState.dynamicScene
    viewerState.sharedMemoryForWorkers = debugState.sharedMemoryForWorkers
    viewerState.focalAdjustment = debugState.focalAdjustment
    viewerState.kernel2DSize = debugState.kernel2DSize
    viewerState.splatRenderMode = debugState.splatRenderMode
    viewerState.rotationInputOrder = debugState.rotationInputOrder
}

const viewerKey = computed(() => JSON.stringify(viewerState))

const canvasState = computed(() => ({
    antialias: debugState.canvasAntialias,
    clearColor: '#f8fafc',
    alpha: false,
    dpr: debugState.canvasDpr,
    powerPreference: 'high-performance' as WebGLPowerPreference,
    shadowMapType: BasicShadowMap,
    outputColorSpace: SRGBColorSpace,
    toneMapping: NoToneMapping,
}))

const pane = new Pane({
    title: 'SPZ 调试',
    expanded: true,
})

const handleViewerBindingChange = ({ last }: { last?: boolean }) => {
    if (last === false) {
        return
    }
    applyViewerState()
}

const viewerFolder = pane.addFolder({ title: 'Viewer' })
viewerFolder.addBinding(debugState, 'url', { label: 'URL' }).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'splatAlphaRemovalThreshold', {
    label: '最小 Alpha',
    min: 0,
    max: 10,
    step: 1,
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'bufferCompressionLevel', {
    label: '缓冲压缩',
    options: {
        '0': 0,
        '1': 1,
        '2': 2,
    },
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'antialiasedMode', {
    label: '抗锯齿',
    options: {
        自动: 'auto',
        强制开: 'on',
        强制关: 'off',
    },
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'dynamicScene', {
    label: '动态场景',
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'sharedMemoryForWorkers', {
    label: '共享内存',
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'focalAdjustment', {
    label: 'Focal',
    min: 0.8,
    max: 1.4,
    step: 0.01,
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'kernel2DSize', {
    label: 'Kernel2D',
    min: 0.05,
    max: 0.8,
    step: 0.01,
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'splatRenderMode', {
    label: '渲染模式',
    options: {
        ThreeD: 'ThreeD',
        TwoD: 'TwoD',
    },
}).on('change', handleViewerBindingChange)
viewerFolder.addBinding(debugState, 'rotationInputOrder', {
    label: '输入四元数',
    options: {
        xyzw: 'xyzw',
        wxyz: 'wxyz',
    },
}).on('change', handleViewerBindingChange)

const canvasFolder = pane.addFolder({ title: 'Canvas' })
canvasFolder.addBinding(debugState, 'canvasDpr', {
    label: 'DPR',
    min: 0.75,
    max: 2,
    step: 0.05,
})
canvasFolder.addBinding(debugState, 'canvasAntialias', {
    label: 'Canvas AA',
})

onUnmounted(() => {
    pane.dispose()
})
</script>
