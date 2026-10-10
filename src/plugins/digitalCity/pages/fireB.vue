<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-02-06 17:50:33
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-01-27 09:30:32
-->

<template>
	<pagesShow>
		<template v-slot:ability>
			<fireB :position="[-130, 26, 20]" v-bind="fireConfig" />
		</template>
	</pagesShow>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount } from 'vue'
import pagesShow from '../components/pagesShow.vue'
import { fireB } from 'PLS/digitalCity'
import { Pane } from 'tweakpane'

const fireConfig = reactive({
	color: '#ff0000',
	particleCount: 150,
})
const paneControl = new Pane()
onBeforeUnmount(() => paneControl.dispose())
paneControl.addBinding(fireConfig, 'color', {
    label: 'firecolor',
})
paneControl.addBinding(fireConfig, 'particleCount', {
		label: 'particleCount',
		min: 10,
		max: 500,
		step: 10,
})
</script>
