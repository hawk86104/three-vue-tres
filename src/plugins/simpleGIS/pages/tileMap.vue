<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-02-24 10:03:05
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-03-11 16:52:58
-->
<template>
	<TresCanvas v-bind="state" window-size>
			<tileMapMesh v-bind="tileMapState" ref="tileMapMeshRef" :bbox="[80, 16, 128, 50]" />
	</TresCanvas>
	<raycasterEvent :tileMapRef="tileMapMeshRef" />
</template>


<script setup lang="ts">
import { reactive, shallowRef, onBeforeUnmount } from 'vue'

import * as THREE from 'three'
import { Pane } from 'tweakpane'
import tileMapMesh from '../components/tileMapMesh.vue'
import { lonLatToWebMerctor } from '../lib/threeSatelliteMap/index'
import raycasterEvent from '../components/raycasterEvent.vue'
import { flyToNative } from '../common/utils'

//const mapCenter = webMercatorToLonLat(13222524.44100642, 3765560.203675016)
const positionUtm = lonLatToWebMerctor(118.779958, 32.017136)

const mapCenter = [positionUtm[0], positionUtm[1], 5000]

const tileMapMeshRef = shallowRef()
const tileMapState = reactive({
	opposite: true,
	genBright: 1.3,
	genContrast: 1,
	genSaturation: 1,
	isMonochrome: true,
	monochrome: '#4688b5',
	mapCenter,
	tweenInstance: null,
})

const paneControl = new Pane({ title: '参数' })
onBeforeUnmount(() => paneControl.dispose())
paneControl.addBinding(tileMapState, 'opposite', { label: '反色' })
paneControl.addBinding(tileMapState, 'genBright', {
	label: '高亮', min: 0.1,
	max: 3,
	step: 0.1,
})
paneControl.addBinding(tileMapState, 'genContrast', {
	label: '对比度', min: 0.1,
	max: 3,
	step: 0.1,
})
paneControl.addBinding(tileMapState, 'genSaturation', {
	label: '饱和度', min: 0.1,
	max: 3,
	step: 0.1,
})
paneControl.addBinding(tileMapState, 'isMonochrome', { label: '单色滤镜' })
paneControl.addBinding(tileMapState, 'monochrome', { label: '滤镜颜色' })
const pUtmList = {
	at: lonLatToWebMerctor(118.7425, 31.9998),
	xjk: lonLatToWebMerctor(118.7842, 32.0418),
	nss: lonLatToWebMerctor(118.7503, 31.9082)
}
paneControl.addBlade({
	view: 'list',
	label: '飞去',
	options: [
		{ text: '奥体中心', value: 'at' },
		{ text: '新街口', value: 'xjk' },
		{ text: '牛首山', value: 'nss' },
	],
	value: 'at',
}).on('change', (e: any) => {
	const toP = new THREE.Vector3(pUtmList[e.value][0], 2000, -pUtmList[e.value][1])
	tileMapState.tweenInstance = flyToNative(tileMapMeshRef.value.camera, toP, tileMapMeshRef.value.orbitControl, [0, -300], 4000)
})

const state = reactive({
	clearColor: '#201919',
	antialias: true,
	logarithmicDepthBuffer: true,
	renderMode: 'manual',
	outputColorSpace: THREE.SRGBColorSpace,
	toneMapping: THREE.NoToneMapping,
	// precision: 'highp'
})

setTimeout(() => {
	const pUtm = pUtmList.at
	const toP = new THREE.Vector3(pUtm[0], 1600, -pUtm[1])
	tileMapState.tweenInstance = flyToNative(tileMapMeshRef.value.camera, toP, tileMapMeshRef.value.orbitControl, [-2000, -2000], 2000)
}, 1000)
</script>
