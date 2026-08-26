<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas clear-color="#9fb8cc" :tone-mapping="NoToneMapping" window-size>
        <TresPerspectiveCamera :position="[0, 16, 68]" :fov="55" :near="0.5" :far="30000" />
        <OrbitControls make-default :target="[0, 0, -20]" :max-polar-angle="Math.PI * 0.495" />
        <Suspense @resolve="ready = true">
            <SpectralCascadeOcean v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { NoToneMapping } from 'three'
import { Pane } from 'tweakpane'
import { loading2 as loading } from 'PLS/UIdemo'
import SpectralCascadeOcean from '../components/spectralCascadeOcean/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    timeScale: 1,
    waveHeight: 1,
    foamThreshold: 0.4,
    foamScale: 2.5,
    detailStrength: 0.1,
    fogDensity: 0.0045,
})

const pane = new Pane({ title: '频谱海洋参数' })
pane.addBinding(params, 'timeScale', { label: '波浪演化速度', min: 0, max: 2, step: 0.05 })
pane.addBinding(params, 'waveHeight', { label: '波高倍率', min: 0.2, max: 2.5, step: 0.05 })
pane.addBinding(params, 'foamThreshold', { label: '白沫阈值', min: 0.1, max: 0.8, step: 0.01 })
pane.addBinding(params, 'foamScale', { label: '白沫覆盖', min: 0.5, max: 6, step: 0.1 })
pane.addBinding(params, 'detailStrength', { label: '微波法线', min: 0, max: 0.4, step: 0.01 })
pane.addBinding(params, 'fogDensity', { label: '海雾密度', min: 0, max: 0.015, step: 0.0005 })
onUnmounted(() => pane.dispose())
</script>
