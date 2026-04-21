<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-04-20 11:48:27
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-21 08:39:09
-->
<template>
    <primitive v-if="viewer" :object="viewer" :rotation="[-Math.PI / 2, 0, 0]" />
</template>

<script lang="ts" setup>
import { onUnmounted, shallowRef, watch } from 'vue'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import { loadSpzFromUrl } from '@spz-loader/core'
import { Float32BufferAttribute, Quaternion } from 'three'

const props = withDefaults(defineProps<{
    url?: string
    splatAlphaRemovalThreshold?: number
    bufferCompressionLevel?: number
    antialiasedMode?: 'auto' | 'on' | 'off'
    dynamicScene?: boolean
    sharedMemoryForWorkers?: boolean
    focalAdjustment?: number
    kernel2DSize?: number
    splatRenderMode?: 'ThreeD' | 'TwoD'
    rotationInputOrder?: 'xyzw' | 'wxyz'
}>(), {
    url: 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.spz',
    splatAlphaRemovalThreshold: 1,
    bufferCompressionLevel: 2,
    antialiasedMode: 'off',
    dynamicScene: false,
    sharedMemoryForWorkers: false,
    focalAdjustment: 1.15,
    kernel2DSize: 0.3,
    splatRenderMode: 'ThreeD',
    rotationInputOrder: 'xyzw',
})

const clampToByte = (value: number) => {
    if (!Number.isFinite(value)) {
        return 0
    }
    return Math.max(0, Math.min(255, Math.round(value)))
}

const getRotation = (rotations: Float32Array, index: number, stride: number) => {
    const base = index * stride
    const x = props.rotationInputOrder === 'wxyz' && stride >= 4
        ? (rotations[base + 1] ?? 0)
        : (rotations[base] ?? 0)
    const y = props.rotationInputOrder === 'wxyz' && stride >= 4
        ? (rotations[base + 2] ?? 0)
        : (rotations[base + 1] ?? 0)
    const z = props.rotationInputOrder === 'wxyz' && stride >= 4
        ? (rotations[base + 3] ?? 0)
        : (rotations[base + 2] ?? 0)
    const w = stride >= 4
        ? (
            props.rotationInputOrder === 'wxyz'
                ? (rotations[base] ?? 1)
                : (rotations[base + 3] ?? 1)
        )
        : Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))

    return new Quaternion(x, y, z, w).normalize()
}
const createSplatBuffer = async () => {
    const cloud = await loadSpzFromUrl(props.url, {
        unpackOptions: {
            coordinateSystem: 'RUB',
        },
    })

    const compressionLevel = Math.max(0, Math.min(2, Math.round(props.bufferCompressionLevel)))
    const rotationStride = Math.max(3, Math.floor(cloud.rotations.length / Math.max(1, cloud.numPoints)))
    const splats = new Array(cloud.numPoints)

    for (let i = 0; i < cloud.numPoints; i++) {
        const positionBase = i * 3
        const colorBase = i * 3
        const rotation = getRotation(cloud.rotations, i, rotationStride)

        splats[i] = [
            cloud.positions[positionBase],
            cloud.positions[positionBase + 1],
            cloud.positions[positionBase + 2],
            cloud.scales[positionBase],
            cloud.scales[positionBase + 1],
            cloud.scales[positionBase + 2],
            // GaussianSplats3D 的 UncompressedSplatArray 旋转槽位顺序是 w, x, y, z。
            rotation.w,
            rotation.x,
            rotation.y,
            rotation.z,
            clampToByte((cloud.colors[colorBase] ?? 0) * 255),
            clampToByte((cloud.colors[colorBase + 1] ?? 0) * 255),
            clampToByte((cloud.colors[colorBase + 2] ?? 0) * 255),
            clampToByte((cloud.alphas[i] ?? 0) * 255),
        ]
    }

    const antialiased = props.antialiasedMode === 'auto'
        ? Boolean(cloud.antialiased)
        : props.antialiasedMode === 'on'

    return {
        antialiased,
        splatBuffer: GaussianSplats3D.SplatBufferGenerator
            .getStandardGenerator(props.splatAlphaRemovalThreshold, compressionLevel)
            .generateFromUncompressedSplatArray({
                sphericalHarmonicsDegree: 0,
                splatCount: splats.length,
                splats,
            }),
    }
}

const viewer = shallowRef<GaussianSplats3D.DropInViewer | null>(null)
let loadVersion = 0

const createViewer = async () => {
    const { antialiased, splatBuffer } = await createSplatBuffer()
    const splatRenderMode = props.splatRenderMode === 'TwoD'
        ? GaussianSplats3D.SplatRenderMode.TwoD
        : GaussianSplats3D.SplatRenderMode.ThreeD

    const nextViewer = new GaussianSplats3D.DropInViewer({
        antialiased,
        dynamicScene: props.dynamicScene,
        focalAdjustment: props.focalAdjustment,
        kernel2DSize: props.kernel2DSize,
        sharedMemoryForWorkers: props.sharedMemoryForWorkers,
        splatRenderMode,
    })

    await nextViewer.viewer.addSplatBuffers([splatBuffer], [{}], true, false, false)

    // Tres 通过 primitive 挂载时，这里补一个空的 position attribute，避免兼容问题。
    if (nextViewer.splatMesh?.geometry && !nextViewer.splatMesh.geometry.getAttribute('position')) {
        nextViewer.splatMesh.geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
    }

    return nextViewer
}

const refreshViewer = async () => {
    const currentVersion = ++loadVersion
    const nextViewer = await createViewer()

    if (currentVersion !== loadVersion) {
        await nextViewer.dispose()
        return
    }

    const previousViewer = viewer.value
    viewer.value = nextViewer
    if (previousViewer) {
        await previousViewer.dispose()
    }
}

await refreshViewer()

watch([() => props.url, () => props.rotationInputOrder], () => {
    void refreshViewer()
})

// const bounds = viewer.splatMesh?.boundingBox?.clone()
// if (bounds && Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.x)) {
//     const center = bounds.getCenter(new Vector3())
//     viewer.position.set(-center.x, -bounds.min.y, -center.z)
// }

onUnmounted(() => {
    loadVersion++
    const currentViewer = viewer.value
    viewer.value = null
    if (currentViewer) {
        void currentViewer.dispose()
    }
})
</script>
