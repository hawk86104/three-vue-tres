<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas
        clear-color="#00010b"
        :antialias="false"
        :tone-mapping="AgXToneMapping"
        window-size
    >
        <TresPerspectiveCamera :position="[0.714, 0.339, 0.321]" :fov="50" :near="0.01" :far="60" />
        <OrbitControls
            make-default
            :min-distance="0.25"
            :max-distance="4"
            :max-polar-angle="Math.PI * 0.49"
        />
        <Suspense @resolve="ready = true">
            <WetPuddleRain v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { AgXToneMapping } from 'three'
import { Pane } from 'tweakpane'
import { loading2 as loading } from 'PLS/UIdemo'
import WetPuddleRain from '../components/wetPuddleRain/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    rainAmount: 1,
    rainSpeed: 1,
    bloomStrength: 0.05,
    contrast: 1.2,
    saturation: 1.1,
})

const pane = new Pane({ title: '雨天地面参数' })
pane.addBinding(params, 'rainAmount', { label: '降雨量', min: 0, max: 1, step: 0.01 })
pane.addBinding(params, 'rainSpeed', { label: '雨滴速度', min: 0, max: 2.5, step: 0.05 })
pane.addBinding(params, 'bloomStrength', { label: '反光辉光', min: 0, max: 0.4, step: 0.01 })
pane.addBinding(params, 'contrast', { label: '湿地对比度', min: 0.8, max: 1.8, step: 0.05 })
pane.addBinding(params, 'saturation', { label: '霓虹饱和度', min: 0.5, max: 1.8, step: 0.05 })
onUnmounted(() => pane.dispose())
</script>
