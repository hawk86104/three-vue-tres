<!--
 * @Description:  preset="shangai"
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-04-07 14:29:57
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-11-18 16:16:48
-->
<template>
	<TresCanvas v-bind="tcConfig">
		<TresPerspectiveCamera :position="[15, 15, 15]" :fov="45" :near="0.1" :far="10000" :look-at="[0, 0, 0]" />
		<OrbitControls enableDamping />
		<TresAmbientLight :intensity="0.5" />

		<TresMesh :position="[3, 2, 1]" cast-shadow>
			<TresBoxGeometry :args="[10, 10, 10]" />
			<TresMeshStandardMaterial color="#ffffff" :metalness="1" :roughness="0.14" />
		</TresMesh>

		<TresMesh :position="[0, 2, -4]" cast-shadow>
			<TresBoxGeometry :args="[2, 2, 2]" />
			<TresMeshNormalMaterial />
		</TresMesh>

		<basiceEnv v-bind="basiceEnvState" />

	</TresCanvas>
</template>


<script setup lang="ts">
import { reactive } from 'vue'
import * as THREE from "three"
import { OrbitControls } from '@tresjs/cientos'
import { basiceEnv, HDRfileList } from 'PLS/skyBox'
import { Pane } from 'tweakpane'

const tcConfig = {
	clearColor: "#201919",
	windowSize: true,
	shadows: true,
	toneMapping: THREE.ACESFilmicToneMapping,
	toneMappingExposure: 0.8,
}

const basiceEnvState = reactive({
	on: true,
	type: 'sunset' as any,
	environmentIntensity: 1,
	environmentRotations: { x: 0, y: 0, z: 0 }
})

const paneControl = new Pane()
paneControl.addBinding(basiceEnvState, 'on', {
	label: '开启环境贴图',
})
paneControl.addBinding(basiceEnvState, 'environmentIntensity', {
	label: '环境贴图强度',
	min: 0,
	max: 3,
	step: 0.01,
})
paneControl.addBinding(basiceEnvState, 'environmentRotations', {
	label: '环境贴图旋转',
	x: { min: -Math.PI, max: Math.PI },
	y: { min: -Math.PI, max: Math.PI },
	z: { min: -Math.PI, max: Math.PI },
})
paneControl.addBlade({
	view: 'list',
	label: '环境贴图类别',
	options: Object.entries(HDRfileList).map(([name, path]) => ({
		text: name,
		value: name
	})),
	value: basiceEnvState.type,
}).on('change', (ev: any) => {
	basiceEnvState.type = ev.value
})
</script>
