<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-09-13 15:19:57
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-13 16:03:45
-->
<template>
    <TresCanvas v-bind="tcConfig">
        <TresPerspectiveCamera :position="[0, 0, 6]" :fov="50" :near="0.1" :far="10000" />
        <OrbitControls />
        <TresAmbientLight />

        <svgCom v-bind="spriteImgConfig" fit-view />
    </TresCanvas>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { svgCom } from 'PLS/UIdemo'
import { reactive, onMounted } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'

const tcConfig = {
    clearColor: '#201919',
    windowSize: true,
    shadows: true,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMapType: THREE.PCFSoftShadowMap,
}

const spriteImgConfig = reactive({
    src: './plugins/geokit/case-real-3/icons/satellite.svg',
    skipFills: false,
    skipStrokes: false,
})
const pane = new Pane({
    title: '参数',
    expanded: true,
})
const fileInput = document.createElement('input')
fileInput.type = 'file'
fileInput.accept = '.svg'
fileInput.style.display = 'none'
document.body.appendChild(fileInput)
const inputB = pane.addButton({
    title: '替换SVG',
    label: '2MB以内',
})
inputB.on('click', () => {
    if (fileInput) {
        fileInput.value = ''
        fileInput.click()
    }
})
pane.addBinding(spriteImgConfig, 'skipStrokes', { label: '剔除线条' })
pane.addBinding(spriteImgConfig, 'skipFills', { label: '剔除填空' })

onMounted(() => {
    fileInput.onchange = (event: any) => {
        const file = event.target.files[0]
        if (!file) return
        if (file.size > 2 * 1024 * 1024) {
            alert('SVG大小不能超过2MB')
            return
        }

        const reader = new FileReader()
        reader.onload = (e: any) => {
            spriteImgConfig.src = e.target.result
        }
        reader.readAsDataURL(file)
    }
})
</script>
