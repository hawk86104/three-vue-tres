<!--
 * @Description: https://css-loaders.com/
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-03-12 21:53:22
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2024-08-12 11:10:25
-->
<template>
    <div v-if="!displayFinished" class="absolute bg-grey-600 t-0 l-0 w-full h-full z-99999999 flex justify-center items-center text-black font-mono bg-black">
        <div class="text-center text-white">
            <div class="loader1" v-if="props.styleNum === 0"></div>
            <div class="loader2" v-else-if="props.styleNum === 1"></div>
            <div class="loader3" v-else-if="props.styleNum === 2"></div>
            <div class="loader4" v-else-if="props.styleNum === 3"></div>
            <div class="loader5" v-else-if="props.styleNum === 4"></div>
            <div class="loader6" v-else-if="props.styleNum === 5"></div>
            <div class="loader7" v-else-if="props.styleNum === 6"></div>

            <template v-if="showProgress">{{ displayProgress }} %</template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { hasPlugin } from '@/common/utils'
import { useProgress } from '@tresjs/cientos'
import { Resource } from 'PLS/resourceManager'
import { computed } from 'vue'

const props = withDefaults(
    defineProps<{
        styleNum?: number
        isDemo?: boolean
        showProgress?: boolean
        useResourceManager?: boolean
        progressValue?: number
        finished?: boolean
    }>(),
    {
        styleNum: 0,
        isDemo: false,
        showProgress: true,
        useResourceManager: false,
    },
)

let progress = null as any
let hasFinishLoading = null as any

if (props.useResourceManager) {
    if (hasPlugin('resourceManager', '资源管理器插件')) {
        // const modules = import.meta.glob('/src/plugins/resourceManager/index.js')
        // const { Resource } = await modules['/src/plugins/resourceManager/index.js']()
        progress = Resource.progress
        hasFinishLoading = Resource.hasAllFinished
    }
} else {
    const uP = await useProgress()
    progress = uP.progress
    hasFinishLoading = uP.hasFinishLoading
}

const usesControlledProgress = computed(() => props.progressValue !== undefined || props.finished !== undefined)
const displayProgress = computed(() => usesControlledProgress.value ? Math.round(props.progressValue ?? 0) : progress.value)
const displayFinished = computed(() => usesControlledProgress.value ? (props.finished ?? false) : hasFinishLoading.value)

const animloop = () => {
    if (progress.value++ > 100) {
        progress.value = 0
    }
    requestAnimationFrame(animloop)
}
if (props.isDemo) {
    requestAnimationFrame(animloop)
}

defineExpose({
    hasFinishLoading: hasFinishLoading,
})
</script>
<style lang="less" scoped>
@import './cssLoaders.less';
</style>
