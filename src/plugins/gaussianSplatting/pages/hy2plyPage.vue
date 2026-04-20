<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-06-15 19:16:00
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-20 16:09:52
-->
<template>
    <TresCanvas v-bind="state" window-size>
        <TresPerspectiveCamera :position="[-0.55, -2.02, -1.8]" :fov="45" :near="0.1" :far="1000" />
        <OrbitControls makeDefault :target="new Vector3(-0.6, -2.01, -2.28)" />
        <TresAmbientLight :intensity="1.5" />
        <Suspense>
            <hy2ply />
        </Suspense>
        <TresDirectionalLight :position="[-6, 5, -4]" :intensity="1.8" />

        <TresGridHelper :args="[30, 30, '#94a3b8', '#cbd5e1']" />
    </TresCanvas>
</template>

<script setup lang="ts">
import { SRGBColorSpace, BasicShadowMap, NoToneMapping, Vector3 } from 'three'
import { reactive } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import hy2ply from '../components/hy2ply.vue'

const state = reactive({
    clearColor: '#f8fafc',
    alpha: false,
    shadows: false,
    shadowMapType: BasicShadowMap,
    outputColorSpace: SRGBColorSpace,
    toneMapping: NoToneMapping,
})
</script>
