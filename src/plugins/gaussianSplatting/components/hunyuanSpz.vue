<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-04-20 11:48:27
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-20 17:13:58
-->
<template>
    <primitive :object="viewer" :rotation="[-Math.PI / 2, 0, 0]" />
</template>

<script lang="ts" setup>
import { onUnmounted } from 'vue'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import { loadSpzFromUrl } from '@spz-loader/core'
import { Float32BufferAttribute, Quaternion, Vector3 } from 'three'

const props = withDefaults(defineProps<{
    url?: string
    splatAlphaRemovalThreshold?: number
}>(), {
    url: './plugins/gaussianSplatting/model/hunyuan.spz',
    splatAlphaRemovalThreshold: 5,
})

const clampToByte = (value: number) => {
    if (!Number.isFinite(value)) {
        return 0
    }
    return Math.max(0, Math.min(255, Math.round(value)))
}

const getRotation = (rotations: Float32Array, index: number, stride: number) => {
    const base = index * stride
    const x = rotations[base] ?? 0
    const y = rotations[base + 1] ?? 0
    const z = rotations[base + 2] ?? 0
    const w = stride >= 4
        ? (rotations[base + 3] ?? 1)
        : Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))

    return new Quaternion(x, y, z, w).normalize()
}

const createSplatBuffer = async () => {
    const cloud = await loadSpzFromUrl(props.url, {
        unpackOptions: {
            coordinateSystem: 'RUB',
        },
    })

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
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w,
            clampToByte((cloud.colors[colorBase] ?? 0) * 255),
            clampToByte((cloud.colors[colorBase + 1] ?? 0) * 255),
            clampToByte((cloud.colors[colorBase + 2] ?? 0) * 255),
            clampToByte((cloud.alphas[i] ?? 0) * 255),
        ]
    }

    return GaussianSplats3D.SplatBufferGenerator
        .getStandardGenerator(props.splatAlphaRemovalThreshold, 1)
        .generateFromUncompressedSplatArray({
            sphericalHarmonicsDegree: 0,
            splatCount: splats.length,
            splats,
        })
}

const viewer = new GaussianSplats3D.DropInViewer({
    sharedMemoryForWorkers: false,
    dynamicScene: true,
})

const splatBuffer = await createSplatBuffer()
await viewer.viewer.addSplatBuffers([splatBuffer], [{}], true, false, false)

// Tres 通过 primitive 挂载时，这里补一个空的 position attribute，避免兼容问题。
if (viewer.splatMesh?.geometry && !viewer.splatMesh.geometry.getAttribute('position')) {
    viewer.splatMesh.geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
}

// const bounds = viewer.splatMesh?.boundingBox?.clone()
// if (bounds && Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.x)) {
//     const center = bounds.getCenter(new Vector3())
//     viewer.position.set(-center.x, -bounds.min.y, -center.z)
// }

onUnmounted(() => {
    void viewer.dispose()
})
</script>
