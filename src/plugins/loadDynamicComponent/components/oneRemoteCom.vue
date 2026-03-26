<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-29 10:19:47
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-30 11:31:16
-->
<template>
	<component v-if="moduleWraped" ref="componentRef" :is="moduleWraped" v-bind="attrsData"></component>
</template>

<script setup lang="ts">
import { shallowRef, onBeforeUnmount } from 'vue'
import { remoteRegistry } from '../common/RemoteRegistry'
import { type ConfigPaneActionContext, createConfigPane } from '../common/createConfigPane'

const props = defineProps<{
	remoteName: string,
	comName: string,
	attrsData: any,
	config: any
}>()

const moduleWraped = shallowRef(null)
const componentRef = shallowRef<any>(null)

const ri = remoteRegistry.getRemote(props.remoteName)
if (ri) {
	moduleWraped.value = await ri.loadComponentModule(`./${props.comName}`)
}

const getComponentApi = () => {
	const instance = componentRef.value as any
	return instance?.$?.exposed ?? instance
}

let pane: any

const patchAttrsData = (result: unknown) => {
	if (!result || typeof result !== 'object') {
		return
	}

	Object.entries(result as Record<string, unknown>).forEach(([key, value]) => {
		if (Object.prototype.hasOwnProperty.call(props.attrsData, key)) {
			props.attrsData[key] = value
		}
	})

	pane?.refresh?.()
}

const handleConfigAction = async ({ actionId }: ConfigPaneActionContext) => {
	const action = getComponentApi()?.[actionId]

	if (typeof action !== 'function') {
		console.warn(`Action "${actionId}" is not exposed by the current remote component.`)
		return
	}

	patchAttrsData(await action())
}

pane = createConfigPane(
	document.getElementById('pane'),
	props.config,
	props.attrsData,
	{
		onAction: handleConfigAction,
	},
)

onBeforeUnmount(() => {
  if (pane) {
    pane.dispose()
  }
})
</script>
