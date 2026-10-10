<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-07-25 18:04:51
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-05-15 09:30:34
-->
<template>
    <GeoCanvas v-model:position="cameraPosition">
        <GeoControls v-model:position="cameraPosition" />
        <GeoScene :sceneConfig="sceneConfig" />
        <DevTDTTiles />

        <!-- GeoParticle 粒子 -->
        <GeoParticle @point-click="handlePointClick" :points="points" icon="https://img.icons8.com/?size=80&id=TQ3X81dkG8Q1&format=png" color="red" :size="20" />
    </GeoCanvas>
</template>

<script setup lang="ts">
import { GeoCanvas, GeoControls, GeoParticle, GeoScene, GeoPositionConfig } from '@icegl/geokit'
import { ref } from 'vue'
import DevTDTTiles from '../components/DevTDTTiles.vue'

const randomColor = () => {
    return '#' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')
}

const handlePointClick = (d: any, i: number) => {
    alert(`点击了第 ${i} 个,\n JS数据: ${JSON.stringify(d)}`)
}

const randomPoints = (center: { lon: number; lat: number }) => {
    return Array.from({ length: 10000 }, (_, index) => ({
        lon: center.lon + Math.random() * 0.01 - 0.005,
        lat: center.lat + Math.random() * 0.01 - 0.005,
        height: 5 + Math.random() * 5,
        color: index % 20 !== 0 ? '#ffffff' : randomColor(),
        id: index,
    }))
}

const points = ref(randomPoints({ lon: 118.778677, lat: 32.043848 }))

const sceneConfig = ref({
    effectProps: {
        enabled: true,
        focusArea: 0.7,
        feather: 0.1,
    },
    ambientLight: {
        color: '#fff',
        intensity: 1,
    },
    directionalLight: {
        color: '#fff',
        intensity: 2,
        position: [-1500, 500, 500] as [number, number, number],
    },
    background: 'https://oss.icegl.cn/p/topoProject/plugins/topoProject/image/farm_field_puresky_2k.jpg',
})

// 相机位置
const cameraPosition = ref<GeoPositionConfig>({
    heading: 90,
    pitch: -45,
    distance: 300,
    longitude: 118.778677,
    latitude: 32.043848,
})
</script>
