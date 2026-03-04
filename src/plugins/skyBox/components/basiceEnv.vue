<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-11-18 14:57:52
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-03-04 15:20:24
-->
<template>

</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import * as THREE from "three"
import { useTres } from '@tresjs/core'
import { loadHDR } from '../common/utils'
import { HDRfileList, HDRfilePath } from 'PLS/skyBox'

type HDRKey = keyof typeof HDRfileList
const props = defineProps({
	on: {
		default: true
	},
	type: {
		default: 'sunset' as HDRKey,
	},
	environmentIntensity: {
		default: 1,
	},
	environmentRotations: {
		default: { x: 0, y: 0, z: 0 },
	}
})

function toEuler(value: any): THREE.Euler | null {
	if (value instanceof THREE.Euler) {
		return value
	}
	if (Array.isArray(value)) {
		return new THREE.Euler(value[0], value[1], value[2])
	}
	if (typeof value === 'number') {
		return new THREE.Euler(value, value, value)
	}
	if (value instanceof THREE.Vector3) {
		return new THREE.Euler(value.x, value.y, value.z)
	}
	if (typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value) {
		return new THREE.Euler(value.x, value.y, value.z)
	}
	return null
}
declare global {
	interface Window {
		globalTvtuseTres?: any // 当前场景的全局useTres变量
	}
}
const { scene, camera, renderer } = useTres()
const pTexture = ref(null) as any
watch(() => [props.on, pTexture.value], ([on, p]) => {
	if (scene.value) {
		if (on && pTexture.value) {
			scene.value.environment = pTexture.value
		} else {
			scene.value.environment = null
		}
		if (!window.globalTvtuseTres) {
			window.globalTvtuseTres = {
				scene: scene.value,
				camera: camera.value,
				renderer: renderer
			}
		}
	}
}, {
	immediate: true,
})
watch(() => props.type, async (value: HDRKey) => {
	if (scene.value && HDRfileList[value]) {
		pTexture.value = await loadHDR(HDRfilePath + HDRfileList[value])
		if (props.on) {
			scene.value.environment = pTexture.value
		}
	}
}, {
	immediate: true,
})

watch(() => props.environmentIntensity, (value) => {
	if (scene.value) {
		scene.value.environmentIntensity = value
	}
}, {
	immediate: true,
})
watch(() => props.environmentRotations, (value) => {
	if (scene.value) {
		const euler = toEuler(value)
		if (euler) {
			scene.value.environmentRotation.copy(euler)
		}
	}
}, {
	immediate: true, deep: true
})
</script>