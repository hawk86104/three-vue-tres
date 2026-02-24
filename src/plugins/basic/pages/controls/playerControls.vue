<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-02-24 14:03:54
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-02-24 16:04:20
-->
<template>
	<TresCanvas v-bind="state" window-size>
		<!-- <TresPerspectiveCamera :position="pos" :fov="70" :near="0.1" :far="1000" :look-at="[pos.x, pos.y, pos.z + 1]" /> -->
		<TresPerspectiveCamera :fov="70" :near="0.1" :far="1000"/>
		<MapControls makeDefault enableDamping :maxDistance="2000" :dampingFactor="0.1" :rotateSpeed="1" :maxPolarAngle="Math.PI / 2" />
		<TresAmbientLight :intensity="0.5" />

		<TresMesh :rotation="[-Math.PI / 2, 0, 0]" receive-shadow :position-y="0">
			<TresPlaneGeometry :args="[200, 200,1000,1000]" />
			<TresMeshToonMaterial />
		</TresMesh>

		<TresDirectionalLight :position="[10, 8, 4]" :intensity="2" ref="TDirectionalLight" cast-shadow />

		<PlayerController />
	</TresCanvas>
</template>

<script setup lang="ts">
import { SRGBColorSpace, BasicShadowMap, NoToneMapping } from 'three'
import { reactive, shallowRef, watchEffect } from 'vue'
import MapControls from '../../components/forCientos/MapControls.vue'
import PlayerController from '../../components/playerController.vue'

const state = reactive({
	clearColor: '#201919',
	shadows: true,
	alpha: false,

	shadowMapType: BasicShadowMap,
	outputColorSpace: SRGBColorSpace,
	toneMapping: NoToneMapping,
})

// const pos = new Vector3(21.88, 3, 10.98)
const TDirectionalLight = shallowRef()
watchEffect(() => {
    if (TDirectionalLight.value) {
        TDirectionalLight.value.shadow.mapSize.set(10000, 10000)
        TDirectionalLight.value.shadow.camera.near = 1 // default
        // TDirectionalLight.value.shadow.camera.far = 50000 // default
        TDirectionalLight.value.shadow.camera.top = 10
        TDirectionalLight.value.shadow.camera.right = 10
        TDirectionalLight.value.shadow.camera.left = -10
        TDirectionalLight.value.shadow.camera.bottom = -10
    }
})
</script>