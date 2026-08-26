<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas :renderer="createWebGPURenderer" clear-color="#061b2d" shadows window-size>
        <TresPerspectiveCamera :position="[19, -23.17, -22]" :fov="50" :near="0.1" :far="5000" />
        <OrbitControls
            make-default
            :target="[7.2, 1.54, -35.73]"
            :min-distance="8"
            :max-distance="180"
            :min-polar-angle="0.05"
            :max-polar-angle="Math.PI - 0.05"
        />
        <Suspense @resolve="ready = true">
            <SubmergedSnellOcean v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import { createWebGPURenderer } from '@/common/createWebGPURenderer'
import { loading2 as loading } from 'PLS/UIdemo'
import SubmergedSnellOcean from '../components/submergedSnellOcean/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    timeScale: 1,
    exposureEV: 0,
    lutIntensity: 1,
    vignette: 0.115,
    mediumOcclusion: 0,
})

const pane = new Pane({ title: '水下光学参数' })
pane.addBinding(params, 'timeScale', { label: '海面演化速度', min: 0, max: 2, step: 0.05 })
pane.addBinding(params, 'exposureEV', { label: '水下曝光 EV', min: -2, max: 2, step: 0.05 })
pane.addBinding(params, 'lutIntensity', { label: '水色调色强度', min: 0, max: 1, step: 0.01 })
pane.addBinding(params, 'vignette', { label: '水下暗角', min: 0, max: 0.5, step: 0.01 })
pane.addBinding(params, 'mediumOcclusion', { label: '介质遮蔽', min: 0, max: 1, step: 0.01 })
onUnmounted(() => pane.dispose())
</script>
