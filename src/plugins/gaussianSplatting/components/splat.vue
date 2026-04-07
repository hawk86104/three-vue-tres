<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-06-16 08:31:57
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-07 11:51:12
-->
<template>
    <primitive :object="toRaw(modelSplat)" :renderOrder="9999999" />
</template>

<script setup lang="ts">
import { watch, onUnmounted, ref, toRaw } from 'vue'
import { useTres } from '@tresjs/core'
import { Splat, SplatLoader } from '@pmndrs/vanilla'

const props = defineProps({
    url: {
        type: String,
        default: './plugins/gaussianSplatting/model/luigi.splat',
    },
    sizeCullThreshold: {
        type: Number,
        default: -0.0001,
    },
})

const { camera, renderer } = useTres() as any

const loader = new SplatLoader(renderer, 10000)

let oneSplat = await loader.loadAsync(props.url)

const modelSplat = ref(null) as any

const createSplat = (sizeCullThreshold = props.sizeCullThreshold) => {
    return new Splat(oneSplat, camera.value, { alphaTest: 0.1, sizeCullThreshold })
}

modelSplat.value = createSplat()
watch(
    [() => props.url, () => props.sizeCullThreshold],
    async ([url, sizeCullThreshold], [oldUrl]) => {
        if (url && url !== oldUrl) {
            oneSplat = await loader.loadAsync(url)
        }
        disposeThis()
        modelSplat.value = createSplat(sizeCullThreshold)
    },
)

const disposeThis = () => {
    if (modelSplat.value) {
        modelSplat.value.geometry.dispose()
        if (modelSplat.value.material) {
            ; (modelSplat.value.material as any).dispose()
        }
    }
}
onUnmounted(() => {
    disposeThis()
})
</script>
