<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-12-22 08:09:35
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-28 11:47:16
-->

<template>
	<TresCanvas clearColor="#201919" window-size>
		<TresPerspectiveCamera :position="[-15, 15, -15]" :fov="45" :near="0.1" :far="10000" :look-at="[0, 0, 0]" />
		<OrbitControls enableDamping />
		<TresAmbientLight :intensity="10.0" />
		<TresDirectionalLight v-light-helper :position="[0, 8, 0]" :intensity="10" color="#fff" />
		<Box :args="[1, 1, 1]" color="orange" :position="[3, 1, 0]" />
		<TresMesh :position="[0, 2, 4]">
			<TresBoxGeometry :args="[1, 1, 1]" />
			<TresMeshNormalMaterial />
		</TresMesh>
		<Suspense>
			<reflectorDiffuse v-bind="configState" />
		</Suspense>
	</TresCanvas>
</template>

<script setup lang="ts">
import { vLightHelper } from '@tresjs/core'
import { OrbitControls, Box } from '@tresjs/cientos'

import { reactive, onBeforeUnmount } from 'vue'
import { Pane } from 'tweakpane'
import reflectorDiffuse from '../components/reflectorDiffuse.vue'

const configState = reactive({
	mirror: 0.9,	// 去除纹理 镜面化 
	mixStrength: 9,
	showGridHelper: true,
	color: '#69a5c2'
})

const paneControl = new Pane({
	title: '镜面参数',
	expanded: true,
})
onBeforeUnmount(() => paneControl.dispose())
paneControl.addBinding(configState, 'color', { label: '镜面颜色' })
paneControl.addBinding(configState, 'showGridHelper', { label: '显示网格' })
</script>
