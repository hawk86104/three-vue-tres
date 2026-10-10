<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-09-13 15:20:02
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-10-14 09:38:43
-->
<template>
    <TresGroup :scale="viewTransform.scale">
        <TresGroup v-if="!isLoading" :position="viewTransform.position">
            <TresMesh v-for="(layer, index) in visibleLayers" :key="`layer-${index}`" :geometry="layer.geometry"
                :render-order="index">
                <TresMeshBasicMaterial v-bind="layer.material" />
            </TresMesh>
        </TresGroup>
    </TresGroup>
</template>
<script setup lang="ts">
import { onUnmounted, computed, watch, ref } from 'vue'
import { useSVG } from '@tresjs/cientos'
import { Box3, Vector3 } from 'three'

const props = defineProps({
    src: {
        default: './plugins/geokit/case-real-3/icons/satellite.svg',
    },
    skipStrokes: {
        default: false,
    },
    skipFills: {
        default: false,
    },
    fitView: {
        type: Boolean,
        default: false,
    },
})

const layers = ref([]) as any
const isLoading = ref(true)
let dispose = ref(() => { }) as any

const viewTransform = computed(() => {
    if (!props.fitView || !layers.value.length) return { scale: 1, position: [0, 0, 0] }
    const bounds = new Box3()
    for (const layer of layers.value) {
        layer.geometry.computeBoundingBox()
        bounds.union(layer.geometry.boundingBox)
    }
    if (bounds.isEmpty()) return { scale: 1, position: [0, 0, 0] }
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    return { scale: 2 / (Math.max(size.x, size.y, size.z) || 1), position: center.negate().toArray() }
})

const visibleLayers = computed(() => {
    return layers.value.filter((layer: any) => {
        if (layer.isStroke && !props.skipStrokes) return true
        if (!layer.isStroke && !props.skipFills) return true
        return false
    })
})

watch(() => props.src, (src) => {
    dispose.value()
    const newSvg = useSVG(src)
    isLoading.value = true
    watch(() => newSvg.isLoading.value, (il) => {
        if (!il) {
            layers.value = newSvg.layers.value
            isLoading.value = newSvg.isLoading.value
            dispose.value = newSvg.dispose
        }
    })
}, { immediate: true })

onUnmounted(() => {
    dispose.value()
})
</script>
