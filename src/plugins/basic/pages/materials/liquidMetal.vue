<!--
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-03-31 15:24:12
 * @LastEditors: Codex
 * @LastEditTime: 2026-03-31 15:24:12
-->
<template>
    <TresCanvas v-bind="canvasState" window-size>
        <TresPerspectiveCamera :position="[6.5, 3.6, 8.5]" :fov="40" :near="0.1" :far="1000" />
        <OrbitControls v-bind="controlsState" />
        <TresAmbientLight :intensity="0.45" />
        <TresDirectionalLight :position="[5, 8, 4]" :intensity="4" />

        <TresGroup>
            <TresMesh :position="[-1.75, 0.05, 0]" cast-shadow>
                <TresIcosahedronGeometry :args="[1.4, 32]" />
                <LiquidMetalMaterial v-bind="materialState" />
            </TresMesh>

            <TresMesh :position="[2.1, -0.35, 0.25]" :rotation="[0.55, 0.25, 0.1]" cast-shadow>
                <TresTorusKnotGeometry :args="[0.9, 0.26, 220, 32]" />
                <LiquidMetalMaterial v-bind="materialState" />
            </TresMesh>
        </TresGroup>

        <TresMesh :rotation-x="-Math.PI / 2" :position-y="-2.15" receive-shadow>
            <TresCircleGeometry :args="[9, 96]" />
            <TresMeshStandardMaterial color="#050608" :roughness="0.9" :metalness="0.15" />
        </TresMesh>

        <Suspense>
            <Environment :resolution="256" :blur="0.8" background>
                <Lightformer :intensity="5" form="ring" :position="[0, 4, -3]" :scale="[6, 6, 1]" />
                <Lightformer :intensity="3" form="circle" :position="[6, 3, 2]" :scale="[2, 6, 1]" />
                <Lightformer :intensity="3" form="circle" :position="[-6, 2, 1]" :scale="[2, 6, 1]" />
                <Lightformer :intensity="2" :rotation-y="-Math.PI / 2" :position="[0, 0.5, -4]" :scale="[12, 0.4, 1]" />
            </Environment>
        </Suspense>
    </TresCanvas>
</template>

<script setup lang="ts">
import { ACESFilmicToneMapping } from 'three'
import { onUnmounted, reactive } from 'vue'
import { Pane } from 'tweakpane'
import { OrbitControls } from '@tresjs/cientos'
import {
    Environment,
    Lightformer,
    LiquidMetalMaterial
} from 'PLS/basic'
import { 
    createLiquidMetalMaterialState,
    liquidMetalMaterialControlGroups,
    liquidMetalMaterialSchema, } from '../../components/forCientos/LiquidMetalMaterial/controls'

const canvasState = reactive({
    alpha: true,
    antialias: true,
    toneMapping: ACESFilmicToneMapping,
    clearColor: '#03050a',
})

const controlsState = reactive({
    enableDamping: true,
})

const materialState = reactive(createLiquidMetalMaterialState())
const pane = new Pane({ title: 'Liquid Metal' })

liquidMetalMaterialControlGroups.forEach((group) => {
    const folder = pane.addFolder({ title: group.title })

    group.fields.forEach((fieldKey) => {
        const config = liquidMetalMaterialSchema[fieldKey]

        if (config.com === 'ColorPicker') {
            folder.addBinding(materialState, fieldKey, {
                label: config.name,
            })
            return
        }

        folder.addBinding(materialState, fieldKey, {
            label: config.name,
            min: config.min,
            max: config.max,
            step: config.step,
        })
    })
})

onUnmounted(() => {
    pane.dispose()
})
</script>
