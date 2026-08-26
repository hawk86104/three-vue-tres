<template>
    <loading :progress-value="progress" :finished="ready" show-progress />
    <TresCanvas clear-color="#000000" :antialias="false" :tone-mapping="NoToneMapping" window-size>
        <TresPerspectiveCamera :position="[30, 18, 30]" :fov="50" :near="0.1" :far="500" />
        <OrbitControls
            make-default
            :target="[0, 6, 0]"
            :min-distance="12"
            :max-distance="120"
            :max-polar-angle="Math.PI * 0.49"
        />
        <Suspense @resolve="ready = true">
            <RaytracedDiamond v-bind="params" @progress="progress = $event" />
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { NoToneMapping } from 'three'
import { Pane } from 'tweakpane'
import { loading2 as loading } from 'PLS/UIdemo'
import RaytracedDiamond from '../../components/raytracedDiamond/index.vue'

const ready = ref(false)
const progress = ref(0)
const params = reactive({
    bounces: 3,
    ior: 2.4,
    aberrationStrength: 0.05,
    chromaticAberration: true,
    correctMips: true,
})

const pane = new Pane({ title: '钻石光学参数' })
pane.addBinding(params, 'ior', { label: '折射率 IOR', min: 1, max: 3, step: 0.01 })
pane.addBinding(params, 'bounces', { label: '内部反弹', min: 1, max: 10, step: 1 })
pane.addBinding(params, 'aberrationStrength', { label: '色散强度', min: 0, max: 0.15, step: 0.001 })
pane.addBinding(params, 'chromaticAberration', { label: '启用色散' })
pane.addBinding(params, 'correctMips', { label: 'Mip 校正' })
onUnmounted(() => pane.dispose())
</script>
