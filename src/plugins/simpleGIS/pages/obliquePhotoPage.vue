<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-08-28 09:23:48
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-01 11:43:22
-->
<template>
    <TresCanvas v-bind="state" window-size>
        <TresPerspectiveCamera :position="[800, 800, 800]" :fov="60" :near="1" :far="20000" />
        <OrbitControls />
        <TresAmbientLight :intensity="1" />
        <TresDirectionalLight :position="[1, 2, 3]" :intensity="1.25" />
        <TresAxesHelper :args="[100]" />

        <obliquePhoto v-bind="configState" :rotation-x="configState.isRotation ? -Math.PI / 2 : 0" />
    </TresCanvas>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import obliquePhoto from '../components/obliquePhoto.vue'
import { is3DTilesetJson } from '../common/utils'

const state = {
    clearColor: '#201919',
    windowSize: true,
    shadows: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1,
    shadowMapType: THREE.PCFSoftShadowMap,
}

const configState = reactive({
    tilesUrl: `${
        process.env.NODE_ENV === 'development' ? 'resource.cos' : 'https://opensource.cdn.icegl.cn'
    }/3Dtiles/simpleGIS/TilesetWithDiscreteLOD/tileset.json`,
    isRotation: true,
    isRranslation: true,
    errorTarget: 16,
})
const tilesUrl = ref(configState.tilesUrl)
const paneControl = new Pane()
paneControl.addBinding(tilesUrl, 'value', { label: 'tiles地址' })
const btn = paneControl.addButton({
    title: '应用',
    label: '从url读取tiles',
})
btn.on('click', () => {
    if (tilesUrl.value === configState.tilesUrl) {
        return
    }
    paneControl.disabled = true
    is3DTilesetJson(tilesUrl.value).then((isValid) => {
        if (isValid) {
            configState.tilesUrl = tilesUrl.value
        } else {
            alert('这不是一个有效的3D Tiles地址')
        }
        paneControl.disabled = false
    })
})

paneControl.addBinding(configState, 'isRotation', { label: '地心旋转' })
paneControl.addBinding(configState, 'isRranslation', { label: '居中展示' })
paneControl.addBinding(configState, 'errorTarget', { label: 'LOD误差', min: 0, max: 500, step: 1 })
</script>
