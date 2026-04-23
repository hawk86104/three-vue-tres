<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-04-23 08:33:04
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-23 11:33:40
-->
<template></template>

<script setup lang="ts">
import { useLoop, useTres } from '@tresjs/core'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { playerController } from 'PLS/basic/components/playerController/playerController'

type PositionValue = {
    x: number
    y: number
    z: number
}

const { camera, scene, controls } = useTres() as any
const player = playerController()
const hasInitialized = ref(false)
let isUnmounted = false

const playerModelConfig = {
    url: `${process.env.NODE_ENV === 'development' ? 'resource.cos' : 'https://opensource.cdn.icegl.cn'}/model/basic/person.glb`,
    idleAnim: 'idle',
    walkAnim: 'walk',
    runAnim: 'run',
    jumpAnim: 'jump',
    flyAnim: 'flying',
    flyIdleAnim: 'flyidle',
}

watch(
    () => controls.value,
    async (value: any) => {
        if (!value || hasInitialized.value) {
            return
        }

        hasInitialized.value = true
        await nextTick()
        try {
            await player.init({
                scene: scene.value,
                camera: camera.value as THREE.PerspectiveCamera,
                controls: value,
                playerModel: {
                    ...playerModelConfig,
                    scale: 0.002,
                },
                initPos: toVector3({
                    x: -1.22,
                    y: 1.6,
                    z: 0.6
                }),
            })
        } catch (error) {
            console.error('人物漫游初始化失败:', error)
            hasInitialized.value = false
            return
        }

        if (isUnmounted) {
            player.destroy()
            hasInitialized.value = false
        }
    },
    { immediate: true },
)

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
    if (!hasInitialized.value) {
        return
    }

    player.update()
})

onBeforeUnmount(() => {
    isUnmounted = true
    hasInitialized.value = false
    player.destroy()
})

function toVector3(position: PositionValue) {
    return new THREE.Vector3(position.x, position.y, position.z)
}
</script>
