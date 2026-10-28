<template></template>

<script setup lang="ts">
import { useLoop, useTres } from '@tresjs/core'
import { nextTick, onBeforeUnmount, watch } from 'vue'
import type { PerspectiveCamera, WebGLRenderer } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OceanScene } from './OceanScene'
import type { WaterSettings } from './settings'
import type { WeatherSnapshot } from './weather'

const props = defineProps<{ settings: WaterSettings }>()
const emit = defineEmits<{
    engine: [value: OceanScene]
    progress: [value: number, label: string]
    ready: []
    error: [message: string]
    weather: [value: WeatherSnapshot]
    stats: [fps: number, underwater: boolean, speed: number]
}>()

const { renderer: tresRenderer, scene, camera, controls, sizes } = useTres()
const renderer = tresRenderer as WebGLRenderer
const { onBeforeRender, render } = useLoop()
let engine: OceanScene | undefined

watch([camera, controls], ([activeCamera, activeControls]) => {
    if (engine || !activeCamera || !activeControls) return
    try {
        engine = new OceanScene(
            renderer.domElement.parentElement!, renderer, scene.value,
            activeCamera as PerspectiveCamera, activeControls as unknown as OrbitControls,
            props.settings,
            {
                progress: (value, label) => emit('progress', value, label),
                ready: () => emit('ready'),
                error: message => emit('error', message),
                weather: value => emit('weather', value),
                stats: (fps, underwater, speed) => emit('stats', fps, underwater, speed),
            },
        )
        emit('engine', engine)
    } catch (cause) {
        emit('error', `无法初始化三维场景：${cause instanceof Error ? cause.message : String(cause)}`)
    }
}, { immediate: true, flush: 'post' })

watch([sizes.width, sizes.height, () => props.settings.pixelRatio], () => {
    // Tres updates the drawing buffer first; the ocean's offscreen targets follow it.
    void nextTick(() => engine?.resize())
}, { flush: 'post' })

onBeforeRender(() => engine?.update(performance.now()))
render(done => {
    if (engine) engine.render()
    else if (camera.value) renderer.render(scene.value, camera.value)
    done()
})
onBeforeUnmount(() => engine?.dispose())
</script>
