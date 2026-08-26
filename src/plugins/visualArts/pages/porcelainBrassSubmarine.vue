<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas
        :renderer="createWebGPURenderer"
        clear-color="#b8b1a7"
        :tone-mapping-exposure="1.05"
        shadows
        window-size
    >
        <TresPerspectiveCamera :position="[4.7, 2.45, 6.7]" :fov="31" :near="0.05" :far="100" />
        <OrbitControls
            make-default
            :target="[0, 0.15, 0]"
            :min-distance="4.5"
            :max-distance="16"
            :max-polar-angle="Math.PI * 0.49"
            enable-damping
        />
        <Suspense @resolve="ready = true">
            <PorcelainBrassSubmarine v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import { createWebGPURenderer } from '@/common/createWebGPURenderer'
import { loading2 as loading } from 'PLS/UIdemo'
import PorcelainBrassSubmarine from '../components/porcelainBrassSubmarine/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    propellerSpeed: 1.1,
    buoyancy: 1,
    glassRoughness: 0.035,
    glassTransmission: 1,
    showGlass: true,
})

const pane = new Pane({ title: '潜艇材质与运动' })
pane.addBinding(params, 'propellerSpeed', { label: '螺旋桨转速', min: 0, max: 5, step: 0.1 })
pane.addBinding(params, 'buoyancy', { label: '漂浮幅度', min: 0, max: 3, step: 0.05 })
pane.addBinding(params, 'glassRoughness', { label: '舱罩粗糙度', min: 0, max: 0.4, step: 0.005 })
pane.addBinding(params, 'glassTransmission', { label: '舱罩透射', min: 0, max: 1, step: 0.01 })
pane.addBinding(params, 'showGlass', { label: '显示玻璃舱' })
onUnmounted(() => pane.dispose())
</script>
