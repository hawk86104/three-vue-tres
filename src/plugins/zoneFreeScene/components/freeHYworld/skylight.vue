
<template>
    <primitive :object="sky" />
    <primitive :object="light" />
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { watch } from 'vue'
import { useTres } from '@tresjs/core'
import { Sky } from 'three/examples/jsm/objects/Sky'

const props = withDefaults(
    defineProps<{
        curTime?: number
        direct?: number
        intensity?: number
        shadowIntensity?: number
        toneMapping?: any
        toneMappingExposure?: number
    }>(),
    {
        intensity: 1.0,
        shadowIntensity: 1,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1
    },
)

const sky = new Sky()
sky.scale.setScalar(1000)
const skyUniforms = sky.material.uniforms as any
skyUniforms['turbidity'].value = 10
skyUniforms['rayleigh'].value = 1 // 2
skyUniforms['mieCoefficient'].value = 0.005
skyUniforms['mieDirectionalG'].value = 0.9

const sun = new THREE.Vector3()

const light = new THREE.DirectionalLight(0xffffff, props.intensity)
light.castShadow = true
light.shadow.mapSize.width = 2048
light.shadow.mapSize.height = 2048
light.shadow.camera.left = -50
light.shadow.camera.right = 50
light.shadow.camera.top = 50
light.shadow.camera.bottom = -50
light.shadow.radius = props.shadowIntensity

function updateSun() {
    const hour = props.curTime
    let theta // 极角，从正Y轴向下的角度（太阳在天球上的位置）
    let lightIntensity

    let azimuth = 0.15 // 太阳东西方向固定 Math.PI * 0.5

    // 白天：太阳从地平线升起 -> 中午 -> 落下
    const t = (hour - 6) / 12 // [0,1]
    const elevation = Math.PI * 0.25 * Math.sin(t * Math.PI) // 仰角最多 45°
    theta = Math.PI / 2 - elevation // 转成极角
    lightIntensity = 5 + 0.5 * Math.sin(t * Math.PI) // 亮度随中午变化

    // azimuth = Math.PI * (0.5 + t) // 从东到西
    azimuth = Math.PI * (props.direct + t) // 从北到南
    
    sun.setFromSphericalCoords(1, theta, azimuth)
    sky.material.uniforms['sunPosition'].value.copy(sun)

    light.position.copy(sun).multiplyScalar(400)
    light.intensity = lightIntensity * props.intensity
    light.shadow.intensity = props.shadowIntensity
}
watch(
    () => [props.curTime, props.direct, props.intensity, props.shadowIntensity],
    () => {
        updateSun()
    },
    { immediate: true },
)
const { renderer } = useTres()
renderer.toneMappingExposure = props.toneMappingExposure
renderer.toneMapping = props.toneMapping
</script>
    