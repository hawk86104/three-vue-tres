<script setup lang="ts">
import { useLoop } from '@tresjs/core'
// import { CustomShaderMaterial } from '@tresjs/cientos'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import { ref, watchEffect, watch } from 'vue';
import vertexShader from '../../shaders/buildingsCustomShaderMaterial.vert'
import fragmentShader from '../../shaders/buildingsCustomShaderMaterial.frag'
import * as THREE from 'three'
const props = withDefaults(defineProps<{
	model: any
	bulidingsColor?: string
	landColor?: string
	topColor?: string
	opacity?: number
	gradient?: boolean
}>(), {
	bulidingsColor: '#e523ff',
	landColor: '#112233',
	topColor: '#ffff00',
	opacity: 0.9,
	gradient: true
})
const CITY_UNTRIANGULATED = props.model.city
//props.model.model.children[0].material = new THREE.MeshBasicMaterial({ color: '#ffff00' })

CITY_UNTRIANGULATED.renderOrder = 1001
const LANDMASS = props.model.land
const setColorMaterial = (type: any, param: string) => {
	let materials
	if (type === 'cu') {
	} else if (type === 'land') {
		// 设置城市地面（mesh物体），材质基本颜色
		materials = Array.isArray(LANDMASS.material) ? LANDMASS.material : [LANDMASS.material]
		materials.forEach((material: any) => {
			material[param].setStyle(props.landColor);
			material.side = THREE.DoubleSide //双面渲染
		})
	}
}
const setEffectMaterial = () => {
	const { geometry } = CITY_UNTRIANGULATED;
	geometry.computeBoundingBox()
	geometry.computeBoundingSphere()
	const { max, min } = geometry.boundingBox;
	// CITY_UNTRIANGULATED.material.dispose()
	// 这里对原有的 CITY_UNTRIANGULATED.material 做继承 使用 CustomShaderMaterial
	if (CITY_UNTRIANGULATED.material.__csm) {
		return
	}
	const material = new CustomShaderMaterial({
		baseMaterial: CITY_UNTRIANGULATED.material,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		uniforms: {
			uMax: { value: max },
			uMin: { value: min },
			uBorderWidth: { value: 5 },
			uCircleTime: { value: 5 },
			uColor: {
				value: new THREE.Color(props.bulidingsColor)
			},
			uOpacity: {
				value: props.opacity
			},
			uLightColor: {
				value: new THREE.Color('#ffffff')
			},
			uTopColor: {
				value: new THREE.Color(props.topColor)
			},
			uTime: {
				value: 0
			},
			uGradient: {
				value: props.gradient
			}
		},
		depthWrite: true,
		depthTest: true,
		transparent: true,			//如果材质透明，那么楼宇就被渲染到后面了
		side: THREE.DoubleSide,//双面渲染
		// lights: true,
	})
	CITY_UNTRIANGULATED.material.dispose()
	CITY_UNTRIANGULATED.material = material
}
setEffectMaterial()

const { onBeforeRender } = useLoop()

onBeforeRender(({ delta }) => {
	CITY_UNTRIANGULATED.material.uniforms.uTime.value += delta;
})
watchEffect(() => {
	if (props.bulidingsColor) {
		CITY_UNTRIANGULATED.material.uniforms.uColor.value.setStyle(props.bulidingsColor)
	}
	if (props.landColor) {
		setColorMaterial('land', 'color')
	}
	if (props.opacity) {
		CITY_UNTRIANGULATED.material.uniforms.uOpacity.value = props.opacity
	}
});
watch(props, (newValue, oldValue) => {
	CITY_UNTRIANGULATED.material.uniforms.uGradient.value = newValue.gradient
})
const pObject = props.model.model.clone()
</script>

<template>
	<primitive :object="pObject" />
</template>
