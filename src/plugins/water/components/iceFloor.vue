<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-07-22 10:03:17
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-30 10:02:03
-->
<template>
    <TresGroup>
        <TresMesh :rotate-x="-Math.PI / 2">
            <TresPlaneGeometry :args="[40, 40]" />
            <CustomShaderMaterial
                :baseMaterial="THREE.MeshPhysicalMaterial"
                :vertexShader="iceVertex"
                :fragmentShader="iceFragment"
                :uniforms="uniforms"
                :side="THREE.DoubleSide"
                :roughness="0.14"
                :metalness="0.02"
                :clearcoat="0.25"
                :clearcoatRoughness="0.18"
                transparent
                silent
            />
        </TresMesh>
    </TresGroup>
</template>
<script setup lang="ts">
import * as THREE from 'three'
import { watch } from 'vue'
import { CustomShaderMaterial } from '@tresjs/cientos'
import { useTextures } from 'PLS/basic'
import iceVertex from '../shaders/ice/vertex.glsl'
import iceFragment from '../shaders/ice/fragment.glsl'

const props = defineProps({
    uParallaxDistance: {
        default: 1.0, // 视觉差强度
    },
    uTintColor: {
        default: '#666666', // 偏色，默认白色
    },
    uTintStrength: {
        default: 0.1, // 偏色强度
    },
    uStyle: {
        default: 1,
    },
})

const imgList = Array.from({ length: 7 }, (_, i) => `./plugins/water/images/textures/${i + 1}.png`)
imgList.push('./plugins/water/images/textures/super-perlin.png')

const pTexture = await useTextures(imgList)
pTexture.forEach((texture: THREE.Texture) => {
    texture.colorSpace = THREE.LinearSRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
})

const uniforms = {
    uTrailMap: { value: null },
    uCracksMap: new THREE.Uniform(pTexture[props.uStyle]),
    uPerlin: new THREE.Uniform(pTexture[7]),
    uParallaxDistance: { value: props.uParallaxDistance }, //  视觉差
    uTintColor: { value: new THREE.Color(props.uTintColor) }, // 偏色，默认白色
    uTintStrength: { value: props.uTintStrength }, // 偏色强
}

watch(
    () => [props.uParallaxDistance, props.uTintColor, props.uTintStrength, props.uStyle],
    ([newParallaxDistance, newTintColor, newTintStrength, newStyle]: any) => {
        uniforms.uParallaxDistance.value = newParallaxDistance
        uniforms.uTintColor.value.set(newTintColor)
        uniforms.uTintStrength.value = newTintStrength
        uniforms.uCracksMap.value = pTexture[newStyle]
    },
)
</script>
