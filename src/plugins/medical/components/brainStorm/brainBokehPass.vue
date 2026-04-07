<template></template>

<script setup lang="ts">
import { onUnmounted, watch, watchEffect } from 'vue'
import * as THREE from 'three'
import { useTres, useTresContext } from '@tresjs/core'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

interface Props {
    enabled?: boolean
    bloomEnabled?: boolean
    bloomStrength?: number
    bloomThreshold?: number
    bloomRadius?: number
    dofEnabled?: boolean
    focus?: number
    aperture?: number
    maxblur?: number
    resolutionScale?: number
}

const props = withDefaults(defineProps<Props>(), {
    enabled: true,
    bloomEnabled: true,
    bloomStrength: 0.18,
    bloomThreshold: 0.62,
    bloomRadius: 0.24,
    dofEnabled: true,
    focus: 1.8,
    aperture: 0.0283,
    maxblur: 0.02,
    resolutionScale: 1,
})

class StableBokehPass extends BokehPass {
    private hiddenObjects: THREE.Object3D[] = []
    private baseWidth = 1
    private baseHeight = 1
    private depthResolutionScale = 1

    setResolutionScale(scale: number) {
        this.depthResolutionScale = THREE.MathUtils.clamp(scale, 0.75, 1)
        this.applyScaledSize()
    }

    override setSize(width: number, height: number) {
        this.baseWidth = width
        this.baseHeight = height
        this.applyScaledSize()
    }

    override render(
        renderer: THREE.WebGLRenderer,
        writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget,
    ) {
        this.hiddenObjects.length = 0

        this.scene.traverse((object) => {
            if (!object.visible || !this.shouldSkipDepthPrepass(object)) {
                return
            }

            this.hiddenObjects.push(object)
            object.visible = false
        })

        try {
            super.render(renderer, writeBuffer, readBuffer)
        } finally {
            this.hiddenObjects.forEach((object) => {
                object.visible = true
            })
            this.hiddenObjects.length = 0
        }
    }

    private applyScaledSize() {
        const scaledWidth = Math.max(1, Math.floor(this.baseWidth * this.depthResolutionScale))
        const scaledHeight = Math.max(1, Math.floor(this.baseHeight * this.depthResolutionScale))
        super.setSize(scaledWidth, scaledHeight)
    }

    private shouldSkipDepthPrepass(object: THREE.Object3D) {
        const renderableObject = object as THREE.Object3D & {
            isPoints?: boolean
            material?: THREE.Material | THREE.Material[]
        }

        if (renderableObject.isPoints || object.renderOrder !== 0) {
            return true
        }

        if (!renderableObject.material) {
            return false
        }

        const materials = Array.isArray(renderableObject.material)
            ? renderableObject.material
            : [renderableObject.material]

        return materials.some((material) => (
            material.transparent
            || material.blending !== THREE.NormalBlending
            || material.side === THREE.BackSide
        ))
    }
}

const { scene, camera, renderer, sizes } = useTres()
const { renderer: rendererManager } = useTresContext()

let composer: EffectComposer | null = null
let renderPass: RenderPass | null = null
let bloomPass: UnrealBloomPass | null = null
let bokehPass: StableBokehPass | null = null
let outputPass: OutputPass | null = null

const renderSceneNormally = (notifyFrameRendered: () => void) => {
    if (!scene.value || !camera.value) {
        return
    }

    renderer.render(scene.value, camera.value as THREE.Camera)
    notifyFrameRendered()
}

const applyComposerState = () => {
    if (!composer || !bloomPass || !bokehPass) {
        return
    }

    bloomPass.enabled = props.enabled && props.bloomEnabled
    bloomPass.strength = props.bloomStrength
    bloomPass.threshold = props.bloomThreshold
    bloomPass.radius = props.bloomRadius

    bokehPass.enabled = props.enabled && props.dofEnabled
    bokehPass.uniforms.focus.value = props.focus
    bokehPass.uniforms.aperture.value = props.aperture
    bokehPass.uniforms.maxblur.value = props.maxblur
    bokehPass.setResolutionScale(props.resolutionScale)
}

const attachRenderFunction = () => {
    rendererManager.replaceRenderFunction((notifyFrameRendered) => {
        if (!props.enabled || !composer) {
            renderSceneNormally(notifyFrameRendered)
            return
        }

        composer.render()
        notifyFrameRendered()
    })
}

const disposeComposer = () => {
    bloomPass?.dispose()
    bokehPass?.dispose()
    outputPass?.dispose()
    composer?.dispose()
    composer = null
    renderPass = null
    bloomPass = null
    bokehPass = null
    outputPass = null
}

const buildComposer = () => {
    if (!scene.value || !camera.value || !sizes.width.value || !sizes.height.value) {
        return
    }

    disposeComposer()

    composer = new EffectComposer(renderer)
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(sizes.width.value, sizes.height.value)

    renderPass = new RenderPass(scene.value, camera.value as THREE.Camera)
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(sizes.width.value, sizes.height.value),
        props.bloomStrength,
        props.bloomRadius,
        props.bloomThreshold,
    )
    bokehPass = new StableBokehPass(scene.value, camera.value as THREE.PerspectiveCamera, {
        focus: props.focus,
        aperture: props.aperture,
        maxblur: props.maxblur,
    })
    outputPass = new OutputPass()

    composer.addPass(renderPass)
    composer.addPass(bloomPass)
    composer.addPass(bokehPass)
    composer.addPass(outputPass)

    applyComposerState()
    attachRenderFunction()
}

watch(
    () => [scene.value, camera.value],
    () => {
        buildComposer()
    },
    { immediate: true },
)

watch(
    () => [sizes.width.value, sizes.height.value],
    ([width, height]) => {
        if (!width || !height) {
            return
        }

        if (!composer) {
            buildComposer()
            return
        }

        composer.setSize(width, height)
        composer.setPixelRatio(renderer.getPixelRatio())
        applyComposerState()
    },
    { immediate: true },
)

watchEffect(() => {
    applyComposerState()
    attachRenderFunction()
})

onUnmounted(() => {
    disposeComposer()
    rendererManager.replaceRenderFunction(renderSceneNormally)
})
</script>
