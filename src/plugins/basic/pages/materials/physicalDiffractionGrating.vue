<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas
        :renderer="createWebGPURenderer"
        clear-color="#050507"
        :tone-mapping-exposure="1.05"
        window-size
    >
        <TresPerspectiveCamera :position="[0, 0, 10]" :fov="34" :near="0.05" :far="100" />
        <OrbitControls make-default :min-distance="7.5" :max-distance="22" enable-damping />
        <Suspense @resolve="ready = true">
            <PhysicalDiffractionGrating v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import { createWebGPURenderer } from '@/common/createWebGPURenderer'
import { loading2 as loading } from 'PLS/UIdemo'
import PhysicalDiffractionGrating from '../../components/physicalDiffractionGrating/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    pitchNm: 1180,
    reliefNm: 86,
    coherenceUm: 14.5,
    azimuthSigma: 0.013,
    grooveAngle: 31,
    gain: 5.1,
    stars: true,
    lightTemperature: 5250,
    lightPower: 128,
})

const pane = new Pane({ title: '衍射光栅参数' })
pane.addBinding(params, 'pitchNm', { label: '光栅节距 nm', min: 600, max: 1800, step: 10 })
pane.addBinding(params, 'reliefNm', { label: '浮雕深度 nm', min: 10, max: 180, step: 1 })
pane.addBinding(params, 'coherenceUm', { label: '相干长度 μm', min: 2, max: 30, step: 0.5 })
pane.addBinding(params, 'grooveAngle', { label: '槽线角度', min: 0, max: 180, step: 1 })
pane.addBinding(params, 'gain', { label: '衍射增益', min: 0, max: 10, step: 0.1 })
pane.addBinding(params, 'stars', { label: '星芒' })
pane.addBinding(params, 'lightTemperature', { label: '光源色温 K', min: 2800, max: 8500, step: 50 })
onUnmounted(() => pane.dispose())
</script>
