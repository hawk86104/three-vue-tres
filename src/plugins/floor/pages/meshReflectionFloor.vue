<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { Pane } from 'tweakpane'
import MeshReflectionFloor from '../components/meshReflectionFloor.vue'
import {
    createMeshReflectionFloorState,
    meshReflectionFloorDistortionMapOptions,
    meshReflectionFloorMapOptions,
    meshReflectionFloorNormalMapOptions,
} from '../common/meshReflectionFloor'

// 与组件、编辑器共用默认参数，具体含义见 ../meshReflectionFloor.md。
const floorState = reactive(createMeshReflectionFloorState())
const textureOptions = (options: { label: string; value: string }[]) =>
    Object.fromEntries(options.map(({ label, value }) => [label, value]))
let pane: Pane | undefined

onMounted(() => {
    pane = new Pane({ title: '通用镜面地板' })

    const material = pane.addFolder({ title: '基础材质' })
    material.addBinding(floorState, 'color', { label: '颜色' })
    material.addBinding(floorState, 'roughness', { label: '粗糙度', min: 0, max: 1, step: 0.01 })
    material.addBinding(floorState, 'metalness', { label: '金属度', min: 0, max: 1, step: 0.01 })

    const reflection = pane.addFolder({ title: '镜面反射' })
    reflection.addBinding(floorState, 'resolution', {
        label: '分辨率',
        options: [256, 512, 1024, 2048].map((value) => ({ text: String(value), value })),
    })
    reflection.addBinding(floorState, 'mix', { label: '整体强度', min: 0, max: 5, step: 0.01 })
    reflection.addBinding(floorState, 'sharpMix', { label: '清晰反射', min: 0, max: 5, step: 0.01 })
    reflection.addBinding(floorState, 'reflectorOffset', { label: '反射面偏移', min: -1, max: 1, step: 0.001 })

    const depth = reflection.addFolder({ title: '清晰反射深度', expanded: false })
    depth.addBinding(floorState, 'sharpDepthScale', { label: '深度范围', min: 0, max: 5, step: 0.01 })
    depth.addBinding(floorState, 'sharpDepthBias', { label: '深度偏移', min: -1, max: 1, step: 0.001 })
    depth.addBinding(floorState, 'sharpDepthEdgeMin', { label: '衰减起点', min: 0, max: 1, step: 0.001 })
    depth.addBinding(floorState, 'sharpDepthEdgeMax', { label: '衰减终点', min: 0, max: 1, step: 0.001 })

    const blur = pane.addFolder({ title: '模糊反射', expanded: false })
    // 底层以 500 - blurSize 计算采样尺寸，避免滑到尺寸为 0 的边界。
    blur.addBinding(floorState, 'blurSize', { label: '模糊尺寸', min: 0, max: 499, step: 1 })
    blur.addBinding(floorState, 'blurMixSmooth', { label: '光滑面强度', min: 0, max: 5, step: 0.01 })
    blur.addBinding(floorState, 'blurMixRough', { label: '粗糙面强度', min: 0, max: 5, step: 0.01 })
    blur.addBinding(floorState, 'blurDepthScale', { label: '深度范围', min: 0, max: 5, step: 0.01 })
    blur.addBinding(floorState, 'blurDepthBias', { label: '深度偏移', min: -1, max: 1, step: 0.001 })
    blur.addBinding(floorState, 'blurDepthEdgeMin', { label: '扩散起点', min: 0, max: 1, step: 0.001 })
    blur.addBinding(floorState, 'blurDepthEdgeMax', { label: '扩散终点', min: 0, max: 1, step: 0.001 })

    const textures = pane.addFolder({ title: '纹理贴图', expanded: false })
    textures.addBinding(floorState, 'mapSource', { label: '底色贴图', options: textureOptions(meshReflectionFloorMapOptions) })
    textures.addBinding(floorState, 'mapIntensity', { label: '底色强度', min: 0, max: 1, step: 0.01 })
    textures.addBinding(floorState, 'normalMapSource', { label: '法线贴图', options: textureOptions(meshReflectionFloorNormalMapOptions) })
    textures.addBinding(floorState, 'normalIntensity', { label: '法线强度', min: 0, max: 5, step: 0.01 })
    textures.addBinding(floorState, 'distortionMapSource', { label: '扰动贴图', options: textureOptions(meshReflectionFloorDistortionMapOptions) })
    textures.addBinding(floorState, 'distortion', { label: '扰动强度', min: 0, max: 5, step: 0.01 })
    textures.addBinding(floorState, 'textureRepeat', {
        label: '底色/法线重复',
        x: { min: 0.1, max: 10, step: 0.1 },
        y: { min: 0.1, max: 10, step: 0.1 },
    })
    textures.addBinding(floorState, 'textureRotation', { label: '贴图旋转', min: -Math.PI, max: Math.PI, step: 0.01 })

    pane.addButton({ title: '恢复默认参数' }).on('click', () => {
        Object.assign(floorState, createMeshReflectionFloorState())
        pane?.refresh()
    })
})

onBeforeUnmount(() => pane?.dispose())
</script>

<template>
    <TresCanvas clear-color="#15191f" window-size>
        <TresPerspectiveCamera :position="[9, 9, 11]" :fov="45" :near="0.1" :far="100" :look-at="[0, 0, 0]" />
        <OrbitControls enable-damping :target="[0, 0.5, 0]" :min-distance="4" :max-distance="24" :max-polar-angle="Math.PI / 2 - 0.05" />
        <TresAmbientLight :intensity="1.5" />
        <TresDirectionalLight :position="[3, 8, 5]" :intensity="3" />

        <TresMesh :position="[-2, 1.1, 0]">
            <TresSphereGeometry :args="[1.1, 48, 32]" />
            <TresMeshStandardMaterial color="#159fc2" :roughness="0.2" :metalness="0.15" />
        </TresMesh>
        <TresMesh :position="[1, 1.4, -1.8]">
            <TresBoxGeometry :args="[1.6, 2.8, 1.6]" />
            <TresMeshStandardMaterial color="#f3a55e" :roughness="0.4" />
        </TresMesh>
        <TresMesh :position="[1.5, 1.25, 1.5]">
            <TresTorusKnotGeometry :args="[0.7, 0.25, 100, 24]" />
            <TresMeshStandardMaterial color="#c7e77c" :roughness="0.2" :metalness="0.15" />
        </TresMesh>

        <MeshReflectionFloor v-bind="floorState" />
    </TresCanvas>
</template>
