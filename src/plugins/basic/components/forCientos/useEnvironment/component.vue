<script setup lang="ts">
import type { Ref } from 'vue'
import { ref, useSlots, onUnmounted, watch, toRaw } from 'vue'
import { WebGLCubeRenderTarget, CubeCamera, HalfFloatType, UnsignedByteType, NearestFilter } from 'three'
import type { CubeTexture, Texture } from 'three'
import { useTres, useLoop } from '@tresjs/core'
import type { EnvironmentOptions } from './const'
import EnvSence from './envSence'
import { useEnvironment } from '.'

const props = withDefaults(defineProps<EnvironmentOptions>(), {
    background: false,
    blur: 0,
    files: [],
    path: '',
    preset: undefined,
    resolution: 256,
    near: 1,
    far: 1000,
    frames: Infinity,
    useDefaultScene: false,
})

const texture: Ref<Texture | CubeTexture | null> = ref(null)
defineExpose({ texture })

const { extend, renderer, scene } = useTres()
const componentSlots = useSlots()
let slots = null as any
let fbo = ref(null as null | WebGLCubeRenderTarget)
let cubeCamera = null as null | CubeCamera

const envSence = ref<EnvSence | null>(null)
onUnmounted(() => {
    envSence.value?.destructor()
    fbo.value?.dispose()
})
const { onBeforeRender } = useLoop()
let count = 1
onBeforeRender(() => {
    if (cubeCamera && envSence.value && fbo.value) {
        if (props.frames === Infinity || count < props.frames) {
            if (props.useDefaultScene) {
                cubeCamera.update(renderer, scene.value)
            } else {
                cubeCamera.update(renderer, toRaw(envSence.value.virtualScene))
            }
            count++
        }
    }
})
const useEnvironmentTexture = await useEnvironment(props, fbo as any)
const setTextureEnvAndBG = (fbo: WebGLCubeRenderTarget | null) => {
    if (fbo) {
        scene.value.environment = fbo.texture
        if (props.background) {
            scene.value.background = fbo.texture
        }
    } else {
        scene.value.environment = useEnvironmentTexture.value
        if (props.background) {
            scene.value.background = useEnvironmentTexture.value
        }
    }
}

watch(
    useEnvironmentTexture,
    (value) => {
        if (fbo.value) {
            setTextureEnvAndBG(fbo.value)
        }
    },
    { immediate: true, deep: true },
)
extend({ EnvSence })
const makeFbo = () => {
    fbo.value?.dispose()
    fbo.value = new WebGLCubeRenderTarget(props.resolution)
    cubeCamera = new CubeCamera(props.near, props.far, fbo.value)

    if (props.useDefaultScene) {
        fbo.value.texture.type = UnsignedByteType
        fbo.value.texture.generateMipmaps = false
        fbo.value.texture.minFilter = NearestFilter
        fbo.value.texture.magFilter = NearestFilter
    } else {
        fbo.value.texture.type = HalfFloatType
    }
    setTextureEnvAndBG(fbo.value)
}
watch(
    () => componentSlots.default,
    (value) => {
        if (value) {
            if (!fbo.value || fbo.value.texture.type !== HalfFloatType) {
                slots = value()
                if (Array.isArray(slots) && slots.length > 0) {
                    if (typeof slots[0]?.type !== 'symbol') {
                        makeFbo()
                        return
                    }
                }
            }
        }
        fbo.value?.dispose()
        fbo.value = null
        setTextureEnvAndBG(null)
    },
    { immediate: true, deep: true },
)
texture.value = useEnvironmentTexture

watch(
    () => props.useDefaultScene,
    (newValue) => {
        if (fbo.value) {
            makeFbo()
        }
    },
)
</script>

<template>
    <TresEnvSence v-if="fbo" ref="envSence">
        <slot />
    </TresEnvSence>
</template>
