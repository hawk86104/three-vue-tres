<template>
    <TresGroup>

        <Suspense>
            <hunyuanSpz :position="[0, 0.979, 0]" :rotation="[-1.6807963267948969, 0, 0]" :scale="[1, 1, 1]" name="混元SPZ"
                uuid="774509a2-8483-4647-9d7e-0b48c199dcdf" :castShadow="false" :receiveShadow="false" :renderOrder="0"
                :visible="true" v-bind="eMeshState0" @ready="emit('ready')" />
        </Suspense>

        <Suspense>
            <cartoonMagic :position="[-0.001, 0.032, 0.255]" :rotation="[0, 0, 0]" :scale="[0.3, 0.3, 0.3]" name="卡通能量圈"
                uuid="84735b4f-cdfc-4dfd-9406-c747c382e767" :castShadow="false" :receiveShadow="false"
                :renderOrder="9999" :visible="true" v-bind="eMeshState1" />
        </Suspense>

        <Suspense>
            <shaderCircleWave :position="[-2.684, -0.002, 0.23]" :rotation="[0, 0, 0]" :scale="[0.5, 0.5, 0.5]" name="花纹圈动画"
                uuid="f395bb38-03ae-427d-bd1d-37a326860b3c" :castShadow="false" :receiveShadow="false"
                :renderOrder="999" :visible="true" v-bind="eMeshState2" />
        </Suspense>

        <Suspense>
            <coneAnchorMeshB :position="[-2.864, 0.767, 0.234]" :rotation="[0, 0, 0]" :scale="[0.02, 0.02, 0.02]" name="浮锚标识B"
                uuid="6e2b0ac2-46e5-4209-adc9-2e417819cbf8" :castShadow="false" :receiveShadow="false" :renderOrder="0"
                :visible="true" v-bind="eMeshState3" />
        </Suspense>

        <Suspense>
            <particleBase :position="[4.933, 0, 0.31]" :rotation="[0, 0, 0]" :scale="[1, 1, 1]" name="粒子底座"
                uuid="4957e8cf-1517-4dd2-8216-a8fc4996710d" :castShadow="false" :receiveShadow="false"
                :renderOrder="9999" :visible="true" v-bind="eMeshState4" />
        </Suspense>

        <Suspense>
            <fencePlus :position="[4.57, -0.024, 0.367]" :rotation="[0, 0, 0]" :scale="[1, 1, 1]" name="围墙高级"
                uuid="421143ac-6bd6-49a7-acd0-4e9506b4bcf9" :castShadow="false" :receiveShadow="false"
                :renderOrder="999" :visible="true" v-bind="eMeshState5" />
        </Suspense>
    </TresGroup>
</template>

<script setup lang="ts">
import { hunyuanSpz } from 'PLS/gaussianSplatting'
import { cartoonMagic } from 'PLS/floor'
import { shaderCircleWave } from 'PLS/floor'
import { coneAnchorMeshB } from 'PLS/digitalCity'
import { particleBase } from 'PLS/floor'
import { fencePlus } from 'PLS/digitalCity'

const emit = defineEmits(['ready'])

const eMeshState0 = { "url": "https://cos.icegl.cn/model/gaussianSplatting/jiedao.spz", "lod": true, "extSplats": false, "paged": false, "maxStdDev": 2, "sortRadial": true, "lodSplatScale": 1, "pagedExtSplats": false, "useColliderUrl": true, "colliderUrl": "https://cos.icegl.cn/model/gaussianSplatting/jiedao.ply" }

const eMeshState1 = { "color": "#F7E69D", "speed": 1 }

const eMeshState2 = { "color": "#54023B", "colorDark": "#000000", "speed": 1 }

const eMeshState3 = { "anchorColor": "#FF00F7", "rotateSpeed": 0.05, "floorSize": 12, "floorColor": "#0059ff", "floorSpeed": 0.6, "depthTest": true }

const eMeshState4 = { "speed": -0.03, "randomness": 0.69, "count": 80, "size": 0.05, "color": "#FB0000", "areaX": 2.5, "areaY": 1.2, "areaZ": 1.5, "opacity": 0.51 }

const eMeshState5 = { "width": 0.943, "height": 0.591, "depth": 1.153, "color": "#FF0004", "opacity": 1, "num": 4, "thickness": 0.01, "speed": 0.2, "room": 0.45 }
</script>
