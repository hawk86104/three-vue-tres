<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-02-24 14:03:54
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-02-24 16:30:57
-->
<template>
	<UI />
	<TresCanvas v-bind="state" window-size>
		<TresPerspectiveCamera :fov="55" :near="0.1" :far="1000" />
		<MapControls makeDefault enableDamping :maxDistance="220" :dampingFactor="0.12" :rotateSpeed="1" :maxPolarAngle="Math.PI / 2" />
		<TresAmbientLight :intensity="1.4" />

		<TresMesh :rotation="[-Math.PI / 2, 0, 0]" receive-shadow>
			<TresPlaneGeometry :args="[160, 160]" />
			<TresMeshStandardMaterial color="#dde7f1" :roughness="0.98" />
		</TresMesh>

		<TresDirectionalLight
			:position="[24, 34, 18]"
			:intensity="3.2"
			:cast-shadow="true"
			:shadow-mapSize-width="1024"
			:shadow-mapSize-height="1024"
			:shadow-camera-near="1"
			:shadow-camera-far="100"
			:shadow-camera-top="3"
			:shadow-camera-right="3"
			:shadow-camera-left="-3"
			:shadow-camera-bottom="-3"
			:shadow-bias="-0.00012"
			:shadow-normal-bias="0.006"
		/>

		<PlayerController
			:position="[0, 0, 0]"
			:scale="0.002"
			:min-cam-distance="110"
			:max-cam-distance="460"
			:mobile-controls="{ joystick: true, jump: true, fly: true, view: true }"
		/>
	</TresCanvas>
</template>

<script setup lang="ts">
import { SRGBColorSpace, NoToneMapping, PCFSoftShadowMap } from 'three'
import MapControls from '../../components/forCientos/MapControls.vue'
import PlayerController from '../../components/playerController/playerController.vue'
import UI from '../../components/playerController/UI.vue'

const state = {
	clearColor: '#666666',
	shadows: true,
	alpha: false,
	shadowMapType: PCFSoftShadowMap,
	outputColorSpace: SRGBColorSpace,
	toneMapping: NoToneMapping,
}
</script>
