<template>
    <div class="brain-storm-page">
        <TresCanvas v-bind="canvasConfig" window-size>
            <TresPerspectiveCamera
                :position="[2.2, 0, 0.85]"
                :fov="35"
                :near="0.01"
                :far="1000"
            />
            <OrbitControls v-bind="controlsState" />

            <spaceDome
                :top-color="sceneState.domeTopColor"
                :bottom-color="sceneState.domeBottomColor"
                :glow-color="sceneState.domeGlowColor"
                :glow-strength="sceneState.domeGlowStrength"
                :speed="sceneState.domeSpeed"
            />

            <TresAmbientLight :intensity="0.1" />

            <TresGroup :rotation="[0, 0.55, 0]">
                <brainShell
                    v-if="brainState.visible"
                    :model="brainRoot"
                    :visible="brainState.visible"
                    :base-color="brainState.baseColor"
                    :fresnel-color="brainState.fresnelColor"
                    :fresnel-power="brainState.fresnelPower"
                    :fresnel-intensity="brainState.fresnelIntensity"
                    :specular-intensity="brainState.specularIntensity"
                    :specular-shininess="brainState.specularShininess"
                    :roughness="brainState.roughness"
                    :electric-color="brainState.electricColor"
                    :electric-intensity="brainState.electricIntensity"
                    :electric-speed="brainState.electricSpeed"
                    :electric-frequency="brainState.electricFrequency"
                    :light-x="brainState.lightX"
                    :light-y="brainState.lightY"
                    :light-z="brainState.lightZ"
                />

                <grooveParticles
                    v-if="brainMesh && grooveState.visible"
                    :mesh="brainMesh"
                    :visible="grooveState.visible"
                    :count="grooveState.count"
                    :size="grooveState.size"
                    :speed="grooveState.speed"
                    :outset="grooveState.outset"
                    :spread="grooveState.spread"
                    :threshold="grooveState.threshold"
                    :color1="grooveState.color1"
                    :color2="grooveState.color2"
                    :seed="seedState.seed + 3"
                />

                <neuralThreads
                    v-if="threadState.visible || threadState.particlesVisible"
                    :visible="threadState.visible"
                    :color="threadState.color"
                    :opacity="threadState.opacity"
                    :cluster-count="threadState.clusterCount"
                    :threads-per-cluster="threadState.threadsPerCluster"
                    :thread-radius-min="threadState.threadRadiusMin"
                    :thread-radius-max="threadState.threadRadiusMax"
                    :min-length="threadState.minLength"
                    :max-length="threadState.maxLength"
                    :start-radius-min="threadState.startRadiusMin"
                    :start-radius-max="threadState.startRadiusMax"
                    :wave-amplitude="threadState.waveAmplitude"
                    :wave-frequency="threadState.waveFrequency"
                    :cluster-spread="threadState.clusterSpread"
                    :animation-enabled="threadState.animationEnabled"
                    :animation-speed="threadState.animationSpeed"
                    :animation-amplitude="threadState.animationAmplitude"
                    :animation-frequency="threadState.animationFrequency"
                    :mouse-repulsion-enabled="threadState.mouseRepulsionEnabled"
                    :mouse-repulsion-radius="threadState.mouseRepulsionRadius"
                    :mouse-repulsion-strength="threadState.mouseRepulsionStrength"
                    :repulsion-smoothness="threadState.repulsionSmoothness"
                    :mouse-glow-enabled="threadState.mouseGlowEnabled"
                    :mouse-glow-opacity="threadState.mouseGlowOpacity"
                    :glow-transition-speed="threadState.glowTransitionSpeed"
                    :particles-visible="threadState.particlesVisible"
                    :particles-per-thread="threadState.particlesPerThread"
                    :particle-speed="threadState.particleSpeed"
                    :particle-size="threadState.particleSize"
                    :particle-color1="threadState.particleColor1"
                    :particle-color2="threadState.particleColor2"
                    :seed="seedState.seed + 11"
                />

                <sparkleParticles
                    v-if="sparkleState.visible"
                    :visible="sparkleState.visible"
                    :count="sparkleState.count"
                    :size="sparkleState.size"
                    :brightness="sparkleState.brightness"
                    :min-radius="sparkleState.minRadius"
                    :max-radius="sparkleState.maxRadius"
                    :speed="sparkleState.speed"
                    :color1="sparkleState.color1"
                    :color2="sparkleState.color2"
                    :seed="seedState.seed + 21"
                />
            </TresGroup>

            <EffectComposer v-if="hasPostEffects">
                <UnrealBloom
                    v-if="sceneState.bloomStrength > 0.001"
                    :strength="sceneState.bloomStrength"
                    :threshold="sceneState.bloomThreshold"
                    :radius="sceneState.bloomRadius"
                />
                <brainBokehPass
                    v-if="sceneState.dofEnabled"
                    :focus="sceneState.dofFocusDistance"
                    :aperture="dofAperture"
                    :maxblur="dofMaxBlur"
                    :resolution-scale="sceneState.dofResolutionScale"
                />
                <Output />
            </EffectComposer>
        </TresCanvas>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, watchEffect } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from '@tresjs/cientos'
import { EffectComposer, Output, UnrealBloom } from '@tresjs/post-processing'
import { Pane } from 'tweakpane'
import { useGLTF } from 'PLS/basic'
import brainShell from '../components/brainStorm/brainShell.vue'
import brainBokehPass from '../components/brainStorm/brainBokehPass.vue'
import grooveParticles from '../components/brainStorm/grooveParticles.vue'
import neuralThreads from '../components/brainStorm/neuralThreads.vue'
import sparkleParticles from '../components/brainStorm/sparkleParticles.vue'
import spaceDome from '../components/brainStorm/spaceDome.vue'
import { getPrimaryMesh } from '../components/brainStorm/utils'

const presets = {
    neuralPulse: {
        scene: {
            clearColor: '#121316',
            exposure: 1.2,
            bloomStrength: 0.18,
            bloomRadius: 0.24,
            bloomThreshold: 0.62,
            domeTopColor: '#1a1228',
            domeBottomColor: '#090a0f',
            domeGlowColor: '#772599',
            domeGlowStrength: 0.4,
            domeSpeed: 0.22,
            dofEnabled: true,
            dofFocusDistance: 1.8,
            dofFocusRange: 0.55,
            dofBokehScale: 1.9,
            dofResolutionScale: 0.5,
        },
        brain: {
            visible: true,
            baseColor: '#492469',
            fresnelColor: '#b3a1cf',
            fresnelPower: 2.5,
            fresnelIntensity: 1.2,
            specularIntensity: 0.6,
            specularShininess: 32,
            roughness: 0.3,
            electricColor: '#8b5cf6',
            electricIntensity: 2.5,
            electricSpeed: 1.5,
            electricFrequency: 8,
            lightX: 2,
            lightY: 3,
            lightZ: 2,
        },
        groove: {
            visible: true,
            count: 3000,
            size: 24,
            speed: 1,
            outset: 0.003,
            spread: 0.0065,
            threshold: 0.5,
            color1: '#ff9b57',
            color2: '#d5750f',
        },
        threads: {
            visible: true,
            color: '#b089ff',
            opacity: 0.4,
            clusterCount: 16,
            threadsPerCluster: 5,
            threadRadiusMin: 0.0003,
            threadRadiusMax: 0.003,
            minLength: 0.7,
            maxLength: 2.8,
            startRadiusMin: 0.35,
            startRadiusMax: 0.5,
            waveAmplitude: 0.12,
            waveFrequency: 3.8,
            clusterSpread: 0.1,
            animationEnabled: true,
            animationSpeed: 3,
            animationAmplitude: 0.03,
            animationFrequency: 2,
            mouseRepulsionEnabled: true,
            mouseRepulsionRadius: 0.35,
            mouseRepulsionStrength: 0.08,
            repulsionSmoothness: 0.15,
            mouseGlowEnabled: true,
            mouseGlowOpacity: 1,
            glowTransitionSpeed: 0.1,
            particlesVisible: true,
            particlesPerThread: 4,
            particleSpeed: 0.32,
            particleSize: 26,
            particleColor1: '#7444ff',
            particleColor2: '#ff89d0',
        },
        sparkles: {
            visible: true,
            count: 2000,
            size: 0.9,
            brightness: 4.4,
            minRadius: 0.8,
            maxRadius: 2,
            speed: 0.5,
            color1: '#ffffff',
            color2: '#895d0d',
        },
    },
    auroraSignal: {
        scene: {
            clearColor: '#031017',
            exposure: 1.2,
            bloomStrength: 0.5,
            bloomRadius: 0.5,
            bloomThreshold: 0.5,
            domeTopColor: '#0b2132',
            domeBottomColor: '#01090f',
            domeGlowColor: '#0f766e',
            domeGlowStrength: 0.62,
            domeSpeed: 0.22,
            dofEnabled: true,
            dofFocusDistance: 1.8,
            dofFocusRange: 0.5,
            dofBokehScale: 1.7,
            dofResolutionScale: 0.45,
        },
        brain: {
            visible: true,
            baseColor: '#173a4d',
            fresnelColor: '#c7fff7',
            fresnelPower: 2.6,
            fresnelIntensity: 1.15,
            specularIntensity: 0.55,
            specularShininess: 34,
            roughness: 0.32,
            electricColor: '#33d1c5',
            electricIntensity: 2.1,
            electricSpeed: 1.3,
            electricFrequency: 6.8,
            lightX: 1.5,
            lightY: 2.8,
            lightZ: 2.3,
        },
        groove: {
            visible: true,
            count: 2400,
            size: 19,
            speed: 0.85,
            outset: 0.0045,
            spread: 0.008,
            threshold: 0.5,
            color1: '#8ef4e8',
            color2: '#25b6c7',
        },
        threads: {
            visible: true,
            color: '#7de6ff',
            opacity: 0.36,
            clusterCount: 14,
            threadsPerCluster: 5,
            threadRadiusMin: 0.0004,
            threadRadiusMax: 0.0026,
            minLength: 0.64,
            maxLength: 2.18,
            startRadiusMin: 0.32,
            startRadiusMax: 0.46,
            waveAmplitude: 0.09,
            waveFrequency: 3.1,
            clusterSpread: 0.08,
            animationEnabled: true,
            animationSpeed: 2.2,
            animationAmplitude: 0.02,
            animationFrequency: 1.9,
            mouseRepulsionEnabled: true,
            mouseRepulsionRadius: 0.28,
            mouseRepulsionStrength: 0.06,
            repulsionSmoothness: 0.13,
            mouseGlowEnabled: true,
            mouseGlowOpacity: 0.8,
            glowTransitionSpeed: 0.12,
            particlesVisible: true,
            particlesPerThread: 3,
            particleSpeed: 0.28,
            particleSize: 22,
            particleColor1: '#65fff0',
            particleColor2: '#42b7ff',
        },
        sparkles: {
            visible: true,
            count: 1500,
            size: 1.4,
            brightness: 2.1,
            minRadius: 1.1,
            maxRadius: 2.9,
            speed: 0.36,
            color1: '#b7fff8',
            color2: '#6ad4ff',
        },
    },
    amberFlux: {
        scene: {
            clearColor: '#12050a',
            exposure: 1.1,
            bloomStrength: 0.5,
            bloomRadius: 0.5,
            bloomThreshold: 0.5,
            domeTopColor: '#28111c',
            domeBottomColor: '#070205',
            domeGlowColor: '#c2410c',
            domeGlowStrength: 0.82,
            domeSpeed: 0.16,
            dofEnabled: true,
            dofFocusDistance: 1.8,
            dofFocusRange: 0.58,
            dofBokehScale: 1.85,
            dofResolutionScale: 0.45,
        },
        brain: {
            visible: true,
            baseColor: '#5a1a2a',
            fresnelColor: '#ffd5ad',
            fresnelPower: 2.0,
            fresnelIntensity: 1.45,
            specularIntensity: 0.8,
            specularShininess: 48,
            roughness: 0.22,
            electricColor: '#ff8a4c',
            electricIntensity: 3.2,
            electricSpeed: 1.9,
            electricFrequency: 9.2,
            lightX: 2.6,
            lightY: 2.4,
            lightZ: 1.2,
        },
        groove: {
            visible: true,
            count: 3100,
            size: 24,
            speed: 1.35,
            outset: 0.0038,
            spread: 0.0065,
            threshold: 0.54,
            color1: '#ffd36e',
            color2: '#ff6a2f',
        },
        threads: {
            visible: true,
            color: '#ff9f67',
            opacity: 0.46,
            clusterCount: 18,
            threadsPerCluster: 6,
            threadRadiusMin: 0.0003,
            threadRadiusMax: 0.0031,
            minLength: 0.8,
            maxLength: 2.7,
            startRadiusMin: 0.35,
            startRadiusMax: 0.55,
            waveAmplitude: 0.13,
            waveFrequency: 4.4,
            clusterSpread: 0.12,
            animationEnabled: true,
            animationSpeed: 2.9,
            animationAmplitude: 0.03,
            animationFrequency: 2.8,
            mouseRepulsionEnabled: true,
            mouseRepulsionRadius: 0.38,
            mouseRepulsionStrength: 0.09,
            repulsionSmoothness: 0.16,
            mouseGlowEnabled: true,
            mouseGlowOpacity: 1,
            glowTransitionSpeed: 0.09,
            particlesVisible: true,
            particlesPerThread: 5,
            particleSpeed: 0.36,
            particleSize: 28,
            particleColor1: '#ffb34d',
            particleColor2: '#ffd3ac',
        },
        sparkles: {
            visible: true,
            count: 2200,
            size: 1.8,
            brightness: 3.2,
            minRadius: 1.3,
            maxRadius: 3.5,
            speed: 0.4,
            color1: '#fff3d6',
            color2: '#ff9b52',
        },
    },
}

type PresetKey = keyof typeof presets

const presetState = reactive({
    preset: 'neuralPulse' as PresetKey,
})

const seedState = reactive({
    seed: 27,
})

const sceneState = reactive({ ...presets.neuralPulse.scene })
const brainState = reactive({ ...presets.neuralPulse.brain })
const grooveState = reactive({ ...presets.neuralPulse.groove })
const threadState = reactive({ ...presets.neuralPulse.threads })
const sparkleState = reactive({ ...presets.neuralPulse.sparkles })
const renderPixelRatio = Math.min(window.devicePixelRatio || 1, 1.25)

const canvasConfig = reactive({
    clearColor: sceneState.clearColor,
    alpha: false,
    shadows: false,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: sceneState.exposure,
    outputColorSpace: THREE.SRGBColorSpace,
    antialias: false,
    dpr: renderPixelRatio,
    powerPreference: 'high-performance' as WebGLPowerPreference,
})

const controlsState = reactive({
    enableDamping: true,
    enablePan: false,
    enableZoom: true,
    enableRotate: true,
    autoRotate: true,
    autoRotateSpeed: 0.5,
    minDistance: 1.5,
    maxDistance: 3,
})

const hasBloomSubjects = computed(() => (
    brainState.visible
    || grooveState.visible
    || threadState.visible
    || threadState.particlesVisible
    || sparkleState.visible
))
const hasPostEffects = computed(() => hasBloomSubjects.value && (sceneState.bloomStrength > 0.001 || sceneState.dofEnabled))
const dofAperture = computed(() => THREE.MathUtils.clamp(sceneState.dofFocusRange / 20, 0.001, 0.08))
const dofMaxBlur = computed(() => THREE.MathUtils.clamp(sceneState.dofBokehScale / 100, 0, 0.08))

watchEffect(() => {
    canvasConfig.clearColor = sceneState.clearColor
    canvasConfig.toneMappingExposure = sceneState.exposure
})

const { scene } = await useGLTF('./plugins/medical/model/brainStorm/brain.glb') as any
const brainRoot = scene.clone(true) as THREE.Object3D
brainRoot.updateMatrixWorld(true)
const brainMesh = getPrimaryMesh(brainRoot)

const applyPreset = (presetKey: PresetKey) => {
    const preset = presets[presetKey]
    Object.assign(sceneState, preset.scene)
    Object.assign(brainState, preset.brain)
    Object.assign(grooveState, preset.groove)
    Object.assign(threadState, preset.threads)
    Object.assign(sparkleState, preset.sparkles)
    paneControl?.refresh()
}

const ensurePaneStyle = () => {
    const current = document.getElementById('brain-storm-pane-theme')
    if (current) {
        current.remove()
    }

    const styleElement = document.createElement('style')
    styleElement.id = 'brain-storm-pane-theme'
    styleElement.textContent = `
        .brain-storm-pane {
            position: fixed !important;
            top: 8px !important;
            right: 8px !important;
            width: 280px !important;
            max-height: calc(100vh - 16px) !important;
            overflow-y: auto !important;
            z-index: 10000;
            scrollbar-width: thin;
            scrollbar-color: #7444ff transparent;
            --tp-base-background-color: #121316;
            --tp-base-shadow-color: rgba(0, 0, 0, 0.4);
            --tp-button-background-color: #7444ff;
            --tp-button-background-color-active: #7444ff;
            --tp-button-background-color-focus: #8855ff;
            --tp-button-background-color-hover: #8855ff;
            --tp-button-foreground-color: #ffffff;
            --tp-container-background-color: #28292e;
            --tp-container-background-color-active: #1e1f23;
            --tp-container-background-color-focus: #1e1f23;
            --tp-container-background-color-hover: #1e1f23;
            --tp-container-foreground-color: #ffffff;
            --tp-groove-foreground-color: rgba(255, 255, 255, 0.08);
            --tp-input-background-color: #28292e;
            --tp-input-background-color-active: #1e1f23;
            --tp-input-background-color-focus: #1e1f23;
            --tp-input-background-color-hover: #1e1f23;
            --tp-input-foreground-color: #ffffff;
            --tp-label-foreground-color: rgba(255, 255, 255, 0.6);
            --tp-monitor-background-color: #28292e;
            --tp-monitor-foreground-color: #7444ff;
        }

        .brain-storm-pane::-webkit-scrollbar {
            width: 4px;
        }

        .brain-storm-pane::-webkit-scrollbar-thumb {
            background: #7444ff;
            border-radius: 999px;
        }

        .brain-storm-pane .tp-rotv {
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            backdrop-filter: none;
        }

        .brain-storm-pane .tp-rotv_t,
        .brain-storm-pane .tp-fldv_t {
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        @media (max-width: 960px) {
            .brain-storm-pane {
                width: 240px !important;
            }
        }
    `

    document.head.appendChild(styleElement)
    return styleElement
}

let paneControl: Pane | null = null
let paneStyleElement: HTMLStyleElement | null = null

onMounted(() => {
    paneStyleElement = ensurePaneStyle()
    paneControl = new Pane({
        title: 'Customize Theme',
        expanded: true,
    })
    paneControl.element.classList.add('brain-storm-pane')

    const presetFolder = paneControl.addFolder({ title: '主题预设', expanded: true })
    presetFolder.addBlade({
        view: 'list',
        label: '方案',
        options: [
            { text: '神经脉冲', value: 'neuralPulse' },
            { text: '极光信号', value: 'auroraSignal' },
            { text: '琥珀风暴', value: 'amberFlux' },
        ],
        value: presetState.preset,
    }).on('change', (event: any) => {
        presetState.preset = event.value
        applyPreset(event.value)
    })
    presetFolder.addButton({ title: '重新生成结构' }).on('click', () => {
        seedState.seed += 1
    })
    presetFolder.addButton({ title: '重置当前方案' }).on('click', () => {
        applyPreset(presetState.preset)
    })

    const viewFolder = paneControl.addFolder({ title: '镜头与辉光', expanded: true })
    viewFolder.addBinding(controlsState, 'autoRotate', { label: '自动旋转' })
    viewFolder.addBinding(controlsState, 'autoRotateSpeed', {
        label: '旋转速度',
        min: 0,
        max: 3,
        step: 0.05,
    })
    viewFolder.addBinding(sceneState, 'exposure', {
        label: '曝光',
        min: 0.5,
        max: 2,
        step: 0.01,
    })
    viewFolder.addBinding(sceneState, 'bloomStrength', {
        label: '泛光强度',
        min: 0,
        max: 3,
        step: 0.01,
    })
    viewFolder.addBinding(sceneState, 'bloomRadius', {
        label: '泛光半径',
        min: 0,
        max: 1,
        step: 0.01,
    })
    viewFolder.addBinding(sceneState, 'bloomThreshold', {
        label: '泛光阈值',
        min: 0,
        max: 1,
        step: 0.01,
    })

    const skyFolder = paneControl.addFolder({ title: '背景氛围', expanded: true })
    skyFolder.addBinding(sceneState, 'clearColor', { label: '底色' })
    skyFolder.addBinding(sceneState, 'domeTopColor', { label: '顶部颜色' })
    skyFolder.addBinding(sceneState, 'domeBottomColor', { label: '底部颜色' })
    skyFolder.addBinding(sceneState, 'domeGlowColor', { label: '雾光颜色' })
    skyFolder.addBinding(sceneState, 'domeGlowStrength', {
        label: '雾光强度',
        min: 0,
        max: 1.5,
        step: 0.01,
    })
    skyFolder.addBinding(sceneState, 'domeSpeed', {
        label: '雾流速度',
        min: 0,
        max: 1,
        step: 0.01,
    })

    const brainFolder = paneControl.addFolder({ title: '脑体材质', expanded: true })
    brainFolder.addBinding(brainState, 'visible', { label: '显示脑体' })
    brainFolder.addBinding(brainState, 'baseColor', { label: '基底颜色' })
    brainFolder.addBinding(brainState, 'fresnelColor', { label: '边缘光' })
    brainFolder.addBinding(brainState, 'electricColor', { label: '电流颜色' })
    brainFolder.addBinding(brainState, 'fresnelPower', {
        label: '边缘宽度',
        min: 0.5,
        max: 6,
        step: 0.05,
    })
    brainFolder.addBinding(brainState, 'electricIntensity', {
        label: '电流强度',
        min: 0,
        max: 6,
        step: 0.05,
    })
    brainFolder.addBinding(brainState, 'electricSpeed', {
        label: '电流速度',
        min: 0,
        max: 4,
        step: 0.05,
    })
    brainFolder.addBinding(brainState, 'electricFrequency', {
        label: '电流频率',
        min: 1,
        max: 16,
        step: 0.1,
    })
    brainFolder.addBinding(brainState, 'roughness', {
        label: '粗糙度',
        min: 0,
        max: 1,
        step: 0.01,
    })

    const grooveFolder = paneControl.addFolder({ title: '沟壑粒子', expanded: true })
    grooveFolder.addBinding(grooveState, 'visible', { label: '显示粒子' })
    grooveFolder.addBinding(grooveState, 'count', {
        label: '密度',
        min: 200,
        max: 5000,
        step: 50,
    })
    grooveFolder.addBinding(grooveState, 'size', {
        label: '粒径',
        min: 1,
        max: 40,
        step: 1,
    })
    grooveFolder.addBinding(grooveState, 'speed', {
        label: '脉冲速度',
        min: 0,
        max: 4,
        step: 0.05,
    })
    grooveFolder.addBinding(grooveState, 'outset', {
        label: '外扩距离',
        min: 0,
        max: 0.02,
        step: 0.0005,
    })
    grooveFolder.addBinding(grooveState, 'spread', {
        label: '横向扩散',
        min: 0,
        max: 0.02,
        step: 0.0005,
    })
    grooveFolder.addBinding(grooveState, 'threshold', {
        label: '采样阈值',
        min: 0.2,
        max: 0.9,
        step: 0.01,
    })
    grooveFolder.addBinding(grooveState, 'color1', { label: '颜色 A' })
    grooveFolder.addBinding(grooveState, 'color2', { label: '颜色 B' })

    const threadFolder = paneControl.addFolder({ title: '神经丝线', expanded: true })
    threadFolder.addBinding(threadState, 'visible', { label: '显示丝线' })
    threadFolder.addBinding(threadState, 'color', { label: '丝线颜色' })
    threadFolder.addBinding(threadState, 'opacity', {
        label: '丝线透明',
        min: 0,
        max: 1,
        step: 0.01,
    })
    threadFolder.addBinding(threadState, 'clusterCount', {
        label: '簇数量',
        min: 0,
        max: 30,
        step: 1,
    })
    threadFolder.addBinding(threadState, 'threadsPerCluster', {
        label: '每簇丝线',
        min: 1,
        max: 12,
        step: 1,
    })
    threadFolder.addBinding(threadState, 'waveAmplitude', {
        label: '摆动幅度',
        min: 0,
        max: 0.2,
        step: 0.001,
    })
    threadFolder.addBinding(threadState, 'animationSpeed', {
        label: '摆动速度',
        min: 0,
        max: 4,
        step: 0.05,
    })
    threadFolder.addBinding(threadState, 'mouseRepulsionRadius', {
        label: '鼠标范围',
        min: 0.1,
        max: 1,
        step: 0.01,
    })
    threadFolder.addBinding(threadState, 'mouseRepulsionStrength', {
        label: '鼠标推力',
        min: 0,
        max: 0.3,
        step: 0.005,
    })
    threadFolder.addBinding(threadState, 'mouseGlowEnabled', { label: '鼠标高亮' })

    const threadParticleFolder = paneControl.addFolder({ title: '流动粒子', expanded: true })
    threadParticleFolder.addBinding(threadState, 'particlesVisible', { label: '显示粒子' })
    threadParticleFolder.addBinding(threadState, 'particlesPerThread', {
        label: '每线数量',
        min: 0,
        max: 8,
        step: 1,
    })
    threadParticleFolder.addBinding(threadState, 'particleSpeed', {
        label: '流速',
        min: 0,
        max: 2,
        step: 0.01,
    })
    threadParticleFolder.addBinding(threadState, 'particleSize', {
        label: '粒径',
        min: 1,
        max: 40,
        step: 1,
    })
    threadParticleFolder.addBinding(threadState, 'particleColor1', { label: '起点颜色' })
    threadParticleFolder.addBinding(threadState, 'particleColor2', { label: '终点颜色' })

    const sparkleFolder = paneControl.addFolder({ title: '空间星屑', expanded: false })
    sparkleFolder.addBinding(sparkleState, 'visible', { label: '显示星屑' })
    sparkleFolder.addBinding(sparkleState, 'count', {
        label: '数量',
        min: 200,
        max: 4000,
        step: 50,
    })
    sparkleFolder.addBinding(sparkleState, 'size', {
        label: '尺寸',
        min: 0.1,
        max: 4,
        step: 0.1,
    })
    sparkleFolder.addBinding(sparkleState, 'brightness', {
        label: '亮度',
        min: 0.5,
        max: 6,
        step: 0.1,
    })
    sparkleFolder.addBinding(sparkleState, 'minRadius', {
        label: '最小半径',
        min: 0.5,
        max: 4,
        step: 0.1,
    })
    sparkleFolder.addBinding(sparkleState, 'maxRadius', {
        label: '最大半径',
        min: 1,
        max: 6,
        step: 0.1,
    })
    sparkleFolder.addBinding(sparkleState, 'color1', { label: '颜色 A' })
    sparkleFolder.addBinding(sparkleState, 'color2', { label: '颜色 B' })
    const postFolder = paneControl.addFolder({ title: 'Post Effects', expanded: false })
    postFolder.addBinding(sceneState, 'dofEnabled', { label: 'Depth Of Field' })
    postFolder.addBinding(sceneState, 'dofFocusDistance', {
        label: 'Focus Distance',
        min: 0.5,
        max: 4,
        step: 0.01,
    })
    postFolder.addBinding(sceneState, 'dofFocusRange', {
        label: 'Aperture',
        min: 0.1,
        max: 1.2,
        step: 0.01,
    })
    postFolder.addBinding(sceneState, 'dofBokehScale', {
        label: 'Max Blur',
        min: 0,
        max: 4,
        step: 0.01,
    })
    postFolder.addBinding(sceneState, 'dofResolutionScale', {
        label: 'DOF Resolution',
        min: 0.25,
        max: 1,
        step: 0.05,
    })
})

onUnmounted(() => {
    paneControl?.dispose()
    paneControl = null
    paneStyleElement?.remove()
    paneStyleElement = null
})
</script>

<style scoped>
.brain-storm-page {
    position: relative;
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background:
        radial-gradient(circle at 18% 18%, rgba(124, 58, 237, 0.22), transparent 28%),
        radial-gradient(circle at 82% 24%, rgba(251, 146, 60, 0.16), transparent 24%),
        linear-gradient(180deg, #0b1020 0%, #02030a 100%);
}
</style>
