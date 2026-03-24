<template>
    <TresGroup>
        <primitive v-if="pState" :object="pState?.scene" :position="[0, -0.1, 0]" />
    </TresGroup>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@tresjs/cientos'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useTres } from '@tresjs/core'
import gsap from 'gsap'

const { renderer, scene: sceneValue } = useTres()

const props = defineProps({
    floorColor: { default: '#ff0000' },
    floorMetalness: { default: 0.8 },
    floorRoughness: { default: 0.2 },
    floorEnvMapIntensity: { default: 2.5 },
    sideColor: { default: '#ffffff' },
    sideOpacity: { default: 0.9 },
    speed: { default: 0.3 },
})

const { state: texture } = useTexture('./plugins/floor/image/concrete_wet_floor_basecolor.jpg')
watch(
    texture,
    (texture) => {
        if (texture) {
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.repeat.set(10, 10)
        }
    },
)

const { state: pState } = useGLTF(`${process.env.NODE_ENV === 'development' ? 'resource.cos' : 'https://opensource.cdn.icegl.cn'}/model/floor/baseModelI.glb`, {
    draco: true,
    decoderPath: './draco/',
})

const meshData: Array<{
    mesh: THREE.Mesh
    originalPosition: THREE.Vector3
    scatteredPosition: THREE.Vector3
    originalRotation: THREE.Euler
    scatteredRotation: THREE.Euler
}> = []

const tl = gsap.timeline()
watch(
    () => pState.value,
    (pState) => {
        if (!pState.scene) return
        const scene = pState.scene
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                const originalPosition = child.position.clone()
                const originalRotation = child.rotation.clone()

                // 垂直方向散开
                const verticalOffset = Math.random() - 0.5
                const scatteredPosition = new THREE.Vector3(
                    originalPosition.x,
                    originalPosition.y + verticalOffset, // 只沿 Y 散开
                    originalPosition.z,
                )

                // 随机倾斜（旋转）
                const maxTilt = Math.PI / 12 // 最大 15°
                const scatteredRotation = new THREE.Euler(
                    originalRotation.x + (Math.random() - 0.5) * maxTilt,
                    originalRotation.y + (Math.random() - 0.5) * maxTilt,
                    originalRotation.z,
                )

                meshData.push({
                    mesh: child,
                    originalPosition,
                    scatteredPosition,
                    originalRotation,
                    scatteredRotation,
                })

                if (child.name.includes('_')) {
                    // 侧面材质
                    child.material.emissiveIntensity = 2
                    child.material.metalness = 1
                    child.material.roughness = 0
                    child.material.transparent = true
                } else {
                    // 底板面材质
                    child.material.map = texture.value
                }
                child.material.needsUpdate = true
            }
        })

        meshData.forEach(({ mesh, scatteredPosition, scatteredRotation }, i) => {
            tl.to(
                mesh.position,
                {
                    x: scatteredPosition.x,
                    y: scatteredPosition.y,
                    z: scatteredPosition.z,
                    ease: 'power1.inOut',
                    repeat: -1,
                    yoyo: true,
                },
                0,
            )
            tl.to(
                mesh.rotation,
                {
                    x: scatteredRotation.x,
                    y: scatteredRotation.y,
                    z: scatteredRotation.z,
                    ease: 'power1.inOut',
                    repeat: -1,
                    yoyo: true,
                },
                0,
            )
        })

        setupEnvironment()
    },
)

const setupEnvironment = () => {
    const pmremGenerator = new THREE.PMREMGenerator(renderer)
    const environment = new RoomEnvironment()
    const envMap = pmremGenerator.fromScene(environment).texture

    // sceneValue.value.environment = envMap
    pState.value.scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
            child.material.envMap = envMap
            child.material.needsUpdate = true
        }
    })

    environment.dispose()

    setupMaterial(props.sideColor, props.floorColor, props.sideOpacity, props.floorMetalness, props.floorRoughness, props.floorEnvMapIntensity)
}

const setupMaterial = (sideColor, floorColor, sideOpacity, floorMetalness, floorRoughness, floorEnvMapIntensity) => {
    if (!pState.value?.scene) return
        pState.value.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                if (child.name.includes('_')) {
                    // 侧面材质
                    child.material.emissive.set(sideColor)
                    child.material.opacity = sideOpacity
                } else {
                    // 底板面材质
                    child.material.color.set(floorColor)
                    child.material.metalness = floorMetalness
                    child.material.roughness = floorRoughness
                    child.material.envMapIntensity = floorEnvMapIntensity
                }
            }
        })
}
watch(
    () => [props.sideColor, props.floorColor, props.sideOpacity, props.floorMetalness, props.floorRoughness, props.floorEnvMapIntensity],
    ([sideColor, floorColor, sideOpacity, floorMetalness, floorRoughness, floorEnvMapIntensity]) => {
        setupMaterial(sideColor, floorColor, sideOpacity, floorMetalness, floorRoughness, floorEnvMapIntensity)
    }
)
watch(
    () => [props.speed],
    ([speed]) => {
        tl.timeScale(speed)
    },
    { immediate: true },
)
</script>
