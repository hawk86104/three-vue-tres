<!--
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-03-31 15:24:12
 * @LastEditors: Codex
 * @LastEditTime: 2026-03-31 15:24:12
-->
<script setup lang="ts">
import * as THREE from 'three'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import { watchEffect, onUnmounted } from 'vue'
import { useLoop } from '@tresjs/core'
import { liquidMetalFragmentShader, liquidMetalVertexShader } from './shaders'
import {
    liquidMetalMaterialControlGroups,
    liquidMetalMaterialDefaults,
    liquidMetalMaterialSchema,
    type LiquidMetalMaterialProps,
} from './controls'

const props = withDefaults(defineProps<LiquidMetalMaterialProps>(), liquidMetalMaterialDefaults)

const uniforms = {
    uTime: { value: 0 },
    uLiquidMetalIntensity: { value: props.liquidMetalIntensity },
    uNormalStrength: { value: props.normalStrength },
    uDisplacementStrength: { value: props.displacementStrength },
    uFresnelStrength: { value: props.fresnelStrength },
    uScale: { value: props.uScale },
    uShapeReactivity: { value: props.uShapeReactivity },
    uDistortion: { value: props.uDistortion },
    uEdgeProtection: { value: props.uEdgeProtection },
}

const material = new CustomShaderMaterial({
    baseMaterial: THREE.MeshPhysicalMaterial,
    vertexShader: liquidMetalVertexShader,
    fragmentShader: liquidMetalFragmentShader,
    uniforms,
    color: props.color,
    emissive: props.emissive,
    emissiveIntensity: props.emissiveIntensity,
    metalness: props.metalness,
    roughness: props.roughness,
    clearcoat: Math.max(props.clearcoat, 0.0001),
    clearcoatRoughness: props.clearcoatRoughness,
    envMapIntensity: props.envMapIntensity,
    ior: props.ior,
    specularIntensity: props.specularIntensity,
    iridescence: Math.max(props.iridescence, 0.0001),
    iridescenceIOR: props.iridescenceIOR,
    iridescenceThicknessRange: [props.iridescenceThicknessMin, props.iridescenceThicknessMax],
}) as THREE.MeshPhysicalMaterial & {
    uniforms: typeof uniforms
}

material.userData.uScale = material.uniforms.uScale
material.userData.uShapeReactivity = material.uniforms.uShapeReactivity
material.userData.uDistortion = material.uniforms.uDistortion
material.userData.uEdgeProtection = material.uniforms.uEdgeProtection

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
    material.uniforms.uTime.value = elapsed
})

watchEffect(() => {
    material.color.setStyle(props.color)
    material.emissive.setStyle(props.emissive)
    material.emissiveIntensity = props.emissiveIntensity
    material.metalness = props.metalness
    material.roughness = props.roughness
    material.clearcoat = Math.max(props.clearcoat, 0.0001)
    material.clearcoatRoughness = props.clearcoatRoughness
    material.envMapIntensity = props.envMapIntensity
    material.ior = props.ior
    material.specularIntensity = props.specularIntensity
    material.iridescence = Math.max(props.iridescence, 0.0001)
    material.iridescenceIOR = props.iridescenceIOR
    material.iridescenceThicknessRange = [
        Math.min(props.iridescenceThicknessMin, props.iridescenceThicknessMax),
        Math.max(props.iridescenceThicknessMin, props.iridescenceThicknessMax),
    ]

    material.uniforms.uLiquidMetalIntensity.value = props.liquidMetalIntensity
    material.uniforms.uNormalStrength.value = props.normalStrength
    material.uniforms.uDisplacementStrength.value = props.displacementStrength
    material.uniforms.uFresnelStrength.value = props.fresnelStrength
    material.uniforms.uScale.value = props.uScale
    material.uniforms.uShapeReactivity.value = props.uShapeReactivity
    material.uniforms.uDistortion.value = props.uDistortion
    material.uniforms.uEdgeProtection.value = props.uEdgeProtection
})

onUnmounted(() => {
    material.dispose()
})

defineExpose({
    root: material,
    constructor: THREE.MeshPhysicalMaterial,
    defaults: liquidMetalMaterialDefaults,
    controlGroups: liquidMetalMaterialControlGroups,
    schema: liquidMetalMaterialSchema,
    dispose: () => material.dispose(),
})
</script>

<template>
    <primitive :object="material" />
</template>
