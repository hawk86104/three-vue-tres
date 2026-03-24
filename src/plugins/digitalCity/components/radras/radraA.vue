<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-10-23 15:48:35
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-22 16:24:58
-->
<script setup lang="ts">
import { nextTick, ref, watch, watchEffect } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
import { CustomShaderMaterial } from '@tresjs/cientos'
const props = withDefaults(
	defineProps<{
		size?: number
		radius?: number
		color?: string
		opacity?: number
		speed?: number
		followWidth?: number
	}>(),
	{
		radius: 240,
		size: 300,
		color: '#ffff00',
		opacity: 0.9,
		speed: 1,
		followWidth: 220,
	},
)

const { onBeforeRender } = useLoop()
const timeDelta = { value: 0 }
const TresCircleGeometryRef = ref()
onBeforeRender(() => {
	timeDelta.value += 0.02 * props.speed
})
const shader = {
	vertexShader: `
	varying vec3 vPosition;
	void main() {
		vPosition = position;
  }
  `,
	fragmentShader: `
	uniform float uRadius;     
  uniform float uTime;      
  uniform float uFollowWidth; 
  varying vec3 vPosition;
	uniform float uOpacity;
	uniform vec3 ncolor;
  float calcAngle(vec3 oFrag){
    float fragAngle;
    const vec3 ox = vec3(1,0,0);
    float dianji = oFrag.x * ox.x + oFrag.z*ox.z;
    float oFrag_length = length(oFrag); // length是内置函数
    float ox_length = length(ox); // length是内置函数
    float yuxian = dianji / (oFrag_length * ox_length);
    fragAngle = acos(yuxian);
    fragAngle = degrees(fragAngle);
    if(oFrag.z > 0.0) {
      fragAngle = -fragAngle + 360.0;
    }
    float scanAngle = uTime * 100.0 - floor(uTime * 100.0 / 360.0) * 360.0;
    float angle = scanAngle - fragAngle;
    if(angle < 0.0){
      angle = angle + 360.0;
    }
    return angle;
  }
  void main() {
		vec4 radarColor;
			// length内置函数，取向量的长度
		if(length(vPosition) == 0.0 || length(vPosition) > uRadius-2.0){
			radarColor = vec4( ncolor, uOpacity );
		} else {
			float angle = calcAngle(vPosition);
			if(angle < uFollowWidth){
				// 尾焰区域
				float opacity =  1.0 - angle / uFollowWidth; 
				radarColor = vec4( ncolor, uOpacity * opacity );
			} else {
				// 其他位置的像素均为透明
				radarColor = vec4( ncolor, 0.0 );
			}
		}
		csm_DiffuseColor = radarColor;
		csm_FragColor = radarColor;
	}
  `,
	uniforms: {
		uRadius: { value: props.radius },
		uTime: timeDelta,
		uFollowWidth: { value: props.followWidth },
		ncolor: { value: new THREE.Color(props.color) },
		uOpacity: { value: props.opacity },
	},
}
watch(TresCircleGeometryRef, (newValue, oldValue) => {
	if (newValue && oldValue === undefined) {
		TresCircleGeometryRef.value.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
	}
})
watch(() => props.size, () => {
	nextTick(() => { 
		TresCircleGeometryRef.value.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
	})
	
})
watchEffect(() => {
	if (props.color) {
		shader.uniforms.ncolor.value = new THREE.Color(props.color)
	}
	if (props.opacity) {
		shader.uniforms.uOpacity.value = props.opacity
	}
	if (props.radius) {
		shader.uniforms.uRadius.value = props.radius
	}
	if (props.followWidth) {
		shader.uniforms.uFollowWidth.value = props.followWidth
	}
})

</script>

<template>
	<TresMesh>
		<TresCircleGeometry ref="TresCircleGeometryRef" :args="[props.size, 64]" />
		<CustomShaderMaterial
			:baseMaterial="THREE.MeshBasicMaterial"
			:vertexShader="shader.vertexShader"
			:fragmentShader="shader.fragmentShader"
			:uniforms="shader.uniforms"
			:side="THREE.DoubleSide"
			:depthWrite="false"
			:depthTest="true"
			:toneMapped="false"
			transparent
			silent
		/>
	</TresMesh>
</template>
