<template>
    <TresCanvas v-bind="state" window-size>
        <TresPerspectiveCamera :position="[-0.0528, -0.122, 0.702]" :fov="45" :near="0.1" :far="1000" />
        <OrbitControls makeDefault :target="new Vector3(-0.1291, -0.2132, 0.2345)" />
        <Suspense>
            <hunyuanSpz />
        </Suspense>

        <!-- <TresGridHelper :args="[20, 20, '#94a3b8', '#cbd5e1']" /> -->
    </TresCanvas>
</template>

<script setup lang="ts">
import { SRGBColorSpace, BasicShadowMap, NoToneMapping, Vector3 } from 'three'
import { reactive } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import hunyuanSpz from '../components/hunyuanSpz.vue'

const renderPixelRatio = typeof window === 'undefined'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 1.25)

const state = reactive({
    antialias: false,
    clearColor: '#f8fafc',
    alpha: false,
    dpr: renderPixelRatio,
    powerPreference: 'high-performance' as WebGLPowerPreference,
    shadowMapType: BasicShadowMap,
    outputColorSpace: SRGBColorSpace,
    toneMapping: NoToneMapping,
})
</script>
