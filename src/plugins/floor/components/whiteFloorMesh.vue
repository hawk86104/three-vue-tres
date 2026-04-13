<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-01-25 10:23:43
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-28 16:16:46
-->

<template>
    <TresMesh :rotation-x="-Math.PI / 2" :receiveShadow="props.receiveShadow">
        <TresPlaneGeometry :args="props.size" />
        <CustomShaderMaterial
            :baseMaterial="THREE.MeshPhongMaterial"
            :uniforms="uniforms"
            :side="THREE.DoubleSide"
            :vertexShader="getVertexShader()"
            :fragmentShader="getFragmentShader()"
            transparent
            silent
        />
    </TresMesh>
</template>

<script lang="ts" setup>
import * as THREE from 'three'
import { watch } from 'vue'
import { CustomShaderMaterial, useTexture } from '@tresjs/cientos'
import { getVertexShader, getFragmentShader } from '../shaders/whiteFloor'

const props = withDefaults(
    defineProps<{
        size?: number[]
        color?: string
        shadowColor?: string
        edge?: number
        receiveShadow?: boolean
    }>(),
    {
        size: [20, 20],
        color: '#990',
        shadowColor: '#999',
        edge: 0.35,
        receiveShadow: false,
    },
)

const { state: pTexture } = useTexture('./plugins/floor/image/whiteFloor.jpg')
const uniforms = {
    uColor: { value: new THREE.Color(props.color) },
    uShadowColor: { value: new THREE.Color(props.shadowColor) },
    fEdge: { value: props.edge },
    uTexture: { value: null as THREE.Texture | null },
}

watch(
    pTexture,
    (texture) => {
        if (texture) {
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.repeat.set(6, 3)
            uniforms.uTexture.value = texture
        }
    },
)

watch(
    () => props.edge,
    (newVal) => {
        uniforms.fEdge.value = newVal
    },
)

watch(
    () => props.color,
    (newVal) => {
        uniforms.uColor.value.set(newVal)
    },
)
watch(
    () => props.shadowColor,
    (newVal) => {
        uniforms.uShadowColor.value.set(newVal)
    },
)
</script>
