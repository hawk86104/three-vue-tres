<template>
    <div id="main" class="bike-configurator-page">
        <loading />
        <TresCanvas v-bind="canvasState" window-size>
            <TresPerspectiveCamera ref="cameraRef" />
            <OrbitControls v-bind="controlsState" />
            <Suspense>
                <bikeScene :frame-id="selectedFrame" :wheel-id="selectedWheel" :animation-mode="animationMode" :environment-id="selectedEnvironment" />
            </Suspense>
        </TresCanvas>

        <div class="desktop ar overlay hide-in-presentation">
            <div id="bottom-ui">
                <div id="configuration-options" class="blurred-background">
                    <div id="material-options">
                        <button disabled class="options-label options-button" type="button"><strong>Frame</strong></button>
                        <button
                            v-for="option in frameOptions"
                            :key="option.id"
                            class="options-button"
                            :class="{ active: selectedFrame === option.id }"
                            type="button"
                            @click="selectedFrame = option.id"
                        >
                            {{ option.icon }}
                            <p class="tooltip top">{{ option.label }}</p>
                        </button>
                    </div>
                    <div id="color-options">
                        <button disabled class="options-label options-button" type="button"><strong>Wheels</strong></button>
                        <button
                            v-for="option in wheelOptions"
                            :key="option.id"
                            class="options-button"
                            :class="{ active: selectedWheel === option.id }"
                            type="button"
                            @click="selectedWheel = option.id"
                        >
                            {{ option.icon }}
                            <p class="tooltip top">{{ option.label }}</p>
                        </button>
                    </div>
                    <div id="animation-options">
                        <button disabled class="options-label options-button" type="button"><strong>Animation</strong></button>
                        <button
                            v-for="option in animationOptions"
                            :key="option.id"
                            class="options-button"
                            :class="{ active: animationMode === option.id }"
                            type="button"
                            @click="animationMode = option.id"
                        >
                            {{ option.icon }}
                            <p class="tooltip top">{{ option.label }}</p>
                        </button>
                    </div>
                    <div id="skybox-options">
                        <button disabled class="options-label options-button" type="button"><strong>Environment</strong></button>
                        <button
                            v-for="option in environmentOptions"
                            :key="option.id"
                            class="options-button"
                            :class="{ active: selectedEnvironment === option.id }"
                            type="button"
                            @click="selectedEnvironment = option.id"
                        >
                            {{ option.icon }}
                            <p class="tooltip top">{{ option.label }}</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { randomLoading as loading } from 'PLS/UIdemo'
import bikeScene from '../components/bikeConfigurator/scene.vue'
import { ANIMATION_OPTIONS, ENVIRONMENT_OPTIONS, FRAME_OPTIONS, WHEEL_OPTIONS } from '../components/bikeConfigurator/config'
import type { AnimationMode, EnvironmentId, FrameId, WheelId } from '../components/bikeConfigurator/types'

const frameOptions = FRAME_OPTIONS
const wheelOptions = WHEEL_OPTIONS
const animationOptions = ANIMATION_OPTIONS
const environmentOptions = ENVIRONMENT_OPTIONS

const selectedFrame = ref<FrameId>('1')
const selectedWheel = ref<WheelId>('5')
const animationMode = ref<AnimationMode>('normal')
const selectedEnvironment = ref<EnvironmentId>('studio')
const cameraRef = ref<THREE.PerspectiveCamera | null>(null)

const canvasState = {
    clearColor: '#000000',
    shadows: true,
    alpha: false,
    antialias: true,
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1,
    renderMode: 'always',
}

const controlsState = {
    enableDamping: true,
    dampingFactor: 0.08,
    enablePan: false,
    minDistance: 1.8,
    maxDistance: 8,
    target: new THREE.Vector3(0, 0.95, 0),
}

watch(
    cameraRef,
    (camera) => {
        if (!camera) return
        camera.position.set(1.89174259, 1.72206664, -3.39040327)
        camera.quaternion.set(-0.0383492969, 0.957766235, 0.152613923, 0.240670472)
        camera.fov = 30
        camera.near = 0.03
        camera.far = 100
        camera.updateProjectionMatrix()
    },
    { immediate: true },
)

</script>

<style lang="less" scoped>
.bike-configurator-page {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background-color: #000;
    font-family: Roboto, sans-serif;
    user-select: none;
}

.overlay {
    position: absolute;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.blurred-background {
    border-radius: 1em;
    background: rgba(255, 255, 255, 0.5);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(20px);
}

.options-button {
    position: relative;
    height: 33px;
    border: 0;
    border-radius: 1em;
    background-color: transparent;
    color: #000;
    font-family: Roboto, sans-serif;
    font-size: 1em;
    font-weight: 400;
    transition: 0.3s ease-in-out;
}

.options-button {
    padding: 0 3px;
}

.options-button:hover,
.options-button.active {
    cursor: pointer;
    background: #fff;
    opacity: 1;
    transition: 0.1s ease-in-out;
}

.options-button:hover {
    transform: scale(1.2);
}

.options-button:disabled {
    cursor: default;
    background: transparent;
    transform: none;
}

.options-label {
    min-width: 90px;
    margin-right: 2px;
    padding-right: 3px;
    text-align: right;
}

.tooltip {
    position: absolute;
    z-index: 1500;
    top: 150%;
    left: 50%;
    width: 200px;
    margin-left: -102px;
    padding: 5px;
    visibility: hidden;
    border-radius: 6px;
    background-color: rgba(0, 0, 0, 0.5);
    color: #fff;
    text-align: center;
    transition-delay: 0.2s;
}

.tooltip::after {
    position: absolute;
    bottom: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: transparent transparent rgba(0, 0, 0, 0.5);
    content: '';
}

.tooltip.top {
    top: initial;
    bottom: 100%;
}

.tooltip.top::after {
    top: 100%;
    bottom: initial;
    border-color: rgba(0, 0, 0, 0.5) transparent transparent;
}

button:hover .tooltip {
    visibility: visible;
    margin-top: 5px;
    opacity: 1;
    transition: 0.2s ease-in-out;
}

#bottom-ui {
    position: absolute;
    bottom: 75px;
    z-index: 1;
    display: flex;
    width: 100vw;
    flex-direction: row;
    align-items: flex-end;
    justify-content: center;
    pointer-events: none;
}

#configuration-options {
    display: flex;
    padding-right: 8px;
    padding-left: 0.5rem;
    pointer-events: auto;
}

#material-options,
#color-options,
#animation-options,
#skybox-options {
    display: flex;
    align-items: center;
}

#material-options > button:nth-last-of-type(2) {
    margin-left: 6px;
}

@media screen and (orientation: landscape) and (max-width: 1000px) {
    #bottom-ui {
        justify-content: left;
        margin-left: 2vw;
    }

    #bottom-ui {
        bottom: 11px;
        line-height: 0;
    }
}
</style>
