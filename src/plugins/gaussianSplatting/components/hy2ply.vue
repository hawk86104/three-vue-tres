<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-06-15 10:12:29
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-20 10:37:43
-->
<template>
    <primitive :object="toRaw(modelGroup)" :rotation="[-Math.PI / 2, 0, 0]"  />
</template>
<script lang="ts" setup>
import { onUnmounted, toRaw } from 'vue'
import { useLoader } from 'PLS/basic'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader'
import {
    BufferGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Vector3,
} from 'three'

const sourceGeometry = await useLoader((PLYLoader as any), 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.ply') as BufferGeometry
const geometry = sourceGeometry.clone()

geometry.computeBoundingBox()
geometry.computeVertexNormals()

const bounds = geometry.boundingBox?.clone()
const center = bounds?.getCenter(new Vector3()) ?? new Vector3()
const hasVertexColors = !!geometry.getAttribute('color')

const surfaceMaterial = new MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: hasVertexColors,
    roughness: 0.92,
    metalness: 0.03,
    flatShading: true,
    side: DoubleSide,
})

const structureMaterial = new MeshBasicMaterial({
    color: '#0f172a',
    wireframe: true,
    transparent: true,
    opacity: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
})

const mesh = new Mesh(geometry, surfaceMaterial)
mesh.castShadow = true
mesh.receiveShadow = true

const structureMesh = new Mesh(geometry, structureMaterial)
structureMesh.renderOrder = 1

const centeredGroup = new Group()
centeredGroup.name = 'hunyuanColliderMesh'
centeredGroup.add(mesh, structureMesh)

if (bounds) {
    centeredGroup.position.set(-center.x, -bounds.min.y, -center.z)
}

const modelGroup = new Group()
modelGroup.add(centeredGroup)

onUnmounted(() => {
    geometry.dispose()
    surfaceMaterial.dispose()
    structureMaterial.dispose()
})
</script>
