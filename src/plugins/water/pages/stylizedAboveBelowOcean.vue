<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas clear-color="#064289" :tone-mapping="NoToneMapping" window-size>
        <TresPerspectiveCamera :position="[0, -18, 76]" :fov="50" :near="0.1" :far="10000" />
        <OrbitControls make-default :target="[0, -30, -8]" :min-distance="10" :max-distance="200" />
        <Suspense @resolve="ready = true">
            <StylizedAboveBelowOcean v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { NoToneMapping } from 'three'
import { Pane } from 'tweakpane'
import { loading2 as loading } from 'PLS/UIdemo'
import StylizedAboveBelowOcean from '../components/stylizedAboveBelowOcean/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    view: 'underwater' as 'above-surface' | 'underwater',
    timeScale: 1,
    foamThreshold: 0.4,
    foamScale: 7,
    foamDistortion: 1.4,
    causticIntensity: 0.9,
    causticSpeed: 0.1,
    waterClarity: 57,
})

const pane = new Pane({ title: '风格化海洋参数' })
pane.addBinding(params, 'view', { label: '观察位置', options: { 水下: 'underwater', 水上: 'above-surface' } })
pane.addBinding(params, 'timeScale', { label: '波浪速度', min: 0, max: 2, step: 0.05 })
pane.addBinding(params, 'foamThreshold', { label: '泡沫阈值', min: 0.1, max: 0.8, step: 0.01 })
pane.addBinding(params, 'foamScale', { label: '泡沫纹理尺度', min: 1, max: 14, step: 0.1 })
pane.addBinding(params, 'foamDistortion', { label: '泡沫扭曲', min: 0.2, max: 3, step: 0.05 })
pane.addBinding(params, 'causticIntensity', { label: '海底焦散', min: 0, max: 2, step: 0.05 })
pane.addBinding(params, 'causticSpeed', { label: '焦散速度', min: 0, max: 0.5, step: 0.01 })
pane.addBinding(params, 'waterClarity', { label: '水下能见度', min: 15, max: 180, step: 1 })
onUnmounted(() => pane.dispose())
</script>
