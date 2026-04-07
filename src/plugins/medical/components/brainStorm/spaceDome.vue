<template>
    <TresMesh v-if="visible" :scale="[18, 18, 18]" :render-order="-10">
        <TresSphereGeometry :args="[1, 64, 64]" />
        <TresShaderMaterial v-bind="materialConfig" :side="BackSide" />
    </TresMesh>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { BackSide } from 'three'

interface Props {
    visible?: boolean
    topColor?: string
    bottomColor?: string
    glowColor?: string
    glowStrength?: number
    speed?: number
}

const props = withDefaults(defineProps<Props>(), {
    visible: true,
    topColor: '#11142f',
    bottomColor: '#02030a',
    glowColor: '#4f1d95',
    glowStrength: 0.65,
    speed: 0.18,
})

const materialConfig = {
    uniforms: {
        uTime: { value: 0 },
        uTopColor: { value: new THREE.Color(props.topColor) },
        uBottomColor: { value: new THREE.Color(props.bottomColor) },
        uGlowColor: { value: new THREE.Color(props.glowColor) },
        uGlowStrength: { value: props.glowStrength },
    },
    vertexShader: `
        varying vec3 vPosition;

        void main() {
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        uniform vec3 uGlowColor;
        uniform float uGlowStrength;

        varying vec3 vPosition;

        void main() {
            vec3 direction = normalize(vPosition);
            float verticalMix = smoothstep(-0.9, 0.85, direction.y);
            vec3 color = mix(uBottomColor, uTopColor, verticalMix);

            float horizon = 1.0 - abs(direction.y);
            float haze = smoothstep(0.15, 1.0, horizon);
            float nebula = sin(direction.x * 6.0 + uTime * 0.25) * 0.5 + 0.5;
            nebula *= cos(direction.z * 7.0 - uTime * 0.18) * 0.5 + 0.5;

            color += uGlowColor * haze * nebula * uGlowStrength;
            gl_FragColor = vec4(color, 1.0);
        }
    `,
    depthWrite: false,
}

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
    materialConfig.uniforms.uTime.value = elapsed * props.speed
})

watch(
    () => props.topColor,
    (value) => {
        materialConfig.uniforms.uTopColor.value.set(value)
    },
)

watch(
    () => props.bottomColor,
    (value) => {
        materialConfig.uniforms.uBottomColor.value.set(value)
    },
)

watch(
    () => props.glowColor,
    (value) => {
        materialConfig.uniforms.uGlowColor.value.set(value)
    },
)

watch(
    () => props.glowStrength,
    (value) => {
        materialConfig.uniforms.uGlowStrength.value = value
    },
)
</script>
