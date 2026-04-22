<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-04-21 12:22:38
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-21 15:37:42
-->
<template>
    <TresCanvas v-bind="canvasState" window-size>
        <TresPerspectiveCamera :position="[-0.0528, -0.122, 0.702]" :fov="45" :near="0.1" :far="1000" />
        <OrbitControls makeDefault :target="new Vector3(-0.1291, -0.2132, 0.2345)" />
        <hunyuanSpz
            :url="debugState.url"
            :lod="debugState.lod"
            :ext-splats="debugState.extSplats"
            :paged="debugState.paged"
            :max-std-dev="debugState.maxStdDev"
            :sort-radial="debugState.sortRadial"
            :lod-splat-scale="debugState.lodSplatScale"
            :paged-ext-splats="debugState.pagedExtSplats"
            :use-collider-url="debugState.useColliderUrl"
            :collider-url="debugState.colliderUrl"
        />

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

const renderPixelRatio = typeof window === 'undefined'
    ? 0.75
    : Math.min(window.devicePixelRatio || 0.75, 1.25)

const debugState = reactive({
    url: 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.spz',
    lod: true,
    extSplats: false,
    paged: false,
    maxStdDev: 2,
    sortRadial: true,
    lodSplatScale: 1,
    pagedExtSplats: false,
    useColliderUrl: false,
    colliderUrl: 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.ply',
    canvasDpr: renderPixelRatio,
    canvasAntialias: false,
})

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

const meshFolder = pane.addFolder({ title: 'SplatMesh' })
meshFolder.addBinding(debugState, 'url', { label: 'URL' })
meshFolder.addBinding(debugState, 'lod', {
    label: 'LOD',
})
meshFolder.addBinding(debugState, 'extSplats', {
    label: 'ExtSplats',
})
meshFolder.addBinding(debugState, 'paged', {
    label: 'Paged(.rad)',
})
meshFolder.addBinding(debugState, 'useColliderUrl', {
    label: 'UseCollider',
})
meshFolder.addBinding(debugState, 'colliderUrl', {
    label: 'ColliderURL',
})

const rendererFolder = pane.addFolder({ title: 'SparkRenderer' })
rendererFolder.addBinding(debugState, 'maxStdDev', {
    label: 'MaxStdDev',
    min: Math.sqrt(4),
    max: Math.sqrt(9),
    step: 0.01,
})
rendererFolder.addBinding(debugState, 'sortRadial', {
    label: 'SortRadial',
})
rendererFolder.addBinding(debugState, 'lodSplatScale', {
    label: 'LodScale',
    min: 0.25,
    max: 3,
    step: 0.05,
})
rendererFolder.addBinding(debugState, 'pagedExtSplats', {
    label: 'PagedExt',
})

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
