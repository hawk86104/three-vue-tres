<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas :renderer="createWebGPURenderer" clear-color="#000000" shadows window-size>
        <TresPerspectiveCamera :position="[0, 3, 7]" :fov="60" :near="0.1" :far="100" />
        <OrbitControls
            make-default
            :target="[0, 2, 0]"
            :min-distance="5"
            :max-distance="15"
            :min-polar-angle="Math.PI / 2.5"
            :max-polar-angle="Math.PI / 2"
            enable-damping
        />
        <Suspense @resolve="ready = true">
            <VolumetricFluidFire v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import { createWebGPURenderer } from '@/common/createWebGPURenderer'
import { loading2 as loading } from 'PLS/UIdemo'
import VolumetricFluidFire from '../components/volumetricFluidFire/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    simulationSpeed: 1,
    vorticity: 7.01,
    densityDissipation: 1.02,
    pressureIterations: 4,
    raymarchSteps: 22,
})

const pane = new Pane({ title: '流体火焰参数' })
pane.addBinding(params, 'simulationSpeed', { label: '模拟速度', min: 0, max: 1.5, step: 0.05 })
pane.addBinding(params, 'vorticity', { label: '涡旋强度', min: 0, max: 15, step: 0.1 })
pane.addBinding(params, 'densityDissipation', { label: '密度耗散', min: 0.9, max: 1.08, step: 0.005 })
pane.addBinding(params, 'pressureIterations', { label: '压力迭代', min: 1, max: 12, step: 1 })
pane.addBinding(params, 'raymarchSteps', { label: '光线步数', min: 8, max: 48, step: 1 })
onUnmounted(() => pane.dispose())
</script>
