<template>
    <primitive v-if="points" :object="points" />
</template>

<script setup lang="ts">
import { onUnmounted, shallowRef, watch, watchEffect } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { buildTangentBasis, createSeededRandom, randomRange } from './utils'

interface Props {
    mesh: THREE.Mesh
    visible?: boolean
    count?: number
    size?: number
    speed?: number
    outset?: number
    spread?: number
    threshold?: number
    color1?: string
    color2?: string
    seed?: number
}

const props = withDefaults(defineProps<Props>(), {
    visible: true,
    count: 2600,
    size: 22,
    speed: 1.2,
    outset: 0.004,
    spread: 0.007,
    threshold: 0.52,
    color1: '#ffb26b',
    color2: '#ff6b38',
    seed: 17,
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

const buildCandidateVertices = () => {
    const sourceGeometry = props.mesh.geometry
    const positionAttribute = sourceGeometry.getAttribute('position')
    const normalAttribute = sourceGeometry.getAttribute('normal')
    const colorAttribute = sourceGeometry.getAttribute('color')
    const transformMatrix = props.mesh.matrixWorld.clone()
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transformMatrix)
    const candidates: Array<{ position: THREE.Vector3; normal: THREE.Vector3 }> = []

    for (let index = 0; index < positionAttribute.count; index++) {
        if (colorAttribute) {
            const r = colorAttribute.getX(index)
            const g = colorAttribute.getY(index)
            const b = colorAttribute.getZ(index)
            const isHotVertex = r > props.threshold && r > g * 1.4 && r > b * 1.4

            if (!isHotVertex) {
                continue
            }
        }

        const position = new THREE.Vector3().fromBufferAttribute(positionAttribute, index).applyMatrix4(transformMatrix)
        const normal = normalAttribute
            ? new THREE.Vector3().fromBufferAttribute(normalAttribute, index).applyMatrix3(normalMatrix).normalize()
            : position.clone().normalize()

        candidates.push({ position, normal })
    }

    if (candidates.length > 0) {
        return candidates
    }

    const fallbackStep = Math.max(1, Math.floor(positionAttribute.count / Math.max(props.count, 1)))

    for (let index = 0; index < positionAttribute.count; index += fallbackStep) {
        const position = new THREE.Vector3().fromBufferAttribute(positionAttribute, index).applyMatrix4(transformMatrix)
        const normal = normalAttribute
            ? new THREE.Vector3().fromBufferAttribute(normalAttribute, index).applyMatrix3(normalMatrix).normalize()
            : position.clone().normalize()

        candidates.push({ position, normal })
    }

    return candidates
}

const buildParticles = () => {
    disposeParticles()

    const random = createSeededRandom(props.seed)
    const candidates = buildCandidateVertices()
    const total = Math.max(1, props.count)
    const positions = new Float32Array(total * 3)
    const randoms = new Float32Array(total)
    const sizes = new Float32Array(total)

    for (let index = 0; index < total; index++) {
        const candidate = candidates[Math.floor(random() * candidates.length)]
        const { tangent, bitangent } = buildTangentBasis(candidate.normal)
        const spreadX = randomRange(random, -props.spread, props.spread)
        const spreadY = randomRange(random, -props.spread, props.spread)
        const depthJitter = randomRange(random, -props.outset * 0.4, props.outset * 0.4)
        const finalPosition = candidate.position
            .clone()
            .addScaledVector(candidate.normal, props.outset + depthJitter)
            .addScaledVector(tangent, spreadX)
            .addScaledVector(bitangent, spreadY)

        positions[index * 3] = finalPosition.x
        positions[index * 3 + 1] = finalPosition.y
        positions[index * 3 + 2] = finalPosition.z
        randoms[index] = random()
        sizes[index] = randomRange(random, 0.55, 1.45)
    }

    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSize: { value: props.size },
            uSpeed: { value: props.speed },
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

            varying float vRandom;
            varying float vPulse;

            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float pulse = sin(uTime * uSpeed * 3.0 + aRandom * 24.0) * 0.5 + 0.5;
                float pointSize = uSize * aSize * (0.65 + pulse * 0.9);

                gl_PointSize = pointSize * uPixelRatio * (1.0 / -mvPosition.z);
                gl_PointSize = max(gl_PointSize, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                vRandom = aRandom;
                vPulse = pulse;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor1;
            uniform vec3 uColor2;

            varying float vRandom;
            varying float vPulse;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered);

                if (dist > 0.5) {
                    discard;
                }

                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                alpha = pow(alpha, 2.0);

                vec3 color = mix(uColor1, uColor2, vPulse * 0.75 + vRandom * 0.25);
                gl_FragColor = vec4(color, alpha * 1.35);
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
    () => [props.count, props.outset, props.spread, props.threshold, props.seed],
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
