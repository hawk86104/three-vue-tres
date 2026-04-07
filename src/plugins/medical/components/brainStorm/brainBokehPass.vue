<template></template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import * as THREE from 'three'
import { useTres } from '@tresjs/core'
import { useEffect } from '@tresjs/post-processing'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'

interface Props {
    enabled?: boolean
    focus?: number
    aperture?: number
    maxblur?: number
    resolutionScale?: number
}

const props = withDefaults(defineProps<Props>(), {
    enabled: true,
    focus: 1.8,
    aperture: 0.0283,
    maxblur: 0.02,
    resolutionScale: 0.5,
})

class StableBokehPass extends BokehPass {
    private hiddenPoints: Array<THREE.Object3D & { isPoints?: boolean }> = []
    private baseWidth = 1
    private baseHeight = 1
    private depthResolutionScale = 1

    setResolutionScale(scale: number) {
        this.depthResolutionScale = THREE.MathUtils.clamp(scale, 0.25, 1)
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
        this.hiddenPoints.length = 0

        this.scene.traverse((object) => {
            const renderableObject = object as THREE.Object3D & { isPoints?: boolean }
            if (renderableObject.visible && renderableObject.isPoints) {
                this.hiddenPoints.push(renderableObject)
                renderableObject.visible = false
            }
        })

        try {
            super.render(renderer, writeBuffer, readBuffer)
        } finally {
            this.hiddenPoints.forEach((object) => {
                object.visible = true
            })
            this.hiddenPoints.length = 0
        }
    }

    private applyScaledSize() {
        const scaledWidth = Math.max(1, Math.floor(this.baseWidth * this.depthResolutionScale))
        const scaledHeight = Math.max(1, Math.floor(this.baseHeight * this.depthResolutionScale))
        super.setSize(scaledWidth, scaledHeight)
    }
}

const { scene, camera } = useTres()

const { pass } = useEffect(
    () => new StableBokehPass(scene.value!, camera.value as THREE.PerspectiveCamera, {
        focus: props.focus,
        aperture: props.aperture,
        maxblur: props.maxblur,
    }),
    props,
)

watchEffect(() => {
    const currentPass = pass.value
    if (!currentPass) {
        return
    }

    currentPass.enabled = props.enabled
    currentPass.uniforms.focus.value = props.focus
    currentPass.uniforms.aperture.value = props.aperture
    currentPass.uniforms.maxblur.value = props.maxblur
    currentPass.setResolutionScale(props.resolutionScale)
})
</script>
