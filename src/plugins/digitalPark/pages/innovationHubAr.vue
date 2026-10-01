<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-07-13 10:24:05
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-10-01 15:57:01
-->
<template>
    <div class="innovation-hub-ar">
        <loading v-if="!isSceneReady" />
        <TresCanvas v-bind="canvasState">
            <TresPerspectiveCamera ref="cameraRef" :position="cameraPosition" :fov="45" :near="0.1" :far="1000" />
            <OrbitControls v-bind="controlsState" />

            <Suspense @resolve="markSceneReady">
                <InnovationHubModel />
            </Suspense>

            <EffectComposerPmndrs :multisampling="4">
                <BloomPmndrs :intensity="0.7" :luminance-threshold="0.9" :luminance-smoothing="0.025" :kernel-size="3" />
                <TiltShiftPmndrs :offset="0" :rotation="0" :focus-area="0.936" :feather="0.3" :kernel-size="3" :resolution-scale="1" />
            </EffectComposerPmndrs>
        </TresCanvas>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref, shallowRef, watch } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { BloomPmndrs, EffectComposerPmndrs, TiltShiftPmndrs } from '@tresjs/post-processing'
import { randomLoading as loading } from 'PLS/UIdemo'
import * as THREE from 'three'
import InnovationHubModel from '../components/innovationHubAr/InnovationHubModel.vue'

const cameraPosition = [24.91, 8.7, 24.13] as [number, number, number]
const cameraTarget = new THREE.Vector3(-23.9499969, 4, -32.5)

const canvasState = reactive({
    shadows: true,
    shadowMap: true,
    shadowMapType: THREE.PCFSoftShadowMap,
    toneMapping: THREE.LinearToneMapping,
    toneMappingExposure: 1.45,
    outputColorSpace: THREE.SRGBColorSpace,
    windowSize: true,
})

const controlsState = reactive({
    target: cameraTarget,
    autoRotate: true,
    autoRotateSpeed: 0.3,
    enableDamping: true,
    dampingFactor: 0.1,
    enablePan: true,
    enableZoom: true,
    zoomSpeed: 1,
    minDistance: 10,
    maxDistance: 120,
    minPolarAngle: 0.53,
    maxPolarAngle: 1.5,
})

const cameraRef = shallowRef<THREE.PerspectiveCamera>()
watch(cameraRef, (camera) => {
    camera?.lookAt(cameraTarget)
})

const isSceneReady = ref(false)

function markSceneReady() {
    isSceneReady.value = true
}
</script>

<style scoped>
.innovation-hub-ar {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #d6e8f7;
}
</style>
