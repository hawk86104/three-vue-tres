<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-09-18 16:22:39
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-03-23 08:29:34
-->
<template></template>
<script lang="ts" setup>
import * as THREE from 'three'
import * as TWEEN from '@tweenjs/tween.js'
import { useTres, useLoop } from '@tresjs/core'

const props = withDefaults(
    defineProps<{
        map: any
    }>(),
    {},
)

const { camera, controls } : any = useTres()
// twInstant[0]: 当前飞行动画；twInstant[1]: 正北俯视动画结束后需要恢复的 controls.enabled 状态。
let twInstant = [] as any
const NORTH_TOP_POLAR = THREE.MathUtils.degToRad(0.6)
const getPos = (geo: THREE.Vector3) => props.map.localToWorld(props.map.geo2pos(geo))

const clearTween = () => {
    if (controls.value && typeof twInstant[1] === 'boolean') {
        controls.value.enabled = twInstant[1]
    }

    twInstant[0] = null
    twInstant[1] = null
}

const stopTween = () => {
    if (!twInstant[0]) {
        return
    }

    twInstant[0].stop?.()
    if (twInstant[0]) {
        clearTween()
    }
}

const startTween = (tween: any, disableControls = false) => {
    stopTween()

    twInstant[1] = disableControls ? controls.value?.enabled !== false : null
    if (disableControls && controls.value) {
        controls.value.enabled = false
    }

    twInstant[0] = tween.onComplete(clearTween).onStop(clearTween).start()
}

/**
 * 飞行到某地理坐标
 * @param cameraGeo 目标摄像机经纬度坐标
 * @param centerGeo 目标地图中心经纬度坐标
 */
const flyToGeo = (cameraGeo: THREE.Vector3, centerGeo: THREE.Vector3) => {
    const cameraPosition = getPos(cameraGeo)
    const centerPosition = getPos(centerGeo)

    if (controls.value) {
        controls.value.target.copy(centerPosition)
    }

    startTween(new TWEEN.Tween(camera.value.position).to(cameraPosition, 1000))
}

const flyToNorthTopView = (cameraGeo: THREE.Vector3, centerGeo: THREE.Vector3) => {
    if (!camera.value || !controls.value?.target || !controls.value.update) {
        flyToGeo(cameraGeo, centerGeo)
        return
    }

    const centerPosition = getPos(centerGeo)
    const cameraPosition = getPos(cameraGeo)
    const northGeo = centerGeo.clone()
    northGeo.y += 1e-4
    const northDirection = getPos(northGeo).sub(centerPosition).setY(0)

    if (northDirection.lengthSq() < 1e-12) {
        northDirection.set(0, 0, -1)
    } else {
        northDirection.normalize()
    }

    const startTarget = controls.value.target.clone()
    const startOffset = camera.value.position.clone().sub(startTarget)
    const startSpherical = new THREE.Spherical().setFromVector3(startOffset)
    const targetTheta = startSpherical.theta
        + THREE.MathUtils.euclideanModulo(Math.atan2(-northDirection.x, -northDirection.z) - startSpherical.theta + Math.PI, Math.PI * 2)
        - Math.PI
    const tweenState = {
        targetX: startTarget.x,
        targetY: startTarget.y,
        targetZ: startTarget.z,
        radius: Math.max(startSpherical.radius, 0.001),
        phi: startSpherical.phi,
        theta: startSpherical.theta,
    }

    startTween(
        new TWEEN.Tween(tweenState)
            .to(
                {
                    targetX: centerPosition.x,
                    targetY: centerPosition.y,
                    targetZ: centerPosition.z,
                    radius: Math.max(cameraPosition.distanceTo(centerPosition), 0.001),
                    phi: NORTH_TOP_POLAR,
                    theta: targetTheta,
                },
                1000,
            )
            .easing(TWEEN.Easing.Cubic.InOut)
            .onUpdate((state: any) => {
                const nextTarget = new THREE.Vector3(state.targetX, state.targetY, state.targetZ)
                const nextOffset = new THREE.Vector3().setFromSphericalCoords(state.radius, state.phi, state.theta)

                controls.value.target.copy(nextTarget)
                camera.value.position.copy(nextTarget).add(nextOffset)
            }),
        true,
    )
}

const goToGeo = (cameraGeo: THREE.Vector3, centerGeo: THREE.Vector3) => {
    const newCenterPos = props.map.localToWorld(props.map.geo2pos(centerGeo))
    const newCameraPos = props.map.localToWorld(props.map.geo2pos(cameraGeo))

    if (camera.value && controls.value) {
        stopTween()
        camera.value.position.copy(newCameraPos)
        controls.value.target.copy(newCenterPos)
        controls.value.dispatchEvent({ type: 'change' })
    }
    else {
        console.error('camera.value && controls.value as null')
    }
}

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
    if (controls.value) {
        twInstant[0]?.update()
        controls.value.update()
    }
})

defineExpose({
    flyToGeo,
    flyToNorthTopView,
    goToGeo,
})
</script>
