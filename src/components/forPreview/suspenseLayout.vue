<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-10-21 17:24:44
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-08-06 09:24:58
-->
<template>
    <Suspense>
        <router-view v-slot="{ Component, route }">
            <div :key="route.path" class="preview-scene">
                <component :is="Component" />
            </div>
        </router-view>
    </Suspense>
    <showSrcBtn v-if="!config?.preview?.disableSrcBtn" :parts="parts" />
    <referenceSource :referenceSourceConfig="referenceSourceConfig" />
    <FPSGraph v-if="!config?.preview?.disableFPSGraph" />
    <miniBts v-if="detectDeviceType() === 'Mobile'" />
</template>
<script setup lang="ts">
import { getOnePluginConfig, detectDeviceType } from '../../common/utils'
import showSrcBtn from './showSrcBtn.vue'
import referenceSource from './referenceSource.vue'
import FPSGraph from './FPSGraph.vue'
import miniBts from './miniBts.vue'

declare global {
  interface Window {
    tvtPluginConfig?: any
  }
}

const originalUrl = window.location.href.split('?')[0]
const hashPart = originalUrl.split('#')[1] || ''
const parts = hashPart.split('/')
let config = null
if (parts[2] === 'basic') {
    config = getOnePluginConfig(parts[2], parts[3], parts[4])
} else {
    config = getOnePluginConfig(parts[2], parts[3])
}

console.log('插件配置:', config)
window.tvtPluginConfig = config

const referenceSourceConfig = config?.preview?.referenceSource
</script>
<style scoped>
.preview-scene {
    height: 100%;
    position: relative;
}
</style>
