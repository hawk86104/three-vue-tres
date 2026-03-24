<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
import { CustomShaderMaterial } from '@tresjs/cientos'

const props = withDefaults(defineProps<{
	radius?: number
	maxRadius?: number
	color?: string
	opacity?: number
	speed?: number
	height?: number
}>(), {
	radius: 1,
	maxRadius: 20,
	color: '#ffff00',
	opacity: 1.0,
	speed: 0.3,
	height: 100,
})

const MeshRef = ref()
const uniforms = {
	uColor: { value: new THREE.Color(props.color) },
	uOpacity: { value: props.opacity },
	uHeight: { value: props.height },
	uScale: { value: 1 },
} as any

const vertexShader = `
    uniform float uScale;
    varying float vY;

    void main() {
      vec3 p = position;
      p.xz *= uScale;
      vY = position.y;
      csm_Position = p;
    }
  `

const fragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uHeight;
    varying float vY;

    void main() {
      float alpha = (1.0 - vY / uHeight) * uOpacity;
      csm_DiffuseColor = vec4(uColor, alpha);
    }
  `

watchEffect(() => {
	uniforms.uColor.value.set(props.color)
	uniforms.uOpacity.value = props.opacity
	uniforms.uHeight.value = props.height
})

/** 动画 */
const { onBeforeRender } = useLoop()
let t = 0

onBeforeRender(() => {
	t += 0.02 * props.speed
	const k = (t % 1)
	const r = props.radius + k * (props.maxRadius - props.radius)
	uniforms.uScale.value = r / props.radius
})
const tubePath = ref(new THREE.LineCurve3(
	new THREE.Vector3(0, 0, 0),
	new THREE.Vector3(0, 10, 0)
));
defineExpose({ MeshRef })
</script>

<template>
	<TresMesh ref="MeshRef" :renderOrder="2000">
		<TresTubeGeometry :args="[tubePath,
			20,
			props.radius,
			64,
			false
		]" />
		<CustomShaderMaterial
			:baseMaterial="THREE.MeshBasicMaterial"
			:vertexShader="vertexShader"
			:fragmentShader="fragmentShader"
			:uniforms="uniforms"
			:side="THREE.DoubleSide"
			:depthWrite="false"
			:depthTest="true"
			:toneMapped="false"
			transparent
			silent
		/>
	</TresMesh>
</template>
