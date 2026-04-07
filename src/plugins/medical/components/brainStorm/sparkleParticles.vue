<template>
    <primitive v-if="points" :object="points" />
</template>

<script setup lang="ts">
import { onUnmounted, shallowRef, watch, watchEffect } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { createSeededRandom, randomRange } from './utils'

interface Props {
    visible?: boolean
    count?: number
    size?: number
    brightness?: number
    minRadius?: number
    maxRadius?: number
    speed?: number
    color1?: string
    color2?: string
    seed?: number
}

const props = withDefaults(defineProps<Props>(), {
    visible: true,
    count: 1800,
    size: 1.6,
    brightness: 2.8,
    minRadius: 1.2,
    maxRadius: 3.2,
    speed: 0.45,
    color1: '#ffffff',
    color2: '#e28c45',
    seed: 33,
})

const points = shallowRef<THREE.Points | null>(null)
let geometry: THREE.BufferGeometry | null = null
let material: THREE.ShaderMaterial | null = null

const disposeParticles = () => {
    geometry?.dispose()
    material?.dispose()
    geometry = null
    material = null
    points.value = null
}

const buildParticles = () => {
    disposeParticles()

    const random = createSeededRandom(props.seed)
    const positions = new Float32Array(props.count * 3)
    const randoms = new Float32Array(props.count)
    const sizes = new Float32Array(props.count)
    const mixes = new Float32Array(props.count)

    for (let index = 0; index < props.count; index++) {
        const radius = randomRange(random, props.minRadius, props.maxRadius)
        const theta = random() * Math.PI * 2
        const phi = Math.acos(2 * random() - 1)

        positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
        positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) - 0.2
        positions[index * 3 + 2] = radius * Math.cos(phi)
        randoms[index] = random()
        sizes[index] = randomRange(random, 0.55, 1.5)
        mixes[index] = random()
    }

    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aMix', new THREE.BufferAttribute(mixes, 1))

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSize: { value: props.size },
            uSpeed: { value: props.speed },
            uBrightness: { value: props.brightness },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            uColor1: { value: new THREE.Color(props.color1) },
            uColor2: { value: new THREE.Color(props.color2) },
        },
        vertexShader: `
            uniform float uTime;
            uniform float uSize;
            uniform float uSpeed;
            uniform float uPixelRatio;

            attribute float aRandom;
            attribute float aSize;
            attribute float aMix;

            varying float vRandom;
            varying float vMix;

            void main() {
                vec3 displaced = position;
                float drift = sin(uTime * uSpeed + aRandom * 18.0) * 0.03;
                displaced *= 1.0 + drift * 0.08;

                vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
                gl_PointSize = uSize * aSize * uPixelRatio * (1.2 / -mvPosition.z);
                gl_PointSize = max(gl_PointSize, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                vRandom = aRandom;
                vMix = aMix;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform float uBrightness;

            varying float vRandom;
            varying float vMix;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered);

                if (dist > 0.5) {
                    discard;
                }

                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                alpha = pow(alpha, 2.2);

                float twinkle = sin(vRandom * 35.0) * 0.15 + 0.85;
                vec3 color = mix(uColor1, uColor2, vMix) * uBrightness;

                gl_FragColor = vec4(color, alpha * twinkle);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
    })

    const nextPoints = new THREE.Points(geometry, material)
    nextPoints.frustumCulled = false
    nextPoints.visible = props.visible
    points.value = nextPoints
}

watch(
    () => [props.count, props.minRadius, props.maxRadius, props.seed],
    () => {
        buildParticles()
    },
    { immediate: true },
)

watchEffect(() => {
    if (!material || !points.value) {
        return
    }

    points.value.visible = props.visible
    material.uniforms.uSize.value = props.size
    material.uniforms.uSpeed.value = props.speed
    material.uniforms.uBrightness.value = props.brightness
    material.uniforms.uColor1.value.set(props.color1)
    material.uniforms.uColor2.value.set(props.color2)
})

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
    if (material) {
        material.uniforms.uTime.value = elapsed
    }
})

onUnmounted(() => {
    disposeParticles()
})
</script>
