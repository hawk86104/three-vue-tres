<template>
    <TresGroup>
        <primitive
            v-for="thread in threads"
            :key="thread.id"
            :object="thread.mesh"
        />
        <primitive v-if="particlePoints" :object="particlePoints" />
    </TresGroup>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef, watch, watchEffect } from 'vue'
import * as THREE from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { createSeededRandom, randomRange } from './utils'

interface ThreadState {
    id: number
    mesh: THREE.Mesh
    geometry: THREE.TubeGeometry
    material: THREE.MeshBasicMaterial
    curve: THREE.CatmullRomCurve3
    originalPositions: Float32Array
    tubeSegments: number
    perpVectors: Array<{ perp1: THREE.Vector3; perp2: THREE.Vector3 }>
    waveOffsets: THREE.Vector3[]
    offset: number
    needsUpdate: boolean
    opacityFactor: number
    baseOpacity: number
    targetOpacity: number
    currentOpacity: number
}

interface Props {
    visible?: boolean
    color?: string
    opacity?: number
    clusterCount?: number
    threadsPerCluster?: number
    threadRadiusMin?: number
    threadRadiusMax?: number
    minLength?: number
    maxLength?: number
    startRadiusMin?: number
    startRadiusMax?: number
    waveAmplitude?: number
    waveFrequency?: number
    clusterSpread?: number
    animationEnabled?: boolean
    animationSpeed?: number
    animationAmplitude?: number
    animationFrequency?: number
    mouseRepulsionEnabled?: boolean
    mouseRepulsionRadius?: number
    mouseRepulsionStrength?: number
    repulsionSmoothness?: number
    mouseGlowEnabled?: boolean
    mouseGlowOpacity?: number
    glowTransitionSpeed?: number
    particlesVisible?: boolean
    particlesPerThread?: number
    particleSpeed?: number
    particleSize?: number
    particleColor1?: string
    particleColor2?: string
    seed?: number
}

const props = withDefaults(defineProps<Props>(), {
    visible: true,
    color: '#b089ff',
    opacity: 0.42,
    clusterCount: 16,
    threadsPerCluster: 5,
    threadRadiusMin: 0.00035,
    threadRadiusMax: 0.0028,
    minLength: 0.72,
    maxLength: 2.45,
    startRadiusMin: 0.34,
    startRadiusMax: 0.5,
    waveAmplitude: 0.115,
    waveFrequency: 3.8,
    clusterSpread: 0.1,
    animationEnabled: true,
    animationSpeed: 2.6,
    animationAmplitude: 0.026,
    animationFrequency: 2.3,
    mouseRepulsionEnabled: true,
    mouseRepulsionRadius: 0.35,
    mouseRepulsionStrength: 0.08,
    repulsionSmoothness: 0.15,
    mouseGlowEnabled: true,
    mouseGlowOpacity: 1,
    glowTransitionSpeed: 0.1,
    particlesVisible: true,
    particlesPerThread: 4,
    particleSpeed: 0.32,
    particleSize: 26,
    particleColor1: '#7444ff',
    particleColor2: '#ff89d0',
    seed: 27,
})

const threads = shallowRef<ThreadState[]>([])
const particlePoints = shallowRef<THREE.Points | null>(null)

let particleGeometry: THREE.BufferGeometry | null = null
let particleMaterial: THREE.ShaderMaterial | null = null
let pointerIsDown = false

const pointer = new THREE.Vector2(2, 2)
const raycaster = new THREE.Raycaster()
const { camera } = useTres()

const curveSegments = 96
const radialSegments = 8
const verticesPerRing = radialSegments + 1
let speedMultiplier = 1

const updateThreadMaterialState = (thread: ThreadState) => {
    thread.baseOpacity = props.opacity * thread.opacityFactor
    if (!props.mouseGlowEnabled) {
        thread.currentOpacity = thread.baseOpacity
        thread.targetOpacity = thread.baseOpacity
        thread.material.opacity = thread.baseOpacity
    }

    thread.mesh.visible = props.visible
    thread.material.color.set(props.color)
}

const disposeThreads = () => {
    threads.value.forEach((thread) => {
        thread.geometry.dispose()
        thread.material.dispose()
    })
    threads.value = []
}

const disposeParticles = () => {
    particleGeometry?.dispose()
    particleMaterial?.dispose()
    particleGeometry = null
    particleMaterial = null
    particlePoints.value = null
}

const getPerpVectors = (curve: THREE.CatmullRomCurve3, tubeSegments: number) => {
    const perpVectors: Array<{ perp1: THREE.Vector3; perp2: THREE.Vector3 }> = []

    for (let index = 0; index <= tubeSegments; index++) {
        const t = index / tubeSegments
        const nextT = Math.min(t + 0.01, 1)
        const prevT = Math.max(t - 0.01, 0)
        const nextPoint = curve.getPointAt(nextT)
        const prevPoint = curve.getPointAt(prevT)
        const tangent = new THREE.Vector3().subVectors(nextPoint, prevPoint).normalize()

        const perp1 = new THREE.Vector3()
        if (Math.abs(tangent.x) < 0.9) {
            perp1.set(0, tangent.z, -tangent.y).normalize()
        } else {
            perp1.set(-tangent.z, 0, tangent.x).normalize()
        }

        const perp2 = new THREE.Vector3().crossVectors(tangent, perp1).normalize()
        perpVectors.push({ perp1, perp2 })
    }

    return perpVectors
}

const createThread = (
    random: () => number,
    clusterPosition: THREE.Vector3,
    outwardDirection: THREE.Vector3,
    clusterWavePhase: number,
    clusterWaveFrequency: number,
    clusterWaveAmplitude: number,
    clusterWavePhaseTwo: number,
    id: number,
) => {
    const start = clusterPosition.clone().add(
        new THREE.Vector3(
            randomRange(random, -props.clusterSpread * 0.5, props.clusterSpread * 0.5),
            randomRange(random, -props.clusterSpread * 0.5, props.clusterSpread * 0.5),
            randomRange(random, -props.clusterSpread * 0.5, props.clusterSpread * 0.5),
        ),
    )

    const threadLength = randomRange(random, props.minLength, props.maxLength)
    const dirVariation = 0.15
    const finalDirection = outwardDirection
        .clone()
        .add(
            new THREE.Vector3(
                randomRange(random, -dirVariation, dirVariation),
                randomRange(random, -dirVariation, dirVariation),
                randomRange(random, -dirVariation, dirVariation),
            ),
        )
        .normalize()

    let perp1: THREE.Vector3
    if (Math.abs(finalDirection.x) < 0.9) {
        perp1 = new THREE.Vector3(0, finalDirection.z, -finalDirection.y).normalize()
    } else {
        perp1 = new THREE.Vector3(-finalDirection.z, 0, finalDirection.x).normalize()
    }
    const perp2 = new THREE.Vector3().crossVectors(finalDirection, perp1).normalize()

    const path = []

    for (let index = 0; index <= curveSegments; index++) {
        const progress = index / curveSegments
        const distance = progress * threadLength
        const waveOne = Math.sin(progress * Math.PI * clusterWaveFrequency + clusterWavePhase) * clusterWaveAmplitude
        const waveTwo = Math.cos(progress * Math.PI * clusterWaveFrequency * 0.7 + clusterWavePhaseTwo) * clusterWaveAmplitude * 0.6

        path.push(
            start
                .clone()
                .addScaledVector(finalDirection, distance)
                .addScaledVector(perp1, waveOne)
                .addScaledVector(perp2, waveTwo),
        )
    }

    const curve = new THREE.CatmullRomCurve3(path)
    curve.tension = 0.5

    const tubeSegments = 64
    const threadRadius = randomRange(random, props.threadRadiusMin, props.threadRadiusMax)
    const geometry = new THREE.TubeGeometry(curve, tubeSegments, threadRadius, radialSegments, false)
    const opacityFactor = randomRange(random, 0.6, 1)
    const baseOpacity = props.opacity * opacityFactor
    const material = new THREE.MeshBasicMaterial({
        color: props.color,
        transparent: true,
        opacity: baseOpacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
    })

    return {
        id,
        mesh: new THREE.Mesh(geometry, material),
        geometry,
        material,
        curve,
        originalPositions: new Float32Array(geometry.attributes.position.array),
        tubeSegments,
        perpVectors: getPerpVectors(curve, tubeSegments),
        waveOffsets: [],
        offset: random(),
        needsUpdate: false,
        opacityFactor,
        baseOpacity,
        targetOpacity: baseOpacity,
        currentOpacity: baseOpacity,
    } satisfies ThreadState
}

const buildThreads = () => {
    disposeThreads()
    disposeParticles()

    const random = createSeededRandom(props.seed)
    const createdThreads: ThreadState[] = []
    let id = 0

    for (let clusterIndex = 0; clusterIndex < props.clusterCount; clusterIndex++) {
        const theta = random() * Math.PI * 2
        const phi = random() * Math.PI
        const radius = randomRange(random, props.startRadiusMin, props.startRadiusMax)
        const clusterPosition = new THREE.Vector3(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi),
        )
        const outwardDirection = clusterPosition.clone().normalize()
        const clusterWavePhase = random() * Math.PI * 2
        const clusterWaveFrequency = props.waveFrequency * randomRange(random, 0.8, 1.2)
        const clusterWaveAmplitude = props.waveAmplitude * randomRange(random, 0.7, 1.3)
        const clusterWavePhaseTwo = random() * Math.PI * 2

        for (let threadIndex = 0; threadIndex < props.threadsPerCluster; threadIndex++) {
            createdThreads.push(
                createThread(
                    random,
                    clusterPosition,
                    outwardDirection,
                    clusterWavePhase,
                    clusterWaveFrequency,
                    clusterWaveAmplitude,
                    clusterWavePhaseTwo,
                    id++,
                ),
            )
        }
    }

    threads.value = createdThreads
    createThreadParticles()
}

const createThreadParticles = () => {
    disposeParticles()

    if (!threads.value.length || props.particlesPerThread <= 0) {
        return
    }

    const total = threads.value.length * props.particlesPerThread
    const positions = new Float32Array(total * 3)
    const progress = new Float32Array(total)
    const speeds = new Float32Array(total)
    const randoms = new Float32Array(total)
    const sizes = new Float32Array(total)
    const random = createSeededRandom(props.seed + 99)

    let particleIndex = 0
    threads.value.forEach(() => {
        for (let count = 0; count < props.particlesPerThread; count++) {
            const baseProgress = count / props.particlesPerThread
            progress[particleIndex] = (baseProgress + random() * 0.1) % 1
            speeds[particleIndex] = randomRange(random, 0.8, 1.2)
            randoms[particleIndex] = random()
            sizes[particleIndex] = randomRange(random, 0.7, 1.3)
            particleIndex++
        }
    })

    particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1))
    particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    particleGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSize: { value: props.particleSize },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            uColor1: { value: new THREE.Color(props.particleColor1) },
            uColor2: { value: new THREE.Color(props.particleColor2) },
        },
        vertexShader: `
            uniform float uTime;
            uniform float uSize;
            uniform float uPixelRatio;

            attribute float aProgress;
            attribute float aSpeed;
            attribute float aRandom;
            attribute float aSize;

            varying float vRandom;
            varying float vProgress;

            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float pulse = sin(uTime * 2.0 + aRandom * 6.28318) * 0.3 + 0.7;
                float sizeVariation = aSize * pulse;

                gl_PointSize = uSize * sizeVariation * uPixelRatio;
                gl_PointSize *= (2.0 / -mvPosition.z);
                gl_PointSize = max(gl_PointSize, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                vRandom = aRandom;
                vProgress = aProgress;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;

            varying float vRandom;
            varying float vProgress;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered);

                if (dist > 0.5) {
                    discard;
                }

                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                alpha = pow(alpha, 2.0);

                float fadeOut = 1.0 - smoothstep(0.85, 1.0, vProgress);
                float twinkle = sin(uTime * 4.0 + vRandom * 20.0) * 0.2 + 0.8;
                vec3 color = mix(uColor1, uColor2, vProgress) * 3.0;

                gl_FragColor = vec4(color, alpha * twinkle * fadeOut);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
    })

    const nextPoints = new THREE.Points(particleGeometry, particleMaterial)
    nextPoints.visible = props.visible && props.particlesVisible
    nextPoints.frustumCulled = false
    particlePoints.value = nextPoints
}

const sampleThreadPosition = (geometry: THREE.BufferGeometry, progressValue: number) => {
    const positionAttribute = geometry.getAttribute('position')
    const segmentCount = Math.floor(positionAttribute.count / verticesPerRing)
    const exactSegment = progressValue * Math.max(segmentCount - 1, 1)
    const segmentIndex = Math.floor(exactSegment)
    const segmentProgress = exactSegment - segmentIndex

    const getRingCenter = (index: number) => {
        const center = new THREE.Vector3()
        const ringStart = index * verticesPerRing

        for (let offset = 0; offset < verticesPerRing; offset++) {
            const vertexIndex = Math.min(ringStart + offset, positionAttribute.count - 1)
            center.x += positionAttribute.array[vertexIndex * 3]
            center.y += positionAttribute.array[vertexIndex * 3 + 1]
            center.z += positionAttribute.array[vertexIndex * 3 + 2]
        }

        return center.divideScalar(verticesPerRing)
    }

    const currentCenter = getRingCenter(segmentIndex)
    if (segmentIndex < segmentCount - 1) {
        return currentCenter.lerp(getRingCenter(segmentIndex + 1), segmentProgress)
    }

    return currentCenter
}

const updateThreadParticles = (delta: number, elapsed: number) => {
    if (!particleGeometry || !particleMaterial || !particlePoints.value) {
        return
    }

    const positionAttribute = particleGeometry.getAttribute('position')
    const progressAttribute = particleGeometry.getAttribute('aProgress')
    const speedAttribute = particleGeometry.getAttribute('aSpeed')

    particleMaterial.uniforms.uTime.value = elapsed
    let particleIndex = 0

    threads.value.forEach((thread) => {
        for (let index = 0; index < props.particlesPerThread; index++) {
            let progressValue = progressAttribute.array[particleIndex]
            const speed = speedAttribute.array[particleIndex]

            progressValue += delta * props.particleSpeed * speed * speedMultiplier * 0.1
            if (progressValue > 1) {
                progressValue = progressValue % 1
            }

            progressAttribute.array[particleIndex] = progressValue
            const point = sampleThreadPosition(thread.geometry, progressValue)
            positionAttribute.array[particleIndex * 3] = point.x
            positionAttribute.array[particleIndex * 3 + 1] = point.y
            positionAttribute.array[particleIndex * 3 + 2] = point.z
            particleIndex++
        }
    })

    positionAttribute.needsUpdate = true
    progressAttribute.needsUpdate = true
}

const updateWaveAnimation = (elapsed: number) => {
    if (!props.animationEnabled) {
        return
    }

    const time = elapsed * props.animationSpeed

    threads.value.forEach((thread) => {
        for (let ring = 0; ring <= thread.tubeSegments; ring++) {
            const progress = ring / thread.tubeSegments
            const amplitudeFalloff = progress * progress
            const waveOne = Math.sin(progress * Math.PI * props.animationFrequency + time + thread.offset * Math.PI * 2)
            const waveTwo = Math.cos(progress * Math.PI * props.animationFrequency * 1.3 + time * 0.7 + thread.offset * Math.PI * 2)
            const { perp1, perp2 } = thread.perpVectors[ring]
            const amplitude = props.animationAmplitude * amplitudeFalloff

            if (!thread.waveOffsets[ring]) {
                thread.waveOffsets[ring] = new THREE.Vector3()
            }

            thread.waveOffsets[ring].set(
                perp1.x * waveOne * amplitude + perp2.x * waveTwo * amplitude,
                perp1.y * waveOne * amplitude + perp2.y * waveTwo * amplitude,
                perp1.z * waveOne * amplitude + perp2.z * waveTwo * amplitude,
            )
        }
    })
}

const applyWaveAnimation = () => {
    threads.value.forEach((thread) => {
        if (thread.needsUpdate || !thread.waveOffsets.length) {
            return
        }

        const positionAttribute = thread.geometry.attributes.position

        for (let ring = 0; ring <= thread.tubeSegments; ring++) {
            const waveOffset = thread.waveOffsets[ring]
            const ringStart = ring * verticesPerRing
            const ringEnd = ringStart + verticesPerRing

            for (let vertexIndex = ringStart; vertexIndex < ringEnd; vertexIndex++) {
                const arrayIndex = vertexIndex * 3
                positionAttribute.array[arrayIndex] = thread.originalPositions[arrayIndex] + waveOffset.x
                positionAttribute.array[arrayIndex + 1] = thread.originalPositions[arrayIndex + 1] + waveOffset.y
                positionAttribute.array[arrayIndex + 2] = thread.originalPositions[arrayIndex + 2] + waveOffset.z
            }
        }

        positionAttribute.needsUpdate = true
    })
}

const resetThreadToOriginal = (thread: ThreadState) => {
    const positionAttribute = thread.geometry.attributes.position
    let changed = false

    for (let ring = 0; ring <= thread.tubeSegments; ring++) {
        const waveOffset = props.animationEnabled && thread.waveOffsets[ring]
            ? thread.waveOffsets[ring]
            : new THREE.Vector3()
        const ringStart = ring * verticesPerRing
        const ringEnd = ringStart + verticesPerRing

        for (let vertexIndex = ringStart; vertexIndex < ringEnd; vertexIndex++) {
            const arrayIndex = vertexIndex * 3
            const targetX = thread.originalPositions[arrayIndex] + waveOffset.x
            const targetY = thread.originalPositions[arrayIndex + 1] + waveOffset.y
            const targetZ = thread.originalPositions[arrayIndex + 2] + waveOffset.z

            const deltaX = (targetX - positionAttribute.array[arrayIndex]) * props.repulsionSmoothness
            const deltaY = (targetY - positionAttribute.array[arrayIndex + 1]) * props.repulsionSmoothness
            const deltaZ = (targetZ - positionAttribute.array[arrayIndex + 2]) * props.repulsionSmoothness

            if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001 || Math.abs(deltaZ) > 0.0001) {
                positionAttribute.array[arrayIndex] += deltaX
                positionAttribute.array[arrayIndex + 1] += deltaY
                positionAttribute.array[arrayIndex + 2] += deltaZ
                changed = true
            }
        }
    }

    positionAttribute.needsUpdate = true
    thread.needsUpdate = changed
}

const deformThreadWithRay = (thread: ThreadState, ray: THREE.Ray) => {
    const positionAttribute = thread.geometry.attributes.position
    const threadCenter = thread.curve.getPointAt(0.5)
    const closestToCenter = new THREE.Vector3()
    ray.closestPointToPoint(threadCenter, closestToCenter)
    const centerDistance = threadCenter.distanceTo(closestToCenter)

    if (centerDistance > props.mouseRepulsionRadius * 2) {
        if (thread.needsUpdate) {
            resetThreadToOriginal(thread)
        }
        if (props.mouseGlowEnabled) {
            thread.targetOpacity = thread.baseOpacity
        }
        return
    }

    let changed = false
    let maxInfluence = 0

    for (let ring = 0; ring <= thread.tubeSegments; ring++) {
        const progress = ring / thread.tubeSegments
        const curvePoint = thread.curve.getPointAt(progress)
        const closestPoint = new THREE.Vector3()
        ray.closestPointToPoint(curvePoint, closestPoint)
        const distance = curvePoint.distanceTo(closestPoint)
        let offset = new THREE.Vector3()

        if (distance < props.mouseRepulsionRadius) {
            const repulsionDirection = new THREE.Vector3().subVectors(curvePoint, closestPoint).normalize()
            const falloff = Math.pow(1 - distance / props.mouseRepulsionRadius, 2)
            const threadFalloff = Math.sin(progress * Math.PI)
            const strength = props.mouseRepulsionStrength * falloff * threadFalloff
            offset = repulsionDirection.multiplyScalar(strength)
            maxInfluence = Math.max(maxInfluence, falloff)
        }

        const waveOffset = props.animationEnabled && thread.waveOffsets[ring]
            ? thread.waveOffsets[ring]
            : new THREE.Vector3()
        const ringStart = ring * verticesPerRing
        const ringEnd = ringStart + verticesPerRing

        for (let vertexIndex = ringStart; vertexIndex < ringEnd; vertexIndex++) {
            const arrayIndex = vertexIndex * 3
            const targetX = thread.originalPositions[arrayIndex] + offset.x + waveOffset.x
            const targetY = thread.originalPositions[arrayIndex + 1] + offset.y + waveOffset.y
            const targetZ = thread.originalPositions[arrayIndex + 2] + offset.z + waveOffset.z

            const deltaX = (targetX - positionAttribute.array[arrayIndex]) * props.repulsionSmoothness
            const deltaY = (targetY - positionAttribute.array[arrayIndex + 1]) * props.repulsionSmoothness
            const deltaZ = (targetZ - positionAttribute.array[arrayIndex + 2]) * props.repulsionSmoothness

            if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001 || Math.abs(deltaZ) > 0.0001) {
                positionAttribute.array[arrayIndex] += deltaX
                positionAttribute.array[arrayIndex + 1] += deltaY
                positionAttribute.array[arrayIndex + 2] += deltaZ
                changed = true
            }
        }
    }

    if (props.mouseGlowEnabled) {
        thread.targetOpacity = maxInfluence > 0
            ? thread.baseOpacity + (props.mouseGlowOpacity - thread.baseOpacity) * maxInfluence
            : thread.baseOpacity
    }

    if (changed) {
        positionAttribute.needsUpdate = true
        thread.needsUpdate = true
    }
}

const updateMouseRepulsion = () => {
    if (!props.mouseRepulsionEnabled || !camera.value) {
        threads.value.forEach((thread) => {
            if (thread.needsUpdate) {
                resetThreadToOriginal(thread)
            }
            thread.targetOpacity = thread.baseOpacity
        })
        return
    }

    if (pointer.x > 1.5 || pointer.y > 1.5) {
        threads.value.forEach((thread) => {
            if (thread.needsUpdate) {
                resetThreadToOriginal(thread)
            }
            thread.targetOpacity = thread.baseOpacity
        })
        return
    }

    raycaster.setFromCamera(pointer, camera.value)
    threads.value.forEach((thread) => {
        deformThreadWithRay(thread, raycaster.ray)
    })
}

const updateGlowOpacity = () => {
    threads.value.forEach((thread) => {
        const delta = thread.targetOpacity - thread.currentOpacity
        if (Math.abs(delta) > 0.001) {
            thread.currentOpacity += delta * props.glowTransitionSpeed
            thread.material.opacity = thread.currentOpacity
        }
    })
}

const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
}

const onPointerLeave = () => {
    pointer.set(2, 2)
}

const onPointerDown = () => {
    pointerIsDown = true
}

const onPointerUp = () => {
    pointerIsDown = false
}

onMounted(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('pointercancel', onPointerLeave)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
})

watch(
    () => [
        props.clusterCount,
        props.threadsPerCluster,
        props.threadRadiusMin,
        props.threadRadiusMax,
        props.minLength,
        props.maxLength,
        props.startRadiusMin,
        props.startRadiusMax,
        props.waveAmplitude,
        props.waveFrequency,
        props.clusterSpread,
        props.seed,
    ],
    () => {
        buildThreads()
    },
    { immediate: true },
)

watch(
    () => [props.particlesPerThread],
    () => {
        createThreadParticles()
    },
)

watchEffect(() => {
    threads.value.forEach((thread) => {
        updateThreadMaterialState(thread)
    })

    if (particlePoints.value) {
        particlePoints.value.visible = props.visible && props.particlesVisible
    }

    if (particleMaterial) {
        particleMaterial.uniforms.uSize.value = props.particleSize
        particleMaterial.uniforms.uColor1.value.set(props.particleColor1)
        particleMaterial.uniforms.uColor2.value.set(props.particleColor2)
    }
})

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta, elapsed }) => {
    speedMultiplier += ((pointerIsDown ? 3 : 1) - speedMultiplier) * Math.min(delta * 4, 1)

    updateWaveAnimation(elapsed)
    if (props.animationEnabled) {
        applyWaveAnimation()
    }
    updateMouseRepulsion()
    updateGlowOpacity()
    updateThreadParticles(delta, elapsed)
})

onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('pointercancel', onPointerLeave)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    disposeThreads()
    disposeParticles()
})
</script>
