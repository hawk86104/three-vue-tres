<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-04-23 00:44:46
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-23 11:52:27
-->
<template>
    <loading />
    <UI />
    <TresCanvas v-bind="tcConfig">
        <TresPerspectiveCamera :position="[-1.22, 1.67, 0.6]" :fov="75" :aspect="1" :near="0.1" :far="10000" />
        <PreviewMapControls makeDefault :target="[1.82, -1.62, 0.04]" />
        <TresAmbientLight :color="0xffffff" :intensity="0.5" />
        <viewportGizmo v-bind="viewportConfig" />
        <characterRoamPlayer v-if="isColliderReady" />

        <skylight v-bind="sState" />
        <extendMeshes v-if="Resource.hasAllFinished.value" @ready="isColliderReady = true" />
        <basiceEnv v-bind="basiceEnvState" />
    </TresCanvas>
</template>
<script setup lang="ts">
import * as THREE from 'three'
import { ref } from 'vue'
import PreviewMapControls from 'PLS/basic/components/forCientos/MapControls.vue'
import UI from 'PLS/basic/components/playerController/UI.vue'
// import playerController from 'PLS/basic/components/playerController/playerController.vue'
import characterRoamPlayer from '../components/freeHYworld/characterRoamPlayer.vue'
import { viewportGizmo } from 'PLS/useViewportGizmo'
import { Resource } from 'PLS/resourceManager'
import { basiceEnv } from 'PLS/skyBox'
import { yangyangLoading as loading } from 'PLS/UIdemo'
import skylight from '../components/freeHYworld/skylight.vue'
import extendMeshes from '../components/freeHYworld/extendMeshes.vue'

const basiceEnvState = { "type": "sunset", "on": false, "environmentIntensity": 0.6, "environmentRotations": { "x": 0, "y": 0, "z": 0 } }
const sState = { "curTime": 8, "direct": 0, "intensity": 1, "shadowIntensity": 1, "toneMapping": 4, "toneMappingExposure": 1 }
const viewSettingsState = { "antialias": false, "shadows": false, "powerPreference": "high-performance" }
const isColliderReady = ref(false)

const tcConfig = {
    clearColor: '#201919',
    windowSize: true,
    shadows: viewSettingsState.shadows,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 0.6,
    shadowMapType: THREE.PCFSoftShadowMap,
    powerPreference: viewSettingsState.powerPreference,
    antialias: viewSettingsState.antialias,
}

const viewportConfig = {
    size: 100,
    lineWidth: 2,
    type: 'sphere',
    placement: 'bottom-right',
    offset: {
        right: 10,
    },
}

Resource.hasAllFinished.value = true
</script>
