<template>
    <primitive :object="model" :visible="visible" />
</template>

<script setup lang="ts">
import { onUnmounted, watchEffect } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'

interface Props {
    model: THREE.Object3D
    visible?: boolean
    baseColor?: string
    fresnelColor?: string
    fresnelPower?: number
    fresnelIntensity?: number
    specularIntensity?: number
    specularShininess?: number
    roughness?: number
    electricColor?: string
    electricIntensity?: number
    electricSpeed?: number
    electricFrequency?: number
    lightX?: number
    lightY?: number
    lightZ?: number
}

const props = withDefaults(defineProps<Props>(), {
    visible: true,
    baseColor: '#492469',
    fresnelColor: '#b3a1cf',
    fresnelPower: 2.5,
    fresnelIntensity: 1.2,
    specularIntensity: 0.6,
    specularShininess: 32,
    roughness: 0.3,
    electricColor: '#8b5cf6',
    electricIntensity: 2.5,
    electricSpeed: 1.5,
    electricFrequency: 8,
    lightX: 2,
    lightY: 3,
    lightZ: 2,
})

const material = new THREE.ShaderMaterial({
    uniforms: {
        uBaseColor: { value: new THREE.Color(props.baseColor) },
        uFresnelColor: { value: new THREE.Color(props.fresnelColor) },
        uFresnelPower: { value: props.fresnelPower },
        uFresnelIntensity: { value: props.fresnelIntensity },
        uSpecularIntensity: { value: props.specularIntensity },
        uSpecularShininess: { value: props.specularShininess },
        uRoughness: { value: props.roughness },
        uLightPosition: { value: new THREE.Vector3(props.lightX, props.lightY, props.lightZ) },
        uTime: { value: 0 },
        uElectricColor: { value: new THREE.Color(props.electricColor) },
        uElectricIntensity: { value: props.electricIntensity },
        uElectricSpeed: { value: props.electricSpeed },
        uElectricFrequency: { value: props.electricFrequency },
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;

            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uFresnelColor;
        uniform float uFresnelPower;
        uniform float uFresnelIntensity;

        uniform float uSpecularIntensity;
        uniform float uSpecularShininess;
        uniform float uRoughness;
        uniform vec3 uLightPosition;

        uniform float uTime;
        uniform vec3 uElectricColor;
        uniform float uElectricIntensity;
        uniform float uElectricSpeed;
        uniform float uElectricFrequency;

        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;

        float specularLight(vec3 normal, vec3 viewDir, vec3 lightDir, float shininess) {
            vec3 halfVector = normalize(lightDir + viewDir);
            float specAngle = max(dot(halfVector, normal), 0.0);
            return pow(specAngle, shininess);
        }

        float fresnelLight(vec3 normal, vec3 viewDir, float power) {
            return pow(1.0 - max(dot(normal, viewDir), 0.0), power);
        }

        float ambientOcclusion(vec3 normal, vec3 viewDir) {
            float ao = dot(normal, viewDir);
            ao = smoothstep(0.0, 0.5, ao);
            return mix(0.6, 1.0, ao);
        }

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            vec3 worldNormal = normalize(vWorldNormal);
            vec3 lightDir = normalize(uLightPosition - vWorldPosition);

            float diffuse = max(dot(worldNormal, lightDir), 0.0);
            diffuse = mix(0.28, 1.0, diffuse);

            float ao = ambientOcclusion(normal, viewDir);
            vec3 color = uBaseColor * diffuse * ao;

            float spec = specularLight(worldNormal, normalize(cameraPosition - vWorldPosition), lightDir, uSpecularShininess);
            spec *= 1.0 - uRoughness;
            color += vec3(1.0) * spec * uSpecularIntensity;

            float fresnelValue = fresnelLight(normal, viewDir, uFresnelPower);
            color += uFresnelColor * fresnelValue * uFresnelIntensity;
            color += vec3(1.0) * pow(fresnelValue, 3.0) * 0.24;

            float wave1 = sin(vWorldPosition.y * uElectricFrequency + uTime * uElectricSpeed) * 0.5 + 0.5;
            float wave2 = sin(vWorldPosition.x * uElectricFrequency * 1.3 - uTime * uElectricSpeed * 0.8) * 0.5 + 0.5;
            float wave3 = sin(vWorldPosition.z * uElectricFrequency * 0.7 + uTime * uElectricSpeed * 1.2) * 0.5 + 0.5;

            float electricPulse = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;
            electricPulse = pow(electricPulse, 2.0);

            float electricHighlight = pow(pow(fresnelValue, 1.5) * electricPulse, 0.8);
            vec3 electricGlow = uElectricColor * electricHighlight * uElectricIntensity;
            electricGlow += vec3(1.0, 0.9, 0.8) * pow(electricHighlight, 3.0) * 1.8;

            gl_FragColor = vec4(color + electricGlow, 1.0);
        }
    `,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
})

props.model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
        child.material = material
        child.castShadow = true
        child.receiveShadow = true
    }
})

watchEffect(() => {
    props.model.visible = props.visible
    material.uniforms.uBaseColor.value.set(props.baseColor)
    material.uniforms.uFresnelColor.value.set(props.fresnelColor)
    material.uniforms.uFresnelPower.value = props.fresnelPower
    material.uniforms.uFresnelIntensity.value = props.fresnelIntensity
    material.uniforms.uSpecularIntensity.value = props.specularIntensity
    material.uniforms.uSpecularShininess.value = props.specularShininess
    material.uniforms.uRoughness.value = props.roughness
    material.uniforms.uElectricColor.value.set(props.electricColor)
    material.uniforms.uElectricIntensity.value = props.electricIntensity
    material.uniforms.uElectricSpeed.value = props.electricSpeed
    material.uniforms.uElectricFrequency.value = props.electricFrequency
    material.uniforms.uLightPosition.value.set(props.lightX, props.lightY, props.lightZ)
})

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
    material.uniforms.uTime.value = elapsed
})

onUnmounted(() => {
    material.dispose()
})
</script>
