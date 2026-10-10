<template>
    <TresCanvas v-bind="state" :style="{ height }" @loop="onLoop">
        <TresPerspectiveCamera :position="[15, 15, 15]" :fov="45" :near="0.1" :far="1000" :look-at="[0, 0, 0]" />
        <OrbitControls v-bind="controlsState" />
        <TresAmbientLight :intensity="0.5" />

        <TresMesh ref="sphereRef" :position="[0, 4, 0]" cast-shadow @pointerenter="onPointerEnter" @pointerleave="onPointerLeave">
            <TresSphereGeometry :args="[2, 32, 32]" />
            <TresMeshToonMaterial color="#006060" />
        </TresMesh>

        <TresMesh :rotation="[-Math.PI / 2, 0, 0]" receive-shadow>
            <TresPlaneGeometry :args="[20, 20, 20, 20]" />
            <TresMeshToonMaterial />
        </TresMesh>

        <TresDirectionalLight ref="TDirectionalLight" :position="[10, 8, 4]" :intensity="1" cast-shadow />
        <TresDirectionalLight :position="[10, 2, 4]" :intensity="1" cast-shadow />

        <TresGridHelper />
    </TresCanvas>
    <h1 class="text-center text-white w-full absolute" v-if="!qiankunWindow.__POWERED_BY_QIANKUN__">请通过qiankun主程序访问此页面</h1>
</template>

<script setup lang="ts">
import { SRGBColorSpace, BasicShadowMap, NoToneMapping } from 'three'
import { reactive, ref, onMounted, shallowRef, watchEffect } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import { useQiankunTvtStore } from 'PLS/qiankunTvt/stores/index'

const state = reactive({
    clearColor: '#201919',
    shadows: true,
    alpha: false,
    shadowMapType: BasicShadowMap,
    outputColorSpace: SRGBColorSpace,
    toneMapping: NoToneMapping,
    windowSize: !qiankunWindow.__POWERED_BY_QIANKUN__,
})
const controlsState = reactive({
    enableDamping: true,
    dampingFactor: 0.05,
    enableZoom: true,
    autoRotate: false,
    autoRotateSpeed: 2,
    maxPolarAngle: Math.PI,
    minPolarAngle: 0,
    maxAzimuthAngle: Math.PI,
    minAzimuthAngle: -Math.PI,
    enablePan: true,
    keyPanSpeed: 7,
    maxDistance: 100,
    minDistance: 0,
    minZoom: 0,
    maxZoom: 100,
    zoomSpeed: 1,
    enableRotate: true,
    rotateSpeed: 1,
})

const sphereRef = shallowRef()
const TDirectionalLight = shallowRef()

const qiankunTvtStore = useQiankunTvtStore() as any
let timeplay = 0
const onLoop = (({ elapsed }: { elapsed: number }) => {
    if (!sphereRef.value) return
    if (qiankunTvtStore.floatMove) {
        timeplay++
        sphereRef.value.position.y = 4 + Math.sin(timeplay / 60) * 3
    }
})
function onPointerEnter(ev: any) {
    if (ev) {
        if (ev.object.material.color.getHexString() !== 'ffff40') {
            window.qiankunProps?.setGlobalState({ mouseInState: true, curType: 'mouseIn' })
            ev.object.material.color.set('#ffFF40')
        }
    }
}
function onPointerLeave(ev: any) {
    if (ev) {
        if (ev.object.material.color.getHexString() !== '006060') {
            window.qiankunProps?.setGlobalState({ mouseInState: false, curType: 'mouseIn' })
            ev.eventObject.material.color.set('#006060')
        }
    }
}

watchEffect(() => {
    if (TDirectionalLight.value) {
        TDirectionalLight.value.shadow.mapSize.set(1000, 1000)
        TDirectionalLight.value.shadow.camera.near = 0.5 // default
        TDirectionalLight.value.shadow.camera.far = 50000 // default
        TDirectionalLight.value.shadow.camera.top = 20
        TDirectionalLight.value.shadow.camera.right = 20
        TDirectionalLight.value.shadow.camera.left = -20
        TDirectionalLight.value.shadow.camera.bottom = -20
    }
})

const height = ref(qiankunWindow.__POWERED_BY_QIANKUN__ ? '100%' : '100vh')
onMounted(() => {
    if (!qiankunWindow.__POWERED_BY_QIANKUN__) return
    const parentElement = document.querySelector('.app-main')
    if (parentElement) {
        height.value = `${parentElement.clientHeight}px`
    }
})
</script>
