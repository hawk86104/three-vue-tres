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
		<TresPerspectiveCamera :fov="70" :near="0.1" :far="1000" />
		<MapControls makeDefault enableDamping :maxDistance="2000" :dampingFactor="0.1" :rotateSpeed="1" :maxPolarAngle="Math.PI / 2" />
		<TresAmbientLight :intensity="0.5" />

		<TresMesh :rotation="[-Math.PI / 2, 0, 0]" receive-shadow>
			<TresPlaneGeometry :args="[6, 6]" />
			<TresMeshToonMaterial color="#eeeeee" />
		</TresMesh>

		<TresDirectionalLight :position="[50, 50, 50]" :intensity="10" ref="TDirectionalLight" cast-shadow />

		<PlayerController />
	</TresCanvas>
</template>

<script setup lang="ts">
import { SRGBColorSpace, BasicShadowMap, NoToneMapping } from 'three'
import { shallowRef, watchEffect } from 'vue'
import MapControls from '../../components/forCientos/MapControls.vue'
import PlayerController from '../../components/playerController/playerController.vue'
import UI from '../../components/playerController/UI.vue'

const state = {
	clearColor: '#666666',
	shadows: true,
	alpha: false,
	shadowMapType: BasicShadowMap,
	outputColorSpace: SRGBColorSpace,
	toneMapping: NoToneMapping,
}

const TDirectionalLight = shallowRef()
watchEffect(() => {
	if (TDirectionalLight.value) {
		TDirectionalLight.value.shadow.mapSize.set(2048, 2048)
		TDirectionalLight.value.shadow.camera.near = 0
		TDirectionalLight.value.shadow.camera.far = 100
		TDirectionalLight.value.shadow.camera.top = 1
		TDirectionalLight.value.shadow.camera.right = 1
		TDirectionalLight.value.shadow.camera.left = -1
		TDirectionalLight.value.shadow.camera.bottom = -1
		// TDirectionalLight.value.shadow.bias = 0
	}
})
</script>