<script setup lang="ts">
import { useLoop } from '@tresjs/core'
// import { CustomShaderMaterial } from '@tresjs/cientos'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import { watchEffect, watch } from 'vue';
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
props.model.model.children[0].material = new THREE.MeshBasicMaterial({ color: '#ffff00' })

CITY_UNTRIANGULATED.renderOrder = 1001
const LANDMASS = props.model.land
const setColorMaterial = (type: any, param: string) => {
	let materials
	if (type === 'cu') {
	} else if (type === 'land') {
		// 设置城市地面（mesh物体），材质基本颜色
		materials = Array.isArray(LANDMASS.material) ? LANDMASS.material : [LANDMASS.material]
		materials.forEach((material) => {
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
		vertexShader: `
		varying vec4 vPosition;
		void main() {
			vPosition = modelMatrix * vec4(position,1.0);
			csm_Position = position * vec3(1.0);
		}
		`,
		fragmentShader: `
		uniform mat4 modelMatrix;
		varying vec4 vPosition;
		uniform vec3 uMax; 
		uniform vec3 uMin; 
		uniform float uOpacity;  
		uniform float uBorderWidth; 
		uniform vec3 uLightColor;
		uniform vec3 uColor;
		uniform float uCircleTime; 
		uniform float uTime; 
		uniform vec3 uTopColor;					//顶部颜色
		uniform bool uGradient;
		vec4 uMax_world;
		vec4 uMin_world;
		void main() {
			// 转世界坐标
			uMax_world =  modelMatrix * vec4(uMax,1.0);
			uMin_world =  modelMatrix * vec4(uMin,1.0);
			vec3 distColor = uColor;
			float residue = uTime - floor(uTime / uCircleTime) * uCircleTime;
			float rate = residue / uCircleTime;
			float lightOffset = rate * (uMax_world.y - uMin_world.y);

			if (uMin_world.y + lightOffset < vPosition.y && uMin_world.y + lightOffset + uBorderWidth > vPosition.y) {
				csm_DiffuseColor = vec4(uLightColor, uOpacity);
			} else {
				csm_DiffuseColor = vec4(distColor, uOpacity);
			}

			//根据高度计算颜色
			if(uGradient){
				float rateHight = (vPosition.y - uMin_world.y) / (uMax_world.y - uMin_world.y); 
				vec3 outColor = mix(csm_DiffuseColor.xyz, uTopColor, rateHight*2.0);
				csm_DiffuseColor = vec4(outColor, uOpacity);
			}
    }
		`,
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
	CITY_UNTRIANGULATED.material.uniforms.uTime.value += delta
	// console.log(CITY_UNTRIANGULATED.material.uniforms.uTime.value)
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
