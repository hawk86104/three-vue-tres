<template>
    <TresGroup>
        <primitive v-if="threadMesh" :object="threadMesh" />
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
    originalPositions: Float32Array
    originalCenters: Float32Array
    currentCenters: Float32Array
    waveOffsets: Float32Array
    tubeSegments: number
    perpVectors: Array<{ perp1: THREE.Vector3; perp2: THREE.Vector3 }>
    offset: number
    needsUpdate: boolean
    opacityFactor: number
    baseOpacity: number
    targetOpacity: number
    currentOpacity: number
    positionOffset: number
    vertexCount: number
    alphaOffset: number
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
const threadMesh = shallowRef<THREE.Mesh | null>(null)
const particlePoints = shallowRef<THREE.Points | null>(null)

let threadGeometry: THREE.BufferGeometry | null = null
let threadMaterial: THREE.ShaderMaterial | null = null
let threadPositionAttribute: THREE.BufferAttribute | null = null
let threadAlphaAttribute: THREE.BufferAttribute | null = null
let threadPositionArray: Float32Array | null = null
let threadAlphaArray: Float32Array | null = null
let particleGeometry: THREE.BufferGeometry | null = null
let particleMaterial: THREE.ShaderMaterial | null = null
let pointerIsDown = false
let pointerDirty = false
let mouseUpdateCooldown = 0
let speedMultiplier = 1
const pointPixelRatio = Math.min(window.devicePixelRatio || 1, 1.25)

const pointer = new THREE.Vector2(2, 2)
const raycaster = new THREE.Raycaster()
const { camera } = useTres()

const curveSegments = 72
const tubeSegments = 32
const radialSegments = 5
const verticesPerRing = radialSegments + 1
const rayPoint = new THREE.Vector3()
const rayClosestPoint = new THREE.Vector3()
const rayDirection = new THREE.Vector3()
const tempCenterA = new THREE.Vector3()
const tempCenterB = new THREE.Vector3()
const tempCurvePoint = new THREE.Vector3()

const getCenterValue = (centers: Float32Array, index: number, target: THREE.Vector3) => {
    const base = index * 3
    target.set(centers[base], centers[base + 1], centers[base + 2])
    return target
}

const setCenterValue = (
    centers: Float32Array,
    index: number,
    x: number,
    y: number,
    z: number,
) => {
    const base = index * 3
    centers[base] = x
    centers[base + 1] = y
    centers[base + 2] = z
}

const fillThreadAlpha = (thread: ThreadState, opacity: number) => {
    if (!threadAlphaArray) {
        return false
    }

    threadAlphaArray.fill(opacity, thread.alphaOffset, thread.alphaOffset + thread.vertexCount)
    return true
}

const updateThreadMaterialState = (thread: ThreadState) => {
    const previousOpacity = thread.currentOpacity
    thread.baseOpacity = props.opacity * thread.opacityFactor

    if (!props.mouseGlowEnabled) {
        thread.currentOpacity = thread.baseOpacity
        thread.targetOpacity = thread.baseOpacity
    } else {
        thread.currentOpacity = Math.max(thread.currentOpacity, thread.baseOpacity)
        thread.targetOpacity = Math.max(thread.targetOpacity, thread.baseOpacity)
    }

    return Math.abs(thread.currentOpacity - previousOpacity) > 0.0001
        ? fillThreadAlpha(thread, thread.currentOpacity)
        : false
}

const disposeThreads = () => {
    threadMesh.value = null
    threadGeometry?.dispose()
    threadMaterial?.dispose()
    threadGeometry = null
    threadMaterial = null
    threadPositionAttribute = null
    threadAlphaAttribute = null
    threadPositionArray = null
    threadAlphaArray = null
    threads.value = []
}

const disposeParticles = () => {
    particleGeometry?.dispose()
    particleMaterial?.dispose()
    particleGeometry = null
    particleMaterial = null
    particlePoints.value = null
}

const getPerpVectors = (curve: THREE.CatmullRomCurve3, totalSegments: number) => {
    const vectors: Array<{ perp1: THREE.Vector3; perp2: THREE.Vector3 }> = []

    for (let index = 0; index <= totalSegments; index++) {
        const t = index / totalSegments
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
        vectors.push({ perp1, perp2 })
    }

    return vectors
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

    const radius = randomRange(random, props.threadRadiusMin, props.threadRadiusMax)
    const geometry = new THREE.TubeGeometry(curve, tubeSegments, radius, radialSegments, false)
    const opacityFactor = randomRange(random, 0.6, 1)
    const baseOpacity = props.opacity * opacityFactor
    const ringCount = tubeSegments + 1
    const originalCenters = new Float32Array(ringCount * 3)

    for (let index = 0; index < ringCount; index++) {
        const point = curve.getPointAt(index / tubeSegments)
        setCenterValue(originalCenters, index, point.x, point.y, point.z)
    }

    return {
        geometry,
        state: {
            id,
            originalPositions: new Float32Array(geometry.attributes.position.array),
            originalCenters,
            currentCenters: originalCenters.slice(),
            waveOffsets: new Float32Array(ringCount * 3),
            tubeSegments,
            perpVectors: getPerpVectors(curve, tubeSegments),
            offset: random(),
            needsUpdate: false,
            opacityFactor,
            baseOpacity,
            targetOpacity: baseOpacity,
            currentOpacity: baseOpacity,
            positionOffset: 0,
            vertexCount: 0,
            alphaOffset: 0,
        } satisfies ThreadState,
    }
}

const buildThreads = () => {
    disposeThreads()
    disposeParticles()

    const random = createSeededRandom(props.seed)
    const builds: Array<{ geometry: THREE.TubeGeometry; state: ThreadState }> = []
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
            builds.push(
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

    if (!builds.length) {
        return
    }

    const totalVertexCount = builds.reduce((sum, item) => sum + item.geometry.attributes.position.count, 0)
    const totalIndexCount = builds.reduce((sum, item) => sum + (item.geometry.index?.count ?? 0), 0)
    const IndexArrayType = totalVertexCount > 65535 ? Uint32Array : Uint16Array
    const mergedIndices = new IndexArrayType(totalIndexCount)

    threadPositionArray = new Float32Array(totalVertexCount * 3)
    threadAlphaArray = new Float32Array(totalVertexCount)

    let vertexCursor = 0
    let positionCursor = 0
    let indexCursor = 0

    builds.forEach(({ geometry, state }) => {
        const positionAttribute = geometry.attributes.position as THREE.BufferAttribute
        const localPositions = positionAttribute.array as Float32Array
        const indexAttribute = geometry.index

        state.positionOffset = positionCursor
        state.alphaOffset = vertexCursor
        state.vertexCount = positionAttribute.count

        threadPositionArray?.set(localPositions, positionCursor)
        threadAlphaArray?.fill(state.currentOpacity, vertexCursor, vertexCursor + positionAttribute.count)

        if (indexAttribute) {
            const localIndices = indexAttribute.array as ArrayLike<number>
            for (let index = 0; index < indexAttribute.count; index++) {
                mergedIndices[indexCursor + index] = localIndices[index] + vertexCursor
            }
            indexCursor += indexAttribute.count
        }

        geometry.dispose()
        vertexCursor += positionAttribute.count
        positionCursor += localPositions.length
    })

    threadGeometry = new THREE.BufferGeometry()
    threadPositionAttribute = new THREE.BufferAttribute(threadPositionArray, 3)
    threadPositionAttribute.setUsage(THREE.DynamicDrawUsage)
    threadAlphaAttribute = new THREE.BufferAttribute(threadAlphaArray, 1)
    threadAlphaAttribute.setUsage(THREE.DynamicDrawUsage)
    threadGeometry.setAttribute('position', threadPositionAttribute)
    threadGeometry.setAttribute('aAlpha', threadAlphaAttribute)
    threadGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1))
    threadGeometry.computeBoundingSphere()

    threadMaterial = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(props.color) } },
        vertexShader: `
            attribute float aAlpha;
            varying float vAlpha;
            void main() {
                vAlpha = aAlpha;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                gl_FragColor = vec4(uColor, vAlpha);
            }
        `,
        transparent: true,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
    })

    const mesh = new THREE.Mesh(threadGeometry, threadMaterial)
    mesh.frustumCulled = false
    mesh.renderOrder = 12
    mesh.visible = props.visible
    threadMesh.value = mesh
    threads.value = builds.map((item) => item.state)
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
    const positionAttribute = new THREE.BufferAttribute(positions, 3)
    positionAttribute.setUsage(THREE.DynamicDrawUsage)
    const progressAttribute = new THREE.BufferAttribute(progress, 1)
    progressAttribute.setUsage(THREE.DynamicDrawUsage)

    particleGeometry.setAttribute('position', positionAttribute)
    particleGeometry.setAttribute('aProgress', progressAttribute)
    particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    particleGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSize: { value: props.particleSize },
            uPixelRatio: { value: pointPixelRatio },
            uColor1: { value: new THREE.Color(props.particleColor1) },
            uColor2: { value: new THREE.Color(props.particleColor2) },
        },
        vertexShader: `
            uniform float uTime;
            uniform float uSize;
            uniform float uPixelRatio;
            attribute float aProgress;
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
    nextPoints.renderOrder = 13
    particlePoints.value = nextPoints
}

const sampleThreadCenter = (centers: Float32Array, progressValue: number, target: THREE.Vector3) => {
    const exactSegment = progressValue * tubeSegments
    const segmentIndex = Math.floor(exactSegment)
    const segmentProgress = exactSegment - segmentIndex
    const nextIndex = Math.min(segmentIndex + 1, tubeSegments)

    getCenterValue(centers, segmentIndex, tempCenterA)
    getCenterValue(centers, nextIndex, tempCenterB)
    target.copy(tempCenterA).lerp(tempCenterB, segmentProgress)
    return target
}

const updateThreadParticles = (delta: number, elapsed: number) => {
    if (!particleGeometry || !particleMaterial || !particlePoints.value || !props.particlesVisible) {
        return
    }

    const positionAttribute = particleGeometry.getAttribute('position') as THREE.BufferAttribute
    const progressAttribute = particleGeometry.getAttribute('aProgress') as THREE.BufferAttribute
    const speedAttribute = particleGeometry.getAttribute('aSpeed') as THREE.BufferAttribute
    const positionArray = positionAttribute.array as Float32Array
    const progressArray = progressAttribute.array as Float32Array
    const speedArray = speedAttribute.array as Float32Array

    particleMaterial.uniforms.uTime.value = elapsed
    let particleIndex = 0

    threads.value.forEach((thread) => {
        for (let index = 0; index < props.particlesPerThread; index++) {
            let progressValue = progressArray[particleIndex]
            const speed = speedArray[particleIndex]
            progressValue += delta * props.particleSpeed * speed * speedMultiplier * 0.1
            if (progressValue > 1) {
                progressValue = progressValue % 1
            }
            progressArray[particleIndex] = progressValue
            sampleThreadCenter(thread.currentCenters, progressValue, tempCurvePoint)
            positionArray[particleIndex * 3] = tempCurvePoint.x
            positionArray[particleIndex * 3 + 1] = tempCurvePoint.y
            positionArray[particleIndex * 3 + 2] = tempCurvePoint.z
            particleIndex++
        }
    })

    positionAttribute.needsUpdate = true
    progressAttribute.needsUpdate = true
}

const applyWaveAnimation = (elapsed: number) => {
    if (!threadPositionArray) {
        return
    }

    const time = elapsed * props.animationSpeed
    let geometryChanged = false

    threads.value.forEach((thread) => {
        let localChanged = false

        for (let ring = 0; ring <= thread.tubeSegments; ring++) {
            const centerBase = ring * 3
            let offsetX = 0
            let offsetY = 0
            let offsetZ = 0

            if (props.animationEnabled) {
                const progress = ring / thread.tubeSegments
                const amplitudeFalloff = progress * progress
                const waveOne = Math.sin(progress * Math.PI * props.animationFrequency + time + thread.offset * Math.PI * 2)
                const waveTwo = Math.cos(progress * Math.PI * props.animationFrequency * 1.3 + time * 0.7 + thread.offset * Math.PI * 2)
                const { perp1, perp2 } = thread.perpVectors[ring]
                const amplitude = props.animationAmplitude * amplitudeFalloff

                offsetX = perp1.x * waveOne * amplitude + perp2.x * waveTwo * amplitude
                offsetY = perp1.y * waveOne * amplitude + perp2.y * waveTwo * amplitude
                offsetZ = perp1.z * waveOne * amplitude + perp2.z * waveTwo * amplitude
            }

            thread.waveOffsets[centerBase] = offsetX
            thread.waveOffsets[centerBase + 1] = offsetY
            thread.waveOffsets[centerBase + 2] = offsetZ
            setCenterValue(
                thread.currentCenters,
                ring,
                thread.originalCenters[centerBase] + offsetX,
                thread.originalCenters[centerBase + 1] + offsetY,
                thread.originalCenters[centerBase + 2] + offsetZ,
            )

            if (!thread.needsUpdate) {
                const ringStart = ring * verticesPerRing
                const ringEnd = ringStart + verticesPerRing
                for (let vertexIndex = ringStart; vertexIndex < ringEnd; vertexIndex++) {
                    const arrayIndex = vertexIndex * 3
                    const globalIndex = thread.positionOffset + arrayIndex
                    threadPositionArray[globalIndex] = thread.originalPositions[arrayIndex] + offsetX
                    threadPositionArray[globalIndex + 1] = thread.originalPositions[arrayIndex + 1] + offsetY
                    threadPositionArray[globalIndex + 2] = thread.originalPositions[arrayIndex + 2] + offsetZ
                }
                localChanged = true
            }
        }

        if (localChanged) {
            geometryChanged = true
        }
    })

    if (geometryChanged && threadPositionAttribute) {
        threadPositionAttribute.needsUpdate = true
    }
}

const resetThreadToWave = (thread: ThreadState) => {
    if (!threadPositionArray) {
        return
    }

    let changed = false

    for (let ring = 0; ring <= thread.tubeSegments; ring++) {
        const centerBase = ring * 3
        const targetCenterX = thread.originalCenters[centerBase] + thread.waveOffsets[centerBase]
        const targetCenterY = thread.originalCenters[centerBase + 1] + thread.waveOffsets[centerBase + 1]
        const targetCenterZ = thread.originalCenters[centerBase + 2] + thread.waveOffsets[centerBase + 2]
        setCenterValue(thread.currentCenters, ring, targetCenterX, targetCenterY, targetCenterZ)

        const ringStart = ring * verticesPerRing
        const ringEnd = ringStart + verticesPerRing
        for (let vertexIndex = ringStart; vertexIndex < ringEnd; vertexIndex++) {
            const arrayIndex = vertexIndex * 3
            const globalIndex = thread.positionOffset + arrayIndex
            const targetX = thread.originalPositions[arrayIndex] + thread.waveOffsets[centerBase]
            const targetY = thread.originalPositions[arrayIndex + 1] + thread.waveOffsets[centerBase + 1]
            const targetZ = thread.originalPositions[arrayIndex + 2] + thread.waveOffsets[centerBase + 2]
            const deltaX = (targetX - threadPositionArray[globalIndex]) * props.repulsionSmoothness
            const deltaY = (targetY - threadPositionArray[globalIndex + 1]) * props.repulsionSmoothness
            const deltaZ = (targetZ - threadPositionArray[globalIndex + 2]) * props.repulsionSmoothness

            if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001 || Math.abs(deltaZ) > 0.0001) {
                threadPositionArray[globalIndex] += deltaX
                threadPositionArray[globalIndex + 1] += deltaY
                threadPositionArray[globalIndex + 2] += deltaZ
                changed = true
            }
        }
    }

    if (threadPositionAttribute) {
        threadPositionAttribute.needsUpdate = true
    }
    thread.needsUpdate = changed
}

const deformThreadWithRay = (thread: ThreadState, ray: THREE.Ray) => {
    if (!threadPositionArray) {
        return
    }

    const middleIndex = Math.floor(thread.tubeSegments * 0.5)
    getCenterValue(thread.currentCenters, middleIndex, rayPoint)
    ray.closestPointToPoint(rayPoint, rayClosestPoint)
    const centerDistance = rayPoint.distanceTo(rayClosestPoint)

    if (centerDistance > props.mouseRepulsionRadius * 2) {
        if (thread.needsUpdate) {
            resetThreadToWave(thread)
        }
        if (props.mouseGlowEnabled) {
            thread.targetOpacity = thread.baseOpacity
        }
        return
    }

    let changed = false
    let maxInfluence = 0

    for (let ring = 0; ring <= thread.tubeSegments; ring++) {
        const centerBase = ring * 3
        getCenterValue(thread.currentCenters, ring, rayPoint)
        ray.closestPointToPoint(rayPoint, rayClosestPoint)
        const distance = rayPoint.distanceTo(rayClosestPoint)
        let offsetX = 0
        let offsetY = 0
        let offsetZ = 0

        if (distance < props.mouseRepulsionRadius) {
            rayDirection.subVectors(rayPoint, rayClosestPoint)
            const directionLength = rayDirection.length()
            if (directionLength > 0.00001) {
                rayDirection.multiplyScalar(1 / directionLength)
                const falloff = Math.pow(1 - distance / props.mouseRepulsionRadius, 2)
                const threadFalloff = Math.sin((ring / thread.tubeSegments) * Math.PI)
                const strength = props.mouseRepulsionStrength * falloff * threadFalloff
                offsetX = rayDirection.x * strength
                offsetY = rayDirection.y * strength
                offsetZ = rayDirection.z * strength
                maxInfluence = Math.max(maxInfluence, falloff)
            }
        }

        setCenterValue(
            thread.currentCenters,
            ring,
            thread.originalCenters[centerBase] + thread.waveOffsets[centerBase] + offsetX,
            thread.originalCenters[centerBase + 1] + thread.waveOffsets[centerBase + 1] + offsetY,
            thread.originalCenters[centerBase + 2] + thread.waveOffsets[centerBase + 2] + offsetZ,
        )

        const ringStart = ring * verticesPerRing
        const ringEnd = ringStart + verticesPerRing
        for (let vertexIndex = ringStart; vertexIndex < ringEnd; vertexIndex++) {
            const arrayIndex = vertexIndex * 3
            const globalIndex = thread.positionOffset + arrayIndex
            const targetX = thread.originalPositions[arrayIndex] + thread.waveOffsets[centerBase] + offsetX
            const targetY = thread.originalPositions[arrayIndex + 1] + thread.waveOffsets[centerBase + 1] + offsetY
            const targetZ = thread.originalPositions[arrayIndex + 2] + thread.waveOffsets[centerBase + 2] + offsetZ
            const deltaX = (targetX - threadPositionArray[globalIndex]) * props.repulsionSmoothness
            const deltaY = (targetY - threadPositionArray[globalIndex + 1]) * props.repulsionSmoothness
            const deltaZ = (targetZ - threadPositionArray[globalIndex + 2]) * props.repulsionSmoothness

            if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001 || Math.abs(deltaZ) > 0.0001) {
                threadPositionArray[globalIndex] += deltaX
                threadPositionArray[globalIndex + 1] += deltaY
                threadPositionArray[globalIndex + 2] += deltaZ
                changed = true
            }
        }
    }

    if (props.mouseGlowEnabled) {
        thread.targetOpacity = maxInfluence > 0
            ? thread.baseOpacity + (props.mouseGlowOpacity - thread.baseOpacity) * maxInfluence
            : thread.baseOpacity
    }

    if (changed && threadPositionAttribute) {
        threadPositionAttribute.needsUpdate = true
        thread.needsUpdate = true
    }
}

const hasDeformedThreads = () => threads.value.some((thread) => thread.needsUpdate)

const updateMouseRepulsion = () => {
    const pointerActive = pointer.x <= 1.5 && pointer.y <= 1.5

    if (!props.mouseRepulsionEnabled || !camera.value) {
        threads.value.forEach((thread) => {
            if (thread.needsUpdate) {
                resetThreadToWave(thread)
            }
            thread.targetOpacity = thread.baseOpacity
        })
        return
    }

    if (!pointerActive) {
        threads.value.forEach((thread) => {
            if (thread.needsUpdate) {
                resetThreadToWave(thread)
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
    let alphaChanged = false

    threads.value.forEach((thread) => {
        const delta = thread.targetOpacity - thread.currentOpacity
        if (Math.abs(delta) > 0.001) {
            thread.currentOpacity += delta * props.glowTransitionSpeed
            alphaChanged = fillThreadAlpha(thread, thread.currentOpacity) || alphaChanged
        }
    })

    if (alphaChanged && threadAlphaAttribute) {
        threadAlphaAttribute.needsUpdate = true
    }
}

const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
    pointerDirty = true
}

const onPointerLeave = () => {
    pointer.set(2, 2)
    pointerDirty = true
}

const onPointerDown = () => {
    pointerIsDown = true
    pointerDirty = true
}

const onPointerUp = () => {
    pointerIsDown = false
    pointerDirty = true
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
    let alphaChanged = false

    threads.value.forEach((thread) => {
        alphaChanged = updateThreadMaterialState(thread) || alphaChanged
    })

    if (threadMesh.value) {
        threadMesh.value.visible = props.visible
    }

    if (threadMaterial) {
        threadMaterial.uniforms.uColor.value.set(props.color)
    }

    if (alphaChanged && threadAlphaAttribute) {
        threadAlphaAttribute.needsUpdate = true
    }

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
    if (!props.visible && !props.particlesVisible) {
        if (hasDeformedThreads()) {
            threads.value.forEach((thread) => {
                if (thread.needsUpdate) {
                    resetThreadToWave(thread)
                }
                thread.targetOpacity = thread.baseOpacity
            })
        }
        pointerDirty = false
        mouseUpdateCooldown = 0
        speedMultiplier += (1 - speedMultiplier) * Math.min(delta * 4, 1)
        return
    }

    speedMultiplier += ((pointerIsDown ? 3 : 1) - speedMultiplier) * Math.min(delta * 4, 1)

    if (props.visible) {
        applyWaveAnimation(elapsed)
        mouseUpdateCooldown += delta
        if (pointerDirty || hasDeformedThreads() || (pointer.x <= 1.5 && pointer.y <= 1.5 && mouseUpdateCooldown >= 1 / 30)) {
            updateMouseRepulsion()
            mouseUpdateCooldown = 0
            pointerDirty = false
        }
        updateGlowOpacity()
    }

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
