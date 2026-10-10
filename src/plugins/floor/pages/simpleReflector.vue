<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-12-22 08:09:35
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2023-12-22 11:28:29
-->

<template>
    <TresCanvas clearColor="#201919" window-size>
        <TresPerspectiveCamera :position="[15, 15, 15]" :fov="45" :near="0.1" :far="10000" :look-at="[0, 0, 0]" />
        <OrbitControls enableDamping />
        <TresAmbientLight :intensity="10.0" />
        <TresDirectionalLight v-light-helper :position="[0, 10, 0]" :intensity="10" color="#ffffff" />
        <Box :args="[1, 1, 1]" color="orange" :position="[3, 2, 1]" />
        <TresMesh :position="[0, 2, -4]">
            <TresBoxGeometry :args="[1, 1, 1]" />
            <TresMeshNormalMaterial />
        </TresMesh>
        <reflectorMesh v-bind="configState" />
    </TresCanvas>
</template>

<script setup lang="ts">
import { vLightHelper } from '@tresjs/core'
import { OrbitControls, Box } from '@tresjs/cientos'

import { reactive, onBeforeUnmount } from 'vue'
import { Pane } from 'tweakpane'
import reflectorMesh from '../components/reflectorMesh.vue'

const configState = reactive({
    mirrorSize: 16,
    gridSize: 15,
    mirrorColor: '#efefef',
    divisions: 10, //网格密度							 初始化时设置
    colorCenterLine: '#444444', //网格颜色 中心的XZ轴		  初始化时设置
    colorGrid: '#888888', //网格颜色							 初始化时设置
})
const paneControl = new Pane({
    title: '地板参数',
    expanded: true,
})
onBeforeUnmount(() => paneControl.dispose())
paneControl.addBinding(configState, 'mirrorColor', { label: '镜面颜色' })
paneControl.addBinding(configState, 'mirrorSize', {
    label: '镜面大小',
    min: 10,
    max: 50,
    step: 1,
})
paneControl.addBinding(configState, 'gridSize', {
    label: '网格大小',
    min: 10,
    max: 50,
    step: 1,
})
</script>
